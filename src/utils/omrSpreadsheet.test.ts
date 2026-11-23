import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import {
  buildOmrExcelTemplateBlob,
  deriveBookletAnswerKeysFromBase,
  mergeImportedOmrStudents,
  parseOmrExcelOrCsvBuffer,
} from './omrSpreadsheet';

function workbookToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  return new Uint8Array(arr).buffer;
}

test('parseOmrExcelOrCsvBuffer parses multi-sheet ABCD answer keys and auto-assigns ABCD to registered students', () => {
  const wb = XLSX.utils.book_new();
  const keysWs = XLSX.utils.json_to_sheet([
    { 'Kitapçık': 'A', 'Cevap Anahtarı': 'ABCDABCDAB' },
    { 'Kitapçık': 'B', 'Cevap Anahtarı': 'BCDABCDABC' },
    { 'Kitapçık': 'C', 'Cevap Anahtarı': 'CDABCDABCD' },
    { 'Kitapçık': 'D', 'Cevap Anahtarı': 'DABCDABCDA' },
  ]);
  const stuWs = XLSX.utils.json_to_sheet([
    { 'Adı Soyadı': 'Alihan Sarı', 'Şube': '5-A', 'Kitapçık': '', 'Öğrenci Cevapları': 'ABCD-BCDAB' },
    { 'Adı Soyadı': 'Zeynep Karahan', 'Şube': '5-A', 'Kitapçık': '', 'Öğrenci Cevapları': 'BCDABCDA-C' },
    { 'Adı Soyadı': 'Talha Tekin', 'Şube': '5-B', 'Kitapçık': 'D', 'Öğrenci Cevapları': 'DABCDABCDA' },
  ]);
  XLSX.utils.book_append_sheet(wb, keysWs, 'Anahtarlar');
  XLSX.utils.book_append_sheet(wb, stuWs, 'Ogrenciler');

  const inst = DEFAULT_INSTITUTIONS[0];
  const parsed = parseOmrExcelOrCsvBuffer(workbookToArrayBuffer(wb), {
    expectedCount: 10,
    optionCount: 4,
    activeBookletCode: 'A',
    fallbackGradeId: '5',
    institution: inst,
    existingStudents: [],
  });

  assert.equal(parsed.hasExplicitMultiBookletKeys, true);
  assert.equal(parsed.answerKeysByBooklet.A, 'ABCDABCDAB');
  assert.equal(parsed.answerKeysByBooklet.B, 'BCDABCDABC');
  assert.equal(parsed.answerKeysByBooklet.C, 'CDABCDABCD');
  assert.equal(parsed.answerKeysByBooklet.D, 'DABCDABCDA');

  assert.equal(parsed.importedStudents.length, 3);
  assert.equal(parsed.importedStudents[0].bookletCode, 'A');
  assert.equal(parsed.importedStudents[1].bookletCode, 'B');
  assert.equal(parsed.importedStudents[2].bookletCode, 'D');
  assert.equal(parsed.importedStudents[1].matchedAnswerKey, 'BCDABCDABC');

  assert.equal(parsed.studentAnswersRaw, 'ABCD-BCDAB');
  assert.equal(parsed.answerKeyRaw, 'ABCDABCDAB');
});

test('parseOmrExcelOrCsvBuffer handles CEVAP ANAHTARI row in single sheet and derives B-C-D keys automatically', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { 'Adı Soyadı': 'CEVAP ANAHTARI', 'Kitapçık': 'A', 'Öğrenci Cevapları': 'ABCDABCDABCD' },
    { 'Adı Soyadı': 'Elif Demir', 'Kitapçık': '', 'Öğrenci Cevapları': 'AB-DABCDAB-D' },
    { 'Adı Soyadı': 'Yusuf Kaya', 'Kitapçık': '', 'Öğrenci Cevapları': '' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sayfa1');

  const inst = DEFAULT_INSTITUTIONS[0];
  const parsed = parseOmrExcelOrCsvBuffer(workbookToArrayBuffer(wb), {
    expectedCount: 12,
    optionCount: 4,
    activeBookletCode: 'A',
    fallbackGradeId: '5',
    institution: inst,
    existingStudents: [],
    autoDeriveMissingBooklets: true,
  });

  assert.equal(parsed.answerKeysByBooklet.A, 'ABCDABCDABCD');
  assert.equal(parsed.answerKeysByBooklet.B?.length, 12);
  assert.equal(parsed.answerKeysByBooklet.C?.length, 12);
  assert.equal(parsed.answerKeysByBooklet.D?.length, 12);
  assert.equal(parsed.importedStudents.length, 2);
  assert.equal(parsed.importedStudents[0].fullName, 'Elif Demir');
  assert.equal(parsed.importedStudents[0].bookletCode, 'A');
  assert.equal(parsed.importedStudents[1].bookletCode, 'B');
  assert.equal(parsed.studentAnswersRaw, 'AB-DABCDAB-D');
  assert.equal(parsed.answerKeyRaw, 'ABCDABCDABCD');
});

