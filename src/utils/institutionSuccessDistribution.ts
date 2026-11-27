import { getGradeProfile } from '../data/curriculum';
import {
  ExamAnalysisResult,
  ExamRecordSource,
  GradeLevelId,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  PersistedExamRecord,
  StudentRecord,
  WeeklyStudentScore,
} from '../types/academy';
import {
  computeRecordSuccessPct,
  deduplicateLatestExamAttempts,
} from './institutionRankings';
import { calculateNetAndScore } from './weeklyAnalysis';

export type InstitutionChartMetric = 'successPct' | 'avgNet' | 'avgScore';
export type InstitutionChartSort = 'performance' | 'evaluations' | 'name';
export type SuccessDistributionBand = 'high' | 'mid' | 'support' | 'none';

export interface InstitutionGradeBreakdownItem {
  gradeId: GradeLevelId;
  gradeLabel: string;
  evaluationCount: number;
  avgSuccessPct: number;
  avgNet: number;
  avgScore: number;
}

export interface InstitutionSuccessRow {
  institutionId: string;
  institutionName: string;
  shortName: string;
  institutionCode8: string;
  city: string;
  isActiveInstitution: boolean;
  evaluationCount: number;
  registeredStudentCount: number;
  avgSuccessPct: number;
  avgNet: number;
  avgScore: number;
  maxSuccessPct: number;
  minSuccessPct: number;
  topStudentName: string;
  topScore: number;
  hasData: boolean;
  band: SuccessDistributionBand;
  bandLabel: string;
  sourceCounts: {
    kurum: number;
    farkliYayin: number;
    odullu: number;
  };
  gradeBreakdown: InstitutionGradeBreakdownItem[];
}

export interface InstitutionSuccessSummary {
  totalInstitutions: number;
  institutionsWithData: number;
  totalEvaluations: number;
  totalRegisteredStudents: number;
  globalAvgSuccessPct: number;
  globalAvgNet: number;
  globalAvgScore: number;
  successSpreadPct: number;
  topInstitution: InstitutionSuccessRow | null;
  bandCounts: {
    high: number;
    mid: number;
    support: number;
    none: number;
  };
}

export interface InstitutionSuccessDataset {
  rows: InstitutionSuccessRow[];
  chartRows: InstitutionSuccessRow[];
  summary: InstitutionSuccessSummary;
}

interface NormalizedEvalSample {
  studentName: string;
  gradeId: GradeLevelId;
  totalNet: number;
  estimatedScore: number;
  successPct: number;
  examSource: ExamRecordSource;
}

