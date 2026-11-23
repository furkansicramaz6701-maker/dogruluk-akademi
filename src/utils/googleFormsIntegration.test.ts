import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { Institution } from '../types/academy';
import {
  assignBookletPatternToSubmissions,
  buildGoogleFormsSampleCohort,
  mergeGoogleFormSubmissionsIntoStudents,
  normalizePosterGoogleFormUrl,
  parseGoogleFormGradeAndClass,
  parseGoogleFormsSpreadsheetBuffer,
  splitTurkishFullName,
} from './googleFormsIntegration';

const INST: Institution = {
  id: 'inst-1',
  name: 'Doğruluk Akademi',
  code8: '48291045',
  city: 'İstanbul',
  createdAt: '2026-11-23',
};

test('splitTurkishFullName handles separate Ad/Soyad and combined Adı Soyadı cleanly', () => {
  const a = splitTurkishFullName('', 'Elif Nur', 'Yılmaz');
  assert.equal(a.firstName, 'Elif Nur');
  assert.equal(a.lastName, 'Yılmaz');
  assert.equal(a.fullName, 'Elif Nur Yılmaz');

  const b = splitTurkishFullName('Muhammed Emir Kaya');
  assert.equal(b.firstName, 'Muhammed Emir');
  assert.equal(b.lastName, 'Kaya');
  assert.equal(b.fullName, 'Muhammed Emir Kaya');
});

test('parseGoogleFormGradeAndClass infers Turkish grade levels and normalized classroom codes', () => {
  assert.deepEqual(parseGoogleFormGradeAndClass('5/A', '', '8'), {
    gradeId: '5',
    classroom: '5-A',
  });
  assert.deepEqual(parseGoogleFormGradeAndClass('8. Sınıf B', '', '5'), {
    gradeId: '8',
    classroom: '8-B',
  });
  assert.deepEqual(parseGoogleFormGradeAndClass('TYT-1', 'TYT', '5'), {
    gradeId: 'TYT',
    classroom: 'TYT-1',
  });
  assert.deepEqual(parseGoogleFormGradeAndClass('C', '6. Sınıf', '5'), {
    gradeId: '6',
    classroom: '6-C',
  });
});

test('parseGoogleFormsSpreadsheetBuffer parses Google Forms Excel responses and assigns A-B alternating booklets', () => {
  const rows = [
    {
      'Zaman damgası': '2026-11-24 10:00:00',
      'Öğrenci Adı Soyadı': 'Ayşe Yılmaz',
      'Sınıf / Şube': '5-A',
      'Veli Telefonu': '0532 111 22 33',
    },
    {
      'Zaman damgası': '2026-11-24 10:05:00',
      'Öğrenci Adı Soyadı': 'Mehmet Demir',
      'Sınıf / Şube': '5/B',
      'Veli Telefonu': '0533 222 33 44',
    },
    {
      'Zaman damgası': '2026-11-24 10:10:00',
      'Öğrenci Adı Soyadı': 'Zehra Kaya',
      'Sınıf / Şube': '8-A',
      'Veli Telefonu': '0544 333 44 55',
    },
    {
      'Zaman damgası': '2026-11-24 10:15:00',
      'Öğrenci Adı Soyadı': 'Ali Can Çelik',
      'Sınıf / Şube': '5-A',
      'Veli Telefonu': '0555 444 55 66',
    },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Form Yanıtları 1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  const parsed = parseGoogleFormsSpreadsheetBuffer(buf, {
    institution: INST,
    fallbackGradeId: '5',
    distributionPattern: 'AB',
  });

  assert.equal(parsed.submissions.length, 4);
  assert.equal(parsed.submissions[0].firstName, 'Ayşe');
  assert.equal(parsed.submissions[0].lastName, 'Yılmaz');
  assert.equal(parsed.submissions[0].classroom, '5-A');
  assert.equal(parsed.submissions[0].gradeId, '5');
  assert.equal(parsed.submissions[2].gradeId, '8');
  assert.equal(parsed.submissions[2].classroom, '8-A');
  assert.deepEqual(
    parsed.submissions.map((s) => s.bookletCode),
    ['A', 'B', 'A', 'B']
  );
  // Unique 8-digit student numbers
  const nums = new Set(parsed.submissions.map((s) => s.studentNumber8));
  assert.equal(nums.size, 4);
  for (const num of nums) {
    assert.match(num, /^\d{8}$/);
  }
});

test('assignBookletPatternToSubmissions supports A-B per classroom and A-B-C-D cycles', () => {
  const sample = buildGoogleFormsSampleCohort({
    institution: INST,
    fallbackGradeId: '5',
    pattern: 'AB',
    groupByClassroom: true,
  });
  assert.equal(sample.length, 8);
  const classASubmissions = sample.filter((s) => s.classroom === '5-A');
  assert.deepEqual(
    classASubmissions.map((s) => s.bookletCode),
    ['A', 'B', 'A']
  );

  const abcd = assignBookletPatternToSubmissions(sample, {
    pattern: 'ABCD',
    groupByClassroom: false,
  });
  assert.deepEqual(
    abcd.slice(0, 4).map((s) => s.bookletCode),
    ['A', 'B', 'C', 'D']
  );
});

test('mergeGoogleFormSubmissionsIntoStudents adds and updates records cleanly', () => {
  const sample = buildGoogleFormsSampleCohort({
    institution: INST,
    fallbackGradeId: '5',
    pattern: 'AB',
  });
  const firstMerge = mergeGoogleFormSubmissionsIntoStudents([], sample.slice(0, 3), INST);
  assert.equal(firstMerge.addedCount, 3);
  assert.equal(firstMerge.updatedCount, 0);
  assert.equal(firstMerge.nextStudents.length, 3);

  const secondMerge = mergeGoogleFormSubmissionsIntoStudents(
    firstMerge.nextStudents,
    sample.slice(0, 5),
    INST
  );
  assert.equal(secondMerge.addedCount, 2);
  assert.equal(secondMerge.updatedCount, 3);
  assert.equal(secondMerge.nextStudents.length, 5);
});

test('normalizePosterGoogleFormUrl formats short and full URLs cleanly', () => {
  const norm = normalizePosterGoogleFormUrl('forms.gle/dogruluk-5-aralik');
  assert.equal(norm.href, 'https://forms.gle/dogruluk-5-aralik');
  assert.equal(norm.displayText, 'forms.gle/dogruluk-5-aralik');
});
