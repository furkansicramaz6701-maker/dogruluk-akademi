import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentReportPdfFilename,
  dataUrlToUint8Array,
  normalizeTurkishSlug,
  sanitizeDownloadFilename,
  uint8ArrayToBlob,
  uint8ArrayToPdfBlob,
} from './downloadHelpers';

test('normalizeTurkishSlug converts Turkish characters to clean ASCII kebab-case', () => {
  assert.equal(normalizeTurkishSlug('5. Sınıf Öğrenci Şükrü Çınar'), '5-sinif-ogrenci-sukru-cinar');
  assert.equal(normalizeTurkishSlug('   İğneada Örnek Ünitesi   '), 'igneada-ornek-unitesi');
  assert.equal(normalizeTurkishSlug('---!!!---', 'ogrenci'), 'ogrenci');
  assert.equal(normalizeTurkishSlug('', 'varsayilan'), 'varsayilan');
});

test('sanitizeDownloadFilename removes trailing dashes before extension and strips illegal chars', () => {
  assert.equal(
    sanitizeDownloadFilename('Karne-Analizi-ogrenci-.pdf'),
    'Karne-Analizi-ogrenci.pdf'
  );
  assert.equal(
    sanitizeDownloadFilename('Haftalik:Liste/Analizi*?.xlsx'),
    'Haftalik-Liste-Analizi.xlsx'
  );
  assert.equal(
    sanitizeDownloadFilename('   .pdf   ', 'rapor'),
    'rapor.pdf'
  );
});

test('buildStudentReportPdfFilename handles Turkish names and empty student numbers without trailing dashes', () => {
  assert.equal(
    buildStudentReportPdfFilename('5. Sınıf Öğrenci 01', '05001001'),
    'Karne-Analizi-5-sinif-ogrenci-01-05001001.pdf'
  );
  assert.equal(
    buildStudentReportPdfFilename('Ayşe Yılmaz', ''),
    'Karne-Analizi-ayse-yilmaz.pdf'
  );
  assert.equal(
    buildStudentReportPdfFilename('', undefined),
    'Karne-Analizi-ogrenci.pdf'
  );
});

test('uint8ArrayToBlob slices subarrays safely without leaking underlying buffer bytes', async () => {
  const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const subView = backing.subarray(2, 6); // [3, 4, 5, 6]
  const blob = uint8ArrayToBlob(subView, 'application/octet-stream');

  assert.equal(blob.size, 4);
  const out = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(out), [3, 4, 5, 6]);
});

test('uint8ArrayToPdfBlob rejects empty arrays and sets application/pdf type', async () => {
  assert.throws(() => uint8ArrayToPdfBlob(new Uint8Array(0)), /boş/);

  const sample = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const pdfBlob = uint8ArrayToPdfBlob(sample);
  assert.equal(pdfBlob.type, 'application/pdf');
  assert.equal(pdfBlob.size, 5);
});

test('dataUrlToUint8Array decodes base64 payloads accurately', () => {
  const raw = 'Hello-PDF';
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  const bytes = dataUrlToUint8Array(`data:text/plain;base64,${b64}`);
  assert.equal(Buffer.from(bytes).toString('utf8'), raw);
});
