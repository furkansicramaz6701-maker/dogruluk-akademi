import * as XLSX from 'xlsx';
import {
  BookletCode,
  BookletDistributionPattern,
  ExternalPublisherExamConfig,
  ExternalPublisherExamPreset,
  GradeLevelId,
  GradeProfile,
} from '../types/academy';
import { BOOKLET_CODES, normalizeExternalAnswerKeyString } from './bookletDistribution';
import { triggerDownload } from './downloadHelpers';
import { deriveBookletAnswerKeysFromBase } from './omrSpreadsheet';

export const EXTERNAL_PUBLISHER_PRESETS_STORAGE_KEY = 'da_external_publisher_presets_v1';

export interface SubjectKeyBreakdownItem {
  subject: string;
  startQ: number;
  endQ: number;
  targetCount: number;
  enteredCount: number;
  blankCount: number;
  status: 'tam' | 'eksik' | 'bos';
}

export interface ExternalPublisherKeyHealth {
  bookletCode: BookletCode;
  enteredCount: number;
  expectedCount: number;
  isComplete: boolean;
  invalidCount: number;
  subjectBreakdown: SubjectKeyBreakdownItem[];
}

export const DEFAULT_EXTERNAL_PUBLISHER_PRESETS: ExternalPublisherExamPreset[] = [
  {
    id: 'pub-ozdebir-5-cumartesi',
    publisherName: 'Özdebir Yayınları',
    examTitle: 'Özdebir Türkiye Geneli Deneme · 5 Aralık 2026 Cumartesi',
    examDate: '05.12.2026',
    gradeId: '5',
    optionCount: 4,
    questionCount: 70,
    bookletMode: 'AB',
    answerKeys: deriveBookletAnswerKeysFromBase(
      'ABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDAB',
      4
    ),
    updatedAt: '2026-11-23',
    isBuiltIn: true,
  },
  {
    id: 'pub-hiz-lgs-8',
    publisherName: 'Hız Yayınları',
    examTitle: 'Hız LGS Sayısal + Sözel Kurumsal Deneme',
    examDate: '05.12.2026',
    gradeId: '8',
    optionCount: 4,
    questionCount: 90,
    bookletMode: 'AB',
    answerKeys: deriveBookletAnswerKeysFromBase(
      'ABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAABCDDCBAAB',
      4
    ),
    updatedAt: '2026-11-23',
    isBuiltIn: true,
  },
  {
    id: 'pub-palme-tyt',
    publisherName: 'Palme Yayınevi',
    examTitle: 'Palme TYT Genel Provadaneme (A-B-C-D)',
    examDate: '05.12.2026',
    gradeId: 'TYT',
    optionCount: 5,
    questionCount: 120,
    bookletMode: 'ABCD',
    answerKeys: deriveBookletAnswerKeysFromBase(
      'ABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDE',
      5
    ),
    updatedAt: '2026-11-23',
    isBuiltIn: true,
  },
  {
    id: 'pub-mozaik-6',
    publisherName: 'Mozaik Yayınları',
    examTitle: 'Mozaik 6. Sınıf Kış Kampı Denemesi',
    examDate: '05.12.2026',
    gradeId: '6',
    optionCount: 4,
    questionCount: 75,
    bookletMode: 'AB',
    answerKeys: deriveBookletAnswerKeysFromBase(
      'BCDAABCDDCBABCDABCDAABCDDCBABCDABCDAABCDDCBABCDABCDAABCDDCBABCDABCDAABCDDCB',
      4
    ),
    updatedAt: '2026-11-23',
    isBuiltIn: true,
  },
];

export function ensurePublisherPresetsList(
  rawList: ExternalPublisherExamPreset[] | null | undefined
): ExternalPublisherExamPreset[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return DEFAULT_EXTERNAL_PUBLISHER_PRESETS;
  }
  const merged = [...rawList];
  for (const def of DEFAULT_EXTERNAL_PUBLISHER_PRESETS) {
    if (!merged.some((p) => p.id === def.id)) {
      merged.push(def);
    }
  }
  return merged;
}

