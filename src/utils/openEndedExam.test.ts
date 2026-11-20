import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { buildAutoExamQuestions, selectCuratedQuestions } from './examAnalysis';
import {
  buildDefaultOpenEndedQuestions,
  buildOpenEndedParentMessage,
  evaluateOpenEndedAnswersText,
  parseOpenEndedQuestionsFromText,
} from './openEndedExam';
import {
  applyCustomParentTemplate,
  buildReportCardParentMessage,
  DEFAULT_CUSTOM_PARENT_TEMPLATES,
} from './weeklyAnalysis';

test('buildAutoExamQuestions supports 20-question single-subject written prep and curated 20-question selection', () => {
  const math20 = buildAutoExamQuestions('5', 'dengeli', 20, 'Matematik');
  assert.equal(math20.length, 20);
  assert.ok(math20.every((q) => q.subject === 'Matematik'));
  assert.equal(Object.keys(math20[0].options).length, 4);

  const fullPool = buildAutoExamQuestions('5', 'dengeli', 70);
  const pickedIds = fullPool.slice(10, 30).map((q) => q.id);
  const curated = selectCuratedQuestions(fullPool, pickedIds, 20);
  assert.equal(curated.length, 20);
  assert.equal(curated[0].number, 1);
  assert.equal(curated[19].number, 20);
});

test('10-question open-ended parser, rubric grading, and grade-safe WhatsApp parent message work accurately', () => {
  const g5 = getGradeProfile('5');
  const defaults = buildDefaultOpenEndedQuestions(g5, 10, 'Matematik');
  assert.equal(defaults.length, 10);
  assert.equal(defaults[0].maxPoints, 10);

  const parsed = parseOpenEndedQuestionsFromText(
    '1. 24 sayısının 3/4 ü kaçtır?\n2. Bir karenin çevresi 36 cm ise alanı kaçtır?',
    '1. 24 / 4 = 6, 6 x 3 = 18 bulunur.\n2. Bir kenarı 36 / 4 = 9 cm, alanı 9 x 9 = 81 cm2 dir.',
    g5,
    10,
    'Matematik'
  );
  assert.equal(parsed.length, 2);
  assert.ok(parsed[0].prompt.includes('24 sayısının'));
  assert.ok(parsed[1].modelAnswer.includes('81'));

  const analysis = evaluateOpenEndedAnswersText({
    questions: parsed,
    studentPaperText: '1. 24 / 4 = 6 ve 6 x 3 = 18\n2. kenar 9 alan 81 cm2',
    studentName: 'Kerem Demir',
    studentNumber: '31548538',
    classroom: '5-A',
    examTitle: '5. Sınıf Matematik TYT Açık Uçlu',
    gradeProfile: g5,
  });

  assert.equal(analysis.questionGrades.length, 2);
  assert.ok(analysis.totalScore >= 16);
  assert.equal(analysis.examTitle.includes('TYT'), false);

  const msg = buildOpenEndedParentMessage({
    paperAnalysis: analysis,
    academyName: 'Doğruluk Akademi Merkez',
    gradeProfile: g5,
  });
  assert.ok(msg.includes('Kerem Demir'));
  assert.ok(msg.includes('5. Sınıf'));
  assert.ok(msg.includes('10 Soruluk Açık Uçlu Yazılı') || msg.includes('Açık Uçlu Yazılı'));
  assert.equal(msg.includes('TYT'), false);
});

test('custom parent message template and written-prep-20 mode sanitize TYT/AYT for 5th grade', () => {
  const g5 = getGradeProfile('5');
  const q20 = buildAutoExamQuestions('5', 'dengeli', 20, 'Türkçe');
  const msg20 = buildReportCardParentMessage({
    analysis: {
      studentName: 'Elif Kaya',
      studentNumber: '31570115',
      classroom: '5-A',
      examTitle: 'TYT Türkçe 20 Soruluk Yazılıya Hazırlık',
      gradeId: '5',
      penaltyDivisor: 3,
      totalQuestions: 20,
      totalCorrect: 18,
      totalWrong: 2,
      totalBlank: 0,
      totalNet: 17.33,
      estimatedScore: 86.7,
      maxScore: 100,
      percentile: 90,
      classRank: 2,
      classSize: 24,
      academyRank: 3,
      academySize: 90,
      subjectMetrics: [
        {
          subject: 'Türkçe',
          total: 20,
          correct: 18,
          wrong: 2,
          blank: 0,
          net: 17.33,
          accuracyPct: 90,
          classAvgNet: 14,
          academyAvgNet: 13.5,
          turkeyAvgNet: 12,
        },
      ],
      topicGaps: [],
      difficultyMetrics: [],
      optionDistribution: {},
      errorBreakdown: {},
      questionDetails: [],
      historicalTrend: [],
      projectedScore: 90,
      projectedNet: 18,
    },
    academyName: 'Doğruluk Akademi Merkez',
    gradeProfile: g5,
    templateMode: 'written-prep-20',
  });

  assert.ok(msg20.includes('20 Soruluk Yazılıya Hazırlık'));
  assert.ok(msg20.includes('5. Sınıf'));
  assert.equal(msg20.includes('TYT'), false);

  const customApplied = applyCustomParentTemplate({
    templateBody: DEFAULT_CUSTOM_PARENT_TEMPLATES[0].body,
    analysis: {
      studentName: 'Elif Kaya',
      studentNumber: '31570115',
      classroom: '5-A',
      examTitle: '5. Sınıf Yazılı',
      gradeId: '5',
      penaltyDivisor: 3,
      totalQuestions: 20,
      totalCorrect: 18,
      totalWrong: 2,
      totalBlank: 0,
      totalNet: 17.33,
      estimatedScore: 86.7,
      maxScore: 100,
      percentile: 90,
      classRank: 2,
      classSize: 24,
      academyRank: 3,
      academySize: 90,
      subjectMetrics: [],
      topicGaps: [],
      difficultyMetrics: [],
      optionDistribution: {},
      errorBreakdown: {},
      questionDetails: [],
      historicalTrend: [],
      projectedScore: 90,
      projectedNet: 18,
    },
    academyName: 'Doğruluk Akademi Merkez',
    gradeProfile: g5,
  });

  assert.ok(customApplied.includes('Elif Kaya'));
  assert.ok(customApplied.includes('17.33'));
  assert.equal(customApplied.includes('{ogrenci}'), false);
});
