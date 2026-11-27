import { preprocessAnswerInputForSubject } from './examAnalysis';

export type OmrErrorCategory =
  | 'invalid-student-number'
  | 'unreadable-answers'
  | 'invalid-option'
  | 'duplicate-student-number'
  | 'missing-answer-key';

export interface OmrScanErrorItem {
  id: string;
  rowNumber: number;
  sheetName: string;
  studentName?: string;
  studentNumberRaw?: string;
  rawExcerpt: string;
  category: OmrErrorCategory;
  categoryLabel: string;
  reason: string;
}

export interface OmrScanErrorReport {
  sourceName: string;
  scannedAt: string;
  totalRowsChecked: number;
  validRowsCount: number;
  errors: OmrScanErrorItem[];
}

export const OMR_ERROR_CATEGORY_LABELS: Record<OmrErrorCategory, string> = {
  'invalid-student-number': 'Geçersiz Öğrenci No',
  'unreadable-answers': 'Okunmayan Cevap Satırı',
  'invalid-option': 'Geçersiz Şık',
  'duplicate-student-number': 'Mükerrer Öğrenci No',
  'missing-answer-key': 'Eksik Cevap Anahtarı',
};

export interface StudentNumberValidationResult {
  isEmpty: boolean;
  valid: boolean;
  cleanedDigits: string;
  reason?: string;
}

export function validateStudentNumberField(raw: unknown): StudentNumberValidationResult {
  const str = String(raw ?? '').trim();
  if (!str) {
    return { isEmpty: true, valid: true, cleanedDigits: '' };
  }
  const hasNonDigits = /[^\d\s-]/.test(str);
  const digitsOnly = str.replace(/\D/g, '');
  if (hasNonDigits) {
    return {
      isEmpty: false,
      valid: false,
      cleanedDigits: digitsOnly,
      reason: `Öğrenci numarası ("${str}") harf veya geçersiz karakter içeriyor; tam 8 rakam olmalıdır (örn. 20265018).`,
    };
  }
  if (digitsOnly.length !== 8) {
    return {
      isEmpty: false,
      valid: false,
      cleanedDigits: digitsOnly,
      reason: `Öğrenci numarası ("${str}") ${digitsOnly.length} haneli; tam 8 rakam olmalıdır (örn. 20265018).`,
    };
  }
  return {
    isEmpty: false,
    valid: true,
    cleanedDigits: digitsOnly,
  };
}

export interface AnswerReadabilityIssue {
  category: 'unreadable-answers' | 'invalid-option';
  reason: string;
  invalidTokens: string[];
  readableCount: number;
}

