import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { DEFAULT_INSTITUTIONS } from './institutionCodes';
import {
  buildGradeAppropriateSubtitle,
  buildParentMessage,
  buildReportCardParentMessage,
  buildSampleWeeklyCohort,
  buildWhatsAppHref,
  calculateNetAndScore,
  computeWeeklyCohortInsights,
  computeWeeklyComparison,
  filterAndSortWeeklyRows,
  filterRowsForBulkMessages,
  getDynamicAchievementTier,
  normalizeClassroomForGrade,
  sanitizeExamLabelForGrade,
} from './weeklyAnalysis';
import { buildAutoExamQuestions, evaluateOmrExam, generateSampleOmrPair } from './examAnalysis';

test('grade-appropriate subtitle excludes TYT/AYT for elementary and middle grades', () => {
  const g5 = getGradeProfile('5');
  const sub5 = buildGradeAppropriateSubtitle(g5);
  assert.equal(sub5.includes('TYT'), false);
  assert.equal(sub5.includes('AYT'), false);
  assert.equal(sub5.includes('5. Sınıf'), true);

  const tyt = getGradeProfile('TYT');
  assert.equal(buildGradeAppropriateSubtitle(tyt).includes('TYT'), true);

  assert.equal(sanitizeExamLabelForGrade('Doğruluk Akademi TYT 120', g5).includes('TYT'), false);
  assert.equal(sanitizeExamLabelForGrade('11. Sınıf AYT Denemesi', getGradeProfile('11')).includes('AYT'), false);
  assert.equal(sanitizeExamLabelForGrade('TYT Deneme', tyt), 'TYT Deneme');
});

test('weekly 20 and 50 question calculations use exact 3Y=1D vs 4Y=1D penalty rules', () => {
  const g5 = getGradeProfile('5'); // 3Y = 1D
  const res20 = calculateNetAndScore(17, 3, 20, g5);
  assert.equal(res20.net, 16);
  assert.equal(res20.successPct, 80);

  const tyt = getGradeProfile('TYT'); // 4Y = 1D
  const res50 = calculateNetAndScore(44, 4, 50, tyt);
  assert.equal(res50.net, 43);
  assert.equal(res50.successPct, 86);
});

test('15-student KTS-1 vs KTS-2 cohort ranks descending with Top-3 circular badges and statuses', () => {
  const g5 = getGradeProfile('5');
  const cohort = buildSampleWeeklyCohort({
    institution: DEFAULT_INSTITUTIONS[0],
    gradeId: '5',
    questionCount: 20,
  });
  assert.equal(cohort.length, 15);

  const ranked = computeWeeklyComparison({
    entries: cohort,
    kts1TotalQuestions: 20,
    kts2TotalQuestions: 20,
    gradeProfile: g5,
  });

  assert.equal(ranked.length, 15);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].top3Badge, 1);
  assert.equal(ranked[1].top3Badge, 2);
  assert.equal(ranked[2].top3Badge, 3);
  assert.equal(ranked[3].top3Badge, null);
  assert.ok(ranked[0].kts2Score >= ranked[1].kts2Score);
  assert.equal(ranked[14].status, 'Çalışması Gerekiyor');
});

test('parent message highlights Top-3 celebration vs study advice and strips TYT/AYT on school grades', () => {
  const g5 = getGradeProfile('5');
  const cohort = buildSampleWeeklyCohort({
    institution: DEFAULT_INSTITUTIONS[0],
    gradeId: '5',
    questionCount: 50,
  });
  const ranked = computeWeeklyComparison({
    entries: cohort,
    kts1TotalQuestions: 50,
    kts2TotalQuestions: 50,
    gradeProfile: g5,
  });

  const topMsg = buildParentMessage({
    row: ranked[0],
    academyName: 'Doğruluk Akademi',
    kts1Name: 'TYT Haftalık 1 (KTS-1)',
    kts2Name: 'AYT Haftalık 2 (KTS-2)',
    gradeLabel: g5.shortLabel,
    gradeProfile: g5,
  });
  assert.ok(topMsg.includes('1.lik Altın Başarı'));
  assert.ok(topMsg.includes('Kurum: Doğruluk Akademi'));
  assert.ok(topMsg.includes('Gelişim Analizi:'));
  assert.equal(topMsg.includes('TYT'), false);
  assert.equal(topMsg.includes('AYT'), false);

  const lowMsg = buildParentMessage({
    row: ranked[14],
    academyName: 'Doğruluk Akademi',
    kts1Name: 'Haftalık 1 (KTS-1)',
    kts2Name: 'Haftalık 2 (KTS-2)',
    gradeLabel: g5.shortLabel,
    gradeProfile: g5,
  });
  assert.ok(lowMsg.includes('etüt'));

  const smsMsg = buildParentMessage({
    row: ranked[0],
    academyName: 'Doğruluk Akademi',
    kts1Name: 'KTS-1',
    kts2Name: 'KTS-2',
    gradeLabel: g5.shortLabel,
    gradeProfile: g5,
    mode: 'short-sms',
  });
  assert.ok(smsMsg.length < 240);
  assert.ok(smsMsg.includes('Başarı Rozeti'));

  const forcedStudy = buildParentMessage({
    row: ranked[3],
    academyName: 'Doğruluk Akademi',
    kts1Name: 'KTS-1',
    kts2Name: 'KTS-2',
    gradeLabel: g5.shortLabel,
    gradeProfile: g5,
    mode: 'study-alert',
  });
  assert.ok(forcedStudy.includes('Birebir etüt planlaması'));
});

