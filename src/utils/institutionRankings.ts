import { getGradeProfile, GRADE_PROFILES } from '../data/curriculum';
import {
  ExamRecordSource,
  GradeLevelId,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  PersistedExamRecord,
  PrizeExamDefinition,
  RankingPeriodFilter,
  StudentRecord,
  WeeklyStudentScore,
} from '../types/academy';
import { calculateNetAndScore, normalizeClassroomForGrade } from './weeklyAnalysis';

export interface RankedInstitutionExamEntry extends PersistedExamRecord {
  overallRank: number;
  gradeRank: number;
  classRank: number;
  gradeLabel: string;
  normalizedClassroom: string;
  institutionName: string;
  institutionCode8: string;
  successPct: number;
  sourceLabel: string;
}

export interface GradeLevelRankingGroup {
  gradeId: GradeLevelId;
  gradeLabel: string;
  studentCount: number;
  classroomCount: number;
  avgNet: number;
  maxNet: number;
  avgScore: number;
  avgSuccessPct: number;
  entries: RankedInstitutionExamEntry[];
}

export interface ClassroomRankingGroup {
  classroom: string;
  institutionId: string;
  institutionName: string;
  gradeId: GradeLevelId;
  gradeLabel: string;
  studentCount: number;
  avgNet: number;
  avgScore: number;
  avgSuccessPct: number;
  topStudentName: string;
  entries: RankedInstitutionExamEntry[];
}

export interface InstitutionComparisonSummary {
  institutionId: string;
  institutionName: string;
  institutionCode8: string;
  city: string;
  evaluationCount: number;
  gradeCount: number;
  classroomCount: number;
  avgNet: number;
  avgScore: number;
  avgSuccessPct: number;
  topStudentName: string;
  topScore: number;
}

export interface PrizeExamLeaderboardGroup {
  prizeExamId: string;
  title: string;
  prizeDescription: string;
  period: 'daily' | 'weekly' | 'monthly';
  examDate: string;
  targetGradesLabel?: string;
  sourceLabel?: string;
  entries: RankedInstitutionExamEntry[];
}

export interface InstitutionRankingsReport {
  totalEntries: number;
  avgScore: number;
  avgNet: number;
  avgSuccessPct: number;
  overallRanking: RankedInstitutionExamEntry[];
  stackedGradeRankings: GradeLevelRankingGroup[];
  classroomRankings: ClassroomRankingGroup[];
  institutionSummaries: InstitutionComparisonSummary[];
  prizeLeaderboards: PrizeExamLeaderboardGroup[];
}

const GRADE_ORDER_MAP = new Map<GradeLevelId, number>(
  GRADE_PROFILES.map((gp, idx) => [gp.id, idx])
);

export function resolvePrizeExamGrades(
  exam: Pick<PrizeExamDefinition, 'gradeId' | 'gradeIds'>
): GradeLevelId[] {
  if (Array.isArray(exam.gradeIds) && exam.gradeIds.length > 0) {
    const valid = Array.from(new Set(exam.gradeIds)).filter((id) => GRADE_ORDER_MAP.has(id));
    return valid.sort((a, b) => (GRADE_ORDER_MAP.get(a) ?? 99) - (GRADE_ORDER_MAP.get(b) ?? 99));
  }
  if (exam.gradeId && exam.gradeId !== 'all' && GRADE_ORDER_MAP.has(exam.gradeId)) {
    return [exam.gradeId];
  }
  return [];
}

export function togglePrizeGradeSelection(
  current: GradeLevelId[],
  gradeId: GradeLevelId
): GradeLevelId[] {
  const exists = current.includes(gradeId);
  const next = exists ? current.filter((id) => id !== gradeId) : [...current, gradeId];
  return Array.from(new Set(next)).sort(
    (a, b) => (GRADE_ORDER_MAP.get(a) ?? 99) - (GRADE_ORDER_MAP.get(b) ?? 99)
  );
}

export function formatPrizeExamGradesLabel(
  exam: Pick<PrizeExamDefinition, 'gradeId' | 'gradeIds'>
): string {
  const grades = resolvePrizeExamGrades(exam);
  if (grades.length === 0) return 'Tüm Sınıflar';
  if (grades.length === 1) return getGradeProfile(grades[0]).shortLabel;
  const allNumeric = grades.every((g) => /^\d+$/.test(g));
  if (allNumeric) {
    return `${grades.join(', ')}. Sınıflar`;
  }
  return grades.map((g) => getGradeProfile(g).shortLabel).join(', ');
}

