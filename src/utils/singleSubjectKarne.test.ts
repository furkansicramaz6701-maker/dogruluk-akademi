import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { ExamQuestion } from '../types/academy';
import { evaluateOmrExam } from './examAnalysis';
import {
  buildScopedExamQuestions,
  buildSingleSubjectKarneSummary,
  isSingleSubjectAnalysis,
  resolveOpticalSheetLayoutConfig,
} from './singleSubjectKarne';

function buildFixtureExamQuestions(gradeId: '7' | '8' = '7'): ExamQuestion[] {
  const profile = getGradeProfile(gradeId);
  const letters = profile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const list: ExamQuestion[] = [];
  let cursor = 1;
  for (const subj of profile.subjects) {
    for (let i = 0; i < subj.questionCount; i++) {
      const topic = subj.topics[i % Math.max(1, subj.topics.length)] || subj.name;
      list.push({
        id: `${subj.id}-${cursor}`,
        number: cursor,
        subject: subj.name,
        topic,
        gainCode: `${gradeId}.${subj.id.toUpperCase()}.${i + 1}`,
        difficulty: i % 3 === 0 ? 'Kolay' : i % 3 === 1 ? 'Orta' : 'Zor',
        stem: `${subj.name} — ${topic} (${i + 1})`,
        options: Object.fromEntries(letters.map((l) => [l, `${l} seçeneği`])),
        correctOption: letters[cursor % letters.length],
        explanation: `${topic} açıklaması`,
        source: 'Müfredat Havuzu',
      });
      cursor++;
    }
  }
  return list;
}

test('buildScopedExamQuestions creates exact 12 or 25 Matematik questions strictly for Matematik', () => {
  const profile = getGradeProfile('7');
  const fullQuestions = buildFixtureExamQuestions('7');
  const mat12 = buildScopedExamQuestions({
    questions: fullQuestions,
    gradeProfile: profile,
    subjectScopeId: 'matematik',
    questionCount: 12,
  });
  assert.equal(mat12.length, 12);
  assert.ok(mat12.every((q) => q.subject === 'Matematik'));
  assert.deepEqual(
    mat12.map((q) => q.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  );

  const mat25 = buildScopedExamQuestions({
    questions: fullQuestions,
    gradeProfile: profile,
    subjectScopeId: 'matematik',
    questionCount: 25,
  });
  assert.equal(mat25.length, 25);
  assert.ok(mat25.every((q) => q.subject === 'Matematik'));
  assert.equal(mat25[24].number, 25);
});

test('resolveOpticalSheetLayoutConfig builds 1 column for 12-question Matematik and 2 columns for 16-20 questions', () => {
  const profile = getGradeProfile('7');

  const layout12 = resolveOpticalSheetLayoutConfig({
    totalQuestions: 12,
    gradeProfile: profile,
    selectedSubjectId: 'matematik',
  });
  assert.equal(layout12.isSingleSubject, true);
  assert.equal(layout12.selectedSubjectName, 'Matematik');
  assert.equal(layout12.numCols, 1);
  assert.equal(layout12.rowsPerCol, 12);
  assert.equal(layout12.columns[0].title, 'MATEMATİK (1–12)');

  const layout20 = resolveOpticalSheetLayoutConfig({
    totalQuestions: 20,
    gradeProfile: profile,
    selectedSubjectId: 'matematik',
  });
  assert.equal(layout20.isSingleSubject, true);
  assert.equal(layout20.numCols, 2);
  assert.equal(layout20.rowsPerCol, 10);
  assert.equal(layout20.columns[0].title, 'MATEMATİK (1–10)');
  assert.equal(layout20.columns[1].title, 'MATEMATİK (11–20)');
});

test('buildSingleSubjectKarneSummary produces single-subject report insights for 16-question Matematik exam', () => {
  const profile = getGradeProfile('7');
  const fullQuestions = buildFixtureExamQuestions('7');
  const mat16 = buildScopedExamQuestions({
    questions: fullQuestions,
    gradeProfile: profile,
    subjectScopeId: 'matematik',
    questionCount: 16,
  });

  const keyArr = mat16.map((q) => q.correctOption);
  const stuArr = mat16.map((q, idx) => (idx < 12 ? q.correctOption : idx < 14 ? 'D' : null));

  const analysis = evaluateOmrExam({
    studentName: 'Alihan Sarı',
    studentNumber: '48192034',
    classroom: '7-A',
    examTitle: '7. Sınıf Matematik 16 Soruluk Tarama',
    gradeId: '7',
    penaltyDivisor: 3,
    studentAnswers: stuArr,
    answerKey: keyArr,
    questions: mat16,
  });

  assert.equal(isSingleSubjectAnalysis(analysis), true);
  const summary = buildSingleSubjectKarneSummary(analysis);
  assert.ok(summary);
  assert.equal(summary.subjectMetric.subject, 'Matematik');
  assert.equal(summary.subjectMetric.total, 16);
  assert.ok(summary.priorityTopics.length >= 1);
  assert.match(summary.coachingNote, /Matematik/);
});
