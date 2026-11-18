import {
  GradeLevelId,
  GradeProfile,
  PenaltyDivisor,
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
  liveAnalysis?: {
    hasLiveAnalysis: boolean;
    studentName: string;
    totalNet: number;
    examTitle: string;
  };
}): NetProgressionDataset {
  const profileTotal = input.gradeProfile.subjects.reduce(
    (sum, s) => sum + s.questionCount,
    0
  );
  const maxQuestions = Math.max(10, input.questionCount || profileTotal || 50);
  const categoryFactor = getCategoryDifficultyFactor(input.gradeProfile);
  const penaltyAdj = getPenaltyRatioAdjustment(input.penaltyDivisor);
  const instSeed = computeSeedOffset(input.institutionCode8, input.gradeProfile.id);

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

    const turkeyAvgNet = Number((maxQuestions * turkeyRatio).toFixed(2));
    const isLastBasePoint = idx === EXAM_TEMPLATES.length - 1;
    let institutionAvgNet = Number((maxQuestions * instRatio).toFixed(2));

    if (isLastBasePoint && measuredInstAvgNet !== null) {
      institutionAvgNet = measuredInstAvgNet;
    }

    const activeStudentNet =
      isLastBasePoint &&
      input.liveAnalysis?.hasLiveAnalysis &&
      input.liveAnalysis.studentName.trim().length > 0
        ? Number(input.liveAnalysis.totalNet.toFixed(2))
        : undefined;

    return {
      id: `prog-${input.gradeProfile.id}-${idx + 1}`,
      examName: formatGradeExamName(input.gradeProfile, tpl.suffix),
      shortLabel: tpl.shortPrefix,
      date: tpl.date,
      totalQuestions: maxQuestions,
      institutionAvgNet,
      turkeyAvgNet,
      activeStudentNet,
      participantCount: tpl.participants,
      isLivePoint: isLastBasePoint && (measuredInstAvgNet !== null || activeStudentNet !== undefined),
    };
  });

  const points: NetProgressionPoint[] = rawPoints.map((pt, idx) => {
    const prev = idx > 0 ? rawPoints[idx - 1] : pt;
    return {
      ...pt,
      institutionDelta:
        idx === 0 ? 0 : Number((pt.institutionAvgNet - prev.institutionAvgNet).toFixed(2)),
      turkeyDelta:
        idx === 0 ? 0 : Number((pt.turkeyAvgNet - prev.turkeyAvgNet).toFixed(2)),
      vsTurkeyDiff: Number((pt.institutionAvgNet - pt.turkeyAvgNet).toFixed(2)),
    };
  });

  const first = points[0];
  const last = points[points.length - 1];

  return {
    points,
    summary: {
      latestInstitutionNet: last.institutionAvgNet,
      latestTurkeyNet: last.turkeyAvgNet,
      institutionGrowth: Number((last.institutionAvgNet - first.institutionAvgNet).toFixed(2)),
      turkeyGrowth: Number((last.turkeyAvgNet - first.turkeyAvgNet).toFixed(2)),
      institutionVsTurkeyDiff: Number(
        (last.institutionAvgNet - last.turkeyAvgNet).toFixed(2)
      ),
      maxQuestions,
      evaluatedStudentCount: gradeEvaluatedStudents.length,
    },
  };
}
