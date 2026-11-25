import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutoExamQuestions, evaluateOmrExam } from './examAnalysis';
import {
  buildMultiExamComparativeDataset,
  selectMultiExamChartSeries,
} from './multiExamComparative';

test('buildMultiExamComparativeDataset anchors Exam 5 to active subject metrics', () => {
  const questions = buildAutoExamQuestions('8', 'dengeli', 40);
  const key = questions.map((q) => q.correctOption);
  const stuChars = [...key];
  stuChars[20] = stuChars[20] === 'A' ? 'B' : 'A';
  stuChars[21] = stuChars[21] === 'A' ? 'C' : 'A';

  const analysis = evaluateOmrExam({
    questions,
    studentAnswers: stuChars,
    answerKey: key,
    gradeId: '8',
    penaltyDivisor: 3,
    studentName: 'Talha Tayfur',
    studentNumber: '48291003',
    classroom: '8-A',
    examTitle: 'LGS Deneme 5',
  });

  const dataset = buildMultiExamComparativeDataset({
    analysis,
    hasLiveAnalysis: true,
  });

  assert.equal(dataset.examPoints.length, 5);
  assert.ok(dataset.subjectOptions.includes('Matematik'));

  const lastExam = dataset.examPoints[4];
  const mathSpec = analysis.subjectMetrics.find((s) => s.subject === 'Matematik');
  assert.ok(mathSpec);
  assert.equal(lastExam.bySubject['Matematik'].studentNet, Number(mathSpec.net.toFixed(2)));
  assert.equal(
    lastExam.bySubject['Matematik'].classAvgNet,
    Number(mathSpec.classAvgNet.toFixed(2))
  );

  const mathSeries = selectMultiExamChartSeries(dataset, 'Matematik', 'net');
  assert.equal(mathSeries.points.length, 5);
  assert.equal(mathSeries.latestStudentValue, Number(mathSpec.net.toFixed(2)));
  assert.equal(mathSeries.latestClassAvgValue, Number(mathSpec.classAvgNet.toFixed(2)));
});
