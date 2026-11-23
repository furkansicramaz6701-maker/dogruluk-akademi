import * as XLSX from 'xlsx';
import {
  BookletCode,
  ExamQuestion,
  GradeLevelId,
  Institution,
  StudentRecord,
} from '../types/academy';
import {
  BOOKLET_CODES,
  buildBookletVariantQuestions,
  defaultStartBookletNumberForGrade,
  normalizeBookletNumber,
  normalizeExternalAnswerKeyString,
} from './bookletDistribution';
import { parseAnswerString } from './examAnalysis';
import { defaultClassroomForGrade, normalizeImportedGradeId } from './excelExport';
import { generate8DigitStudentNumber } from './institutionCodes';
import { triggerDownload } from './downloadHelpers';
import {
  inspectAnswerStringReadability,
  OMR_ERROR_CATEGORY_LABELS,
  OmrScanErrorItem,
  validateStudentNumberField,
} from './omrValidation';

export interface ImportedOmrStudentRow {
  fullName: string;
  studentNumber8: string;
  classroom: string;
  gradeId: GradeLevelId;
  bookletCode: BookletCode;
  bookletNumber: string;
  studentAnswersRaw: string;
  matchedAnswerKey: string;
}

export interface ParsedOmrSpreadsheetResult {
  answerKeyRaw: string;
  studentAnswersRaw: string;
  answerKeysByBooklet: Partial<Record<BookletCode, string>>;
  importedStudents: ImportedOmrStudentRow[];
  hasExplicitMultiBookletKeys: boolean;
  summaryMessage: string;
  errors: OmrScanErrorItem[];
  totalRowsChecked: number;
}

export interface ParseOmrSpreadsheetOptions {
  expectedCount: number;
  optionCount: 4 | 5;
  activeBookletCode: BookletCode;
  fallbackGradeId: GradeLevelId;
  institution: Institution;
  existingStudents: StudentRecord[];
  baseQuestions?: ExamQuestion[];
  orderSeed?: number;
  autoDeriveMissingBooklets?: boolean;
}

export function normalizeOmrOptionSequence(
  raw: unknown,
  expectedCount: number,
  optionCount: 4 | 5
): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  const parsed = parseAnswerString(str, Math.max(expectedCount, str.length), optionCount);
  let lastNonNull = -1;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i] !== null) {
      lastNonNull = i;
      break;
    }
  }
  if (lastNonNull === -1) {
    return normalizeExternalAnswerKeyString(str, optionCount);
  }
  const targetLen = Math.max(lastNonNull + 1, Math.min(expectedCount, str.replace(/\s+/g, '').length));
  return parsed
    .slice(0, targetLen)
    .map((ch) => ch ?? '-')
    .join('');
}

