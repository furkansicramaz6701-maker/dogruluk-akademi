import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { PersistedExamRecord, StudentRecord, WeeklyStudentScore } from '../types/academy';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import {
  buildInstitutionSuccessDistribution,
  classifySuccessBand,
  shortenInstitutionLabel,
} from './institutionSuccessDistribution';

function makeRecord(overrides: Partial<PersistedExamRecord>): PersistedExamRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    institutionId: DEFAULT_INSTITUTIONS[0].id,
    studentId: 'stu-1',
    studentName: 'Ali Veli',
    studentNumber8: '12345678',
    classroom: '5-A',
    gradeId: '5',
    examTitle: '5. Sınıf Deneme 1',
    examDate: '27.11.2026',
    totalQuestions: 20,
    totalCorrect: 16,
    totalWrong: 4,
    totalBlank: 0,
    totalNet: 14.67,
    estimatedScore: 410,
    maxScore: 500,
    createdAt: '2026-11-27T10:00:00.000Z',
    examSource: 'kurum',
    ...overrides,
  };
}

test('shortenInstitutionLabel preserves short names and cleanly truncates long ones', () => {
  assert.equal(shortenInstitutionLabel('Doğruluk Akademi'), 'Doğruluk Akademi');
  assert.equal(
    shortenInstitutionLabel('Anadolu İlköğretim & LGS Kurumu', 18),
    'Anadolu İlköğretim'
  );
  assert.equal(shortenInstitutionLabel('', 18), 'Kurum');
});

test('classifySuccessBand maps percentages to expected bands', () => {
  assert.equal(classifySuccessBand(0, false).band, 'none');
  assert.equal(classifySuccessBand(82, true).band, 'high');
  assert.equal(classifySuccessBand(63, true).band, 'mid');
  assert.equal(classifySuccessBand(42, true).band, 'support');
});

test('buildInstitutionSuccessDistribution returns clean zeroed summary when no evaluations exist', () => {
  const grade5 = getGradeProfile('5');
  const dataset = buildInstitutionSuccessDistribution({
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: DEFAULT_INSTITUTIONS[0].id,
    examHistoryByInst: {},
    weeklyEntriesByInst: {},
    students: [],
    gradeProfile: grade5,
    penaltyDivisor: 3,
  });

  assert.equal(dataset.summary.totalInstitutions, DEFAULT_INSTITUTIONS.length);
  assert.equal(dataset.summary.institutionsWithData, 0);
  assert.equal(dataset.summary.totalEvaluations, 0);
  assert.equal(dataset.summary.globalAvgSuccessPct, 0);
  assert.equal(dataset.summary.topInstitution, null);
  assert.ok(dataset.rows.every((r) => !r.hasData && r.band === 'none'));
});

test('buildInstitutionSuccessDistribution aggregates multi-institution exam history accurately', () => {
  const grade5 = getGradeProfile('5');
  const grade8 = getGradeProfile('8');
  const instA = DEFAULT_INSTITUTIONS[0];
  const instB = DEFAULT_INSTITUTIONS[1];
  const instC = DEFAULT_INSTITUTIONS[2];

  const students: StudentRecord[] = [
    {
      id: 's1',
      fullName: 'Ayşe Yılmaz',
      studentNumber8: '10000001',
      institutionId: instA.id,
      institutionCode8: instA.code8,
      institutionName: instA.name,
      classroom: '5-A',
      gradeId: '5',
      createdAt: '2026-11-01',
    },
    {
      id: 's2',
      fullName: 'Can Demir',
      studentNumber8: '20000002',
      institutionId: instB.id,
      institutionCode8: instB.code8,
      institutionName: instB.name,
      classroom: '8-A',
      gradeId: '8',
      createdAt: '2026-11-01',
    },
  ];

  const examHistoryByInst: Record<string, PersistedExamRecord[]> = {
    [instA.id]: [
      makeRecord({
        id: 'a1',
        institutionId: instA.id,
        studentId: 's1',
        studentName: 'Ayşe Yılmaz',
        totalQuestions: 20,
        totalNet: 18,
        estimatedScore: 465,
        examSource: 'kurum',
      }),
      makeRecord({
        id: 'a2',
        institutionId: instA.id,
        studentId: 's3',
        studentName: 'Mehmet Kaya',
        totalQuestions: 20,
        totalNet: 14,
        estimatedScore: 395,
        examSource: 'odullu',
      }),
    ],
    [instB.id]: [
      makeRecord({
        id: 'b1',
        institutionId: instB.id,
        studentId: 's2',
        studentName: 'Can Demir',
        gradeId: grade8.id,
        totalQuestions: 20,
        totalNet: 11,
        estimatedScore: 340,
        examSource: 'farkli-yayin',
      }),
    ],
  };

  const weeklyEntriesByInst: Record<string, WeeklyStudentScore[]> = {
    [instC.id]: [
      {
        studentId: 'wc1',
        studentName: 'Deniz Ak',
        studentNumber8: '30000003',
        classroom: '12-A',
        kts1Correct: 30,
        kts1Wrong: 12,
        kts1Blank: 8,
        kts2Correct: 34,
        kts2Wrong: 8,
        kts2Blank: 8,
        weakTopicNote: 'Matematik',
      },
    ],
  };

  const dataset = buildInstitutionSuccessDistribution({
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: instA.id,
    examHistoryByInst,
    weeklyEntriesByInst,
    students,
    gradeProfile: grade5,
    penaltyDivisor: 3,
    metric: 'successPct',
    sortBy: 'performance',
  });

  assert.equal(dataset.summary.institutionsWithData, 3);
  assert.equal(dataset.summary.totalEvaluations, 4);
  assert.equal(dataset.summary.totalRegisteredStudents, 2);

  // Inst A avgSuccessPct: (90 + 70) / 2 = 80%
  const rowA = dataset.rows.find((r) => r.institutionId === instA.id)!;
  assert.equal(rowA.avgSuccessPct, 80);
  assert.equal(rowA.avgNet, 16);
  assert.equal(rowA.sourceCounts.kurum, 1);
  assert.equal(rowA.sourceCounts.odullu, 1);
  assert.equal(rowA.band, 'high');

  // Inst B avgSuccessPct: 11/20 = 55%
  const rowB = dataset.rows.find((r) => r.institutionId === instB.id)!;
  assert.equal(rowB.avgSuccessPct, 55);
  assert.equal(rowB.sourceCounts.farkliYayin, 1);
  assert.equal(rowB.band, 'mid');

  // Inst C derived from weekly: (34 - 8/3)/50 = 31.33 / 50 = 62.66% -> 63%
  const rowC = dataset.rows.find((r) => r.institutionId === instC.id)!;
  assert.equal(rowC.avgSuccessPct, 63);
  assert.equal(dataset.summary.topInstitution?.institutionId, instA.id);
  assert.equal(dataset.summary.successSpreadPct, 80 - 55);

  // Source filter works cleanly
  const onlyOdullu = buildInstitutionSuccessDistribution({
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: instA.id,
    examHistoryByInst,
    weeklyEntriesByInst,
    students,
    gradeProfile: grade5,
    penaltyDivisor: 3,
    sourceFilter: 'odullu',
    includeEmptyInstitutions: false,
  });

  assert.equal(onlyOdullu.chartRows.length, 1);
  assert.equal(onlyOdullu.chartRows[0].institutionId, instA.id);
  assert.equal(onlyOdullu.chartRows[0].avgSuccessPct, 70);
});
