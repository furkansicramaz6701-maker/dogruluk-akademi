import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeTeacherAnalysisQrToken,
  encodeTeacherAnalysisQrToken,
  extractTeacherAnalysisQrTokenFromText,
} from './qrKeyIntegration';

test('encodeTeacherAnalysisQrToken obscures answer key from raw token inspection', () => {
  const answerKey = 'ABCDABCDABCD';
  const token = encodeTeacherAnalysisQrToken({
    bookletCode: 'B',
    gradeId: '7',
    subjectName: 'Matematik',
    questionCount: 12,
    answerKey,
    examTitle: '7. Sınıf Matematik Kazanım',
    sourceMode: 'farkli-yayin',
    institutionCode8: '81767119',
  });

  assert.ok(token.startsWith('DAK2.'));
  assert.equal(token.includes(answerKey), false);
  assert.equal(token.includes('Matematik'), false);
  assert.equal(token.includes('81767119'), false);
});

test('decodeTeacherAnalysisQrToken round-trips with matching institution code', () => {
  const token = encodeTeacherAnalysisQrToken({
    bookletCode: 'A',
    gradeId: '5',
    subjectName: 'Türkçe',
    questionCount: 16,
    answerKey: 'ABCDA-BCDABCDA-B',
    examTitle: '5. Sınıf Türkçe Değerlendirme',
    sourceMode: 'kurum',
    institutionCode8: '48291045',
  });

  const decoded = decodeTeacherAnalysisQrToken(`KOD: ${token} OKUNDU`, '48291045');
  assert.equal(decoded.valid, true);
  assert.equal(decoded.institutionMismatch, false);
  assert.equal(decoded.payload?.bookletCode, 'A');
  assert.equal(decoded.payload?.gradeId, '5');
  assert.equal(decoded.payload?.subjectName, 'Türkçe');
  assert.equal(decoded.payload?.questionCount, 16);
  assert.equal(decoded.payload?.answerKey, 'ABCDA-BCDABCDA-B');
  assert.equal(decoded.payload?.institutionCode8, '48291045');
});

test('decodeTeacherAnalysisQrToken flags cross-institution scan and rejects tampered tokens', () => {
  const token = encodeTeacherAnalysisQrToken({
    bookletCode: 'C',
    gradeId: '8',
    questionCount: 10,
    answerKey: 'DBCABDCAAB',
    institutionCode8: '73910462',
  });

  const crossInst = decodeTeacherAnalysisQrToken(token, '48291045', ['73910462']);
  assert.equal(crossInst.valid, true);
  assert.equal(crossInst.institutionMismatch, true);
  assert.equal(crossInst.payload?.answerKey, 'DBCABDCAAB');

  const tampered = `${token.slice(0, -3)}XYZ`;
  const failed = decodeTeacherAnalysisQrToken(tampered, '73910462');
  assert.equal(failed.valid, false);
  assert.equal(extractTeacherAnalysisQrTokenFromText('no qr here'), null);
});
