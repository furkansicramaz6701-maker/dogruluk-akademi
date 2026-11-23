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

  // 2. Check compact or whitespace-separated OMR sequence
  const compact = raw.replace(/[\s,;|\t]+/g, '');
  if (!compact) return null;

  const invalidChars: string[] = [];
  let readableCount = 0;
  let hasOptionEOn4 = false;

  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i].toUpperCase();
    if (allowedLetters.includes(ch)) {
      readableCount++;
    } else if (blankChars.has(ch)) {
      // Valid blank marker
    } else {
      if (ch === 'E' && optionCount === 4) {
        hasOptionEOn4 = true;
      }
      invalidChars.push(`${i + 1}.sıra:'${compact[i]}'`);
    }
  }

  if (invalidChars.length > 0) {
    return {
      category: hasOptionEOn4 && invalidChars.length === 1 ? 'invalid-option' : 'unreadable-answers',
      invalidTokens: invalidChars,
      readableCount,
      reason: hasOptionEOn4
        ? `4 şıklı sınavda geçersiz 'E' şıkkı veya okunmayan karakter tespit edildi (${invalidChars.slice(0, 5).join(', ')}).`
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

  // 2. Validate Student Answer Lines
  const trimmedAns = studentAnswersRaw.trim();
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
    const lines = studentAnswersRaw
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
    const trimmedKey = answerKeyRaw.trim();
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
      const keyLines = answerKeyRaw
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