export function inspectAnswerStringReadability(
  rawInput: unknown,
  optionCount: 4 | 5
): AnswerReadabilityIssue | null {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return null;

  const allowedLetters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const blankChars = new Set(['-', '*', '.', '_']);

  // 1. Check numbered question format e.g. "1-A 2-B 3-X" or "1:A, 2:?"
  const numberedTokens = [
    ...raw.matchAll(/(?:^|[\s,;|\t])(\d{1,3})\s*[:.\-,;\t ]\s*([^\s,;|\t]+)(?=$|[\s,;|\t])/g),
  ];
  if (numberedTokens.length >= 2) {
    const invalidTokens: string[] = [];
    let readableCount = 0;
    for (const m of numberedTokens) {
      const qNo = m[1];
      const val = m[2].toUpperCase();
      if (allowedLetters.includes(val)) {
        readableCount++;
      } else if (blankChars.has(val) || /^BO[SŞ]$/.test(val)) {
        // Explicit blank is readable
      } else {
        invalidTokens.push(`${qNo}-${m[2]}`);
      }
    }
    if (invalidTokens.length > 0) {
      const hasEOnFour =
        optionCount === 4 && invalidTokens.some((t) => /-E$/i.test(t));
      return {
        category: hasEOnFour ? 'invalid-option' : 'unreadable-answers',
        invalidTokens,
        readableCount,
        reason: hasEOnFour
          ? `Bu sınav 4 şıklıdır (A-D), ancak numaralı cevaplarda 'E' şıkkı/okunmayan değer tespit edildi: ${invalidTokens.slice(0, 6).join(', ')}.`
          : `Numaralı cevap satırında okunamayan veya geçersiz işaretler var: ${invalidTokens.slice(0, 6).join(', ')}.`,
      };
    }
    if (readableCount === 0) {
      return {
        category: 'unreadable-answers',
        invalidTokens: [raw.slice(0, 24)],
        readableCount: 0,
        reason: 'Cevap satırında hiçbir geçerli şık işareti (A-D/E) okunamadı.',
      };
    }
    return null;
  }

  // 2. Check compact (including bracketed multi-mark tokens like AB[CD]E) or whitespace-separated OMR sequence
  const compact = raw.replace(/[\s,;|\t]+/g, '');
  if (!compact) return null;

  const compactUnits =
    compact.match(/\[[^\]]+\]|\([^)]+\)|./g) ?? [];
  const invalidChars: string[] = [];
  let readableCount = 0;
  let hasOptionEOn4 = false;
  let hasMultiMark = false;

  for (let i = 0; i < compactUnits.length; i++) {
    const unit = compactUnits[i];
    const upperUnit = unit.toUpperCase();
    if (upperUnit.length === 1 && allowedLetters.includes(upperUnit)) {
      readableCount++;
    } else if (upperUnit.length === 1 && blankChars.has(upperUnit)) {
      // Valid blank marker
    } else if (/^[\[(]([A-E/+]+)[\])]$/.test(upperUnit)) {
      hasMultiMark = true;
      invalidChars.push(`${i + 1}.sıra:'${unit}'`);
    } else {
      if (upperUnit === 'E' && optionCount === 4) {
        hasOptionEOn4 = true;
      }
      invalidChars.push(`${i + 1}.sıra:'${unit}'`);
    }
  }

  if (invalidChars.length > 0) {
    return {
      category: hasOptionEOn4 && invalidChars.length === 1 ? 'invalid-option' : 'unreadable-answers',
      invalidTokens: invalidChars,
      readableCount,
      reason: hasOptionEOn4
        ? `4 şıklı sınavda geçersiz 'E' şıkkı veya okunmayan karakter tespit edildi (${invalidChars.slice(0, 5).join(', ')}).`
        : hasMultiMark
          ? `Çoklu / çift şık işaretlemesi tespit edildi (${invalidChars.slice(0, 5).join(', ')}). Her soru için yalnızca tek bir şık (${allowedLetters.join('-')}) veya boş ('-') bulunmalıdır.`
          : `Cevap satırında okunamayan veya şık dışı karakterler var (${invalidChars.slice(0, 5).join(', ')}). Yalnızca ${allowedLetters.join('-')} ve boş için '-' kullanılmalıdır.`,
    };
  }

  if (readableCount === 0) {
    return {
      category: 'unreadable-answers',
      invalidTokens: [raw.slice(0, 24)],
      readableCount: 0,
      reason: 'Cevap satırındaki tüm karakterler boş veya okunamıyor (0 geçerli işaret).',
    };
  }

  return null;
}

