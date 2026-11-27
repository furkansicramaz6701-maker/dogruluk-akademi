import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import {
  buildInstitutionRankingsReport,
  buildWeeklyEffectiveExamRecords,
  filterExamRecordsByPeriodAndSource,
  formatPrizeExamGradesLabel,
  resolvePrizeExamGrades,
  resolveTargetGradeForPrizeActivation,
  syncExamRecordToWeeklyEntries,
  togglePrizeGradeSelection,
} from './institutionRankings';
import {
  Institution,
  PersistedExamRecord,
  PrizeExamDefinition,
  WeeklyStudentScore,
} from '../types/academy';

const SAMPLE_INSTITUTIONS: Institution[] = [
  { id: 'inst-1', name: 'Doğruluk Akademi', code8: '48291045', city: 'İstanbul', createdAt: '2026-01-01' },
  { id: 'inst-2', name: 'Atatürk Ortaokulu', code8: '73910462', city: 'Ankara', createdAt: '2026-01-02' },
];

const SAMPLE_PRIZES: PrizeExamDefinition[] = [
  {
    id: 'prize-1',
    institutionId: 'inst-1',
    title: 'Kasım Ödüllü LGS Maratonu',
    prizeDescription: '1.ye Tablet + Eğitim Seti',
    period: 'weekly',
    gradeId: 'all',
    sourceMode: 'farkli-yayin',
    publisherName: 'Özdebir',
    examDate: '26.11.2026',
    createdAt: '2026-11-26T08:00:00.000Z',
  },
];

const SAMPLE_RECORDS: PersistedExamRecord[] = [
  {
    id: 'r1',
    institutionId: 'inst-1',
    studentId: 's1',
    studentName: 'Alihan Sarı',
    studentNumber8: '10000001',
    classroom: '5-A',
    gradeId: '5',
    examTitle: 'Haftalık Fen',
    examDate: '26.11.2026',
    createdAt: '2026-11-26T09:00:00.000Z',
    examSource: 'farkli-yayin',
    publisherName: 'Özdebir',
    totalQuestions: 20,
    totalCorrect: 18,
    totalWrong: 2,
    totalBlank: 0,
    totalNet: 17.33,
    estimatedScore: 446.6,
    maxScore: 500,
  },
  {
    id: 'r2',
    institutionId: 'inst-1',
    studentId: 's2',
    studentName: 'Defne Kaya',
    studentNumber8: '10000002',
    classroom: '7-A',
    gradeId: '7',
    examTitle: 'Kasım Ödüllü LGS Maratonu',
    examDate: '26.11.2026',
    createdAt: '2026-11-26T09:15:00.000Z',
    examSource: 'odullu',
    prizeExamId: 'prize-1',
    prizeTitle: '1.ye Tablet + Eğitim Seti',
    totalQuestions: 20,
    totalCorrect: 19,
    totalWrong: 1,
    totalBlank: 0,
    totalNet: 18.67,
    estimatedScore: 473.4,
    maxScore: 500,
  },
  {
    id: 'r3',
    institutionId: 'inst-1',
    studentId: 's3',
    studentName: 'Mert Demir',
    studentNumber8: '10000003',
    classroom: '7-B',
    gradeId: '7',
    examTitle: 'Kasım Ödüllü LGS Maratonu',
    examDate: '20.11.2026',
    createdAt: '2026-11-20T09:15:00.000Z',
    examSource: 'odullu',
    prizeExamId: 'prize-1',
    prizeTitle: '1.ye Tablet + Eğitim Seti',
    totalQuestions: 20,
    totalCorrect: 15,
    totalWrong: 3,
    totalBlank: 2,
    totalNet: 14.0,
    estimatedScore: 380.0,
    maxScore: 500,
  },
  {
    id: 'r4',
    institutionId: 'inst-2',
    studentId: 's4',
    studentName: 'Ece Yılmaz',
    studentNumber8: '10000004',
    classroom: '7-A',
    gradeId: '7',
    examTitle: 'Ekim Denemesi',
    examDate: '10.10.2026',
    createdAt: '2026-10-10T09:15:00.000Z',
    examSource: 'kurum',
    totalQuestions: 20,
    totalCorrect: 16,
    totalWrong: 2,
    totalBlank: 2,
    totalNet: 15.33,
    estimatedScore: 406.6,
    maxScore: 500,
  },
];

