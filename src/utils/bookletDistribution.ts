import {
  BookletCode,
  CoverColorThemeId,
  CoverConfig,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';

export const BOOKLET_CODES: BookletCode[] = ['A', 'B', 'C', 'D'];

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

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function findCoprimeStride(length: number, preferred: number): number {
  if (length <= 2) return 1;
  for (let delta = 0; delta < length; delta++) {
    const candidate = ((preferred + delta - 1) % (length - 1)) + 1;
    if (gcd(candidate, length) === 1 && candidate !== 1) {
      return candidate;
    }
  }
  return 1;
}

function permuteSubjectGroup(
  group: ExamQuestion[],
  bookletCode: BookletCode
): ExamQuestion[] {
  const m = group.length;
  if (m <= 1 || bookletCode === 'A') return [...group];

  if (m === 2) {
    if (bookletCode === 'B') return [group[1], group[0]];
    if (bookletCode === 'C') return [group[1], group[0]];
    return [group[1], group[0]];
  }

  let indices: number[] = [];
  if (bookletCode === 'B') {
    const stride = findCoprimeStride(m, Math.max(2, Math.floor(m / 2)));
    for (let i = 0; i < m; i++) {
      indices.push((1 + i * stride) % m);
    }
  } else if (bookletCode === 'C') {
    const shift = Math.max(1, Math.floor(m / 3));
    for (let i = 0; i < m; i++) {
      indices.push((m - 1 - i + shift) % m);
    }
  } else {
    // D booklet: alternate from both ends outward/inward then adjust cleanly
    const stride = findCoprimeStride(m, Math.max(2, m - 2));
    for (let i = 0; i < m; i++) {
      indices.push((m - 1 + i * stride) % m);
    }
  }

  // Ensure D differs from B and C when m >= 4
  if (bookletCode === 'D' && m >= 4) {
    const bFirst = 1 % m;
    if (indices[0] === bFirst) {
      indices = [...indices.slice(1), indices[0]];
    }
  }

  return indices.map((idx) => group[idx]);
}

/**
 * Deterministically builds A, B, C, or D booklet variant from a base question list:
 * - Booklet A preserves base order (1..N).
 * - Booklets B, C, D deterministically permute questions inside each contiguous subject block
 *   and renumber 1..N so the exam remains organized by subject while preventing side-by-side copying.
 */
export function buildBookletVariantQuestions(
  baseQuestions: ExamQuestion[],
  bookletCode: BookletCode
): ExamQuestion[] {
  if (baseQuestions.length === 0) return [];
  if (bookletCode === 'A') {
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

  const reordered = subjectGroups.flatMap((grp) => permuteSubjectGroup(grp, bookletCode));
  return reordered.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

export function buildAnswerKeyString(questions: ExamQuestion[]): string {
  return questions.map((q) => (q.correctOption || 'A').trim().toUpperCase().charAt(0) || 'A').join('');
}

export function buildAnswerKeysForAllBooklets(
  baseQuestions: ExamQuestion[]
): Record<BookletCode, string> {
  return {
    A: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'A')),
    B: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'B')),
    C: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'C')),
    D: buildAnswerKeyString(buildBookletVariantQuestions(baseQuestions, 'D')),
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
  students?: StudentRecord[];
  institutionId?: string;
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

  const keysByCode = buildAnswerKeysForAllBooklets(params.baseQuestions);
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
    const bookletCode = BOOKLET_CODES[(startCodeIdx + i) % BOOKLET_CODES.length];
    const bookletNumber = String(startNum + i).padStart(6, '0').slice(-6);
    const enrolled = matchingStudents[i];

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
