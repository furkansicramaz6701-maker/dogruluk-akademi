import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  generateSampleOmrPair,
  inspectQrAndStudentMatch,
  parseAnswerString,
  parseAnswerStringWithQrPreCheck,
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

  // Consecutive exam sets must not reuse the same questions
  const set1 = buildAutoExamQuestions('5', 'dengeli', 20, 'Matematik', { variantSeed: 0 });
  const set2 = buildAutoExamQuestions('5', 'dengeli', 20, 'Matematik', {
    variantSeed: 1,
    excludeStems: set1.map((q) => q.stem),
  });
  const set3 = buildAutoExamQuestions('5', 'dengeli', 20, 'Matematik', {
    variantSeed: 2,
    excludeStems: [...set1, ...set2].map((q) => q.stem),
  });
  const stems1 = new Set(set1.map((q) => q.stem));
  const stems2 = new Set(set2.map((q) => q.stem));
  for (const q of set2) {
    assert.ok(!stems1.has(q.stem), 'Set 2 must not repeat stems from Set 1');
  }
  for (const q of set3) {
    assert.ok(!stems1.has(q.stem) && !stems2.has(q.stem), 'Set 3 must not repeat stems from Set 1 or 2');
  }
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

test('parseAnswerString isolates subject sections, strips QR tags, and handles 1) A delimiters without shifting', () => {
  const multiSubject =
    'QR:https://dogruluk-akademi.vercel.app/?tab=reports&stu=48192034 Türkçe: 1) A 2) B 3) C Matematik: 1) D 2) A 3) B 4) C';
  const mathParsed = parseAnswerString(multiSubject, 4, 4, { subjectName: 'Matematik' });
  assert.deepEqual(mathParsed, ['D', 'A', 'B', 'C']);

  const compactWithHeader = 'Matematik\nABCDABCD';
  assert.deepEqual(parseAnswerString(compactWithHeader, 8, 4), [
    'A',
    'B',
    'C',
    'D',
    'A',
    'B',
    'C',
    'D',
  ]);
});

test('evaluateOmrExam locks Booklet A to column A key without column shift even when B key differs or extra chars exist', () => {
  const questions = buildAutoExamQuestions('7', 'dengeli', 12, 'Matematik');
  const keyA = 'ABCDABCDABCD';
  const keyB = 'DDDDCCCCBBBB';

  const result = evaluateOmrExam({
    studentName: 'Alihan Sarı',
    studentNumber: '48192034',
    classroom: '7-A',
    examTitle: '7. Sınıf Matematik 12 Soru',
    gradeId: '7',
    penaltyDivisor: 3,
    studentAnswers: parseAnswerString('ABCDABCDABCD', 12, 4),
    answerKey: parseAnswerString(keyB, 12, 4), // even if fallback raw differed, A booklet locks to column A
    questions,
    bookletCode: 'A',
    bookletAnswerKeys: { A: keyA, B: keyB },
    enforceQuestionBounds: true,
  });

  assert.equal(result.totalQuestions, 12);
  assert.equal(result.totalCorrect, 12);
  assert.equal(result.totalNet, 12);
  assert.ok(result.columnAlignment);
  assert.equal(result.columnAlignment.bookletCode, 'A');
  assert.equal(result.columnAlignment.matchedKeyColumn, 'A');
  assert.equal(result.columnAlignment.hasColumnShift, false);
});

test('parseAnswerStringWithQrPreCheck detects QR student match, mismatch, and extracts subject-scoped answers', () => {
  const students = [
    {
      id: 'stu-1',
      fullName: 'Alihan Sarı',
      studentNumber8: '48192034',
      institutionId: 'inst-1',
      institutionCode8: '81767119',
      institutionName: 'Doğruluk Akademi',
      classroom: '7-A',
      gradeId: '7' as const,
      createdAt: '2026-10-01',
    },
    {
      id: 'stu-2',
      fullName: 'Zeynep Kaya',
      studentNumber8: '48192099',
      institutionId: 'inst-1',
      institutionCode8: '81767119',
      institutionName: 'Doğruluk Akademi',
      classroom: '7-A',
      gradeId: '7' as const,
      createdAt: '2026-10-01',
    },
  ];

  const qrRaw =
    'QR:https://dogruluk-akademi.vercel.app/?tab=reports&stu=48192034&inst=81767119 Türkçe: 1-A 2-B Matematik: 1-C 2-D 3-A 4-B';

  const matched = parseAnswerStringWithQrPreCheck(qrRaw, 4, 4, {
    subjectName: 'Matematik',
    students,
    expectedInstitutionCode: '81767119',
    expectedStudentNumber: '48192034',
    expectedStudentName: 'Alihan Sarı',
  });
  assert.equal(matched.preCheck.status, 'matched');
  assert.equal(matched.preCheck.studentMismatch, false);
  assert.equal(matched.preCheck.matchedStudentNumber, '48192034');
  assert.equal(matched.preCheck.extractedSubjectName, 'Matematik');
  assert.deepEqual(matched.answers, ['C', 'D', 'A', 'B']);

  const mismatched = inspectQrAndStudentMatch(qrRaw, {
    subjectName: 'Matematik',
    students,
    expectedInstitutionCode: '81767119',
    expectedStudentNumber: '48192099',
    expectedStudentName: 'Zeynep Kaya',
  });
  assert.equal(mismatched.status, 'mismatch');
  assert.equal(mismatched.studentMismatch, true);
  assert.equal(mismatched.matchedStudentId, 'stu-1');
  assert.equal(mismatched.matchedStudentName, 'Alihan Sarı');
  assert.equal(mismatched.extractedSubjectName, 'Matematik');
});

test('evaluateOmrExam produces 1. Deneme (İlk Kayıt) and zero fake cohort sizes for solo live evaluation', () => {
  const qs = buildAutoExamQuestions('7', 'dengeli', 12, 'Matematik');
  const key = qs.map((q) => q.correctOption);
  const stu: (string | null)[] = [...key.slice(0, 10), 'B', null];
  const res = evaluateOmrExam({
    studentName: 'Alihan Sarı',
    studentNumber: '48192034',
    classroom: '7-A',
    examTitle: 'Matematik 12 Soruluk İlk Tarama',
    gradeId: '7',
    penaltyDivisor: 3,
    studentAnswers: stu,
    answerKey: key,
    questions: qs,
  });

  assert.equal(res.historicalTrend.length, 1);
  assert.equal(res.historicalTrend[0].examName, '1. Deneme (İlk Kayıt)');
  assert.equal(res.classSize, 1);
  assert.equal(res.academySize, 1);
  assert.equal(res.classRank, 1);
  assert.equal(res.academyRank, 1);
});

