import {
  DEFAULT_HISTORICAL_TREND,
  getGradeProfile,
} from '../data/curriculum';
import { generateRealisticQuestionContent } from './realisticQuestions';
import {
  DifficultyLevel,
  DifficultyMetric,
  ExamAnalysisResult,
  ExamQuestion,
  GradeLevelId,
  HistoricalExamPoint,
  PenaltyDivisor,
  QuestionEvaluation,
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

export function parseAnswerString(
  rawInput: string,
  expectedLength: number,
  maxOptionCount: 4 | 5 = 5
): (string | null)[] {
  const allowed = maxOptionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const trimmed = rawInput.trim();
  const result: (string | null)[] = Array(expectedLength).fill(null);

  if (!trimmed) {
    return result;
  }

  // Check if numbered format e.g. "1-A 2:B 3.C" or CSV "1,A" (including multi-mark tokens like "1-AB" or "2-[CD]")
  const numberedMatches = [
    ...trimmed.matchAll(
      /(?:^|[\s,;|\n])(\d{1,3})\s*[:.\-,;\t ]\s*(\[[A-Za-z0-9/+,\s]+\]|\([A-Za-z0-9/+,\s]+\)|BO[SŞ]|[A-Za-z\-*._?]+)(?=$|[\s,;|\n])/gi
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
}

export function evaluateOmrExam(input: EvaluateOmrInput): ExamAnalysisResult {
  const profile = getGradeProfile(input.gradeId);
  const totalQuestions = Math.max(input.questions.length, input.answerKey.length);
  const optionLetters = profile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : [...VALID_OPTIONS];

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
    const correctAnswer = (input.answerKey[i] ?? qMeta?.correctOption ?? 'A').toUpperCase();
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

  const subjectMetrics: SubjectMetrics[] = Array.from(subjectMap.entries()).map(
    ([subject, stat], idx) => {
      const net = Number(
        (input.penaltyDivisor === 0
          ? stat.correct
          : Math.max(0, stat.correct - stat.wrong / input.penaltyDivisor)
        ).toFixed(2)
      );
      const accuracyPct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      const classAvgNet = Number((stat.total * (0.56 + (idx % 3) * 0.04)).toFixed(2));
      const academyAvgNet = Number((stat.total * (0.52 + (idx % 2) * 0.05)).toFixed(2));
      const turkeyAvgNet = Number((stat.total * (0.41 + (idx % 3) * 0.03)).toFixed(2));

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

  const baseHistory = input.historicalExams ?? DEFAULT_HISTORICAL_TREND;
  const historicalTrend: HistoricalExamPoint[] = [
    ...baseHistory.slice(0, 4).map((h) => ({
      ...h,
      net: Number(((h.net / 120) * totalQuestions).toFixed(2)),
      academyAvgNet: Number(((h.academyAvgNet / 120) * totalQuestions).toFixed(2)),
    })),
    {
      examName: 'Son Deneme (Güncel)',
      date: new Date().toLocaleDateString('tr-TR'),
      net: totalNet,
      score: estimatedScore,
      academyAvgNet: Number((totalQuestions * 0.56).toFixed(2)),
    },
  ];

  const firstNet = historicalTrend[0]?.net ?? totalNet;
  const stepGrowth =
    historicalTrend.length > 1
      ? (totalNet - firstNet) / (historicalTrend.length - 1)
      : 2.5;
  const projectedNet = Number(
    Math.min(totalQuestions, Math.max(0, totalNet + Math.max(1.5, stepGrowth) * 2)).toFixed(2)
  );
  const projectedScore = Number(
    Math.min(
      profile.maxScore,
      profile.baseScore + (projectedNet / Math.max(1, totalQuestions)) * (profile.maxScore - profile.baseScore)
    ).toFixed(2)
  );

  const percentile = Number(Math.min(99.6, Math.max(4.5, netRatio * 98)).toFixed(1));
  const classSize = 32;
  const academySize = 420;
  const classRank = Math.max(1, Math.min(classSize, Math.round(((100 - percentile) / 100) * classSize) + 1));
  const academyRank = Math.max(1, Math.min(academySize, Math.round(((100 - percentile) / 100) * academySize) + 1));

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
  };
}
