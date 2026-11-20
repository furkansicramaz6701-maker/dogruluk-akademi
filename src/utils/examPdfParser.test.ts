import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import {
  buildVisualQuestionPreset,
  computeKeptUploadedPdfIndices,
  parseExamQuestionsFromRawText,
} from './examPdfParser';

test('computeKeptUploadedPdfIndices removes original front cover and foreign back cover safely', () => {
  // 5-page uploaded PDF: skip page 0 (cover) and page 4 (foreign back cover) -> keep [1, 2, 3]
  assert.deepEqual(
    computeKeptUploadedPdfIndices(5, {
      stripFrontCover: true,
      stripBackCover: true,
      appendBrandedBackPage: true,
    }),
    [1, 2, 3]
  );

  // 2-page PDF with both toggled keeps 1 content page [1] rather than returning empty
  assert.deepEqual(
    computeKeptUploadedPdfIndices(2, {
      stripFrontCover: true,
      stripBackCover: true,
      appendBrandedBackPage: true,
    }),
    [1]
  );

  // Strip only front cover on 4 pages -> [1, 2, 3]
  assert.deepEqual(
    computeKeptUploadedPdfIndices(4, {
      stripFrontCover: true,
      stripBackCover: false,
      appendBrandedBackPage: true,
    }),
    [1, 2, 3]
  );

  // Keep all pages when both disabled -> [0, 1, 2, 3]
  assert.deepEqual(
    computeKeptUploadedPdfIndices(4, {
      stripFrontCover: false,
      stripBackCover: false,
      appendBrandedBackPage: true,
    }),
    [0, 1, 2, 3]
  );
});

test('buildVisualQuestionPreset generates chart, table, math, and image English questions aligned with grade options', () => {
  const g5 = getGradeProfile('5');
  const chartQ = buildVisualQuestionPreset('chart', g5, 1);
  assert.equal(chartQ.visual?.type, 'chart');
  assert.ok((chartQ.visual?.bars?.length ?? 0) >= 3);
  assert.equal(Object.keys(chartQ.options).length, 4);

  const tableQ = buildVisualQuestionPreset('table', g5, 2);
  assert.equal(tableQ.visual?.type, 'table');
  assert.ok((tableQ.visual?.headers?.length ?? 0) >= 3);
  assert.ok((tableQ.visual?.rows?.length ?? 0) >= 2);

  const mathQ = buildVisualQuestionPreset('math', getGradeProfile('10'), 3);
  assert.equal(mathQ.visual?.type, 'math');
  assert.equal(Object.keys(mathQ.options).length, 5);
  assert.ok(Boolean(mathQ.visual?.formula));

  const imgQ = buildVisualQuestionPreset('image', g5, 4, 'weather');
  assert.equal(imgQ.visual?.type, 'image');
  assert.equal(imgQ.visual?.scenePresetId, 'weather');
  assert.equal(imgQ.subject, 'İngilizce');
});

test('parseExamQuestionsFromRawText extracts numbered questions and A-D/A-E options cleanly', () => {
  const g5 = getGradeProfile('5');
  const sampleText = `
1. Bir öğrenci günde 25 sayfa kitap okursa 4 günde kaç sayfa okur?
A) 80 sayfa
B) 90 sayfa
C) 100 sayfa
D) 120 sayfa
Cevap: C

2. Look at the weather visual. What is the weather like in Ankara today?
A) Sunny and warm
B) Rainy and cold
C) Snowy
D) Windy
Doğru Cevap: A
`;

  const parsed = parseExamQuestionsFromRawText(sampleText, g5, 'Deneme-5-Sinif.pdf', 10);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].correctOption, 'C');
  assert.equal(parsed[0].options.C, '100 sayfa');
  assert.equal(parsed[1].correctOption, 'A');
  assert.equal(Object.keys(parsed[1].options).length, 4);
});
