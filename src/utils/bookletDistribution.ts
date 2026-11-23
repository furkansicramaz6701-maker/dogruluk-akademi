import {
  BookletCode,
  BookletDistributionPattern,
  CoverColorThemeId,
  CoverConfig,
  CoverLayoutStyleId,
  DifficultyLevel,
  ExamQuestion,
  ExamSourceMode,
  GradeLevelId,
  GradeProfile,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';

export const BOOKLET_CODES: BookletCode[] = ['A', 'B', 'C', 'D'];

export function getBookletCycleCodes(
  pattern: BookletDistributionPattern = 'ABCD'
): BookletCode[] {
  if (pattern === 'AB') return ['A', 'B'];
  if (pattern === 'A') return ['A'];
  return ['A', 'B', 'C', 'D'];
}

export interface CoverColorPalette {
  id: CoverColorThemeId;
  name: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  goldColor: string;
  softBg: string;
  badgeText: string;
}

export const COVER_COLOR_THEMES: CoverColorPalette[] = [
  {
    id: 'otomatik-abcd',
    name: 'Otomatik A-B-C-D Kitapçık Renkleri',
    subtitle: 'A: Lacivert · B: Zümrüt · C: Bordo · D: Mor',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f2747',
    goldColor: '#d97706',
    softBg: '#eff6ff',
    badgeText: '#1e3a8a',
  },
  {
    id: 'kurum-temasi',
    name: 'Kurum Logo Teması',
    subtitle: 'Seçili 3D kurum logosunun ana renklerini kullanır',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f2747',
    goldColor: '#d97706',
    softBg: '#f1f5f9',
    badgeText: '#0f2747',
  },
  {
    id: 'lacivert-altin',
    name: 'Akademik Lacivert & Altın',
    subtitle: 'Resmi ÖSYM/LGS kurumsal prestij paleti',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f2747',
    goldColor: '#f59e0b',
    softBg: '#eff6ff',
    badgeText: '#1e3a8a',
  },
  {
    id: 'zumrut-gumus',
    name: 'Zümrüt Yeşil & Gümüş',
    subtitle: 'Ferah fen/sayısal kitapçık tasarım paleti',
    primaryColor: '#047857',
    secondaryColor: '#064e3b',
    goldColor: '#10b981',
    softBg: '#ecfdf5',
    badgeText: '#065f46',
  },
  {
    id: 'bordo-kehribar',
    name: 'Yakut Bordo & Kehribar',
    subtitle: 'Yüksek kontrastlı deneme & yazılı kapağı',
    primaryColor: '#be123c',
    secondaryColor: '#7f1d1d',
    goldColor: '#f59e0b',
    softBg: '#fff1f2',
    badgeText: '#881337',
  },
  {
    id: 'turkuaz-bakir',
    name: 'Okyanus Turkuaz & Bakır',
    subtitle: 'Modern görsel şeritli çalışma kitapçığı',
    primaryColor: '#0e7490',
    secondaryColor: '#164e63',
    goldColor: '#ea580c',
    softBg: '#ecfeff',
    badgeText: '#155e75',
  },
  {
    id: 'indigo-lavanta',
    name: 'İndigo Mor & Altın',
    subtitle: 'Seçkin derece denemesi kapak tasarımı',
    primaryColor: '#6d28d9',
    secondaryColor: '#3b0764',
    goldColor: '#eab308',
    softBg: '#f5f3ff',
    badgeText: '#4c1d95',
  },
];

const ABCD_PALETTES: Record<BookletCode, Omit<CoverColorPalette, 'id' | 'name' | 'subtitle'>> = {
  A: {
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f2747',
    goldColor: '#f59e0b',
    softBg: '#eff6ff',
    badgeText: '#1e3a8a',
  },
  B: {
    primaryColor: '#047857',
    secondaryColor: '#064e3b',
    goldColor: '#10b981',
    softBg: '#ecfdf5',
    badgeText: '#065f46',
  },
  C: {
    primaryColor: '#be123c',
    secondaryColor: '#7f1d1d',
    goldColor: '#f59e0b',
    softBg: '#fff1f2',
    badgeText: '#881337',
  },
  D: {
    primaryColor: '#6d28d9',
    secondaryColor: '#3b0764',
    goldColor: '#eab308',
    softBg: '#f5f3ff',
    badgeText: '#4c1d95',
  },
};

export function resolveCoverColorPalette(
  cover: Pick<CoverConfig, 'bookletCode' | 'coverColorThemeId'>,
  fallbackPreset: { primaryColor: string; secondaryColor: string; goldColor: string }
): {
  primaryColor: string;
  secondaryColor: string;
  goldColor: string;
  softBg: string;
  badgeText: string;
  themeLabel: string;
} {
  const themeId = cover.coverColorThemeId ?? 'otomatik-abcd';
  if (themeId === 'otomatik-abcd') {
    const abcd = ABCD_PALETTES[cover.bookletCode] ?? ABCD_PALETTES.A;
    return {
      ...abcd,
      themeLabel: `${cover.bookletCode} Kitapçığı Otomatik Renk`,
    };
  }
  if (themeId === 'kurum-temasi') {
    return {
      primaryColor: fallbackPreset.primaryColor,
      secondaryColor: fallbackPreset.secondaryColor,
      goldColor: fallbackPreset.goldColor,
      softBg: '#f1f5f9',
      badgeText: fallbackPreset.secondaryColor,
      themeLabel: 'Kurum Logo Teması',
    };
  }
  const found = COVER_COLOR_THEMES.find((t) => t.id === themeId);
  if (found) {
    return {
      primaryColor: found.primaryColor,
      secondaryColor: found.secondaryColor,
      goldColor: found.goldColor,
      softBg: found.softBg,
      badgeText: found.badgeText,
      themeLabel: found.name,
    };
  }
  return {
    primaryColor: fallbackPreset.primaryColor,
    secondaryColor: fallbackPreset.secondaryColor,
    goldColor: fallbackPreset.goldColor,
    softBg: '#eff6ff',
    badgeText: fallbackPreset.secondaryColor,
    themeLabel: 'Standart Tema',
  };
}

export interface CoverLayoutOption {
  id: CoverLayoutStyleId;
  name: string;
  shortLabel: string;
  subtitle: string;
}

export const COVER_LAYOUT_OPTIONS: CoverLayoutOption[] = [
  {
    id: 'klasik-cerceve',
    name: 'Klasik Çerçeve',
    shortLabel: 'Çerçeve',
    subtitle: 'Çift katlı kurumsal dış çerçeve ve klasik üst bant',
  },
  {
    id: 'diyagonal-serit',
    name: 'Diyagonal Şerit',
    shortLabel: 'Diyagonal',
    subtitle: 'Modern çapraz geometrik bantlar ve dinamik kurdele',
  },
  {
    id: 'geometrik-blok',
    name: 'Geometrik Blok',
    shortLabel: 'Blok',
    subtitle: 'Sol dikey omurga şeridi ve mimari köşe blokları',
  },
  {
    id: 'akademik-kose',
    name: 'Akademik Köşe',
    shortLabel: 'Köşe Arma',
    subtitle: 'Dört köşe üçgen bant ve altın rozet ayırıcı çizgi',
  },
];

export function resolveCoverLayoutStyle(
  cover?: Pick<CoverConfig, 'coverLayoutId'> | null
): CoverLayoutOption {
  const id = cover?.coverLayoutId ?? 'klasik-cerceve';
  return COVER_LAYOUT_OPTIONS.find((opt) => opt.id === id) ?? COVER_LAYOUT_OPTIONS[0];
}

export function normalizeBookletNumber(raw?: string | number, fallbackIndex = 1): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) {
    return String(50000 + Math.max(1, fallbackIndex)).padStart(6, '0').slice(-6);
  }
  return digits.padStart(6, '0').slice(-6);
}

