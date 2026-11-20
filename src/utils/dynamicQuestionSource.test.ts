import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { GRADE_PROFILES } from '../data/curriculum';
import {
  buildDynamicMixedQuestions,
  buildQuestionsFromCurriculumOverride,
  extractCurriculumOverrideFromText,
  parseQuestionsSpreadsheet,
} from './dynamicQuestionSource';
import {
  canInstitutionUseModule,
  createDefaultPermissions,
  filterGradeProfilesByInstitution,
  isGradeAllowedForInstitution,
} from './institutionCodes';
import { Institution } from '../types/academy';

test('filterGradeProfilesByInstitution excludes TYT/AYT when institution only has İlkokul + Ortaokul scopes', () => {
  const elemInst: Institution = {
    id: 'inst-elem',
    name: 'Atatürk İlköğretim Okulu',
    code8: '55112233',
    city: 'Ankara',
    createdAt: '2026-11-15',
    permissions: createDefaultPermissions('Öğretmen', ['ilkokul', 'ortaokul']),
  };

  const allowed = filterGradeProfilesByInstitution(GRADE_PROFILES, elemInst);
  assert.ok(allowed.some((p) => p.id === '3'));
  assert.ok(allowed.some((p) => p.id === '5'));
  assert.ok(allowed.some((p) => p.id === '8'));
  assert.equal(allowed.some((p) => p.id === 'TYT'), false);
  assert.equal(allowed.some((p) => p.id === 'AYT-SAY'), false);
  assert.equal(isGradeAllowedForInstitution(elemInst, '3', GRADE_PROFILES), true);
  assert.equal(isGradeAllowedForInstitution(elemInst, 'TYT', GRADE_PROFILES), false);
});

test('canInstitutionUseModule enforces suspended status and viewer role restrictions', () => {
  const suspendedInst: Institution = {
    id: 'inst-susp',
    name: 'Askıdaki Kurum',
    code8: '99887766',
    city: 'İzmir',
    createdAt: '2026-11-15',
    permissions: {
      ...createDefaultPermissions('Kurum Yöneticisi'),
      status: 'Askıda',
    },
  };
  assert.equal(canInstitutionUseModule(suspendedInst, 'denemeUretici').allowed, false);

  const viewerInst: Institution = {
    id: 'inst-view',
    name: 'Veli / Gözlem Kurumu',
    code8: '11223344',
    city: 'Bursa',
    createdAt: '2026-11-15',
    permissions: createDefaultPermissions('Görüntüleyici'),
  };
  assert.equal(canInstitutionUseModule(viewerInst, 'karnePdf').allowed, true);
  assert.equal(canInstitutionUseModule(viewerInst, 'denemeEditoru').allowed, false);
});

test('extractCurriculumOverrideFromText & buildDynamicMixedQuestions keep 4-option rule for 3. Sınıf and blend sources', () => {
  const sampleMebText = `
    1. Doğal Sayılarla Toplama ve Çıkarma
    2. Beş Duyumuz ve Sağlıklı Yaşam
    3. Noktalama İşaretleri ve Okuma Anlama
    4. Güvenli Hayat ve Okulumuz
  `;
  const override = extractCurriculumOverrideFromText(
    sampleMebText,
    '3',
    'MEB 3. Sınıf Öğretim Programı.pdf',
    24
  );
  assert.equal(override.gradeId, '3');
  assert.equal(override.pageCount, 24);
  assert.ok(override.subjects.length >= 4);

  const mebQs = buildQuestionsFromCurriculumOverride(override, 20);
  assert.equal(mebQs.length, 20);
  assert.equal(Object.keys(mebQs[0].options).length, 4);

  const mixed = buildDynamicMixedQuestions({
    gradeId: '3',
    mix: { curriculumPool: 10, mebPdf: 10, internetSearch: 5, textbookBank: 5 },
    mebOverride: override,
  });
  assert.equal(mixed.length, 30);
  assert.equal(mixed.filter((q) => q.source === 'Müfredat Havuzu').length, 10);
  assert.equal(mixed.filter((q) => q.source === 'Ders Kitabı').length, 10);
  assert.equal(mixed.filter((q) => q.source === 'İnternet Araştırması').length, 5);
  assert.equal(mixed.filter((q) => q.source === 'PDF Kitapçık').length, 5);
  assert.equal(Object.keys(mixed[0].options).length, 4);
});

test('parseQuestionsSpreadsheet imports custom Excel question bank cleanly', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    {
      Ders: 'Matematik',
      Konu: 'Kesirler',
      Zorluk: 'Kolay',
      Soru: 'Bir bütünü 4 eş parçaya böldüğümüzde her parça hangi kesirle ifade edilir?',
      A: '1/2',
      B: '1/3',
      C: '1/4',
      D: '1/5',
      Cevap: 'C',
    },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sorular');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsed = parseQuestionsSpreadsheet(buf, 4);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].subject, 'Matematik');
  assert.equal(parsed[0].correctOption, 'C');
  assert.equal(Object.keys(parsed[0].options).length, 4);
});