export function resolveTargetGradeForPrizeActivation(
  exam: Pick<PrizeExamDefinition, 'gradeId' | 'gradeIds'>,
  currentGradeId: GradeLevelId
): GradeLevelId | null {
  const grades = resolvePrizeExamGrades(exam);
  if (grades.length === 0) return null;
  if (grades.includes(currentGradeId)) return null;
  return grades[0];
}

export function formatExamSourceLabel(
  record: Pick<PersistedExamRecord, 'examSource' | 'publisherName' | 'prizeTitle'>
): string {
  if (record.examSource === 'odullu') {
    return record.prizeTitle ? `Ödüllü · ${record.prizeTitle}` : 'Ödüllü Deneme';
  }
  if (record.examSource === 'farkli-yayin') {
    return record.publisherName ? `Farklı Yayın · ${record.publisherName}` : 'Farklı Yayın';
  }
  return 'Kurum Denemesi';
}

export function parseTurkishOrIsoDateMs(examDate?: string, createdAt?: string): number {
  const trMatch = (examDate || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (trMatch) {
    const day = Number(trMatch[1]);
    const month = Number(trMatch[2]);
    const year = Number(trMatch[3]);
    const ts = Date.UTC(year, month - 1, day, 12, 0, 0);
    if (Number.isFinite(ts)) return ts;
  }
  const isoTs = createdAt ? Date.parse(createdAt) : NaN;
  if (Number.isFinite(isoTs)) return isoTs;
  return Date.now();
}

export function filterExamRecordsByPeriodAndSource(
  records: PersistedExamRecord[],
  filters: {
    period: RankingPeriodFilter;
    source: 'all' | ExamRecordSource;
    referenceDateMs?: number;
  }
): PersistedExamRecord[] {
  const refMs = filters.referenceDateMs ?? Date.now();
  const refDate = new Date(refMs);
  const refDayKey = `${refDate.getUTCFullYear()}-${refDate.getUTCMonth()}-${refDate.getUTCDate()}`;

  return records.filter((rec) => {
    const recSource: ExamRecordSource = rec.examSource || 'kurum';
    if (filters.source !== 'all' && recSource !== filters.source) {
      return false;
    }
    if (filters.period === 'all') return true;

    const recMs = parseTurkishOrIsoDateMs(rec.examDate, rec.createdAt);
    const diffMs = Math.max(0, refMs - recMs);

    if (filters.period === 'daily') {
      const recDate = new Date(recMs);
      const recDayKey = `${recDate.getUTCFullYear()}-${recDate.getUTCMonth()}-${recDate.getUTCDate()}`;
      return recDayKey === refDayKey || diffMs <= 24 * 60 * 60 * 1000;
    }
    if (filters.period === 'weekly') {
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    }
    if (filters.period === 'monthly') {
      return diffMs <= 31 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

export function deduplicateLatestExamAttempts(records: PersistedExamRecord[]): PersistedExamRecord[] {
  const map = new Map<string, PersistedExamRecord>();
  for (const rec of records) {
    const key = [
      rec.institutionId,
      rec.studentId || rec.studentNumber8 || rec.studentName,
      rec.examTitle,
      rec.examDate,
      rec.subjectScopeId || 'all',
      rec.totalQuestions,
      rec.prizeExamId || '',
    ].join('::');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, rec);
    } else {
      const existingTs = Date.parse(existing.createdAt || '') || 0;
      const recTs = Date.parse(rec.createdAt || '') || 0;
      if (recTs >= existingTs) {
        map.set(key, rec);
      }
    }
  }
  return Array.from(map.values());
}

export function sortExamRecordsByPerformance<T extends PersistedExamRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    if (b.estimatedScore !== a.estimatedScore) return b.estimatedScore - a.estimatedScore;
    if (b.totalNet !== a.totalNet) return b.totalNet - a.totalNet;
    if (b.totalCorrect !== a.totalCorrect) return b.totalCorrect - a.totalCorrect;
    return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
  });
}

export function computeRecordSuccessPct(rec: PersistedExamRecord): number {
  const denom = Math.max(1, rec.totalQuestions);
  const ratio = Math.min(1, Math.max(0, rec.totalNet / denom));
  return Math.round(ratio * 100);
}

