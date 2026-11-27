import assert from 'node:assert/strict';
import test from 'node:test';
import { getGradeProfile } from '../data/curriculum';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  parseAnswerString,
} from './examAnalysis';
import { buildDetailedSubjectComparison, shortenSubjectName } from './subjectBreakdown';

test('buildDetailedSubjectComparison compares student net vs class average and surfaces weak subjects', () => {
  const profile = getGradeProfile('8');
  const questions = buildAutoExamQuestions('8', 'dengeli');
  const answerKey = questions.map((q) => q.correctOption);

  // Make first subject strong (100% correct) and second subject weak (mostly wrong)
  const firstSubject = questions[0]?.subject;
  const studentAnswers = questions.map((q) => {
    if (q.subject === firstSubject) return q.correctOption;
    return q.correctOption === 'A' ? 'B' : 'A';
  });

  const soloAnalysis = evaluateOmrExam({
    studentName: 'Kaan Yıldız',
    studentNumber: '20268801',
    classroom: '8-B',
    examTitle: 'LGS Deneme Test',
    gradeId: '8',
    penaltyDivisor: profile.penaltyDivisor,
    studentAnswers,
    answerKey,
    questions,
  });
  const soloBreakdown = buildDetailedSubjectComparison(soloAnalysis);
  assert.equal(soloBreakdown.items.every((i) => i.netDelta === 0), true);
  assert.ok(soloBreakdown.weakSubjects.length >= 1);

  const analysis = evaluateOmrExam({
    studentName: 'Kaan Yıldız',
    studentNumber: '20268801',
    classroom: '8-B',
    examTitle: 'LGS Deneme Test',
    gradeId: '8',
    penaltyDivisor: profile.penaltyDivisor,
    studentAnswers,
    answerKey,
    questions,
    cohortSize: 25,
  });

  const breakdown = buildDetailedSubjectComparison(analysis);
  assert.equal(breakdown.items.length, analysis.subjectMetrics.length);
  assert.ok(breakdown.weakSubjects.length >= 1);
  assert.ok(breakdown.strongSubjects.some((s) => s.subject === firstSubject));
  assert.ok(breakdown.weakestGapSubject);
  assert.ok(breakdown.weakestGapSubject.netDelta < 0);
  assert.equal(breakdown.weakestGapSubject.isWeak, true);
});

test('shortenSubjectName maps long Turkish subject titles cleanly', () => {
  assert.equal(shortenSubjectName('Fen Bilimleri'), 'Fen Bil.');
  assert.equal(shortenSubjectName('Matematik'), 'Matematik');
});

test('parseAnswerString safely returns null for bracketed multi-marks without shifting indices', () => {
  const parsed = parseAnswerString('A[BC]D-E', 5, 5);
  assert.deepEqual(parsed, ['A', null, 'D', null, 'E']);

  const parsedNumbered = parseAnswerString('1-A 2-BC 3-D', 3, 4);
  assert.deepEqual(parsedNumbered, ['A', null, 'D']);
});