export function defaultStartBookletNumberForGrade(gradeId: GradeLevelId): number {
  const numericMap: Record<GradeLevelId, number> = {
    '3': 30001,
    '4': 40001,
    '5': 50001,
    '6': 60001,
    '7': 70001,
    '8': 80001,
    '9': 90001,
    '10': 100001,
    '11': 110001,
    '12': 120001,
    TYT: 130001,
    'AYT-SAY': 140001,
    'AYT-EA': 150001,
    'AYT-SOZ': 160001,
  };
  return numericMap[gradeId] ?? 50001;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicFisherYates(length: number, seed: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildTierPermutationsForAllBooklets(
  length: number,
  orderSeed: number,
  subjectIdx: number,
  tierIdx: number
): Record<BookletCode, number[]> {
  if (length <= 1) {
    return { A: [0], B: [0], C: [0], D: [0] };
  }
  if (length === 2) {
    const flipA = orderSeed !== 0 && (orderSeed + subjectIdx + tierIdx) % 2 === 1;
    const flipB = (orderSeed + subjectIdx + tierIdx) % 2 === 0;
    const flipC = (orderSeed + subjectIdx * 3 + tierIdx + 1) % 2 === 0;
    const flipD = (orderSeed + subjectIdx * 2 + tierIdx * 3) % 2 === 0;
    return {
      A: flipA ? [1, 0] : [0, 1],
      B: flipB ? [1, 0] : [0, 1],
      C: flipC ? [1, 0] : [0, 1],
      D: flipD ? [1, 0] : [0, 1],
    };
  }

  const used = new Set<string>();
  const result = {} as Record<BookletCode, number[]>;

  BOOKLET_CODES.forEach((code, codeIdx) => {
    if (code === 'A' && orderSeed === 0) {
      const identity = Array.from({ length }, (_, i) => i);
      used.add(identity.join(','));
      result.A = identity;
      return;
    }

    let chosen: number[] = Array.from({ length }, (_, i) => i);
    for (let attempt = 0; attempt < 32; attempt++) {
      const seed =
        (codeIdx + 1) * 104729 +
        (orderSeed + 1) * 7919 +
        (subjectIdx + 1) * 353 +
        (tierIdx + 1) * 97 +
        attempt * 1999;
      const candidate = deterministicFisherYates(length, seed);
      const sig = candidate.join(',');
      if (!used.has(sig)) {
        chosen = candidate;
        used.add(sig);
        break;
      }
      chosen = candidate;
    }
    result[code] = chosen;
  });

  return result;
}

const DIFFICULTY_TIERS: DifficultyLevel[] = ['Kolay', 'Orta', 'Zor'];

/**
 * Permutes questions INSIDE each contiguous subject block while strictly preserving
 * the exact difficulty level (`Kolay` / `Orta` / `Zor`) at every slot index.
 */
function permuteSubjectGroupPreservingDifficulty(
  group: ExamQuestion[],
  bookletCode: BookletCode,
  orderSeed: number,
  subjectIdx: number
): ExamQuestion[] {
  const m = group.length;
  if (m <= 1) return [...group];
  if (bookletCode === 'A' && orderSeed === 0) return [...group];

  const output = new Array<ExamQuestion>(m);
  const tierBuckets = new Map<string, number[]>();

  group.forEach((q, localIdx) => {
    const key = q.difficulty || 'Orta';
    const existing = tierBuckets.get(key);
    if (existing) {
      existing.push(localIdx);
    } else {
      tierBuckets.set(key, [localIdx]);
    }
  });

  const orderedTierKeys = [
    ...DIFFICULTY_TIERS.filter((t) => tierBuckets.has(t)),
    ...Array.from(tierBuckets.keys()).filter(
      (k) => !DIFFICULTY_TIERS.includes(k as DifficultyLevel)
    ),
  ];

  orderedTierKeys.forEach((tierKey, tierIdx) => {
    const slots = tierBuckets.get(tierKey)!;
    const perms = buildTierPermutationsForAllBooklets(
      slots.length,
      orderSeed,
      subjectIdx,
      tierIdx
    );
    const perm = perms[bookletCode];
    slots.forEach((targetSlot, pos) => {
      const sourceSlot = slots[perm[pos]];
      output[targetSlot] = group[sourceSlot];
    });
  });

  return output;
}

/**
 * Deterministically builds A, B, C, or D booklet variant from a base question list:
 * - Preserves contiguous subject grouping AND exact difficulty level (`Kolay` / `Orta` / `Zor`) at every slot.
 * - Booklet A preserves base order (1..N) when orderSeed = 0; reshuffles deterministically when orderSeed > 0.
 * - Booklets B, C, D deterministically permute questions within matching difficulty tiers and renumber 1..N.
 */
export function buildBookletVariantQuestions(
  baseQuestions: ExamQuestion[],
  bookletCode: BookletCode,
  orderSeed = 0
): ExamQuestion[] {
  if (baseQuestions.length === 0) return [];
  if (bookletCode === 'A' && orderSeed === 0) {
    return baseQuestions.map((q, idx) => ({ ...q, number: idx + 1 }));
  }

  const subjectGroups: ExamQuestion[][] = [];
  for (const q of baseQuestions) {
    const lastGroup = subjectGroups[subjectGroups.length - 1];
    if (lastGroup && lastGroup[0].subject === q.subject) {
      lastGroup.push(q);
    } else {
      subjectGroups.push([q]);
    }
  }

  const reordered = subjectGroups.flatMap((grp, subjectIdx) =>
    permuteSubjectGroupPreservingDifficulty(grp, bookletCode, orderSeed, subjectIdx)
  );
  return reordered.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

export function buildAnswerKeyString(questions: ExamQuestion[]): string {
  return questions.map((q) => (q.correctOption || 'A').trim().toUpperCase().charAt(0) || 'A').join('');
}

export function buildAnswerKeysForAllBooklets(
  baseQuestions: ExamQuestion[],
  orderSeed = 0
): Record<BookletCode, string> {
  return {
    A: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'A', orderSeed)),
    B: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'B', orderSeed)),
    C: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'C', orderSeed)),
    D: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'D', orderSeed)),
  };
}

