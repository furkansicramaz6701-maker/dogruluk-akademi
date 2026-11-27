import {
  GradeLevelId,
  GradeProfile,
  PenaltyDivisor,
  PersistedExamRecord,
  StudentRecord,
} from '../types/academy';
import { parseAnswerString } from './examAnalysis';
import { calculateNetAndScore } from './weeklyAnalysis';

export type ProgressionScopeMode = 'both' | 'institution' | 'turkey';

export interface NetProgressionPoint {
  id: string;
  examName: string;
  shortLabel: string;
  date: string;
  totalQuestions: number;
  institutionAvgNet: number;
  turkeyAvgNet: number;
  activeStudentNet?: number;
  institutionDelta: number;
  turkeyDelta: number;
  vsTurkeyDiff: number;
  participantCount: number;
  isLivePoint: boolean;
}

export interface NetProgressionSummary {
  latestInstitutionNet: number;
  latestTurkeyNet: number;
  institutionGrowth: number;
  turkeyGrowth: number;
  institutionVsTurkeyDiff: number;
  maxQuestions: number;
  evaluatedStudentCount: number;
}

export interface NetProgressionDataset {
  points: NetProgressionPoint[];
  summary: NetProgressionSummary;
}

interface ExamBenchmarkTemplate {
  suffix: string;
  shortPrefix: string;
  date: string;
  turkeyRatio: number;
  institutionOffsetRatio: number;
  participants: number;
}

const EXAM_TEMPLATES: ExamBenchmarkTemplate[] = [
  { suffix: '1. Tarama Denemesi', shortPrefix: 'Deneme 1', date: '18.09.2026', turkeyRatio: 0.48, institutionOffsetRatio: 0.035, participants: 18420 },
  { suffix: '2. Süreç İzleme', shortPrefix: 'Deneme 2', date: '09.10.2026', turkeyRatio: 0.505, institutionOffsetRatio: 0.042, participants: 21650 },
  { suffix: '3. KTS Değerlendirme', shortPrefix: 'Deneme 3', date: '30.10.2026', turkeyRatio: 0.525, institutionOffsetRatio: 0.052, participants: 24180 },
  { suffix: '4. Ara Dönem Genel', shortPrefix: 'Deneme 4', date: '14.11.2026', turkeyRatio: 0.548, institutionOffsetRatio: 0.06, participants: 27890 },
  { suffix: '5. Türkiye Geneli', shortPrefix: 'Deneme 5', date: '28.11.2026', turkeyRatio: 0.565, institutionOffsetRatio: 0.068, participants: 32410 },
];

function getCategoryDifficultyFactor(gradeProfile: GradeProfile): number {
  switch (gradeProfile.category) {
    case 'İlkokul':
      return 1.12;
    case 'Ortaokul & LGS':
      return gradeProfile.id === '8' ? 0.94 : 1.02;
    case 'Lise':
      return 0.88;
    case 'Üniversite Hazırlık (YKS)':
      return gradeProfile.id === 'TYT' ? 0.82 : 0.76;
  }
}

function getPenaltyRatioAdjustment(penaltyDivisor: PenaltyDivisor): number {
  if (penaltyDivisor === 0) return 0.075;
  if (penaltyDivisor === 3) return -0.012;
  return 0;
}

function computeSeedOffset(code8: string, gradeId: GradeLevelId): number {
  const seedStr = `${code8}:${gradeId}`;
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h * 31 + seedStr.charCodeAt(i)) % 997;
  }
  return ((h % 19) - 9) * 0.0025;
}

function formatGradeExamName(gradeProfile: GradeProfile, suffix: string): string {
  if (gradeProfile.category === 'Üniversite Hazırlık (YKS)') {
    return `${gradeProfile.shortLabel} ${suffix}`;
  }
  return `${gradeProfile.shortLabel} · ${suffix}`;
}