export function validateManualOmrInputs(params: {
  sourceName: string;
  studentName?: string;
  studentNumber?: string;
  studentAnswersRaw: string;
  answerKeyRaw?: string;
  optionCount: 4 | 5;
  requireStudentAnswers?: boolean;
  validateAnswerKey?: boolean;
  subjectName?: string;
}): OmrScanErrorReport {
  const {
    sourceName,
    studentName = '',
    studentNumber = '',
    studentAnswersRaw,
    answerKeyRaw = '',
    optionCount,
    requireStudentAnswers = true,
    validateAnswerKey = false,
    subjectName,
  } = params;

  const errors: OmrScanErrorItem[] = [];
  let totalRowsChecked = 0;
  let validRowsCount = 0;

  // 1. Validate Student Number if entered
  const trimmedStuNo = studentNumber.trim();
  if (trimmedStuNo) {
    totalRowsChecked++;
    const noCheck = validateStudentNumberField(trimmedStuNo);
    if (!noCheck.valid) {
      errors.push({
        id: `manual-stuno-1`,
        rowNumber: 1,
        sheetName: 'Öğrenci Bilgisi',
        studentName: studentName.trim() || undefined,
        studentNumberRaw: trimmedStuNo,
        rawExcerpt: trimmedStuNo,
        category: 'invalid-student-number',
        categoryLabel: OMR_ERROR_CATEGORY_LABELS['invalid-student-number'],
        reason: noCheck.reason || 'Öğrenci numarası 8 rakam olmalıdır.',
      });
    } else {
      validRowsCount++;
    }
  }

  // 2. Validate Student Answer Lines (strip QR tags and isolate selected subject if present)
  const preprocessedAnswers = preprocessAnswerInputForSubject(studentAnswersRaw, subjectName);
  const trimmedAns = preprocessedAnswers.trim();
  if (!trimmedAns && requireStudentAnswers) {
    totalRowsChecked++;
    errors.push({
      id: 'manual-ans-empty',
      rowNumber: 1,
      sheetName: 'Öğrenci Optik Cevapları',
      studentName: studentName.trim() || undefined,
      studentNumberRaw: trimmedStuNo || undefined,
      rawExcerpt: '(Boş satır)',
      category: 'unreadable-answers',
      categoryLabel: OMR_ERROR_CATEGORY_LABELS['unreadable-answers'],
      reason: 'Öğrenci optik cevap alanı boş; okunacak cevap satırı bulunamadı.',
    });
  } else if (trimmedAns) {
    const lines = preprocessedAnswers
      .split(/\r?\n/)
      .map((line, idx) => ({ line: line.trim(), lineNo: idx + 1 }))
      .filter((x) => x.line.length > 0);

    // Check if multi-line represents numbered answers ("1-A\n2-B") vs batch rows ("20265018;ABCD..." or "ABCD...")
    const isNumberedMultiline =
      lines.length > 1 && lines.every((l) => /^\d{1,3}\s*[:.\-,;\t ]/.test(l.line));

    if (isNumberedMultiline) {
      lines.forEach(({ line, lineNo }) => {
        totalRowsChecked++;
        const issue = inspectAnswerStringReadability(line, optionCount);
        if (issue) {
          errors.push({
            id: `line-num-${lineNo}`,
            rowNumber: lineNo,
            sheetName: 'Öğrenci Optik Satırları',
            studentName: studentName.trim() || undefined,
            studentNumberRaw: trimmedStuNo || undefined,
            rawExcerpt: line.slice(0, 48),
            category: issue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[issue.category],
            reason: issue.reason,
          });
        } else {
          validRowsCount++;
        }
      });
    } else {
      lines.forEach(({ line, lineNo }) => {
        totalRowsChecked++;
        // Check if delimited row like "12345;ABCD..." or "99;AB?X" or "Ali Yılmaz | 123 | ???"
        const delimitedMatch = line.match(/^([^;|]+)[;|](.+)$/);
        const isSingleQuestionPair =
          Boolean(delimitedMatch) &&
          /^\d{1,3}$/.test(delimitedMatch![1].trim()) &&
          delimitedMatch![2].trim().length <= 1;
        if (delimitedMatch && !isSingleQuestionPair) {
          const leftPart = delimitedMatch[1].trim();
          const rightParts = delimitedMatch[2].split(/[;|]/).map((p) => p.trim());
          let rowStuNo = '';
          let rowName = studentName.trim() || undefined;
          let rowAns = rightParts[rightParts.length - 1] ?? '';

          if (/^\d|[a-zA-Z]/.test(leftPart) && !/^[A-Ea-e\-*._?]{4,}$/.test(leftPart)) {
            if (rightParts.length >= 2) {
              rowName = leftPart;
              rowStuNo = rightParts[0];
              rowAns = rightParts.slice(1).join(' ');
            } else {
              rowStuNo = leftPart;
            }
          }

          let lineHasError = false;
          if (rowStuNo) {
            const noRes = validateStudentNumberField(rowStuNo);
            if (!noRes.valid) {
              lineHasError = true;
              errors.push({
                id: `line-stuno-${lineNo}`,
                rowNumber: lineNo,
                sheetName: 'Optik Cevap Satırları',
                studentName: rowName,
                studentNumberRaw: rowStuNo,
                rawExcerpt: line.slice(0, 56),
                category: 'invalid-student-number',
                categoryLabel: OMR_ERROR_CATEGORY_LABELS['invalid-student-number'],
                reason: noRes.reason || 'Geçersiz öğrenci numarası.',
              });
            }
          }

          const ansRes = inspectAnswerStringReadability(rowAns, optionCount);
          if (ansRes) {
            lineHasError = true;
            errors.push({
              id: `line-ans-${lineNo}`,
              rowNumber: lineNo,
              sheetName: 'Optik Cevap Satırları',
              studentName: rowName,
              studentNumberRaw: rowStuNo || undefined,
              rawExcerpt: rowAns.slice(0, 48),
              category: ansRes.category,
              categoryLabel: OMR_ERROR_CATEGORY_LABELS[ansRes.category],
              reason: ansRes.reason,
            });
          }

          if (!lineHasError) validRowsCount++;
          return;
        }

        const issue = inspectAnswerStringReadability(line, optionCount);
        if (issue) {
          errors.push({
            id: `line-raw-${lineNo}`,
            rowNumber: lineNo,
            sheetName: 'Öğrenci Optik Cevapları',
            studentName: studentName.trim() || undefined,
            studentNumberRaw: trimmedStuNo || undefined,
            rawExcerpt: line.slice(0, 48),
            category: issue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[issue.category],
            reason: issue.reason,
          });
        } else {
          validRowsCount++;
        }
      });
    }
  }

  // 3. Validate Answer Key if requested
  if (validateAnswerKey) {
    const preprocessedKey = preprocessAnswerInputForSubject(answerKeyRaw, subjectName);
    const trimmedKey = preprocessedKey.trim();
    if (!trimmedKey) {
      totalRowsChecked++;
      errors.push({
        id: 'manual-key-empty',
        rowNumber: 1,
        sheetName: 'Cevap Anahtarı',
        rawExcerpt: '(Boş anahtar)',
        category: 'missing-answer-key',
        categoryLabel: OMR_ERROR_CATEGORY_LABELS['missing-answer-key'],
        reason: 'Değerlendirme yapılabilmesi için cevap anahtarı girilmelidir.',
      });
    } else {
      const keyLines = preprocessedKey
        .split(/\r?\n/)
        .map((l, idx) => ({ line: l.trim(), lineNo: idx + 1 }))
        .filter((x) => x.line.length > 0);
      keyLines.forEach(({ line, lineNo }) => {
        totalRowsChecked++;
        const issue = inspectAnswerStringReadability(line, optionCount);
        if (issue) {
          errors.push({
            id: `manual-key-${lineNo}`,
            rowNumber: lineNo,
            sheetName: 'Cevap Anahtarı',
            rawExcerpt: line.slice(0, 48),
            category: issue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[issue.category],
            reason: `Cevap anahtarı satırı okunamadı: ${issue.reason}`,
          });
        } else {
          validRowsCount++;
        }
      });
    }
  }

  return {
    sourceName,
    scannedAt: new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    totalRowsChecked,
    validRowsCount,
    errors,
  };
}

