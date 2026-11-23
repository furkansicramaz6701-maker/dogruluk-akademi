import * as XLSX from 'xlsx';
import {
  BookletCode,
  BookletDistributionPattern,
  GradeLevelId,
  Institution,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';
import {
  BOOKLET_CODES,
  defaultStartBookletNumberForGrade,
  getBookletCycleCodes,
  normalizeBookletNumber,
} from './bookletDistribution';
import { triggerDownload } from './downloadHelpers';
import { defaultClassroomForGrade, normalizeImportedGradeId } from './excelExport';
import { generate8DigitStudentNumber } from './institutionCodes';

export const DEFAULT_POSTER_GOOGLE_FORM_URL =
  'https://forms.gle/dogruluk-akademi-5-aralik-2026';

export const SATURDAY_DEC5_2026_LABEL = '05 Aralık 2026 Cumartesi · Saat: 10.00';
export const SATURDAY_DEC5_2026_DEADLINE = 'Son Kayıt: 4 Aralık 2026';

export interface GoogleFormStudentSubmission {
  id: string;
  sourceRowNumber: number;
  submittedAt: string;
  firstName: string;
  lastName: string;
  fullName: string;
  classroom: string;
  gradeId: GradeLevelId;
  studentNumber8: string;
  parentPhone?: string;
  bookletCode: BookletCode;
  bookletNumber: string;
  explicitBooklet?: BookletCode | null;
  rawClassInput?: string;
}

export interface ParsedGoogleFormsSpreadsheetResult {
  submissions: GoogleFormStudentSubmission[];
  detectedHeaders: string[];
  skippedEmptyRows: number;
  warnings: string[];
  summaryMessage: string;
}

function normalizeHeaderTr(text: string): string {
  return String(text ?? '')
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

export function normalizePosterGoogleFormUrl(rawUrl: string): {
  href: string;
  displayText: string;
  isValid: boolean;
} {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) {
    return {
      href: DEFAULT_POSTER_GOOGLE_FORM_URL,
      displayText: 'forms.gle/dogruluk-akademi-5-aralik-2026',
      isValid: true,
    };
  }
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    const cleanDisplay = `${parsed.host}${parsed.pathname}${parsed.search}`.replace(/\/+$/, '');
    return {
      href: parsed.toString(),
      displayText:
        cleanDisplay.length > 52 ? `${cleanDisplay.slice(0, 49)}...` : cleanDisplay,
      isValid: true,
    };
  } catch {
    return {
      href: withProto,
      displayText: trimmed.slice(0, 52),
      isValid: false,
    };
  }
}

export function splitTurkishFullName(
  rawFullName: string,
  rawFirstName?: string,
  rawLastName?: string
): { firstName: string; lastName: string; fullName: string } {
  const firstClean = String(rawFirstName ?? '').replace(/\s+/g, ' ').trim();
  const lastClean = String(rawLastName ?? '').replace(/\s+/g, ' ').trim();
  if (firstClean || lastClean) {
    const fullName = [firstClean, lastClean].filter(Boolean).join(' ').trim();
    return {
      firstName: firstClean || fullName,
      lastName: lastClean,
      fullName,
    };
  }
  const cleanedFull = String(rawFullName ?? '').replace(/\s+/g, ' ').trim();
  if (!cleanedFull) {
    return { firstName: '', lastName: '', fullName: '' };
  }
  const parts = cleanedFull.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', fullName: parts[0] };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName, fullName: `${firstName} ${lastName}` };
}

