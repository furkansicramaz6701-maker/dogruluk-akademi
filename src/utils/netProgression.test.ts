import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import { buildGradeNetProgression } from './netProgression';
import { StudentRecord } from '../types/academy';

test('buildGradeNetProgression starts institution averages at zero before any evaluated exam and scales Turkey reference cleanly', () => {
  const g5 = getGradeProfile('5');
  const inst = DEFAULT_INSTITUTIONS[0];

  const ds = buildGradeNetProgression({
    gradeProfile: g5,
    questionCount: 70,
    penaltyDivisor: 3,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
  });

  assert.equal(ds.points.length, 5);
  assert.equal(ds.summary.maxQuestions, 70);
  assert.equal(ds.summary.latestInstitutionNet, 0);
  assert.equal(ds.summary.institutionGrowth, 0);
  assert.equal(ds.summary.institutionVsTurkeyDiff, 0);
  for (const pt of ds.points) {
    assert.equal(pt.institutionAvgNet, 0);
    assert.ok(pt.turkeyAvgNet > 0 && pt.turkeyAvgNet <= 70);
    assert.equal(/\b(TYT|AYT|YKS)\b/i.test(pt.examName), false);
    assert.ok(pt.examName.includes('5. Sınıf'));
  }
  assert.ok(ds.summary.turkeyGrowth > 0);
});

test('buildGradeNetProgression reflects penaltyDivisor = 0 (götürmesiz) and evaluated institution students', () => {
  const g5 = getGradeProfile('5');
  const inst = DEFAULT_INSTITUTIONS[1];

  const withPenalty = buildGradeNetProgression({
    gradeProfile: g5,
    questionCount: 70,
    penaltyDivisor: 3,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
  });

  const withoutPenalty = buildGradeNetProgression({
    gradeProfile: g5,
    questionCount: 70,
    penaltyDivisor: 0,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
  });

  assert.ok(
    withoutPenalty.summary.latestTurkeyNet > withPenalty.summary.latestTurkeyNet
  );

  // With a live evaluated student in grade 5, the final institution point uses measured net
  const perfectKey = 'A'.repeat(70);
  const stuAnswers = 'A'.repeat(60) + 'B'.repeat(10); // Götürmesiz = 60.00 Net
  const students: StudentRecord[] = [
    {
      id: 'st-g5-1',
      fullName: 'Ece Yılmaz',
      studentNumber8: '75000001',
      institutionId: inst.id,
      institutionCode8: inst.code8,
      institutionName: inst.name,
      classroom: '5-A',
      gradeId: '5',
      createdAt: '2026-10-01',
      lastOmrAnswers: stuAnswers,
      lastAnswerKey: perfectKey,
    },
  ];

  const measuredDs = buildGradeNetProgression({
    gradeProfile: g5,
    questionCount: 70,
    penaltyDivisor: 0,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students,
    liveAnalysis: {
      hasLiveAnalysis: true,
      studentName: 'Ece Yılmaz',
      totalNet: 60,
      examTitle: '5. Sınıf Genel Deneme',
    },
  });

  assert.equal(measuredDs.summary.evaluatedStudentCount, 1);
  assert.equal(measuredDs.summary.latestInstitutionNet, 60);
  assert.equal(measuredDs.points[measuredDs.points.length - 1].activeStudentNet, 60);
});

test('buildGradeNetProgression excludes Turkey-wide benchmarks when includeTurkeyBenchmark is false', () => {
  const g5 = getGradeProfile('5');
  const inst = DEFAULT_INSTITUTIONS[0];

  const instOnly = buildGradeNetProgression({
    gradeProfile: g5,
    questionCount: 70,
    penaltyDivisor: 3,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
    includeTurkeyBenchmark: false,
  });

  assert.equal(instOnly.summary.latestInstitutionNet, 0);
  assert.equal(instOnly.summary.latestTurkeyNet, 0);
  assert.equal(instOnly.summary.turkeyGrowth, 0);
  assert.equal(instOnly.summary.institutionVsTurkeyDiff, 0);
  for (const pt of instOnly.points) {
    assert.equal(pt.turkeyAvgNet, 0);
    assert.equal(pt.turkeyDelta, 0);
    assert.equal(pt.vsTurkeyDiff, 0);
    assert.equal(pt.examName.includes('Türkiye'), false);
  }
});

test('buildGradeNetProgression returns zero points when examHistory is empty in live mode and renders 1. Deneme on first record', () => {
  const g7 = getGradeProfile('7');
  const inst = DEFAULT_INSTITUTIONS[0];

  const emptyLive = buildGradeNetProgression({
    gradeProfile: g7,
    questionCount: 12,
    penaltyDivisor: 3,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
    examHistory: [],
    isSamplePreview: false,
  });

  assert.equal(emptyLive.points.length, 0);
  assert.equal(emptyLive.summary.latestInstitutionNet, 0);
  assert.equal(emptyLive.summary.evaluatedStudentCount, 0);

  const firstLive = buildGradeNetProgression({
    gradeProfile: g7,
    questionCount: 12,
    penaltyDivisor: 3,
    institutionId: inst.id,
    institutionCode8: inst.code8,
    students: [],
    examHistory: [
      {
        id: 'rec-1',
        institutionId: inst.id,
        studentId: 'stu-1',
        studentName: 'Alihan Sarı',
        studentNumber8: '48192034',
        classroom: '7-A',
        gradeId: '7',
        examTitle: 'Matematik 12 Soruluk İlk Kayıt',
        examDate: '26.11.2026',
        createdAt: '2026-11-26T10:00:00.000Z',
        totalQuestions: 12,
        totalCorrect: 10,
        totalWrong: 1,
        totalBlank: 1,
        totalNet: 9.67,
        estimatedScore: 422.5,
        maxScore: 500,
        subjectMetrics: [
          {
            subject: 'Matematik',
            total: 12,
            correct: 10,
            wrong: 1,
            blank: 1,
            net: 9.67,
            accuracyPct: 83,
          },
        ],
      },
    ],
    isSamplePreview: false,
  });

  assert.equal(firstLive.points.length, 1);
  assert.equal(firstLive.points[0].shortLabel, '1. İlk Deneme');
  assert.equal(firstLive.summary.latestInstitutionNet, 9.67);
  assert.equal(firstLive.summary.evaluatedStudentCount, 1);
});
