import { BookletCode } from '../types/academy';

const VALID_BOOKLET_CODES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D']);

export interface SafeOmrParseResult {
  ok: boolean;
  status: number;
  answersString: string;
  detectedCount: number;
  bookletCode?: BookletCode;
  bookletKeys: Partial<Record<BookletCode, string>>;
  detectedSubject?: string;
  detectedStudentNumber?: string;
  detectedQrUrl?: string;
  detectedAnalysisQr?: string;
  notes?: string;
  error?: string;
}

export function inferImageMimeType(file: { type?: string; name?: string }): string {
  const rawType = (file.type || '').trim().toLowerCase();
  if (rawType && rawType !== 'application/octet-stream') {
    return rawType;
  }
  const name = (file.name || '').trim().toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

export function computeTargetDimensions(
  width: number,
  height: number,
  maxSide = 1600
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: maxSide, height: maxSide };
  }
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function normalizeBookletCodeCandidate(raw?: string | null): BookletCode | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-D]/g, '');
  if (cleaned.length === 1 && VALID_BOOKLET_CODES.has(cleaned)) {
    return cleaned as BookletCode;
  }
  return undefined;
}

/**
 * Resolves which booklet column (A/B/C/D) an uploaded answer key belongs to.
 * When the user explicitly initiates an upload from a specific booklet card (e.g. A),
 * that target MUST never be overwritten by an ambiguous model guess.
 */
export function resolveTargetKeyBooklet(params: {
  explicitBookletCode?: BookletCode;
  detectedBookletCode?: string | null;
  activeBookletCode: BookletCode;
}): BookletCode {
  if (params.explicitBookletCode && VALID_BOOKLET_CODES.has(params.explicitBookletCode)) {
    return params.explicitBookletCode;
  }
  const detected = normalizeBookletCodeCandidate(params.detectedBookletCode);
  if (detected) {
    return detected;
  }
  return params.activeBookletCode;
}

/**
 * Cleans Gemini/OCR answer outputs that may include numbering ("1-A 2.B 3: -"),
 * whitespace, or multi-mark placeholders into a contiguous answer string.
 */
export function normalizeDetectedAnswersString(
  raw: string,
  expectedCount: number,
  optionCount: 4 | 5
): string {
  const allowed = optionCount === 4 ? new Set(['A', 'B', 'C', 'D']) : new Set(['A', 'B', 'C', 'D', 'E']);
  const source = (raw || '').toUpperCase().trim();
  if (!source) return '';

  const numberedPairRegex = /(?:^|[\s,;|])\d{1,3}\s*[.):\-–]\s*([A-E\-*X?_])/g;
  const numberedTokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = numberedPairRegex.exec(source)) !== null) {
    const ch = match[1];
    if (allowed.has(ch)) {
      numberedTokens.push(ch);
    } else if (ch === '-' || ch === '*' || ch === '?' || ch === '_' || ch === 'X' || ch === 'E') {
      numberedTokens.push('-');
    }
  }

  let result = '';
  if (numberedTokens.length >= Math.max(3, Math.floor(expectedCount * 0.25))) {
    result = numberedTokens.join('');
  } else {
    // Strip leading question numbers like "1.A" or "12)B" first, then collect answer characters
    const strippedNumbers = source.replace(/(?:^|[\s,;|])\d{1,3}\s*[.):\-–]?\s*(?=[A-E\-*?_])/g, '');
    const out: string[] = [];
    for (const ch of strippedNumbers) {
      if (allowed.has(ch)) {
        out.push(ch);
      } else if (ch === '-' || ch === '*' || ch === '?' || ch === '_') {
        out.push('-');
      } else if (optionCount === 4 && ch === 'E') {
        out.push('-');
      }
    }
    result = out.join('');
  }

  return expectedCount > 0 ? result.slice(0, expectedCount) : result;
}

