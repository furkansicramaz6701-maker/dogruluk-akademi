import {
  CoachingFocusArea,
  CoachingFocusPriority,
  CoachingInsightsReport,
  CoachingTrendDirection,
  ExamAnalysisResult,
  GradeProfile,
  HistoricalExamPoint,
  MultiExamTrendSummary,
  PenaltyDivisor,
  TopicGapMetric,
  WeeklyStudentScore,
} from '../types/academy';

export function extractExtraExamsFromWeekly(params: {
  weeklyEntries?: WeeklyStudentScore[];
  studentNumber?: string;
  studentName?: string;
  penaltyDivisor: PenaltyDivisor;
  questionCount: number;
  gradeProfile: GradeProfile;
}): HistoricalExamPoint[] {
  const list = params.weeklyEntries ?? [];
  if (list.length === 0) return [];
  const normNo = (params.studentNumber ?? '').trim();
  const normName = (params.studentName ?? '').trim().toLocaleLowerCase('tr-TR');
  const match = list.find(
    (row) =>
      (normNo && row.studentNumber8 === normNo) ||
      (normName && row.studentName.trim().toLocaleLowerCase('tr-TR') === normName)
  );
  if (!match) return [];

  const qCount = Math.max(1, params.questionCount || 20);
  const calcNet = (c: number, w: number) =>
    params.penaltyDivisor === 0
      ? c
      : Math.max(0, c - w / params.penaltyDivisor);
  const calcScore = (net: number) =>
    Number(
      Math.min(
        params.gradeProfile.maxScore,
        params.gradeProfile.baseScore +
          (net / qCount) * (params.gradeProfile.maxScore - params.gradeProfile.baseScore)
      ).toFixed(1)
    );

  const kts1Net = Number(calcNet(match.kts1Correct, match.kts1Wrong).toFixed(2));
  const kts2Net = Number(calcNet(match.kts2Correct, match.kts2Wrong).toFixed(2));

  const points: HistoricalExamPoint[] = [];
  if (match.kts1Correct + match.kts1Wrong + match.kts1Blank > 0) {
    points.push({
      examName: 'Haftalık KTS-1',
      date: '1. Ölçüm',
      net: kts1Net,
      score: calcScore(kts1Net),
      academyAvgNet: Number((qCount * 0.55).toFixed(2)),
    });
  }
  if (match.kts2Correct + match.kts2Wrong + match.kts2Blank > 0) {
    points.push({
      examName: 'Haftalık KTS-2',
      date: '2. Ölçüm',
      net: kts2Net,
      score: calcScore(kts2Net),
      academyAvgNet: Number((qCount * 0.58).toFixed(2)),
    });
  }
  return points;
}