export function parseGoogleFormGradeAndClass(
  rawClassInput: unknown,
  rawGradeLevelInput: unknown,
  fallbackGradeId: GradeLevelId
): { gradeId: GradeLevelId; classroom: string } {
  const classStr = String(rawClassInput ?? '').trim();
  const gradeStr = String(rawGradeLevelInput ?? '').trim();
  const combined = `${gradeStr} ${classStr}`.trim();

  // Check explicit TYT / AYT mentions first
  const upperCombined = combined.toLocaleUpperCase('tr-TR');
  let resolvedGrade: GradeLevelId = fallbackGradeId;

  if (/\bTYT\b/.test(upperCombined)) {
    resolvedGrade = 'TYT';
  } else if (/AYT.*SAY|SAYISAL/.test(upperCombined)) {
    resolvedGrade = 'AYT-SAY';
  } else if (/AYT.*EA|EŞİT|ESIT/.test(upperCombined)) {
    resolvedGrade = 'AYT-EA';
  } else if (/AYT.*SÖZ|AYT.*SOZ|SÖZEL|SOZEL/.test(upperCombined)) {
    resolvedGrade = 'AYT-SOZ';
  } else if (gradeStr) {
    resolvedGrade = normalizeImportedGradeId(gradeStr, fallbackGradeId);
  } else if (classStr) {
    const numMatch = classStr.match(/^(\d{1,2})\s*(?:\.?\s*s[ıi]n[ıi]f)?[\s/\-_:]*([A-ZÇĞİÖŞÜ])?/i);
    if (numMatch) {
      resolvedGrade = normalizeImportedGradeId(numMatch[1], fallbackGradeId);
    } else {
      resolvedGrade = normalizeImportedGradeId(classStr, fallbackGradeId);
    }
  }

  let resolvedClassroom = defaultClassroomForGrade(resolvedGrade);
  if (classStr) {
    const branchMatch = classStr.match(/^(\d{1,2})\s*(?:\.?\s*s[ıi]n[ıi]f)?[\s/\-_:]*([A-ZÇĞİÖŞÜ0-9]{1,4})$/i);
    if (branchMatch) {
      const numPart = branchMatch[1];
      const branchPart = branchMatch[2].toLocaleUpperCase('tr-TR');
      resolvedClassroom = `${numPart}-${branchPart}`;
    } else if (/^[A-ZÇĞİÖŞÜ]$/i.test(classStr) && /^\d+$/.test(resolvedGrade)) {
      resolvedClassroom = `${resolvedGrade}-${classStr.toLocaleUpperCase('tr-TR')}`;
    } else if (/^(\d{1,2})\.?\s*s[ıi]n[ıi]f$/i.test(classStr)) {
      resolvedClassroom = defaultClassroomForGrade(resolvedGrade);
    } else {
      resolvedClassroom = classStr.slice(0, 18);
    }
  }

  return {
    gradeId: resolvedGrade,
    classroom: resolvedClassroom,
  };
}

function parseExplicitBooklet(raw: unknown): BookletCode | null {
  const cleaned = String(raw ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-D]/g, '');
  if (cleaned.length === 1 && (BOOKLET_CODES as string[]).includes(cleaned)) {
    return cleaned as BookletCode;
  }
  const match = String(raw ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .match(/\b([A-D])\b/);
  if (match && (BOOKLET_CODES as string[]).includes(match[1])) {
    return match[1] as BookletCode;
  }
  return null;
}

function findValueByAlias(
  rowEntries: Array<[string, unknown]>,
  exactAliases: string[],
  containsAliases: string[],
  excludeContains: string[] = []
): string {
  for (const [key, val] of rowEntries) {
    const norm = normalizeHeaderTr(key);
    if (excludeContains.some((ex) => norm.includes(ex))) continue;
    if (exactAliases.includes(norm)) {
      const s = String(val ?? '').trim();
      if (s) return s;
    }
  }
  for (const [key, val] of rowEntries) {
    const norm = normalizeHeaderTr(key);
    if (excludeContains.some((ex) => norm.includes(ex))) continue;
    if (containsAliases.some((alias) => norm.includes(alias))) {
      const s = String(val ?? '').trim();
      if (s) return s;
    }
  }
  return '';
}

