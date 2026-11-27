import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeOmrResponseValidation,
  buildErrorReportCsvContent,
  countDistinctErrorRows,
  formatErrorReportClipboardText,
  inspectAnswerStringReadability,
  validateManualOmrInputs,
  validateStudentNumberField,
} from './omrValidation';

test('validateStudentNumberField accepts empty or 8-digit numbers and rejects invalid ones', () => {
  assert.equal(validateStudentNumberField('').valid, true);
  assert.equal(validateStudentNumberField('20265018').valid, true);

  const shortNo = validateStudentNumberField('12345');
  assert.equal(shortNo.valid, false);
  assert.ok(shortNo.reason?.includes('5 haneli'));

  const alphaNo = validateStudentNumberField('2026AB18');
  assert.equal(alphaNo.valid, false);
  assert.ok(alphaNo.reason?.includes('harf'));
});

test('inspectAnswerStringReadability catches unreadable characters and E option on 4-option exams', () => {
  assert.equal(inspectAnswerStringReadability('ABCD-ABCD', 4), null);
  assert.equal(inspectAnswerStringReadability('1-A 2-B 3-C 4-D', 4), null);
  assert.equal(inspectAnswerStringReadability('ABCDE', 5), null);

  const eOn4 = inspectAnswerStringReadability('ABCDE', 4);
  assert.ok(eOn4);
  assert.equal(eOn4.category, 'invalid-option');

  const unreadable = inspectAnswerStringReadability('AB?X-OKUNAMADI', 4);
  assert.ok(unreadable);
  assert.equal(unreadable.category, 'unreadable-answers');

  const allBlanks = inspectAnswerStringReadability('------', 4);
  assert.ok(allBlanks);
  assert.equal(allBlanks.readableCount, 0);
});

test('validateManualOmrInputs reports exact line numbers for invalid student numbers and unreadable rows', () => {
  const report = validateManualOmrInputs({
    sourceName: 'optik-toplu.txt',
    studentName: 'Elif Demir',
    studentNumber: '20265',
    studentAnswersRaw: ['ABCDABCD', '99;AB?X', '12345;ABCDE'].join('\n'),
    answerKeyRaw: 'ABCDABCD',
    optionCount: 4,
    validateAnswerKey: true,
  });

  assert.ok(report.errors.some((e) => e.category === 'invalid-student-number' && e.rowNumber === 1));
  assert.ok(report.errors.some((e) => e.rowNumber === 2 && e.category === 'invalid-student-number'));
  assert.ok(report.errors.some((e) => e.rowNumber === 2 && e.category === 'unreadable-answers'));
  assert.ok(report.errors.some((e) => e.rowNumber === 3 && e.category === 'invalid-student-number'));
  assert.ok(report.errors.some((e) => e.rowNumber === 3 && e.category === 'invalid-option'));
  assert.equal(countDistinctErrorRows(report.errors), 3);

  const csv = buildErrorReportCsvContent(report);
  assert.ok(csv.includes('Satır'));
  assert.ok(csv.includes('Geçersiz Öğrenci No'));

  const text = formatErrorReportClipboardText(report);
  assert.ok(text.includes('Satır #2'));
});

test('analyzeOmrResponseValidation detects Empty Bubbles, Multiple Marks, and clean readiness', () => {
  // 1. Clean response matching expectedCount
  const clean = analyzeOmrResponseValidation({
    studentNumber: '20265018',
    studentAnswersRaw: 'ABCDABCDAB',
    answerKeyRaw: 'ABCDABCDAB',
    expectedCount: 10,
    optionCount: 4,
  });
  assert.equal(clean.severity, 'ok');
  assert.equal(clean.validCount, 10);
  assert.equal(clean.emptyBubbleCount, 0);
  assert.equal(clean.multipleMarkCount, 0);

  // 2. Empty bubbles (explicit '-' + trailing unmarked questions) -> warning severity
  const withEmpties = analyzeOmrResponseValidation({
    studentNumber: '20265018',
    studentAnswersRaw: 'AB-D*A--',
    answerKeyRaw: 'ABCDABCDAB',
    expectedCount: 10,
    optionCount: 4,
  });
  assert.equal(withEmpties.severity, 'warning');
  assert.equal(withEmpties.explicitEmptyCount, 4);
  assert.equal(withEmpties.unmarkedTrailingCount, 2);
  assert.equal(withEmpties.emptyBubbleCount, 6);
  assert.ok(withEmpties.warnings.some((w) => w.type === 'empty-bubbles'));

  // 3. Multiple Marks in numbered format and bracketed compact format -> error severity
  const withNumberedMulti = analyzeOmrResponseValidation({
    studentNumber: '20265018',
    studentAnswersRaw: '1-A 2-AB 3-C/D 4-[BD] 5--',
    answerKeyRaw: 'ABCDE',
    expectedCount: 5,
    optionCount: 4,
  });
  assert.equal(withNumberedMulti.severity, 'error');
  assert.equal(withNumberedMulti.multipleMarkCount, 3);
  assert.deepEqual(
    withNumberedMulti.multipleMarkItems.map((i) => i.questionNumber),
    [2, 3, 4]
  );
  assert.equal(withNumberedMulti.emptyBubbleCount, 1);

  const withCompactBracketMulti = analyzeOmrResponseValidation({
    studentNumber: '20265018',
    studentAnswersRaw: 'A[BC]D-E',
    answerKeyRaw: 'ABCDE',
    expectedCount: 5,
    optionCount: 5,
  });
  assert.equal(withCompactBracketMulti.severity, 'error');
  assert.equal(withCompactBracketMulti.multipleMarkCount, 1);
  assert.equal(withCompactBracketMulti.multipleMarkItems[0].questionNumber, 2);
  assert.equal(withCompactBracketMulti.explicitEmptyCount, 1);
});

test('analyzeOmrResponseValidation & validateManualOmrInputs isolate selected subjectName and strip QR metadata', () => {
  const multiSubjectQr =
    'QR:https://dogruluk-akademi.vercel.app/?tab=reports&stu=31058545&inst=31570113 Türkçe: 1-D 2-D Matematik: 1-A 2-B 3-C 4-D 5-A 6-B 7-C 8-D 9-A 10-B 11-A 12-D';
  const summary = analyzeOmrResponseValidation({
    studentNumber: '31058545',
    studentAnswersRaw: multiSubjectQr,
    answerKeyRaw: 'ABCDABCDABCD',
    expectedCount: 12,
    optionCount: 4,
    subjectName: 'Matematik',
  });

  assert.equal(summary.severity, 'ok');
  assert.equal(summary.validCount, 12);
  assert.equal(summary.scannedCount, 12);
  assert.equal(summary.emptyBubbleCount, 0);

  const manualReport = validateManualOmrInputs({
    sourceName: 'Manuel Optik Girişi',
    studentName: 'Zeynep Kaya',
    studentNumber: '31058545',
    studentAnswersRaw: multiSubjectQr,
    answerKeyRaw: 'ABCDABCDABCD',
    optionCount: 4,
    requireStudentAnswers: true,
    validateAnswerKey: true,
    subjectName: 'Matematik',
  });
  assert.equal(manualReport.errors.length, 0);
});