export interface BookletVariantComparisonItem {
  code: BookletCode;
  questionCount: number;
  mappedBaseNumbers: number[];
  answerKey: string;
  orderSignature: string;
  difficultyPreserved: boolean;
  subjectPreserved: boolean;
  movedCount: number;
}

export function computeDifficultyCounts(
  questions: ExamQuestion[]
): Record<DifficultyLevel, number> {
  const counts: Record<DifficultyLevel, number> = { Kolay: 0, Orta: 0, Zor: 0 };
  for (const q of questions) {
    if (q.difficulty === 'Kolay' || q.difficulty === 'Orta' || q.difficulty === 'Zor') {
      counts[q.difficulty] += 1;
    }
  }
  return counts;
}

export function buildBookletOrderComparison(
  baseQuestions: ExamQuestion[],
  orderSeed = 0
): {
  items: BookletVariantComparisonItem[];
  allOrdersUnique: boolean;
  allKeysUnique: boolean;
  difficultyPreserved: boolean;
  subjectPreserved: boolean;
  difficultyCounts: Record<DifficultyLevel, number>;
} {
  const baseIndexById = new Map<string, number>();
  baseQuestions.forEach((q, idx) => baseIndexById.set(q.id, idx + 1));

  const items: BookletVariantComparisonItem[] = BOOKLET_CODES.map((code) => {
    const variant = buildBookletVariantQuestions(baseQuestions, code, orderSeed);
    const mappedBaseNumbers = variant.map((q) => baseIndexById.get(q.id) ?? q.number);
    const itemDifficultyPreserved = variant.every(
      (q, idx) => q.difficulty === baseQuestions[idx]?.difficulty
    );
    const itemSubjectPreserved = variant.every(
      (q, idx) => q.subject === baseQuestions[idx]?.subject
    );
    const movedCount = mappedBaseNumbers.reduce(
      (acc, baseNum, idx) => (baseNum !== idx + 1 ? acc + 1 : acc),
      0
    );

    return {
      code,
      questionCount: variant.length,
      mappedBaseNumbers,
      answerKey: buildAnswerKeyString(variant),
      orderSignature: mappedBaseNumbers.join('-'),
      difficultyPreserved: itemDifficultyPreserved,
      subjectPreserved: itemSubjectPreserved,
      movedCount,
    };
  });

  const uniqueSignatures = new Set(items.map((i) => i.orderSignature));
  const uniqueKeys = new Set(items.map((i) => i.answerKey));
  return {
    items,
    allOrdersUnique: baseQuestions.length >= 3 ? uniqueSignatures.size === 4 : true,
    allKeysUnique: baseQuestions.length >= 4 ? uniqueKeys.size === 4 : true,
    difficultyPreserved: items.every((i) => i.difficultyPreserved),
    subjectPreserved: items.every((i) => i.subjectPreserved),
    difficultyCounts: computeDifficultyCounts(baseQuestions),
  };
}