export function assignBookletPatternToSubmissions(
  submissions: GoogleFormStudentSubmission[],
  options: {
    pattern: BookletDistributionPattern;
    groupByClassroom?: boolean;
    startingCode?: BookletCode;
    startBookletNumber?: number;
    preserveExplicitBooklet?: boolean;
  }
): GoogleFormStudentSubmission[] {
  const cycle = getBookletCycleCodes(options.pattern);
  const startCodeIdx = Math.max(0, cycle.indexOf(options.startingCode ?? 'A'));
  const baseNum = Math.max(1, Math.round(options.startBookletNumber ?? 50001));

  if (!options.groupByClassroom) {
    return submissions.map((item, idx) => {
      const bookletCode =
        options.preserveExplicitBooklet &&
        item.explicitBooklet &&
        cycle.includes(item.explicitBooklet)
          ? item.explicitBooklet
          : cycle[(startCodeIdx + idx) % cycle.length];
      return {
        ...item,
        bookletCode,
        bookletNumber: normalizeBookletNumber(String(baseNum + idx), idx + 1),
      };
    });
  }

  // Group by classroom while preserving original submission order within each class
  const classCounters = new Map<string, number>();
  return submissions.map((item, idx) => {
    const clsKey = item.classroom.toLocaleUpperCase('tr-TR') || 'GENEL';
    const classPos = classCounters.get(clsKey) ?? 0;
    classCounters.set(clsKey, classPos + 1);
    const bookletCode =
      options.preserveExplicitBooklet &&
      item.explicitBooklet &&
      cycle.includes(item.explicitBooklet)
        ? item.explicitBooklet
        : cycle[(startCodeIdx + classPos) % cycle.length];
    return {
      ...item,
      bookletCode,
      bookletNumber: normalizeBookletNumber(String(baseNum + idx), idx + 1),
    };
  });
}

