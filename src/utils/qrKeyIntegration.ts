import jsQR from 'jsqr';
import {
  BookletCode,
  ExamSourceMode,
  GradeLevelId,
} from '../types/academy';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';

const DAK2_PREFIX = 'DAK2.';
const STATIC_CIPHER_PEPPER = 'DOGRULUK_AKADEMI_2026_TEACHER_OMR_KEY_V2';

export interface TeacherAnalysisQrPayload {
  bookletCode: BookletCode;
  gradeId: GradeLevelId;
  subjectName?: string;
  questionCount: number;
  answerKey: string;
  examTitle?: string;
  sourceMode?: ExamSourceMode;
  institutionCode8: string;
}

export interface DecodeTeacherAnalysisQrResult {
  valid: boolean;
  token: string;
  payload?: TeacherAnalysisQrPayload;
  institutionMismatch: boolean;
  error?: string;
}

export interface DualQrScanResult {
  karneQrUrl?: string;
  analysisQrToken?: string;
  decodedAnalysis?: DecodeTeacherAnalysisQrResult;
  allDecodedStrings: string[];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const fullB64 = padded + '='.repeat(padLen);
  const binary = atob(fullB64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deriveKeystreamByte(secretBytes: Uint8Array, index: number, saltByte: number): number {
  const s1 = secretBytes[index % secretBytes.length];
  const s2 = secretBytes[(index * 7 + 3) % secretBytes.length];
  const mix = (s1 ^ ((s2 + index * 31 + saltByte * 17) & 0xff)) & 0xff;
  return (mix + ((index * 13) & 0xff)) & 0xff;
}

function cleanInstCode8(code?: string): string {
  const digits = (code || '').replace(/\D/g, '');
  return (digits || '48291045').padStart(8, '0').slice(0, 8);
}

function normalizeKeyForQr(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/[^A-E\-*?_]/g, '')
    .replace(/[*?_]/g, '-');
}

/**
 * Encodes the active booklet answer key and exam scope into an encrypted teacher-only
 * QR token (`DAK2.<base64url>`). Generic phone cameras see only opaque cipher characters,
 * preventing students from reading plaintext answers.
 */
export function encodeTeacherAnalysisQrToken(payload: TeacherAnalysisQrPayload): string {
  const inst8 = cleanInstCode8(payload.institutionCode8);
  const cleanKey = normalizeKeyForQr(payload.answerKey);
  const compact = {
    v: 2,
    b: payload.bookletCode,
    g: payload.gradeId,
    s: (payload.subjectName || '').trim().slice(0, 48),
    q: Math.max(1, Math.min(200, Math.round(payload.questionCount || cleanKey.length || 1))),
    k: cleanKey,
    t: (payload.examTitle || '').trim().slice(0, 64),
    m: payload.sourceMode || 'kurum',
    i: inst8,
  };

  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(JSON.stringify(compact));
  const checksum = fnv1a32(plainBytes);
  const saltByte = checksum & 0xff;

  const secretBytes = encoder.encode(`${inst8}:${STATIC_CIPHER_PEPPER}`);
  const out = new Uint8Array(5 + plainBytes.length);
  out[0] = saltByte;
  out[1] = (checksum >>> 24) & 0xff;
  out[2] = (checksum >>> 16) & 0xff;
  out[3] = (checksum >>> 8) & 0xff;
  out[4] = checksum & 0xff;

  for (let i = 0; i < plainBytes.length; i += 1) {
    const ks = deriveKeystreamByte(secretBytes, i, saltByte);
    out[5 + i] = plainBytes[i] ^ ks;
  }

  return `${DAK2_PREFIX}${bytesToBase64Url(out)}`;
}

export function extractTeacherAnalysisQrTokenFromText(rawText?: string | null): string | null {
  if (!rawText) return null;
  const match = rawText.match(/DAK2\.[A-Za-z0-9_-]{8,}/);
  return match ? match[0] : null;
}

function tryDecryptWithInstCode(
  framed: Uint8Array,
  instCode8: string
): TeacherAnalysisQrPayload | null {
  if (framed.length <= 5) return null;
  const saltByte = framed[0];
  const expectedChecksum =
    ((framed[1] << 24) | (framed[2] << 16) | (framed[3] << 8) | framed[4]) >>> 0;

  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(`${cleanInstCode8(instCode8)}:${STATIC_CIPHER_PEPPER}`);
  const plainBytes = new Uint8Array(framed.length - 5);
  for (let i = 0; i < plainBytes.length; i += 1) {
    const ks = deriveKeystreamByte(secretBytes, i, saltByte);
    plainBytes[i] = framed[5 + i] ^ ks;
  }

  if (fnv1a32(plainBytes) !== expectedChecksum) {
    return null;
  }

  try {
    const jsonText = new TextDecoder().decode(plainBytes);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (parsed.v !== 2 || typeof parsed.k !== 'string' || typeof parsed.b !== 'string') {
      return null;
    }
    const booklet = ['A', 'B', 'C', 'D'].includes(parsed.b)
      ? (parsed.b as BookletCode)
      : 'A';
    return {
      bookletCode: booklet,
      gradeId: (typeof parsed.g === 'string' ? parsed.g : '5') as GradeLevelId,
      subjectName: typeof parsed.s === 'string' && parsed.s.trim() ? parsed.s.trim() : undefined,
      questionCount:
        typeof parsed.q === 'number' && Number.isFinite(parsed.q)
          ? parsed.q
          : parsed.k.length,
      answerKey: parsed.k,
      examTitle: typeof parsed.t === 'string' && parsed.t.trim() ? parsed.t.trim() : undefined,
      sourceMode: parsed.m === 'farkli-yayin' ? 'farkli-yayin' : 'kurum',
      institutionCode8:
        typeof parsed.i === 'string' ? cleanInstCode8(parsed.i) : cleanInstCode8(instCode8),
    };
  } catch {
    return null;
  }
}

export function decodeTeacherAnalysisQrToken(
  rawTextOrToken: string,
  preferredInstitutionCode8?: string,
  candidateInstCodes: string[] = []
): DecodeTeacherAnalysisQrResult {
  const token = extractTeacherAnalysisQrTokenFromText(rawTextOrToken);
  if (!token) {
    return {
      valid: false,
      token: '',
      institutionMismatch: false,
      error: 'Geçerli bir şifreli öğretmen analiz karekodu (DAK2) bulunamadı.',
    };
  }

  let framed: Uint8Array;
  try {
    framed = base64UrlToBytes(token.slice(DAK2_PREFIX.length));
  } catch {
    return {
      valid: false,
      token,
      institutionMismatch: false,
      error: 'Analiz karekodu formatı bozuk.',
    };
  }

  const preferredClean = preferredInstitutionCode8
    ? cleanInstCode8(preferredInstitutionCode8)
    : undefined;

  if (preferredClean) {
    const direct = tryDecryptWithInstCode(framed, preferredClean);
    if (direct) {
      return {
        valid: true,
        token,
        payload: direct,
        institutionMismatch: direct.institutionCode8 !== preferredClean,
      };
    }
  }

  const fallbackCodes = Array.from(
    new Set([
      ...candidateInstCodes.map((c) => cleanInstCode8(c)),
      ...DEFAULT_INSTITUTIONS.map((i) => cleanInstCode8(i.code8)),
    ])
  ).filter((c) => c !== preferredClean);

  for (const code of fallbackCodes) {
    const payload = tryDecryptWithInstCode(framed, code);
    if (payload) {
      return {
        valid: true,
        token,
        payload,
        institutionMismatch: Boolean(preferredClean && payload.institutionCode8 !== preferredClean),
      };
    }
  }

  return {
    valid: false,
    token,
    institutionMismatch: false,
    error: 'Analiz karekodu bu kuruma ait şifreyle doğrulanamadı veya okunamadı.',
  };
}

function readQrFromImageDataRegion(
  sourceCtx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const x = Math.max(0, Math.floor(rx));
  const y = Math.max(0, Math.floor(ry));
  const w = Math.max(1, Math.floor(rw));
  const h = Math.max(1, Math.floor(rh));
  const imgData = sourceCtx.getImageData(x, y, w, h);
  const found = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
  if (!found) return null;
  return {
    data: found.data,
    location: {
      topLeft: { x: found.location.topLeftCorner.x + x, y: found.location.topLeftCorner.y + y },
      bottomRight: {
        x: found.location.bottomRightCorner.x + x,
        y: found.location.bottomRightCorner.y + y,
      },
    },
  };
}

/**
 * Decodes BOTH optical sheet QR codes locally on the client via `jsQR`:
 * 1) Student Digital Karne / Identity QR (`?tab=reports&stu=...`)
 * 2) Encrypted Teacher Analysis QR (`DAK2....`)
 */
export async function extractBothQrCodesFromImageFile(
  file: File,
  options?: {
    preferredInstitutionCode8?: string;
    candidateInstCodes?: string[];
  }
): Promise<DualQrScanResult> {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return { allDecodedStrings: [] };
  }

  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  if (
    mime === 'application/pdf' ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv')
  ) {
    return { allDecodedStrings: [] };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Görsel okunamadı'));
      el.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return { allDecodedStrings: [] };

    const maxSide = 1650;
    const scale = Math.max(natW, natH) > maxSide ? maxSide / Math.max(natW, natH) : 1;
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { allDecodedStrings: [] };

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const seen = new Set<string>();
    const collectIfUnique = (val?: string | null) => {
      const trimmed = (val || '').trim();
      if (trimmed) seen.add(trimmed);
    };

    const firstFull = readQrFromImageDataRegion(ctx, 0, 0, w, h);
    if (firstFull) {
      collectIfUnique(firstFull.data);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = w;
      maskCanvas.height = h;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        mctx.drawImage(canvas, 0, 0);
        const pad = 10;
        const mx = Math.max(0, Math.min(firstFull.location.topLeft.x, firstFull.location.bottomRight.x) - pad);
        const my = Math.max(0, Math.min(firstFull.location.topLeft.y, firstFull.location.bottomRight.y) - pad);
        const mw = Math.abs(firstFull.location.bottomRight.x - firstFull.location.topLeft.x) + pad * 2;
        const mh = Math.abs(firstFull.location.bottomRight.y - firstFull.location.topLeft.y) + pad * 2;
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(mx, my, mw, mh);
        const secondFull = readQrFromImageDataRegion(mctx, 0, 0, w, h);
        if (secondFull) collectIfUnique(secondFull.data);
      }
    }

