import { getGradeProfile } from '../data/curriculum';
import {
  EducationCalendarEvent,
  ExamAnalysisResult,
  GradeLevelId,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  StudentRecord,
  WeeklyQuestionPreset,
  WeeklyStudentScore,
} from '../types/academy';
import {
  buildSampleWeeklyCohort,
  computeWeeklyComparison,
  normalizeClassroomForGrade,
} from './weeklyAnalysis';

export type CohortPerformanceBand = 'top' | 'steady' | 'support';

export interface StudentMultiExamPoint {
  examIndex: number;
  examLabel: string;
  net: number;
  score: number;
}

export interface StudentTrendSeries {
  studentId: string;
  studentName: string;
  shortName: string;
  studentNumber8: string;
  classroom: string;
  band: CohortPerformanceBand;
  latestNet: number;
  latestScore: number;
  deltaNet5: number;
  weakTopicNote: string;
  points: StudentMultiExamPoint[];
}

export interface CohortTrendPoint {
  examIndex: number;
  examLabel: string;
  avgNet: number;
  topBandNet: number;
  supportBandNet: number;
  avgScore: number;
  topBandScore: number;
  supportBandScore: number;
}

export interface KnowledgeGapStudentRef {
  studentId: string;
  studentName: string;
  studentNumber8: string;
  classroom: string;
  latestNet: number;
  band: CohortPerformanceBand;
  weakTopicNote: string;
}

export interface KnowledgeGapGroup {
  gapKey: string;
  subject: string;
  topic: string;
  gainCode: string;
  severity: 'kritik' | 'orta';
  recommendedDurationMin: number;
  suggestedNote: string;
  affectedStudents: KnowledgeGapStudentRef[];
}

export interface InstructorCoachingDataset {
  isLiveCohort: boolean;
  questionCount: number;
  totalStudents: number;
  avgLatestNet: number;
  avgLatestScore: number;
  risingCount: number;
  supportCount: number;
  examLabels: string[];
  cohortCurve: CohortTrendPoint[];
  studentTrends: StudentTrendSeries[];
  knowledgeGapGroups: KnowledgeGapGroup[];
}

const EXAM_LABELS_5 = ['Deneme 1', 'Deneme 2', 'Deneme 3', 'Deneme 4', 'Son Deneme'];

function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim() || 'Öğrenci';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function inferSubjectAndTopic(
  rawNote: string,
  gradeProfile: GradeProfile
): { subject: string; topic: string; gainCode: string } {
  const note = (rawNote || '').trim();
  const lower = note.toLocaleLowerCase('tr-TR');

  const subjectMatchers: Array<{ keywords: string[]; subjectHints: string[] }> = [
    {
      keywords: ['kesir', 'ondalık', 'yüzde', 'doğal sayı', 'matematik', 'problem', 'grafik', 'geometri', 'denklem', 'oran', 'üslü', 'köklü', 'çarpan', 'olasılık'],
      subjectHints: ['Matematik'],
    },
    {
      keywords: ['paragraf', 'yazım', 'sözcük', 'cümle', 'noktalama', 'türkçe', 'okuduğunu anlama', 'fiilimsi', 'anlatım'],
      subjectHints: ['Türkçe', 'Türk Dili ve Edebiyatı'],
    },
    {
      keywords: ['kuvvet', 'madde', 'fen', 'deney', 'elektrik', 'ışık', 'hücre', 'basınç', 'kimya', 'fizik', 'biyoloji'],
      subjectHints: ['Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji'],
    },
    {
      keywords: ['medeniyet', 'tarih', 'coğrafya', 'inkılap', 'sosyal', 'harita', 'kültür'],
      subjectHints: ['Sosyal Bilgiler', 'T.C. İnkılap Tarihi', 'Tarih', 'Coğrafya'],
    },
    {
      keywords: ['ingilizce', 'english', 'vocabulary', 'grammar', 'reading'],
      subjectHints: ['İngilizce', 'Yabancı Dil'],
    },
  ];

  for (const matcher of subjectMatchers) {
    if (matcher.keywords.some((kw) => lower.includes(kw))) {
      const matchedSubject =
        gradeProfile.subjects.find((s) =>
          matcher.subjectHints.some((hint) =>
            s.name.toLocaleLowerCase('tr-TR').includes(hint.toLocaleLowerCase('tr-TR'))
          )
        ) ?? gradeProfile.subjects[0];

      return {
        subject: matchedSubject.name,
        topic: note || matchedSubject.topics[0] || 'Temel Kazanım Tekrarı',
        gainCode: `${gradeProfile.id}.${matchedSubject.id.toUpperCase()}.TEL`,
      };
    }
  }

  for (const subj of gradeProfile.subjects) {
    const subjLower = subj.name.toLocaleLowerCase('tr-TR');
    if (lower.includes(subjLower)) {
      return {
        subject: subj.name,
        topic: note || subj.topics[0] || 'Kazanım Pekiştime',
        gainCode: `${gradeProfile.id}.${subj.id.toUpperCase()}.TEL`,
      };
    }
    const topicMatch = subj.topics.find((t) =>
      lower.includes(t.toLocaleLowerCase('tr-TR'))
    );
    if (topicMatch) {
      return {
        subject: subj.name,
        topic: topicMatch,
        gainCode: `${gradeProfile.id}.${subj.id.toUpperCase()}.TEL`,
      };
    }
  }

  const fallbackSubject = gradeProfile.subjects[0] ?? {
    id: 'GENEL',
    name: 'Genel Kazanım',
    topics: ['Temel Tekrar'],
  };
  return {
    subject: fallbackSubject.name,
    topic: note || fallbackSubject.topics[0] || 'Temel Kazanım Tekrarı',
    gainCode: `${gradeProfile.id}.${fallbackSubject.id.toUpperCase()}.TEL`,
  };
}