export function buildInstitutionRankingsReport(
  records: PersistedExamRecord[],
  prizeExams: PrizeExamDefinition[] = [],
  filters: {
    period: RankingPeriodFilter;
    source: 'all' | ExamRecordSource;
    referenceDateMs?: number;
    institutions?: Institution[];
  } = { period: 'all', source: 'all' }
): InstitutionRankingsReport {
  const filtered = deduplicateLatestExamAttempts(
    filterExamRecordsByPeriodAndSource(records, filters)
  );

  if (filtered.length === 0) {
    return {
      totalEntries: 0,
      avgScore: 0,
      avgNet: 0,
      avgSuccessPct: 0,
      overallRanking: [],
      stackedGradeRankings: [],
      classroomRankings: [],
      institutionSummaries: [],
      prizeLeaderboards: [],
    };
  }

  const instMap = new Map<string, Institution>(
    (filters.institutions ?? []).map((inst) => [inst.id, inst])
  );

  const sortedOverall = sortExamRecordsByPerformance(filtered);
  const gradeCounters = new Map<GradeLevelId, number>();
  const classCounters = new Map<string, number>();

  const rankedEntries: RankedInstitutionExamEntry[] = sortedOverall.map((rec, idx) => {
    const profile = getGradeProfile(rec.gradeId);
    const normalizedClassroom = normalizeClassroomForGrade(rec.classroom, profile);
    const nextGradeRank = (gradeCounters.get(rec.gradeId) ?? 0) + 1;
    gradeCounters.set(rec.gradeId, nextGradeRank);

    const classKey = `${rec.institutionId}::${rec.gradeId}::${normalizedClassroom}`;
    const nextClassRank = (classCounters.get(classKey) ?? 0) + 1;
    classCounters.set(classKey, nextClassRank);

    const inst = instMap.get(rec.institutionId);

    return {
      ...rec,
      overallRank: idx + 1,
      gradeRank: nextGradeRank,
      classRank: nextClassRank,
      gradeLabel: profile.shortLabel,
      normalizedClassroom,
      institutionName: inst?.name || 'Aktif Kurum',
      institutionCode8: inst?.code8 || '—',
      successPct: computeRecordSuccessPct(rec),
      sourceLabel: formatExamSourceLabel(rec),
    };
  });

  // Group stacked grade rankings (ordered by curriculum grade index)
  const gradeMap = new Map<GradeLevelId, RankedInstitutionExamEntry[]>();
  for (const entry of rankedEntries) {
    const list = gradeMap.get(entry.gradeId) ?? [];
    list.push(entry);
    gradeMap.set(entry.gradeId, list);
  }

  const stackedGradeRankings: GradeLevelRankingGroup[] = Array.from(gradeMap.entries())
    .sort((a, b) => (GRADE_ORDER_MAP.get(a[0]) ?? 99) - (GRADE_ORDER_MAP.get(b[0]) ?? 99))
    .map(([gradeId, entries]) => {
      const count = entries.length;
      const avgNet = Number((entries.reduce((s, e) => s + e.totalNet, 0) / count).toFixed(2));
      const maxNet = Number(Math.max(...entries.map((e) => e.totalNet)).toFixed(2));
      const avgScore = Number((entries.reduce((s, e) => s + e.estimatedScore, 0) / count).toFixed(1));
      const avgSuccessPct = Math.round(entries.reduce((s, e) => s + e.successPct, 0) / count);
      const distinctClasses = new Set(entries.map((e) => `${e.institutionId}::${e.normalizedClassroom}`)).size;
      return {
        gradeId,
        gradeLabel: getGradeProfile(gradeId).shortLabel,
        studentCount: count,
        classroomCount: distinctClasses,
        avgNet,
        maxNet,
        avgScore,
        avgSuccessPct,
        entries,
      };
    });

  // Group classroom/section rankings (e.g., 5-A, 7-A, 7-B) sorted by avgScore desc
  const classMap = new Map<string, RankedInstitutionExamEntry[]>();
  for (const entry of rankedEntries) {
    const key = `${entry.institutionId}::${entry.gradeId}::${entry.normalizedClassroom}`;
    const list = classMap.get(key) ?? [];
    list.push(entry);
    classMap.set(key, list);
  }

  const classroomRankings: ClassroomRankingGroup[] = Array.from(classMap.entries())
    .map(([, entries]) => {
      const count = entries.length;
      const avgNet = Number((entries.reduce((s, e) => s + e.totalNet, 0) / count).toFixed(2));
      const avgScore = Number((entries.reduce((s, e) => s + e.estimatedScore, 0) / count).toFixed(1));
      const avgSuccessPct = Math.round(entries.reduce((s, e) => s + e.successPct, 0) / count);
      return {
        classroom: entries[0].normalizedClassroom,
        institutionId: entries[0].institutionId,
        institutionName: entries[0].institutionName,
        gradeId: entries[0].gradeId,
        gradeLabel: entries[0].gradeLabel,
        studentCount: count,
        avgNet,
        avgScore,
        avgSuccessPct,
        topStudentName: entries[0].studentName,
        entries,
      };
    })
    .sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      if (b.avgNet !== a.avgNet) return b.avgNet - a.avgNet;
      return a.classroom.localeCompare(b.classroom, 'tr-TR');
    });

  // Group Institution comparison summaries
  const instEntriesMap = new Map<string, RankedInstitutionExamEntry[]>();
  for (const entry of rankedEntries) {
    const list = instEntriesMap.get(entry.institutionId) ?? [];
    list.push(entry);
    instEntriesMap.set(entry.institutionId, list);
  }

  const institutionSummaries: InstitutionComparisonSummary[] = Array.from(instEntriesMap.entries())
    .map(([institutionId, entries]) => {
      const count = entries.length;
      const inst = instMap.get(institutionId);
      const avgNet = Number((entries.reduce((s, e) => s + e.totalNet, 0) / count).toFixed(2));
      const avgScore = Number((entries.reduce((s, e) => s + e.estimatedScore, 0) / count).toFixed(1));
      const avgSuccessPct = Math.round(entries.reduce((s, e) => s + e.successPct, 0) / count);
      const gradeCount = new Set(entries.map((e) => e.gradeId)).size;
      const classroomCount = new Set(entries.map((e) => e.normalizedClassroom)).size;
      return {
        institutionId,
        institutionName: inst?.name || entries[0].institutionName,
        institutionCode8: inst?.code8 || entries[0].institutionCode8,
        city: inst?.city || '',
        evaluationCount: count,
        gradeCount,
        classroomCount,
        avgNet,
        avgScore,
        avgSuccessPct,
        topStudentName: entries[0].studentName,
        topScore: entries[0].estimatedScore,
      };
    })
    .sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.avgNet - a.avgNet;
    });

  // Group Ödüllü Deneme leaderboards
  const prizeMap = new Map<string, RankedInstitutionExamEntry[]>();
  for (const entry of rankedEntries) {
    if (entry.examSource === 'odullu' || entry.prizeExamId) {
      const key = entry.prizeExamId || `custom-prize::${entry.examTitle}`;
      const list = prizeMap.get(key) ?? [];
      list.push(entry);
      prizeMap.set(key, list);
    }
  }

  const prizeLeaderboards: PrizeExamLeaderboardGroup[] = Array.from(prizeMap.entries()).map(
    ([prizeKey, entries]) => {
      const def = prizeExams.find((p) => p.id === prizeKey);
      const sortedPrize = sortExamRecordsByPerformance(entries).map((e, idx) => ({
        ...e,
        gradeRank: idx + 1,
      }));
      const sourceLabel = def
        ? def.sourceMode === 'farkli-yayin'
          ? def.publisherName
            ? `Farklı Yayın · ${def.publisherName}`
            : 'Farklı Yayın'
          : 'Kurum Denemesi'
        : entries[0].publisherName
          ? `Farklı Yayın · ${entries[0].publisherName}`
          : undefined;
      return {
        prizeExamId: prizeKey,
        title: def?.title || entries[0].examTitle,
        prizeDescription:
          def?.prizeDescription || entries[0].prizeTitle || 'Derece Başarı Ödülü',
        period: def?.period || 'weekly',
        examDate: def?.examDate || entries[0].examDate,
        targetGradesLabel: def ? formatPrizeExamGradesLabel(def) : undefined,
        sourceLabel,
        entries: sortedPrize,
      };
    }
  );

  const avgScore = Number(
    (rankedEntries.reduce((s, e) => s + e.estimatedScore, 0) / rankedEntries.length).toFixed(1)
  );
  const avgNet = Number(
    (rankedEntries.reduce((s, e) => s + e.totalNet, 0) / rankedEntries.length).toFixed(2)
  );
  const avgSuccessPct = Math.round(
    rankedEntries.reduce((s, e) => s + e.successPct, 0) / rankedEntries.length
  );

  return {
    totalEntries: rankedEntries.length,
    avgScore,
    avgNet,
    avgSuccessPct,
    overallRanking: rankedEntries,
    stackedGradeRankings,
    classroomRankings,
    institutionSummaries,
    prizeLeaderboards,
  };
}