export function shortenInstitutionLabel(name: string, maxLen = 18): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Kurum';
  if (clean.length <= maxLen) return clean;
  const words = clean.split(' ');
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`;
    if (twoWords.length <= maxLen) return twoWords;
  }
  return `${clean.slice(0, Math.max(6, maxLen - 1)).trimEnd()}…`;
}

export function classifySuccessBand(
  avgSuccessPct: number,
  hasData: boolean
): { band: SuccessDistributionBand; bandLabel: string } {
  if (!hasData) {
    return { band: 'none', bandLabel: 'Ölçüm Bekleniyor' };
  }
  if (avgSuccessPct >= 75) {
    return { band: 'high', bandLabel: 'Yüksek Başarı (%75+)' };
  }
  if (avgSuccessPct >= 50) {
    return { band: 'mid', bandLabel: 'Orta Düzey (%50–74)' };
  }
  return { band: 'support', bandLabel: 'Gelişim Odağı (<%50)' };
}

function weeklyEntryToSample(
  entry: WeeklyStudentScore,
  gradeProfile: GradeProfile,
  penaltyDivisor: PenaltyDivisor
): NormalizedEvalSample | null {
  const k2Total = entry.kts2Correct + entry.kts2Wrong + entry.kts2Blank;
  const k1Total = entry.kts1Correct + entry.kts1Wrong + entry.kts1Blank;
  const useK2 = k2Total > 0;
  const totalQ = useK2 ? k2Total : k1Total;
  if (totalQ <= 0) return null;

  const correct = useK2 ? entry.kts2Correct : entry.kts1Correct;
  const wrong = useK2 ? entry.kts2Wrong : entry.kts1Wrong;
  const { net, score } = calculateNetAndScore(
    correct,
    wrong,
    totalQ,
    gradeProfile,
    penaltyDivisor
  );
  const ratio = Math.min(1, Math.max(0, net / Math.max(1, totalQ)));
  return {
    studentName: entry.studentName || 'Öğrenci',
    gradeId: gradeProfile.id,
    totalNet: net,
    estimatedScore: score,
    successPct: Math.round(ratio * 100),
    examSource: 'kurum',
  };
}

export function buildInstitutionSuccessDistribution(input: {
  institutions: Institution[];
  activeInstitutionId: string;
  examHistoryByInst: Record<string, PersistedExamRecord[]>;
  weeklyEntriesByInst?: Record<string, WeeklyStudentScore[]>;
  students?: StudentRecord[];
  gradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  liveAnalysis?: {
    hasLiveAnalysis: boolean;
    analysis: ExamAnalysisResult;
    totalQuestions: number;
  };
  sourceFilter?: 'all' | ExamRecordSource;
  metric?: InstitutionChartMetric;
  sortBy?: InstitutionChartSort;
  includeEmptyInstitutions?: boolean;
}): InstitutionSuccessDataset {
  const sourceFilter = input.sourceFilter ?? 'all';
  const metric = input.metric ?? 'successPct';
  const sortBy = input.sortBy ?? 'performance';
  const includeEmpty = input.includeEmptyInstitutions ?? true;
  const students = input.students ?? [];
  const weeklyEntriesByInst = input.weeklyEntriesByInst ?? {};

  const studentCounts = new Map<string, number>();
  for (const stu of students) {
    studentCounts.set(stu.institutionId, (studentCounts.get(stu.institutionId) ?? 0) + 1);
  }

  const rows: InstitutionSuccessRow[] = input.institutions.map((inst) => {
    const rawHistory = input.examHistoryByInst[inst.id] ?? [];
    const deduped = deduplicateLatestExamAttempts(rawHistory);

    const samples: NormalizedEvalSample[] = [];
    for (const rec of deduped) {
      const recSource: ExamRecordSource = rec.examSource || 'kurum';
      if (sourceFilter !== 'all' && recSource !== sourceFilter) continue;
      samples.push({
        studentName: rec.studentName || 'Öğrenci',
        gradeId: rec.gradeId,
        totalNet: rec.totalNet,
        estimatedScore: rec.estimatedScore,
        successPct: computeRecordSuccessPct(rec),
        examSource: recSource,
      });
    }

    // Include live active OMR evaluation if not yet persisted for the active institution
    if (
      inst.id === input.activeInstitutionId &&
      input.liveAnalysis?.hasLiveAnalysis &&
      input.liveAnalysis.analysis.studentName.trim() &&
      sourceFilter === 'all'
    ) {
      const live = input.liveAnalysis.analysis;
      const alreadyRecorded = deduped.some(
        (r) =>
          r.studentName.trim().toLocaleLowerCase('tr-TR') ===
            live.studentName.trim().toLocaleLowerCase('tr-TR') &&
          r.examTitle === live.examTitle &&
          Math.abs(r.totalNet - live.totalNet) < 0.05
      );
      if (!alreadyRecorded) {
        const totalQ = Math.max(1, input.liveAnalysis.totalQuestions || live.totalCorrect + live.totalWrong + live.totalBlank);
        const pct = Math.round(Math.min(1, Math.max(0, live.totalNet / totalQ)) * 100);
        samples.push({
          studentName: live.studentName,
          gradeId: live.gradeId,
          totalNet: live.totalNet,
          estimatedScore: live.estimatedScore,
          successPct: pct,
          examSource: 'kurum',
        });
      }
    }

    // If institution has weekly KTS entries and no exam history samples yet, derive from weekly entries
    if (samples.length === 0 && (sourceFilter === 'all' || sourceFilter === 'kurum')) {
      const weekly = weeklyEntriesByInst[inst.id] ?? [];
      for (const w of weekly) {
        const matchedStudent = students.find(
          (s) =>
            s.institutionId === inst.id &&
            (s.id === w.studentId || s.studentNumber8 === w.studentNumber8)
        );
        const profile = matchedStudent ? getGradeProfile(matchedStudent.gradeId) : input.gradeProfile;
        const converted = weeklyEntryToSample(w, profile, input.penaltyDivisor);
        if (converted) samples.push(converted);
      }
    }

    const registeredStudentCount = studentCounts.get(inst.id) ?? 0;

    if (samples.length === 0) {
      const { band, bandLabel } = classifySuccessBand(0, false);
      return {
        institutionId: inst.id,
        institutionName: inst.name,
        shortName: shortenInstitutionLabel(inst.name),
        institutionCode8: inst.code8,
        city: inst.city,
        isActiveInstitution: inst.id === input.activeInstitutionId,
        evaluationCount: 0,
        registeredStudentCount,
        avgSuccessPct: 0,
        avgNet: 0,
        avgScore: 0,
        maxSuccessPct: 0,
        minSuccessPct: 0,
        topStudentName: '—',
        topScore: 0,
        hasData: false,
        band,
        bandLabel,
        sourceCounts: { kurum: 0, farkliYayin: 0, odullu: 0 },
        gradeBreakdown: [],
      };
    }

    const count = samples.length;
    const avgSuccessPct = Math.round(
      samples.reduce((sum, s) => sum + s.successPct, 0) / count
    );
    const avgNet = Number(
      (samples.reduce((sum, s) => sum + s.totalNet, 0) / count).toFixed(2)
    );
    const avgScore = Number(
      (samples.reduce((sum, s) => sum + s.estimatedScore, 0) / count).toFixed(1)
    );
    const maxSuccessPct = Math.max(...samples.map((s) => s.successPct));
    const minSuccessPct = Math.min(...samples.map((s) => s.successPct));

    const sortedTop = [...samples].sort((a, b) => {
      if (b.estimatedScore !== a.estimatedScore) return b.estimatedScore - a.estimatedScore;
      return b.totalNet - a.totalNet;
    });

    const sourceCounts = {
      kurum: samples.filter((s) => s.examSource === 'kurum').length,
      farkliYayin: samples.filter((s) => s.examSource === 'farkli-yayin').length,
      odullu: samples.filter((s) => s.examSource === 'odullu').length,
    };

    const gradeGroups = new Map<GradeLevelId, NormalizedEvalSample[]>();
    for (const s of samples) {
      const list = gradeGroups.get(s.gradeId) ?? [];
      list.push(s);
      gradeGroups.set(s.gradeId, list);
    }

    const gradeBreakdown: InstitutionGradeBreakdownItem[] = Array.from(gradeGroups.entries()).map(
      ([gId, list]) => {
        const gCount = list.length;
        return {
          gradeId: gId,
          gradeLabel: getGradeProfile(gId).shortLabel,
          evaluationCount: gCount,
          avgSuccessPct: Math.round(list.reduce((acc, x) => acc + x.successPct, 0) / gCount),
          avgNet: Number((list.reduce((acc, x) => acc + x.totalNet, 0) / gCount).toFixed(2)),
          avgScore: Number((list.reduce((acc, x) => acc + x.estimatedScore, 0) / gCount).toFixed(1)),
        };
      }
    );

    const { band, bandLabel } = classifySuccessBand(avgSuccessPct, true);

    return {
      institutionId: inst.id,
      institutionName: inst.name,
      shortName: shortenInstitutionLabel(inst.name),
      institutionCode8: inst.code8,
      city: inst.city,
      isActiveInstitution: inst.id === input.activeInstitutionId,
      evaluationCount: count,
      registeredStudentCount,
      avgSuccessPct,
      avgNet,
      avgScore,
      maxSuccessPct,
      minSuccessPct,
      topStudentName: sortedTop[0].studentName,
      topScore: Number(sortedTop[0].estimatedScore.toFixed(1)),
      hasData: true,
      band,
      bandLabel,
      sourceCounts,
      gradeBreakdown,
    };
  });

  const getMetricValue = (r: InstitutionSuccessRow): number => {
    if (metric === 'avgNet') return r.avgNet;
    if (metric === 'avgScore') return r.avgScore;
    return r.avgSuccessPct;
  };

  const sortedRows = [...rows].sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    if (sortBy === 'name') {
      return a.institutionName.localeCompare(b.institutionName, 'tr-TR');
    }
    if (sortBy === 'evaluations') {
      if (b.evaluationCount !== a.evaluationCount) return b.evaluationCount - a.evaluationCount;
      return getMetricValue(b) - getMetricValue(a);
    }
    const diff = getMetricValue(b) - getMetricValue(a);
    if (diff !== 0) return diff;
    if (b.avgSuccessPct !== a.avgSuccessPct) return b.avgSuccessPct - a.avgSuccessPct;
    return b.evaluationCount - a.evaluationCount;
  });

  const rowsWithData = sortedRows.filter((r) => r.hasData);
  const chartRows =
    !includeEmpty && rowsWithData.length > 0 ? rowsWithData : sortedRows;

  const totalEvaluations = rowsWithData.reduce((sum, r) => sum + r.evaluationCount, 0);
  const totalRegisteredStudents = sortedRows.reduce(
    (sum, r) => sum + r.registeredStudentCount,
    0
  );

  // Weighted institution averages across all evaluations
  const globalAvgSuccessPct =
    totalEvaluations > 0
      ? Math.round(
          rowsWithData.reduce((sum, r) => sum + r.avgSuccessPct * r.evaluationCount, 0) /
            totalEvaluations
        )
      : 0;
  const globalAvgNet =
    totalEvaluations > 0
      ? Number(
          (
            rowsWithData.reduce((sum, r) => sum + r.avgNet * r.evaluationCount, 0) /
            totalEvaluations
          ).toFixed(2)
        )
      : 0;
  const globalAvgScore =
    totalEvaluations > 0
      ? Number(
          (
            rowsWithData.reduce((sum, r) => sum + r.avgScore * r.evaluationCount, 0) /
            totalEvaluations
          ).toFixed(1)
        )
      : 0;

  const successSpreadPct =
    rowsWithData.length >= 2
      ? Math.max(...rowsWithData.map((r) => r.avgSuccessPct)) -
        Math.min(...rowsWithData.map((r) => r.avgSuccessPct))
      : 0;

  const topInstitution =
    rowsWithData.length > 0
      ? [...rowsWithData].sort((a, b) => {
          if (b.avgSuccessPct !== a.avgSuccessPct) return b.avgSuccessPct - a.avgSuccessPct;
          return b.avgScore - a.avgScore;
        })[0]
      : null;

  const bandCounts = {
    high: sortedRows.filter((r) => r.band === 'high').length,
    mid: sortedRows.filter((r) => r.band === 'mid').length,
    support: sortedRows.filter((r) => r.band === 'support').length,
    none: sortedRows.filter((r) => r.band === 'none').length,
  };

  return {
    rows: sortedRows,
    chartRows,
    summary: {
      totalInstitutions: sortedRows.length,
      institutionsWithData: rowsWithData.length,
      totalEvaluations,
      totalRegisteredStudents,
      globalAvgSuccessPct,
      globalAvgNet,
      globalAvgScore,
      successSpreadPct,
      topInstitution,
      bandCounts,
    },
  };
}
