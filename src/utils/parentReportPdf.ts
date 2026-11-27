import { getGradeProfile } from '../data/curriculum';
import {
  DifficultyMetric,
  ExamAnalysisResult,
  GradeProfile,
  OpenEndedPaperAnalysis,
  TopicGapMetric,
  WeeklyPerformanceStatus,
} from '../types/academy';
import {
  buildStudentGrowthChartData,
  GrowthCheckpointPoint,
} from './reportsGrowthChart';
import {
  NextStudySessionSummary,
  normalizeClassroomForGrade,
  resolveReportCardDevelopmentStatus,
  sanitizeExamLabelForGrade,
} from './weeklyAnalysis';

export interface ParentReportSubjectRow {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  net: number;
  academyAvgNet: number;
  turkeyAvgNet: number;
  accuracyPct: number;
  statusLabel: string;
}

export interface ParentReportTopicRow {
  subject: string;
  topic: string;
  gainCode: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  masteryPct: number;
  status: TopicGapMetric['status'];
}

export interface ParentReportData {
  institutionName: string;
  institutionCode8: string;
  examDate: string;
  gradeShortLabel: string;
  gradeLabel: string;
  penaltyRuleText: string;
  dataModeLabel:
    | 'Canlı Optik Değerlendirme'
    | '10 Soruluk Açık Uçlu Değerlendirme'
    | 'Dönemsel Ön İzleme';
  studentName: string;
  studentNumber: string;
  classroom: string;
  examTitle: string;
  developmentStatus: WeeklyPerformanceStatus;
  metrics: {
    totalQuestions: number;
    totalCorrect: number;
    totalWrong: number;
    totalBlank: number;
    totalNet: number;
    estimatedScore: number;
    maxScore: number;
    successPct: number;
    academyRank: number;
    academySize: number;
    classRank: number;
    classSize: number;
    percentile: number;
    projectedNet: number;
    projectedScore: number;
    targetNet: number;
    targetScore: number;
    netDelta: number;
    scoreDelta: number;
  };
  subjectRows: ParentReportSubjectRow[];
  trendSeries: GrowthCheckpointPoint[];
  prioritizedTopics: ParentReportTopicRow[];
  difficultyMetrics: DifficultyMetric[];
  errorDistribution: Array<{ label: string; count: number; pct: number }>;
  nextStudySession: {
    scheduled: boolean;
    summaryLine: string;
    detailLine: string;
  };
  parentNote: string;
  homeActionPlan: string[];
  strongestSubject: string;
  weakestSubject: string;
  safeFilename: string;
}

function resolveSubjectStatusLabel(accuracyPct: number): string {
  if (accuracyPct >= 80) return 'Çok İyi';
  if (accuracyPct >= 62) return 'İyi';
  if (accuracyPct >= 45) return 'Destek Gerekli';
  return 'Öncelikli Tekrar';
}

