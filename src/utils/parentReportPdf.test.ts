import assert from 'node:assert/strict';
import test from 'node:test';
import { getGradeProfile } from '../data/curriculum';
import { OpenEndedPaperAnalysis } from '../types/academy';
import { buildAutoExamQuestions, evaluateOmrExam } from './examAnalysis';
import { buildParentInformationReportData } from './parentReportPdf';
import { NextStudySessionSummary } from './weeklyAnalysis';

test('buildParentInformationReportData builds grade-safe live parent report with next study session', () => {
  const grade5 = getGradeProfile('5');
  const questions = buildAutoExamQuestions('5');
  const answerKey: (string | null)[] = questions.map((q) => q.correctOption);
  const studentAnswers: (string | null)[] = questions.map((q, idx) =>
    idx % 5 === 0 ? 'B' : q.correctOption
  );

  const analysis = evaluateOmrExam({
    studentName: 'Elif Naz Demir',
    studentNumber: '20265018',
    classroom: '5-A',
    examTitle: '5. Sınıf TYT Denemesi 3',
    gradeId: '5',
    penaltyDivisor: grade5.penaltyDivisor,
    questions,
    answerKey,
    studentAnswers,
  });

  const nextEtut: NextStudySessionSummary = {
    eventId: 'etut-1',
    title: 'Matematik Kesirler Birebir Telafi Etüdü',
    date: '2026-11-22',
    dateFormatted: '22.11.2026',
    time: '16:30',
    classroom: '5-A',
    type: 'telafi-etutu',
    summaryLine: '22.11.2026 · Saat 16:30 — Matematik Kesirler Birebir Telafi Etüdü',
  };

  const report = buildParentInformationReportData({
    analysis,
    gradeProfile: grade5,
    institutionName: 'Doğruluk Akademi',
    institutionCode8: '48291045',
    examDate: '19.11.2026',
    hasLiveAnalysis: true,
    nextStudyEvent: nextEtut,
    parentMessage: 'Sayın Veli, 5. Sınıf TYT Denemesi sonucu ve sonraki etüt ektedir.',
  });

  assert.equal(report.dataModeLabel, 'Canlı Optik Değerlendirme');
  assert.equal(report.studentName, 'Elif Naz Demir');
  assert.equal(report.gradeShortLabel, '5. Sınıf');
  assert.equal(/\b(TYT|AYT|YKS)\b/i.test(report.examTitle), false);
  assert.equal(/\b(TYT|AYT|YKS)\b/i.test(report.parentNote), false);
  assert.ok(report.subjectRows.length >= 4);
  assert.equal(report.trendSeries.length, 1);
  assert.equal(report.trendSeries[0].label, '1. Deneme (İlk Kayıt)');
  assert.ok(report.prioritizedTopics.length > 0);
  assert.equal(report.nextStudySession.scheduled, true);
  assert.ok(report.nextStudySession.summaryLine.includes('22.11.2026'));
  assert.equal(report.homeActionPlan.length, 4);
  assert.equal(report.safeFilename, 'Veli-Bilgilendirme-Raporu-elif-naz-demir-20265018.pdf');
});

test('buildParentInformationReportData supports open-ended evaluation when no live OMR scan exists', () => {
  const grade7 = getGradeProfile('7');
  const questions = buildAutoExamQuestions('7');
  const answerKey: (string | null)[] = questions.map((q) => q.correctOption);
  const studentAnswers: (string | null)[] = questions.map((q) => q.correctOption);

  const analysis = evaluateOmrExam({
    studentName: 'Kerem Can Şahin',
    studentNumber: '20267042',
    classroom: '7-B',
    examTitle: '7. Sınıf Kazanım Denemesi',
    gradeId: '7',
    penaltyDivisor: grade7.penaltyDivisor,
    questions,
    answerKey,
    studentAnswers,
  });

  const openEnded: OpenEndedPaperAnalysis = {
    id: 'oe-1',
    studentName: 'Kerem Can Şahin',
    studentNumber: '20267042',
    classroom: '7-B',
    examTitle: '7. Sınıf 1. Dönem Açık Uçlu Yazılı',
    gradeId: '7',
    totalScore: 82,
    maxTotalScore: 100,
    successPct: 82,
    developmentStatus: 'Üstün Başarı',
    overallFeedback: 'İşlem adımları düzenli; sözel gerekçelendirme güçlü.',
    evaluatedAt: '2026-11-19T10:00:00Z',
    questionGrades: [
      {
        number: 1,
        subject: 'Matematik',
        score: 42,
        maxPoints: 50,
        status: 'tam',
        studentAnswerSummary: 'Tam çözüm',
        feedback: 'Doğru sonuç',
      },
      {
        number: 2,
        subject: 'Türkçe',
        score: 40,
        maxPoints: 50,
        status: 'kismi',
        studentAnswerSummary: 'Ana fikir doğru',
        feedback: 'Örnek cümle eklenebilir',
      },
    ],
  };

  const report = buildParentInformationReportData({
    analysis,
    gradeProfile: grade7,
    institutionName: 'Doğruluk Akademi',
    hasLiveAnalysis: false,
    openEndedAnalysis: openEnded,
  });

  assert.equal(report.dataModeLabel, '10 Soruluk Açık Uçlu Değerlendirme');
  assert.equal(report.metrics.estimatedScore, 82);
  assert.equal(report.metrics.maxScore, 100);
  assert.equal(report.metrics.successPct, 82);
  assert.equal(report.developmentStatus, 'Üstün Başarı');
  assert.equal(report.subjectRows.length, 2);
  assert.ok(report.parentNote.includes('82 / 100'));
});

test('buildParentInformationReportData returns graceful preview report before OMR upload', () => {
  const grade8 = getGradeProfile('8');
  const questions = buildAutoExamQuestions('8');
  const answerKey: (string | null)[] = questions.map((q) => q.correctOption);
  const studentAnswers: (string | null)[] = questions.map(() => null);

  const emptyAnalysis = evaluateOmrExam({
    studentName: '',
    studentNumber: '',
    classroom: '8-A',
    examTitle: '8. Sınıf LGS Deneme 1',
    gradeId: '8',
    penaltyDivisor: grade8.penaltyDivisor,
    questions,
    answerKey,
    studentAnswers,
  });

  const report = buildParentInformationReportData({
    analysis: emptyAnalysis,
    gradeProfile: grade8,
    institutionName: 'Doğruluk Akademi',
    hasLiveAnalysis: false,
    openEndedAnalysis: null,
  });

  assert.equal(report.dataModeLabel, 'Dönemsel Ön İzleme');
  assert.equal(report.metrics.totalNet, 0);
  assert.equal(report.metrics.estimatedScore, 0);
  assert.equal(report.metrics.successPct, 0);
  assert.ok(report.subjectRows.length > 0);
  assert.equal(report.trendSeries.length, 0);
  assert.equal(report.nextStudySession.scheduled, false);
  assert.ok(report.safeFilename.startsWith('Veli-Bilgilendirme-Raporu-'));
  assert.ok(report.safeFilename.endsWith('.pdf'));
});
