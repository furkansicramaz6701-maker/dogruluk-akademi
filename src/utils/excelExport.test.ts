import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  buildInstitutionsRows,
  buildStudentsRows,
  defaultClassroomForGrade,
  normalizeImportedGradeId,
  parseInstitutionsSpreadsheet,
  parseStudentsSpreadsheet,
} from './excelExport';
import { DEFAULT_INSTITUTIONS, DEFAULT_STUDENTS } from './institutionCodes';

test('normalizeImportedGradeId keeps 5. Sınıf separate from TYT/AYT', () => {
  assert.equal(normalizeImportedGradeId('5', 'TYT'), '5');
  assert.equal(normalizeImportedGradeId('5. Sınıf', 'TYT'), '5');
  assert.equal(normalizeImportedGradeId('8. Sınıf LGS', 'TYT'), '8');
  assert.equal(normalizeImportedGradeId('3. Sınıf', 'TYT'), '3');
  assert.equal(normalizeImportedGradeId('11. Sınıf', 'TYT'), '11');
  assert.equal(normalizeImportedGradeId('TYT', '5'), 'TYT');
  assert.equal(normalizeImportedGradeId('AYT Sayısal', '5'), 'AYT-SAY');
  assert.equal(normalizeImportedGradeId('AYT Eşit Ağırlık', '5'), 'AYT-EA');
  assert.equal(normalizeImportedGradeId('AYT Sözel', '5'), 'AYT-SOZ');
});

test('defaultClassroomForGrade returns age-appropriate classroom names', () => {
  assert.equal(defaultClassroomForGrade('3'), '3-A');
  assert.equal(defaultClassroomForGrade('5'), '5-A');
  assert.equal(defaultClassroomForGrade('8'), '8-A LGS');
  assert.equal(defaultClassroomForGrade('TYT'), '12-A TYT');
});

test('buildInstitutionsRows and buildStudentsRows produce Turkish spreadsheet columns', () => {
  const instRows = buildInstitutionsRows(DEFAULT_INSTITUTIONS, DEFAULT_STUDENTS);
  assert.equal(instRows.length, DEFAULT_INSTITUTIONS.length);
  assert.match(instRows[0]['Kurum Kodu (8 Hane)'], /^\d{8}$/);

  const stuRows = buildStudentsRows(DEFAULT_STUDENTS);
  assert.equal(stuRows.length, DEFAULT_STUDENTS.length);
  assert.match(stuRows[0]['Öğrenci No (8 Hane)'], /^\d{8}$/);
  assert.equal(stuRows[1]['Düzey Kodu'], '8');
});

test('parseInstitutionsSpreadsheet & parseStudentsSpreadsheet round-trip real XLSX buffers with 8-digit codes', () => {
  const instWb = XLSX.utils.book_new();
  const instSheet = XLSX.utils.json_to_sheet([
    { 'Kurum Adı': 'Başarı Koleji', Şehir: 'Bursa' },
    { 'Kurum Adı': 'Bilim Dershanesi', Şehir: 'Eskişehir' },
  ]);
  XLSX.utils.book_append_sheet(instWb, instSheet, 'Kurumlar');
  const instArrayBuf = XLSX.write(instWb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const importedInsts = parseInstitutionsSpreadsheet(instArrayBuf, new Set());
  assert.equal(importedInsts.length, 2);
  assert.equal(importedInsts[0].name, 'Başarı Koleji');
  assert.match(importedInsts[0].code8, /^\d{8}$/);
  assert.notEqual(importedInsts[0].code8, importedInsts[1].code8);

  const stuWb = XLSX.utils.book_new();
  const stuSheet = XLSX.utils.json_to_sheet([
    { 'Adı Soyadı': 'Kerem Demir', 'Sınıf / Sınav Düzeyi': '5. Sınıf', Şube: '5-B' },
    { 'Adı Soyadı': 'Elif Aydın', 'Sınıf / Sınav Düzeyi': 'TYT' },
  ]);
  XLSX.utils.book_append_sheet(stuWb, stuSheet, 'Ogrenciler');
  const stuArrayBuf = XLSX.write(stuWb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const importedStudents = parseStudentsSpreadsheet(
    stuArrayBuf,
    importedInsts[0],
    '5',
    new Set()
  );
  assert.equal(importedStudents.length, 2);
  assert.equal(importedStudents[0].gradeId, '5');
  assert.equal(importedStudents[0].classroom, '5-B');
  assert.equal(importedStudents[0].institutionCode8, importedInsts[0].code8);
  assert.match(importedStudents[0].studentNumber8, /^\d{8}$/);
  assert.equal(importedStudents[1].gradeId, 'TYT');
  assert.equal(importedStudents[1].classroom, '12-A TYT');
});