export function parseGoogleFormsSpreadsheetBuffer(
  arrayBuffer: ArrayBuffer,
  options: {
    institution: Pick<Institution, 'id' | 'code8'>;
    fallbackGradeId: GradeLevelId;
    existingStudents?: StudentRecord[];
    distributionPattern?: BookletDistributionPattern;
    groupByClassroom?: boolean;
  }
): ParsedGoogleFormsSpreadsheetResult {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const pattern = options.distributionPattern ?? 'AB';
  const cycle = getBookletCycleCodes(pattern);
  const existingNumbers = new Set(
    (options.existingStudents ?? [])
      .filter((s) => s.institutionId === options.institution.id)
      .map((s) => s.studentNumber8)
  );

  const detectedHeadersSet = new Set<string>();
  const rawSubmissions: GoogleFormStudentSubmission[] = [];
  const warnings: string[] = [];
  let skippedEmptyRows = 0;

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      submissions: [],
      detectedHeaders: [],
      skippedEmptyRows: 0,
      warnings: ['Dosyada okunabilir çalışma sayfası bulunamadı.'],
      summaryMessage: 'Excel/CSV sayfası boş.',
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const entries = Object.entries(row);
    entries.forEach(([h]) => {
      if (h && !h.startsWith('__EMPTY')) detectedHeadersSet.add(h);
    });

    const rawFirstName = findValueByAlias(
      entries,
      ['ad', 'adi', 'ogrenci adi', 'isim', 'first name'],
      ['ogrenci ad', 'adi (', 'ad ('],
      ['soyad', 'soyisim']
    );
    const rawLastName = findValueByAlias(
      entries,
      ['soyad', 'soyadi', 'ogrenci soyadi', 'soyisim', 'last name'],
      ['soyad', 'soyisim'],
      ['adi', 'ad ', 'isim', 'full']
    );
    const rawFullName = findValueByAlias(
      entries,
      [
        'adi soyadi',
        'ad soyad',
        'ogrenci adi soyadi',
        'ogrencinin adi soyadi',
        'isim soyisim',
        'ogrenci',
        'full name',
        'name',
      ],
      ['adi soyad', 'ad soyad', 'isim soyisim', 'ogrenci ad', 'katilimci']
    );

    const split = splitTurkishFullName(rawFullName, rawFirstName, rawLastName);
    if (!split.fullName) {
      skippedEmptyRows += 1;
      return;
    }

    const rawSubmittedAt = findValueByAlias(
      entries,
      ['zaman damgasi', 'timestamp', 'kayit tarihi', 'tarih'],
      ['zaman damgasi', 'timestamp']
    );
    const rawGrade = findValueByAlias(
      entries,
      ['sinif duzeyi', 'duzey', 'kademe', 'grade', 'sinif seviyesi'],
      ['duzey', 'kademe', 'seviye']
    );
    const rawClass = findValueByAlias(
      entries,
      ['sinif', 'sinifi', 'sinif sube', 'sinifi subesi', 'sube', 'subesi', 'class'],
      ['sinif', 'sube']
    );
    const rawStuNo = findValueByAlias(
      entries,
      ['ogrenci no', 'okul no', 'numara', 'tc no', 'student number', 'no'],
      ['ogrenci no', 'okul no', 'numara']
    );
    const rawPhone = findValueByAlias(
      entries,
      ['veli telefonu', 'telefon', 'tel', 'veli tel', 'gsm', 'iletisim', 'phone'],
      ['telefon', 'gsm', 'veli tel', 'iletisim']
    );
    const rawBooklet = findValueByAlias(
      entries,
      ['kitapcik', 'kitapcik turu', 'booklet'],
      ['kitapcik']
    );

    const { gradeId, classroom } = parseGoogleFormGradeAndClass(
      rawClass,
      rawGrade,
      options.fallbackGradeId
    );

    const digitsOnly = rawStuNo.replace(/\D/g, '');
    let studentNumber8 = '';
    if (digitsOnly.length >= 8) {
      studentNumber8 = digitsOnly.slice(0, 8);
      if (existingNumbers.has(studentNumber8)) {
        studentNumber8 = generate8DigitStudentNumber(
          `${split.fullName}-${rowNum}`,
          options.institution.code8,
          existingNumbers
        );
      }
    } else {
      if (digitsOnly.length > 0 && digitsOnly.length < 8) {
        warnings.push(
          `Satır ${rowNum} (${split.fullName}): '${rawStuNo}' 8 haneden kısa olduğu için otomatik 8 haneli öğrenci no üretildi.`
        );
      }
      studentNumber8 = generate8DigitStudentNumber(
        `${split.fullName}-${rowNum}`,
        options.institution.code8,
        existingNumbers
      );
    }
    existingNumbers.add(studentNumber8);

    const explicitBooklet = parseExplicitBooklet(rawBooklet);
    const cycleCode =
      explicitBooklet && cycle.includes(explicitBooklet)
        ? explicitBooklet
        : cycle[rawSubmissions.length % cycle.length];

    rawSubmissions.push({
      id: `gform-${rowNum}-${studentNumber8}`,
      sourceRowNumber: rowNum,
      submittedAt: rawSubmittedAt || '05.12.2026 Başvurusu',
      firstName: split.firstName,
      lastName: split.lastName,
      fullName: split.fullName,
      classroom,
      gradeId,
      studentNumber8,
      parentPhone: rawPhone || undefined,
      bookletCode: cycleCode,
      bookletNumber: normalizeBookletNumber(
        String(defaultStartBookletNumberForGrade(gradeId) + rawSubmissions.length),
        rawSubmissions.length + 1
      ),
      explicitBooklet,
      rawClassInput: rawClass || rawGrade || undefined,
    });
  });

  const assigned = assignBookletPatternToSubmissions(rawSubmissions, {
    pattern,
    groupByClassroom: options.groupByClassroom,
    startBookletNumber: defaultStartBookletNumberForGrade(options.fallbackGradeId),
    preserveExplicitBooklet: false,
  });

  const summaryMessage =
    assigned.length > 0
      ? `Google Form Excel'inden ${assigned.length} öğrenci alındı ve ${
          pattern === 'AB'
            ? 'A - B (2 kitapçık)'
            : pattern === 'ABCD'
              ? 'A - B - C - D (4 kitapçık)'
              : 'Tek Kitapçık (A)'
        } düzeniyle optik ataması yapıldı.`
      : 'Excel dosyasında geçerli öğrenci adı soyadı satırı bulunamadı.';

  return {
    submissions: assigned,
    detectedHeaders: Array.from(detectedHeadersSet),
    skippedEmptyRows,
    warnings,
    summaryMessage,
  };
}

