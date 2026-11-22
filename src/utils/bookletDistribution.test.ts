import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { buildAutoExamQuestions } from './examAnalysis';
import {
  assignBookletsToRegisteredStudents,
  buildAllBookletsAnswerKeyCsv,
  buildAllBookletsZipFilename,
  buildAnswerKeysForAllBooklets,
  buildBatchAssignmentsCsv,
  buildBatchBookletAssignments,
  buildBookletOrderComparison,
  buildBookletPdfFilename,
  buildBookletVariantQuestions,
  buildOpticalPdfFilename,
  COVER_COLOR_THEMES,
  COVER_LAYOUT_OPTIONS,
  extractGradeLabelFromCover,
  normalizeBookletNumber,
  normalizeExternalAnswerKeyString,
  resolveActiveAnswerKeyByMode,
  resolveCoverColorPalette,
  resolveCoverLayoutStyle,
  syncBookletVariantsAndOpticalKeys,
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

test('buildBookletOrderComparison reports 4 unique orders and reshuffles cleanly with orderSeed', () => {
  const base = buildAutoExamQuestions('5', 'dengeli', 40);
  const cmp0 = buildBookletOrderComparison(base, 0);
  const cmp1 = buildBookletOrderComparison(base, 1);

  assert.equal(cmp0.allOrdersUnique, true);
  assert.equal(cmp1.allOrdersUnique, true);
  assert.equal(cmp0.items.length, 4);
  assert.notEqual(cmp0.items[0].orderSignature, cmp1.items[0].orderSignature);
  assert.notEqual(cmp0.items[1].orderSignature, cmp1.items[1].orderSignature);
});

test('COVER_LAYOUT_OPTIONS and resolveCoverLayoutStyle resolve all graphical cover layouts with safe fallback', () => {
  assert.equal(COVER_LAYOUT_OPTIONS.length, 4);
  assert.equal(resolveCoverLayoutStyle(undefined).id, 'klasik-cerceve');
  assert.equal(resolveCoverLayoutStyle({ coverLayoutId: 'diyagonal-serit' }).id, 'diyagonal-serit');
  assert.equal(resolveCoverLayoutStyle({ coverLayoutId: 'geometrik-blok' }).id, 'geometrik-blok');
  assert.equal(resolveCoverLayoutStyle({ coverLayoutId: 'akademik-kose' }).id, 'akademik-kose');
});

test('difficulty-preserving deterministic variant algorithm keeps exact Kolay/Orta/Zor slot difficulties across A/B/C/D and seeds', () => {
  const base5 = buildAutoExamQuestions('5', 'dengeli', 40);
  for (const seed of [0, 1, 2, 3]) {
    for (const code of ['A', 'B', 'C', 'D'] as const) {
      const variant = buildBookletVariantQuestions(base5, code, seed);
      assert.equal(variant.length, base5.length);
      variant.forEach((q, idx) => {
        assert.equal(
          q.subject,
          base5[idx].subject,
          `Booklet ${code} seed ${seed} slot ${idx + 1} must preserve subject`
        );
        assert.equal(
          q.difficulty,
          base5[idx].difficulty,
          `Booklet ${code} seed ${seed} slot ${idx + 1} must preserve difficulty (${base5[idx].difficulty})`
        );
      });
    }
  }

  // Determinism check: identical inputs always produce identical ordering & optical key
  const run1 = syncBookletVariantsAndOpticalKeys(base5, 'C', 2);
  const run2 = syncBookletVariantsAndOpticalKeys(base5, 'C', 2);
  assert.deepEqual(
    run1.activeQuestions.map((q) => q.id),
    run2.activeQuestions.map((q) => q.id)
  );
  assert.equal(run1.activeAnswerKey, run2.activeAnswerKey);
});

test('syncBookletVariantsAndOpticalKeys simultaneously updates active optical key, all 4 booklet keys, and difficulty report', () => {
  const baseTyt = buildAutoExamQuestions('TYT', 'dengeli', 40);
  const syncedB = syncBookletVariantsAndOpticalKeys(baseTyt, 'B', 0);
  const syncedD = syncBookletVariantsAndOpticalKeys(baseTyt, 'D', 0);

  assert.equal(syncedB.activeCode, 'B');
  assert.equal(syncedB.activeAnswerKey, syncedB.allAnswerKeys.B);
  assert.equal(
    syncedB.activeAnswerKey,
    syncedB.activeQuestions.map((q) => q.correctOption).join('')
  );
  assert.equal(syncedD.activeAnswerKey, syncedD.allAnswerKeys.D);
  assert.notEqual(syncedB.activeAnswerKey, syncedD.activeAnswerKey);
  assert.equal(syncedB.comparison.allOrdersUnique, true);
  assert.equal(syncedB.comparison.allKeysUnique, true);
  assert.equal(syncedB.comparison.difficultyPreserved, true);
  assert.equal(syncedB.comparison.subjectPreserved, true);

  // Single-subject 20-question exam also keeps 4 distinct orders while preserving difficulty per slot
  const singleSubj = buildAutoExamQuestions('8', 'dengeli', 20, 'Matematik');
  const singleSync = syncBookletVariantsAndOpticalKeys(singleSubj, 'C', 1);
  assert.equal(singleSync.comparison.difficultyPreserved, true);
  assert.equal(singleSync.comparison.allOrdersUnique, true);
});

test('buildBookletPdfFilename generates unique clean ASCII filenames for A, B, C, and D booklets', () => {
  const baseCover = {
    academyName: 'Doğruluk Akademi Merkez',
    bookletCode: 'A' as const,
    bookletNumber: '50001',
  };
  const fnA = buildBookletPdfFilename(baseCover, 'A');
  const fnB = buildBookletPdfFilename(baseCover, 'B');
  const fnC = buildBookletPdfFilename(baseCover, 'C');
  const fnD = buildBookletPdfFilename(baseCover, 'D', '050004');

  assert.equal(fnA, 'Dogruluk-Akademi-Merkez-A-Kitapcik-050001.pdf');
  assert.equal(fnB, 'Dogruluk-Akademi-Merkez-B-Kitapcik-050001.pdf');
  assert.equal(fnC, 'Dogruluk-Akademi-Merkez-C-Kitapcik-050001.pdf');
  assert.equal(fnD, 'Dogruluk-Akademi-Merkez-D-Kitapcik-050004.pdf');
  assert.equal(new Set([fnA, fnB, fnC, fnD]).size, 4);
});

test('buildAllBookletsAnswerKeyCsv exports side-by-side A/B/C/D keys and source question numbers', () => {
  const base = buildAutoExamQuestions('5', 'dengeli', 20);
  const csv = buildAllBookletsAnswerKeyCsv(base, 0);
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

  assert.equal(lines.length, 21);
  assert.ok(lines[0].includes('A_Kitapcik_Cevap;B_Kitapcik_Cevap;C_Kitapcik_Cevap;D_Kitapcik_Cevap'));
  assert.ok(lines[1].startsWith('1;'));
});

test('normalizeExternalAnswerKeyString and resolveActiveAnswerKeyByMode separate external publisher keys from internal variants', () => {
  assert.equal(normalizeExternalAnswerKeyString('a-b c e d 12', 4), 'ABCD');
  assert.equal(normalizeExternalAnswerKeyString('a b e c d', 5), 'ABECD');

  const base5 = buildAutoExamQuestions('5', 'dengeli', 20);
  const externalKeys = {
    A: 'AAAAAAAAAAAAAAAAAAAA',
    B: 'BBBBBBBBBBBBBBBBBBBB',
    C: 'CCCCCCCCCCCCCCCCCCCC',
    D: 'DDDDDDDDDDDDDDDDDDDD',
  };

  const extB = resolveActiveAnswerKeyByMode({
    examSourceMode: 'farkli-yayin',
    bookletCode: 'B',
    baseQuestions: base5,
    externalKeys,
    optionCount: 4,
  });
  assert.equal(extB, 'BBBBBBBBBBBBBBBBBBBB');

  const extC = resolveActiveAnswerKeyByMode({
    examSourceMode: 'farkli-yayin',
    bookletCode: 'C',
    baseQuestions: base5,
    externalKeys,
    optionCount: 4,
  });
  assert.equal(extC, 'CCCCCCCCCCCCCCCCCCCC');

  const kurumB = resolveActiveAnswerKeyByMode({
    examSourceMode: 'kurum',
    bookletCode: 'B',
    baseQuestions: base5,
    externalKeys,
    optionCount: 4,
  });
  assert.notEqual(kurumB, 'BBBBBBBBBBBBBBBBBBBB');
  assert.equal(kurumB, buildAnswerKeysForAllBooklets(base5, 0).B);
});

test('assignBookletsToRegisteredStudents distributes A-B-C-D booklets and links external answer keys', () => {
  const grade5 = getGradeProfile('5');
  const base5 = buildAutoExamQuestions('5', 'dengeli', 20);
  const students = [
    {
      id: 's1',
      fullName: 'Ali Yılmaz',
      studentNumber8: '50001001',
      institutionId: 'inst-1',
      institutionCode8: '48291045',
      institutionName: 'Doğruluk Akademi',
      classroom: '5-A',
      gradeId: '5' as const,
      createdAt: '2026-11-20',
    },
    {
      id: 's2',
      fullName: 'Ayşe Demir',
      studentNumber8: '50001002',
      institutionId: 'inst-1',
      institutionCode8: '48291045',
      institutionName: 'Doğruluk Akademi',
      classroom: '5-A',
      gradeId: '5' as const,
      createdAt: '2026-11-20',
    },
    {
      id: 's3',
      fullName: 'Mehmet Öz',
      studentNumber8: '50001003',
      institutionId: 'inst-1',
      institutionCode8: '48291045',
      institutionName: 'Doğruluk Akademi',
      classroom: '5-B',
      gradeId: '5' as const,
      createdAt: '2026-11-20',
    },
    {
      id: 's4',
      fullName: 'Fatma Şahin',
      studentNumber8: '50001004',
      institutionId: 'inst-1',
      institutionCode8: '48291045',
      institutionName: 'Doğruluk Akademi',
      classroom: '5-B',
      gradeId: '5' as const,
      createdAt: '2026-11-20',
    },
    {
      id: 's5',
      fullName: 'Diğer Kurum',
      studentNumber8: '90001001',
      institutionId: 'inst-2',
      institutionCode8: '99887766',
      institutionName: 'Başka Okul',
      classroom: '5-A',
      gradeId: '5' as const,
      createdAt: '2026-11-20',
    },
  ];

  const externalKeys = {
    A: 'AAAAABBBBBCCCCCDDDDD',
    B: 'BBBBBCCCCCDDDDDAAAAA',
    C: 'CCCCCDDDDDAAAAABBBBB',
    D: 'DDDDDAAAAABBBBBCCCCC',
  };

  const result = assignBookletsToRegisteredStudents({
    students,
    institutionId: 'inst-1',
    gradeProfile: grade5,
    baseQuestions: base5,
    startingBookletCode: 'A',
    startBookletNumber: 50001,
    examSourceMode: 'farkli-yayin',
    externalKeys,
  });

  assert.equal(result.assignedCount, 4);
  assert.deepEqual(
    result.assignments.map((a) => a.bookletCode),
    ['A', 'B', 'C', 'D']
  );
  assert.deepEqual(
    result.assignments.map((a) => a.bookletNumber),
    ['050001', '050002', '050003', '050004']
  );
  assert.equal(result.assignments[1].answerKey, externalKeys.B);
  assert.equal(result.assignments[3].answerKey, externalKeys.D);
  assert.equal(result.updatedStudents[0].assignedBookletCode, 'A');
  assert.equal(result.updatedStudents[1].assignedBookletCode, 'B');
  assert.equal(result.updatedStudents[1].assignedBookletNumber, '050002');
  assert.equal(result.updatedStudents[4].assignedBookletCode, undefined);

  // Batch assignments honors enrolled student's assigned booklet and external mode
  const batch = buildBatchBookletAssignments({
    gradeProfile: grade5,
    baseQuestions: base5,
    count: 5,
    students: result.updatedStudents,
    institutionId: 'inst-1',
    examSourceMode: 'farkli-yayin',
    externalKeys,
  });
  assert.equal(batch[1].studentName, 'Ayşe Demir');
  assert.equal(batch[1].bookletCode, 'B');
  assert.equal(batch[1].bookletNumber, '050002');
  assert.equal(batch[1].answerKey, externalKeys.B);
});

test('buildOpticalPdfFilename and buildAllBookletsZipFilename sanitize Turkish characters and distinguish A/B/C/D', () => {
  const baseCover = {
    academyName: 'Doğruluk Akademi Şubesi',
    bookletCode: 'A' as const,
    bookletNumber: '50001',
    institutionCode8: '48291045',
  };
  const optA = buildOpticalPdfFilename(baseCover, 'A');
  const optB = buildOpticalPdfFilename(baseCover, 'B', '050002', '50001002');
  const optC = buildOpticalPdfFilename(baseCover, 'C', '050003');
  const optD = buildOpticalPdfFilename(baseCover, 'D', '050004');

  assert.equal(optA, 'Optik-Form-A-No050001-48291045.pdf');
  assert.equal(optB, 'Optik-Form-B-No050002-Ogr50001002-48291045.pdf');
  assert.equal(optC, 'Optik-Form-C-No050003-48291045.pdf');
  assert.equal(optD, 'Optik-Form-D-No050004-48291045.pdf');

  const zipName = buildAllBookletsZipFilename('Doğruluk Akademi Çağdaş', 'ABCD-Optik-Formlari');
  assert.equal(zipName, 'Dogruluk-Akademi-Cagdas-ABCD-Optik-Formlari.zip');
  assert.ok(!/[ğüşşıöçĞÜŞİÖÇ]/i.test(zipName));
});


