import {
  ExamAnalysisResult,
  GradeProfile,
  OpenEndedPaperAnalysis,
} from '../types/academy';
import { sanitizeExamLabelForGrade } from './weeklyAnalysis';

export type GrowthPeriodMode = 'donemlik' | 'yillik';
export type GrowthMetricMode = 'net' | 'score';

export interface GrowthCheckpointPoint {
  id: string;
  label: string;
  shortLabel: string;
  examName: string;
  dateLabel: string;
  termLabel: string;
  studentNet: number;
  academyAvgNet: number;
  targetNet: number;
  studentScore: number;
  academyAvgScore: number;
  targetScore: number;
  netDeltaFromPrev: number;
  scoreDeltaFromPrev: number;
  statusNote: string;
  isCurrent: boolean;
  isProjected: boolean;
}

export interface SubjectAnalysisBarItem {
  subject: string;
  shortSubject: string;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  net: number;
  accuracyPct: number;
  targetPct: number;
  gapPct: number;
}

export interface ReportsGrowthChartDataset {
  periodMode: GrowthPeriodMode;
  metricMode: GrowthMetricMode;
  isLiveData: boolean;
  checkpoints: GrowthCheckpointPoint[];
  subjectBreakdown: SubjectAnalysisBarItem[];
  summary: {
    totalQuestions: number;
    maxScore: number;
    latestNet: number;
    latestScore: number;
    periodStartNet: number;
    periodStartScore: number;
    growthNet: number;
    growthScore: number;
    academyDiffNet: number;
    academyDiffScore: number;
    targetNet: number;
    targetScore: number;
    targetAttainmentPct: number;
    strongestSubject: string;
    prioritySubject: string;
    peakExamName: string;
    peakNet: number;
    peakScore: number;
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
  return Number(val.toFixed(1));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

function netToGradeScore(net: number, totalQuestions: number, profile: GradeProfile): number {
  const ratio = clamp(net / Math.max(1, totalQuestions), 0, 1);
  return round1(profile.baseScore + ratio * (profile.maxScore - profile.baseScore));
}

function shortenSubjectName(subject: string): string {
  const s = subject.trim();
  if (s.length <= 12) return s;
  if (/sosyal/i.test(s)) return 'Sosyal Bil.';
  if (/fen/i.test(s)) return 'Fen Bil.';
  if (/ink[ıi]lap/i.test(s)) return 'İnkılap';
  if (/din k[üu]lt/i.test(s)) return 'Din Kült.';
  if (/ingilizce/i.test(s)) return 'İngilizce';
  if (/edebiyat/i.test(s)) return 'Edebiyat';
  return `${s.slice(0, 10).trim()}…`;
}

export function buildStudentGrowthChartData(params: {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  hasLiveAnalysis: boolean;
  periodMode: GrowthPeriodMode;
  metricMode?: GrowthMetricMode;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
}): ReportsGrowthChartDataset {
  const {
    analysis,
    gradeProfile,
    hasLiveAnalysis,
    periodMode,
    metricMode = 'net',
    openEndedAnalysis = null,
  } = params;

  const profileTotalQuestions = gradeProfile.subjects.reduce(
    (sum, s) => sum + s.questionCount,
    0
  );
  const totalQuestions = Math.max(1, analysis.totalQuestions || profileTotalQuestions);
  const maxScore = gradeProfile.maxScore;

  const rawHistory = (analysis.historicalTrend ?? []).map((pt) => ({
    ...pt,
    examName: sanitizeExamLabelForGrade(pt.examName, gradeProfile),
  }));

  // Extract completed history points without any ungraded 0-value placeholder drop
  const completedHistory = hasLiveAnalysis
    ? rawHistory
    : rawHistory.slice(0, 4);

  const fallbackEndNet = round2(
    clamp(
      completedHistory[completedHistory.length - 1]?.net ?? totalQuestions * 0.62,
      0,
      totalQuestions
    )
  );
  const openEndedNet = openEndedAnalysis
    ? round2((clamp(openEndedAnalysis.successPct, 0, 100) / 100) * totalQuestions)
    : null;
  const openEndedScore = openEndedAnalysis
    ? netToGradeScore(openEndedNet ?? fallbackEndNet, totalQuestions, gradeProfile)
    : null;

  const currentNet = hasLiveAnalysis
    ? round2(clamp(analysis.totalNet, 0, totalQuestions))
    : openEndedNet !== null
      ? openEndedNet
      : round2(clamp(fallbackEndNet + totalQuestions * 0.035, 0, totalQuestions));

  const currentScore = hasLiveAnalysis
    ? round1(clamp(analysis.estimatedScore, profileMinScore(gradeProfile), maxScore))
    : openEndedScore !== null
      ? openEndedScore
      : netToGradeScore(currentNet, totalQuestions, gradeProfile);

  const isLiveData = Boolean(hasLiveAnalysis || openEndedAnalysis);

  const rawSubjects =
    analysis.subjectMetrics && analysis.subjectMetrics.length > 0
      ? analysis.subjectMetrics
      : gradeProfile.subjects.map((s) => ({
          subject: s.name,
          total: s.questionCount,
          correct: 0,
          wrong: 0,
          blank: 0,
          net: 0,
          accuracyPct: 0,
        }));

  if (!isLiveData) {
    return {
      periodMode,
      metricMode,
      isLiveData: false,
      checkpoints: [],
      subjectBreakdown: rawSubjects.map((subj) => ({
        subject: subj.subject,
        shortSubject: shortenSubjectName(subj.subject),
        correct: 0,
        wrong: 0,
        blank: 0,
        total: subj.total,
        net: 0,
        accuracyPct: 0,
        targetPct: 80,
        gapPct: -80,
      })),
      summary: {
        totalQuestions,
        maxScore,
        latestNet: 0,
        latestScore: 0,
        periodStartNet: 0,
        periodStartScore: 0,
        growthNet: 0,
        growthScore: 0,
        academyDiffNet: 0,
        academyDiffScore: 0,
        targetNet: 0,
        targetScore: 0,
        targetAttainmentPct: 0,
        strongestSubject: '—',
        prioritySubject: '—',
        peakExamName: 'Henüz sınav yok',
        peakNet: 0,
        peakScore: 0,
      },
    };
  }

  const targetNet = round2(
    clamp(Math.max(currentNet + totalQuestions * 0.08, totalQuestions * 0.78), 1, totalQuestions)
  );
  const targetScore = netToGradeScore(targetNet, totalQuestions, gradeProfile);

  const checkpoints: GrowthCheckpointPoint[] = [];

  if (completedHistory.length <= 1) {
    const onlyPt = completedHistory[0];
    const examLabel = onlyPt?.examName || '1. Deneme (İlk Kayıt)';
    const acadNet = round2(onlyPt?.academyAvgNet ?? currentNet);
    checkpoints.push({
      id: 'term-1',
      label: '1. Deneme (İlk Kayıt)',
      shortLabel: '1. İlk Deneme',
      examName: sanitizeExamLabelForGrade(
        openEndedAnalysis?.examTitle || analysis.examTitle || examLabel,
        gradeProfile
      ),
      dateLabel: onlyPt?.date || new Date().toLocaleDateString('tr-TR'),
      termLabel: 'İlk Deneme Kaydı',
      studentNet: currentNet,
      academyAvgNet: acadNet,
      targetNet,
      studentScore: currentScore,
      academyAvgScore: netToGradeScore(acadNet, totalQuestions, gradeProfile),
      targetScore,
      netDeltaFromPrev: 0,
      scoreDeltaFromPrev: 0,
      statusNote: 'Kurumumuzdaki İlk Deneme Kaydı',
      isCurrent: true,
      isProjected: false,
    });
  } else if (periodMode === 'donemlik') {
    const realItems = completedHistory.slice(-5);
    const termSeries = realItems.map((pt, idx) => {
      const isCurrent = idx === realItems.length - 1;
      const sNet = isCurrent ? currentNet : round2(clamp(pt.net, 0, totalQuestions));
      const aNet = round2(clamp(pt.academyAvgNet || sNet, 0, totalQuestions));
      const sScore = isCurrent
        ? currentScore
        : pt.score
          ? round1(clamp(pt.score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(sNet, totalQuestions, gradeProfile);
      return {
        id: `term-${idx + 1}`,
        label: isCurrent ? `${idx + 1}. Güncel Sınav` : `${idx + 1}. Deneme`,
        shortLabel: isCurrent ? 'Güncel' : `D${idx + 1}`,
        examName: isCurrent
          ? sanitizeExamLabelForGrade(
              openEndedAnalysis?.examTitle || analysis.examTitle,
              gradeProfile
            )
          : pt.examName,
        dateLabel: pt.date || new Date().toLocaleDateString('tr-TR'),
        termLabel: 'Aktif Dönem',
        studentNet: sNet,
        academyAvgNet: aNet,
        studentScore: sScore,
        statusNote: isCurrent ? 'Canlı Değerlendirme Sonucu' : 'Kayıtlı Sınav Sonucu',
        isCurrent,
        isProjected: false,
      };
    });

    termSeries.forEach((item, idx) => {
      const prev = idx > 0 ? termSeries[idx - 1] : null;
      checkpoints.push({
        ...item,
        targetNet,
        targetScore,
        academyAvgScore: netToGradeScore(item.academyAvgNet, totalQuestions, gradeProfile),
        netDeltaFromPrev: prev ? round2(item.studentNet - prev.studentNet) : 0,
        scoreDeltaFromPrev: prev ? round1(item.studentScore - prev.studentScore) : 0,
      });
    });
  } else {
    const baseHist0Net = completedHistory[0]?.net ?? currentNet;
    const baseHist1Net = completedHistory[1]?.net ?? currentNet;
    const spanToCurrent = currentNet - baseHist0Net;
    const academyBaseNet = round2(completedHistory[0]?.academyAvgNet ?? currentNet);
    // Annual progression when 2+ real exams exist
    const annualSpecs: Array<{
      id: string;
      label: string;
      shortLabel: string;
      examName: string;
      dateLabel: string;
      termLabel: string;
      net: number;
      acadNet: number;
      score?: number;
      statusNote: string;
      isCurrent: boolean;
      isProjected: boolean;
    }> = completedHistory.map((pt, idx) => {
      const isLast = idx === completedHistory.length - 1;
      return {
        id: `yr-real-${idx + 1}`,
        label: isLast ? `${idx + 1}. Güncel` : `${idx + 1}. Sınav`,
        shortLabel: `D${idx + 1}`,
        examName: pt.examName,
        dateLabel: pt.date || new Date().toLocaleDateString('tr-TR'),
        termLabel: idx < 2 ? '1. Dönem' : 'Aktif Dönem',
        net: isLast ? currentNet : pt.net,
        acadNet: pt.academyAvgNet || academyBaseNet,
        score: isLast ? currentScore : pt.score,
        statusNote: isLast ? 'Güncel Sınav Değerlendirmesi' : 'Kayıtlı Sınav',
        isCurrent: isLast,
        isProjected: false,
      };
    });
    if (annualSpecs.length >= 2) {
      void baseHist1Net;
      void spanToCurrent;
    }

    annualSpecs.forEach((spec, idx) => {
      const sNet = round2(clamp(spec.net, 0, totalQuestions));
      const aNet = round2(clamp(spec.acadNet, 0, totalQuestions));
      const sScore =
        spec.score !== undefined
          ? round1(clamp(spec.score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(sNet, totalQuestions, gradeProfile);
      const aScore = netToGradeScore(aNet, totalQuestions, gradeProfile);
      const prev = idx > 0 ? checkpoints[idx - 1] : null;
      checkpoints.push({
        id: spec.id,
        label: spec.label,
        shortLabel: spec.shortLabel,
        examName: spec.examName,
        dateLabel: spec.dateLabel,
        termLabel: spec.termLabel,
        studentNet: sNet,
        academyAvgNet: aNet,
        targetNet,
        studentScore: sScore,
        academyAvgScore: aScore,
        targetScore,
        netDeltaFromPrev: prev ? round2(sNet - prev.studentNet) : 0,
        scoreDeltaFromPrev: prev ? round1(sScore - prev.studentScore) : 0,
        statusNote: spec.statusNote,
        isCurrent: spec.isCurrent,
        isProjected: spec.isProjected,
      });
    });
  }

  // Subject breakdown (uses live metrics when available)
  const subjectBreakdown: SubjectAnalysisBarItem[] = rawSubjects.map((subj, idx) => {
    const previewAcc = clamp(74 - idx * 6, 42, 88);
    const accuracyPct = isLiveData ? clamp(subj.accuracyPct, 0, 100) : previewAcc;
    const net = isLiveData
      ? round2(subj.net)
      : round2((accuracyPct / 100) * subj.total);
    const correct = isLiveData
      ? subj.correct
      : Math.round((accuracyPct / 100) * subj.total);
    const wrong = isLiveData
      ? subj.wrong
      : Math.max(0, Math.min(subj.total - correct, Math.round(subj.total * 0.12)));
    const blank = isLiveData ? subj.blank : Math.max(0, subj.total - correct - wrong);
    const targetPct = 80;
    return {
      subject: subj.subject,
      shortSubject: shortenSubjectName(subj.subject),
      correct,
      wrong,
      blank,
      total: subj.total,
      net,
      accuracyPct,
      targetPct,
      gapPct: accuracyPct - targetPct,
    };
  });

  const sortedByAcc = [...subjectBreakdown].sort((a, b) => b.accuracyPct - a.accuracyPct);
  const strongestSubject = sortedByAcc[0]?.subject ?? 'Türkçe';
  const prioritySubject = sortedByAcc[sortedByAcc.length - 1]?.subject ?? 'Matematik';

  const currentPoint = checkpoints.find((c) => c.isCurrent) ?? checkpoints[checkpoints.length - 1];
  const firstPoint = checkpoints[0];
  const peakPoint = checkpoints.reduce(
    (best, cur) => (cur.studentNet > best.studentNet ? cur : best),
    checkpoints[0]
  );

  return {
    periodMode,
    metricMode,
    isLiveData,
    checkpoints,
    subjectBreakdown,
    summary: {
      totalQuestions,
      maxScore,
      latestNet: currentPoint.studentNet,
      latestScore: currentPoint.studentScore,
      periodStartNet: firstPoint.studentNet,
      periodStartScore: firstPoint.studentScore,
      growthNet: round2(currentPoint.studentNet - firstPoint.studentNet),
      growthScore: round1(currentPoint.studentScore - firstPoint.studentScore),
      academyDiffNet: round2(currentPoint.studentNet - currentPoint.academyAvgNet),
      academyDiffScore: round1(currentPoint.studentScore - currentPoint.academyAvgScore),
      targetNet,
      targetScore,
      targetAttainmentPct: clamp(
        Math.round((currentPoint.studentNet / Math.max(1, targetNet)) * 100),
        0,
        100
      ),
      strongestSubject,
      prioritySubject,
      peakExamName: peakPoint.examName,
      peakNet: peakPoint.studentNet,
      peakScore: peakPoint.studentScore,
    },
  };
}

function profileMinScore(profile: GradeProfile): number {
  return profile.baseScore;
}
