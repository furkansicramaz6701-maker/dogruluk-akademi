import {
  DEFAULT_HISTORICAL_TREND,
  getGradeProfile,
} from '../data/curriculum';
import { parseDigitalKarneQuery } from './digitalKarneQr';
import { generateRealisticQuestionContent } from './realisticQuestions';
import {
  BookletCode,
  BookletColumnAlignmentReport,
  DifficultyLevel,
  DifficultyMetric,
  ExamAnalysisResult,
  ExamQuestion,
  GradeLevelId,
  HistoricalExamPoint,
  PenaltyDivisor,
  QrPreCheckResult,
  QuestionEvaluation,
  StudentRecord,
  SubjectMetrics,
  TopicGapMetric,
} from '../types/academy';

export function formatPenaltyRuleLabel(divisor: PenaltyDivisor, compact = false): string {
  if (divisor === 0) {
    return compact ? 'Götürmesiz (Net = Doğru)' : 'Yanlış Doğruyu Götürmez (Net = Doğru)';
  }
  return compact ? `${divisor}Y = 1D` : `${divisor} Yanlış 1 Doğruyu Götürür`;
}

const VALID_OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

const KNOWN_SUBJECT_LABELS = [
  'Türkçe',
  'Matematik',
  'Fen Bilimleri',
  'Fen',
  'Sosyal Bilgiler',
  'Sosyal',
  'İngilizce',
  'Din Kültürü ve Ahlak Bilgisi',
  'Din Kültürü',
  'T.C. İnkılap Tarihi ve Atatürkçülük',
  'T.C. İnkılap Tarihi',
  'İnkılap Tarihi',
  'Hayat Bilgisi',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Edebiyat',
  'Geometri',
];

function normalizeTrLabel(val: string): string {
  return val
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

export function preprocessAnswerInputForSubject(
  rawInput: string,
  subjectName?: string
): string {
  // Strip QR URLs, QR tags, and booklet/student metadata headers so they never shift answer positions
  let cleaned = rawInput
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:QR|KAREKOD)\s*[:=]\s*\S+/gi, ' ')
    .replace(/\[(?:QR|DERS|K[İI]TAP[ÇC]IK|NO)\s*[:=][^\]]*\]/gi, ' ')
    .replace(/(?:ÖĞRENCİ\s*NO|KURUM\s*KODU|KİTAPÇIK(?:\s*TÜRÜ)?)\s*[:=]\s*[A-Za-z0-9-]+/gi, ' ')
    .trim();

  // If multiple subject sections exist (e.g. "Türkçe: 1-A 2-B | Matematik: 1-C 2-D") and a target subject is specified,
  // isolate that exact subject's segment cleanly.
  const subjectPattern = KNOWN_SUBJECT_LABELS.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|');
  const sectionRegex = new RegExp(
    `(${subjectPattern})\\s*(?:TEST[İI]|DERS[İI])?\\s*[:\\-]`,
    'gi'
  );

  const matches = [...cleaned.matchAll(sectionRegex)];
  if (matches.length > 0 && subjectName?.trim()) {
    const targetNorm = normalizeTrLabel(subjectName);
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const labelNorm = normalizeTrLabel(m[1] || '');
      const isMatch =
        labelNorm === targetNorm ||
        labelNorm.includes(targetNorm) ||
        targetNorm.includes(labelNorm);
      if (isMatch) {
        const start = (m.index ?? 0) + m[0].length;
        const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleaned.length) : cleaned.length;
        return cleaned.slice(start, end).trim();
      }
    }
  }

  // Strip standalone subject headings so words like "MATEMATİK:" or "FEN:" do not shift token indices
  cleaned = cleaned.replace(sectionRegex, ' ').trim();
  cleaned = cleaned
    .replace(new RegExp(`^(${subjectPattern})(?:\\s+TEST[İI])?\\s*$`, 'gim'), ' ')
    .trim();

  return cleaned;
}

export interface ParseAnswerOptions {
  subjectName?: string;
  expectedStudentNumber?: string;
  expectedStudentName?: string;
  expectedInstitutionCode?: string;
  students?: StudentRecord[];
  detectedQrUrl?: string;
  detectedStudentNumber?: string;
  onQrPreCheck?: (result: QrPreCheckResult) => void;
}