test('buildInstitutionRankingsReport returns strictly empty lists when there are zero real exams', () => {
  const empty = buildInstitutionRankingsReport([], SAMPLE_PRIZES, { period: 'all', source: 'all' });
  assert.equal(empty.totalEntries, 0);
  assert.equal(empty.overallRanking.length, 0);
  assert.equal(empty.stackedGradeRankings.length, 0);
  assert.equal(empty.classroomRankings.length, 0);
  assert.equal(empty.institutionSummaries.length, 0);
  assert.equal(empty.prizeLeaderboards.length, 0);
});

test('buildInstitutionRankingsReport stacks 5. Sınıf vs 7. Sınıf, aggregates classrooms & institutions', () => {
  const report = buildInstitutionRankingsReport(SAMPLE_RECORDS, SAMPLE_PRIZES, {
    period: 'all',
    source: 'all',
    institutions: SAMPLE_INSTITUTIONS,
  });

  assert.equal(report.totalEntries, 4);
  assert.equal(report.overallRanking[0].studentName, 'Defne Kaya');
  assert.equal(report.overallRanking[0].overallRank, 1);

  assert.equal(report.stackedGradeRankings.length, 2);
  assert.equal(report.stackedGradeRankings[0].gradeId, '5');
  assert.equal(report.stackedGradeRankings[1].gradeId, '7');
  assert.equal(report.stackedGradeRankings[1].entries.length, 3);
  assert.equal(report.stackedGradeRankings[1].entries[0].gradeRank, 1);
  assert.equal(report.stackedGradeRankings[1].entries[0].studentName, 'Defne Kaya');

  assert.equal(report.classroomRankings.length, 4);
  assert.equal(report.classroomRankings[0].classroom, '7-A');
  assert.equal(report.classroomRankings[0].institutionName, 'Doğruluk Akademi');

  assert.equal(report.institutionSummaries.length, 2);
  assert.equal(report.institutionSummaries[0].institutionName, 'Doğruluk Akademi');
  assert.equal(report.institutionSummaries[0].evaluationCount, 3);
  assert.equal(report.institutionSummaries[1].institutionName, 'Atatürk Ortaokulu');

  assert.equal(report.prizeLeaderboards.length, 1);
  assert.equal(report.prizeLeaderboards[0].entries.length, 2);
  assert.equal(report.prizeLeaderboards[0].entries[0].studentName, 'Defne Kaya');
});

test('filterExamRecordsByPeriodAndSource accurately filters daily, weekly, monthly, and odullu', () => {
  const refMs = Date.UTC(2026, 10, 26, 15, 0, 0);
  const daily = filterExamRecordsByPeriodAndSource(SAMPLE_RECORDS, {
    period: 'daily',
    source: 'all',
    referenceDateMs: refMs,
  });
  assert.equal(daily.length, 2);

  const weeklyOdullu = filterExamRecordsByPeriodAndSource(SAMPLE_RECORDS, {
    period: 'weekly',
    source: 'odullu',
    referenceDateMs: refMs,
  });
  assert.equal(weeklyOdullu.length, 2);

  const monthlyAll = filterExamRecordsByPeriodAndSource(SAMPLE_RECORDS, {
    period: 'monthly',
    source: 'all',
    referenceDateMs: refMs,
  });
  assert.equal(monthlyAll.length, 3);
});

test('syncExamRecordToWeeklyEntries automatically adds and updates students in Weekly list', () => {
  const initial: WeeklyStudentScore[] = [];
  const afterFirst = syncExamRecordToWeeklyEntries(initial, SAMPLE_RECORDS[0], 50);
  assert.equal(afterFirst.length, 1);
  assert.equal(afterFirst[0].studentName, 'Alihan Sarı');
  assert.equal(afterFirst[0].kts2Correct, 45);
  assert.ok(afterFirst[0].weakTopicNote?.includes('Özdebir'));

  const updatedRec: PersistedExamRecord = {
    ...SAMPLE_RECORDS[0],
    examTitle: 'Yeni Deneme 2',
    totalCorrect: 19,
    totalWrong: 1,
    totalBlank: 0,
  };
  const afterSecond = syncExamRecordToWeeklyEntries(afterFirst, updatedRec, 50);
  assert.equal(afterSecond.length, 1);
  assert.equal(afterSecond[0].kts1Correct, 45);
  assert.equal(afterSecond[0].kts2Correct, 48);
});

