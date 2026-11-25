export interface NormalizedCropRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export type CropDragHandle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export type ImageRotationDeg = 0 | 90 | 180 | 270;

export const MIN_CROP_PCT = 5;

export const DEFAULT_CROP_RECT: NormalizedCropRect = {
  xPct: 8,
  yPct: 10,
  widthPct: 84,
  heightPct: 80,
};

export const FULL_CROP_RECT: NormalizedCropRect = {
  xPct: 0,
  yPct: 0,
  widthPct: 100,
  heightPct: 100,
};

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function normalizeRotationDeg(deg: number): ImageRotationDeg {
  const mod = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod;
  return 0;
}

export function clampCropRect(rect: NormalizedCropRect): NormalizedCropRect {
  const widthPct = clampNum(rect.widthPct, MIN_CROP_PCT, 100);
  const heightPct = clampNum(rect.heightPct, MIN_CROP_PCT, 100);
  const xPct = clampNum(rect.xPct, 0, 100 - widthPct);
  const yPct = clampNum(rect.yPct, 0, 100 - heightPct);

  return {
    xPct: round1(xPct),
    yPct: round1(yPct),
    widthPct: round1(widthPct),
    heightPct: round1(heightPct),
  };
}

export function createCropRectFromPoints(
  startPct: { x: number; y: number },
  endPct: { x: number; y: number }
): NormalizedCropRect {
  const sx = clampNum(startPct.x, 0, 100);
  const sy = clampNum(startPct.y, 0, 100);
  const ex = clampNum(endPct.x, 0, 100);
  const ey = clampNum(endPct.y, 0, 100);

  let x1 = Math.min(sx, ex);
  let x2 = Math.max(sx, ex);
  let y1 = Math.min(sy, ey);
  let y2 = Math.max(sy, ey);

  if (x2 - x1 < MIN_CROP_PCT) {
    if (x1 + MIN_CROP_PCT <= 100) {
      x2 = x1 + MIN_CROP_PCT;
    } else {
      x1 = 100 - MIN_CROP_PCT;
      x2 = 100;
    }
  }
  if (y2 - y1 < MIN_CROP_PCT) {
    if (y1 + MIN_CROP_PCT <= 100) {
      y2 = y1 + MIN_CROP_PCT;
    } else {
      y1 = 100 - MIN_CROP_PCT;
      y2 = 100;
    }
  }

  return clampCropRect({
    xPct: x1,
    yPct: y1,
    widthPct: x2 - x1,
    heightPct: y2 - y1,
  });
}

export function applyCropHandleDrag(
  initial: NormalizedCropRect,
  handle: CropDragHandle,
  deltaXPct: number,
  deltaYPct: number
): NormalizedCropRect {
  const base = clampCropRect(initial);
  if (handle === 'move') {
    return clampCropRect({
      xPct: base.xPct + deltaXPct,
      yPct: base.yPct + deltaYPct,
      widthPct: base.widthPct,
      heightPct: base.heightPct,
    });
  }

  let left = base.xPct;
  let right = base.xPct + base.widthPct;
  let top = base.yPct;
  let bottom = base.yPct + base.heightPct;

  if (handle.includes('w')) {
    left = clampNum(base.xPct + deltaXPct, 0, right - MIN_CROP_PCT);
  }
  if (handle.includes('e')) {
    right = clampNum(base.xPct + base.widthPct + deltaXPct, left + MIN_CROP_PCT, 100);
  }
  if (handle.includes('n')) {
    top = clampNum(base.yPct + deltaYPct, 0, bottom - MIN_CROP_PCT);
  }
  if (handle.includes('s')) {
    bottom = clampNum(base.yPct + base.heightPct + deltaYPct, top + MIN_CROP_PCT, 100);
  }

  return clampCropRect({
    xPct: left,
    yPct: top,
    widthPct: right - left,
    heightPct: bottom - top,
  });
}

export function computeRotatedDimensions(
  naturalWidth: number,
  naturalHeight: number,
  rotationDeg: number
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(naturalWidth || 1));
  const safeH = Math.max(1, Math.round(naturalHeight || 1));
  const rot = normalizeRotationDeg(rotationDeg);
  if (rot === 90 || rot === 270) {
    return { width: safeH, height: safeW };
  }
  return { width: safeW, height: safeH };
}

export function computePixelCropRect(
  rotatedWidth: number,
  rotatedHeight: number,
  rect: NormalizedCropRect
): { sx: number; sy: number; sw: number; sh: number } {
  const safeW = Math.max(1, Math.round(rotatedWidth));
  const safeH = Math.max(1, Math.round(rotatedHeight));
  const clamped = clampCropRect(rect);

  const sx = Math.min(safeW - 1, Math.max(0, Math.round((clamped.xPct / 100) * safeW)));
  const sy = Math.min(safeH - 1, Math.max(0, Math.round((clamped.yPct / 100) * safeH)));
  const sw = Math.min(safeW - sx, Math.max(1, Math.round((clamped.widthPct / 100) * safeW)));
  const sh = Math.min(safeH - sy, Math.max(1, Math.round((clamped.heightPct / 100) * safeH)));

  return { sx, sy, sw, sh };
}

export function isImageUploadFile(file: { name?: string; type?: string }): boolean {
  const mime = (file.type ?? '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (file.name ?? '').toLowerCase();
  return /\.(png|jpe?g|webp|bmp|gif|heic|heif)$/i.test(name);
}

export function formatCropRegionSummary(
  rect: NormalizedCropRect,
  pixels: { sw: number; sh: number },
  rotationDeg: number
): string {
  const r = clampCropRect(rect);
  const rot = normalizeRotationDeg(rotationDeg);
  return `X:${r.xPct}% · Y:${r.yPct}% · ${r.widthPct}%×${r.heightPct}% (${pixels.sw}×${pixels.sh} px${
    rot !== 0 ? ` · ${rot}°` : ''
  })`;
}
