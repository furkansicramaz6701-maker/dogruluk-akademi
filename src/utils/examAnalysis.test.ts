import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  generateSampleOmrPair,
  parseAnswerString,
} from './examAnalysis';
import {
  generate8DigitInstitutionCode,
  generate8DigitStudentNumber,
} from './institutionCodes';

test('parseAnswerString parses compact, numbered, and blank tokens accurately', () => {
  const compact = parseAnswerString('ABC-DE', 6, 5);
  assert.deepEqual(compact, ['A', 'B', 'C', null, 'D', 'E']);

  const numbered = parseAnswerString('1-A, 2:C, 3.Boş, 4-D', 4, 4);
  assert.deepEqual(numbered, ['A', 'C', null, 'D']);

  // 4-option exam strips 'E' as invalid/null
  const fourOpt = parseAnswerString('ABDE', 4, 4);
  assert.deepEqual(fourOpt, ['A', 'B', 'D', null]);
});

test('buildAutoExamQuestions generates exact 120 realistic questions for TYT and valid counts for grades 3-8', () => {
  const tytQuestions = buildAutoExamQuestions('TYT', 'dengeli', 120);
  assert.equal(tytQuestions.length, 120);
  assert.equal(tytQuestions[0].number, 1);
  assert.equal(tytQuestions[119].number, 120);
  assert.ok(!tytQuestions[0].stem.includes('aşağıdakilerden hangisi kesinlikle doğrudur? (Soru 1)'));
  assert.ok(!tytQuestions[0].options.A.includes('yaygın çeldirici yargı'));

  const grade3Questions = buildAutoExamQuestions('3', 'kolay');
  assert.equal(grade3Questions.length, 50);
  assert.equal(Object.keys(grade3Questions[0].options).length, 4);
});

test('evaluateOmrExam applies 4-wrong-1-right and 3-wrong-1-right rules correctly', () => {
  const questions = buildAutoExamQuestions('TYT', 'dengeli', 120);
  const key = questions.map((q) => q.correctOption);

  // 80 correct, 16 wrong, 24 blank => Net = 80 - (16 / 4) = 76.00
  const student = key.map((ans, idx) => {
    if (idx < 80) return ans;
    if (idx < 96) return ans === 'A' ? 'B' : 'A';
    return null;
  });

  const res4 = evaluateOmrExam({
    studentName: 'Test Öğrenci',
    studentNumber: '101',
    classroom: '12-A',
    examTitle: 'TYT Deneme',
    gradeId: 'TYT',
    penaltyDivisor: 4,
    studentAnswers: student,
    answerKey: key,
    questions,
  });

  assert.equal(res4.totalCorrect, 80);
  assert.equal(res4.totalWrong, 16);
  assert.equal(res4.totalBlank, 24);
  assert.equal(res4.totalNet, 76);
  assert.ok(res4.subjectMetrics.length >= 4);
  assert.ok(res4.topicGaps.length > 0);
  assert.equal(res4.difficultyMetrics.length, 3);

  // 3-wrong-1-right rule: 30 correct, 9 wrong => Net = 30 - 3 = 27
  const g5Questions = buildAutoExamQuestions('5', 'dengeli');
  const g5Key = g5Questions.map((q) => q.correctOption);
  const g5Student = g5Key.map((ans, idx) => {
    if (idx < 30) return ans;
    if (idx < 39) return ans === 'A' ? 'B' : 'A';
    return null;
  });

  const res3 = evaluateOmrExam({
    studentName: 'Ali',
    studentNumber: '502',
    classroom: '5-B',
    examTitle: '5. Sınıf Deneme',
    gradeId: '5',
    penaltyDivisor: 3,
    studentAnswers: g5Student,
    answerKey: g5Key,
    questions: g5Questions,
  });

  assert.equal(res3.totalNet, 27);
});

test('generateSampleOmrPair produces matching length strings', () => {
  const qs = buildAutoExamQuestions('8', 'dengeli');
  const { studentString, keyString } = generateSampleOmrPair(qs, 0.75);
  assert.equal(studentString.length, qs.length);
  assert.equal(keyString.length, qs.length);
});

test('8-digit institution code and student number generate deterministically without collisions', () => {
  const instCode = generate8DigitInstitutionCode('Doğruluk Akademi Merkez');
  assert.match(instCode, /^\d{8}$/);

  const stuCode = generate8DigitStudentNumber('Alihan Sarı', instCode);
  assert.match(stuCode, /^\d{8}$/);
  assert.equal(stuCode.slice(0, 2), instCode.slice(0, 2));

  const collisionAvoided = generate8DigitStudentNumber(
    'Alihan Sarı',
    instCode,
    new Set([stuCode])
  );
  assert.match(collisionAvoided, /^\d{8}$/);
  assert.notEqual(collisionAvoided, stuCode);
});