/**
 * Automatically synchronizes any OMR-evaluated exam (Kurum, Farklı Yayın, or Ödüllü Deneme)
 * into the Weekly Comparison List (`weeklyEntriesByInst`), scaling counts proportionally if the
 * weekly list preset differs from the evaluated exam's question count.
 */
export function syncExamRecordToWeeklyEntries(
  existingEntries: WeeklyStudentScore[],
  record: PersistedExamRecord,
  weeklyTargetQuestions: number
): WeeklyStudentScore[] {
  const safeTarget = Math.max(1, weeklyTargetQuestions);
  const recTotal = Math.max(1, record.totalQuestions);
  const profile = getGradeProfile(record.gradeId);
  const normalizedClass = normalizeClassroomForGrade(record.classroom, profile);

  const scaledCorrect = Math.max(
    0,
    Math.min(safeTarget, Math.round((record.totalCorrect / recTotal) * safeTarget))
  );
  const scaledWrong = Math.max(
    0,
    Math.min(safeTarget - scaledCorrect, Math.round((record.totalWrong / recTotal) * safeTarget))
  );
  const scaledBlank = Math.max(0, safeTarget - scaledCorrect - scaledWrong);

  const weakSubject =
    record.subjectMetrics && record.subjectMetrics.length > 0
      ? [...record.subjectMetrics].sort((a, b) => a.accuracyPct - b.accuracyPct)[0]?.subject
      : record.subjectScopeName;
  const sourceBadge = formatExamSourceLabel(record);
  const weakNote = weakSubject
    ? `${sourceBadge} · ${record.examTitle} (${weakSubject})`
    : `${sourceBadge} · ${record.examTitle}`;

  const matchIdx = existingEntries.findIndex(
    (e) =>
      (record.studentNumber8 && e.studentNumber8 === record.studentNumber8) ||
      (record.studentId && e.studentId === record.studentId) ||
      (record.studentName &&
        e.studentName.trim().toLocaleLowerCase('tr-TR') ===
          record.studentName.trim().toLocaleLowerCase('tr-TR'))
  );

  if (matchIdx >= 0) {
    const prev = existingEntries[matchIdx];
    const isSameExamRepeat = prev.weakTopicNote?.includes(record.examTitle);
    const k1Correct = isSameExamRepeat ? prev.kts1Correct : prev.kts2Correct;
    const k1Wrong = isSameExamRepeat ? prev.kts1Wrong : prev.kts2Wrong;
    const k1Blank = isSameExamRepeat ? prev.kts1Blank : prev.kts2Blank;
    const updated: WeeklyStudentScore = {
      ...prev,
      classroom: normalizedClass,
      kts1Correct: k1Correct,
      kts1Wrong: k1Wrong,
      kts1Blank: k1Blank,
      kts2Correct: scaledCorrect,
      kts2Wrong: scaledWrong,
      kts2Blank: scaledBlank,
      weakTopicNote: weakNote,
    };
    return existingEntries.map((item, i) => (i === matchIdx ? updated : item));
  }

  const newEntry: WeeklyStudentScore = {
    studentId: record.studentId,
    studentName: record.studentName,
    studentNumber8: record.studentNumber8 || '00000000',
    classroom: normalizedClass,
    kts1Correct: scaledCorrect,
    kts1Wrong: scaledWrong,
    kts1Blank: scaledBlank,
    kts2Correct: scaledCorrect,
    kts2Wrong: scaledWrong,
    kts2Blank: scaledBlank,
    weakTopicNote: weakNote,
  };

  return [newEntry, ...existingEntries];
}

