import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentDigitalKarneUrl,
  formatShortDigitalKarneHost,
  normalizeDigitalKarneBaseUrl,
  parseDigitalKarneQuery,
} from './digitalKarneQr';

test('normalizeDigitalKarneBaseUrl normalizes bare domain and strips trailing slashes', () => {
  assert.equal(
    normalizeDigitalKarneBaseUrl('dogruluk-akademi.vercel.app/'),
    'https://dogruluk-akademi.vercel.app'
  );
  assert.equal(
    normalizeDigitalKarneBaseUrl('https://okul.example.com/panel/'),
    'https://okul.example.com/panel'
  );
});

test('buildStudentDigitalKarneUrl creates valid deep link and parseDigitalKarneQuery roundtrips Turkish names', () => {
  const url = buildStudentDigitalKarneUrl({
    baseUrl: 'dogruluk-akademi.vercel.app',
    institutionCode8: '31570113',
    studentNumber: '31548538',
    studentName: 'İrem Şahin',
    classroom: '5-A',
    gradeId: '5',
    isSampleDemo: true,
  });

  assert.ok(url.startsWith('https://dogruluk-akademi.vercel.app/?'));
  const search = url.slice(url.indexOf('?'));
  const parsed = parseDigitalKarneQuery(search);

  assert.equal(parsed.isDigitalKarneDeepLink, true);
  assert.equal(parsed.tab, 'reports');
  assert.equal(parsed.institutionCode8, '31570113');
  assert.equal(parsed.studentNumber8, '31548538');
  assert.equal(parsed.studentName, 'İrem Şahin');
  assert.equal(parsed.classroom, '5-A');
  assert.equal(parsed.gradeId, '5');
  assert.equal(parsed.isSampleDemo, true);
  assert.equal(formatShortDigitalKarneHost(url), 'dogruluk-akademi.vercel.app');
});

test('parseDigitalKarneQuery ignores invalid grade ids and non-reports URLs safely', () => {
  const plain = parseDigitalKarneQuery('?tab=dashboard');
  assert.equal(plain.isDigitalKarneDeepLink, false);
  assert.equal(plain.tab, null);

  const badGrade = parseDigitalKarneQuery('?tab=reports&inst=31570113&grade=99&stu=12345678');
  assert.equal(badGrade.isDigitalKarneDeepLink, true);
  assert.equal(badGrade.gradeId, undefined);
  assert.equal(badGrade.studentNumber8, '12345678');
  assert.equal(badGrade.isSampleDemo, false);
});
