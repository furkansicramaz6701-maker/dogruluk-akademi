import {
  ExamAnalysisResult,
  ExamQuestion,
  GradeProfile,
  SubjectMetrics,
  SubjectSpec,
  TopicGapMetric,
} from '../types/academy';

export interface ScopedQuestionsParams {
  questions: ExamQuestion[];
  gradeProfile: GradeProfile;
  subjectScopeId?: string;
  questionCount?: number;
}

export interface OpticalLayoutColumnSpec {
  title: string;
  startQuestion: number;
  endQuestion: number;
}

export interface OpticalSheetLayoutConfig {
  isSingleSubject: boolean;
  selectedSubjectName?: string;
  subjects: SubjectSpec[];
  numCols: 1 | 2 | 3 | 4;
  rowsPerCol: number;
  columns: OpticalLayoutColumnSpec[];
}

export interface SingleSubjectKarneSummary {
  subjectMetric: SubjectMetrics;
  accuracyPct: number;
  netRatePct: number;
  priorityTopics: TopicGapMetric[];
  strongestTopic: TopicGapMetric | null;
  weakestTopic: TopicGapMetric | null;
  coachingNote: string;
}

function findMatchingSubject(
  gradeProfile: GradeProfile,
  subjectScopeId?: string
): SubjectSpec | undefined {
  if (!subjectScopeId || subjectScopeId === 'all') return undefined;
  const normalized = subjectScopeId.trim().toLowerCase();
  return gradeProfile.subjects.find(
    (s) => s.id.toLowerCase() === normalized || s.name.toLowerCase() === normalized
  );
}

/**
 * Produces exact sequential questions for either a full exam or a single-subject
 * custom-count test (e.g. Matematik 10, 12, 16, 20, 25, 30 questions).
 */
export function buildScopedExamQuestions(params: ScopedQuestionsParams): ExamQuestion[] {
  const { questions, gradeProfile, subjectScopeId, questionCount } = params;
  const targetSubject = findMatchingSubject(gradeProfile, subjectScopeId);

  if (!targetSubject) {
    if (!questionCount || questionCount <= 0 || questionCount === questions.length) {
      return questions;
    }
    if (questions.length === 0) return [];
    const out: ExamQuestion[] = [];
    for (let i = 0; i < questionCount; i++) {
      const tpl = questions[i % questions.length];
      out.push({
        ...tpl,
        id: i < questions.length ? tpl.id : `${tpl.id}-ext-${i + 1}`,
        number: i + 1,
      });
    }
    return out;
  }

  const desiredCount =
    questionCount && questionCount > 0 ? Math.min(200, questionCount) : targetSubject.questionCount;
  const matching = questions.filter((q) => q.subject === targetSubject.name);
  const seedPool = matching.length > 0 ? matching : questions;
  const fallbackTopics = targetSubject.topics.length > 0 ? targetSubject.topics : [targetSubject.name];

  const scoped: ExamQuestion[] = [];
  for (let i = 0; i < desiredCount; i++) {
    const tpl = seedPool[i % Math.max(1, seedPool.length)];
    const topic = matching.length > i && tpl?.topic ? tpl.topic : fallbackTopics[i % fallbackTopics.length];
    const letters = gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
    scoped.push({
      id: tpl && i < matching.length ? tpl.id : `${targetSubject.id}-scoped-${i + 1}`,
      number: i + 1,
      subject: targetSubject.name,
      topic,
      gainCode: tpl?.gainCode || `${gradeProfile.id}.${targetSubject.id.toUpperCase()}.${i + 1}`,
      difficulty: tpl?.difficulty || (i % 3 === 0 ? 'Kolay' : i % 3 === 1 ? 'Orta' : 'Zor'),
      stem: tpl?.stem || `${targetSubject.name} — ${topic} (${i + 1}. Soru)`,
      options: tpl?.options || Object.fromEntries(letters.map((l) => [l, `${l} şıkkı`])),
      correctOption: tpl?.correctOption || letters[i % letters.length],
      explanation: tpl?.explanation || `${topic} kazanım değerlendirmesi`,
      source: tpl?.source || 'Müfredat Havuzu',
      sourceUrl: tpl?.sourceUrl,
      visual: tpl?.visual,
    });
  }
  return scoped;
}

/**
 * Resolves exact column headers and column counts for the Pink OMR Optical Sheet
 * so a 12-question Matematik test renders a single wide MATEMATİK column (1..12)
 * instead of 4 full-curriculum columns with 120 questions.
 */