export function buildGradeNetProgression(input: {
  gradeProfile: GradeProfile;
  questionCount: number;
  penaltyDivisor: PenaltyDivisor;
  institutionId: string;
  institutionCode8: string;
  students: StudentRecord[];
  includeTurkeyBenchmark?: boolean;
  isSamplePreview?: boolean;
  examHistory?: PersistedExamRecord[];
  liveAnalysis?: {
    hasLiveAnalysis: boolean;
    studentName: string;
    totalNet: number;
    examTitle: string;
  };
}): NetProgressionDataset {
  const includeTurkey = input.includeTurkeyBenchmark ?? true;
  const profileTotal = input.gradeProfile.subjects.reduce(
    (sum, s) => sum + s.questionCount,
    0
  );
  const maxQuestions = Math.max(10, input.questionCount || profileTotal || 50);
  const categoryFactor = getCategoryDifficultyFactor(input.gradeProfile);
  const penaltyAdj = getPenaltyRatioAdjustment(input.penaltyDivisor);
  const instSeed = computeSeedOffset(input.institutionCode8, input.gradeProfile.id);

  // When explicit examHistory is supplied in live institution mode (and not sample preview),
  // strictly derive progression ONLY from genuine persisted institution exam records.
  if (input.examHistory !== undefined && !input.isSamplePreview) {
    const instRecords = input.examHistory.filter(
      (r) => r.institutionId === input.institutionId && r.gradeId === input.gradeProfile.id
    );
    const activeRecords =
      instRecords.length > 0
        ? instRecords
        : input.examHistory.filter((r) => r.institutionId === input.institutionId);

    if (activeRecords.length === 0 && !input.liveAnalysis?.hasLiveAnalysis) {
      return {
        points: [],
        summary: {
          latestInstitutionNet: 0,
          latestTurkeyNet: 0,
          institutionGrowth: 0,
          turkeyGrowth: 0,
          institutionVsTurkeyDiff: 0,
          maxQuestions,
          evaluatedStudentCount: 0,
        },
      };
    }

    // Group chronological records by examTitle + examDate so multiple students in the same exam form a cohort avg
    const grouped = new Map<
      string,
      {
        examName: string;
        date: string;
        totalQuestions: number;
        nets: number[];
        students: Set<string>;
        latestCreatedAt: string;
      }
    >();
    const ordered = [...activeRecords].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    ordered.forEach((rec) => {
      const key = `${rec.examTitle}::${rec.examDate}`;
      const existing = grouped.get(key) ?? {
        examName: rec.examTitle,
        date: rec.examDate,
        totalQuestions: rec.totalQuestions,
        nets: [] as number[],
        students: new Set<string>(),
        latestCreatedAt: rec.createdAt,
      };
      existing.nets.push(rec.totalNet);
      existing.students.add(rec.studentId);
      existing.totalQuestions = Math.max(existing.totalQuestions, rec.totalQuestions);
      grouped.set(key, existing);
    });

    const sessions = Array.from(grouped.values()).slice(-6);
    if (sessions.length === 0 && input.liveAnalysis?.hasLiveAnalysis) {
      sessions.push({
        examName: input.liveAnalysis.examTitle || 'İlk Deneme Kaydı',
        date: new Date().toLocaleDateString('tr-TR'),
        totalQuestions: maxQuestions,
        nets: [input.liveAnalysis.totalNet],
        students: new Set([input.liveAnalysis.studentName || 'active']),
        latestCreatedAt: new Date().toISOString(),
      });
    }

    const rawLivePoints = sessions.map((s, idx) => {
      const instAvg = Number(
        (s.nets.reduce((acc, n) => acc + n, 0) / Math.max(1, s.nets.length)).toFixed(2)
      );
      const qCount = Math.max(1, s.totalQuestions || maxQuestions);
      const turkeyAvg = includeTurkey
        ? Number((qCount * Math.min(0.85, Math.max(0.28, 0.5 * categoryFactor + penaltyAdj * 0.85))).toFixed(2))
        : 0;
      const isLast = idx === sessions.length - 1;
      const activeStudentNet =
        isLast && input.liveAnalysis?.hasLiveAnalysis
          ? Number(input.liveAnalysis.totalNet.toFixed(2))
          : undefined;

      return {
        id: `live-prog-${input.gradeProfile.id}-${idx + 1}`,
        examName: s.examName,
        shortLabel: sessions.length === 1 ? '1. İlk Deneme' : `${idx + 1}. Deneme`,
        date: s.date,
        totalQuestions: qCount,
        institutionAvgNet: instAvg,
        turkeyAvgNet: turkeyAvg,
        activeStudentNet,
        participantCount: s.students.size,
        isLivePoint: true,
      };
    });

    const livePoints: NetProgressionPoint[] = rawLivePoints.map((pt, idx) => {
      const prev = idx > 0 ? rawLivePoints[idx - 1] : pt;
      return {
        ...pt,
        institutionDelta:
          idx === 0 ? 0 : Number((pt.institutionAvgNet - prev.institutionAvgNet).toFixed(2)),
        turkeyDelta:
          idx === 0 || !includeTurkey
            ? 0
            : Number((pt.turkeyAvgNet - prev.turkeyAvgNet).toFixed(2)),
        vsTurkeyDiff: includeTurkey
          ? Number((pt.institutionAvgNet - pt.turkeyAvgNet).toFixed(2))
          : 0,
      };
    });

    const firstPt = livePoints[0];
    const lastPt = livePoints[livePoints.length - 1];
    const evaluatedStudentCount = new Set(activeRecords.map((r) => r.studentId)).size;

    return {
      points: livePoints,
      summary: {
        latestInstitutionNet: lastPt?.institutionAvgNet ?? 0,
        latestTurkeyNet: includeTurkey ? lastPt?.turkeyAvgNet ?? 0 : 0,
        institutionGrowth:
          livePoints.length > 1
            ? Number((lastPt.institutionAvgNet - firstPt.institutionAvgNet).toFixed(2))
            : 0,
        turkeyGrowth:
          livePoints.length > 1 && includeTurkey
            ? Number((lastPt.turkeyAvgNet - firstPt.turkeyAvgNet).toFixed(2))
            : 0,
        institutionVsTurkeyDiff:
          includeTurkey && lastPt
            ? Number((lastPt.institutionAvgNet - lastPt.turkeyAvgNet).toFixed(2))
            : 0,
        maxQuestions: lastPt?.totalQuestions || maxQuestions,
        evaluatedStudentCount: Math.max(
          evaluatedStudentCount,
          input.liveAnalysis?.hasLiveAnalysis ? 1 : 0
        ),
      },
    };
  }

  const gradeEvaluatedStudents = input.students.filter(
    (stu) =>
      stu.institutionId === input.institutionId &&
      stu.gradeId === input.gradeProfile.id &&
      Boolean(stu.lastOmrAnswers && stu.lastOmrAnswers.trim().length > 0)
  );

  let measuredInstAvgNet: number | null = null;
  if (gradeEvaluatedStudents.length > 0) {
    const nets = gradeEvaluatedStudents.map((stu) => {
      const stuAns = parseAnswerString(stu.lastOmrAnswers || '', maxQuestions);
      const keyAns = parseAnswerString(stu.lastAnswerKey || '', maxQuestions);
      let correct = 0;
      let wrong = 0;
      for (let i = 0; i < maxQuestions; i++) {
        const s = stuAns[i];
        const k = keyAns[i];
        if (!s) continue;
        if (k && s === k) correct++;
        else if (k) wrong++;
      }
      return calculateNetAndScore(
        correct,
        wrong,
        maxQuestions,
        input.gradeProfile,
        input.penaltyDivisor
      ).net;
    });
    measuredInstAvgNet = Number(
      (nets.reduce((acc, n) => acc + n, 0) / nets.length).toFixed(2)
    );
  }

  const hasMeasuredInstitutionData =
    Boolean(input.isSamplePreview) ||
    gradeEvaluatedStudents.length > 0 ||
    Boolean(input.liveAnalysis?.hasLiveAnalysis && input.liveAnalysis.studentName.trim().length > 0);

  const rawPoints = EXAM_TEMPLATES.map((tpl, idx) => {
    const turkeyRatio = Math.min(
      0.88,
      Math.max(0.24, tpl.turkeyRatio * categoryFactor + penaltyAdj * 0.85)
    );
    const instRatio = Math.min(
      0.94,
      Math.max(
        0.26,
        turkeyRatio + tpl.institutionOffsetRatio + instSeed + penaltyAdj * 0.2
      )
    );

    const turkeyAvgNet = includeTurkey ? Number((maxQuestions * turkeyRatio).toFixed(2)) : 0;
    const isLastBasePoint = idx === EXAM_TEMPLATES.length - 1;
    let institutionAvgNet = hasMeasuredInstitutionData
      ? Number((maxQuestions * instRatio).toFixed(2))
      : 0;

    if (isLastBasePoint && measuredInstAvgNet !== null) {
      institutionAvgNet = measuredInstAvgNet;
    }

    const activeStudentNet =
      isLastBasePoint &&
      input.liveAnalysis?.hasLiveAnalysis &&
      input.liveAnalysis.studentName.trim().length > 0
        ? Number(input.liveAnalysis.totalNet.toFixed(2))
        : undefined;

    if (isLastBasePoint && measuredInstAvgNet === null && activeStudentNet !== undefined) {
      institutionAvgNet = activeStudentNet;
    }

    return {
      id: `prog-${input.gradeProfile.id}-${idx + 1}`,
      examName: includeTurkey
        ? formatGradeExamName(input.gradeProfile, tpl.suffix)
        : formatGradeExamName(
            input.gradeProfile,
            tpl.suffix.replace('Türkiye Geneli', 'Kurumsal Genel')
          ),
      shortLabel: tpl.shortPrefix,
      date: tpl.date,
      totalQuestions: maxQuestions,
      institutionAvgNet,
      turkeyAvgNet,
      activeStudentNet,
      participantCount: hasMeasuredInstitutionData ? tpl.participants : 0,
      isLivePoint: isLastBasePoint && (measuredInstAvgNet !== null || activeStudentNet !== undefined),
    };
  });

  const points: NetProgressionPoint[] = rawPoints.map((pt, idx) => {
    const prev = idx > 0 ? rawPoints[idx - 1] : pt;
    return {
      ...pt,
      institutionDelta:
        idx === 0 || !hasMeasuredInstitutionData
          ? 0
          : Number((pt.institutionAvgNet - prev.institutionAvgNet).toFixed(2)),
      turkeyDelta:
        idx === 0 || !includeTurkey
          ? 0
          : Number((pt.turkeyAvgNet - prev.turkeyAvgNet).toFixed(2)),
      vsTurkeyDiff:
        includeTurkey && hasMeasuredInstitutionData
          ? Number((pt.institutionAvgNet - pt.turkeyAvgNet).toFixed(2))
          : 0,
    };
  });

  const first = points[0];
  const last = points[points.length - 1];

  return {
    points,
    summary: {
      latestInstitutionNet: last.institutionAvgNet,
      latestTurkeyNet: includeTurkey ? last.turkeyAvgNet : 0,
      institutionGrowth: hasMeasuredInstitutionData
        ? Number((last.institutionAvgNet - first.institutionAvgNet).toFixed(2))
        : 0,
      turkeyGrowth: includeTurkey
        ? Number((last.turkeyAvgNet - first.turkeyAvgNet).toFixed(2))
        : 0,
      institutionVsTurkeyDiff:
        includeTurkey && hasMeasuredInstitutionData
          ? Number((last.institutionAvgNet - last.turkeyAvgNet).toFixed(2))
          : 0,
      maxQuestions,
      evaluatedStudentCount: gradeEvaluatedStudents.length,
    },
  };
}