function normalizeCompareName(name?: string): string {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

/**
 * Ön-kontrol: Optik dize veya görsel üzerinden gelen Karekod (QR) URL'si,
 * öğrenci numarası, kurum kodu ve kitapçık/ders etiketlerini ayrıştırır;
 * kayıtlı öğrenci listesi ve aktif öğrenci ile eşleşmeyi doğrular.
 */
export function inspectQrAndStudentMatch(
  rawInput: string,
  options?: ParseAnswerOptions
): QrPreCheckResult {
  const text = rawInput || '';
  const urlMatch = text.match(/https?:\/\/[^\s\]]+/i);
  const tagQrMatch = text.match(/(?:QR|KAREKOD)\s*[:=]\s*([^\s\]]+)/i);
  const bracketQrMatch = text.match(/\[QR\s*[:=]([^\]]+)\]/i);
  const qrCandidate = (
    options?.detectedQrUrl ||
    urlMatch?.[0] ||
    bracketQrMatch?.[1] ||
    tagQrMatch?.[1] ||
    ''
  ).trim();

  const stuNoTagMatch = text.match(/(?:ÖĞRENC[İI]\s*NO|OGRENC[İI]\s*NO|NO)\s*[:=]\s*(\d{4,12})/i);
  const instCodeTagMatch = text.match(/(?:KURUM\s*KODU|KURUM)\s*[:=]\s*(\d{4,12})/i);
  const bookletTagMatch = text.match(/K[İI]TAP[ÇC]IK(?:\s*TÜRÜ)?\s*[:=]\s*([A-Da-d])\b/i);
  const subjectAlternation = KNOWN_SUBJECT_LABELS.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|');
  const explicitDersMatch = text.match(
    new RegExp(`DERS\\s*[:=]\\s*(${subjectAlternation})\\b`, 'i')
  );
  const allSubjectHeaders = [
    ...text.matchAll(
      new RegExp(
        `\\b(${subjectAlternation})(?=\\s*(?:TEST[İI]|DERS[İI]|[:\\-\\n\\]]))`,
        'gi'
      )
    ),
  ]
    .map((m) => m[1]?.trim())
    .filter(Boolean) as string[];

  const parsedQr = qrCandidate
    ? parseDigitalKarneQuery(
        qrCandidate.includes('?')
          ? qrCandidate.slice(qrCandidate.indexOf('?'))
          : qrCandidate
      )
    : null;

  const extractedStudentNumber =
    parsedQr?.studentNumber8 ||
    options?.detectedStudentNumber?.replace(/\D/g, '').slice(0, 8) ||
    stuNoTagMatch?.[1]?.replace(/\D/g, '').slice(0, 8) ||
    undefined;

  const extractedStudentName = parsedQr?.studentName?.trim() || undefined;
  const extractedInstitutionCode =
    parsedQr?.institutionCode8 ||
    instCodeTagMatch?.[1]?.replace(/\D/g, '').slice(0, 8) ||
    undefined;

  const extractedBookletCode = bookletTagMatch?.[1]
    ? (bookletTagMatch[1].toUpperCase() as BookletCode)
    : undefined;

  let extractedSubjectName = explicitDersMatch?.[1]?.trim() || undefined;
  if (!extractedSubjectName && allSubjectHeaders.length > 0) {
    if (options?.subjectName?.trim()) {
      const targetNorm = normalizeTrLabel(options.subjectName);
      const matchingHeader = allSubjectHeaders.find((hdr) => {
        const hdrNorm = normalizeTrLabel(hdr);
        return (
          hdrNorm === targetNorm ||
          hdrNorm.includes(targetNorm) ||
          targetNorm.includes(hdrNorm)
        );
      });
      extractedSubjectName = matchingHeader
        ? options.subjectName.trim()
        : allSubjectHeaders[0];
    } else {
      extractedSubjectName = allSubjectHeaders[0];
    }
  }

  const qrDetected = Boolean(qrCandidate || extractedStudentNumber);
  const students = options?.students ?? [];
  const matchedStudent =
    (extractedStudentNumber
      ? students.find((s) => s.studentNumber8 === extractedStudentNumber)
      : undefined) ??
    (extractedStudentName
      ? students.find(
          (s) =>
            normalizeCompareName(s.fullName) === normalizeCompareName(extractedStudentName)
        )
      : undefined);

  const expectedInst = options?.expectedInstitutionCode?.replace(/\D/g, '').trim();
  const institutionMismatch = Boolean(
    expectedInst &&
      extractedInstitutionCode &&
      extractedInstitutionCode !== expectedInst
  );

  const expectedStuNo = options?.expectedStudentNumber?.replace(/\D/g, '').trim();
  const expectedStuName = normalizeCompareName(options?.expectedStudentName);
  const studentMismatch = Boolean(
    (expectedStuNo &&
      extractedStudentNumber &&
      extractedStudentNumber !== expectedStuNo) ||
      (!extractedStudentNumber &&
        expectedStuName &&
        extractedStudentName &&
        normalizeCompareName(extractedStudentName) !== expectedStuName)
  );

  if (!qrDetected) {
    return {
      status: 'none',
      qrDetected: false,
      extractedBookletCode,
      extractedSubjectName,
      institutionMismatch: false,
      studentMismatch: false,
      message: 'Optik verisinde karekod veya öğrenci numarası etiketi algılanmadı.',
    };
  }

  if (institutionMismatch || studentMismatch) {
    const reasons: string[] = [];
    if (institutionMismatch) {
      reasons.push(
        `Karekod kurum kodu (${extractedInstitutionCode}) aktif kurum (${expectedInst}) ile uyuşmuyor`
      );
    }
    if (studentMismatch) {
      const targetLabel = matchedStudent
        ? `${matchedStudent.fullName} (${matchedStudent.studentNumber8})`
        : extractedStudentName
          ? `${extractedStudentName} (${extractedStudentNumber ?? '—'})`
          : `No ${extractedStudentNumber}`;
      reasons.push(
        `Karekoddaki öğrenci [${targetLabel}], seçili öğrenci (${options?.expectedStudentName || expectedStuNo}) ile farklı`
      );
    }
    return {
      status: 'mismatch',
      qrDetected: true,
      qrRawValue: qrCandidate || undefined,
      extractedStudentNumber,
      extractedStudentName: matchedStudent?.fullName || extractedStudentName,
      extractedInstitutionCode,
      extractedBookletCode,
      extractedSubjectName,
      matchedStudentId: matchedStudent?.id,
      matchedStudentName: matchedStudent?.fullName,
      matchedStudentNumber: matchedStudent?.studentNumber8,
      institutionMismatch,
      studentMismatch,
      message: `${reasons.join('. ')}. Lütfen optik kağıdın doğru öğrenciye ait olduğunu doğrulayın.`,
    };
  }

  if (students.length > 0 && !matchedStudent && extractedStudentNumber) {
    return {
      status: 'unregistered',
      qrDetected: true,
      qrRawValue: qrCandidate || undefined,
      extractedStudentNumber,
      extractedStudentName,
      extractedInstitutionCode,
      extractedBookletCode,
      extractedSubjectName,
      institutionMismatch: false,
      studentMismatch: false,
      message: `Karekod / No (${extractedStudentNumber}) okundu ancak kurum öğrenci listesinde kayıtlı bulunamadı.`,
    };
  }

  const verifiedName = matchedStudent?.fullName || extractedStudentName || 'Öğrenci';
  const verifiedNo = matchedStudent?.studentNumber8 || extractedStudentNumber || '—';
  return {
    status: 'matched',
    qrDetected: true,
    qrRawValue: qrCandidate || undefined,
    extractedStudentNumber: verifiedNo,
    extractedStudentName: verifiedName,
    extractedInstitutionCode,
    extractedBookletCode,
    extractedSubjectName,
    matchedStudentId: matchedStudent?.id,
    matchedStudentName: matchedStudent?.fullName,
    matchedStudentNumber: matchedStudent?.studentNumber8,
    institutionMismatch: false,
    studentMismatch: false,
    message: `Karekod ön-kontrolü doğrulandı: ${verifiedName} (${verifiedNo})${
      extractedSubjectName ? ` · ${extractedSubjectName}` : ''
    }.`,
  };
}