export interface BookletVariantSyncBundle {
  activeCode: BookletCode;
  orderSeed: number;
  activeQuestions: ExamQuestion[];
  activeAnswerKey: string;
  allAnswerKeys: Record<BookletCode, string>;
  variantsByCode: Record<BookletCode, ExamQuestion[]>;
  comparison: ReturnType<typeof buildBookletOrderComparison>;
}

/**
 * Atomically computes deterministic A/B/C/D booklet question variants (preserving difficulty)
 * and simultaneously synchronizes the active optical answer key and all 4 booklet keys.
 */
export function syncBookletVariantsAndOpticalKeys(
  baseQuestions: ExamQuestion[],
  activeCode: BookletCode,
  orderSeed = 0
): BookletVariantSyncBundle {
  const variantsByCode: Record<BookletCode, ExamQuestion[]> = {
    A: buildBookletVariantQuestions(baseQuestions, 'A', orderSeed),
    B: buildBookletVariantQuestions(baseQuestions, 'B', orderSeed),
    C: buildBookletVariantQuestions(baseQuestions, 'C', orderSeed),
    D: buildBookletVariantQuestions(baseQuestions, 'D', orderSeed),
  };
  const allAnswerKeys: Record<BookletCode, string> = {
    A: buildAnswerKeyString(variantsByCode.A),
    B: buildAnswerKeyString(variantsByCode.B),
    C: buildAnswerKeyString(variantsByCode.C),
    D: buildAnswerKeyString(variantsByCode.D),
  };
  return {
    activeCode,
    orderSeed,
    activeQuestions: variantsByCode[activeCode],
    activeAnswerKey: allAnswerKeys[activeCode],
    allAnswerKeys,
    variantsByCode,
    comparison: buildBookletOrderComparison(baseQuestions, orderSeed),
  };
}