export function buildErrorReportCsvContent(report: OmrScanErrorReport): string {
  const esc = (val: string | number | undefined) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = ['Satır', 'Kaynak / Sayfa', 'Hata Türü', 'Öğrenci Adı', 'Öğrenci No', 'Hatalı Veri', 'Açıklama']
    .map(esc)
    .join(',');
  const rows = report.errors.map((err) =>
    [
      err.rowNumber,
      err.sheetName,
      err.categoryLabel,
      err.studentName || '-',
      err.studentNumberRaw || '-',
      err.rawExcerpt,
      err.reason,
    ]
      .map(esc)
      .join(',')
  );
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function formatErrorReportClipboardText(report: OmrScanErrorReport): string {
  const lines = [
    `OMR Hata Raporu — ${report.sourceName} (${report.scannedAt})`,
    `Kontrol Edilen: ${report.totalRowsChecked} satır | Geçerli: ${report.validRowsCount} | Hatalı: ${report.errors.length}`,
    '------------------------------------------------------------',
    ...report.errors.map(
      (e) =>
        `Satır #${e.rowNumber} [${e.sheetName}] · ${e.categoryLabel}${
          e.studentName ? ` · ${e.studentName}` : ''
        }${e.studentNumberRaw ? ` (${e.studentNumberRaw})` : ''}: ${e.reason} [Veri: ${e.rawExcerpt}]`
    ),
  ];
  return lines.join('\n');
}

export function countDistinctErrorRows(errors: OmrScanErrorItem[]): number {
  return new Set(errors.map((e) => `${e.sheetName}::${e.rowNumber}`)).size;
}

export interface OmrValidationTokenIssue {
  questionNumber: number;
  rawToken: string;
}

export interface OmrValidationWarning {
  id: string;
  type:
    | 'empty-bubbles'
    | 'multiple-marks'
    | 'invalid-option'
    | 'short-scan'
    | 'student-number'
    | 'answer-key';
  label: string;
  detail: string;
  severity: 'warning' | 'error';
}

export interface OmrValidationSummary {
  hasStudentInput: boolean;
  expectedCount: number;
  scannedCount: number;
  validCount: number;
  explicitEmptyCount: number;
  unmarkedTrailingCount: number;
  emptyBubbleCount: number;
  emptyQuestionNumbers: number[];
  multipleMarkCount: number;
  multipleMarkItems: OmrValidationTokenIssue[];
  invalidOptionCount: number;
  invalidOptionItems: OmrValidationTokenIssue[];
  studentNumberValid: boolean;
  studentNumberIssue?: string;
  answerKeyReady: boolean;
  answerKeyMarkedCount: number;
  severity: 'idle' | 'ok' | 'warning' | 'error';
  headline: string;
  warnings: OmrValidationWarning[];
}

function classifySingleOrMultiToken(
  rawToken: string,
  allowedLetters: string[],
  blankChars: Set<string>
): 'valid' | 'empty' | 'multiple' | 'invalid' {
  const cleaned = rawToken.trim().replace(/,+$/, '');
  if (!cleaned) return 'empty';
  const upper = cleaned.toUpperCase();

  if (blankChars.has(upper) || /^[\-*. _]+$/.test(upper) || /^BO[SŞ]$/.test(upper)) {
    return 'empty';
  }
  if (upper.length === 1 && allowedLetters.includes(upper)) {
    return 'valid';
  }

  // Strip bracket/parenthesis & separators to check for multiple-bubble marks (e.g. AB, A/B, [CD], A+B)
  const unwrapped = upper.replace(/^[\[(]|[\])]$/g, '');
  const parts = unwrapped
    .split(/[/,+&\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2 && parts.every((p) => p.length === 1 && allowedLetters.includes(p))) {
    return 'multiple';
  }
  const lettersOnly = unwrapped.replace(/[/,+&\s]/g, '');
  if (
    lettersOnly.length >= 2 &&
    /^[A-E]+$/.test(lettersOnly) &&
    [...lettersOnly].every((ch) => allowedLetters.includes(ch))
  ) {
    return 'multiple';
  }

  return 'invalid';
}

export function analyzeOmrResponseValidation(params: {
  studentNumber?: string;
  studentAnswersRaw: string;
  answerKeyRaw?: string;
  expectedCount: number;
  optionCount: 4 | 5;
  subjectName?: string;
}): OmrValidationSummary {
  const {
    studentNumber = '',
    studentAnswersRaw,
    answerKeyRaw = '',
    expectedCount,
    optionCount,
    subjectName,
  } = params;

  const safeExpected = Math.max(1, expectedCount || 20);
  const allowedLetters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const blankChars = new Set(['-', '*', '.', '_']);

  const stuNoCheck = validateStudentNumberField(studentNumber);
  const keyTrimmed = preprocessAnswerInputForSubject(answerKeyRaw, subjectName).trim();
  const keyUnits = keyTrimmed
    ? keyTrimmed.replace(/[\s,;|\t\n]+/g, '').match(/\[[^\]]+\]|\([^)]+\)|./g) ?? []
    : [];
  const answerKeyMarkedCount = keyUnits.filter((u) =>
    allowedLetters.includes(u.toUpperCase())
  ).length;
  const answerKeyReady = Boolean(keyTrimmed) && answerKeyMarkedCount > 0;

  const raw = preprocessAnswerInputForSubject(studentAnswersRaw, subjectName).trim();
  if (!raw) {
    const warnings: OmrValidationWarning[] = [];
    if (!stuNoCheck.valid && stuNoCheck.reason) {
      warnings.push({
        id: 'student-number',
        type: 'student-number',
        label: 'Öğrenci No Hatası',
        detail: stuNoCheck.reason,
        severity: 'error',
      });
    }
    if (!answerKeyReady) {
      warnings.push({
        id: 'answer-key',
        type: 'answer-key',
        label: 'Eksik Cevap Anahtarı',
        detail: 'Kaydetmeden önce geçerli bir cevap anahtarı yükleyin veya yazın.',
        severity: 'warning',
      });
    }
    return {
      hasStudentInput: false,
      expectedCount: safeExpected,
      scannedCount: 0,
      validCount: 0,
      explicitEmptyCount: 0,
      unmarkedTrailingCount: 0,
      emptyBubbleCount: 0,
      emptyQuestionNumbers: [],
      multipleMarkCount: 0,
      multipleMarkItems: [],
      invalidOptionCount: 0,
      invalidOptionItems: [],
      studentNumberValid: stuNoCheck.valid,
      studentNumberIssue: stuNoCheck.reason,
      answerKeyReady,
      answerKeyMarkedCount,
      severity: !stuNoCheck.valid ? 'error' : 'idle',
      headline: !stuNoCheck.valid
        ? 'Öğrenci numarası doğrulanamadı; kaydetmeden önce düzeltin.'
        : 'Öğrenci optik cevapları girildiğinde boş ve çoklu işaretleme kontrolü otomatik çalışır.',
      warnings,
    };
  }

  let validCount = 0;
  const explicitEmptyQuestions: number[] = [];
  const multipleMarkItems: OmrValidationTokenIssue[] = [];
  const invalidOptionItems: OmrValidationTokenIssue[] = [];
  let scannedCount = 0;

  const numberedMatches = [
    ...raw.matchAll(
      /(?:^|[\s,;|\n\t])(\d{1,3})\s*[:.\-,;\t ]\s*(\[[A-Za-z0-9/+,\s]+\]|\([A-Za-z0-9/+,\s]+\)|[^\s;|\n\t]+)/g
    ),
  ];

  if (numberedMatches.length >= 2 || (numberedMatches.length === 1 && /^\d{1,3}\s*[:.\-]/.test(raw))) {
    const tokenByQuestion = new Map<number, string>();
    for (const match of numberedMatches) {
      const qNo = parseInt(match[1], 10);
      const token = match[2].replace(/,+$/, '');
      if (qNo < 1 || qNo > safeExpected) continue;
      tokenByQuestion.set(qNo, token);
    }
    for (const [qNo, token] of tokenByQuestion.entries()) {
      const kind = classifySingleOrMultiToken(token, allowedLetters, blankChars);
      if (kind === 'valid') validCount++;
      else if (kind === 'empty') explicitEmptyQuestions.push(qNo);
      else if (kind === 'multiple') multipleMarkItems.push({ questionNumber: qNo, rawToken: token });
      else invalidOptionItems.push({ questionNumber: qNo, rawToken: token });
    }
    scannedCount = tokenByQuestion.size;
  } else {
    const splitTokens = raw
      .split(/[\s,;|\n\t]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const hasMultiCharSeparatedTokens =
      splitTokens.length >= 2 &&
      splitTokens.some((t) => t.length >= 2);

    if (hasMultiCharSeparatedTokens) {
      scannedCount = splitTokens.length;
      splitTokens.forEach((tok, idx) => {
        const qNo = idx + 1;
        const kind = classifySingleOrMultiToken(tok, allowedLetters, blankChars);
        if (kind === 'valid') validCount++;
        else if (kind === 'empty') explicitEmptyQuestions.push(qNo);
        else if (kind === 'multiple') multipleMarkItems.push({ questionNumber: qNo, rawToken: tok });
        else invalidOptionItems.push({ questionNumber: qNo, rawToken: tok });
      });
    } else {
      const compact = raw.replace(/[\s,;|\n\t]+/g, '');
      const units = compact.match(/\[[^\]]+\]|\([^)]+\)|./g) ?? [];
      scannedCount = units.length;
      units.forEach((unit, idx) => {
        const qNo = idx + 1;
        const kind = classifySingleOrMultiToken(unit, allowedLetters, blankChars);
        if (kind === 'valid') validCount++;
        else if (kind === 'empty') explicitEmptyQuestions.push(qNo);
        else if (kind === 'multiple') multipleMarkItems.push({ questionNumber: qNo, rawToken: unit });
        else invalidOptionItems.push({ questionNumber: qNo, rawToken: unit });
      });
    }
  }

  const unmarkedTrailingCount = Math.max(0, safeExpected - scannedCount);
  const trailingQuestionNumbers: number[] = [];
  for (let q = scannedCount + 1; q <= safeExpected && trailingQuestionNumbers.length < 15; q++) {
    trailingQuestionNumbers.push(q);
  }
  const emptyQuestionNumbers = Array.from(
    new Set([...explicitEmptyQuestions, ...trailingQuestionNumbers])
  ).sort((a, b) => a - b);
  const explicitEmptyCount = explicitEmptyQuestions.length;
  const emptyBubbleCount = explicitEmptyCount + unmarkedTrailingCount;
  const multipleMarkCount = multipleMarkItems.length;
  const invalidOptionCount = invalidOptionItems.length;

  const warnings: OmrValidationWarning[] = [];

  if (!stuNoCheck.valid && stuNoCheck.reason) {
    warnings.push({
      id: 'student-number',
      type: 'student-number',
      label: 'Geçersiz Öğrenci Numarası',
      detail: stuNoCheck.reason,
      severity: 'error',
    });
  }

  if (multipleMarkCount > 0) {
    const sample = multipleMarkItems
      .slice(0, 5)
      .map((item) => `S${item.questionNumber}:${item.rawToken}`)
      .join(', ');
    warnings.push({
      id: 'multiple-marks',
      type: 'multiple-marks',
      label: `Çoklu İşaretleme (Multiple Marks · ${multipleMarkCount})`,
      detail: `${multipleMarkCount} soruda birden fazla şık işaretlenmiş görünüyor (${sample}${multipleMarkCount > 5 ? '…' : ''}). Kaydetmeden önce tek şıkka indirin veya '-' yapın.`,
      severity: 'error',
    });
  }

  if (invalidOptionCount > 0) {
    const sample = invalidOptionItems
      .slice(0, 5)
      .map((item) => `S${item.questionNumber}:'${item.rawToken}'`)
      .join(', ');
    warnings.push({
      id: 'invalid-option',
      type: 'invalid-option',
      label: `Okunmayan / Geçersiz Şık (${invalidOptionCount})`,
      detail: `${invalidOptionCount} konumda ${allowedLetters.join('-')} dışında karakter bulundu (${sample}${invalidOptionCount > 5 ? '…' : ''}).`,
      severity: 'error',
    });
  }

  if (emptyBubbleCount > 0) {
    const sampleQ = emptyQuestionNumbers
      .slice(0, 8)
      .map((n) => `S${n}`)
      .join(', ');
    const parts: string[] = [];
    if (explicitEmptyCount > 0) parts.push(`${explicitEmptyCount} açık boş ('-')`);
    if (unmarkedTrailingCount > 0) parts.push(`${unmarkedTrailingCount} eksik/taranmayan son soru`);
    warnings.push({
      id: 'empty-bubbles',
      type: 'empty-bubbles',
      label: `Boş İşaretleme (Empty Bubbles · ${emptyBubbleCount})`,
      detail: `${parts.join(' + ')} tespit edildi${sampleQ ? ` (${sampleQ}${emptyQuestionNumbers.length > 8 ? '…' : ''})` : ''}. Öğrenci gerçekten boş bıraktıysa kaydetmeye devam edebilirsiniz.`,
      severity: 'warning',
    });
  }

  if (!answerKeyReady) {
    warnings.push({
      id: 'answer-key',
      type: 'answer-key',
      label: 'Cevap Anahtarı Eksik',
      detail: 'Analiz ve kayıt öncesinde geçerli cevap anahtarı eklenmelidir.',
      severity: 'error',
    });
  }

  const hasBlockingError =
    !stuNoCheck.valid ||
    multipleMarkCount > 0 ||
    invalidOptionCount > 0 ||
    !answerKeyReady;

  const severity: OmrValidationSummary['severity'] = hasBlockingError
    ? 'error'
    : emptyBubbleCount > 0
      ? 'warning'
      : 'ok';

  let headline = 'Tüm satırlar temiz: boş veya çoklu işaretleme hatası yok, kaydetmeye hazır.';
  if (hasBlockingError) {
    const errorCount = warnings.filter((w) => w.severity === 'error').length;
    headline = `Kaydetmeden önce düzeltilmesi gereken ${errorCount} kritik doğrulama bulgusu var.`;
  } else if (emptyBubbleCount > 0) {
    headline = `${emptyBubbleCount} boş işaretleme (Empty Bubbles) tespit edildi — optik kağıtla teyit edip kaydedebilirsiniz.`;
  }

  return {
    hasStudentInput: true,
    expectedCount: safeExpected,
    scannedCount,
    validCount,
    explicitEmptyCount,
    unmarkedTrailingCount,
    emptyBubbleCount,
    emptyQuestionNumbers,
    multipleMarkCount,
    multipleMarkItems,
    invalidOptionCount,
    invalidOptionItems,
    studentNumberValid: stuNoCheck.valid,
    studentNumberIssue: stuNoCheck.reason,
    answerKeyReady,
    answerKeyMarkedCount,
    severity,
    headline,
    warnings,
  };
}