test('parseOmrExcelOrCsvBuffer supports vertical Soru|A|B|C|D key sheet and CSV text buffers', () => {
  const wb = XLSX.utils.book_new();
  const verticalWs = XLSX.utils.json_to_sheet([
    { Soru: 1, A: 'A', B: 'C', C: 'B', D: 'D' },
    { Soru: 2, A: 'B', B: 'D', C: 'A', D: 'C' },
    { Soru: 3, A: 'C', B: 'A', C: 'D', D: 'B' },
    { Soru: 4, A: 'D', B: 'B', C: 'C', D: 'A' },
  ]);
  XLSX.utils.book_append_sheet(wb, verticalWs, 'AnahtarMatrisi');

  const parsed = parseOmrExcelOrCsvBuffer(workbookToArrayBuffer(wb), {
    expectedCount: 4,
    optionCount: 4,
    activeBookletCode: 'B',
    fallbackGradeId: '5',
    institution: DEFAULT_INSTITUTIONS[0],
    existingStudents: [],
  });

  assert.equal(parsed.answerKeysByBooklet.A, 'ABCD');
  assert.equal(parsed.answerKeysByBooklet.B, 'CDAB');
  assert.equal(parsed.answerKeysByBooklet.C, 'BADC');
  assert.equal(parsed.answerKeysByBooklet.D, 'DCBA');
  assert.equal(parsed.answerKeyRaw, 'CDAB');
});

test('mergeImportedOmrStudents upserts students without duplicates and preserves ABCD booklets', () => {
  const inst = DEFAULT_INSTITUTIONS[0];
  const initialMerge = mergeImportedOmrStudents(
    [],
    [
      {
        fullName: 'Alihan Sarı',
        studentNumber8: '12345678',
        classroom: '5-A',
        gradeId: '5',
        bookletCode: 'B',
        bookletNumber: '050001',
        studentAnswersRaw: 'ABCD',
        matchedAnswerKey: 'ABCD',
      },
    ],
    inst
  );
  assert.equal(initialMerge.addedCount, 1);
  assert.equal(initialMerge.nextStudents.length, 1);
  assert.equal(initialMerge.nextStudents[0].assignedBookletCode, 'B');

  const secondMerge = mergeImportedOmrStudents(
    initialMerge.nextStudents,
    [
      {
        fullName: 'Alihan Sarı',
        studentNumber8: '12345678',
        classroom: '5-A',
        gradeId: '5',
        bookletCode: 'C',
        bookletNumber: '050001',
        studentAnswersRaw: 'ABCA',
        matchedAnswerKey: 'ABCD',
      },
    ],
    inst
  );
  assert.equal(secondMerge.addedCount, 0);
  assert.equal(secondMerge.updatedCount, 1);
  assert.equal(secondMerge.nextStudents.length, 1);
  assert.equal(secondMerge.nextStudents[0].assignedBookletCode, 'C');
  assert.equal(secondMerge.nextStudents[0].lastOmrAnswers, 'ABCA');
});

test('buildOmrExcelTemplateBlob creates round-trippable ABCD template workbook', async () => {
  const derived = deriveBookletAnswerKeysFromBase('ABCDABCDAB', 4);
  const blob = buildOmrExcelTemplateBlob({
    bookletKeys: derived,
    gradeId: '5',
    optionCount: 4,
    questionCount: 10,
  });
  const buf = await blob.arrayBuffer();
  const parsed = parseOmrExcelOrCsvBuffer(buf, {
    expectedCount: 10,
    optionCount: 4,
    activeBookletCode: 'A',
    fallbackGradeId: '5',
    institution: DEFAULT_INSTITUTIONS[0],
    existingStudents: [],
  });
  assert.equal(parsed.answerKeysByBooklet.A, 'ABCDABCDAB');
  assert.equal(parsed.importedStudents.length, 3);
  assert.equal(parsed.importedStudents[0].bookletCode, 'A');
  assert.equal(parsed.importedStudents[1].bookletCode, 'B');
  assert.equal(parsed.importedStudents[2].bookletCode, 'C');
});

