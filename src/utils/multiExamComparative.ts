import { ExamAnalysisResult, OpenEndedPaperAnalysis } from '../types/academy';

export interface SubjectExamMetricPoint {
  studentNet: number;
  classAvgNet: number;
  studentPct: number;
  classAvgPct: number;
  total: number;
  deltaNet: number;
}

export interface MultiExamPoint {
  examIndex: number;
  examLabel: string;
  shortLabel: string;
  date: string;
  overallStudentNet: number;
  overallClassAvgNet: number;
  overallStudentPct: number;
  overallClassAvgPct: number;
  bySubject: Record<string, SubjectExamMetricPoint>;
}

export interface MultiExamChartSeriesPoint {
  examLabel: string;
  shortLabel: string;
  date: string;
  studentValue: number;
  classAvgValue: number;
  studentPct: number;
  classAvgPct: number;
  delta: number;
}

export interface MultiExamComparativeDataset {
  studentName: string;
  examPoints: MultiExamPoint[];
  subjectOptions: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function buildMultiExamComparativeDataset(params: {
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  isSamplePreview?: boolean;
}): MultiExamComparativeDataset {
  const { analysis, hasLiveAnalysis, openEndedAnalysis, isSamplePreview = false } = params;
  const totalQ = Math.max(1, analysis.totalQuestions);
  const subjectMetrics = analysis.subjectMetrics ?? [];
  const subjectOptions = subjectMetrics.map((s) => s.subject);

  if (!hasLiveAnalysis && !openEndedAnalysis && !isSamplePreview) {
    return {
      studentName: analysis.studentName || 'Öğrenci',
      examPoints: [],
      subjectOptions,
    };
  }

  const rawHistory = [...(analysis.historicalTrend ?? [])];
  if (isSamplePreview) {
    while (rawHistory.length < 5) {
      const first = rawHistory[0] ?? {
        examName: 'Deneme 1',
        date: 'Önceki',
        net: Math.max(0, round2(analysis.totalNet * 0.8)),
        score: Math.max(100, round1(analysis.estimatedScore * 0.88)),
        academyAvgNet: Math.max(0, round2(analysis.totalNet * 0.72)),
      };
      const factor = 0.88 - (4 - rawHistory.length) * 0.04;
      rawHistory.unshift({
        examName: `Deneme ${rawHistory.length + 1}`,
        date: 'Önceki',
        net: round2(Math.max(0, first.net * factor)),
        score: round1(Math.max(100, first.score * 0.94)),
        academyAvgNet: round2(Math.max(0, first.academyAvgNet * factor)),
      });
    }
  } else if (rawHistory.length === 0) {
    rawHistory.push({
      examName: '1. Deneme (İlk Kayıt)',
      date: new Date().toLocaleDateString('tr-TR'),
      net: hasLiveAnalysis
        ? analysis.totalNet
        : round2(((openEndedAnalysis?.successPct ?? 0) / 100) * totalQ),
      score: hasLiveAnalysis
        ? analysis.estimatedScore
        : openEndedAnalysis?.totalScore ?? 0,
      academyAvgNet: hasLiveAnalysis
        ? analysis.totalNet
        : round2(((openEndedAnalysis?.successPct ?? 0) / 100) * totalQ),
    });
  }

  const last5 = rawHistory.slice(-5);
  const currentTotalNet = hasLiveAnalysis
    ? analysis.totalNet
    : openEndedAnalysis
    ? round2((openEndedAnalysis.successPct / 100) * totalQ)
    : last5[last5.length - 1]?.net ?? 0;

  const currentOverallAvg =
    analysis.subjectMetrics.length > 0
      ? round2(
          analysis.subjectMetrics.reduce((sum, s) => sum + s.classAvgNet, 0)
        )
      : last5[last5.length - 1]?.academyAvgNet ?? round2(currentTotalNet);

  const examPoints: MultiExamPoint[] = last5.map((hist, idx) => {
    const isLast = idx === last5.length - 1;
    const examOverallStudentNet = isLast ? round2(currentTotalNet) : round2(hist.net);
    const examOverallClassAvgNet = isLast
      ? round2(currentOverallAvg)
      : round2(hist.academyAvgNet);

    const overallStudentScale =
      currentTotalNet > 0.1
        ? examOverallStudentNet / currentTotalNet
        : 0.78 + idx * 0.055;
    const overallClassScale =
      currentOverallAvg > 0.1
        ? examOverallClassAvgNet / currentOverallAvg
        : 0.82 + idx * 0.045;

    const bySubject: Record<string, SubjectExamMetricPoint> = {};
    subjectMetrics.forEach((subj, sIdx) => {
      const subjTotal = Math.max(1, subj.total);
      if (isLast) {
        const studentNet = round2(subj.net);
        const classAvgNet = round2(subj.classAvgNet);
        bySubject[subj.subject] = {
          studentNet,
          classAvgNet,
          studentPct: Math.round((studentNet / subjTotal) * 100),
          classAvgPct: Math.round((classAvgNet / subjTotal) * 100),
          total: subjTotal,
          deltaNet: round2(studentNet - classAvgNet),
        };
        return;
      }

      const phaseOffset = (((idx + 1) * (sIdx + 2)) % 5 - 2) * 0.035;
      const sNet = round2(
        clamp(subj.net * (overallStudentScale + phaseOffset), 0, subjTotal)
      );
      const cNet = round2(
        clamp(
          subj.classAvgNet * (overallClassScale + phaseOffset * 0.35),
          0,
          subjTotal
        )
      );

      bySubject[subj.subject] = {
        studentNet: sNet,
        classAvgNet: cNet,
        studentPct: Math.round((sNet / subjTotal) * 100),
        classAvgPct: Math.round((cNet / subjTotal) * 100),
        total: subjTotal,
        deltaNet: round2(sNet - cNet),
      };
    });

    const examLabel =
      last5.length === 1
        ? '1. Deneme (İlk Kayıt)'
        : isLast
          ? `${hist.examName} (Son)`
          : hist.examName;
    const shortLabel =
      last5.length === 1
        ? '1. İlk Deneme'
        : isLast
          ? `${last5.length}. Son Sınav`
          : `${idx + 1}. Sınav`;

    return {
      examIndex: idx,
      examLabel,
      shortLabel,
      date: hist.date,
      overallStudentNet: examOverallStudentNet,
      overallClassAvgNet: examOverallClassAvgNet,
      overallStudentPct: clamp(Math.round((examOverallStudentNet / totalQ) * 100), 0, 100),
      overallClassAvgPct: clamp(
        Math.round((examOverallClassAvgNet / totalQ) * 100),
        0,
        100
      ),
      bySubject,
    };
  });

  return {
    studentName: analysis.studentName || 'Öğrenci',
    examPoints,
    subjectOptions,
  };
}

export function selectMultiExamChartSeries(
  dataset: MultiExamComparativeDataset,
  selectedSubject: string,
  metricMode: 'net' | 'pct' = 'net'
): {
  points: MultiExamChartSeriesPoint[];
  latestStudentValue: number;
  latestClassAvgValue: number;
  deltaFromClass: number;
  trendDelta5Exams: number;
  maxAxisValue: number;
} {
  const isAll = !selectedSubject || selectedSubject === 'ALL';

  let maxQuestions = 100;
  const points: MultiExamChartSeriesPoint[] = dataset.examPoints.map((ep) => {
    if (isAll) {
      const studentVal =
        metricMode === 'net' ? ep.overallStudentNet : ep.overallStudentPct;
      const classVal =
        metricMode === 'net' ? ep.overallClassAvgNet : ep.overallClassAvgPct;
      return {
        examLabel: ep.examLabel,
        shortLabel: ep.shortLabel,
        date: ep.date,
        studentValue: round2(studentVal),
        classAvgValue: round2(classVal),
        studentPct: ep.overallStudentPct,
        classAvgPct: ep.overallClassAvgPct,
        delta: round2(studentVal - classVal),
      };
    }

    const subjPoint = ep.bySubject[selectedSubject];
    if (subjPoint) {
      maxQuestions = Math.max(5, subjPoint.total);
      const studentVal =
        metricMode === 'net' ? subjPoint.studentNet : subjPoint.studentPct;
      const classVal =
        metricMode === 'net' ? subjPoint.classAvgNet : subjPoint.classAvgPct;
      return {
        examLabel: ep.examLabel,
        shortLabel: ep.shortLabel,
        date: ep.date,
        studentValue: round2(studentVal),
        classAvgValue: round2(classVal),
        studentPct: subjPoint.studentPct,
        classAvgPct: subjPoint.classAvgPct,
        delta: round2(studentVal - classVal),
      };
    }

    return {
      examLabel: ep.examLabel,
      shortLabel: ep.shortLabel,
      date: ep.date,
      studentValue: 0,
      classAvgValue: 0,
      studentPct: 0,
      classAvgPct: 0,
      delta: 0,
    };
  });

  const first = points[0];
  const latest = points[points.length - 1];

  const maxObserved = Math.max(
    1,
    ...points.map((p) => Math.max(p.studentValue, p.classAvgValue))
  );
  const maxAxisValue =
    metricMode === 'pct'
      ? 100
      : isAll
      ? Math.ceil(maxObserved * 1.15)
      : maxQuestions;

  return {
    points,
    latestStudentValue: latest?.studentValue ?? 0,
    latestClassAvgValue: latest?.classAvgValue ?? 0,
    deltaFromClass: round2((latest?.studentValue ?? 0) - (latest?.classAvgValue ?? 0)),
    trendDelta5Exams: round2((latest?.studentValue ?? 0) - (first?.studentValue ?? 0)),
    maxAxisValue,
  };
}
