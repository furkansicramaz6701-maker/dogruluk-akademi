import {
  CoverConfig,
  PdfWatermarkConfig,
  PdfWatermarkPlacement,
  PdfWatermarkPreset,
} from '../types/academy';

export const DEFAULT_PDF_WATERMARK_TEXT = 'Doğruluk Akademi - Kurumsal';
export const MIN_WATERMARK_OPACITY = 0.02;
export const MAX_WATERMARK_OPACITY = 0.45;
export const DEFAULT_WATERMARK_OPACITY = 0.08;
export const MIN_WATERMARK_FONT_SCALE = 0.6;
export const MAX_WATERMARK_FONT_SCALE = 1.5;
export const DEFAULT_WATERMARK_FONT_SCALE = 1;
export const MIN_WATERMARK_ANGLE_DEG = -45;
export const MAX_WATERMARK_ANGLE_DEG = 45;
export const DEFAULT_WATERMARK_ANGLE_DEG = -32;

export const WATERMARK_COLOR_OPTIONS: Array<{
  id: string;
  label: string;
  hex: string;
}> = [
  { id: 'auto', label: 'Otomatik Tema', hex: '' },
  { id: 'navy', label: 'Kurumsal Lacivert', hex: '#0f2747' },
  { id: 'slate', label: 'Kurşun Gri', hex: '#334155' },
  { id: 'emerald', label: 'Zümrüt Yeşil', hex: '#065f46' },
  { id: 'crimson', label: 'Akademi Bordo', hex: '#881337' },
];

export const DEFAULT_PDF_WATERMARK_CONFIG: PdfWatermarkConfig = {
  enabled: true,
  text: DEFAULT_PDF_WATERMARK_TEXT,
  placement: 'background',
  opacity: DEFAULT_WATERMARK_OPACITY,
  includeCoverAndBack: true,
  fontScale: DEFAULT_WATERMARK_FONT_SCALE,
  angleDeg: DEFAULT_WATERMARK_ANGLE_DEG,
  colorHex: '',
  stripExistingMargins: false,
};

export const DEFAULT_WATERMARK_PRESET_ID = 'wm-dogruluk-default';

export const DEFAULT_WATERMARK_PRESETS: PdfWatermarkPreset[] = [
  {
    id: DEFAULT_WATERMARK_PRESET_ID,
    text: DEFAULT_PDF_WATERMARK_TEXT,
    placement: 'background',
    opacity: DEFAULT_WATERMARK_OPACITY,
    fontScale: DEFAULT_WATERMARK_FONT_SCALE,
    angleDeg: DEFAULT_WATERMARK_ANGLE_DEG,
    colorHex: '',
    stripExistingMargins: false,
    isDefault: true,
  },
];

export function clampWatermarkOpacity(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WATERMARK_OPACITY;
  }
  const clamped = Math.min(MAX_WATERMARK_OPACITY, Math.max(MIN_WATERMARK_OPACITY, value));
  return Math.round(clamped * 100) / 100;
}

export function clampWatermarkFontScale(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WATERMARK_FONT_SCALE;
  }
  const clamped = Math.min(
    MAX_WATERMARK_FONT_SCALE,
    Math.max(MIN_WATERMARK_FONT_SCALE, value)
  );
  return Math.round(clamped * 100) / 100;
}

export function clampWatermarkAngleDeg(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WATERMARK_ANGLE_DEG;
  }
  const clamped = Math.min(
    MAX_WATERMARK_ANGLE_DEG,
    Math.max(MIN_WATERMARK_ANGLE_DEG, value)
  );
  return Math.round(clamped);
}

export function normalizeWatermarkPlacement(
  placement: unknown
): PdfWatermarkPlacement {
  if (placement === 'header-footer' || placement === 'both' || placement === 'background') {
    return placement;
  }
  return 'background';
}

export function resolvePdfWatermarkConfig(
  watermark?: Partial<PdfWatermarkConfig> | null
): PdfWatermarkConfig {
  const rawText = typeof watermark?.text === 'string' ? watermark.text.trim() : '';
  const colorHex =
    typeof watermark?.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(watermark.colorHex.trim())
      ? watermark.colorHex.trim()
      : '';
  return {
    enabled: watermark?.enabled ?? DEFAULT_PDF_WATERMARK_CONFIG.enabled,
    text: rawText.length > 0 ? rawText : DEFAULT_PDF_WATERMARK_TEXT,
    placement: normalizeWatermarkPlacement(watermark?.placement),
    opacity: clampWatermarkOpacity(watermark?.opacity),
    includeCoverAndBack:
      watermark?.includeCoverAndBack ?? DEFAULT_PDF_WATERMARK_CONFIG.includeCoverAndBack,
    fontScale: clampWatermarkFontScale(watermark?.fontScale),
    angleDeg: clampWatermarkAngleDeg(watermark?.angleDeg),
    colorHex,
    stripExistingMargins: Boolean(watermark?.stripExistingMargins),
  };
}