export function buildMultiExamTrendSummary(
  analysis: ExamAnalysisResult,
  extraHistory: HistoricalExamPoint[] = []
): MultiExamTrendSummary {
  const combined: HistoricalExamPoint[] = [];
  const seen = new Set<string>();

  const pushUnique = (pt: HistoricalExamPoint) => {
    const key = `${pt.examName.trim().toLocaleLowerCase('tr-TR')}::${pt.date.trim()}`;
    if (seen.has(key)) return;
    seen.add(key);
    combined.push(pt);
  };

  const historyPoints = analysis.historicalTrend ?? [];
  const lastPoint = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1] : null;
  const isCurrentMarker =
    lastPoint !== null &&
    (lastPoint.examName.includes('Son Deneme') ||
      lastPoint.examName.includes('(Güncel)') ||
      lastPoint.examName.includes('(İlk Kayıt)'));
  const currentPoint = isCurrentMarker ? lastPoint : null;
  const priorHistory = currentPoint ? historyPoints.slice(0, -1) : historyPoints;

  priorHistory.forEach(pushUnique);
  extraHistory.forEach(pushUnique);
  if (currentPoint) {
    pushUnique(currentPoint);
  }

  if (combined.length === 0) {
    return {
      exams: [],
      examCount: 0,
      firstExam: null,
      latestExam: null,
      netDelta: 0,
      scoreDelta: 0,
      recentStepNetDelta: 0,
      avgGapVsAcademy: 0,
      momentum: 'dengeli',
    };
  }

  const firstExam = combined[0];
  const latestExam = combined[combined.length - 1];
  const prevExam = combined.length >= 2 ? combined[combined.length - 2] : latestExam;

  const netDelta = Number((latestExam.net - firstExam.net).toFixed(2));
  const scoreDelta = Number((latestExam.score - firstExam.score).toFixed(1));
  const recentStepNetDelta = Number((latestExam.net - prevExam.net).toFixed(2));

  const avgGapVsAcademy = Number(
    (
      combined.reduce((sum, pt) => sum + (pt.net - pt.academyAvgNet), 0) /
      combined.length
    ).toFixed(2)
  );

  let momentum: CoachingTrendDirection = 'dengeli';
  if (netDelta >= 1.5 || recentStepNetDelta >= 1.2) {
    momentum = 'yukselis';
  } else if (netDelta <= -1.5 || recentStepNetDelta <= -1.5) {
    momentum = 'destek-gerekli';
  }

  return {
    exams: combined,
    examCount: combined.length,
    firstExam,
    latestExam,
    netDelta,
    scoreDelta,
    recentStepNetDelta,
    avgGapVsAcademy,
    momentum,
  };
}

export function prioritizeTopicGapsForCoaching(
  topicGaps: TopicGapMetric[],
  limit = 8
): TopicGapMetric[] {
  return [...topicGaps]
    .filter((t) => t.status !== 'Tam Hakimiyet' || t.wrong + t.blank > 0)
    .sort((a, b) => {
      if (a.masteryPct !== b.masteryPct) return a.masteryPct - b.masteryPct;
      return b.wrong + b.blank - (a.wrong + a.blank);
    })
    .slice(0, limit);
}

export function buildCoachingInsightsPayload(
  analysis: ExamAnalysisResult,
  gradeProfile: GradeProfile,
  extraHistory: HistoricalExamPoint[] = []
) {
  const trendSummary = buildMultiExamTrendSummary(analysis, extraHistory);
  const prioritizedTopicGaps = prioritizeTopicGapsForCoaching(analysis.topicGaps, 8);

  return {
    student: {
      name: analysis.studentName || 'Öğrenci',
      classroom: analysis.classroom || gradeProfile.shortLabel,
      gradeLabel: gradeProfile.shortLabel,
      examTitle: analysis.examTitle,
    },
    currentMetrics: {
      totalQuestions: analysis.totalQuestions,
      totalCorrect: analysis.totalCorrect,
      totalWrong: analysis.totalWrong,
      totalBlank: analysis.totalBlank,
      totalNet: analysis.totalNet,
      estimatedScore: analysis.estimatedScore,
      maxScore: analysis.maxScore,
      projectedNet: analysis.projectedNet,
      projectedScore: analysis.projectedScore,
    },
    multiExamTrend: {
      examCount: trendSummary.examCount,
      netDelta: trendSummary.netDelta,
      scoreDelta: trendSummary.scoreDelta,
      recentStepNetDelta: trendSummary.recentStepNetDelta,
      avgGapVsAcademy: trendSummary.avgGapVsAcademy,
      momentum: trendSummary.momentum,
      exams: trendSummary.exams,
    },
    subjectMetrics: analysis.subjectMetrics.map((s) => ({
      subject: s.subject,
      total: s.total,
      correct: s.correct,
      wrong: s.wrong,
      blank: s.blank,
      net: s.net,
      accuracyPct: s.accuracyPct,
      academyAvgNet: s.academyAvgNet,
    })),
    topicGaps: prioritizedTopicGaps.map((t) => ({
      subject: t.subject,
      topic: t.topic,
      gainCode: t.gainCode,
      total: t.total,
      correct: t.correct,
      wrong: t.wrong,
      blank: t.blank,
      masteryPct: t.masteryPct,
      status: t.status,
    })),
    errorBreakdown: analysis.errorBreakdown,
  };
}