function normalizeHeaderKey(header: string): string {
  return header
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

function parseBookletCodeValue(raw: unknown): BookletCode | null {
  const cleaned = String(raw ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-D]/g, '');
  if (cleaned.length === 1 && (BOOKLET_CODES as string[]).includes(cleaned)) {
    return cleaned as BookletCode;
  }
  const firstMatch = String(raw ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .match(/\b([A-D])\b/);
  if (firstMatch && (BOOKLET_CODES as string[]).includes(firstMatch[1])) {
    return firstMatch[1] as BookletCode;
  }
  return null;
}

function isAnswerKeyMarkerText(text: string): boolean {
  const norm = normalizeHeaderKey(text);
  if (!norm) return false;
  return (
    norm === 'cevap anahtari' ||
    norm === 'anahtar' ||
    norm === 'answer key' ||
    norm === 'resmi anahtar' ||
    norm.startsWith('cevap anahtari') ||
    norm.startsWith('anahtar ')
  );
}

/**
 * Deterministically derives A/B/C/D answer keys from a single base (A) key string
 * by applying a reproducible difficulty-style block rotation when explicit B/C/D keys
 * are not provided in the uploaded Excel/CSV file.
 */
export function deriveBookletAnswerKeysFromBase(
  baseKeyRaw: string,
  optionCount: 4 | 5,
  baseQuestions?: ExamQuestion[],
  orderSeed = 0
): Record<BookletCode, string> {
  const cleanBase = normalizeExternalAnswerKeyString(baseKeyRaw, optionCount);
  if (!cleanBase) {
    return { A: '', B: '', C: '', D: '' };
  }

  // If baseQuestions matches the exact length of cleanBase (or cleanBase starts with baseQuestions answers),
  // reuse buildBookletVariantQuestions so OMR & Generator remain 100% synchronized.
  if (
    baseQuestions &&
    baseQuestions.length > 0 &&
    cleanBase.length === baseQuestions.length
  ) {
    const overriddenBase = baseQuestions.map((q, idx) => ({
      ...q,
      correctOption: cleanBase[idx] || q.correctOption,
    }));
    const result = {} as Record<BookletCode, string>;
    for (const code of BOOKLET_CODES) {
      result[code] = buildBookletVariantQuestions(overriddenBase, code, orderSeed)
        .map((q) => q.correctOption)
        .join('');
    }
    return result;
  }

  // Deterministic permutation on characters when external key length differs from active baseQuestions
  const total = cleanBase.length;
  const result: Record<BookletCode, string> = {
    A: cleanBase,
    B: cleanBase,
    C: cleanBase,
    D: cleanBase,
  };
  const chars = cleanBase.split('');
  BOOKLET_CODES.forEach((code, variantIdx) => {
    if (variantIdx === 0) {
      result[code] = cleanBase;
      return;
    }
    const blockSize = Math.min(5, Math.max(2, Math.floor(total / 4) || 2));
    const reordered: string[] = [];
    for (let start = 0; start < total; start += blockSize) {
      const slice = chars.slice(start, start + blockSize);
      const shift = (variantIdx + Math.floor(start / blockSize) + orderSeed) % slice.length;
      const rotated = [...slice.slice(shift), ...slice.slice(0, shift)];
      reordered.push(...rotated);
    }
    result[code] = reordered.join('');
  });
  return result;
}

function extractIndexedQuestionSequence(
  rowEntries: Array<[string, unknown]>,
  optionCount: 4 | 5
): { sequence: string; invalidCells: string[]; hasOptionEOn4: boolean } {
  const indexedAnswers: Array<{ num: number; val: string }> = [];
  const invalidCells: string[] = [];
  let hasOptionEOn4 = false;
  const allowed = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const blankMarkers = new Set(['', '-', '*', '.', '_', 'BOS', 'BOŞ']);

  for (const [key, val] of rowEntries) {
    const norm = normalizeHeaderKey(key);
    const qMatch = norm.match(/^(?:s|soru|q)?\s*(\d{1,3})$/);
    if (!qMatch) continue;
    const qNum = parseInt(qMatch[1], 10);
    if (qNum < 1 || qNum > 200) continue;
    const rawStr = String(val ?? '').trim();
    const cell = rawStr.toUpperCase();
    if (allowed.includes(cell)) {
      indexedAnswers.push({ num: qNum, val: cell });
    } else if (blankMarkers.has(cell)) {
      indexedAnswers.push({ num: qNum, val: '-' });
    } else {
      if (cell === 'E' && optionCount === 4) {
        hasOptionEOn4 = true;
      }
      invalidCells.push(`S${qNum}:'${rawStr}'`);
      indexedAnswers.push({ num: qNum, val: '-' });
    }
  }
  if (indexedAnswers.length < 3) {
    return { sequence: '', invalidCells: [], hasOptionEOn4: false };
  }
  const maxQ = Math.max(...indexedAnswers.map((x) => x.num));
  const arr = Array<string>(maxQ).fill('-');
  for (const item of indexedAnswers) {
    arr[item.num - 1] = item.val;
  }
  return { sequence: arr.join(''), invalidCells, hasOptionEOn4 };
}

export function parseOmrExcelOrCsvBuffer(
  arrayBuffer: ArrayBuffer,
  options: ParseOmrSpreadsheetOptions
): ParsedOmrSpreadsheetResult {
  const {
    expectedCount,
    optionCount,
    activeBookletCode,
    fallbackGradeId,
    institution,
    existingStudents,
    baseQuestions,
    orderSeed = 0,
    autoDeriveMissingBooklets = true,
  } = options;

  const bytes = new Uint8Array(arrayBuffer);
  const isXlsxZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isXlsOle = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf;
  const workbook =
    isXlsxZip || isXlsOle
      ? XLSX.read(arrayBuffer, { type: 'array' })
      : XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string' });
  const explicitKeys: Partial<Record<BookletCode, string>> = {};
  const errors: OmrScanErrorItem[] = [];
  let totalRowsChecked = 0;
  const seenStudentNumbersInFile = new Map<string, number>();

  const rawStudents: Array<{
    fullName: string;
    studentNumberRaw: string;
    classroomRaw: string;
    gradeRaw: string;
    explicitBooklet: BookletCode | null;
    answersRaw: string;
  }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) continue;

    // 1. Check if this sheet is a question-by-question vertical answer key table:
    // Columns like: Soru | A | B | C | D  (or Soru | Cevap)
    const sampleHeaders = Object.keys(rows[0]).map((h) => ({ raw: h, norm: normalizeHeaderKey(h) }));
    const hasQuestionNumCol = sampleHeaders.some(
      (h) => h.norm === 'soru' || h.norm === 'soru no' || h.norm === 'no' || h.norm === 'question'
    );
    const hasBookletColsA = sampleHeaders.some(
      (h) => h.norm === 'a' || h.norm === 'a kitapcigi' || h.norm === 'kitapcik a'
    );
    const hasBookletColsB = sampleHeaders.some(
      (h) => h.norm === 'b' || h.norm === 'b kitapcigi' || h.norm === 'kitapcik b'
    );
    const hasStudentNameCol = sampleHeaders.some((h) =>
      ['adi soyadi', 'ad soyad', 'ogrenci adi', 'ogrenci', 'isim', 'ad'].some((k) =>
        h.norm.includes(k)
      )
    );

    if (hasQuestionNumCol && hasBookletColsA && hasBookletColsB && !hasStudentNameCol && rows.length >= 4) {
      const colLists: Record<BookletCode, string[]> = { A: [], B: [], C: [], D: [] };
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const rowNumber = rowIdx + 2;
        totalRowsChecked++;
        const entries = Object.entries(row);
        for (const code of BOOKLET_CODES) {
          const matched = entries.find(([k]) => {
            const nk = normalizeHeaderKey(k);
            return nk === code.toLowerCase() || nk === `${code.toLowerCase()} kitapcigi` || nk === `kitapcik ${code.toLowerCase()}`;
          });
          if (matched) {
            const rawCell = String(matched[1] ?? '').trim();
            if (rawCell && !['-', '*', '.', '_'].includes(rawCell)) {
              const cellIssue = inspectAnswerStringReadability(rawCell, optionCount);
              if (cellIssue) {
                errors.push({
                  id: `xls-vert-${sheetName}-${rowNumber}-${code}`,
                  rowNumber,
                  sheetName,
                  rawExcerpt: `${code}: ${rawCell}`,
                  category: cellIssue.category,
                  categoryLabel: OMR_ERROR_CATEGORY_LABELS[cellIssue.category],
                  reason: `${code} kitapçığı anahtar hücresinde hata: ${cellIssue.reason}`,
                });
              }
            }
            const ch = normalizeOmrOptionSequence(matched[1], 1, optionCount);
            colLists[code].push(ch ? ch[0] : '-');
          }
        }
      }
      for (const code of BOOKLET_CODES) {
        if (colLists[code].length >= 3) {
          explicitKeys[code] = colLists[code].join('');
        }
      }
      continue;
    }

    // 2. General row-by-row inspection across keys, students, and student answer columns
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rowNumber = rowIdx + 2;
      const entries = Object.entries(row);
      const findField = (candidates: string[]): string => {
        for (const cand of candidates) {
          const normCand = normalizeHeaderKey(cand);
          for (const [k, v] of entries) {
            const nk = normalizeHeaderKey(k);
            if (nk === normCand || nk.includes(normCand)) {
              const str = String(v ?? '').trim();
              if (str) return str;
            }
          }
        }
        return '';
      };

      // Check per-booklet key columns in this row
      for (const code of BOOKLET_CODES) {
        const keyColVal = findField([
          `${code.toLowerCase()} kitapcigi anahtari`,
          `${code.toLowerCase()} kitapcik anahtari`,
          `anahtar ${code.toLowerCase()}`,
          `cevap anahtari ${code.toLowerCase()}`,
          `${code.toLowerCase()} anahtari`,
          `${code.toLowerCase()} anahtar`,
        ]);
        if (keyColVal) {
          const keyIssue = inspectAnswerStringReadability(keyColVal, optionCount);
          if (keyIssue) {
            errors.push({
              id: `xls-bkey-${sheetName}-${rowNumber}-${code}`,
              rowNumber,
              sheetName,
              rawExcerpt: keyColVal.slice(0, 48),
              category: keyIssue.category,
              categoryLabel: OMR_ERROR_CATEGORY_LABELS[keyIssue.category],
              reason: `${code} kitapçığı cevap anahtarında hata: ${keyIssue.reason}`,
            });
          }
          const seq = normalizeOmrOptionSequence(keyColVal, expectedCount, optionCount);
          if (seq.length >= 3) {
            explicitKeys[code] = seq;
          }
        }
      }

      const nameVal = findField(['adi soyadi', 'ad soyad', 'ogrenci adi', 'ogrenci', 'isim']);
      const rawStuNoField = findField(['ogrenci no', 'numara', 'okul no']);
      const bookletVal = findField(['kitapcik', 'booklet', 'kitapcik turu']);
      const parsedBooklet = parseBookletCodeValue(bookletVal);
      const generalKeyVal = findField(['cevap anahtari', 'resmi anahtar', 'answer key', 'anahtar']);
      const stringStudentAnsVal = findField([
        'ogrenci cevaplari',
        'ogrenci optik',
        'optik cevaplar',
        'isaretler',
        'cevaplar',
        'ogrenci cevabi',
      ]);
      const indexedResult = stringStudentAnsVal
        ? { sequence: '', invalidCells: [], hasOptionEOn4: false }
        : extractIndexedQuestionSequence(entries, optionCount);
      const studentAnsVal = stringStudentAnsVal || indexedResult.sequence;

      if (generalKeyVal) {
        const keyIssue = inspectAnswerStringReadability(generalKeyVal, optionCount);
        if (keyIssue) {
          errors.push({
            id: `xls-gkey-${sheetName}-${rowNumber}`,
            rowNumber,
            sheetName,
            studentName: nameVal || undefined,
            studentNumberRaw: rawStuNoField || undefined,
            rawExcerpt: generalKeyVal.slice(0, 48),
            category: keyIssue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[keyIssue.category],
            reason: `Cevap anahtarı sütununda okunmayan değer: ${keyIssue.reason}`,
          });
        }
        const keySeq = normalizeOmrOptionSequence(generalKeyVal, expectedCount, optionCount);
        if (keySeq.length >= 3) {
          const targetCode = parsedBooklet ?? activeBookletCode;
          if (!explicitKeys[targetCode]) {
            explicitKeys[targetCode] = keySeq;
          }
        }
      }

      // If name column literally says "Cevap Anahtarı" (common Excel pattern)
      if (nameVal && isAnswerKeyMarkerText(nameVal)) {
        totalRowsChecked++;
        const rawKeyText = stringStudentAnsVal || generalKeyVal;
        if (rawKeyText && !generalKeyVal) {
          const keyIssue = inspectAnswerStringReadability(rawKeyText, optionCount);
          if (keyIssue) {
            errors.push({
              id: `xls-markerkey-${sheetName}-${rowNumber}`,
              rowNumber,
              sheetName,
              studentName: nameVal,
              rawExcerpt: rawKeyText.slice(0, 48),
              category: keyIssue.category,
              categoryLabel: OMR_ERROR_CATEGORY_LABELS[keyIssue.category],
              reason: `Cevap anahtarı satırında okunmayan karakter: ${keyIssue.reason}`,
            });
          }
        }
        const seq = normalizeOmrOptionSequence(
          studentAnsVal || generalKeyVal,
          expectedCount,
          optionCount
        );
        if (seq.length >= 3) {
          const targetCode = parsedBooklet ?? activeBookletCode;
          explicitKeys[targetCode] = seq;
        }
        continue;
      }

      // If this row is a booklet answer key row without a student name (e.g. Kitapçık=B, Cevap Anahtarı=...)
      if (!nameVal && !rawStuNoField && parsedBooklet && (generalKeyVal || studentAnsVal)) {
        totalRowsChecked++;
        const rawKeyText = generalKeyVal || stringStudentAnsVal;
        if (rawKeyText && !generalKeyVal) {
          const keyIssue = inspectAnswerStringReadability(rawKeyText, optionCount);
          if (keyIssue) {
            errors.push({
              id: `xls-bkeyrow-${sheetName}-${rowNumber}`,
              rowNumber,
              sheetName,
              rawExcerpt: rawKeyText.slice(0, 48),
              category: keyIssue.category,
              categoryLabel: OMR_ERROR_CATEGORY_LABELS[keyIssue.category],
              reason: `${parsedBooklet} kitapçığı anahtar satırı okunamadı: ${keyIssue.reason}`,
            });
          }
        }
        const seq = normalizeOmrOptionSequence(
          generalKeyVal || studentAnsVal,
          expectedCount,
          optionCount
        );
        if (seq.length >= 3) {
          explicitKeys[parsedBooklet] = seq;
        }
        continue;
      }

      // Student row
      if (nameVal || studentAnsVal || rawStuNoField || indexedResult.invalidCells.length > 0) {
        totalRowsChecked++;

        const stuNoCheck = validateStudentNumberField(rawStuNoField);
        if (!stuNoCheck.valid) {
          errors.push({
            id: `xls-stuno-${sheetName}-${rowNumber}`,
            rowNumber,
            sheetName,
            studentName: nameVal || undefined,
            studentNumberRaw: rawStuNoField,
            rawExcerpt: rawStuNoField,
            category: 'invalid-student-number',
            categoryLabel: OMR_ERROR_CATEGORY_LABELS['invalid-student-number'],
            reason: stuNoCheck.reason || 'Geçersiz öğrenci numarası.',
          });
        } else if (!stuNoCheck.isEmpty) {
          const prevRow = seenStudentNumbersInFile.get(stuNoCheck.cleanedDigits);
          if (prevRow !== undefined) {
            errors.push({
              id: `xls-dupno-${sheetName}-${rowNumber}`,
              rowNumber,
              sheetName,
              studentName: nameVal || undefined,
              studentNumberRaw: stuNoCheck.cleanedDigits,
              rawExcerpt: stuNoCheck.cleanedDigits,
              category: 'duplicate-student-number',
              categoryLabel: OMR_ERROR_CATEGORY_LABELS['duplicate-student-number'],
              reason: `Öğrenci numarası (${stuNoCheck.cleanedDigits}) aynı dosyada Satır #${prevRow} ile mükerrer kullanılmış.`,
            });
          } else {
            seenStudentNumbersInFile.set(stuNoCheck.cleanedDigits, rowNumber);
          }
        }

        if (stringStudentAnsVal) {
          const ansIssue = inspectAnswerStringReadability(stringStudentAnsVal, optionCount);
          if (ansIssue) {
            errors.push({
              id: `xls-ans-${sheetName}-${rowNumber}`,
              rowNumber,
              sheetName,
              studentName: nameVal || undefined,
              studentNumberRaw: rawStuNoField || undefined,
              rawExcerpt: stringStudentAnsVal.slice(0, 48),
              category: ansIssue.category,
              categoryLabel: OMR_ERROR_CATEGORY_LABELS[ansIssue.category],
              reason: ansIssue.reason,
            });
          }
        } else if (indexedResult.invalidCells.length > 0) {
          const cat = indexedResult.hasOptionEOn4 ? 'invalid-option' : 'unreadable-answers';
          errors.push({
            id: `xls-idxans-${sheetName}-${rowNumber}`,
            rowNumber,
            sheetName,
            studentName: nameVal || undefined,
            studentNumberRaw: rawStuNoField || undefined,
            rawExcerpt: indexedResult.invalidCells.slice(0, 6).join(', '),
            category: cat,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[cat],
            reason: indexedResult.hasOptionEOn4
              ? `4 şıklı sınavda soru sütunlarında geçersiz 'E' şıkkı veya okunmayan hücre var: ${indexedResult.invalidCells.slice(0, 5).join(', ')}.`
              : `Soru sütunlarında okunamayan veya geçersiz şık tespit edildi: ${indexedResult.invalidCells.slice(0, 5).join(', ')}.`,
          });
        }

        const cleanAnswers = normalizeOmrOptionSequence(studentAnsVal, expectedCount, optionCount);
        const stuNo = stuNoCheck.valid ? stuNoCheck.cleanedDigits : '';
        const classroomVal = findField(['sube', 'sinif sube', 'classroom']);
        const gradeVal = findField(['duzey', 'sinav', 'sinif', 'grade']);

        rawStudents.push({
          fullName: nameVal || `Öğrenci ${rawStudents.length + 1}`,
          studentNumberRaw: stuNo,
          classroomRaw: classroomVal,
          gradeRaw: gradeVal,
          explicitBooklet: parsedBooklet,
          answersRaw: cleanAnswers,
        });
      }
    }
  }

  const explicitCodes = BOOKLET_CODES.filter((c) => Boolean(explicitKeys[c]));
  const hasExplicitMultiBookletKeys = explicitCodes.length > 1;

  // Fill missing B/C/D booklet keys deterministically from base key when autoDeriveMissingBooklets is on
  const answerKeysByBooklet: Partial<Record<BookletCode, string>> = { ...explicitKeys };
  const baseKey = explicitKeys.A || (explicitCodes.length > 0 ? explicitKeys[explicitCodes[0]] : '');
  if (autoDeriveMissingBooklets && baseKey) {
    const derived = deriveBookletAnswerKeysFromBase(baseKey, optionCount, baseQuestions, orderSeed);
    for (const code of BOOKLET_CODES) {
      if (!answerKeysByBooklet[code]) {
        answerKeysByBooklet[code] = derived[code];
      }
    }
  }

  // Assign A-B-C-D booklets automatically for imported students that don't specify one
  const usedNumbers = new Set(existingStudents.map((s) => s.studentNumber8));
  const importedStudents: ImportedOmrStudentRow[] = rawStudents.map((row, idx) => {
    const existingMatch = existingStudents.find(
      (s) =>
        s.institutionId === institution.id &&
        ((row.studentNumberRaw.length === 8 && s.studentNumber8 === row.studentNumberRaw) ||
          s.fullName.trim().toLocaleLowerCase('tr-TR') ===
            row.fullName.trim().toLocaleLowerCase('tr-TR'))
    );
    const gradeId = existingMatch?.gradeId ?? normalizeImportedGradeId(row.gradeRaw, fallbackGradeId);
    const classroom =
      row.classroomRaw || existingMatch?.classroom || defaultClassroomForGrade(gradeId);
    const bookletCode: BookletCode =
      row.explicitBooklet ??
      existingMatch?.assignedBookletCode ??
      BOOKLET_CODES[idx % BOOKLET_CODES.length];
    const studentNumber8 =
      existingMatch?.studentNumber8 ??
      (row.studentNumberRaw.length === 8 && !usedNumbers.has(row.studentNumberRaw)
        ? row.studentNumberRaw
        : generate8DigitStudentNumber(row.fullName, institution.code8, usedNumbers));
    usedNumbers.add(studentNumber8);

    const bookletNumber =
      existingMatch?.assignedBookletNumber ??
      normalizeBookletNumber(
        undefined,
        defaultStartBookletNumberForGrade(gradeId) + idx
      );

    const matchedAnswerKey =
      answerKeysByBooklet[bookletCode] ||
      answerKeysByBooklet[activeBookletCode] ||
      baseKey ||
      '';

    return {
      fullName: existingMatch?.fullName ?? row.fullName,
      studentNumber8,
      classroom,
      gradeId,
      bookletCode,
      bookletNumber,
      studentAnswersRaw: row.answersRaw,
      matchedAnswerKey,
    };
  });

  const firstStudentWithAnswers =
    importedStudents.find((s) => s.studentAnswersRaw.length > 0) ?? importedStudents[0];

  const resolvedActiveKey =
    answerKeysByBooklet[firstStudentWithAnswers?.bookletCode ?? activeBookletCode] ||
    answerKeysByBooklet[activeBookletCode] ||
    baseKey ||
    '';

  const resolvedStudentAnswers = firstStudentWithAnswers?.studentAnswersRaw ?? '';

  const parts: string[] = [];
  const keyCount = Object.values(answerKeysByBooklet).filter(Boolean).length;
  if (keyCount > 0) {
    parts.push(`${keyCount} kitapçık cevap anahtarı (A-B-C-D)`);
  }
  if (importedStudents.length > 0) {
    parts.push(`${importedStudents.length} öğrenci otomatik A-B-C-D kitapçığıyla`);
  }
  if (resolvedStudentAnswers) {
    parts.push(`optik cevap dizisi (${resolvedStudentAnswers.length} soru)`);
  }

  const errorSuffix =
    errors.length > 0 ? ` · ${errors.length} satırda hata tespit edildi` : '';

  return {
    answerKeyRaw: resolvedActiveKey,
    studentAnswersRaw: resolvedStudentAnswers,
    answerKeysByBooklet,
    importedStudents,
    hasExplicitMultiBookletKeys,
    errors,
    totalRowsChecked,
    summaryMessage:
      parts.length > 0
        ? `Excel/CSV başarıyla işlendi: ${parts.join(', ')} aktarıldı${errorSuffix}.`
        : errors.length > 0
          ? `Dosyadaki ${errors.length} satırda geçersiz öğrenci numarası veya okunmayan cevap hatası tespit edildi.`
          : 'Dosyada geçerli cevap anahtarı veya öğrenci optik sütunu bulunamadı.',
  };
}

