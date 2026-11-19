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
    const emptyCheckpoints: GrowthCheckpointPoint[] =
      periodMode === 'donemlik'
        ? [
            { id: 'term-1', label: '1. Deneme', shortLabel: 'D1', dateLabel: '—', termLabel: 'Aktif Dönem' },
            { id: 'term-2', label: '2. Deneme', shortLabel: 'D2', dateLabel: '—', termLabel: 'Aktif Dönem' },
            { id: 'term-3', label: '3. Deneme', shortLabel: 'D3', dateLabel: '—', termLabel: 'Aktif Dönem' },
            { id: 'term-4', label: '4. Deneme', shortLabel: 'D4', dateLabel: '—', termLabel: 'Aktif Dönem' },
            { id: 'term-5', label: '5. Deneme', shortLabel: 'D5', dateLabel: '—', termLabel: 'Aktif Dönem', isCurrent: true },
            { id: 'term-6', label: 'Dönem Hedefi', shortLabel: 'Hedef', dateLabel: '—', termLabel: 'Dönem Hedefi', isProjected: true },
          ].map((c) => ({
            id: c.id,
            label: c.label,
            shortLabel: c.shortLabel,
            examName: `${gradeProfile.shortLabel} · ${c.label}`,
            dateLabel: c.dateLabel,
            termLabel: c.termLabel,
            studentNet: 0,
            academyAvgNet: 0,
            targetNet: 0,
            studentScore: 0,
            academyAvgScore: 0,
            targetScore: 0,
            netDeltaFromPrev: 0,
            scoreDeltaFromPrev: 0,
            statusNote: 'Henüz deneme değerlendirilmedi',
            isCurrent: Boolean(c.isCurrent),
            isProjected: Boolean(c.isProjected),
          }))
        : [
            { id: 'yr-eyl', label: 'Eylül', shortLabel: 'Eyl', termLabel: '1. Dönem' },
            { id: 'yr-eki', label: 'Ekim', shortLabel: 'Eki', termLabel: '1. Dönem' },
            { id: 'yr-kas', label: 'Kasım', shortLabel: 'Kas', termLabel: '1. Dönem', isCurrent: true },
            { id: 'yr-ara', label: 'Aralık', shortLabel: 'Ara', termLabel: '1. Dönem' },
            { id: 'yr-oca', label: 'Ocak', shortLabel: 'Oca', termLabel: '1. Dönem' },
            { id: 'yr-sub', label: 'Şubat', shortLabel: 'Şub', termLabel: '2. Dönem' },
            { id: 'yr-mar', label: 'Mart', shortLabel: 'Mar', termLabel: '2. Dönem' },
            { id: 'yr-nis', label: 'Nisan', shortLabel: 'Nis', termLabel: '2. Dönem' },
            { id: 'yr-may', label: 'Mayıs', shortLabel: 'May', termLabel: '2. Dönem' },
            { id: 'yr-haz', label: 'Haziran', shortLabel: 'Haz', termLabel: 'Yıl Sonu', isProjected: true },
          ].map((m) => ({
            id: m.id,
            label: m.label,
            shortLabel: m.shortLabel,
            examName: `${gradeProfile.shortLabel} · ${m.label}`,
            dateLabel: '—',
            termLabel: m.termLabel,
            studentNet: 0,
            academyAvgNet: 0,
            targetNet: 0,
            studentScore: 0,
            academyAvgScore: 0,
            targetScore: 0,
            netDeltaFromPrev: 0,
            scoreDeltaFromPrev: 0,
            statusNote: 'Henüz deneme değerlendirilmedi',
            isCurrent: Boolean(m.isCurrent),
            isProjected: Boolean(m.isProjected),
          }));

    return {
      periodMode,
      metricMode,
      isLiveData: false,
      checkpoints: emptyCheckpoints,
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

  const baseHist0Net = completedHistory[0]?.net ?? round2(totalQuestions * 0.48);
  const baseHist1Net = completedHistory[1]?.net ?? round2(baseHist0Net + totalQuestions * 0.04);
  const baseHist2Net = completedHistory[2]?.net ?? round2(baseHist1Net + totalQuestions * 0.04);
  const baseHist3Net = completedHistory[3]?.net ?? round2(baseHist2Net + totalQuestions * 0.035);

  const academyBaseNet = round2(totalQuestions * 0.52);
  const targetNet = round2(
    clamp(Math.max(currentNet + totalQuestions * 0.08, totalQuestions * 0.78), 1, totalQuestions)
  );
  const targetScore = netToGradeScore(targetNet, totalQuestions, gradeProfile);

  const checkpoints: GrowthCheckpointPoint[] = [];

  if (periodMode === 'donemlik') {
    const termSeries: Array<{
      id: string;
      label: string;
      shortLabel: string;
      examName: string;
      dateLabel: string;
      termLabel: string;
      studentNet: number;
      academyAvgNet: number;
      studentScore: number;
      statusNote: string;
      isCurrent: boolean;
      isProjected: boolean;
    }> = [
      {
        id: 'term-1',
        label: '1. Deneme',
        shortLabel: 'D1',
        examName: completedHistory[0]?.examName || `${gradeProfile.shortLabel} 1. Dönem Deneme 1`,
        dateLabel: completedHistory[0]?.date || '15.09.2026',
        termLabel: 'Aktif Dönem',
        studentNet: round2(baseHist0Net),
        academyAvgNet: round2(completedHistory[0]?.academyAvgNet || academyBaseNet * 0.94),
        studentScore: completedHistory[0]?.score
          ? round1(clamp(completedHistory[0].score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(baseHist0Net, totalQuestions, gradeProfile),
        statusNote: 'Dönem Başlangıç Ölçümü',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'term-2',
        label: '2. Deneme',
        shortLabel: 'D2',
        examName: completedHistory[1]?.examName || `${gradeProfile.shortLabel} 1. Dönem Deneme 2`,
        dateLabel: completedHistory[1]?.date || '03.10.2026',
        termLabel: 'Aktif Dönem',
        studentNet: round2(baseHist1Net),
        academyAvgNet: round2(completedHistory[1]?.academyAvgNet || academyBaseNet * 0.98),
        studentScore: completedHistory[1]?.score
          ? round1(clamp(completedHistory[1].score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(baseHist1Net, totalQuestions, gradeProfile),
        statusNote: 'Konu Pekiştirme Aşaması',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'term-3',
        label: '3. Deneme',
        shortLabel: 'D3',
        examName: completedHistory[2]?.examName || `${gradeProfile.shortLabel} Ara Değerlendirme`,
        dateLabel: completedHistory[2]?.date || '24.10.2026',
        termLabel: 'Aktif Dönem',
        studentNet: round2(baseHist2Net),
        academyAvgNet: round2(completedHistory[2]?.academyAvgNet || academyBaseNet * 1.02),
        studentScore: completedHistory[2]?.score
          ? round1(clamp(completedHistory[2].score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(baseHist2Net, totalQuestions, gradeProfile),
        statusNote: 'Orta Dönem Yükselişi',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'term-4',
        label: '4. Deneme',
        shortLabel: 'D4',
        examName: completedHistory[3]?.examName || `${gradeProfile.shortLabel} Kazanım Tarama`,
        dateLabel: completedHistory[3]?.date || '08.11.2026',
        termLabel: 'Aktif Dönem',
        studentNet: round2(baseHist3Net),
        academyAvgNet: round2(completedHistory[3]?.academyAvgNet || academyBaseNet * 1.05),
        studentScore: completedHistory[3]?.score
          ? round1(clamp(completedHistory[3].score, profileMinScore(gradeProfile), maxScore))
          : netToGradeScore(baseHist3Net, totalQuestions, gradeProfile),
        statusNote: 'Hız & Çeldirici Kontrolü',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'term-5',
        label: isLiveData ? 'Güncel Sınav' : '5. Deneme',
        shortLabel: isLiveData ? 'Güncel' : 'D5',
        examName: isLiveData
          ? sanitizeExamLabelForGrade(
              openEndedAnalysis?.examTitle || analysis.examTitle,
              gradeProfile
            )
          : `${gradeProfile.shortLabel} Dönem Değerlendirme (Önizleme)`,
        dateLabel: new Date().toLocaleDateString('tr-TR'),
        termLabel: 'Aktif Dönem',
        studentNet: currentNet,
        academyAvgNet: round2(clamp(academyBaseNet * 1.08, 0, totalQuestions)),
        studentScore: currentScore,
        statusNote: isLiveData ? 'Canlı Değerlendirme Sonucu' : 'Optik Okuma Önizlemesi',
        isCurrent: true,
        isProjected: false,
      },
      {
        id: 'term-6',
        label: 'Dönem Hedefi',
        shortLabel: 'Hedef',
        examName: `${gradeProfile.shortLabel} Dönem Sonu Hedefi`,
        dateLabel: 'Ocak 2027',
        termLabel: 'Dönem Hedefi',
        studentNet: round2(
          clamp(
            Math.max(currentNet + totalQuestions * 0.05, analysis.projectedNet || currentNet + 3),
            0,
            totalQuestions
          )
        ),
        academyAvgNet: round2(clamp(academyBaseNet * 1.12, 0, totalQuestions)),
        studentScore: netToGradeScore(
          clamp(
            Math.max(currentNet + totalQuestions * 0.05, analysis.projectedNet || currentNet + 3),
            0,
            totalQuestions
          ),
          totalQuestions,
          gradeProfile
        ),
        statusNote: 'Etüt & Tekrar Hedef Projeksiyonu',
        isCurrent: false,
        isProjected: true,
      },
    ];

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
    // Full 10-month academic year schedule (Eylül - Haziran)
    const spanToCurrent = currentNet - baseHist0Net;
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
    }> = [
      {
        id: 'yr-eyl',
        label: 'Eylül',
        shortLabel: 'Eyl',
        examName: `${gradeProfile.shortLabel} Tanı & Seviye Belirleme`,
        dateLabel: '15.09.2026',
        termLabel: '1. Dönem',
        net: baseHist0Net,
        acadNet: academyBaseNet * 0.92,
        score: completedHistory[0]?.score,
        statusNote: 'Yıl Başlangıcı Hazırbulunuşluk',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'yr-eki',
        label: 'Ekim',
        shortLabel: 'Eki',
        examName: `${gradeProfile.shortLabel} 1. Ünite Tarama`,
        dateLabel: '18.10.2026',
        termLabel: '1. Dönem',
        net: baseHist1Net,
        acadNet: academyBaseNet * 0.96,
        score: completedHistory[1]?.score,
        statusNote: 'Temel Kazanım Oturumu',
        isCurrent: false,
        isProjected: false,
      },
      {
        id: 'yr-kas',
        label: 'Kasım',
        shortLabel: 'Kas',
        examName: isLiveData
          ? sanitizeExamLabelForGrade(
              openEndedAnalysis?.examTitle || analysis.examTitle,
              gradeProfile
            )
          : `${gradeProfile.shortLabel} 1. Dönem Ara Denemesi`,
        dateLabel: new Date().toLocaleDateString('tr-TR'),
        termLabel: '1. Dönem',
        net: currentNet,
        acadNet: academyBaseNet * 1.0,
        score: currentScore,
        statusNote: isLiveData ? 'Güncel Sınav Değerlendirmesi' : 'Aktif Dönem Ölçümü',
        isCurrent: true,
        isProjected: false,
      },
      {
        id: 'yr-ara',
        label: 'Aralık',
        shortLabel: 'Ara',
        examName: `${gradeProfile.shortLabel} Kış Kazanım Denemesi`,
        dateLabel: '19.12.2026',
        termLabel: '1. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.02, spanToCurrent * 0.2), 0, totalQuestions),
        acadNet: academyBaseNet * 1.03,
        statusNote: '1. Dönem Pekiştirme',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-oca',
        label: 'Ocak',
        shortLabel: 'Oca',
        examName: `${gradeProfile.shortLabel} 1. Dönem Finali`,
        dateLabel: '16.01.2027',
        termLabel: '1. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.04, spanToCurrent * 0.35), 0, totalQuestions),
        acadNet: academyBaseNet * 1.06,
        statusNote: 'Yarıyıl Karne Değerlendirmesi',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-sub',
        label: 'Şubat',
        shortLabel: 'Şub',
        examName: `${gradeProfile.shortLabel} 2. Dönem Başlangıç`,
        dateLabel: '20.02.2027',
        termLabel: '2. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.055, spanToCurrent * 0.48), 0, totalQuestions),
        acadNet: academyBaseNet * 1.08,
        statusNote: 'Sömestr Kampı Etkisi',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-mar',
        label: 'Mart',
        shortLabel: 'Mar',
        examName: `${gradeProfile.shortLabel} Türkiye Geneli Prova 1`,
        dateLabel: '20.03.2027',
        termLabel: '2. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.075, spanToCurrent * 0.62), 0, totalQuestions),
        acadNet: academyBaseNet * 1.11,
        statusNote: 'Zaman Yönetimi & Hız Artışı',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-nis',
        label: 'Nisan',
        shortLabel: 'Nis',
        examName: `${gradeProfile.shortLabel} Ara Tatil Genel Tekrar`,
        dateLabel: '17.04.2027',
        termLabel: '2. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.095, spanToCurrent * 0.78), 0, totalQuestions),
        acadNet: academyBaseNet * 1.14,
        statusNote: 'Eksik Kazanımların Kapanışı',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-may',
        label: 'Mayıs',
        shortLabel: 'May',
        examName: `${gradeProfile.shortLabel} Türkiye Geneli Prova 2`,
        dateLabel: '15.05.2027',
        termLabel: '2. Dönem',
        net: clamp(currentNet + Math.max(totalQuestions * 0.115, spanToCurrent * 0.92), 0, totalQuestions),
        acadNet: academyBaseNet * 1.17,
        statusNote: 'Sınav Provası & Zirve Form',
        isCurrent: false,
        isProjected: true,
      },
      {
        id: 'yr-haz',
        label: 'Haziran',
        shortLabel: 'Haz',
        examName: `${gradeProfile.shortLabel} Yıl Sonu Genel Final`,
        dateLabel: '05.06.2027',
        termLabel: 'Yıl Sonu',
        net: clamp(
          Math.max(
            targetNet,
            currentNet + Math.max(totalQuestions * 0.135, spanToCurrent * 1.05)
          ),
          0,
          totalQuestions
        ),
        acadNet: academyBaseNet * 1.2,
        statusNote: 'Yıllık Gelişim Hedef Tamamlama',
        isCurrent: false,
        isProjected: true,
      },
    ];

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