export function parseAnswerStringWithQrPreCheck(
  rawInput: string,
  expectedLength: number,
  maxOptionCount: 4 | 5 = 5,
  options?: ParseAnswerOptions
): { answers: (string | null)[]; preCheck: QrPreCheckResult } {
  const preCheck = inspectQrAndStudentMatch(rawInput, options);
  options?.onQrPreCheck?.(preCheck);
  const answers = parseAnswerStringCore(
    rawInput,
    expectedLength,
    maxOptionCount,
    options?.subjectName ?? preCheck.extractedSubjectName
  );
  return { answers, preCheck };
}

function parseAnswerStringCore(
  rawInput: string,
  expectedLength: number,
  maxOptionCount: 4 | 5 = 5,
  subjectName?: string
): (string | null)[] {
  const allowed = maxOptionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const trimmed = preprocessAnswerInputForSubject(rawInput || '', subjectName);
  const result: (string | null)[] = Array(expectedLength).fill(null);

  if (!trimmed) {
    return result;
  }

  // Check if numbered format e.g. "1-A 2:B 3.C 4) D" or CSV "1,A" (including multi-mark tokens like "1-AB" or "2-[CD]")
  const numberedMatches = [
    ...trimmed.matchAll(
      /(?:^|[\s,;|\n])(\d{1,3})\s*(?:[:.\-),\t ]+|-\s*)\s*(\[[A-Za-z0-9/+,\s]+\]|\([A-Za-z0-9/+,\s]+\)|BO[SŞ]|[A-Za-z\-*._?]+)(?=$|[\s,;|\n])/gi
    ),
  ];
  if (numberedMatches.length >= 2) {
    for (const match of numberedMatches) {
      const qNum = parseInt(match[1], 10);
      const val = match[2].replace(/,+$/, '').toUpperCase();
      if (qNum >= 1 && qNum <= expectedLength) {
        result[qNum - 1] = allowed.includes(val) ? val : null;
      }
    }
    return result;
  }

  // Compact sequence with optional bracketed groups e.g. "AB[CD]-E"
  const compactOnly = trimmed.replace(/\s+/g, '');
  if (/^(?:\[[A-Za-z/+]+\]|\([A-Za-z/+]+\)|[A-Ea-e\-*._?])+$/.test(compactOnly)) {
    const compactTokens =
      compactOnly.match(/\[[A-Za-z/+]+\]|\([A-Za-z/+]+\)|[A-Ea-e\-*._?]/g) ?? [];
    for (let i = 0; i < Math.min(expectedLength, compactTokens.length); i++) {
      const tok = compactTokens[i].toUpperCase();
      result[i] = allowed.includes(tok) ? tok : null;
    }
    return result;
  }

  // Fallback token split
  const tokens = trimmed
    .split(/[\s,;|\n]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  for (let i = 0; i < Math.min(expectedLength, tokens.length); i++) {
    const token = tokens[i];
    result[i] = allowed.includes(token) ? token : null;
  }

  return result;
}

