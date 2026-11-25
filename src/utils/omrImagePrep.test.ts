import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTargetDimensions,
  inferImageMimeType,
  normalizeDetectedAnswersString,
  resolveTargetKeyBooklet,
  safeParseOmrApiResponse,
} from './omrImagePrep';

test('inferImageMimeType handles missing mobile picker mime types cleanly', () => {
  assert.equal(inferImageMimeType({ type: '', name: 'IMG_20261125.JPG' }), 'image/jpeg');
  assert.equal(inferImageMimeType({ type: 'application/octet-stream', name: 'Screenshot.png' }), 'image/png');
  assert.equal(inferImageMimeType({ type: '', name: 'cevap_anahtari.pdf' }), 'application/pdf');
  assert.equal(inferImageMimeType({ type: 'image/webp', name: 'scan.webp' }), 'image/webp');
});

test('computeTargetDimensions scales down large mobile photos while preserving aspect ratio', () => {
  assert.deepEqual(computeTargetDimensions(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(computeTargetDimensions(1080, 2400, 1600), { width: 720, height: 1600 });
  assert.deepEqual(computeTargetDimensions(800, 600, 1600), { width: 800, height: 600 });
});

test('resolveTargetKeyBooklet respects explicit booklet A upload over ambiguous model detection', () => {
  assert.equal(
    resolveTargetKeyBooklet({
      explicitBookletCode: 'A',
      detectedBookletCode: 'B',
      activeBookletCode: 'C',
    }),
    'A'
  );
  assert.equal(
    resolveTargetKeyBooklet({
      explicitBookletCode: undefined,
      detectedBookletCode: 'D',
      activeBookletCode: 'A',
    }),
    'D'
  );
  assert.equal(
    resolveTargetKeyBooklet({
      explicitBookletCode: undefined,
      detectedBookletCode: '',
      activeBookletCode: 'B',
    }),
    'B'
  );
});

test('normalizeDetectedAnswersString strips question numbers and restricts invalid options', () => {
  const numbered = '1-A 2.B 3:C 4) D 5- - 6-E 7-A 8-B 9-C 10-D 11-A 12-B';
  assert.equal(normalizeDetectedAnswersString(numbered, 12, 4), 'ABCD--ABCDAB');
  assert.equal(normalizeDetectedAnswersString('a b c d e - a b c d e a', 12, 5), 'ABCDE-ABCDEA');
  assert.equal(normalizeDetectedAnswersString('ABCDEABCD', 12, 4), 'ABCD-ABCD');
});

test('safeParseOmrApiResponse gracefully reports HTML 413/502 proxy errors without throwing', () => {
  const html413 = safeParseOmrApiResponse(413, '<html><body>413 Request Entity Too Large</body></html>');
  assert.equal(html413.ok, false);
  assert.match(html413.error || '', /413/);

  const json503 = safeParseOmrApiResponse(503, JSON.stringify({ error: 'Servis geçici meşgul' }));
  assert.equal(json503.ok, false);
  assert.equal(json503.error, 'Servis geçici meşgul');

  const valid = safeParseOmrApiResponse(
    200,
    JSON.stringify({
      answersString: 'ABCDABCDABCD',
      detectedCount: 12,
      bookletCode: 'A',
      bookletKeys: { A: 'ABCDABCDABCD', B: 'BCDABCDABCDA' },
    })
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.bookletCode, 'A');
  assert.equal(valid.bookletKeys.B, 'BCDABCDABCDA');
});