test('buildWeeklyEffectiveExamRecords merges OMR history and weekly KTS entries across institutions without duplicates', () => {
  const weeklyEntriesByInst: Record<string, WeeklyStudentScore[]> = {
    'inst-1': [
      // Synced duplicate of s1 (already in SAMPLE_RECORDS[0]) — must NOT double-count
      {
        studentId: 's1',
        studentName: 'Alihan Sarı',
        studentNumber8: '10000001',
        classroom: '5-A',
        kts1Correct: 40,
        kts1Wrong: 5,
        kts1Blank: 5,
        kts2Correct: 45,
        kts2Wrong: 5,
        kts2Blank: 0,
      },
      // Manual weekly test entry not yet in examHistory
      {
        studentId: 'w-manual-1',
        studentName: 'Zehra Tunç',
        studentNumber8: '10000099',
        classroom: '5-B',
        kts1Correct: 30,
        kts1Wrong: 6,
        kts1Blank: 14,
        kts2Correct: 42,
        kts2Wrong: 4,
        kts2Blank: 4,
      },
    ],
    'inst-2': [
      {
        studentId: 'w-manual-2',
        studentName: 'Burak Şen',
        studentNumber8: '20000099',
        classroom: '8-A',
        kts1Correct: 35,
        kts1Wrong: 10,
        kts1Blank: 5,
        kts2Correct: 40,
        kts2Wrong: 5,
        kts2Blank: 5,
      },
    ],
  };

  const merged = buildWeeklyEffectiveExamRecords({
    institutions: SAMPLE_INSTITUTIONS,
    examHistoryByInst: {
      'inst-1': SAMPLE_RECORDS.filter((r) => r.institutionId === 'inst-1'),
      'inst-2': SAMPLE_RECORDS.filter((r) => r.institutionId === 'inst-2'),
    },
    weeklyEntriesByInst,
    fallbackGradeProfile: getGradeProfile('5'),
    penaltyDivisor: 3,
    weeklyQuestionCount: 50,
    weeklyExamTitle: 'Haftalık 2 (KTS-2)',
    weeklyExamDate: '27.11.2026',
  });

  // 4 persisted + 2 non-duplicate weekly entries = 6 total
  assert.equal(merged.length, 6);
  const report = buildInstitutionRankingsReport(merged, SAMPLE_PRIZES, {
    period: 'all',
    source: 'all',
    institutions: SAMPLE_INSTITUTIONS,
  });

  assert.equal(report.institutionSummaries.length, 2);
  assert.ok(report.classroomRankings.some((c) => c.classroom === '5-B' && c.institutionId === 'inst-1'));
  assert.ok(report.classroomRankings.some((c) => c.classroom === '8-A' && c.institutionId === 'inst-2'));
});

test('multi-grade prize exam helpers toggle, sort, format 3-8 grades, and resolve OMR activation grade', () => {
  let selected = togglePrizeGradeSelection([], '7');
  selected = togglePrizeGradeSelection(selected, '3');
  selected = togglePrizeGradeSelection(selected, '5');
  selected = togglePrizeGradeSelection(selected, '4');
  selected = togglePrizeGradeSelection(selected, '8');
  selected = togglePrizeGradeSelection(selected, '6');

  assert.deepEqual(selected, ['3', '4', '5', '6', '7', '8']);

  // Deselecting one grade keeps the remaining ones in curriculum order
  const without6 = togglePrizeGradeSelection(selected, '6');
  assert.deepEqual(without6, ['3', '4', '5', '7', '8']);

  const prize3to8: PrizeExamDefinition = {
    id: 'prize-3-8',
    institutionId: 'inst-1',
    title: 'Özdebir Ödüllü Deneme',
    prizeDescription: '1.ye Tablet',
    period: 'weekly',
    gradeId: '3',
    gradeIds: selected,
    sourceMode: 'farkli-yayin',
    publisherName: 'Özdebir',
    examDate: '27.11.2026',
    createdAt: '2026-11-27T10:00:00.000Z',
  };

  assert.deepEqual(resolvePrizeExamGrades(prize3to8), ['3', '4', '5', '6', '7', '8']);
  assert.equal(formatPrizeExamGradesLabel(prize3to8), '3, 4, 5, 6, 7, 8. Sınıflar');
  assert.equal(resolveTargetGradeForPrizeActivation(prize3to8, '7'), null);
  assert.equal(resolveTargetGradeForPrizeActivation(prize3to8, '11'), '3');

  const allGradesPrize: PrizeExamDefinition = {
    ...prize3to8,
    gradeId: 'all',
    gradeIds: [],
  };
  assert.deepEqual(resolvePrizeExamGrades(allGradesPrize), []);
  assert.equal(formatPrizeExamGradesLabel(allGradesPrize), 'Tüm Sınıflar');
  assert.equal(resolveTargetGradeForPrizeActivation(allGradesPrize, '5'), null);
});

