import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWatermarkDisplayText,
  clampWatermarkAngleDeg,
  clampWatermarkFontScale,
  clampWatermarkOpacity,
  computeCenteredRotatedPosition,
  computeDiagonalWatermarkFontSize,
  computeWatermarkPlacements,
  DEFAULT_PDF_WATERMARK_CONFIG,
  DEFAULT_PDF_WATERMARK_TEXT,
  DEFAULT_WATERMARK_PRESET_ID,
  DEFAULT_WATERMARK_PRESETS,
  deleteWatermarkPreset,
  drawCanvasWatermark,
  MAX_WATERMARK_ANGLE_DEG,
  MAX_WATERMARK_FONT_SCALE,
  MAX_WATERMARK_OPACITY,
  MIN_WATERMARK_ANGLE_DEG,
  MIN_WATERMARK_FONT_SCALE,
  MIN_WATERMARK_OPACITY,
  resolvePdfWatermarkConfig,
  upsertWatermarkPreset,
} from './pdfWatermark';

test('resolvePdfWatermarkConfig returns corporate default config when undefined', () => {
  const resolved = resolvePdfWatermarkConfig(undefined);
  assert.deepEqual(resolved, DEFAULT_PDF_WATERMARK_CONFIG);
  assert.equal(resolved.text, 'Doğruluk Akademi - Kurumsal');
  assert.equal(resolved.placement, 'background');
  assert.equal(resolved.opacity, 0.08);
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.includeCoverAndBack, true);
  assert.equal(resolved.fontScale, 1);
  assert.equal(resolved.angleDeg, -32);
  assert.equal(resolved.colorHex, '');
  assert.equal(resolved.stripExistingMargins, false);
});

test('clampWatermarkOpacity, clampWatermarkFontScale, clampWatermarkAngleDeg clamp bounds cleanly', () => {
  assert.equal(clampWatermarkOpacity(undefined), 0.08);
  assert.equal(clampWatermarkOpacity(Number.NaN), 0.08);
  assert.equal(clampWatermarkOpacity(-0.5), MIN_WATERMARK_OPACITY);
  assert.equal(clampWatermarkOpacity(0), MIN_WATERMARK_OPACITY);
  assert.equal(clampWatermarkOpacity(0.18), 0.18);
  assert.equal(clampWatermarkOpacity(0.95), MAX_WATERMARK_OPACITY);

  assert.equal(clampWatermarkFontScale(undefined), 1);
  assert.equal(clampWatermarkFontScale(0.1), MIN_WATERMARK_FONT_SCALE);
  assert.equal(clampWatermarkFontScale(2.8), MAX_WATERMARK_FONT_SCALE);
  assert.equal(clampWatermarkFontScale(1.25), 1.25);

  assert.equal(clampWatermarkAngleDeg(undefined), -32);
  assert.equal(clampWatermarkAngleDeg(-90), MIN_WATERMARK_ANGLE_DEG);
  assert.equal(clampWatermarkAngleDeg(90), MAX_WATERMARK_ANGLE_DEG);
  assert.equal(clampWatermarkAngleDeg(-20), -20);
});

test('resolvePdfWatermarkConfig falls back to default text on blank input and sanitizes colorHex', () => {
  const resolved = resolvePdfWatermarkConfig({
    enabled: true,
    text: '   ',
    placement: 'both',
    opacity: 0.25,
    includeCoverAndBack: false,
    fontScale: 1.3,
    angleDeg: -20,
    colorHex: '#881337',
    stripExistingMargins: true,
  });
  assert.equal(resolved.text, DEFAULT_PDF_WATERMARK_TEXT);
  assert.equal(resolved.placement, 'both');
  assert.equal(resolved.opacity, 0.25);
  assert.equal(resolved.includeCoverAndBack, false);
  assert.equal(resolved.fontScale, 1.3);
  assert.equal(resolved.angleDeg, -20);
  assert.equal(resolved.colorHex, '#881337');
  assert.equal(resolved.stripExistingMargins, true);

  const invalidColor = resolvePdfWatermarkConfig({ colorHex: 'red' });
  assert.equal(invalidColor.colorHex, '');
});