test('parseOmrExcelOrCsvBuffer preserves UTF-8 Turkish characters in CSV files', () => {
  const csv = [
    'Adı Soyadı,Şube,Kitapçık,Öğrenci Cevapları',
    'CEVAP ANAHTARI,,A,ABCDABCDAB',
    'Alihan Sarı,5-A,,ABCDABCD-B',
    'Şule Çağlar,5-B,,BCDABCDABC',
  ].join('\n');
  const bytes = new TextEncoder().encode(csv);
  const parsed = parseOmrExcelOrCsvBuffer(new Uint8Array(bytes).buffer, {
    expectedCount: 10,
    optionCount: 4,
    activeBookletCode: 'A',
    fallbackGradeId: '5',
    institution: DEFAULT_INSTITUTIONS[0],
    existingStudents: [],
  });
  assert.equal(parsed.importedStudents[0].fullName, 'Alihan Sarı');
  assert.equal(parsed.importedStudents[1].fullName, 'Şule Çağlar');
  assert.equal(parsed.answerKeyRaw, 'ABCDABCDAB');
  assert.equal(parsed.studentAnswersRaw, 'ABCDABCD-B');
  assert.equal(parsed.errors.length, 0);
});

test('parseOmrExcelOrCsvBuffer detects invalid student numbers, duplicates, unreadable answers, and S1..SN errors with exact row numbers', () => {
  const wb = XLSX.utils.book_new();
  const stuWs = XLSX.utils.json_to_sheet([
    { 'Öğrenci No': '20265001', 'Adı Soyadı': 'Ayşe Yılmaz', 'Öğrenci Cevapları': 'ABCDABCDAB' }, // Satır 2: geçerli
    { 'Öğrenci No': '456', 'Adı Soyadı': 'Mehmet Demir', 'Öğrenci Cevapları': 'ABCDABCDAB' }, // Satır 3: geçersiz no (3 hane)
    { 'Öğrenci No': '20265001', 'Adı Soyadı': 'Fatma Kaya', 'Öğrenci Cevapları': '??OKUNAMADI' }, // Satır 4: mükerrer no + okunmayan cevap
    { 'Öğrenci No': '20265004', 'Adı Soyadı': 'Can Akın', 'Öğrenci Cevapları': 'ABCDEABCDA' }, // Satır 5: 4 şıklı sınavda E şıkkı
  ]);
  XLSX.utils.book_append_sheet(wb, stuWs, 'OgrenciListesi');

  const indexedWs = XLSX.utils.json_to_sheet([
    { 'Öğrenci No': '20265010', 'Adı Soyadı': 'Zehra Şen', S1: 'A', S2: '?', S3: 'C', S4: 'D' }, // Satır 2: S2:'?'
  ]);
  XLSX.utils.book_append_sheet(wb, indexedWs, 'SoruSutunlari');

  const parsed = parseOmrExcelOrCsvBuffer(workbookToArrayBuffer(wb), {
    expectedCount: 10,
    optionCount: 4,
    activeBookletCode: 'A',
    fallbackGradeId: '5',
    institution: DEFAULT_INSTITUTIONS[0],
    existingStudents: [],
  });

  assert.ok(parsed.totalRowsChecked >= 5);
  assert.equal(parsed.errors.length, 5);

  const row3Err = parsed.errors.find((e) => e.rowNumber === 3 && e.sheetName === 'OgrenciListesi');
  assert.ok(row3Err);
  assert.equal(row3Err.category, 'invalid-student-number');
  assert.equal(row3Err.studentName, 'Mehmet Demir');

  const row4Errors = parsed.errors.filter((e) => e.rowNumber === 4 && e.sheetName === 'OgrenciListesi');
  assert.equal(row4Errors.length, 2);
  assert.ok(row4Errors.some((e) => e.category === 'duplicate-student-number'));
  assert.ok(row4Errors.some((e) => e.category === 'unreadable-answers'));

  const row5Err = parsed.errors.find((e) => e.rowNumber === 5 && e.sheetName === 'OgrenciListesi');
  assert.ok(row5Err);
  assert.equal(row5Err.category, 'invalid-option');

  const indexedErr = parsed.errors.find((e) => e.sheetName === 'SoruSutunlari');
  assert.ok(indexedErr);
  assert.equal(indexedErr.rowNumber, 2);
  assert.equal(indexedErr.category, 'unreadable-answers');
  assert.ok(indexedErr.rawExcerpt.includes("S2:'?'"));
});

