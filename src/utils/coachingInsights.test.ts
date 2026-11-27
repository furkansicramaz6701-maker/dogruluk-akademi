import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  generateSampleOmrPair,
} from './examAnalysis';
import {
  buildCoachingInsightsPayload,
  buildMultiExamTrendSummary,
  buildQuickShareWhatsAppSummary,
  extractExtraExamsFromWeekly,
  normalizeCoachingInsightsResponse,
} from './coachingInsights';

test('buildMultiExamTrendSummary calculates deltas, momentum, and deduplicates extra exams', () => {
  const profile = getGradeProfile('8');
  const questions = buildAutoExamQuestions('8', 'dengeli');
  const pair = generateSampleOmrPair(questions, 0.78);
  const analysis = evaluateOmrExam({
    studentName: 'Elif Yılmaz',
    studentNumber: '12345678',
    classroom: '8-A',
    examTitle: 'LGS Deneme 5',
    gradeId: '8',
    penaltyDivisor: profile.penaltyDivisor,
    studentAnswers: pair.studentString.split(''),
    answerKey: pair.keyString.split(''),
    questions,
    historicalExams: [
      { examName: 'Deneme 1', date: '01.10.2026', net: 48, score: 310, academyAvgNet: 46 },
      { examName: 'Deneme 2', date: '15.10.2026', net: 54, score: 335, academyAvgNet: 48 },
      { examName: 'Deneme 3', date: '01.11.2026', net: 60, score: 365, academyAvgNet: 50 },
    ],
  });

  const extra = [
    { examName: 'Deneme 1', date: '01.10.2026', net: 48, score: 310, academyAvgNet: 46 },
    { examName: 'Haftalık KTS-1', date: '20.09.2026', net: 44, score: 295, academyAvgNet: 43 },
  ];

  const summary = buildMultiExamTrendSummary(analysis, extra);
  // Deneme 1..3 + extra Haftalık KTS-1 + Son Deneme (Güncel) = 5 (Deneme 1 deduplicated)
  assert.equal(summary.examCount, 5);
  assert.equal(summary.firstExam?.examName, 'Deneme 1');
  assert.equal(summary.latestExam?.examName, '4. Deneme (Güncel)');
  assert.equal(
    summary.netDelta,
    Number((analysis.totalNet - analysis.historicalTrend[0].net).toFixed(2))
  );
  assert.equal(summary.momentum, 'yukselis');
});

test('extractExtraExamsFromWeekly maps matching student KTS-1 and KTS-2 scores cleanly', () => {
  const grade5 = getGradeProfile('5');
  const points = extractExtraExamsFromWeekly({
    weeklyEntries: [
      {
        studentId: 's1',
        studentName: 'Zeynep Kaya',
        studentNumber8: '87654321',
        classroom: '5-A',
        kts1Correct: 14,
        kts1Wrong: 3,
        kts1Blank: 3,
        kts2Correct: 17,
        kts2Wrong: 3,
        kts2Blank: 0,
      },
    ],
    studentNumber: '87654321',
    penaltyDivisor: 3,
    questionCount: 20,
    gradeProfile: grade5,
  });

  assert.equal(points.length, 2);
  assert.equal(points[0].examName, 'Haftalık KTS-1');
  assert.equal(points[0].net, 13);
  assert.equal(points[1].examName, 'Haftalık KTS-2');
  assert.equal(points[1].net, 16);
});

test('buildCoachingInsightsPayload prioritizes lowest-mastery topic gaps for Gemini analysis', () => {
  const profile = getGradeProfile('5');
  const questions = buildAutoExamQuestions('5', 'dengeli');
  const pair = generateSampleOmrPair(questions, 0.55);
  const analysis = evaluateOmrExam({
    studentName: 'Mert Demir',
    studentNumber: '11223344',
    classroom: '5-B',
    examTitle: '5. Sınıf Kurumsal Deneme',
    gradeId: '5',
    penaltyDivisor: profile.penaltyDivisor,
    studentAnswers: pair.studentString.split(''),
    answerKey: pair.keyString.split(''),
    questions,
  });

  const payload = buildCoachingInsightsPayload(analysis, profile);
  assert.equal(payload.student.name, 'Mert Demir');
  assert.equal(payload.multiExamTrend.examCount, 1);
  assert.equal(payload.multiExamTrend.exams[0]?.examName, '1. Deneme (İlk Kayıt)');
  assert.ok(payload.topicGaps.length > 0);
  // Assert descending gap severity (ascending masteryPct)
  for (let i = 1; i < payload.topicGaps.length; i += 1) {
    assert.ok(payload.topicGaps[i - 1].masteryPct <= payload.topicGaps[i].masteryPct);
  }
});

