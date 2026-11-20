import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { buildAutoExamQuestions, evaluateOmrExam, generateSampleOmrPair } from './examAnalysis';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import {
  auditExamQuestions,
  balanceDifficultyLevels,
  balanceQuestionOptions,
  buildDefaultCalendarEvents,
  buildRemedialCalendarEvent,
  buildSmartRecommendations,
} from './recommendations';

test('auditExamQuestions and balanceQuestionOptions equalize A-E options cleanly without losing answers', () => {
  const raw = buildAutoExamQuestions('TYT', 'dengeli', 40).map((q) => ({
    ...q,
    correctOption: 'A', // skew intentionally
  }));

  const skewedAudit = auditExamQuestions(raw, 5);
  assert.equal(skewedAudit.optionCounts.A, 40);
  assert.equal(skewedAudit.suggestions[0].needsFix, true);

  const balanced = balanceQuestionOptions(raw, 5);
  const balancedAudit = auditExamQuestions(balanced, 5);
  assert.equal(balancedAudit.optionCounts.A, 8);
  assert.equal(balancedAudit.optionCounts.B, 8);
  assert.equal(balancedAudit.optionCounts.E, 8);
  assert.equal(balancedAudit.optionBalancePct, 100);
});

test('balanceDifficultyLevels enforces OSYM 30/45/25 pyramid', () => {
  const qs = buildAutoExamQuestions('8', 'zor', 90);
  const balanced = balanceDifficultyLevels(qs);
  const audit = auditExamQuestions(balanced, 4);
  assert.equal(audit.difficultyCounts.Kolay, 27);
  assert.equal(audit.difficultyCounts.Orta, 41);
  assert.equal(audit.difficultyCounts.Zor, 22);
});

test('buildSmartRecommendations and calendar builders produce multi-category actionable outputs', () => {
  const qs = buildAutoExamQuestions('TYT', 'dengeli', 120);
  const sample = generateSampleOmrPair(qs, 0.72);
  const analysis = evaluateOmrExam({
    studentName: 'Alihan Sarı',
    studentNumber: '31998173',
    classroom: '12-A Sayısal',
    examTitle: 'TYT Deneme',
    gradeId: 'TYT',
    penaltyDivisor: 4,
    studentAnswers: sample.studentString.split(''),
    answerKey: sample.keyString.split(''),
    questions: qs,
  });

  const recs = buildSmartRecommendations({
    activeInstitution: DEFAULT_INSTITUTIONS[0],
    gradeProfile: getGradeProfile('TYT'),
    analysis,
    questionsCount: qs.length,
    calendarCount: 5,
  });

  assert.ok(recs.length >= 8);
  const categories = new Set(recs.map((r) => r.category));
  assert.equal(categories.size, 4);

  const calEvents = buildDefaultCalendarEvents(DEFAULT_INSTITUTIONS[0].id, 'TYT');
  assert.equal(calEvents.length, 5);

  const rem = buildRemedialCalendarEvent({
    topicGap: analysis.topicGaps[0],
    institutionId: DEFAULT_INSTITUTIONS[0].id,
    gradeId: 'TYT',
    classroom: '12-A Sayısal',
  });
  assert.equal(rem.type, 'telafi-etutu');
  assert.match(rem.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('buildSmartRecommendations avoids fake failure percentages when hasLiveAnalysis is false', () => {
  const qs = buildAutoExamQuestions('7', 'dengeli', 90);
  const analysis = evaluateOmrExam({
    studentName: 'Emir Talha',
    studentNumber: '81552389',
    classroom: '7-A',
    examTitle: '7. Sınıf LGS Hazırlık',
    gradeId: '7',
    penaltyDivisor: 3,
    studentAnswers: [],
    answerKey: qs.map((q) => q.correctOption),
    questions: qs,
  });
  const recs = buildSmartRecommendations({
    activeInstitution: DEFAULT_INSTITUTIONS[0],
    gradeProfile: getGradeProfile('7'),
    analysis,
    questionsCount: qs.length,
    calendarCount: 2,
    hasLiveAnalysis: false,
  });
  assert.equal(recs[0].impactLabel, 'Ön Hazırlık');
  assert.match(recs[0].description, /henüz deneme değerlendirmesi yapılmadı/);
  assert.doesNotMatch(recs[0].description, /%0 başarıda/);
});