export function buildGoogleFormsSampleCohort(params: {
  institution: Pick<Institution, 'id' | 'code8'>;
  fallbackGradeId: GradeLevelId;
  pattern?: BookletDistributionPattern;
  groupByClassroom?: boolean;
}): GoogleFormStudentSubmission[] {
  const gNum = /^\d+$/.test(params.fallbackGradeId) ? params.fallbackGradeId : '5';
  const rawSample: Array<{
    submittedAt: string;
    fullName: string;
    classText: string;
    phone: string;
  }> = [
    { submittedAt: '23.11.2026 14:12', fullName: 'Elif Nur Yılmaz', classText: `${gNum}-A`, phone: '0532 411 22 01' },
    { submittedAt: '23.11.2026 14:25', fullName: 'Muhammed Emir Kaya', classText: `${gNum}-A`, phone: '0533 512 34 02' },
    { submittedAt: '23.11.2026 15:04', fullName: 'Zeynep Sude Demir', classText: `${gNum}-B`, phone: '0542 618 45 03' },
    { submittedAt: '23.11.2026 16:18', fullName: 'Yusuf Kerem Çelik', classText: `${gNum}-B`, phone: '0505 719 56 04' },
    { submittedAt: '24.11.2026 09:40', fullName: 'Miray Aslan', classText: `${gNum}-A`, phone: '0554 812 67 05' },
    { submittedAt: '24.11.2026 11:05', fullName: 'Ömer Faruk Şahin', classText: `${gNum}-C`, phone: '0535 914 78 06' },
    { submittedAt: '24.11.2026 13:47', fullName: 'Azra Melis Öztürk', classText: `${gNum}-B`, phone: '0544 316 89 07' },
    { submittedAt: '24.11.2026 17:33', fullName: 'Berat Kağan Aydın', classText: `${gNum}-C`, phone: '0507 218 90 08' },
  ];

  const existingSet = new Set<string>();
  const baseRows: GoogleFormStudentSubmission[] = rawSample.map((item, idx) => {
    const split = splitTurkishFullName(item.fullName);
    const { gradeId, classroom } = parseGoogleFormGradeAndClass(
      item.classText,
      '',
      params.fallbackGradeId
    );
    const studentNumber8 = generate8DigitStudentNumber(
      item.fullName,
      params.institution.code8,
      existingSet
    );
    existingSet.add(studentNumber8);
    return {
      id: `sample-gf-${idx + 1}`,
      sourceRowNumber: idx + 2,
      submittedAt: item.submittedAt,
      firstName: split.firstName,
      lastName: split.lastName,
      fullName: split.fullName,
      classroom,
      gradeId,
      studentNumber8,
      parentPhone: item.phone,
      bookletCode: 'A',
      bookletNumber: normalizeBookletNumber(undefined, idx + 1),
      rawClassInput: item.classText,
    };
  });

  return assignBookletPatternToSubmissions(baseRows, {
    pattern: params.pattern ?? 'AB',
    groupByClassroom: params.groupByClassroom,
    startBookletNumber: defaultStartBookletNumberForGrade(params.fallbackGradeId),
  });
}