test('normalizeCoachingInsightsResponse sanitizes Gemini JSON and clamps weeklyHours safely', () => {
  const normalized = normalizeCoachingInsightsResponse({
    headline: 'Matematik ve Fen Odaklı Hızlanma Planı',
    trendDirection: 'yukselis',
    trendSummary: 'Son 4 denemede istikrarlı 8.5 net artışı sağlandı.',
    strengthsHighlight: 'Türkçe paragraf sorularında %90 doğruluk yakalandı.',
    focusAreas: [
      {
        subject: 'Matematik',
        topic: 'Üslü İfadeler',
        priority: 'yuksek',
        reason: 'Son 3 denemede üslü ifadeler sorularında %35 başarı görüldü.',
        recommendedAction: 'Günde 20 yeni nesil üslü ifadeler sorusu çöz.',
        weeklyHours: 40, // should clamp to 15
      },
    ],
    weeklyCoachNote: 'Harika bir ivme yakaladın, üslü ifadelere odaklanalım.',
  });

  assert.equal(normalized.trendDirection, 'yukselis');
  assert.equal(normalized.focusAreas.length, 1);
  assert.equal(normalized.focusAreas[0].priority, 'yuksek');
  assert.equal(normalized.focusAreas[0].weeklyHours, 15);
  assert.ok(normalized.generatedAt.length > 0);
});

test('buildQuickShareWhatsAppSummary embeds Gemini Coaching focus area and strengths when present and falls back cleanly', () => {
  const profile = getGradeProfile('8');
  const questions = buildAutoExamQuestions('8', 'dengeli');
  const pair = generateSampleOmrPair(questions, 0.62);
  const analysis = evaluateOmrExam({
    studentName: 'Defne Arslan',
    studentNumber: '20268012',
    classroom: '8-A',
    examTitle: 'LGS Deneme 3',
    gradeId: '8',
    penaltyDivisor: profile.penaltyDivisor,
    studentAnswers: pair.studentString.split(''),
    answerKey: pair.keyString.split(''),
    questions,
  });

  const fallbackShare = buildQuickShareWhatsAppSummary({
    analysis,
    gradeProfile: profile,
    academyName: 'Anadolu Akademi',
    coachingInsights: null,
  });
  assert.equal(fallbackShare.usedGeminiInsights, false);
  assert.ok(fallbackShare.text.includes('Defne Arslan'));
  assert.ok(fallbackShare.text.includes('Çalışma Odak Alanı'));
  assert.ok(fallbackShare.strengthsText.length > 0);
  assert.ok(fallbackShare.focusAreaText.length > 0);

  const geminiReport = normalizeCoachingInsightsResponse({
    strengthsHighlight: 'Fen Bilimleri deney sorularında %92 başarı elde edildi.',
    focusAreas: [
      {
        subject: 'Matematik',
        topic: 'Kareköklü İfadeler',
        priority: 'yuksek',
        reason: 'Son iki denemede kareköklü işlemlerde süre kaybı görüldü.',
        recommendedAction: 'Haftada 3 gün 20 soruluk süreli karekök testi çöz.',
        weeklyHours: 3.5,
      },
    ],
    weeklyCoachNote: 'Düzenli karekök tekrarı ile +4 net artış hedefleniyor.',
  });

  const geminiShare = buildQuickShareWhatsAppSummary({
    analysis,
    gradeProfile: profile,
    academyName: 'Anadolu Akademi',
    coachingInsights: geminiReport,
  });
  assert.equal(geminiShare.usedGeminiInsights, true);
  assert.ok(geminiShare.text.includes('Fen Bilimleri deney sorularında %92'));
  assert.ok(geminiShare.text.includes('Matematik — Kareköklü İfadeler (3.5 saat/hf)'));
  assert.ok(geminiShare.text.includes('Düzenli karekök tekrarı'));
});

