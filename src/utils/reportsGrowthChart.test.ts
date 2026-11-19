import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { buildAutoExamQuestions, evaluateOmrExam } from './examAnalysis';
import { buildStudentGrowthChartData } from './reportsGrowthChart';

test('buildStudentGrowthChartData generates 6 checkpoints in donemlik mode and 10 months in yillik mode without TYT leaks', () => {
  const grade5 = getGradeProfile('5');
  const questions5 = buildAutoExamQuestions('5');
  const totalQ5 = questions5.length;
  const answerKey = questions5.map((q) => q.correctOption);
  const studentAnswers = answerKey.map((ans, i) => (i % 5 === 0 ? null : ans));

  const analysis = evaluateOmrExam({
    gradeId: '5',
    penaltyDivisor: 3,
    studentName: 'Zeynep Kaya',
    studentNumber: '512',
    classroom: '5-A',
    examTitle: '5. Sınıf Kurumsal Deneme 2',
    questions: questions5,
    answerKey,
    studentAnswers,
  });

  const termData = buildStudentGrowthChartData({
    analysis,
    gradeProfile: grade5,
    hasLiveAnalysis: true,
    periodMode: 'donemlik',
    metricMode: 'net',
  });

  assert.equal(termData.checkpoints.length, 6);
  assert.equal(termData.isLiveData, true);
  assert.equal(termData.subjectBreakdown.length, grade5.subjects.length);
  for (const pt of termData.checkpoints) {
    assert.ok(!/\b(TYT|AYT|YKS)\b/i.test(pt.examName), `Unexpected leak in ${pt.examName}`);
    assert.ok(pt.studentNet >= 0 && pt.studentNet <= totalQ5);
  }

  const annualData = buildStudentGrowthChartData({
    analysis,
    gradeProfile: grade5,
    hasLiveAnalysis: true,
    periodMode: 'yillik',
    metricMode: 'score',
  });

  assert.equal(annualData.checkpoints.length, 10);
  assert.equal(annualData.checkpoints[0].label, 'Eylül');
  assert.equal(annualData.checkpoints[9].label, 'Haziran');
  assert.ok(annualData.summary.peakScore >= annualData.summary.latestScore);
});

test('buildStudentGrowthChartData starts cleanly at zero before any live OMR or open-ended evaluation', () => {
  const grade8 = getGradeProfile('8');
  const questions8 = buildAutoExamQuestions('8');
  const emptyAnalysis = evaluateOmrExam({
    gradeId: '8',
    penaltyDivisor: 3,
    studentName: 'Öğrenci',
    studentNumber: '801',
    classroom: '8-A',
    examTitle: '8. Sınıf LGS Deneme',
    questions: questions8,
    answerKey: questions8.map((q) => q.correctOption),
    studentAnswers: questions8.map(() => null),
  });

  const previewData = buildStudentGrowthChartData({
    analysis: emptyAnalysis,
    gradeProfile: grade8,
    hasLiveAnalysis: false,
    periodMode: 'donemlik',
    metricMode: 'net',
  });

  assert.equal(previewData.isLiveData, false);
  assert.equal(previewData.summary.latestNet, 0);
  assert.equal(previewData.summary.latestScore, 0);
  assert.equal(previewData.summary.growthNet, 0);
  assert.equal(previewData.summary.targetAttainmentPct, 0);
  for (const subj of previewData.subjectBreakdown) {
    assert.equal(subj.net, 0);
    assert.equal(subj.accuracyPct, 0);
  }
});