test('upsertWatermarkPreset and deleteWatermarkPreset manage adding, editing, and protecting default preset', () => {
  const added = upsertWatermarkPreset(DEFAULT_WATERMARK_PRESETS, {
    text: '  Rıfkı  erikci ',
    placement: 'both',
    opacity: 0.2,
    fontScale: 1.1,
    angleDeg: -25,
    colorHex: '#0f2747',
  });
  assert.equal(added.ok, true);
  assert.equal(added.wasUpdated, false);
  assert.equal(added.presets.length, 2);
  assert.equal(added.saved?.text, 'Rıfkı erikci');

  // Edit / fix existing custom preset by id
  const edited = upsertWatermarkPreset(added.presets, {
    id: added.saved!.id,
    text: 'Rıfkı Erikçi - Özel Deneme',
    placement: 'header-footer',
    opacity: 0.3,
    stripExistingMargins: true,
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.wasUpdated, true);
  assert.equal(edited.presets.length, 2);
  assert.equal(edited.saved?.text, 'Rıfkı Erikçi - Özel Deneme');
  assert.equal(edited.saved?.placement, 'header-footer');
  assert.equal(edited.saved?.stripExistingMargins, true);

  // Blank text fails cleanly
  const blank = upsertWatermarkPreset(edited.presets, { text: '   ' });
  assert.equal(blank.ok, false);

  // Default preset cannot be deleted
  const blockDefaultDelete = deleteWatermarkPreset(edited.presets, DEFAULT_WATERMARK_PRESET_ID);
  assert.equal(blockDefaultDelete.ok, false);
  assert.equal(blockDefaultDelete.presets.length, 2);

  // Custom preset deletes cleanly
  const deletedCustom = deleteWatermarkPreset(edited.presets, added.saved!.id);
  assert.equal(deletedCustom.ok, true);
  assert.equal(deletedCustom.presets.length, 1);
  assert.equal(deletedCustom.presets[0].id, DEFAULT_WATERMARK_PRESET_ID);
});

test('buildWatermarkDisplayText appends sample marker only when demo and not duplicated', () => {
  const cfg = resolvePdfWatermarkConfig({ text: 'Doğruluk Akademi - Kurumsal' });
  assert.equal(buildWatermarkDisplayText(cfg, { isSampleDemo: false }), 'Doğruluk Akademi - Kurumsal');
  assert.equal(
    buildWatermarkDisplayText(cfg, { isSampleDemo: true }),
    'Doğruluk Akademi - Kurumsal · ÖRNEKTİR'
  );

  const customWithExample = resolvePdfWatermarkConfig({ text: 'Akademi ÖRNEK Deneme' });
  assert.equal(
    buildWatermarkDisplayText(customWithExample, { isSampleDemo: true }),
    'Akademi ÖRNEK Deneme'
  );
});

test('computeWatermarkPlacements resolves background, header-footer, and both', () => {
  assert.deepEqual(computeWatermarkPlacements('background'), {
    drawBackground: true,
    drawHeaderFooter: false,
  });
  assert.deepEqual(computeWatermarkPlacements('header-footer'), {
    drawBackground: false,
    drawHeaderFooter: true,
  });
  assert.deepEqual(computeWatermarkPlacements('both'), {
    drawBackground: true,
    drawHeaderFooter: true,
  });
});

test('computeDiagonalWatermarkFontSize scales down long custom watermark strings', () => {
  assert.equal(computeDiagonalWatermarkFontSize(26, 58, 28), 58);
  assert.ok(computeDiagonalWatermarkFontSize(60, 58, 28) < 58);
  assert.equal(computeDiagonalWatermarkFontSize(200, 58, 28), 28);
});

test('computeCenteredRotatedPosition centers horizontal and rotated text mathematically', () => {
  const pos0 = computeCenteredRotatedPosition({
    centerX: 300,
    centerY: 400,
    textWidth: 100,
    textHeight: 20,
    angleDeg: 0,
  });
  assert.equal(Math.round(pos0.x), 250);
  assert.equal(Math.round(pos0.y), 390);

  const pos90 = computeCenteredRotatedPosition({
    centerX: 300,
    centerY: 400,
    textWidth: 100,
    textHeight: 20,
    angleDeg: 90,
  });
  assert.equal(Math.round(pos90.x), 310);
  assert.equal(Math.round(pos90.y), 350);
});

test('drawCanvasWatermark respects enabled, cover toggle, opacity, colorHex, and placement', () => {
  function createMockCtx() {
    const calls: Array<{ text: string; x: number; y: number; alpha: number; color: string; font: string }> = [];
    let currentAlpha = 1;
    let currentColor = '';
    let currentFont = '';
    const ctx = {
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      get fillStyle() {
        return currentColor;
      },
      set fillStyle(v: string) {
        currentColor = v;
      },
      get font() {
        return currentFont;
      },
      set font(v: string) {
        currentFont = v;
      },
      textAlign: 'left',
      textBaseline: 'alphabetic',
      get globalAlpha() {
        return currentAlpha;
      },
      set globalAlpha(v: number) {
        currentAlpha = v;
      },
      fillText(text: string, x: number, y: number) {
        calls.push({ text, x, y, alpha: currentAlpha, color: currentColor, font: currentFont });
      },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  {
    const { ctx, calls } = createMockCtx();
    drawCanvasWatermark(ctx, 1240, 1754, { enabled: false });
    assert.equal(calls.length, 0);
  }

  {
    const { ctx, calls } = createMockCtx();
    drawCanvasWatermark(
      ctx,
      1240,
      1754,
      { enabled: true, includeCoverAndBack: false },
      { isCoverOrBack: true }
    );
    assert.equal(calls.length, 0);
  }

  {
    const { ctx, calls } = createMockCtx();
    drawCanvasWatermark(ctx, 1240, 1754, {
      enabled: true,
      text: 'Doğruluk Akademi - Kurumsal',
      placement: 'header-footer',
      opacity: 0.22,
      colorHex: '#881337',
      fontScale: 1.2,
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].y, 19);
    assert.equal(calls[1].y, 1754 - 21);
    assert.equal(calls[0].alpha, 0.22);
    assert.equal(calls[0].color, '#881337');
    assert.ok(calls[0].font.includes('17px'));
  }

  {
    const { ctx, calls } = createMockCtx();
    drawCanvasWatermark(ctx, 1240, 1754, {
      enabled: true,
      text: 'Doğruluk Akademi - Kurumsal',
      placement: 'both',
      opacity: 0.15,
    });
    assert.equal(calls.length, 5);
    assert.ok(calls.every((c) => c.alpha === 0.15));
  }
});