function slugifyFileSegment(value: string): string {
  return value
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildParentInformationReportData(params: {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  institutionName: string;
  institutionCode8?: string;
  examDate?: string;
  hasLiveAnalysis?: boolean;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  nextStudyEvent?: NextStudySessionSummary | null;
  parentMessage?: string;
}): ParentReportData {
  const {
    analysis,
    gradeProfile,
    institutionName,
    institutionCode8 = '48291045',
    examDate = new Date().toLocaleDateString('tr-TR'),
    hasLiveAnalysis = true,
    openEndedAnalysis = null,
    nextStudyEvent = null,
    parentMessage,
  } = params;

  const effectiveProfile = getGradeProfile(analysis.gradeId ?? gradeProfile.id);
  const isOpenEndedMode = Boolean(!hasLiveAnalysis && openEndedAnalysis);
  const dataModeLabel: ParentReportData['dataModeLabel'] = hasLiveAnalysis
    ? 'Canlı Optik Değerlendirme'
    : isOpenEndedMode
      ? '10 Soruluk Açık Uçlu Değerlendirme'
      : 'Dönemsel Ön İzleme';

  const rawStudentName = isOpenEndedMode
    ? openEndedAnalysis?.studentName || analysis.studentName || 'Öğrenci'
    : analysis.studentName || 'Kayıtlı Öğrenci';
  const studentNumber = isOpenEndedMode
    ? openEndedAnalysis?.studentNumber || analysis.studentNumber || '—'
    : analysis.studentNumber || '—';
  const rawClassroom = isOpenEndedMode
    ? openEndedAnalysis?.classroom || analysis.classroom
    : analysis.classroom;
  const classroom = normalizeClassroomForGrade(rawClassroom, effectiveProfile);
  const rawExamTitle = isOpenEndedMode
    ? openEndedAnalysis?.examTitle || analysis.examTitle
    : analysis.examTitle;
  const examTitle = sanitizeExamLabelForGrade(rawExamTitle, effectiveProfile);

  const penaltyRuleText =
    analysis.penaltyDivisor === 0
      ? 'Yanlış Doğruyu Götürmez (Net = Doğru)'
      : `${analysis.penaltyDivisor} Yanlış 1 Doğruyu Götürür`;

  const growthData = buildStudentGrowthChartData({
    analysis,
    gradeProfile: effectiveProfile,
    hasLiveAnalysis,
    periodMode: 'donemlik',
    metricMode: 'net',
    openEndedAnalysis,
  });

  const profileTotalQuestions = effectiveProfile.subjects.reduce(
    (sum, s) => sum + s.questionCount,
    0
  );

  const totalQuestions = isOpenEndedMode
    ? Math.max(1, openEndedAnalysis?.questionGrades.length || 10)
    : Math.max(1, analysis.totalQuestions || profileTotalQuestions);

  const openCorrect = isOpenEndedMode
    ? (openEndedAnalysis?.questionGrades.filter((q) => q.status === 'tam').length ?? 0)
    : analysis.totalCorrect;
  const openWrong = isOpenEndedMode
    ? (openEndedAnalysis?.questionGrades.filter((q) => q.status === 'yanlis').length ?? 0)
    : analysis.totalWrong;
  const openBlank = isOpenEndedMode
    ? (openEndedAnalysis?.questionGrades.filter((q) => q.status === 'bos').length ?? 0)
    : analysis.totalBlank;

  const totalCorrect = hasLiveAnalysis
    ? analysis.totalCorrect
    : isOpenEndedMode
      ? openCorrect
      : 0;
  const totalWrong = hasLiveAnalysis
    ? analysis.totalWrong
    : isOpenEndedMode
      ? openWrong
      : 0;
  const totalBlank = hasLiveAnalysis
    ? analysis.totalBlank
    : isOpenEndedMode
      ? openBlank
      : 0;

  const totalNet = hasLiveAnalysis
    ? Number(analysis.totalNet.toFixed(2))
    : isOpenEndedMode
      ? Number((((openEndedAnalysis?.successPct ?? 0) / 100) * totalQuestions).toFixed(2))
      : 0;

  const maxScore = isOpenEndedMode
    ? openEndedAnalysis?.maxTotalScore || 100
    : analysis.maxScore || effectiveProfile.maxScore;

  const estimatedScore = hasLiveAnalysis
    ? Number(analysis.estimatedScore.toFixed(1))
    : isOpenEndedMode
      ? Number((openEndedAnalysis?.totalScore ?? 0).toFixed(1))
      : 0;

  const successPct = isOpenEndedMode
    ? openEndedAnalysis?.successPct ?? 0
    : hasLiveAnalysis
      ? Math.max(0, Math.min(100, Math.round((totalNet / Math.max(1, totalQuestions)) * 100)))
      : 0;

  const completedCheckpoints = growthData.checkpoints.filter((c) => !c.isProjected);
  const prevCheckpoint =
    completedCheckpoints.length >= 2
      ? completedCheckpoints[completedCheckpoints.length - 2]
      : null;
  const latestCheckpoint = completedCheckpoints[completedCheckpoints.length - 1];

  const netDelta = prevCheckpoint && latestCheckpoint
    ? Number((latestCheckpoint.studentNet - prevCheckpoint.studentNet).toFixed(2))
    : 0;
  const scoreDelta = prevCheckpoint && latestCheckpoint
    ? Number((latestCheckpoint.studentScore - prevCheckpoint.studentScore).toFixed(1))
    : 0;

  const developmentStatus: WeeklyPerformanceStatus = isOpenEndedMode
    ? openEndedAnalysis?.developmentStatus || 'İyi Gelişim'
    : hasLiveAnalysis
      ? resolveReportCardDevelopmentStatus({
          ...analysis,
          totalNet,
          totalQuestions,
        })
      : 'Destek Gerekiyor';

  // Build subject rows
  let subjectRows: ParentReportSubjectRow[] = [];
  if (hasLiveAnalysis && analysis.subjectMetrics.length > 0) {
    subjectRows = analysis.subjectMetrics.map((s) => ({
      subject: sanitizeExamLabelForGrade(s.subject, effectiveProfile),
      total: s.total,
      correct: s.correct,
      wrong: s.wrong,
      blank: s.blank,
      net: Number(s.net.toFixed(2)),
      academyAvgNet: Number(s.academyAvgNet.toFixed(2)),
      turkeyAvgNet: Number(s.turkeyAvgNet.toFixed(2)),
      accuracyPct: s.accuracyPct,
      statusLabel: resolveSubjectStatusLabel(s.accuracyPct),
    }));
  } else if (isOpenEndedMode && openEndedAnalysis && openEndedAnalysis.questionGrades.length > 0) {
    const grouped = new Map<
      string,
      { total: number; score: number; maxPoints: number; correct: number; wrong: number; blank: number }
    >();
    openEndedAnalysis.questionGrades.forEach((qg) => {
      const subjName = sanitizeExamLabelForGrade(qg.subject, effectiveProfile);
      const cur = grouped.get(subjName) ?? {
        total: 0,
        score: 0,
        maxPoints: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
      };
      cur.total += 1;
      cur.score += qg.score;
      cur.maxPoints += qg.maxPoints;
      if (qg.status === 'tam' || qg.status === 'kismi') cur.correct += 1;
      else if (qg.status === 'yanlis') cur.wrong += 1;
      else cur.blank += 1;
      grouped.set(subjName, cur);
    });
    subjectRows = Array.from(grouped.entries()).map(([subject, g]) => {
      const acc = g.maxPoints > 0 ? Math.round((g.score / g.maxPoints) * 100) : 0;
      const net = Number(((acc / 100) * g.total).toFixed(2));
      return {
        subject,
        total: g.total,
        correct: g.correct,
        wrong: g.wrong,
        blank: g.blank,
        net,
        academyAvgNet: Number((g.total * 0.65).toFixed(2)),
        turkeyAvgNet: Number((g.total * 0.56).toFixed(2)),
        accuracyPct: acc,
        statusLabel: resolveSubjectStatusLabel(acc),
      };
    });
  } else {
    subjectRows = growthData.subjectBreakdown.map((sb) => ({
      subject: sanitizeExamLabelForGrade(sb.subject, effectiveProfile),
      total: sb.total,
      correct: 0,
      wrong: 0,
      blank: 0,
      net: 0,
      academyAvgNet: 0,
      turkeyAvgNet: 0,
      accuracyPct: 0,
      statusLabel: 'Deneme Bekleniyor',
    }));
  }

  const sortedSubjects = [...subjectRows].sort((a, b) => b.accuracyPct - a.accuracyPct);
  const isSingleSubject = subjectRows.length === 1;
  const strongestSubject = hasLiveAnalysis || isOpenEndedMode ? (sortedSubjects[0]?.subject || 'Türkçe') : '—';
  const weakestSubject =
    hasLiveAnalysis || isOpenEndedMode
      ? isSingleSubject
        ? sortedSubjects[0]?.subject || strongestSubject
        : sortedSubjects[sortedSubjects.length - 1]?.subject || 'Matematik'
      : '—';

  // Prioritized topics (weakest mastery first)
  let prioritizedTopics: ParentReportTopicRow[] = [];
  if (hasLiveAnalysis && analysis.topicGaps.length > 0) {
    prioritizedTopics = [...analysis.topicGaps]
      .sort((a, b) => a.masteryPct - b.masteryPct || b.wrong + b.blank - (a.wrong + a.blank))
      .slice(0, 8)
      .map((t) => ({
        subject: sanitizeExamLabelForGrade(t.subject, effectiveProfile),
        topic: sanitizeExamLabelForGrade(t.topic, effectiveProfile),
        gainCode: t.gainCode,
        total: t.total,
        correct: t.correct,
        wrong: t.wrong,
        blank: t.blank,
        masteryPct: t.masteryPct,
        status: t.status,
      }));
  } else {
    prioritizedTopics = [];
  }

  const difficultyMetrics: DifficultyMetric[] =
    hasLiveAnalysis && analysis.difficultyMetrics && analysis.difficultyMetrics.length > 0
      ? analysis.difficultyMetrics
      : [
          { difficulty: 'Kolay', total: 0, correct: 0, wrong: 0, blank: 0, successPct: 0 },
          { difficulty: 'Orta', total: 0, correct: 0, wrong: 0, blank: 0, successPct: 0 },
          { difficulty: 'Zor', total: 0, correct: 0, wrong: 0, blank: 0, successPct: 0 },
        ];

  const errEntries = hasLiveAnalysis ? Object.entries(analysis.errorBreakdown || {}) : [];
  const errDenom = Math.max(1, totalWrong + totalBlank);
  const errorDistribution =
    hasLiveAnalysis && errEntries.length > 0
      ? errEntries.slice(0, 4).map(([label, count]) => ({
          label,
          count,
          pct: Math.min(100, Math.round((count / errDenom) * 100)),
        }))
      : [
          { label: 'Bilgi Eksikliği', count: 0, pct: 0 },
          { label: 'Dikkat Hatası', count: 0, pct: 0 },
          { label: 'Çeldiriciye Düşme', count: 0, pct: 0 },
        ];

  const nextStudySession = nextStudyEvent
    ? {
        scheduled: true,
        summaryLine: sanitizeExamLabelForGrade(nextStudyEvent.summaryLine, effectiveProfile),
        detailLine: `${effectiveProfile.shortLabel} · ${normalizeClassroomForGrade(
          nextStudyEvent.classroom || classroom,
          effectiveProfile
        )} telafi ve soru çözüm oturumu`,
      }
    : {
        scheduled: false,
        summaryLine: 'Eğitim Takvimi üzerinden planlanacak',
        detailLine:
          hasLiveAnalysis || isOpenEndedMode
            ? `${weakestSubject} öncelikli haftalık 25 dk birebir telafi etüdü önerilmektedir.`
            : 'Kurumunuzda deneme sınavı değerlendirildiğinde etüt planı otomatik oluşturulur.',
      };

  const weakTopicNames = prioritizedTopics
    .filter((t) => t.status !== 'Tam Hakimiyet')
    .slice(0, 2)
    .map((t) => t.topic)
    .join(' ve ');

  const isFirstExamRecord = completedCheckpoints.length <= 1;

  const homeActionPlan = hasLiveAnalysis || isOpenEndedMode
    ? [
        `${weakestSubject} dersinde ${weakTopicNames || 'temel kazanım'} başlıkları için haftada 3 gün 25 dakikalık konu tekrarı ve 15 çözümlü soru planlayınız.`,
        `Dikkat hatasından kaçan soruların azaltılması için ev çalışmalarında son 5 dakikalık cevap kontrolü alışkanlığı kazandırınız.`,
        isSingleSubject
          ? `${strongestSubject} alanındaki kazanım hakimiyetini pekiştirmek için haftalık karma soru setleriyle tekrar yapınız.`
          : `${strongestSubject} alanındaki yüksek performansın korunması için haftalık yeni nesil soru setleriyle pekiştirme yapınız.`,
        nextStudySession.scheduled
          ? `Bir sonraki kurum etüdü (${nextStudySession.summaryLine}) öncesinde ilgili eksik kazanımlara kısa göz atılmasını destekleyiniz.`
          : `Kurum rehberlik birimiyle birlikte haftalık etüt ve deneme takip saatini netleştiriniz.`,
      ]
    : [
        'Kurumunuzda ilk deneme veya optik okuma değerlendirmesi tamamlandığında kişiselleştirilmiş çalışma planı otomatik oluşturulacaktır.',
        'Öğrenci panelinden öğrenci seçerek Optik Okuma veya 10 Soruluk Açık Uçlu değerlendirme başlatabilirsiniz.',
        'Eğitim Takvimi üzerinden yeni deneme sınavı ve telafi etütü tarihlerini ekleyebilirsiniz.',
        'Değerlendirme tamamlandıktan sonra veli bilgilendirme raporu güncel netlerle otomatik yenilenir.',
      ];

  const fallbackNote = isOpenEndedMode
    ? `Sayın Velimiz, ${rawStudentName} (${effectiveProfile.shortLabel} · ${classroom}) için yapılan 10 soruluk açık uçlu yazılı değerlendirmede ${estimatedScore} / ${maxScore} puan (%${successPct}) elde edilmiştir. ${openEndedAnalysis?.overallFeedback || ''}`
    : hasLiveAnalysis
      ? isSingleSubject
        ? `Sayın Velimiz, ${rawStudentName} (${effectiveProfile.shortLabel} · ${classroom}) ${isFirstExamRecord ? 'kurumdaki ilk deneme kaydı olan ' : ''}${examTitle} (${strongestSubject} · ${totalQuestions} soru) değerlendirmesinde ${totalCorrect} doğru, ${totalWrong} yanlış, ${totalBlank} boş ile ${totalNet.toFixed(2)} net (%${successPct} başarı) elde etmiştir. Odak kazanım olarak ${weakTopicNames || 'temel konu tekrarı'} planlanmıştır.`
        : `Sayın Velimiz, ${rawStudentName} (${effectiveProfile.shortLabel} · ${classroom}) ${isFirstExamRecord ? 'kurumdaki ilk deneme kaydı olan ' : ''}${examTitle} değerlendirmesinde ${totalQuestions} soruda ${totalNet.toFixed(2)} net ve ${estimatedScore.toFixed(1)} puan (%${successPct} başarı) ile "${developmentStatus}" düzeyindedir. En güçlü performans ${strongestSubject} dersinde görülürken; ${weakestSubject} alanında ${weakTopicNames || 'kazanım tekrarları'} ile hedeflenen ${growthData.summary.targetNet.toFixed(1)} net seviyesine ulaşması öngörülmektedir.`
      : `Sayın Velimiz, ${rawStudentName} (${effectiveProfile.shortLabel} · ${classroom}) için ${institutionName} bünyesinde henüz sınav değerlendirmesi yapılmamıştır (0.00 Net · 0.0 Puan). İlk deneme optik okuması yapıldığında güncel veriler bu raporda yer alacaktır.`;

  const sanitizedParentNote = sanitizeExamLabelForGrade(
    (parentMessage || '').trim() || fallbackNote,
    effectiveProfile
  );

  const safeSlug = slugifyFileSegment(rawStudentName) || 'ogrenci';
  const safeNo = slugifyFileSegment(studentNumber) || 'rapor';
  const resolvedAcademySize = hasLiveAnalysis ? Math.max(1, analysis.academySize || 1) : 0;
  const resolvedClassSize = hasLiveAnalysis ? Math.max(1, analysis.classSize || 1) : 0;

  return {
    institutionName,
    institutionCode8,
    examDate,
    gradeShortLabel: effectiveProfile.shortLabel,
    gradeLabel: effectiveProfile.label,
    penaltyRuleText,
    dataModeLabel,
    studentName: rawStudentName,
    studentNumber,
    classroom,
    examTitle,
    developmentStatus,
    metrics: {
      totalQuestions,
      totalCorrect,
      totalWrong,
      totalBlank,
      totalNet,
      estimatedScore,
      maxScore,
      successPct,
      academyRank: hasLiveAnalysis ? analysis.academyRank || 1 : 0,
      academySize: resolvedAcademySize,
      classRank: hasLiveAnalysis ? analysis.classRank || 1 : 0,
      classSize: resolvedClassSize,
      percentile: hasLiveAnalysis ? analysis.percentile ?? 50 : 0,
      projectedNet: hasLiveAnalysis ? Number((analysis.projectedNet || growthData.summary.targetNet).toFixed(1)) : 0,
      projectedScore: hasLiveAnalysis ? Number((analysis.projectedScore || growthData.summary.targetScore).toFixed(1)) : 0,
      targetNet: growthData.summary.targetNet,
      targetScore: growthData.summary.targetScore,
      netDelta,
      scoreDelta,
    },
    subjectRows,
    trendSeries: growthData.checkpoints,
    prioritizedTopics,
    difficultyMetrics,
    errorDistribution,
    nextStudySession,
    parentNote: sanitizedParentNote,
    homeActionPlan,
    strongestSubject,
    weakestSubject,
    safeFilename: `Veli-Bilgilendirme-Raporu-${safeSlug}-${safeNo}.pdf`,
  };
}