export function extractGradeLabelFromCover(
  cover: Pick<CoverConfig, 'gradeLabel' | 'subtitle' | 'examTitle'>,
  fallbackGradeLabel?: string
): string {
  if (cover.gradeLabel && cover.gradeLabel.trim().length > 0) {
    return cover.gradeLabel.trim();
  }
  const source = `${cover.subtitle || ''} ${cover.examTitle || ''}`;
  const match = source.match(/\b([3-9]|1[0-2])\.\s*Sınıf\b/i);
  if (match) return `${match[1]}. Sınıf`;
  if (/\bTYT\b/i.test(source)) return 'TYT';
  if (/\bAYT[- ]SAY/i.test(source)) return 'AYT-SAY';
  if (/\bAYT[- ]EA/i.test(source)) return 'AYT-EA';
  if (/\bAYT[- ]SÖZ|AYT[- ]SOZ/i.test(source)) return 'AYT-SÖZ';
  return fallbackGradeLabel || 'Kurumsal Deneme';
}

export interface BuildBatchAssignmentsParams {
  gradeProfile: GradeProfile;
  baseQuestions: ExamQuestion[];
  count?: number;
  startBookletNumber?: number;
  startingBookletCode?: BookletCode;
  orderSeed?: number;
  students?: StudentRecord[];
  institutionId?: string;
  examSourceMode?: ExamSourceMode;
  externalKeys?: Partial<Record<BookletCode, string>>;
  fallbackKey?: string;
}

export function normalizeExternalAnswerKeyString(
  raw: string,
  optionCount: 4 | 5 = 5
): string {
  const allowed = optionCount === 4 ? /[ABCD]/g : /[ABCDE]/g;
  const matches = (raw || '').toUpperCase().match(allowed);
  return matches ? matches.join('') : '';
}

export function resolveActiveAnswerKeyByMode(params: {
  examSourceMode: ExamSourceMode;
  bookletCode: BookletCode;
  baseQuestions: ExamQuestion[];
  orderSeed?: number;
  externalKeys?: Partial<Record<BookletCode, string>>;
  optionCount?: 4 | 5;
  fallbackKey?: string;
}): string {
  const optionCount = params.optionCount ?? 5;
  if (params.examSourceMode === 'farkli-yayin') {
    const extRaw = params.externalKeys?.[params.bookletCode] ?? '';
    const extNorm = normalizeExternalAnswerKeyString(extRaw, optionCount);
    if (extNorm.length > 0) return extNorm;
    const anyExt = BOOKLET_CODES.map((c) =>
      normalizeExternalAnswerKeyString(params.externalKeys?.[c] ?? '', optionCount)
    ).find((k) => k.length > 0);
    if (anyExt) return anyExt;
    return normalizeExternalAnswerKeyString(params.fallbackKey ?? '', optionCount) ||
      buildAnswerKeyString(params.baseQuestions);
  }
  const all = buildAnswerKeysForAllBooklets(params.baseQuestions, params.orderSeed ?? 0);
  return all[params.bookletCode];
}