function normalizeDirection(val: unknown): CoachingTrendDirection {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'yukselis' || s === 'yükseliş' || s === 'rising') return 'yukselis';
  if (s === 'destek-gerekli' || s === 'destek' || s === 'declining') return 'destek-gerekli';
  return 'dengeli';
}

function normalizePriority(val: unknown): CoachingFocusPriority {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'yuksek' || s === 'yüksek' || s === 'high') return 'yuksek';
  if (s === 'pekistirme' || s === 'pekiştirme' || s === 'low') return 'pekistirme';
  return 'orta';
}

export function normalizeCoachingInsightsResponse(
  raw: unknown,
  fallbackTopicGaps: TopicGapMetric[] = []
): CoachingInsightsReport {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawAreas = Array.isArray(obj.focusAreas) ? obj.focusAreas : [];

  const focusAreas: CoachingFocusArea[] = rawAreas
    .filter((item) => item && typeof item === 'object')
    .slice(0, 4)
    .map((item, idx) => {
      const rec = item as Record<string, unknown>;
      const fallbackGap = fallbackTopicGaps[idx];
      const rawHours = Number(rec.weeklyHours);
      const weeklyHours =
        Number.isFinite(rawHours) && rawHours > 0
          ? Number(Math.min(15, Math.max(0.5, rawHours)).toFixed(1))
          : 2;
      return {
        subject:
          typeof rec.subject === 'string' && rec.subject.trim()
            ? rec.subject.trim()
            : fallbackGap?.subject ?? 'Genel',
        topic:
          typeof rec.topic === 'string' && rec.topic.trim()
            ? rec.topic.trim()
            : fallbackGap?.topic ?? 'Temel Kazanımlar',
        priority: normalizePriority(rec.priority),
        reason:
          typeof rec.reason === 'string' && rec.reason.trim()
            ? rec.reason.trim()
            : 'Konu hakimiyet oranını yükseltmek için tekrar önerilir.',
        recommendedAction:
          typeof rec.recommendedAction === 'string' && rec.recommendedAction.trim()
            ? rec.recommendedAction.trim()
            : 'Kazanım özeti ardından 20 soruluk süreli konu testi çözün.',
        weeklyHours,
      };
    });

  return {
    headline:
      typeof obj.headline === 'string' && obj.headline.trim()
        ? obj.headline.trim()
        : 'Çoklu Deneme Performans & Konu Odağı Değerlendirmesi',
    trendDirection: normalizeDirection(obj.trendDirection),
    trendSummary:
      typeof obj.trendSummary === 'string' && obj.trendSummary.trim()
        ? obj.trendSummary.trim()
        : 'Öğrencinin çoklu deneme net gelişimi ve konu kazanım dağılımı analiz edildi.',
    strengthsHighlight:
      typeof obj.strengthsHighlight === 'string' && obj.strengthsHighlight.trim()
        ? obj.strengthsHighlight.trim()
        : 'Güçlü olduğu derslerdeki başarı ivmesini düzenli branş denemeleriyle koruması önerilir.',
    focusAreas,
    weeklyCoachNote:
      typeof obj.weeklyCoachNote === 'string' && obj.weeklyCoachNote.trim()
        ? obj.weeklyCoachNote.trim()
        : typeof obj.trendSummary === 'string' && obj.trendSummary.trim()
          ? obj.trendSummary.trim()
          : 'Haftalık çalışma planında öncelikli konu açıklarına odaklanılması hedeflenmektedir.',
    generatedAt: new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export interface QuickShareSummaryResult {
  text: string;
  strengthsText: string;
  focusAreaText: string;
  usedGeminiInsights: boolean;
}

export function buildQuickShareWhatsAppSummary(params: {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  academyName: string;
  coachingInsights?: CoachingInsightsReport | null;
}): QuickShareSummaryResult {
  const { analysis, gradeProfile, academyName, coachingInsights } = params;
  const studentDisplay = analysis.studentName?.trim() || 'Öğrenci';
  const classroomDisplay = analysis.classroom?.trim() || gradeProfile.shortLabel;
  const examDisplay = analysis.examTitle?.trim() || gradeProfile.examName;
  const successPct =
    analysis.totalQuestions > 0
      ? Math.round((Math.max(0, analysis.totalNet) / analysis.totalQuestions) * 100)
      : 0;

  const sortedSubjects = [...analysis.subjectMetrics].sort(
    (a, b) => b.accuracyPct - a.accuracyPct || b.net - a.net
  );
  const topSubject = sortedSubjects[0];
  const fallbackStrength = topSubject
    ? `${topSubject.subject} (%${topSubject.accuracyPct} doğruluk · ${topSubject.net.toFixed(1)}/${topSubject.total} net)`
    : `${analysis.totalCorrect} doğru yanıt ile istikrarlı performans`;

  const strengthsText =
    coachingInsights?.strengthsHighlight?.trim() || fallbackStrength;

  const prioritizedGaps = prioritizeTopicGapsForCoaching(analysis.topicGaps, 2);
  let focusAreaText: string;
  if (coachingInsights && coachingInsights.focusAreas.length > 0) {
    const primary = coachingInsights.focusAreas[0];
    const secondary = coachingInsights.focusAreas[1];
    focusAreaText = `${primary.subject} — ${primary.topic} (${primary.weeklyHours} saat/hf): ${primary.recommendedAction}${
      secondary ? ` | Ek Odak: ${secondary.subject} — ${secondary.topic}` : ''
    }`;
  } else if (prioritizedGaps.length > 0) {
    const gap = prioritizedGaps[0];
    focusAreaText = `${gap.subject} — ${gap.topic} (%${gap.masteryPct} hakimiyet): Kazanım tekrarı ve 20 soruluk süreli pekiştirme testi önerilir.`;
  } else {
    const weakest = sortedSubjects[sortedSubjects.length - 1];
    focusAreaText = weakest
      ? `${weakest.subject} (%${weakest.accuracyPct} doğruluk): Hız ve dikkat odaklı branş denemesi önerilir.`
      : 'Düzenli günlük tekrar ve branş denemesi ile mevcut ivmenin korunması önerilir.';
  }

  const coachNote =
    coachingInsights?.weeklyCoachNote?.trim() ||
    `Mevcut çalışma ivmesiyle bir sonraki denemede ${analysis.projectedNet.toFixed(1)} net (${analysis.projectedScore.toFixed(1)} puan) hedeflenmektedir.`;

  const lines = [
    `*${academyName || 'Kurum Akademi'} — Hızlı Sınav Özeti*`,
    `Öğrenci: *${studentDisplay}* (${classroomDisplay} · ${gradeProfile.shortLabel})`,
    `Deneme: ${examDisplay}`,
    `Sonuç: *${analysis.totalNet.toFixed(2)} Net* (${analysis.totalCorrect}D / ${analysis.totalWrong}Y / ${analysis.totalBlank}B) · *${analysis.estimatedScore.toFixed(1)} Puan* (%${successPct})`,
    ``,
    `*Öne Çıkan Güçlü Yönler:*`,
    strengthsText,
    ``,
    `*Çalışma Odak Alanı (Coaching Insights):*`,
    focusAreaText,
    ``,
    `Koçluk Notu: ${coachNote}`,
  ];

  return {
    text: lines.join('\n'),
    strengthsText,
    focusAreaText,
    usedGeminiInsights: Boolean(coachingInsights),
  };
}