export function normalizeWatermarkKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function ensureWatermarkPresetList(
  presets?: PdfWatermarkPreset[] | null
): PdfWatermarkPreset[] {
  const valid = Array.isArray(presets)
    ? presets
        .filter((p) => p && typeof p.text === 'string' && p.text.trim().length > 0)
        .map((p) => {
          const resolved = resolvePdfWatermarkConfig(p);
          return {
            id: p.id || `wm-${normalizeWatermarkKey(resolved.text)}`,
            text: resolved.text,
            placement: resolved.placement,
            opacity: resolved.opacity,
            fontScale: resolved.fontScale,
            angleDeg: resolved.angleDeg,
            colorHex: resolved.colorHex,
            stripExistingMargins: resolved.stripExistingMargins,
            isDefault: Boolean(p.isDefault || p.id === DEFAULT_WATERMARK_PRESET_ID),
          };
        })
    : [];

  if (!valid.some((p) => p.id === DEFAULT_WATERMARK_PRESET_ID)) {
    return [DEFAULT_WATERMARK_PRESETS[0], ...valid];
  }
  return valid;
}

export function upsertWatermarkPreset(
  list: PdfWatermarkPreset[],
  input: {
    id?: string;
    text: string;
    placement?: PdfWatermarkPlacement;
    opacity?: number;
    fontScale?: number;
    angleDeg?: number;
    colorHex?: string;
    stripExistingMargins?: boolean;
  }
): {
  ok: boolean;
  presets: PdfWatermarkPreset[];
  saved?: PdfWatermarkPreset;
  wasUpdated: boolean;
  reason?: string;
} {
  const cleanText = input.text.trim().replace(/\s+/g, ' ');
  if (!cleanText) {
    return {
      ok: false,
      presets: ensureWatermarkPresetList(list),
      wasUpdated: false,
      reason: 'Filigran metni boş bırakılamaz.',
    };
  }
  const normalizedList = ensureWatermarkPresetList(list);
  const key = normalizeWatermarkKey(cleanText);
  const resolved = resolvePdfWatermarkConfig({ ...input, text: cleanText });

  const byIdIdx = input.id ? normalizedList.findIndex((p) => p.id === input.id) : -1;
  const byTextIdx = normalizedList.findIndex((p) => normalizeWatermarkKey(p.text) === key);
  const matchIdx = byIdIdx !== -1 ? byIdIdx : byTextIdx;

  if (matchIdx !== -1) {
    const existing = normalizedList[matchIdx];
    if (byIdIdx !== -1 && byTextIdx !== -1 && byTextIdx !== byIdIdx) {
      return {
        ok: false,
        presets: normalizedList,
        wasUpdated: false,
        reason: `"${normalizedList[byTextIdx].text}" adlı filigran zaten kayıtlı.`,
      };
    }
    const updated: PdfWatermarkPreset = {
      ...existing,
      text: cleanText,
      placement: resolved.placement,
      opacity: resolved.opacity,
      fontScale: resolved.fontScale,
      angleDeg: resolved.angleDeg,
      colorHex: resolved.colorHex,
      stripExistingMargins: resolved.stripExistingMargins,
    };
    return {
      ok: true,
      presets: normalizedList.map((p, idx) => (idx === matchIdx ? updated : p)),
      saved: updated,
      wasUpdated: true,
    };
  }

  const created: PdfWatermarkPreset = {
    id: `wm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    text: cleanText,
    placement: resolved.placement,
    opacity: resolved.opacity,
    fontScale: resolved.fontScale,
    angleDeg: resolved.angleDeg,
    colorHex: resolved.colorHex,
    stripExistingMargins: resolved.stripExistingMargins,
    isDefault: false,
  };
  return {
    ok: true,
    presets: [...normalizedList, created],
    saved: created,
    wasUpdated: false,
  };
}

export function deleteWatermarkPreset(
  list: PdfWatermarkPreset[],
  id: string
): {
  ok: boolean;
  presets: PdfWatermarkPreset[];
  reason?: string;
} {
  const normalizedList = ensureWatermarkPresetList(list);
  const target = normalizedList.find((p) => p.id === id);
  if (!target) {
    return {
      ok: false,
      presets: normalizedList,
      reason: 'Silinecek filigran bulunamadı.',
    };
  }
  if (target.isDefault || target.id === DEFAULT_WATERMARK_PRESET_ID) {
    return {
      ok: false,
      presets: normalizedList,
      reason: 'Varsayılan Doğruluk Akademi kurumsal filigranı silinemez; metni düzenleyebilirsiniz.',
    };
  }
  return {
    ok: true,
    presets: normalizedList.filter((p) => p.id !== id),
  };
}

export function buildWatermarkDisplayText(
  config: PdfWatermarkConfig,
  cover?: Partial<Pick<CoverConfig, 'isSampleDemo'>>
): string {
  const base = config.text.trim() || DEFAULT_PDF_WATERMARK_TEXT;
  if (cover?.isSampleDemo && !base.toLocaleUpperCase('tr-TR').includes('ÖRNEK')) {
    return `${base} · ÖRNEKTİR`;
  }
  return base;
}

export function computeWatermarkPlacements(
  placement: PdfWatermarkPlacement
): { drawBackground: boolean; drawHeaderFooter: boolean } {
  return {
    drawBackground: placement === 'background' || placement === 'both',
    drawHeaderFooter: placement === 'header-footer' || placement === 'both',
  };
}

export function computeDiagonalWatermarkFontSize(
  textLength: number,
  baseFontSize = 58,
  minFontSize = 28
): number {
  if (textLength <= 28) return baseFontSize;
  const excess = textLength - 28;
  return Math.max(minFontSize, Math.round(baseFontSize - excess * 0.9));
}

export function computeCenteredRotatedPosition(params: {
  centerX: number;
  centerY: number;
  textWidth: number;
  textHeight: number;
  angleDeg: number;
}): { x: number; y: number } {
  const rad = (params.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = params.textWidth / 2;
  const halfH = params.textHeight / 2;
  return {
    x: params.centerX - (halfW * cos - halfH * sin),
    y: params.centerY - (halfW * sin + halfH * cos),
  };
}

export interface DrawCanvasWatermarkOptions {
  colorHex?: string;
  isSampleDemo?: boolean;
  isCoverOrBack?: boolean;
  repeatRows?: boolean;
  headerY?: number;
  footerY?: number;
}

export function drawCanvasWatermark(
  ctx: CanvasRenderingContext2D,
  pageWidth: number,
  pageHeight: number,
  rawConfig?: Partial<PdfWatermarkConfig> | null,
  options: DrawCanvasWatermarkOptions = {}
): void {
  const config = resolvePdfWatermarkConfig(rawConfig);
  if (!config.enabled) return;
  if (options.isCoverOrBack && !config.includeCoverAndBack) return;

  const displayText = buildWatermarkDisplayText(config, {
    isSampleDemo: options.isSampleDemo,
  });
  const { drawBackground, drawHeaderFooter } = computeWatermarkPlacements(config.placement);
  const colorHex = config.colorHex || options.colorHex || '#0f2747';
  const fontScale = config.fontScale ?? DEFAULT_WATERMARK_FONT_SCALE;
  const angleRad = ((config.angleDeg ?? DEFAULT_WATERMARK_ANGLE_DEG) * Math.PI) / 180;

  if (drawBackground) {
    const baseSize = computeDiagonalWatermarkFontSize(
      displayText.length,
      options.isCoverOrBack ? 52 : 58,
      28
    );
    const fontSize = Math.max(18, Math.round(baseSize * fontScale));
    const offsets = options.repeatRows === false || options.isCoverOrBack ? [0] : [-420, 0, 420];
    ctx.save();
    ctx.translate(pageWidth / 2, pageHeight / 2);
    ctx.rotate(angleRad);
    ctx.globalAlpha = config.opacity;
    ctx.fillStyle = colorHex;
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const dy of offsets) {
      ctx.fillText(displayText, 0, dy, pageWidth * 1.05);
    }
    ctx.restore();
  }

  if (drawHeaderFooter) {
    const headerY = options.headerY ?? 19;
    const footerY = options.footerY ?? pageHeight - 21;
    const hfFontSize = Math.max(10, Math.round(14 * fontScale));
    ctx.save();
    ctx.globalAlpha = config.opacity;
    ctx.fillStyle = colorHex;
    ctx.font = `800 ${hfFontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, pageWidth / 2, headerY, pageWidth - 120);
    ctx.fillText(displayText, pageWidth / 2, footerY, pageWidth - 120);
    ctx.restore();
  }
}