export function buildBatchBookletAssignments(
  params: BuildBatchAssignmentsParams
): StudentBookletAssignment[] {
  const count = Math.max(1, Math.min(200, Math.round(params.count ?? 50)));
  const startNum =
    typeof params.startBookletNumber === 'number' && Number.isFinite(params.startBookletNumber)
      ? Math.max(1, Math.round(params.startBookletNumber))
      : defaultStartBookletNumberForGrade(params.gradeProfile.id);

  const startCodeIdx = Math.max(
    0,
    BOOKLET_CODES.indexOf(params.startingBookletCode ?? 'A')
  );

  const mode = params.examSourceMode ?? 'kurum';
  const keysByCode: Record<BookletCode, string> =
    mode === 'farkli-yayin'
      ? {
          A: resolveActiveAnswerKeyByMode({
            examSourceMode: 'farkli-yayin',
            bookletCode: 'A',
            baseQuestions: params.baseQuestions,
            orderSeed: params.orderSeed,
            externalKeys: params.externalKeys,
            optionCount: params.gradeProfile.optionCount,
            fallbackKey: params.fallbackKey,
          }),
          B: resolveActiveAnswerKeyByMode({
            examSourceMode: 'farkli-yayin',
            bookletCode: 'B',
            baseQuestions: params.baseQuestions,
            orderSeed: params.orderSeed,
            externalKeys: params.externalKeys,
            optionCount: params.gradeProfile.optionCount,
            fallbackKey: params.fallbackKey,
          }),
          C: resolveActiveAnswerKeyByMode({
            examSourceMode: 'farkli-yayin',
            bookletCode: 'C',
            baseQuestions: params.baseQuestions,
            orderSeed: params.orderSeed,
            externalKeys: params.externalKeys,
            optionCount: params.gradeProfile.optionCount,
            fallbackKey: params.fallbackKey,
          }),
          D: resolveActiveAnswerKeyByMode({
            examSourceMode: 'farkli-yayin',
            bookletCode: 'D',
            baseQuestions: params.baseQuestions,
            orderSeed: params.orderSeed,
            externalKeys: params.externalKeys,
            optionCount: params.gradeProfile.optionCount,
            fallbackKey: params.fallbackKey,
          }),
        }
      : buildAnswerKeysForAllBooklets(params.baseQuestions, params.orderSeed ?? 0);

  const matchingStudents = (params.students ?? []).filter(
    (s) =>
      s.gradeId === params.gradeProfile.id &&
      (!params.institutionId || s.institutionId === params.institutionId)
  );

  const branchLetters = ['A', 'B', 'C', 'D'];
  const classPrefix = params.gradeProfile.id.replace(/[^0-9A-Za-z]/g, '') || '5';
  const gradeNumeric = /^\d+$/.test(params.gradeProfile.id)
    ? Number(params.gradeProfile.id)
    : 12;

  const assignments: StudentBookletAssignment[] = [];
  for (let i = 0; i < count; i++) {
    const enrolled = matchingStudents[i];
    const bookletCode =
      enrolled?.assignedBookletCode && BOOKLET_CODES.includes(enrolled.assignedBookletCode)
        ? enrolled.assignedBookletCode
        : BOOKLET_CODES[(startCodeIdx + i) % BOOKLET_CODES.length];
    const bookletNumber = enrolled?.assignedBookletNumber
      ? normalizeBookletNumber(enrolled.assignedBookletNumber, i + 1)
      : String(startNum + i).padStart(6, '0').slice(-6);

    const fallbackStuNum = String(gradeNumeric * 1000000 + 1000 + i + 1)
      .padStart(8, '0')
      .slice(0, 8);
    const fallbackClass = `${classPrefix}-${branchLetters[Math.floor(i / 15) % branchLetters.length]}`;

    assignments.push({
      index: i + 1,
      studentName: enrolled
        ? enrolled.fullName
        : `${params.gradeProfile.shortLabel} Öğrenci ${String(i + 1).padStart(2, '0')}`,
      studentNumber8: enrolled ? enrolled.studentNumber8 : fallbackStuNum,
      classroom: enrolled ? enrolled.classroom : fallbackClass,
      gradeLabel: params.gradeProfile.shortLabel,
      bookletCode,
      bookletNumber,
      answerKey: keysByCode[bookletCode],
    });
  }

  return assignments;
}

export interface AssignRegisteredStudentsResult {
  assignments: StudentBookletAssignment[];
  updatedStudents: StudentRecord[];
  assignedCount: number;
}