export function buildInstructorCoachingDataset(params: {
  institution: Institution;
  gradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  students: StudentRecord[];
  weeklyEntries?: WeeklyStudentScore[];
  weeklyQuestionCount?: WeeklyQuestionPreset | number;
  activeAnalysis?: ExamAnalysisResult;
  hasLiveAnalysis?: boolean;
}): InstructorCoachingDataset {
  const instStudents = params.students.filter(
    (s) => s.institutionId === params.institution.id
  );
  const hasLiveWeekly = Boolean(params.weeklyEntries && params.weeklyEntries.length > 0);
  const questionCount = Math.max(
    10,
    params.weeklyQuestionCount ??
      params.gradeProfile.subjects.reduce((acc, s) => acc + s.questionCount, 0)
  );

  const rawEntries: WeeklyStudentScore[] = hasLiveWeekly
    ? (params.weeklyEntries as WeeklyStudentScore[])
    : buildSampleWeeklyCohort({
        institution: params.institution,
        gradeId: params.gradeProfile.id,
        questionCount,
        existingStudents: instStudents,
      });

  const comparisonRows = computeWeeklyComparison({
    entries: rawEntries,
    kts1TotalQuestions: questionCount,
    kts2TotalQuestions: questionCount,
    gradeProfile: params.gradeProfile,
    penaltyDivisorOverride: params.penaltyDivisor,
  });

  const activeWeakTopic =
    params.hasLiveAnalysis && params.activeAnalysis
      ? [...params.activeAnalysis.topicGaps].sort((a, b) => a.masteryPct - b.masteryPct)[0]
      : undefined;

  const studentTrends: StudentTrendSeries[] = comparisonRows.map((row, idx) => {
    const startNet = Math.max(0, row.kts1Net * 0.88 - ((idx % 3) - 1) * 0.6);
    const midNet1 = startNet + (row.kts1Net - startNet) * 0.55;
    const midNet2 = row.kts1Net;
    const midNet3 = row.kts1Net + (row.kts2Net - row.kts1Net) * 0.52;
    let endNet = row.kts2Net;

    // Anchor evaluated live student to their exact active analysis net if names/numbers match
    if (
      params.hasLiveAnalysis &&
      params.activeAnalysis &&
      (row.studentNumber8 === params.activeAnalysis.studentNumber ||
        row.studentName.toLocaleLowerCase('tr-TR') ===
          params.activeAnalysis.studentName.toLocaleLowerCase('tr-TR'))
    ) {
      const scaledActiveNet = Math.min(
        questionCount,
        Math.max(0, params.activeAnalysis.totalNet)
      );
      endNet = scaledActiveNet;
    }

    const netValues = [startNet, midNet1, midNet2, midNet3, endNet].map((v) =>
      round2(Math.max(0, Math.min(questionCount, v)))
    );

    const points: StudentMultiExamPoint[] = EXAM_LABELS_5.map((examLabel, examIndex) => {
      const net = netValues[examIndex];
      const ratio = questionCount > 0 ? net / questionCount : 0;
      const score = round1(
        Math.min(
          params.gradeProfile.maxScore,
          params.gradeProfile.baseScore +
            ratio * (params.gradeProfile.maxScore - params.gradeProfile.baseScore)
        )
      );
      return { examIndex, examLabel, net, score };
    });

    const latest = points[points.length - 1];
    const first = points[0];
    const pct = questionCount > 0 ? (latest.net / questionCount) * 100 : 0;
    const band: CohortPerformanceBand =
      pct >= 72 ? 'top' : pct < 52 || row.netDelta < -0.5 ? 'support' : 'steady';

    const resolvedWeakNote =
      params.hasLiveAnalysis &&
      params.activeAnalysis &&
      activeWeakTopic &&
      (row.studentNumber8 === params.activeAnalysis.studentNumber ||
        row.studentName.toLocaleLowerCase('tr-TR') ===
          params.activeAnalysis.studentName.toLocaleLowerCase('tr-TR'))
        ? `${activeWeakTopic.subject}: ${activeWeakTopic.topic}`
        : row.weakTopicNote || 'Temel kazanım tekrarı';

    return {
      studentId: row.studentId,
      studentName: row.studentName,
      shortName: shortenName(row.studentName),
      studentNumber8: row.studentNumber8,
      classroom: normalizeClassroomForGrade(row.classroom, params.gradeProfile),
      band,
      latestNet: latest.net,
      latestScore: latest.score,
      deltaNet5: round2(latest.net - first.net),
      weakTopicNote: resolvedWeakNote,
      points,
    };
  });

  const cohortCurve: CohortTrendPoint[] = EXAM_LABELS_5.map((examLabel, examIndex) => {
    const nets = studentTrends.map((s) => s.points[examIndex]?.net ?? 0);
    const scores = studentTrends.map((s) => s.points[examIndex]?.score ?? 0);
    const topSeries = studentTrends.filter((s) => s.band === 'top');
    const supportSeries = studentTrends.filter((s) => s.band === 'support');

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0;

    const topNets = (topSeries.length > 0 ? topSeries : studentTrends.slice(0, 3)).map(
      (s) => s.points[examIndex]?.net ?? 0
    );
    const supportNets = (
      supportSeries.length > 0 ? supportSeries : studentTrends.slice(-3)
    ).map((s) => s.points[examIndex]?.net ?? 0);

    const topScores = (topSeries.length > 0 ? topSeries : studentTrends.slice(0, 3)).map(
      (s) => s.points[examIndex]?.score ?? 0
    );
    const supportScores = (
      supportSeries.length > 0 ? supportSeries : studentTrends.slice(-3)
    ).map((s) => s.points[examIndex]?.score ?? 0);

    return {
      examIndex,
      examLabel,
      avgNet: round2(avg(nets)),
      topBandNet: round2(avg(topNets)),
      supportBandNet: round2(avg(supportNets)),
      avgScore: round1(avg(scores)),
      topBandScore: round1(avg(topScores)),
      supportBandScore: round1(avg(supportScores)),
    };
  });

  // Group students by common knowledge gaps (by inferred subject + normalized topic cluster)
  const groupMap = new Map<string, KnowledgeGapGroup>();

  for (const stu of studentTrends) {
    const inferred = inferSubjectAndTopic(stu.weakTopicNote, params.gradeProfile);
    // Group by subject when there are multiple distinct topics in same subject or exact topic
    const clusterTopic =
      stu.band === 'support' || stu.deltaNet5 <= 1.2
        ? inferred.topic
        : `${inferred.subject} İleri Uygulama & Tekrar`;
    const gapKey = `${inferred.subject.toLocaleLowerCase('tr-TR')}::${inferred.topic
      .toLocaleLowerCase('tr-TR')
      .slice(0, 28)}`;

    // Also create broader subject-level grouping if cluster only has 1 student so teachers get rich multi-student groups
    const existing = groupMap.get(gapKey);
    const stuRef: KnowledgeGapStudentRef = {
      studentId: stu.studentId,
      studentName: stu.studentName,
      studentNumber8: stu.studentNumber8,
      classroom: stu.classroom,
      latestNet: stu.latestNet,
      band: stu.band,
      weakTopicNote: stu.weakTopicNote,
    };

    if (existing) {
      existing.affectedStudents.push(stuRef);
      if (stu.band === 'support') existing.severity = 'kritik';
    } else {
      groupMap.set(gapKey, {
        gapKey,
        subject: inferred.subject,
        topic: inferred.topic || clusterTopic,
        gainCode: inferred.gainCode,
        severity: stu.band === 'support' ? 'kritik' : 'orta',
        recommendedDurationMin: stu.band === 'support' ? 60 : 45,
        suggestedNote: `${inferred.subject} — ${inferred.topic} odaklı grup telafi etütü ve kazanım pekiştirme çalışması.`,
        affectedStudents: [stuRef],
      });
    }
  }

  // Merge single-student groups sharing the same subject so instructors always have practical multi-student remedial cohorts
  const bySubjectMerged = new Map<string, KnowledgeGapGroup & { _topics?: string[] }>();
  for (const grp of groupMap.values()) {
    const subjKey = grp.subject.toLocaleLowerCase('tr-TR');
    const prev = bySubjectMerged.get(subjKey);
    if (!prev) {
      bySubjectMerged.set(subjKey, {
        ...grp,
        gapKey: `subj-${subjKey}`,
        affectedStudents: [...grp.affectedStudents],
        _topics: [grp.topic],
      });
    } else {
      const topicList = Array.from(
        new Set([...(prev._topics ?? [prev.topic]), grp.topic].filter(Boolean))
      );
      prev._topics = topicList;
      prev.topic =
        topicList.length > 2
          ? `${topicList.slice(0, 2).join(' & ')} (+${topicList.length - 2} konu)`
          : topicList.join(' & ');
      prev.affectedStudents.push(...grp.affectedStudents);
      if (grp.severity === 'kritik') {
        prev.severity = 'kritik';
        prev.recommendedDurationMin = 60;
      }
      prev.suggestedNote = `${prev.subject} (${prev.topic}) ortak kazanım eksiği için toplu telafi etütü.`;
    }
  }

  const knowledgeGapGroups: KnowledgeGapGroup[] = Array.from(bySubjectMerged.values())
    .map(({ _topics: _ignored, ...rest }) => rest)
    .sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'kritik' ? -1 : 1;
    return b.affectedStudents.length - a.affectedStudents.length;
  });

  const avgLatestNet =
    studentTrends.length > 0
      ? round2(
          studentTrends.reduce((sum, s) => sum + s.latestNet, 0) / studentTrends.length
        )
      : 0;
  const avgLatestScore =
    studentTrends.length > 0
      ? round1(
          studentTrends.reduce((sum, s) => sum + s.latestScore, 0) / studentTrends.length
        )
      : 0;

  return {
    isLiveCohort: hasLiveWeekly || Boolean(params.hasLiveAnalysis),
    questionCount,
    totalStudents: studentTrends.length,
    avgLatestNet,
    avgLatestScore,
    risingCount: studentTrends.filter((s) => s.deltaNet5 >= 1).length,
    supportCount: studentTrends.filter((s) => s.band === 'support').length,
    examLabels: EXAM_LABELS_5,
    cohortCurve,
    studentTrends,
    knowledgeGapGroups,
  };
}