export function resolveOpticalSheetLayoutConfig(params: {
  totalQuestions: number;
  gradeProfile?: GradeProfile;
  selectedSubjectId?: string;
  subjectsOverride?: SubjectSpec[];
}): OpticalSheetLayoutConfig {
  const safeTotal = Math.max(1, Math.min(200, Math.round(params.totalQuestions || 120)));
  const matchedSingle =
    params.subjectsOverride && params.subjectsOverride.length === 1
      ? params.subjectsOverride[0]
      : params.gradeProfile
        ? findMatchingSubject(params.gradeProfile, params.selectedSubjectId)
        : undefined;

  const isSingleSubject = Boolean(matchedSingle);
  const subjects: SubjectSpec[] = matchedSingle
    ? [{ ...matchedSingle, questionCount: safeTotal }]
    : params.subjectsOverride && params.subjectsOverride.length > 0
      ? params.subjectsOverride
      : params.gradeProfile?.subjects ?? [
          { id: 'turkce', name: 'TÜRKÇE', questionCount: 40, topics: [] },
          { id: 'sosyal', name: 'SOSYAL BİL.', questionCount: 20, topics: [] },
          { id: 'mat', name: 'MATEMATİK', questionCount: 40, topics: [] },
          { id: 'fen', name: 'FEN BİL.', questionCount: 20, topics: [] },
        ];

  let numCols: 1 | 2 | 3 | 4 = 4;
  if (safeTotal <= 15) {
    numCols = 1;
  } else if (safeTotal <= 50) {
    numCols = 2;
  } else if (safeTotal <= 90) {
    numCols = 3;
  } else {
    numCols = 4;
  }

  const rowsPerCol = Math.ceil(safeTotal / numCols);
  const columns: OpticalLayoutColumnSpec[] = [];

  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    const startQ = colIdx * rowsPerCol + 1;
    const endQ = Math.min(safeTotal, (colIdx + 1) * rowsPerCol);
    let title = `BÖLÜM ${colIdx + 1}`;
    if (matchedSingle) {
      const upper = matchedSingle.name.toLocaleUpperCase('tr-TR');
      title = numCols === 1 ? `${upper} (${startQ}–${endQ})` : `${upper} (${startQ}–${endQ})`;
    } else if (subjects[colIdx]) {
      title = subjects[colIdx].name.toLocaleUpperCase('tr-TR');
    }
    columns.push({
      title,
      startQuestion: startQ,
      endQuestion: endQ,
    });
  }

  return {
    isSingleSubject,
    selectedSubjectName: matchedSingle?.name,
    subjects,
    numCols,
    rowsPerCol,
    columns,
  };
}

export function isSingleSubjectAnalysis(analysis: ExamAnalysisResult): boolean {
  return analysis.subjectMetrics.length === 1 && analysis.totalQuestions > 0;
}

export function buildSingleSubjectKarneSummary(
  analysis: ExamAnalysisResult
): SingleSubjectKarneSummary | null {
  if (!isSingleSubjectAnalysis(analysis)) return null;
  const subjectMetric = analysis.subjectMetrics[0];
  const accuracyPct = subjectMetric.accuracyPct;
  const netRatePct =
    subjectMetric.total > 0
      ? Math.max(0, Math.min(100, Math.round((subjectMetric.net / subjectMetric.total) * 100)))
      : 0;

  const statusOrder: Record<TopicGapMetric['status'], number> = {
    'Kritik Eksik': 0,
    Geliştirilmeli: 1,
    'Tam Hakimiyet': 2,
  };

  const priorityTopics = [...analysis.topicGaps].sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.masteryPct - b.masteryPct;
  });

  const weakestTopic = priorityTopics[0] ?? null;
  const byBest = [...analysis.topicGaps].sort((a, b) => b.masteryPct - a.masteryPct);
  const strongestTopic = byBest[0] ?? null;

  let coachingNote = `${subjectMetric.subject} dersinde ${subjectMetric.total} soruda ${subjectMetric.correct} doğru, ${subjectMetric.wrong} yanlış ve ${subjectMetric.blank} boş ile ${subjectMetric.net.toFixed(2)} net elde edildi.`;
  if (weakestTopic && weakestTopic.status !== 'Tam Hakimiyet') {
    coachingNote += ` Öncelikli telafi konusu: "${weakestTopic.topic}" (%${weakestTopic.masteryPct} hakimiyet).`;
  } else if (strongestTopic) {
    coachingNote += ` Tüm kazanımlarda güçlü performans sağlandı ("${strongestTopic.topic}" %${strongestTopic.masteryPct}).`;
  }

  return {
    subjectMetric,
    accuracyPct,
    netRatePct,
    priorityTopics,
    strongestTopic,
    weakestTopic,
    coachingNote,
  };
}