/**
 * Automatically distributes registered students across A-B-C-D booklets (and 6-digit booklet numbers)
 * for both internal academy exams and external publisher exams ("farklı yayın denemesi").
 */
export function assignBookletsToRegisteredStudents(params: {
  students: StudentRecord[];
  institutionId: string;
  gradeProfile: GradeProfile;
  baseQuestions: ExamQuestion[];
  startingBookletCode?: BookletCode;
  distributionPattern?: BookletDistributionPattern;
  startBookletNumber?: number;
  orderSeed?: number;
  examSourceMode?: ExamSourceMode;
  externalKeys?: Partial<Record<BookletCode, string>>;
  fallbackKey?: string;
  includeAllGradesInInstitution?: boolean;
  preserveExisting?: boolean;
}): AssignRegisteredStudentsResult {
  const startNum =
    typeof params.startBookletNumber === 'number' && Number.isFinite(params.startBookletNumber)
      ? Math.max(1, Math.round(params.startBookletNumber))
      : defaultStartBookletNumberForGrade(params.gradeProfile.id);
  const cycleCodes = getBookletCycleCodes(params.distributionPattern ?? 'ABCD');
  const startCodeIdx = Math.max(
    0,
    cycleCodes.indexOf(params.startingBookletCode ?? 'A')
  );
  const mode = params.examSourceMode ?? 'kurum';

  const keysByCode: Record<BookletCode, string> = {
    A: resolveActiveAnswerKeyByMode({
      examSourceMode: mode,
      bookletCode: 'A',
      baseQuestions: params.baseQuestions,
      orderSeed: params.orderSeed,
      externalKeys: params.externalKeys,
      optionCount: params.gradeProfile.optionCount,
      fallbackKey: params.fallbackKey,
    }),
    B: resolveActiveAnswerKeyByMode({
      examSourceMode: mode,
      bookletCode: 'B',
      baseQuestions: params.baseQuestions,
      orderSeed: params.orderSeed,
      externalKeys: params.externalKeys,
      optionCount: params.gradeProfile.optionCount,
      fallbackKey: params.fallbackKey,
    }),
    C: resolveActiveAnswerKeyByMode({
      examSourceMode: mode,
      bookletCode: 'C',
      baseQuestions: params.baseQuestions,
      orderSeed: params.orderSeed,
      externalKeys: params.externalKeys,
      optionCount: params.gradeProfile.optionCount,
      fallbackKey: params.fallbackKey,
    }),
    D: resolveActiveAnswerKeyByMode({
      examSourceMode: mode,
      bookletCode: 'D',
      baseQuestions: params.baseQuestions,
      orderSeed: params.orderSeed,
      externalKeys: params.externalKeys,
      optionCount: params.gradeProfile.optionCount,
      fallbackKey: params.fallbackKey,
    }),
  };

  let matchIndex = 0;
  const assignments: StudentBookletAssignment[] = [];
  const updatedStudents = params.students.map((stu) => {
    const matchesInstitution = stu.institutionId === params.institutionId;
    const matchesGrade = params.includeAllGradesInInstitution || stu.gradeId === params.gradeProfile.id;
    if (!matchesInstitution || !matchesGrade) {
      return stu;
    }

    const i = matchIndex++;
    const bookletCode =
      params.preserveExisting &&
      stu.assignedBookletCode &&
      cycleCodes.includes(stu.assignedBookletCode)
        ? stu.assignedBookletCode
        : cycleCodes[(startCodeIdx + i) % cycleCodes.length];
    const bookletNumber =
      params.preserveExisting && stu.assignedBookletNumber
        ? normalizeBookletNumber(stu.assignedBookletNumber, i + 1)
        : String(startNum + i).padStart(6, '0').slice(-6);

    assignments.push({
      index: i + 1,
      studentName: stu.fullName,
      studentNumber8: stu.studentNumber8,
      classroom: stu.classroom,
      gradeLabel: stu.gradeId === params.gradeProfile.id ? params.gradeProfile.shortLabel : `${stu.gradeId}. Sınıf`,
      bookletCode,
      bookletNumber,
      answerKey: keysByCode[bookletCode],
    });

    return {
      ...stu,
      assignedBookletCode: bookletCode,
      assignedBookletNumber: bookletNumber,
    };
  });

  return {
    assignments,
    updatedStudents,
    assignedCount: assignments.length,
  };
}