export function mergeGoogleFormSubmissionsIntoStudents(
  existingStudents: StudentRecord[],
  submissions: GoogleFormStudentSubmission[],
  institution: Institution
): {
  nextStudents: StudentRecord[];
  addedCount: number;
  updatedCount: number;
  assignments: StudentBookletAssignment[];
} {
  const next = [...existingStudents];
  let addedCount = 0;
  let updatedCount = 0;

  for (const sub of submissions) {
    const matchIdx = next.findIndex(
      (s) =>
        s.institutionId === institution.id &&
        (s.studentNumber8 === sub.studentNumber8 ||
          (s.fullName.toLocaleLowerCase('tr-TR') ===
            sub.fullName.toLocaleLowerCase('tr-TR') &&
            s.classroom.toLocaleLowerCase('tr-TR') ===
              sub.classroom.toLocaleLowerCase('tr-TR')))
    );

    if (matchIdx >= 0) {
      next[matchIdx] = {
        ...next[matchIdx],
        fullName: sub.fullName,
        classroom: sub.classroom,
        gradeId: sub.gradeId,
        parentPhone: sub.parentPhone || next[matchIdx].parentPhone,
        assignedBookletCode: sub.bookletCode,
        assignedBookletNumber: sub.bookletNumber,
      };
      updatedCount += 1;
    } else {
      next.push({
        id: `stu-gf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: sub.fullName,
        studentNumber8: sub.studentNumber8,
        institutionId: institution.id,
        institutionCode8: institution.code8,
        institutionName: institution.name,
        classroom: sub.classroom,
        gradeId: sub.gradeId,
        parentPhone: sub.parentPhone,
        createdAt: new Date().toLocaleDateString('tr-TR'),
        assignedBookletCode: sub.bookletCode,
        assignedBookletNumber: sub.bookletNumber,
      });
      addedCount += 1;
    }
  }

  const assignments: StudentBookletAssignment[] = submissions.map((sub, idx) => ({
    index: idx + 1,
    studentName: sub.fullName,
    studentNumber8: sub.studentNumber8,
    classroom: sub.classroom,
    gradeLabel: `${sub.gradeId}. Sınıf`,
    bookletCode: sub.bookletCode,
    bookletNumber: sub.bookletNumber,
    answerKey: '',
  }));

  return {
    nextStudents: next,
    addedCount,
    updatedCount,
    assignments,
  };
}

export function downloadGoogleFormsTemplateWorkbook(gradeId: GradeLevelId): void {
  const gNum = /^\d+$/.test(gradeId) ? gradeId : '5';
  const rows = [
    {
      'Zaman damgası': '2026-11-24 10:15:00',
      'Öğrenci Adı Soyadı': 'Elif Nur Yılmaz',
      'Sınıf / Şube': `${gNum}-A`,
      'Öğrenci No': '',
      'Veli Telefonu': '0532 411 22 01',
    },
    {
      'Zaman damgası': '2026-11-24 10:22:00',
      'Öğrenci Adı Soyadı': 'Muhammed Emir Kaya',
      'Sınıf / Şube': `${gNum}-A`,
      'Öğrenci No': '',
      'Veli Telefonu': '0533 512 34 02',
    },
    {
      'Zaman damgası': '2026-11-24 11:08:00',
      'Öğrenci Adı Soyadı': 'Zeynep Sude Demir',
      'Sınıf / Şube': `${gNum}-B`,
      'Öğrenci No': '',
      'Veli Telefonu': '0542 618 45 03',
    },
    {
      'Zaman damgası': '2026-11-24 12:30:00',
      'Öğrenci Adı Soyadı': 'Yusuf Kerem Çelik',
      'Sınıf / Şube': `${gNum}-B`,
      'Öğrenci No': '',
      'Veli Telefonu': '0505 719 56 04',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Form Yanıtları 1');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `Google-Form-Basvuru-Ornegi-${gNum}-Sinif.xlsx`);
}

export function downloadGoogleFormsAssignedWorkbook(
  submissions: GoogleFormStudentSubmission[],
  examTitle: string
): void {
  const rows = submissions.map((s, idx) => ({
    Sıra: idx + 1,
    Adı: s.firstName,
    Soyadı: s.lastName,
    'Adı Soyadı': s.fullName,
    'Sınıf / Şube': s.classroom,
    Düzey: `${s.gradeId}. Sınıf`,
    'Öğrenci No': s.studentNumber8,
    Kitapçık: s.bookletCode,
    'Kitapçık No': s.bookletNumber,
    'Veli Telefonu': s.parentPhone ?? '',
    'Başvuru Zamanı': s.submittedAt,
    Deneme: examTitle,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Otomatik Optik Dağıtımı');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, 'Google-Form-Otomatik-Optik-Dagitim.xlsx');
}