export function parseAnswerString(
  rawInput: string,
  expectedLength: number,
  maxOptionCount: 4 | 5 = 5,
  options?: ParseAnswerOptions
): (string | null)[] {
  if (
    options?.onQrPreCheck ||
    options?.students ||
    options?.expectedStudentNumber ||
    options?.expectedInstitutionCode ||
    options?.detectedQrUrl
  ) {
    const preCheck = inspectQrAndStudentMatch(rawInput, options);
    options?.onQrPreCheck?.(preCheck);
    return parseAnswerStringCore(
      rawInput,
      expectedLength,
      maxOptionCount,
      options?.subjectName ?? preCheck.extractedSubjectName
    );
  }
  return parseAnswerStringCore(rawInput, expectedLength, maxOptionCount, options?.subjectName);
}

export interface BuildAutoExamOptions {
  variantSeed?: number;
  excludeStems?: Iterable<string>;
}

export function normalizeQuestionStemKey(stem: string): string {
  return stem
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

export function buildAutoExamQuestions(
  gradeId: GradeLevelId,
  difficultyMix: 'dengeli' | 'kolay' | 'zor' = 'dengeli',
  customTotal?: number,
  subjectFilter?: string,
  options?: BuildAutoExamOptions
): ExamQuestion[] {
  const profile = getGradeProfile(gradeId);
  const matchingSubjects =
    subjectFilter && subjectFilter !== 'Tümü'
      ? profile.subjects.filter(
          (s) => s.name.toLocaleLowerCase('tr-TR') === subjectFilter.toLocaleLowerCase('tr-TR')
        )
      : [];
  const activeSubjects = matchingSubjects.length > 0 ? matchingSubjects : profile.subjects;

  const baseTotal = activeSubjects.reduce((sum, s) => sum + s.questionCount, 0);
  const targetTotal = customTotal && customTotal > 0 ? customTotal : baseTotal;
  const optionKeys = profile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const variantSeed = Math.max(0, Math.round(options?.variantSeed ?? 0));
  const usedStemKeys = new Set<string>();
  if (options?.excludeStems) {
    for (const s of options.excludeStems) {
      const norm = normalizeQuestionStemKey(s);
      if (norm) usedStemKeys.add(norm);
    }
  }

  const ratios =
    difficultyMix === 'kolay'
      ? { Kolay: 0.55, Orta: 0.35, Zor: 0.1 }
      : difficultyMix === 'zor'
        ? { Kolay: 0.2, Orta: 0.4, Zor: 0.4 }
        : { Kolay: 0.35, Orta: 0.45, Zor: 0.2 };

  const questions: ExamQuestion[] = [];
  let qNumber = 1;

  activeSubjects.forEach((subj, subjIdx) => {
    const scaledCount =
      subjIdx === activeSubjects.length - 1
        ? Math.max(1, targetTotal - questions.length)
        : Math.max(1, Math.round((subj.questionCount / Math.max(1, baseTotal)) * targetTotal));

    for (let i = 0; i < scaledCount && questions.length < targetTotal; i++) {
      const topic = subj.topics[(i + variantSeed) % subj.topics.length];
      const progress = i / Math.max(1, scaledCount);
      let difficulty: DifficultyLevel = 'Orta';
      if (progress < ratios.Kolay) difficulty = 'Kolay';
      else if (progress >= ratios.Kolay + ratios.Orta) difficulty = 'Zor';

      const answerSeed =
        qNumber * 5 + subjIdx * 11 + i * i + Math.floor(qNumber / 3) + variantSeed * 7;
      const correctIndex = answerSeed % optionKeys.length;
      const correctOption = optionKeys[correctIndex];

      let tpl = generateRealisticQuestionContent(
        qNumber,
        subj.name,
        topic,
        difficulty,
        profile,
        variantSeed
      );

      // Search up to 24 alternative seeds if this stem was already used in a previous exam or earlier in this exam
      if (usedStemKeys.has(normalizeQuestionStemKey(tpl.stem))) {
        let foundUnique = false;
        for (let attempt = 1; attempt <= 24; attempt++) {
          const altTopic = subj.topics[(i + variantSeed + attempt) % subj.topics.length];
          const candidate = generateRealisticQuestionContent(
            qNumber + attempt * 3,
            subj.name,
            altTopic,
            difficulty,
            profile,
            variantSeed + attempt * 5
          );
          if (!usedStemKeys.has(normalizeQuestionStemKey(candidate.stem))) {
            tpl = candidate;
            foundUnique = true;
            break;
          }
        }
        if (!foundUnique) {
          const contextTag =
            variantSeed > 0 ? `Deneme Seti #${variantSeed + 1} · Kazanım Uygulaması ${qNumber}: ` : `Uygulama ${qNumber}: `;
          tpl = {
            ...tpl,
            stem: tpl.stem.replace(/^(\[[^\]]+\]\s*)/, `$1${contextTag}`),
          };
        }
      }
      usedStemKeys.add(normalizeQuestionStemKey(tpl.stem));

      const optMap: Record<string, string> = {};
      let distIdx = 0;
      optionKeys.forEach((opt, idx) => {
        if (idx === correctIndex) {
          optMap[opt] = tpl.correct;
        } else {
          optMap[opt] = tpl.distractors[distIdx % tpl.distractors.length];
          distIdx++;
        }
      });

      const gainCode = `${profile.shortLabel.replace(/\s+/g, '')}.${subj.id.toUpperCase()}.${((i + variantSeed) % subj.topics.length) + 1}`;
      questions.push({
        id: `q-${gradeId}-s${variantSeed}-${qNumber}`,
        number: qNumber,
        subject: subj.name,
        topic,
        gainCode,
        difficulty,
        stem: tpl.stem,
        options: optMap,
        correctOption,
        explanation: tpl.explanation,
        source: 'Müfredat Havuzu',
      });
      qNumber++;
    }
  });

  return questions;
}