export function buildBatchAssignmentsCsv(
  assignments: StudentBookletAssignment[],
  examTitle: string
): string {
  const header = [
    'Sıra',
    'Öğrenci Adı Soyadı',
    'Öğrenci No',
    'Sınıf',
    'Kitapçık Türü',
    'Kitapçık No',
    'Deneme İsmi',
    'Cevap Anahtarı',
  ].join(';');
  const rows = assignments.map((a) =>
    [
      a.index,
      `"${a.studentName.replace(/"/g, '""')}"`,
      a.studentNumber8,
      `"${a.classroom}"`,
      a.bookletCode,
      `="${a.bookletNumber}"`,
      `"${examTitle.replace(/"/g, '""')}"`,
      a.answerKey,
    ].join(';')
  );
  return `\uFEFF${header}\n${rows.join('\n')}`;
}

function sanitizeAsciiSlug(text: string): string {
  return text
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function buildBookletPdfFilename(
  cover: Pick<CoverConfig, 'academyName' | 'bookletCode' | 'bookletNumber'>,
  targetCode?: BookletCode,
  customBookletNumber?: string
): string {
  const code = targetCode ?? cover.bookletCode ?? 'A';
  const num = normalizeBookletNumber(customBookletNumber ?? cover.bookletNumber, 1);
  const slug = sanitizeAsciiSlug(cover.academyName || 'Dogruluk-Akademi') || 'Dogruluk-Akademi';
  return `${slug}-${code}-Kitapcik-${num}.pdf`;
}

export function buildOpticalPdfFilename(
  cover: Pick<CoverConfig, 'academyName' | 'bookletCode' | 'bookletNumber' | 'institutionCode8'>,
  targetCode?: BookletCode,
  customBookletNumber?: string,
  studentNumber8?: string
): string {
  const code = targetCode ?? cover.bookletCode ?? 'A';
  const num = normalizeBookletNumber(customBookletNumber ?? cover.bookletNumber, 1);
  const instCode = (cover.institutionCode8 || '00000000').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  const stuClean = (studentNumber8 || '').replace(/\D/g, '').slice(0, 8);
  return stuClean
    ? `Optik-Form-${code}-No${num}-Ogr${stuClean}-${instCode}.pdf`
    : `Optik-Form-${code}-No${num}-${instCode}.pdf`;
}

export function buildAllBookletsZipFilename(
  academyName?: string,
  suffix = 'ABCD-Tum-Kitapciklar'
): string {
  const slug = sanitizeAsciiSlug(academyName || 'Dogruluk-Akademi') || 'Dogruluk-Akademi';
  return `${slug}-${suffix}.zip`;
}

export function buildAllBookletsAnswerKeyCsv(
  baseQuestions: ExamQuestion[],
  orderSeed = 0
): string {
  const variants: Record<BookletCode, ExamQuestion[]> = {
    A: buildBookletVariantQuestions(baseQuestions, 'A', orderSeed),
    B: buildBookletVariantQuestions(baseQuestions, 'B', orderSeed),
    C: buildBookletVariantQuestions(baseQuestions, 'C', orderSeed),
    D: buildBookletVariantQuestions(baseQuestions, 'D', orderSeed),
  };
  const header = [
    'SoruNo',
    'Ders',
    'Zorluk',
    'A_Kitapcik_Cevap',
    'B_Kitapcik_Cevap',
    'C_Kitapcik_Cevap',
    'D_Kitapcik_Cevap',
    'B_Kaynak_Soru',
    'C_Kaynak_Soru',
    'D_Kaynak_Soru',
  ].join(';');
  const baseNumById = new Map<string, number>();
  baseQuestions.forEach((q, idx) => baseNumById.set(q.id, idx + 1));

  const rows = variants.A.map((qA, idx) => {
    const qB = variants.B[idx];
    const qC = variants.C[idx];
    const qD = variants.D[idx];
    return [
      idx + 1,
      `"${qA.subject.replace(/"/g, '""')}"`,
      qA.difficulty,
      qA.correctOption,
      qB?.correctOption ?? qA.correctOption,
      qC?.correctOption ?? qA.correctOption,
      qD?.correctOption ?? qA.correctOption,
      qB ? baseNumById.get(qB.id) ?? qB.number : idx + 1,
      qC ? baseNumById.get(qC.id) ?? qC.number : idx + 1,
      qD ? baseNumById.get(qD.id) ?? qD.number : idx + 1,
    ].join(';');
  });

  return `\uFEFF${header}\n${rows.join('\n')}`;
}