export function buildBulkRemedialCalendarEvents(params: {
  groups: KnowledgeGapGroup[];
  selectedStudentIds?: Set<string>;
  institutionId: string;
  gradeId: GradeLevelId;
  date: string;
  time: string;
  customNote?: string;
}): EducationCalendarEvent[] {
  const cleanDate = params.date.trim() || new Date().toISOString().slice(0, 10);
  const cleanTime = params.time.trim() || '16:00';
  const gradeLabel = getGradeProfile(params.gradeId).shortLabel;
  const stamp = Date.now();

  return params.groups
    .map((group, idx) => {
      const targeted = params.selectedStudentIds
        ? group.affectedStudents.filter((s) => params.selectedStudentIds?.has(s.studentId))
        : group.affectedStudents;
      const studentsToAssign =
        targeted.length > 0 ? targeted : group.affectedStudents;
      const classrooms = Array.from(
        new Set(studentsToAssign.map((s) => s.classroom).filter(Boolean))
      );
      const studentNamesPreview = studentsToAssign
        .slice(0, 5)
        .map((s) => s.studentName)
        .join(', ');
      const extraCount =
        studentsToAssign.length > 5 ? ` (+${studentsToAssign.length - 5} öğrenci)` : '';

      const baseNote = params.customNote?.trim()
        ? params.customNote.trim()
        : group.suggestedNote;

      return {
        id: `cal-bulk-rem-${stamp}-${idx}-${Math.floor(Math.random() * 1000)}`,
        institutionId: params.institutionId,
        title: `Toplu Telafi Etütü (${studentsToAssign.length} Öğrenci): ${group.subject} — ${group.topic}`,
        date: cleanDate,
        time: cleanTime,
        gradeId: params.gradeId,
        type: 'telafi-etutu' as const,
        classroom:
          classrooms.length > 0 ? classrooms.join(', ') : `${gradeLabel} Telafi Grubu`,
        note: `${baseNote} Kazanım: ${group.gainCode} · Öğrenciler: ${studentNamesPreview}${extraCount}`,
      };
    })
    .filter((ev) => ev.title.length > 0);
}