export function mergeImportedOmrStudents(
  existingStudents: StudentRecord[],
  importedRows: ImportedOmrStudentRow[],
  institution: Institution
): { nextStudents: StudentRecord[]; addedCount: number; updatedCount: number } {
  const today = new Date().toLocaleDateString('tr-TR');
  const next = [...existingStudents];
  let addedCount = 0;
  let updatedCount = 0;

  for (const row of importedRows) {
    const existingIdx = next.findIndex(
      (s) =>
        s.institutionId === institution.id &&
        (s.studentNumber8 === row.studentNumber8 ||
          s.fullName.trim().toLocaleLowerCase('tr-TR') ===
            row.fullName.trim().toLocaleLowerCase('tr-TR'))
    );

    if (existingIdx >= 0) {
      const prev = next[existingIdx];
      next[existingIdx] = {
        ...prev,
        classroom: row.classroom || prev.classroom,
        gradeId: row.gradeId || prev.gradeId,
        assignedBookletCode: row.bookletCode,
        assignedBookletNumber: row.bookletNumber,
        lastOmrAnswers: row.studentAnswersRaw || prev.lastOmrAnswers,
        lastAnswerKey: row.matchedAnswerKey || prev.lastAnswerKey,
        lastEvaluatedAt: row.studentAnswersRaw ? today : prev.lastEvaluatedAt,
      };
      updatedCount++;
    } else {
      next.unshift({
        id: `stu-omr-xls-${Date.now()}-${addedCount}-${row.studentNumber8}`,
        fullName: row.fullName,
        studentNumber8: row.studentNumber8,
        institutionId: institution.id,
        institutionCode8: institution.code8,
        institutionName: institution.name,
        classroom: row.classroom,
        gradeId: row.gradeId,
        createdAt: today,
        assignedBookletCode: row.bookletCode,
        assignedBookletNumber: row.bookletNumber,
        lastOmrAnswers: row.studentAnswersRaw || undefined,
        lastAnswerKey: row.matchedAnswerKey || undefined,
        lastEvaluatedAt: row.studentAnswersRaw ? today : undefined,
      });
      addedCount++;
    }
  }

  return { nextStudents: next, addedCount, updatedCount };
}

