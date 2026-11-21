import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { buildAutoExamQuestions } from './examAnalysis';
import {
  buildAnswerKeysForAllBooklets,
  buildBatchAssignmentsCsv,
  buildBatchBookletAssignments,
  buildBookletVariantQuestions,
  COVER_COLOR_THEMES,
  extractGradeLabelFromCover,
  normalizeBookletNumber,
  resolveCoverColorPalette,
} from './bookletDistribution';

test('buildBookletVariantQuestions produces deterministic A/B/C/D variants preserving subject grouping and renumbering', () => {
  const base = buildAutoExamQuestions('5', 'dengeli', 40);
  const varA = buildBookletVariantQuestions(base, 'A');
  const varB = buildBookletVariantQuestions(base, 'B');
  const varC = buildBookletVariantQuestions(base, 'C');
  const varD = buildBookletVariantQuestions(base, 'D');

  assert.equal(varA.length, 40);
  assert.equal(varB.length, 40);
  assert.equal(varC.length, 40);
  assert.equal(varD.length, 40);

  // Numbering always sequential 1..N
  assert.deepEqual(
    varB.map((q) => q.number),
    Array.from({ length: 40 }, (_, i) => i + 1)
  );

  // Same ID multiset across all variants
  const idsA = varA.map((q) => q.id).sort();
  assert.deepEqual(varB.map((q) => q.id).sort(), idsA);
  assert.deepEqual(varC.map((q) => q.id).sort(), idsA);
  assert.deepEqual(varD.map((q) => q.id).sort(), idsA);

  // Variant B/C/D keep same subject per slot as Variant A
  assert.deepEqual(
    varB.map((q) => q.subject),
    varA.map((q) => q.subject)
  );
  assert.deepEqual(
    varC.map((q) => q.subject),
    varA.map((q) => q.subject)
  );

  // Order differs between A, B, C, D
  const orderA = varA.map((q) => q.id).join(',');
  const orderB = varB.map((q) => q.id).join(',');
  const orderC = varC.map((q) => q.id).join(',');
  const orderD = varD.map((q) => q.id).join(',');
  assert.notEqual(orderA, orderB);
  assert.notEqual(orderA, orderC);
  assert.notEqual(orderA, orderD);
  assert.notEqual(orderB, orderC);
});

test('buildAnswerKeysForAllBooklets produces exact and distinct per-booklet answer keys', () => {
  const base8 = buildAutoExamQuestions('8', 'dengeli', 40);
  const keys8 = buildAnswerKeysForAllBooklets(base8);

  assert.equal(keys8.A.length, 40);
  assert.equal(keys8.B.length, 40);
  assert.equal(keys8.C.length, 40);
  assert.equal(keys8.D.length, 40);

  const unique8 = new Set([keys8.A, keys8.B, keys8.C, keys8.D]);
  assert.equal(unique8.size, 4, 'All 4 booklet answer keys must be distinct for 4-option exams');

  const varC = buildBookletVariantQuestions(base8, 'C');
  assert.equal(keys8.C, varC.map((q) => q.correctOption).join(''));

  const baseTyt = buildAutoExamQuestions('TYT', 'dengeli', 40);
  const keysTyt = buildAnswerKeysForAllBooklets(baseTyt);
  const uniqueTyt = new Set([keysTyt.A, keysTyt.B, keysTyt.C, keysTyt.D]);
  assert.equal(uniqueTyt.size, 4, 'All 4 booklet answer keys must be distinct for 5-option exams');
});

test('buildBatchBookletAssignments generates 50 class-scoped A-B-C-D slots with unique 6-digit booklet numbers', () => {
  const grade = getGradeProfile('5');
  const base = buildAutoExamQuestions('5', 'dengeli', 40);
  const assignments = buildBatchBookletAssignments({
    gradeProfile: grade,
    baseQuestions: base,
    count: 50,
    startBookletNumber: 50001,
    students: [
      {
        id: 's1',
        fullName: 'Zeynep Kaya',
        studentNumber8: '50001001',
        institutionId: 'inst-1',
        institutionCode8: '48291045',
        institutionName: 'Doğruluk Akademi',
        classroom: '5-A',
        gradeId: '5',
        createdAt: '2026-11-20',
      },
    ],
    institutionId: 'inst-1',
  });

  assert.equal(assignments.length, 50);
  assert.equal(assignments[0].studentName, 'Zeynep Kaya');
  assert.equal(assignments[0].bookletCode, 'A');
  assert.equal(assignments[0].bookletNumber, '050001');
  assert.equal(assignments[1].bookletCode, 'B');
  assert.equal(assignments[1].bookletNumber, '050002');
  assert.equal(assignments[2].bookletCode, 'C');
  assert.equal(assignments[3].bookletCode, 'D');
  assert.equal(assignments[4].bookletCode, 'A');
  assert.equal(assignments[49].bookletNumber, '050050');

  const uniqueNums = new Set(assignments.map((a) => a.bookletNumber));
  assert.equal(uniqueNums.size, 50);

  const csv = buildBatchAssignmentsCsv(assignments, '5. Sınıf Kurumsal Deneme');
  assert.ok(csv.includes('050001'));
  assert.ok(csv.includes('Zeynep Kaya'));
});

test('resolveCoverColorPalette differentiates A/B/C/D in otomatik-abcd mode and honors explicit color themes', () => {
  const fallback = { primaryColor: '#1d4ed8', secondaryColor: '#0f2747', goldColor: '#f59e0b' };
  const palA = resolveCoverColorPalette({ bookletCode: 'A', coverColorThemeId: 'otomatik-abcd' }, fallback);
  const palB = resolveCoverColorPalette({ bookletCode: 'B', coverColorThemeId: 'otomatik-abcd' }, fallback);
  const palC = resolveCoverColorPalette({ bookletCode: 'C', coverColorThemeId: 'otomatik-abcd' }, fallback);
  const palD = resolveCoverColorPalette({ bookletCode: 'D', coverColorThemeId: 'otomatik-abcd' }, fallback);

  assert.notEqual(palA.primaryColor, palB.primaryColor);
  assert.notEqual(palB.primaryColor, palC.primaryColor);
  assert.notEqual(palC.primaryColor, palD.primaryColor);

  const explicit = resolveCoverColorPalette(
    { bookletCode: 'B', coverColorThemeId: 'indigo-lavanta' },
    fallback
  );
  assert.equal(explicit.primaryColor, '#6d28d9');
  assert.ok(COVER_COLOR_THEMES.length >= 6);
});

test('normalizeBookletNumber and extractGradeLabelFromCover behave deterministically', () => {
  assert.equal(normalizeBookletNumber('50012'), '050012');
  assert.equal(normalizeBookletNumber('', 7), '050007');
  assert.equal(
    extractGradeLabelFromCover({
      gradeLabel: '',
      subtitle: '8. Sınıf LGS Hazırlık Müfredatı',
      examTitle: 'Deneme 1',
    }),
    '8. Sınıf'
  );
  assert.equal(
    extractGradeLabelFromCover({
      gradeLabel: '7. Sınıf',
      subtitle: 'Genel',
      examTitle: 'Deneme',
    }),
    '7. Sınıf'
  );
});