export function safeParseOmrApiResponse(status: number, rawText: string): SafeOmrParseResult {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      status,
      answersString: '',
      detectedCount: 0,
      bookletKeys: {},
      error:
        status === 413
          ? 'Görsel boyutu sunucu sınırını aştı (413). Lütfen daha küçük veya kırpılmış görsel yükleyin.'
          : `Sunucudan boş yanıt alındı (HTTP ${status}).`,
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const lower = trimmed.toLowerCase();
    let errorMsg = `Sunucu geçerli JSON döndürmedi (HTTP ${status}).`;
    if (status === 413 || lower.includes('entity too large') || lower.includes('413')) {
      errorMsg = 'Yüklenen fotoğraf çok büyük (HTTP 413). Görsel otomatik küçültülerek yeniden denenmelidir.';
    } else if (status === 502 || status === 504 || lower.includes('gateway') || lower.includes('timeout')) {
      errorMsg = `Optik analiz sunucusu zaman aşımına uğradı (HTTP ${status}). Lütfen görseli kırpıp tekrar deneyin.`;
    }
    return {
      ok: false,
      status,
      answersString: '',
      detectedCount: 0,
      bookletKeys: {},
      error: errorMsg,
    };
  }

  if (status < 200 || status >= 300 || typeof parsed.error === 'string') {
    return {
      ok: false,
      status,
      answersString: '',
      detectedCount: 0,
      bookletKeys: {},
      error:
        typeof parsed.error === 'string' && parsed.error.trim()
          ? parsed.error
          : `Optik okuma hatası (HTTP ${status}).`,
    };
  }

  const rawBookletKeys = parsed.bookletKeys as Record<string, unknown> | undefined;
  const bookletKeys: Partial<Record<BookletCode, string>> = {};
  if (rawBookletKeys && typeof rawBookletKeys === 'object') {
    (['A', 'B', 'C', 'D'] as BookletCode[]).forEach((code) => {
      const val = rawBookletKeys[code];
      if (typeof val === 'string' && val.trim()) {
        bookletKeys[code] = val;
      }
    });
  }

  const answersString = typeof parsed.answersString === 'string' ? parsed.answersString : '';
  const detectedCount =
    typeof parsed.detectedCount === 'number' && Number.isFinite(parsed.detectedCount)
      ? parsed.detectedCount
      : answersString.length;

  const rawStudentNo =
    typeof parsed.detectedStudentNumber === 'string'
      ? parsed.detectedStudentNumber.replace(/\D/g, '').slice(0, 8)
      : '';

  return {
    ok: true,
    status,
    answersString,
    detectedCount,
    bookletCode: normalizeBookletCodeCandidate(
      typeof parsed.bookletCode === 'string' ? parsed.bookletCode : undefined
    ),
    bookletKeys,
    detectedSubject:
      typeof parsed.detectedSubject === 'string' && parsed.detectedSubject.trim()
        ? parsed.detectedSubject.trim()
        : undefined,
    detectedStudentNumber: rawStudentNo.length >= 4 ? rawStudentNo : undefined,
    detectedQrUrl:
      typeof parsed.detectedQrUrl === 'string' && parsed.detectedQrUrl.trim()
        ? parsed.detectedQrUrl.trim()
        : undefined,
    detectedAnalysisQr:
      typeof parsed.detectedAnalysisQr === 'string' && parsed.detectedAnalysisQr.trim()
        ? parsed.detectedAnalysisQr.trim()
        : undefined,
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromBlobUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel çözümlenemedi.'));
    img.src = url;
  });
}

export async function prepareImageForOmrUpload(
  file: File,
  maxSide = 1600,
  quality = 0.86
): Promise<{
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
  compressed: boolean;
}> {
  const mimeType = inferImageMimeType(file);
  if (mimeType === 'application/pdf' || !mimeType.startsWith('image/')) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      base64: dataUrl.split(',')[1] || '',
      mimeType,
      compressed: false,
    };
  }

  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageFromBlobUrl(objectUrl);
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const target = computeTargetDimensions(naturalW, naturalH, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill white paper background in case user uploads a transparent PNG screenshot
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.drawImage(img, 0, 0, target.width, target.height);
        const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = jpegDataUrl.split(',')[1] || '';
        if (base64.length > 0) {
          return {
            base64,
            mimeType: 'image/jpeg',
            width: target.width,
            height: target.height,
            compressed: true,
          };
        }
      }
    } catch {
      // Fall back to direct file read (e.g., if browser cannot decode HEIC on canvas)
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const fallbackDataUrl = await readFileAsDataUrl(file);
  return {
    base64: fallbackDataUrl.split(',')[1] || '',
    mimeType,
    compressed: false,
  };
}