export function buildOmrExcelTemplateBlob(params: {
  bookletKeys: Partial<Record<BookletCode, string>>;
  gradeId: GradeLevelId;
  optionCount: 4 | 5;
  questionCount: number;
}): Blob {
  const wb = XLSX.utils.book_new();
  const sampleBase =
    params.bookletKeys.A ||
    Array.from({ length: Math.min(20, params.questionCount) }, (_, i) =>
      ['A', 'B', 'C', 'D', 'E'][i % params.optionCount]
    ).join('');
  const derived = deriveBookletAnswerKeysFromBase(sampleBase, params.optionCount);

  const keyRows = BOOKLET_CODES.map((code) => ({
    'Kitapçık': code,
    'Cevap Anahtarı': params.bookletKeys[code] || derived[code],
    'Not': code === 'A' ? 'Sadece A girilse bile B-C-D otomatik türetilebilir' : 'İsteğe bağlı özel yayın anahtarı',
  }));
  const wsKeys = XLSX.utils.json_to_sheet(keyRows);
  wsKeys['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsKeys, 'ABCD Cevap Anahtarlari');

  const cls = defaultClassroomForGrade(params.gradeId);
  const sampleStudentAns = sampleBase
    .split('')
    .map((ch, idx) => (idx % 5 === 4 ? '-' : ch))
    .join('');

  const studentRows = [
    {
      'Öğrenci No (8 Hane)': '',
      'Adı Soyadı': 'Alihan Sarı',
      'Şube': cls,
      'Kitapçık': '',
      'Öğrenci Cevapları': sampleStudentAns,
    },
    {
      'Öğrenci No (8 Hane)': '',
      'Adı Soyadı': 'Zeynep Karahan',
      'Şube': cls,
      'Kitapçık': 'B',
      'Öğrenci Cevapları': derived.B || sampleStudentAns,
    },
    {
      'Öğrenci No (8 Hane)': '',
      'Adı Soyadı': 'Talha Tekin',
      'Şube': cls,
      'Kitapçık': '',
      'Öğrenci Cevapları': '',
    },
  ];
  const wsStudents = XLSX.utils.json_to_sheet(studentRows);
  wsStudents['!cols'] = [
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 22 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Ogrenci Optik Listesi');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadOmrExcelTemplate(params: {
  bookletKeys: Partial<Record<BookletCode, string>>;
  gradeId: GradeLevelId;
  optionCount: 4 | 5;
  questionCount: number;
}): void {
  const blob = buildOmrExcelTemplateBlob(params);
  triggerDownload(blob, 'Dogruluk-Akademi-OMR-ABCD-Sablonu.xlsx');
}
