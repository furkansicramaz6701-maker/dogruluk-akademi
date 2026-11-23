import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { getGradeProfile } from '../data/curriculum';
import {
  computeExternalPublisherKeyHealth,
  DEFAULT_EXTERNAL_PUBLISHER_PRESETS,
  deletePublisherPreset,
  parsePublisherAnswerKeysSpreadsheet,
  upsertPublisherPreset,
} from './externalPublisherLibrary';

test('upsertPublisherPreset creates and updates saved external publisher profiles', () => {
  const created = upsertPublisherPreset(DEFAULT_EXTERNAL_PUBLISHER_PRESETS, {
    publisherName: 'Kr Akademi',
    examTitle: '5 Aralık Cumartesi Kamp Denemesi',
    examDate: '05.12.2026',
    gradeId: '5',
    optionCount: 4,
    questionCount: 70,
    bookletMode: 'AB',
    answerKeys: {
      A: 'ABCD'.repeat(17) + 'AB',
      B: 'DCBA'.repeat(17) + 'DC',
      C: '',
      D: '',
    },
  });

  assert.equal(created.saved.publisherName, 'Kr Akademi');
  assert.equal(created.saved.bookletMode, 'AB');
  assert.equal(created.list.length, DEFAULT_EXTERNAL_PUBLISHER_PRESETS.length + 1);

  const updated = upsertPublisherPreset(created.list, {
    ...created.saved,
    examTitle: 'Kr Akademi Güncel Deneme',
  });
  assert.equal(updated.list.length, created.list.length);
  assert.equal(updated.saved.examTitle, 'Kr Akademi Güncel Deneme');

  const afterDelete = deletePublisherPreset(updated.list, created.saved.id);
  assert.equal(afterDelete.length, DEFAULT_EXTERNAL_PUBLISHER_PRESETS.length);
});

test('parsePublisherAnswerKeysSpreadsheet parses question-grid and derives missing keys', () => {
  const rows = [
    { SoruNo: 1, Ders: 'Türkçe', A: 'A', B: 'C', Yayın: 'Özdebir' },
    { SoruNo: 2, Ders: 'Türkçe', A: 'B', B: 'D', Yayın: 'Özdebir' },
    { SoruNo: 3, Ders: 'Türkçe', A: 'C', B: 'A', Yayın: 'Özdebir' },
    { SoruNo: 4, Ders: 'Türkçe', A: 'D', B: 'B', Yayın: 'Özdebir' },
    { SoruNo: 5, Ders: 'Matematik', A: 'A', B: 'D', Yayın: 'Özdebir' },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Anahtar');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  const parsed = parsePublisherAnswerKeysSpreadsheet(buf, {
    optionCount: 4,
    autoDeriveMissing: true,
  });

  assert.equal(parsed.publisherName, 'Özdebir');
  assert.equal(parsed.answerKeys.A, 'ABCDA');
  assert.equal(parsed.answerKeys.B, 'CDABD');
  assert.ok(parsed.detectedBooklets.includes('A'));
  assert.ok(parsed.detectedBooklets.includes('B'));
});

test('computeExternalPublisherKeyHealth breaks down subjects and flags invalid options', () => {
  const grade5 = getGradeProfile('5');
  const fullKey = 'ABCD'.repeat(17) + 'AB'; // 70 chars
  const healthy = computeExternalPublisherKeyHealth({
    bookletCode: 'A',
    rawKey: fullKey,
    gradeProfile: grade5,
    expectedQuestionCount: 70,
  });
  assert.equal(healthy.enteredCount, 70);
  assert.equal(healthy.expectedCount, 70);
  assert.equal(healthy.isComplete, true);
  assert.equal(healthy.invalidCount, 0);
  assert.ok(healthy.subjectBreakdown.every((s) => s.status === 'tam'));

  const withInvalid = computeExternalPublisherKeyHealth({
    bookletCode: 'B',
    rawKey: 'ABCDEABCDE',
    gradeProfile: grade5,
    expectedQuestionCount: 70,
  });
  assert.equal(withInvalid.isComplete, false);
  assert.equal(withInvalid.invalidCount, 2); // Two 'E' options on a 4-option exam
});
