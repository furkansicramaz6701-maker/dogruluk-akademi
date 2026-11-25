import { ExamAnalysisResult, SubjectMetrics } from '../types/academy';

export type SubjectComparisonPriority = 'kritik' | 'gelistirilmeli' | 'sinif-ustu';

export interface SubjectComparisonItem {
  subject: string;
  shortSubject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  studentNet: number;
  classAvgNet: number;
  studentPct: number;
  classAvgPct: number;
  accuracyPct: number;
  netDelta: number;
  pctDelta: number;
  isWeak: boolean;
  priorityLevel: SubjectComparisonPriority;
  statusLabel: string;
}

export interface DetailedSubjectBreakdownSummary {
  items: SubjectComparisonItem[];
  weakSubjects: SubjectComparisonItem[];
  strongSubjects: SubjectComparisonItem[];
  weakestGapSubject: SubjectComparisonItem | null;
  strongestGapSubject: SubjectComparisonItem | null;
  overallStudentNet: number;
  overallClassAvgNet: number;
}

export function shortenSubjectName(subject: string): string {
  const trimmed = subject.trim();
  const map: Record<string, string> = {
    'Fen Bilimleri': 'Fen Bil.',
    'Sosyal Bilgiler': 'Sosyal',
    'İnkılap Tarihi': 'İnkılap',
    'T.C. İnkılap Tarihi': 'İnkılap',
    'Din Kültürü': 'Din Kül.',
    'Din Kültürü ve Ahlak Bilgisi': 'Din Kül.',
    'Türk Dili ve Edebiyatı': 'Edebiyat',
    'Yabancı Dil (İngilizce)': 'İngilizce',
    'Yabancı Dil': 'İngilizce',
  };
  if (map[trimmed]) return map[trimmed];
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

export function buildDetailedSubjectComparison(
  analysis: ExamAnalysisResult
): DetailedSubjectBreakdownSummary {
  const metrics: SubjectMetrics[] = analysis.subjectMetrics ?? [];
  const items: SubjectComparisonItem[] = metrics.map((m) => {
    const safeTotal = Math.max(1, m.total || 0);
    const studentNet = Number((m.net ?? 0).toFixed(2));
    const classAvgNet = Number((m.classAvgNet ?? 0).toFixed(2));
    const studentPct = Math.round((Math.max(0, studentNet) / safeTotal) * 100);
    const classAvgPct = Math.round((Math.max(0, classAvgNet) / safeTotal) * 100);
    const netDelta = Number((studentNet - classAvgNet).toFixed(2));
    const pctDelta = studentPct - classAvgPct;
    const isWeak = netDelta < 0 || studentPct < 55;

    let priorityLevel: SubjectComparisonPriority = 'sinif-ustu';
    let statusLabel = 'Sınıf Ort. Üstü';
    if (netDelta <= -1.2 || studentPct < 45) {
      priorityLevel = 'kritik';
      statusLabel = 'Öncelikli Destek';
    } else if (netDelta < 0 || studentPct < 55) {
      priorityLevel = 'gelistirilmeli';
      statusLabel = 'Sınıf Ort. Altı';
    }

    return {
      subject: m.subject,
      shortSubject: shortenSubjectName(m.subject),
      total: m.total,
      correct: m.correct,
      wrong: m.wrong,
      blank: m.blank,
      studentNet,
      classAvgNet,
      studentPct,
      classAvgPct,
      accuracyPct: m.accuracyPct,
      netDelta,
      pctDelta,
      isWeak,
      priorityLevel,
      statusLabel,
    };
  });

  const weakSubjects = [...items]
    .filter((i) => i.isWeak)
    .sort((a, b) => a.netDelta - b.netDelta || a.studentPct - b.studentPct);

  const strongSubjects = [...items]
    .filter((i) => !i.isWeak)
    .sort((a, b) => b.netDelta - a.netDelta || b.studentPct - a.studentPct);

  const weakestGapSubject =
    [...items].sort((a, b) => a.netDelta - b.netDelta || a.studentPct - b.studentPct)[0] ?? null;
  const strongestGapSubject =
    [...items].sort((a, b) => b.netDelta - a.netDelta || b.studentPct - a.studentPct)[0] ?? null;

  const overallStudentNet = Number(
    items.reduce((sum, i) => sum + i.studentNet, 0).toFixed(2)
  );
  const overallClassAvgNet = Number(
    items.reduce((sum, i) => sum + i.classAvgNet, 0).toFixed(2)
  );

  return {
    items,
    weakSubjects,
    strongSubjects,
    weakestGapSubject,
    strongestGapSubject,
    overallStudentNet,
    overallClassAvgNet,
  };
}
