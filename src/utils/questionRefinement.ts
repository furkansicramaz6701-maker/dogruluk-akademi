import { DifficultyLevel, ExamQuestion, GradeProfile } from '../types/academy';

export type QuestionRefinementMode =
  | 'harder'
  | 'change-context'
  | 'simplify'
  | 'new-gen'
  | 'custom';

export interface QuestionRefinementPreset {
  id: Exclude<QuestionRefinementMode, 'custom'>;
  label: string;
  description: string;
  instruction: string;
}

export const QUESTION_REFINEMENT_PRESETS: QuestionRefinementPreset[] = [
  {
    id: 'harder',
    label: 'Soruyu Zorlaştır',
    description: 'Çok adımlı muhakeme ve güçlü çeldiriciler ekler.',
    instruction:
      'Soruyu aynı kazanım içinde bir üst bilişsel basamağa çıkar, çok adımlı çıkarım gerektiren daha zor ve ayırt edici hale getir. Çeldiricileri gerçekçi hatalara dayandır.',
  },
  {
    id: 'change-context',
    label: 'Bağlamı Değiştir',
    description: 'Farklı bir senaryo veya günlük yaşam teması kurar.',
    instruction:
      'Kazanımı ve mantıksal yapıyı koruyarak sorunun hikayesini/bağlamını tamamen farklı, özgün bir günlük yaşam senaryosuna taşı ve şıkları buna göre yeniden kurgula.',
  },
  {
    id: 'simplify',
    label: 'Netleştir & Basitleştir',
    description: 'Soru kökünü sadeleştirir, dil karmaşasını azaltır.',
    instruction:
      'Soru kökünü öğrenci düzeyine uygun, daha akıcı, net ve anlaşılır hale getir; belirsiz ifadeleri temizle ve şıkları dengeli uzunlukta düzenle.',
  },
  {
    id: 'new-gen',
    label: 'Yeni Nesil Kurguya Çevir',
    description: 'Veri yorumlama ve senaryo tabanlı yeni nesil biçime uyarlar.',
    instruction:
      'Soruyu ezber bilgiden çıkarıp kısa bir ön bilgi/senaryo veren, analiz ve yorumlama becerisi ölçen yeni nesil sınav sorusu formatına dönüştür.',
  },
];

export interface QuestionRefinementPayload {
  gradeLabel: string;
  optionCount: 4 | 5;
  mode: QuestionRefinementMode;
  instruction: string;
  question: {
    subject: string;
    topic: string;
    gainCode: string;
    difficulty: DifficultyLevel;
    stem: string;
    options: Record<string, string>;
    correctOption: string;
    explanation: string;
  };
}

export interface RefinedQuestionSuggestion {
  summaryRationale: string;
  refinedQuestion: {
    subject: string;
    topic: string;
    gainCode: string;
    difficulty: DifficultyLevel;
    stem: string;
    options: Record<string, string>;
    correctOption: string;
    explanation: string;
  };
}

export function buildQuestionRefinementRequestPayload(params: {
  question: ExamQuestion;
  gradeProfile: GradeProfile;
  mode: QuestionRefinementMode;
  customInstruction?: string;
}): QuestionRefinementPayload {
  const { question, gradeProfile, mode, customInstruction } = params;
  const letters = gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const cleanOptions: Record<string, string> = {};
  letters.forEach((l) => {
    cleanOptions[l] = (question.options[l] ?? '').trim();
  });

  const preset = QUESTION_REFINEMENT_PRESETS.find((p) => p.id === mode);
  const instruction =
    mode === 'custom'
      ? (customInstruction ?? '').trim() ||
        'Soruyu müfredat kazanımına uygun biçimde iyileştir ve şıkları dengele.'
      : [preset?.instruction, (customInstruction ?? '').trim()].filter(Boolean).join(' ');

  return {
    gradeLabel: gradeProfile.label,
    optionCount: gradeProfile.optionCount,
    mode,
    instruction,
    question: {
      subject: question.subject,
      topic: question.topic,
      gainCode: question.gainCode,
      difficulty: question.difficulty,
      stem: question.stem,
      options: cleanOptions,
      correctOption: letters.includes(question.correctOption) ? question.correctOption : 'A',
      explanation: question.explanation,
    },
  };
}

function normalizeDifficulty(
  raw: unknown,
  fallback: DifficultyLevel
): DifficultyLevel {
  const text = typeof raw === 'string' ? raw.trim().toLocaleLowerCase('tr-TR') : '';
  if (text === 'kolay') return 'Kolay';
  if (text === 'orta') return 'Orta';
  if (text === 'zor') return 'Zor';
  return fallback;
}

export function normalizeRefinedQuestionResponse(
  raw: unknown,
  original: ExamQuestion,
  optionCount: 4 | 5
): RefinedQuestionSuggestion {
  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rqRaw =
    obj.refinedQuestion && typeof obj.refinedQuestion === 'object'
      ? (obj.refinedQuestion as Record<string, unknown>)
      : obj;

  const rawOptions =
    rqRaw.options && typeof rqRaw.options === 'object'
      ? (rqRaw.options as Record<string, unknown>)
      : {};

  const options: Record<string, string> = {};
  letters.forEach((letter) => {
    const candidate = rawOptions[letter];
    const text =
      typeof candidate === 'string' && candidate.trim().length > 0
        ? candidate.trim()
        : original.options[letter] ?? `${letter} seçeneği`;
    options[letter] = text;
  });

  const rawCorrect =
    typeof rqRaw.correctOption === 'string'
      ? rqRaw.correctOption.trim().toUpperCase()
      : '';
  const correctOption = letters.includes(rawCorrect)
    ? rawCorrect
    : letters.includes(original.correctOption)
    ? original.correctOption
    : 'A';

  const stem =
    typeof rqRaw.stem === 'string' && rqRaw.stem.trim().length > 0
      ? rqRaw.stem.trim()
      : original.stem;

  const explanation =
    typeof rqRaw.explanation === 'string' && rqRaw.explanation.trim().length > 0
      ? rqRaw.explanation.trim()
      : original.explanation;

  const summaryRationale =
    typeof obj.summaryRationale === 'string' && obj.summaryRationale.trim().length > 0
      ? obj.summaryRationale.trim()
      : 'Soru kökündeki bilişsel düzey ve çeldirici dengesi güncellendi.';

  return {
    summaryRationale,
    refinedQuestion: {
      subject:
        typeof rqRaw.subject === 'string' && rqRaw.subject.trim().length > 0
          ? rqRaw.subject.trim()
          : original.subject,
      topic:
        typeof rqRaw.topic === 'string' && rqRaw.topic.trim().length > 0
          ? rqRaw.topic.trim()
          : original.topic,
      gainCode:
        typeof rqRaw.gainCode === 'string' && rqRaw.gainCode.trim().length > 0
          ? rqRaw.gainCode.trim()
          : original.gainCode,
      difficulty: normalizeDifficulty(rqRaw.difficulty, original.difficulty),
      stem,
      options,
      correctOption,
      explanation,
    },
  };
}