export function upsertPublisherPreset(
  list: ExternalPublisherExamPreset[],
  input: Omit<ExternalPublisherExamPreset, 'id' | 'updatedAt'> & { id?: string }
): { list: ExternalPublisherExamPreset[]; saved: ExternalPublisherExamPreset } {
  const cleanPublisher = input.publisherName.trim() || 'Özel Yayın Denemesi';
  const cleanTitle = input.examTitle.trim() || `${cleanPublisher} Denemesi`;
  const id =
    input.id && input.id.trim()
      ? input.id.trim()
      : `pub-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const saved: ExternalPublisherExamPreset = {
    id,
    publisherName: cleanPublisher,
    examTitle: cleanTitle,
    examDate: input.examDate.trim() || new Date().toLocaleDateString('tr-TR'),
    gradeId: input.gradeId,
    optionCount: input.optionCount,
    questionCount: Math.max(5, Math.min(200, Math.round(input.questionCount))),
    bookletMode: input.bookletMode,
    answerKeys: {
      A: normalizeExternalAnswerKeyString(input.answerKeys.A ?? '', input.optionCount),
      B: normalizeExternalAnswerKeyString(input.answerKeys.B ?? '', input.optionCount),
      C: normalizeExternalAnswerKeyString(input.answerKeys.C ?? '', input.optionCount),
      D: normalizeExternalAnswerKeyString(input.answerKeys.D ?? '', input.optionCount),
    },
    updatedAt: new Date().toISOString().slice(0, 10),
    isBuiltIn: false,
  };

  const existingIdx = list.findIndex((p) => p.id === saved.id);
  const nextList = [...list];
  if (existingIdx >= 0) {
    nextList[existingIdx] = {
      ...saved,
      isBuiltIn: list[existingIdx].isBuiltIn,
    };
  } else {
    nextList.unshift(saved);
  }
  return { list: nextList, saved };
}

export function deletePublisherPreset(
  list: ExternalPublisherExamPreset[],
  presetId: string
): ExternalPublisherExamPreset[] {
  const filtered = list.filter((p) => p.id !== presetId);
  return filtered.length > 0 ? filtered : DEFAULT_EXTERNAL_PUBLISHER_PRESETS;
}

export function computeExternalPublisherKeyHealth(params: {
  bookletCode: BookletCode;
  rawKey: string;
  gradeProfile: GradeProfile;
  expectedQuestionCount?: number;
  selectedSubjectId?: string;
}): ExternalPublisherKeyHealth {
  const activeSubjects =
    params.selectedSubjectId && params.selectedSubjectId !== 'all'
      ? params.gradeProfile.subjects.filter((s) => s.id === params.selectedSubjectId)
      : params.gradeProfile.subjects;
  const effectiveSubjects =
    activeSubjects.length > 0 ? activeSubjects : params.gradeProfile.subjects;

  const expectedCount =
    params.expectedQuestionCount && params.expectedQuestionCount > 0
      ? params.expectedQuestionCount
      : effectiveSubjects.reduce((sum, s) => sum + s.questionCount, 0);

  const allowedRegex = params.gradeProfile.optionCount === 4 ? /[A-D]/ : /[A-E]/;
  const compact = String(params.rawKey ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, '');

  let invalidCount = 0;
  for (const ch of compact) {
    if (ch !== '-' && ch !== '*' && !allowedRegex.test(ch)) {
      invalidCount += 1;
    }
  }

  const normalized = normalizeExternalAnswerKeyString(
    params.rawKey ?? '',
    params.gradeProfile.optionCount
  );

  const totalProfileQ = effectiveSubjects.reduce(
    (sum, s) => sum + s.questionCount,
    0
  );
  const scale = totalProfileQ > 0 ? expectedCount / totalProfileQ : 1;

  let cursor = 0;
  const subjectBreakdown: SubjectKeyBreakdownItem[] = effectiveSubjects.map(
    (subj, idx) => {
      const isLast = idx === effectiveSubjects.length - 1;
      const targetCount = isLast
        ? Math.max(1, expectedCount - cursor)
        : Math.max(1, Math.round(subj.questionCount * scale));
      const startQ = cursor + 1;
      const endQ = cursor + targetCount;
      const slice = normalized.slice(cursor, endQ);
      cursor = endQ;

      let enteredCount = 0;
      let blankCount = 0;
      for (const ch of slice) {
        if (allowedRegex.test(ch)) enteredCount += 1;
        else blankCount += 1;
      }

      const status: 'tam' | 'eksik' | 'bos' =
        enteredCount >= targetCount ? 'tam' : enteredCount > 0 ? 'eksik' : 'bos';

      return {
        subject: subj.name,
        startQ,
        endQ,
        targetCount,
        enteredCount,
        blankCount,
        status,
      };
    }
  );

  return {
    bookletCode: params.bookletCode,
    enteredCount: normalized.length,
    expectedCount,
    isComplete: normalized.length >= expectedCount && invalidCount === 0,
    invalidCount,
    subjectBreakdown,
  };
}

function normalizeHeaderTr(h: string): string {
  return String(h ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parsePublisherAnswerKeysSpreadsheet(
  arrayBuffer: ArrayBuffer,
  options: {
    optionCount: 4 | 5;
    autoDeriveMissing?: boolean;
  }
): {
  answerKeys: Partial<Record<BookletCode, string>>;
  publisherName?: string;
  examTitle?: string;
  detectedBooklets: BookletCode[];
  summaryMessage: string;
} {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      answerKeys: {},
      detectedBooklets: [],
      summaryMessage: 'Excel dosyasında sayfa bulunamadı.',
    };
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: '',
    raw: false,
  });

  const answerKeys: Partial<Record<BookletCode, string>> = {};
  let publisherName: string | undefined;
  let examTitle: string | undefined;

  // Format 1: Question-per-row with columns like SoruNo | A | B | C | D (or A_Kitapcik)
  const colBuffers: Record<BookletCode, string[]> = { A: [], B: [], C: [], D: [] };
  let sawQuestionGrid = false;

  for (const row of rows) {
    const entries = Object.entries(row);
    const normMap = new Map<string, string>();
    entries.forEach(([k, v]) => normMap.set(normalizeHeaderTr(k), String(v ?? '').trim()));

    const maybePub =
      normMap.get('yayin') ||
      normMap.get('yayin adi') ||
      normMap.get('yayinevi') ||
      '';
    if (!publisherName && maybePub) publisherName = maybePub;

    const maybeExam =
      normMap.get('deneme') ||
      normMap.get('deneme adi') ||
      normMap.get('sinav adi') ||
      '';
    if (!examTitle && maybeExam) examTitle = maybeExam;

    // Check Format 2: Row per booklet (Kitapcik = A, Cevaplar = ABCD...)
    const rowBookletRaw =
      normMap.get('kitapcik') ||
      normMap.get('kitapcik turu') ||
      normMap.get('booklet') ||
      '';
    const rowAnswersRaw =
      normMap.get('cevaplar') ||
      normMap.get('cevap anahtari') ||
      normMap.get('anahtar') ||
      normMap.get('answers') ||
      '';
    const cleanRowBooklet = rowBookletRaw.toUpperCase().replace(/[^A-D]/g, '');
    if (
      cleanRowBooklet.length === 1 &&
      (BOOKLET_CODES as string[]).includes(cleanRowBooklet) &&
      rowAnswersRaw.length >= 4
    ) {
      answerKeys[cleanRowBooklet as BookletCode] = normalizeExternalAnswerKeyString(
        rowAnswersRaw,
        options.optionCount
      );
      continue;
    }

    // Format 1 check: columns named A, B, C, D or A_Kitapcik, B_Kitapcik...
    let rowHasColAnswer = false;
    BOOKLET_CODES.forEach((code) => {
      const lower = code.toLowerCase();
      const cell =
        normMap.get(lower) ||
        normMap.get(`${lower} kitapcik`) ||
        normMap.get(`${lower} kitapcigi`) ||
        normMap.get(`${lower} cevap`) ||
        normMap.get(`${lower} kitapcik cevap`) ||
        '';
      const cleaned = normalizeExternalAnswerKeyString(cell, options.optionCount);
      if (cleaned.length === 1) {
        colBuffers[code].push(cleaned);
        rowHasColAnswer = true;
      }
    });
    if (rowHasColAnswer) {
      sawQuestionGrid = true;
    }
  }

  if (sawQuestionGrid) {
    BOOKLET_CODES.forEach((code) => {
      if (colBuffers[code].length >= 3 && !answerKeys[code]) {
        answerKeys[code] = colBuffers[code].join('');
      }
    });
  }

  if (options.autoDeriveMissing !== false && answerKeys.A && (!answerKeys.B || !answerKeys.C)) {
    const derived = deriveBookletAnswerKeysFromBase(answerKeys.A, options.optionCount);
    BOOKLET_CODES.forEach((code) => {
      if (!answerKeys[code]) {
        answerKeys[code] = derived[code];
      }
    });
  }

  const detectedBooklets = BOOKLET_CODES.filter(
    (code) => Boolean(answerKeys[code] && answerKeys[code]!.length > 0)
  );

  return {
    answerKeys,
    publisherName,
    examTitle,
    detectedBooklets,
    summaryMessage:
      detectedBooklets.length > 0
        ? `Excel'den ${detectedBooklets.join(', ')} kitapçık cevap anahtarları yüklendi (${
            answerKeys[detectedBooklets[0]]?.length ?? 0
          } soru).`
        : 'Dosyada A/B/C/D yayın cevap anahtarı sütunu tespit edilemedi.',
  };
}

export function configToPresetInput(
  cfg: ExternalPublisherExamConfig,
  gradeProfile: GradeProfile,
  questionCount: number
): Omit<ExternalPublisherExamPreset, 'id' | 'updatedAt'> {
  return {
    publisherName: cfg.publisherName || 'Özel Yayın',
    examTitle: cfg.examTitle || `${cfg.publisherName || 'Özel Yayın'} Denemesi`,
    examDate: cfg.examDate || new Date().toLocaleDateString('tr-TR'),
    gradeId: cfg.gradeId ?? gradeProfile.id,
    optionCount: cfg.optionCount ?? gradeProfile.optionCount,
    questionCount: cfg.questionCount ?? questionCount,
    bookletMode: cfg.bookletMode ?? 'AB',
    answerKeys: cfg.answerKeys,
  };
}

export function downloadExternalPublisherKeyTemplate(params: {
  gradeProfile: GradeProfile;
  questionCount: number;
  publisherName?: string;
}): void {
  const count = Math.max(10, Math.min(200, params.questionCount));
  const opts = params.gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const rows: Array<Record<string, string | number>> = [];
  let qNo = 1;
  for (const subj of params.gradeProfile.subjects) {
    for (let i = 0; i < subj.questionCount && qNo <= count; i++) {
      rows.push({
        SoruNo: qNo,
        Ders: subj.name,
        A: opts[(qNo - 1) % opts.length],
        B: opts[(qNo + 1) % opts.length],
        C: opts[(qNo + 2) % opts.length],
        D: opts[(qNo + 3) % opts.length],
        Yayın: params.publisherName || 'Özdebir / Hız / Palme',
      });
      qNo += 1;
    }
  }
  while (qNo <= count) {
    rows.push({
      SoruNo: qNo,
      Ders: params.gradeProfile.subjects[0]?.name ?? 'Genel',
      A: opts[(qNo - 1) % opts.length],
      B: opts[(qNo + 1) % opts.length],
      C: opts[(qNo + 2) % opts.length],
      D: opts[(qNo + 3) % opts.length],
      Yayın: params.publisherName || 'Özdebir / Hız / Palme',
    });
    qNo += 1;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Yayın Cevap Anahtarı');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(
    blob,
    `Farkli-Yayin-Cevap-Anahtari-Sablon-${params.gradeProfile.id}.xlsx`
  );
}

function extractAnswerLettersFromSegment(
  segment: string,
  optionCount: 4 | 5
): string {
  // Remove question numbers like "1-", "12.", "15)"
  const withoutQuestionNums = segment.replace(/\b\d{1,3}\s*[-.):]\s*/g, ' ');
  // Keep only pure answer blocks (tokens made exclusively of A-E and optional dash '-') so prose like "Kitapçığı" or "Matematik" never leaks letters
  const tokens = withoutQuestionNums.split(/[\s,;:|/\\]+/).filter(Boolean);
  const pureAnswerChunks = tokens
    .filter((tok) => /^[A-Ea-e-]+$/.test(tok))
    .join('');
  return normalizeExternalAnswerKeyString(pureAnswerChunks, optionCount);
}

export function parseCombinedExternalAnswerKeysText(
  rawText: string,
  options: {
    optionCount: 4 | 5;
    bookletMode?: BookletDistributionPattern;
    autoDeriveMissing?: boolean;
  }
): {
  answerKeys: Partial<Record<BookletCode, string>>;
  detectedBooklets: BookletCode[];
  recommendedMode: BookletDistributionPattern;
  summaryMessage: string;
} {
  const text = String(rawText ?? '').trim();
  if (!text) {
    return {
      answerKeys: {},
      detectedBooklets: [],
      recommendedMode: options.bookletMode ?? 'A',
      summaryMessage: 'Ayrıştırılacak cevap anahtarı metni bulunamadı.',
    };
  }

  const answerKeys: Partial<Record<BookletCode, string>> = {};
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Strategy 1: Tabular rows copied from PDF/Excel: "1 A B" or "1. A B C D"
  const tabularRows: string[][] = [];
  for (const line of lines) {
    const m = line.match(
      /^\d{1,3}\s*[-.):]?\s+([A-E])(?:\s+([A-E]))?(?:\s+([A-E]))?(?:\s+([A-E]))?\s*$/i
    );
    if (m) {
      tabularRows.push(
        [m[1], m[2], m[3], m[4]].filter((x): x is string => Boolean(x))
      );
    }
  }
  if (tabularRows.length >= 3 && tabularRows.length >= Math.floor(lines.length * 0.6)) {
    const maxCols = Math.min(
      4,
      Math.max(...tabularRows.map((r) => r.length))
    );
    for (let ci = 0; ci < maxCols; ci += 1) {
      const code = BOOKLET_CODES[ci];
      const combined = tabularRows.map((r) => r[ci] ?? '').join('');
      const cleaned = normalizeExternalAnswerKeyString(combined, options.optionCount);
      if (cleaned.length > 0) {
        answerKeys[code] = cleaned;
      }
    }
  } else {
    // Strategy 2: Labeled sections like "A: ABCD...", "A Kitapçığı: ...", "B) ..."
    const headerRegex =
      /(?:^|[\n\r]|(?<=\s))([A-D])(?:\s+(?:kitap[çcÇC][iİIı][gğGĞ][iİIı]|kitap[çcÇC][iİIı]k|grubu?)\s*[:\)\-]?|\s*[:\)])/gi;
    const matches: Array<{ code: BookletCode; index: number; endIndex: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(text)) !== null) {
      const code = match[1].toUpperCase() as BookletCode;
      if ((BOOKLET_CODES as string[]).includes(code)) {
        matches.push({
          code,
          index: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    if (matches.length >= 1) {
      for (let i = 0; i < matches.length; i += 1) {
        const cur = matches[i];
        const nextIdx = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const segment = text.slice(cur.endIndex, nextIdx);
        const extracted = extractAnswerLettersFromSegment(segment, options.optionCount);
        if (extracted.length > 0) {
          answerKeys[cur.code] = (answerKeys[cur.code] ?? '') + extracted;
        }
      }
    } else {
      // Strategy 3: Plain single answer key string ("ABCD..." or "1-A 2-B 3-C...")
      const single = extractAnswerLettersFromSegment(text, options.optionCount);
      if (single.length > 0) {
        answerKeys.A = single;
      }
    }
  }

  const explicitlyDetected = BOOKLET_CODES.filter(
    (code) => Boolean(answerKeys[code] && answerKeys[code]!.length > 0)
  );

  let recommendedMode: BookletDistributionPattern = options.bookletMode ?? 'A';
  if (explicitlyDetected.includes('C') || explicitlyDetected.includes('D')) {
    recommendedMode = 'ABCD';
  } else if (explicitlyDetected.includes('B')) {
    recommendedMode = 'AB';
  } else if (explicitlyDetected.length === 1 && !options.bookletMode) {
    recommendedMode = 'A';
  }

  if (options.autoDeriveMissing && answerKeys.A && recommendedMode !== 'A') {
    const derived = deriveBookletAnswerKeysFromBase(answerKeys.A, options.optionCount);
    if (!answerKeys.B) answerKeys.B = derived.B;
    if (recommendedMode === 'ABCD') {
      if (!answerKeys.C) answerKeys.C = derived.C;
      if (!answerKeys.D) answerKeys.D = derived.D;
    }
  }

  const detectedBooklets = BOOKLET_CODES.filter(
    (code) => Boolean(answerKeys[code] && answerKeys[code]!.length > 0)
  );

  return {
    answerKeys,
    detectedBooklets,
    recommendedMode,
    summaryMessage:
      detectedBooklets.length > 0
        ? `${detectedBooklets.join(' · ')} kitapçık anahtarları ayrıştırıldı (${
            answerKeys[detectedBooklets[0]]?.length ?? 0
          } soru).`
        : 'Metinden geçerli A/B/C/D şık harfi ayrıştırılamadı.',
  };
}

