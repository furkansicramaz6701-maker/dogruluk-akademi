import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCropHandleDrag,
  clampCropRect,
  computePixelCropRect,
  computeRotatedDimensions,
  createCropRectFromPoints,
  formatCropRegionSummary,
  isImageUploadFile,
  MIN_CROP_PCT,
  normalizeRotationDeg,
} from './opticalRegionEditor';

test('clampCropRect bounds coordinates and enforces minimum dimensions', () => {
  const clamped = clampCropRect({
    xPct: 98,
    yPct: -10,
    widthPct: 2,
    heightPct: 140,
  });
  assert.equal(clamped.widthPct, MIN_CROP_PCT);
  assert.equal(clamped.heightPct, 100);
  assert.equal(clamped.xPct, 95);
  assert.equal(clamped.yPct, 0);
});

test('createCropRectFromPoints handles reverse drag and enforces minimum size', () => {
  const normal = createCropRectFromPoints({ x: 60, y: 80 }, { x: 20, y: 30 });
  assert.deepEqual(normal, {
    xPct: 20,
    yPct: 30,
    widthPct: 40,
    heightPct: 50,
  });

  const tiny = createCropRectFromPoints({ x: 99, y: 99 }, { x: 99, y: 99 });
  assert.equal(tiny.widthPct, MIN_CROP_PCT);
  assert.equal(tiny.heightPct, MIN_CROP_PCT);
  assert.equal(tiny.xPct, 95);
  assert.equal(tiny.yPct, 95);
});

test('applyCropHandleDrag moves and resizes all edges without inverting or overflowing', () => {
  const base = { xPct: 20, yPct: 20, widthPct: 40, heightPct: 40 };

  const moved = applyCropHandleDrag(base, 'move', 50, 50);
  assert.deepEqual(moved, { xPct: 60, yPct: 60, widthPct: 40, heightPct: 40 });

  const resizedNw = applyCropHandleDrag(base, 'nw', -10, 10);
  assert.deepEqual(resizedNw, { xPct: 10, yPct: 30, widthPct: 50, heightPct: 30 });

  const clampedSe = applyCropHandleDrag(base, 'se', -100, -100);
  assert.equal(clampedSe.widthPct, MIN_CROP_PCT);
  assert.equal(clampedSe.heightPct, MIN_CROP_PCT);
  assert.equal(clampedSe.xPct, 20);
  assert.equal(clampedSe.yPct, 20);
});

test('computeRotatedDimensions and computePixelCropRect calculate exact canvas pixel slices', () => {
  assert.equal(normalizeRotationDeg(-90), 270);
  assert.equal(normalizeRotationDeg(450), 90);

  const dims90 = computeRotatedDimensions(1200, 800, 90);
  assert.deepEqual(dims90, { width: 800, height: 1200 });

  const px = computePixelCropRect(dims90.width, dims90.height, {
    xPct: 25,
    yPct: 50,
    widthPct: 50,
    heightPct: 25,
  });
  assert.deepEqual(px, { sx: 200, sy: 600, sw: 400, sh: 300 });
});

test('isImageUploadFile and formatCropRegionSummary identify images and summarize regions cleanly', () => {
  assert.equal(isImageUploadFile({ name: 'key.png', type: 'image/png' }), true);
  assert.equal(isImageUploadFile({ name: 'photo.JPG', type: '' }), true);
  assert.equal(isImageUploadFile({ name: 'sheet.xlsx', type: 'application/vnd.ms-excel' }), false);

  const summary = formatCropRegionSummary(
    { xPct: 10, yPct: 15, widthPct: 70, heightPct: 65 },
    { sw: 560, sh: 780 },
    90
  );
  assert.equal(summary.includes('560×780 px'), true);
  assert.equal(summary.includes('90°'), true);
});
