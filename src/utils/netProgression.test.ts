import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import { buildGradeNetProgression } from './netProgression';
import { StudentRecord } from '../types/academy';

test('buildGradeNetProgression computes grade-scaled institution and Turkey averages without TYT leaks', () => {
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
  for (const pt of ds.points) {
    assert.ok(pt.institutionAvgNet > 0 && pt.institutionAvgNet <= 70);
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