    const regions: Array<[number, number, number, number]> = [
      [0, 0, w * 0.42, h * 0.25],
      [0, h * 0.12, w * 0.42, h * 0.28],
      [w * 0.5, 0, w * 0.5, h * 0.4],
      [0, h * 0.5, w * 0.5, h * 0.5],
      [w * 0.5, h * 0.5, w * 0.5, h * 0.5],
    ];
    for (const [rx, ry, rw, rh] of regions) {
      const hit = readQrFromImageDataRegion(ctx, rx, ry, rw, rh);
      if (hit) collectIfUnique(hit.data);
    }

    const allDecodedStrings = Array.from(seen);
    const analysisQrToken = allDecodedStrings
      .map((s) => extractTeacherAnalysisQrTokenFromText(s))
      .find((t): t is string => Boolean(t));

    const karneQrUrl = allDecodedStrings.find(
      (s) => !s.startsWith(DAK2_PREFIX) && (s.includes('tab=reports') || s.includes('stu=') || s.startsWith('http'))
    );

    const decodedAnalysis = analysisQrToken
      ? decodeTeacherAnalysisQrToken(
          analysisQrToken,
          options?.preferredInstitutionCode8,
          options?.candidateInstCodes
        )
      : undefined;

    return {
      karneQrUrl,
      analysisQrToken,
      decodedAnalysis,
      allDecodedStrings,
    };
  } catch {
    return { allDecodedStrings: [] };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