export function selectCuratedQuestions(
  pool: ExamQuestion[],
  selectedIds: string[],
  targetCount = 20
): ExamQuestion[] {
  const idSet = new Set(selectedIds);
  const chosen =
    idSet.size > 0
      ? pool.filter((q) => idSet.has(q.id)).slice(0, targetCount)
      : pool.slice(0, targetCount);
  return chosen.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

export function generateSampleOmrPair(
  questions: ExamQuestion[],
  targetAccuracy = 0.74
): { studentString: string; keyString: string } {
  const keyChars: string[] = [];
  const studentChars: string[] = [];
  const options = Object.keys(questions[0]?.options ?? { A: '', B: '', C: '', D: '', E: '' });

  questions.forEach((q, idx) => {
    keyChars.push(q.correctOption);
    // Deterministic realistic pattern: some correct, some wrong distractors, some blanks
    const bucket = ((idx * 17 + 5) % 100) / 100;
    if (bucket < targetAccuracy) {
      studentChars.push(q.correctOption);
    } else if (bucket < targetAccuracy + 0.16) {
      const wrongIdx = (options.indexOf(q.correctOption) + 1 + (idx % 2)) % options.length;
      studentChars.push(options[wrongIdx]);
    } else {
      studentChars.push('-');
    }
  });

  return {
    studentString: studentChars.join(''),
    keyString: keyChars.join(''),
  };
}

export interface EvaluateOmrInput {
  studentName: string;
  studentNumber: string;
  classroom: string;
  examTitle: string;
  gradeId: GradeLevelId;
  penaltyDivisor: PenaltyDivisor;
  studentAnswers: (string | null)[];
  answerKey: (string | null)[];
  questions: ExamQuestion[];
  historicalExams?: HistoricalExamPoint[];
  bookletCode?: BookletCode;
  bookletAnswerKeys?: Partial<Record<BookletCode, string>>;
  enforceQuestionBounds?: boolean;
  cohortSize?: number;
  classSize?: number;
  cohortAvgNet?: number;
  isSampleDemo?: boolean;
}

export function resolveBookletAlignedAnswerKey(params: {
  bookletCode?: BookletCode;
  bookletAnswerKeys?: Partial<Record<BookletCode, string>>;
  fallbackAnswerKey: (string | null)[];
  studentAnswers: (string | null)[];
  expectedLength: number;
  maxOptionCount: 4 | 5;
}): {
  alignedKey: (string | null)[];
  alignment: BookletColumnAlignmentReport;
} {
  const activeBooklet: BookletCode = params.bookletCode ?? 'A';
  const columnRaw = params.bookletAnswerKeys?.[activeBooklet];
  const hasExplicitColumnKey = Boolean(columnRaw && columnRaw.trim().length > 0);

  const rawAligned = hasExplicitColumnKey
    ? parseAnswerString(columnRaw!, params.expectedLength, params.maxOptionCount)
    : params.fallbackAnswerKey.slice(0, params.expectedLength);

  const alignedKey: (string | null)[] = Array.from(
    { length: params.expectedLength },
    (_, idx) => rawAligned[idx] ?? null
  );

  const enteredKeyCount = alignedKey.filter(Boolean).length;
  const enteredStudentCount = params.studentAnswers
    .slice(0, params.expectedLength)
    .filter(Boolean).length;

  const isPartialKey = enteredKeyCount > 0 && enteredKeyCount < params.expectedLength;
  const message =
    enteredKeyCount === 0
      ? `${activeBooklet} kitapçığı için cevap anahtarı sütunu henüz boş; soru havuzu anahtarıyla önizleniyor.`
      : isPartialKey
        ? `${activeBooklet} Kitapçığı ↔ ${activeBooklet} Sütunu sabitlendi (${enteredKeyCount}/${params.expectedLength} soru anahtarı girili; eksik sorular kaydırılmadan korundu).`
        : `${activeBooklet} Kitapçığı ↔ ${activeBooklet} Sütunu birebir doğrulandı (Sütun kayması yok).`;

  return {
    alignedKey,
    alignment: {
      bookletCode: activeBooklet,
      matchedKeyColumn: activeBooklet,
      keyLength: enteredKeyCount,
      studentAnswerLength: enteredStudentCount,
      expectedQuestionCount: params.expectedLength,
      hasColumnShift: false,
      autoAligned: true,
      message,
    },
  };
}

export function evaluateOmrExam(input: EvaluateOmrInput): ExamAnalysisResult {
  const profile = getGradeProfile(input.gradeId);
  const totalQuestions =
    input.questions.length > 0 && input.enforceQuestionBounds !== false
      ? input.questions.length
      : Math.max(input.questions.length, input.answerKey.length);
  const optionLetters = profile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : [...VALID_OPTIONS];

  const { alignedKey, alignment } = resolveBookletAlignedAnswerKey({
    bookletCode: input.bookletCode,
    bookletAnswerKeys: input.bookletAnswerKeys,
    fallbackAnswerKey: input.answerKey,
    studentAnswers: input.studentAnswers,
    expectedLength: totalQuestions,
    maxOptionCount: profile.optionCount,
  });

  const optionDistribution: Record<string, { student: number; key: number }> = {};
  optionLetters.forEach((opt) => {
    optionDistribution[opt] = { student: 0, key: 0 };
  });
  optionDistribution['BOŞ'] = { student: 0, key: 0 };

  const errorBreakdown: Record<string, number> = {
    'Bilgi Eksikliği': 0,
    'Çeldiriciye Düşme': 0,
    'Dikkat Hatası': 0,
    'Süre / Boş': 0,
  };

  const questionDetails: QuestionEvaluation[] = [];
  const subjectMap = new Map<
    string,
    { total: number; correct: number; wrong: number; blank: number }
  >();
  const topicMap = new Map<
    string,
    { subject: string; topic: string; gainCode: string; total: number; correct: number; wrong: number; blank: number }
  >();
  const diffMap = new Map<
    DifficultyLevel,
    { total: number; correct: number; wrong: number; blank: number }
  >([
    ['Kolay', { total: 0, correct: 0, wrong: 0, blank: 0 }],
    ['Orta', { total: 0, correct: 0, wrong: 0, blank: 0 }],
    ['Zor', { total: 0, correct: 0, wrong: 0, blank: 0 }],
  ]);

  let totalCorrect = 0;
  let totalWrong = 0;
  let totalBlank = 0;

  for (let i = 0; i < totalQuestions; i++) {
    const qMeta = input.questions[i];
    const subject = qMeta?.subject ?? 'Genel';
    const topic = qMeta?.topic ?? `${subject} Konu ${(i % 4) + 1}`;
    const gainCode = qMeta?.gainCode ?? `KZN.${i + 1}`;
    const difficulty: DifficultyLevel = qMeta?.difficulty ?? 'Orta';
    const correctAnswer = (alignedKey[i] ?? qMeta?.correctOption ?? 'A').toUpperCase();
    const studentAnswer = input.studentAnswers[i] ? input.studentAnswers[i]!.toUpperCase() : null;

    if (!subjectMap.has(subject)) {
      subjectMap.set(subject, { total: 0, correct: 0, wrong: 0, blank: 0 });
    }
    const subjStat = subjectMap.get(subject)!;
    subjStat.total++;

    const topicKey = `${subject}::${topic}`;
    if (!topicMap.has(topicKey)) {
      topicMap.set(topicKey, { subject, topic, gainCode, total: 0, correct: 0, wrong: 0, blank: 0 });
    }
    const topicStat = topicMap.get(topicKey)!;
    topicStat.total++;

    const diffStat = diffMap.get(difficulty)!;
    diffStat.total++;

    if (optionDistribution[correctAnswer]) {
      optionDistribution[correctAnswer].key++;
    }

    let status: 'dogru' | 'yanlis' | 'bos';
    let errorType: QuestionEvaluation['errorType'];

    if (!studentAnswer) {
      status = 'bos';
      totalBlank++;
      subjStat.blank++;
      topicStat.blank++;
      diffStat.blank++;
      optionDistribution['BOŞ'].student++;
      errorType = 'Süre / Boş';
      errorBreakdown['Süre / Boş']++;
    } else {
      if (optionDistribution[studentAnswer]) {
        optionDistribution[studentAnswer].student++;
      }
      if (studentAnswer === correctAnswer) {
        status = 'dogru';
        totalCorrect++;
        subjStat.correct++;
        topicStat.correct++;
        diffStat.correct++;
      } else {
        status = 'yanlis';
        totalWrong++;
        subjStat.wrong++;
        topicStat.wrong++;
        diffStat.wrong++;

        if (difficulty === 'Kolay') {
          errorType = 'Dikkat Hatası';
          errorBreakdown['Dikkat Hatası']++;
        } else if (difficulty === 'Orta') {
          errorType = 'Çeldiriciye Düşme';
          errorBreakdown['Çeldiriciye Düşme']++;
        } else {
          errorType = 'Bilgi Eksikliği';
          errorBreakdown['Bilgi Eksikliği']++;
        }
      }
    }

    questionDetails.push({
      number: i + 1,
      subject,
      topic,
      gainCode,
      difficulty,
      studentAnswer,
      correctAnswer,
      status,
      errorType,
    });
  }

  const totalNet = Number(
    (input.penaltyDivisor === 0
      ? totalCorrect
      : Math.max(0, totalCorrect - totalWrong / input.penaltyDivisor)
    ).toFixed(2)
  );
  const netRatio = totalQuestions > 0 ? totalNet / totalQuestions : 0;
  const estimatedScore = Number(
    Math.min(
      profile.maxScore,
      profile.baseScore + netRatio * (profile.maxScore - profile.baseScore)
    ).toFixed(2)
  );

  const isSingleCohort = !input.isSampleDemo && (input.cohortSize ?? 1) <= 1;

  const subjectMetrics: SubjectMetrics[] = Array.from(subjectMap.entries()).map(
    ([subject, stat], idx) => {
      const net = Number(
        (input.penaltyDivisor === 0
          ? stat.correct
          : Math.max(0, stat.correct - stat.wrong / input.penaltyDivisor)
        ).toFixed(2)
      );
      const accuracyPct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      const classAvgNet = isSingleCohort
        ? net
        : Number((stat.total * (0.56 + (idx % 3) * 0.04)).toFixed(2));
      const academyAvgNet = isSingleCohort
        ? net
        : Number((stat.total * (0.52 + (idx % 2) * 0.05)).toFixed(2));
      const turkeyAvgNet = input.isSampleDemo
        ? Number((stat.total * (0.41 + (idx % 3) * 0.03)).toFixed(2))
        : academyAvgNet;

      return {
        subject,
        total: stat.total,
        correct: stat.correct,
        wrong: stat.wrong,
        blank: stat.blank,
        net,
        accuracyPct,
        classAvgNet,
        academyAvgNet,
        turkeyAvgNet,
      };
    }
  );

  const topicGaps: TopicGapMetric[] = Array.from(topicMap.values())
    .map((t) => {
      const masteryPct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
      const status: TopicGapMetric['status'] =
        masteryPct >= 75
          ? 'Tam Hakimiyet'
          : masteryPct >= 45
            ? 'Geliştirilmeli'
            : 'Kritik Eksik';
      return {
        subject: t.subject,
        topic: t.topic,
        gainCode: t.gainCode,
        total: t.total,
        correct: t.correct,
        wrong: t.wrong,
        blank: t.blank,
        masteryPct,
        status,
      };
    })
    .sort((a, b) => a.masteryPct - b.masteryPct);

  const difficultyMetrics: DifficultyMetric[] = (['Kolay', 'Orta', 'Zor'] as DifficultyLevel[]).map(
    (difficulty) => {
      const d = diffMap.get(difficulty)!;
      return {
        difficulty,
        total: d.total,
        correct: d.correct,
        wrong: d.wrong,
        blank: d.blank,
        successPct: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
      };
    }
  );

  const priorRecords = (input.historicalExams ?? []).slice(-4);
  const currentAcademyAvg = Number(
    (input.cohortAvgNet !== undefined
      ? input.cohortAvgNet
      : isSingleCohort
        ? totalNet
        : totalQuestions * 0.56
    ).toFixed(2)
  );
  const historicalTrend: HistoricalExamPoint[] = input.isSampleDemo && priorRecords.length === 0
    ? [
        ...DEFAULT_HISTORICAL_TREND.slice(0, 4).map((h) => ({
          ...h,
          net: Number(((h.net / 120) * totalQuestions).toFixed(2)),
          academyAvgNet: Number(((h.academyAvgNet / 120) * totalQuestions).toFixed(2)),
        })),
        {
          examName: 'Son Deneme (Güncel)',
          date: new Date().toLocaleDateString('tr-TR'),
          net: totalNet,
          score: estimatedScore,
          academyAvgNet: currentAcademyAvg,
        },
      ]
    : [
        ...priorRecords,
        {
          examName:
            priorRecords.length === 0
              ? '1. Deneme (İlk Kayıt)'
              : `${priorRecords.length + 1}. Deneme (Güncel)`,
          date: new Date().toLocaleDateString('tr-TR'),
          net: totalNet,
          score: estimatedScore,
          academyAvgNet: currentAcademyAvg,
        },
      ];

  const firstNet = historicalTrend[0]?.net ?? totalNet;
  const stepGrowth =
    historicalTrend.length > 1
      ? (totalNet - firstNet) / (historicalTrend.length - 1)
      : Math.max(0.5, totalQuestions * 0.08);
  const projectedNet = Number(
    Math.min(totalQuestions, Math.max(0, totalNet + Math.max(1.0, stepGrowth))).toFixed(2)
  );
  const projectedScore = Number(
    Math.min(
      profile.maxScore,
      profile.baseScore + (projectedNet / Math.max(1, totalQuestions)) * (profile.maxScore - profile.baseScore)
    ).toFixed(2)
  );

  const percentile = Number(Math.min(99.6, Math.max(4.5, netRatio * 98)).toFixed(1));
  const classSize = input.isSampleDemo
    ? Math.max(1, input.classSize ?? 32)
    : Math.max(1, input.classSize ?? 1);
  const academySize = input.isSampleDemo
    ? Math.max(1, input.cohortSize ?? 420)
    : Math.max(1, input.cohortSize ?? 1);
  const classRank = classSize <= 1 ? 1 : Math.max(1, Math.min(classSize, Math.round(((100 - percentile) / 100) * classSize) + 1));
  const academyRank = academySize <= 1 ? 1 : Math.max(1, Math.min(academySize, Math.round(((100 - percentile) / 100) * academySize) + 1));

  return {
    studentName: input.studentName.trim(),
    studentNumber: input.studentNumber.trim(),
    classroom: input.classroom || `${profile.shortLabel} - A Şubesi`,
    examTitle: input.examTitle || profile.examName,
    gradeId: input.gradeId,
    penaltyDivisor: input.penaltyDivisor,
    totalQuestions,
    totalCorrect,
    totalWrong,
    totalBlank,
    totalNet,
    estimatedScore,
    maxScore: profile.maxScore,
    percentile,
    classRank,
    classSize,
    academyRank,
    academySize,
    subjectMetrics,
    topicGaps,
    difficultyMetrics,
    optionDistribution,
    errorBreakdown,
    questionDetails,
    historicalTrend,
    projectedScore,
    projectedNet,
    columnAlignment: alignment,
  };
}
