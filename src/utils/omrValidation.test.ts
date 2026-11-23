import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