function inferGradeIdFromWeeklyClassroom(
  classroom: string,
  fallbackGradeId: GradeLevelId
): GradeLevelId {
  const clean = (classroom || '').trim().toUpperCase();
  if (/^TYT/.test(clean) || /\bTYT\b/.test(clean)) return 'TYT';
  if (/\bAYT-EA\b/.test(clean)) return 'AYT-EA';
  if (/\bAYT-SOZ\b|\bAYT-SÖZ\b/.test(clean)) return 'AYT-SOZ';
  if (/^AYT/.test(clean) || /\bAYT\b/.test(clean)) return 'AYT-SAY';
  const match = clean.match(/^(\d{1,2})\b/);
  if (match) {
    const num = Number(match[1]);
    if (num >= 3 && num <= 12) {
      return String(num) as GradeLevelId;
    }
  }
  return fallbackGradeId;
}

/**
 * Combines persisted OMR/exam history with manual or simulated Haftalık Liste (KTS) scores
 * across institutions without double-counting students who were synced from OMR.
 */
export function buildWeeklyEffectiveExamRecords(input: {
  institutions: Institution[];
  examHistoryByInst: Record<string, PersistedExamRecord[]>;
  weeklyEntriesByInst?: Record<string, WeeklyStudentScore[]>;
  students?: StudentRecord[];
  fallbackGradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  weeklyQuestionCount: number;
  weeklyExamTitle?: string;
  weeklyExamDate?: string;
}): PersistedExamRecord[] {
  const weeklyEntriesByInst = input.weeklyEntriesByInst ?? {};
  const students = input.students ?? [];
  const allInstIds = Array.from(
    new Set([
      ...input.institutions.map((i) => i.id),
      ...Object.keys(input.examHistoryByInst),
      ...Object.keys(weeklyEntriesByInst),
    ])
  );

  const combined: PersistedExamRecord[] = [];
  const todayStr = input.weeklyExamDate?.trim() || new Date().toLocaleDateString('tr-TR');
  const nowIso = new Date().toISOString();

  for (const instId of allInstIds) {
    const persisted = input.examHistoryByInst[instId] ?? [];
    combined.push(...persisted);

    const weeklyList = weeklyEntriesByInst[instId] ?? [];
    for (const w of weeklyList) {
      const normalizedWeeklyName = (w.studentName || '').trim().toLocaleLowerCase('tr-TR');
      const alreadyInPersisted = persisted.some(
        (p) =>
          (w.studentId && p.studentId === w.studentId) ||
          (w.studentNumber8 &&
            w.studentNumber8 !== '00000000' &&
            p.studentNumber8 === w.studentNumber8) ||
          (normalizedWeeklyName.length > 0 &&
            p.studentName.trim().toLocaleLowerCase('tr-TR') === normalizedWeeklyName)
      );
      if (alreadyInPersisted) continue;

      const matchedStudent = students.find(
        (s) =>
          s.institutionId === instId &&
          ((w.studentId && s.id === w.studentId) ||
            (w.studentNumber8 && s.studentNumber8 === w.studentNumber8))
      );
      const resolvedGradeId = matchedStudent
        ? matchedStudent.gradeId
        : inferGradeIdFromWeeklyClassroom(w.classroom, input.fallbackGradeProfile.id);
      const profile = getGradeProfile(resolvedGradeId);

      const k2Total = w.kts2Correct + w.kts2Wrong + w.kts2Blank;
      const k1Total = w.kts1Correct + w.kts1Wrong + w.kts1Blank;
      const useK2 = k2Total > 0;
      const totalQ = Math.max(1, useK2 ? k2Total : k1Total || input.weeklyQuestionCount);
      if ((useK2 ? k2Total : k1Total) <= 0) continue;

      const correct = useK2 ? w.kts2Correct : w.kts1Correct;
      const wrong = useK2 ? w.kts2Wrong : w.kts1Wrong;
      const blank = useK2 ? w.kts2Blank : w.kts1Blank;
      const { net, score } = calculateNetAndScore(
        correct,
        wrong,
        totalQ,
        profile,
        input.penaltyDivisor
      );

      combined.push({
        id: `weekly-${instId}-${w.studentId}`,
        institutionId: instId,
        studentId: w.studentId,
        studentName: w.studentName,
        studentNumber8: w.studentNumber8,
        classroom: normalizeClassroomForGrade(w.classroom, profile),
        gradeId: resolvedGradeId,
        examTitle: input.weeklyExamTitle?.trim() || 'Haftalık KTS Denemesi',
        examDate: todayStr,
        createdAt: nowIso,
        examSource: 'kurum',
        totalQuestions: totalQ,
        totalCorrect: correct,
        totalWrong: wrong,
        totalBlank: blank,
        totalNet: net,
        estimatedScore: score,
        maxScore: profile.maxScore,
      });
    }
  }

  return combined;
}