test('computeWeeklyCohortInsights and filterAndSortWeeklyRows calculate rising star, averages, and filters accurately', () => {
  const g5 = getGradeProfile('5');
  const cohort = buildSampleWeeklyCohort({
    institution: DEFAULT_INSTITUTIONS[0],
    gradeId: '5',
    questionCount: 50,
  });
  const ranked = computeWeeklyComparison({
    entries: cohort,
    kts1TotalQuestions: 50,
    kts2TotalQuestions: 50,
    gradeProfile: g5,
  });

  const insights = computeWeeklyCohortInsights(ranked);
  assert.equal(insights.totalStudents, 15);
  assert.ok(insights.avgKts2Score > insights.avgKts1Score);
  assert.ok(insights.risingStar !== null && insights.risingStar.scoreDelta > 0);
  assert.equal(insights.topPerformer?.rank, 1);

  const top3Only = filterAndSortWeeklyRows(ranked, { statusFilter: 'top3' });
  assert.equal(top3Only.length, 3);
  assert.equal(filterRowsForBulkMessages(ranked, 'top3').length, 3);

  const byDeltaDesc = filterAndSortWeeklyRows(ranked, { sortKey: 'delta', sortDir: 'desc' });
  assert.ok(byDeltaDesc[0].scoreDelta >= byDeltaDesc[1].scoreDelta);
});

test('dynamic achievement tier, WhatsApp URL normalization, and Karne parent message work without TYT/AYT leaks', () => {
  assert.equal(getDynamicAchievementTier({ rank: 1, successPct: 92 }).key, 'gold-crown');
  assert.equal(getDynamicAchievementTier({ rank: 2, successPct: 86 }).key, 'silver-medal');
  assert.equal(getDynamicAchievementTier({ rank: 3, successPct: 81 }).key, 'bronze-medal');
  assert.equal(getDynamicAchievementTier({ rank: 5, successPct: 68, scoreDelta: 22, isRisingStar: true }).key, 'rising-star');
  assert.equal(getDynamicAchievementTier({ rank: 8, successPct: 42 }).key, 'focus-compass');

  const waHref = buildWhatsAppHref('0505 226 92 58', 'Merhaba Veli');
  assert.ok(waHref.startsWith('https://wa.me/905052269258?text='));

  const g5 = getGradeProfile('5');
  const questions = buildAutoExamQuestions('5', 'dengeli');
  const pair = generateSampleOmrPair(questions, 0.8);
  const analysis = evaluateOmrExam({
    studentName: 'Alihan Sarı',
    studentNumber: '31998173',
    classroom: '5-A',
    examTitle: 'TYT AYT Karışık Deneme',
    gradeId: '5',
    penaltyDivisor: 3,
    studentAnswers: pair.studentString.split(''),
    answerKey: pair.keyString.split(''),
    questions,
  });

  const karneMsg = buildReportCardParentMessage({
    analysis,
    academyName: 'Doğruluk Akademi Merkez',
    gradeProfile: g5,
  });
  assert.ok(karneMsg.includes('Doğruluk Akademi Merkez'));
  assert.ok(karneMsg.includes('Alihan Sarı'));
  assert.ok(karneMsg.includes('5. Sınıf'));
  assert.ok(karneMsg.includes('Gelişim Analizi:'));
  assert.equal(karneMsg.includes('TYT'), false);
  assert.equal(karneMsg.includes('AYT'), false);
});

test('normalizeClassroomForGrade rewrites stale 12-A Sayısal to 5-A when 5. Sınıf is selected', () => {
  const g5 = getGradeProfile('5');
  assert.equal(normalizeClassroomForGrade('12-A Sayısal', g5), '5-A');
  assert.equal(normalizeClassroomForGrade('12-B TYT', g5), '5-B');
  assert.equal(normalizeClassroomForGrade('5. Sınıf - A', g5), '5-A');

  const ranked = computeWeeklyComparison({
    entries: [
      {
        studentId: 'stu-old',
        studentName: 'Ahmet Yılmaz',
        studentNumber8: '31570114',
        classroom: '12-A Sayısal',
        kts1Correct: 41,
        kts1Wrong: 0,
        kts1Blank: 9,
        kts2Correct: 46,
        kts2Wrong: 0,
        kts2Blank: 4,
      },
    ],
    kts1TotalQuestions: 50,
    kts2TotalQuestions: 50,
    gradeProfile: g5,
  });

  assert.equal(ranked[0].classroom, '5-A');
  const msg = buildParentMessage({
    row: ranked[0],
    academyName: 'Doğruluk Akademi Merkez',
    kts1Name: 'Haftalık 1 (KTS-1)',
    kts2Name: 'Haftalık 2 (KTS-2)',
    gradeLabel: g5.shortLabel,
    gradeProfile: g5,
  });
  assert.ok(msg.includes('5. Sınıf · 5-A'));
  assert.equal(msg.includes('12-A'), false);
  assert.equal(msg.includes('Sayısal'), false);
});
