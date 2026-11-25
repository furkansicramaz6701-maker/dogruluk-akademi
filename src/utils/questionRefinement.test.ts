import assert from 'node:assert/strict';
import test from 'node:test';
import { getGradeProfile } from '../data/curriculum';
import { ExamQuestion } from '../types/academy';
import {
  buildQuestionRefinementRequestPayload,
  normalizeRefinedQuestionResponse,
} from './questionRefinement';

const SAMPLE_QUESTION: ExamQuestion = {
  id: 'q-1',
  number: 1,
  subject: 'Matematik',
  topic: 'Üslü İfadeler',
  gainCode: 'M.8.1.2.1',
  difficulty: 'Orta',
  stem: '2^5 x 2^3 işleminin sonucu kaçtır?',
  options: {
    A: '2^8',
    B: '2^15',
    C: '4^8',
    D: '2^2',
  },
  correctOption: 'A',
  explanation: 'Tabanlar eşitse üsler toplanır.',
  source: 'Müfredat Havuzu',
};

test('buildQuestionRefinementRequestPayload enforces 4-option shape for grade 8', () => {
  const grade = getGradeProfile('8');
  const payload = buildQuestionRefinementRequestPayload({
    question: {
      ...SAMPLE_QUESTION,
      options: { ...SAMPLE_QUESTION.options, E: 'Ekstra' },
    },
    gradeProfile: grade,
    mode: 'harder',
  });

  assert.equal(payload.optionCount, 4);
  assert.deepEqual(Object.keys(payload.question.options), ['A', 'B', 'C', 'D']);
  assert.ok(payload.instruction.includes('zor'));
});

test('normalizeRefinedQuestionResponse sanitizes invalid options and preserves valid correctOption', () => {
  const normalized = normalizeRefinedQuestionResponse(
    {
      summaryRationale: 'Problem bağlamı güneş paneli verimliliğine uyarlandı.',
      refinedQuestion: {
        difficulty: 'Zor',
        stem: 'Bir okulun çatısındaki 2^5 adet güneş panelinin her biri günde 2^3 Wh enerji üretmektedir. Toplam günlük üretim kaç Wh olur?',
        options: {
          A: '2^6',
          B: '2^8',
          C: '2^15',
          D: '4^8',
          E: 'Gereksiz E şıkkı',
        },
        correctOption: 'b',
        explanation: '2^5 · 2^3 = 2^(5+3) = 2^8 Wh olur.',
      },
    },
    SAMPLE_QUESTION,
    4
  );

  assert.equal(normalized.refinedQuestion.difficulty, 'Zor');
  assert.equal(normalized.refinedQuestion.correctOption, 'B');
  assert.deepEqual(Object.keys(normalized.refinedQuestion.options), ['A', 'B', 'C', 'D']);
  assert.ok(normalized.summaryRationale.includes('güneş paneli'));
});

test('normalizeRefinedQuestionResponse falls back safely if correctOption is out of range', () => {
  const normalized = normalizeRefinedQuestionResponse(
    {
      refinedQuestion: {
        stem: 'Güncellenmiş soru metni',
        correctOption: 'E',
      },
    },
    SAMPLE_QUESTION,
    4
  );

  assert.equal(normalized.refinedQuestion.correctOption, 'A');
  assert.equal(normalized.refinedQuestion.stem, 'Güncellenmiş soru metni');
});
