import { getGradeProfile } from '../data/curriculum';
import {
  CustomParentMessageTemplate,
  ExamAnalysisResult,
  GradeLevelId,
  GradeProfile,
  Institution,
  ParentMessageTemplateMode,
  PenaltyDivisor,
  StudentRecord,
  WeeklyBulkFilterMode,
  WeeklyCohortInsights,
  WeeklyComparisonRow,
  WeeklyPerformanceStatus,
  WeeklySortKey,
  WeeklyStatusFilter,
  WeeklyStudentScore,
} from '../types/academy';
import { defaultClassroomForGrade } from './excelExport';
import { generate8DigitStudentNumber } from './institutionCodes';

export type DynamicAchievementTierKey =
  | 'gold-crown'
  | 'silver-medal'
  | 'bronze-medal'
  | 'rising-star'
  | 'mastery-shield'
  | 'progress-flame'
  | 'focus-compass';

export interface DynamicAchievementTier {
  key: DynamicAchievementTierKey;
  title: string;
  subtitle: string;
  badgeText: string;
}

export function sanitizeExamLabelForGrade(
  label: string,
  gradeProfile?: GradeProfile
): string {
  const raw = (label || '').trim();
  if (!gradeProfile || gradeProfile.category === 'Üniversite Hazırlık (YKS)') {
    return raw;
  }
  // Never expose TYT / AYT / YKS / Üniversite Hazırlık labels for 3rd-12th grade school exams
  const cleaned = raw
    .replace(/\b(TYT|AYT|YKS|AYT-SAY|AYT-EA|AYT-SOZ)\b/gi, '')
    .replace(/Üniversite Hazırlık(?:\s*\(YKS\))?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-·:]+|[\s\-·:]+$/g, '')
    .trim();
  return cleaned || `${gradeProfile.shortLabel} Deneme`;
}

export function normalizeClassroomForGrade(
  classroom: string | undefined,
  gradeProfile?: GradeProfile
): string {
  const raw = (classroom || '').trim();
  if (!gradeProfile) return raw || '5-A';

  const fallbackClass = defaultClassroomForGrade(gradeProfile.id);
  if (!raw) return fallbackClass;

  // For YKS tracks, keep sanitized YKS classroom labels
  if (gradeProfile.category === 'Üniversite Hazırlık (YKS)') {
    return raw;
  }

  // Strip YKS/track tokens for elementary/middle school grades (3-8) and YKS keywords for 9-12
  let cleaned = raw.replace(/\b(TYT|AYT|YKS)\b/gi, '');
  if (gradeProfile.category === 'İlkokul' || gradeProfile.category === 'Ortaokul & LGS') {
    cleaned = cleaned.replace(/\b(Sayısal|Eşit Ağırlık|Sözel|EA|Şubesi)\b/gi, '');
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^[\s\-·:]+|[\s\-·:]+$/g, '').trim();

  // Extract branch letter if present (e.g. "12-A Sayısal" -> "A", "5. Sınıf - B" -> "B")
  const branchMatch =
    cleaned.match(/^\d{1,2}(?:\.\s*Sınıf)?\s*[-./]?\s*([A-ZÇĞİÖŞÜ])\b/i) ||
    cleaned.match(/\b([A-ZÇĞİÖŞÜ])\s*$/i);
  const branch = branchMatch ? branchMatch[1].toUpperCase() : 'A';

  // If classroom starts with a different grade number (e.g. "12-A" when grade is "5"), rewrite to active grade ("5-A")
  const leadingGradeMatch = cleaned.match(/^(\d{1,2})\b/);
  if (leadingGradeMatch && leadingGradeMatch[1] !== gradeProfile.id) {
    return `${gradeProfile.id}-${branch}`;
  }

  // Normalize verbose "5. Sınıf - A" -> "5-A" for concise display
  if (new RegExp(`^${gradeProfile.id}\\.\\s*Sınıf\\s*[-./]?\\s*${branch}$`, 'i').test(cleaned)) {
    return `${gradeProfile.id}-${branch}`;
  }

  return cleaned || fallbackClass;
}

export function getDynamicAchievementTier(input: {
  rank?: number | null;
  successPct: number;
  scoreDelta?: number;
  netDelta?: number;
  isRisingStar?: boolean;
}): DynamicAchievementTier {
  const rank = input.rank ?? null;
  if (rank === 1) {
    return {
      key: 'gold-crown',
      title: '1.lik Altın Başarı',
      subtitle: `%${input.successPct} Başarı · Kurum Lideri`,
      badgeText: '1.',
    };
  }
  if (rank === 2) {
    return {
      key: 'silver-medal',
      title: '2.lik Gümüş Başarı',
      subtitle: `%${input.successPct} Başarı · İlk 3 Derece`,
      badgeText: '2.',
    };
  }
  if (rank === 3) {
    return {
      key: 'bronze-medal',
      title: '3.lük Bronz Başarı',
      subtitle: `%${input.successPct} Başarı · İlk 3 Derece`,
      badgeText: '3.',
    };
  }
  if (input.isRisingStar || (input.scoreDelta ?? 0) >= 15 || (input.netDelta ?? 0) >= 2.5) {
    const deltaLabel =
      input.scoreDelta !== undefined && input.scoreDelta > 0
        ? `+${input.scoreDelta.toFixed(1)} Puan Sıçrama`
        : 'Haftanın Yükseliş Yıldızı';
    return {
      key: 'rising-star',
      title: 'Yükseliş Yıldızı',
      subtitle: deltaLabel,
      badgeText: '★',
    };
  }
  if (input.successPct >= 78) {
    return {
      key: 'mastery-shield',
      title: 'Üstün Başarı',
      subtitle: `%${input.successPct} Hakimiyet`,
      badgeText: `%${input.successPct}`,
    };
  }
  if (input.successPct >= 60) {
    return {
      key: 'progress-flame',
      title: 'İyi Gelişim',
      subtitle: `%${input.successPct} Başarı İvmesi`,
      badgeText: `%${input.successPct}`,
    };
  }
  return {
    key: 'focus-compass',
    title: 'Destek & Etüt Odağı',
    subtitle: `%${input.successPct} · Telafi Önerisi`,
    badgeText: `%${input.successPct}`,
  };
}

export function normalizeTurkishWhatsAppDigits(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length >= 11) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

export function buildWhatsAppHref(phone: string | undefined, text: string): string {
  const intl = normalizeTurkishWhatsAppDigits(phone);
  const encoded = encodeURIComponent(text);
  return intl ? `https://wa.me/${intl}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildSmsHref(phone: string | undefined, text: string): string {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  return `sms:${clean}?body=${encodeURIComponent(text)}`;
}

export function buildGradeAppropriateSubtitle(profile: GradeProfile): string {
  switch (profile.category) {
    case 'İlkokul':
      return `${profile.shortLabel} İlkokul Ölçme, Kazanım ve Değerlendirme Serisi`;
    case 'Ortaokul & LGS':
      return `${profile.shortLabel} Ortaokul Süreç İzleme ve Değerlendirme Serisi`;
    case 'Lise':
      return `${profile.shortLabel} Lise Akademik İzleme ve Analiz Serisi`;
    case 'Üniversite Hazırlık (YKS)':
      return `${profile.shortLabel} Üniversite Hazırlık (YKS) Ölçme Serisi`;
  }
}

export function calculateNetAndScore(
  correct: number,
  wrong: number,
  totalQuestions: number,
  profile: GradeProfile,
  penaltyDivisorOverride?: PenaltyDivisor
): { net: number; score: number; successPct: number } {
  const safeTotal = Math.max(1, totalQuestions);
  const safeCorrect = Math.max(0, Math.min(safeTotal, correct));
  const safeWrong = Math.max(0, Math.min(safeTotal - safeCorrect, wrong));
  const divisor = penaltyDivisorOverride ?? profile.penaltyDivisor;
  const rawNet = divisor === 0 ? safeCorrect : Math.max(0, safeCorrect - safeWrong / divisor);
  const net = Number(rawNet.toFixed(2));
  const ratio = Math.min(1, Math.max(0, net / safeTotal));
  const score = Number(
    (profile.baseScore + ratio * (profile.maxScore - profile.baseScore)).toFixed(1)
  );
  const successPct = Math.round(ratio * 100);
  return { net, score, successPct };
}

export function determineWeeklyStatus(
  successPct: number,
  netDelta: number
): WeeklyPerformanceStatus {
  if (successPct >= 78) return 'Üstün Başarı';
  if (successPct >= 60 || netDelta >= 2) return 'İyi Gelişim';
  if (successPct >= 45) return 'Destek Gerekiyor';
  return 'Çalışması Gerekiyor';
}

export function buildWeeklyFocusAdvice(
  status: WeeklyPerformanceStatus,
  scoreDelta: number,
  weakTopicNote?: string
): string {
  const topicPart = weakTopicNote?.trim() ? ` (${weakTopicNote.trim()})` : '';
  if (status === 'Üstün Başarı') {
    return scoreDelta >= 0
      ? `Derece performansını koruyor; yeni nesil zorluk sorularıyla pekiştirme önerilir${topicPart}.`
      : `Yüksek düzey korunuyor; dikkat hatalarını sıfırlamaya odaklanılmalı${topicPart}.`;
  }
  if (status === 'İyi Gelişim') {
    return scoreDelta > 0
      ? `KTS-1'e göre +${scoreDelta.toFixed(1)} puan artış gösterdi; düzenli konu tekrarı sürüyor${topicPart}.`
      : `Orta-üst bantta ilerliyor; yanlış çıkan konulara haftalık 20 dk etüt eklenmeli${topicPart}.`;
  }
  if (status === 'Destek Gerekiyor') {
    return `Temel kazanım tekrarları ve günlük 15 soruluk telafi çalışması önerilir${topicPart}.`;
  }
  return `Çalışması gerekiyor: birebir rehberlik ve temel konu tekrarı acil planlanmalı${topicPart}.`;
}

export function computeWeeklyComparison(params: {
  entries: WeeklyStudentScore[];
  kts1TotalQuestions: number;
  kts2TotalQuestions: number;
  gradeProfile: GradeProfile;
  penaltyDivisorOverride?: PenaltyDivisor;
}): WeeklyComparisonRow[] {
  const rows = params.entries.map((entry) => {
    const k1 = calculateNetAndScore(
      entry.kts1Correct,
      entry.kts1Wrong,
      params.kts1TotalQuestions,
      params.gradeProfile,
      params.penaltyDivisorOverride
    );
    const k2 = calculateNetAndScore(
      entry.kts2Correct,
      entry.kts2Wrong,
      params.kts2TotalQuestions,
      params.gradeProfile,
      params.penaltyDivisorOverride
    );
    const netDelta = Number((k2.net - k1.net).toFixed(2));
    const scoreDelta = Number((k2.score - k1.score).toFixed(1));
    const status = determineWeeklyStatus(k2.successPct, netDelta);
    const focusAdvice = buildWeeklyFocusAdvice(status, scoreDelta, entry.weakTopicNote);

    const safeClassroom = normalizeClassroomForGrade(entry.classroom, params.gradeProfile);

    return {
      rank: 0,
      top3Badge: null as 1 | 2 | 3 | null,
      studentId: entry.studentId,
      studentName: entry.studentName,
      studentNumber8: entry.studentNumber8,
      classroom: safeClassroom,
      parentPhone: entry.parentPhone,
      kts1Net: k1.net,
      kts1Score: k1.score,
      kts2Net: k2.net,
      kts2Score: k2.score,
      netDelta,
      scoreDelta,
      successPct: k2.successPct,
      status,
      focusAdvice,
      weakTopicNote: entry.weakTopicNote,
    };
  });

  rows.sort((a, b) => {
    if (b.kts2Score !== a.kts2Score) return b.kts2Score - a.kts2Score;
    if (b.kts2Net !== a.kts2Net) return b.kts2Net - a.kts2Net;
    return b.netDelta - a.netDelta;
  });

  return rows.map((row, idx) => {
    const rank = idx + 1;
    const top3Badge: 1 | 2 | 3 | null = rank === 1 ? 1 : rank === 2 ? 2 : rank === 3 ? 3 : null;
    return { ...row, rank, top3Badge };
  });
}

export function computeWeeklyCohortInsights(
  rows: WeeklyComparisonRow[]
): WeeklyCohortInsights {
  if (rows.length === 0) {
    return {
      totalStudents: 0,
      avgKts1Score: 0,
      avgKts2Score: 0,
      avgScoreDelta: 0,
      avgSuccessPct: 0,
      topPerformer: null,
      risingStar: null,
      needsSupportCount: 0,
      highAchieverCount: 0,
    };
  }

  const total = rows.length;
  const avgKts1Score = Number(
    (rows.reduce((s, r) => s + r.kts1Score, 0) / total).toFixed(1)
  );
  const avgKts2Score = Number(
    (rows.reduce((s, r) => s + r.kts2Score, 0) / total).toFixed(1)
  );
  const avgScoreDelta = Number((avgKts2Score - avgKts1Score).toFixed(1));
  const avgSuccessPct = Math.round(
    rows.reduce((s, r) => s + r.successPct, 0) / total
  );

  const topPerformer = [...rows].sort((a, b) => a.rank - b.rank)[0] ?? null;
  const risingCandidates = [...rows].sort((a, b) => {
    if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
    return b.netDelta - a.netDelta;
  });
  const risingStar =
    risingCandidates[0] && risingCandidates[0].scoreDelta > 0
      ? risingCandidates[0]
      : null;

  const needsSupportCount = rows.filter(
    (r) => r.status === 'Destek Gerekiyor' || r.status === 'Çalışması Gerekiyor'
  ).length;
  const highAchieverCount = rows.filter((r) => r.status === 'Üstün Başarı').length;

  return {
    totalStudents: total,
    avgKts1Score,
    avgKts2Score,
    avgScoreDelta,
    avgSuccessPct,
    topPerformer,
    risingStar,
    needsSupportCount,
    highAchieverCount,
  };
}

export function filterAndSortWeeklyRows(
  rows: WeeklyComparisonRow[],
  options: {
    search?: string;
    statusFilter?: WeeklyStatusFilter;
    sortKey?: WeeklySortKey;
    sortDir?: 'asc' | 'desc';
  }
): WeeklyComparisonRow[] {
  const q = (options.search ?? '').trim().toLowerCase();
  const statusFilter = options.statusFilter ?? 'all';
  const sortKey = options.sortKey ?? 'rank';
  const sortDir = options.sortDir ?? (sortKey === 'rank' ? 'asc' : 'desc');

  const filtered = rows.filter((r) => {
    if (statusFilter === 'top3' && !r.top3Badge) return false;
    if (
      statusFilter === 'needs-support' &&
      r.status !== 'Destek Gerekiyor' &&
      r.status !== 'Çalışması Gerekiyor'
    ) {
      return false;
    }
    if (
      (statusFilter === 'Üstün Başarı' || statusFilter === 'İyi Gelişim') &&
      r.status !== statusFilter
    ) {
      return false;
    }
    if (!q) return true;
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.studentNumber8.includes(q) ||
      r.classroom.toLowerCase().includes(q) ||
      (r.weakTopicNote ?? '').toLowerCase().includes(q)
    );
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (sortKey === 'kts1') return (a.kts1Score - b.kts1Score) * dir;
    if (sortKey === 'kts2') return (a.kts2Score - b.kts2Score) * dir;
    if (sortKey === 'delta') return (a.scoreDelta - b.scoreDelta) * dir;
    return (a.rank - b.rank) * dir;
  });
}

export function filterRowsForBulkMessages(
  rows: WeeklyComparisonRow[],
  filterMode: WeeklyBulkFilterMode
): WeeklyComparisonRow[] {
  if (filterMode === 'top3') return rows.filter((r) => Boolean(r.top3Badge));
  if (filterMode === 'needs-support') {
    return rows.filter(
      (r) => r.status === 'Destek Gerekiyor' || r.status === 'Çalışması Gerekiyor'
    );
  }
  return rows;
}

export function buildParentMessage(params: {
  row: WeeklyComparisonRow;
  academyName: string;
  kts1Name: string;
  kts2Name: string;
  gradeLabel: string;
  gradeProfile?: GradeProfile;
  mode?: ParentMessageTemplateMode;
}): string {
  const { row, academyName, gradeProfile } = params;
  const safeGrade = sanitizeExamLabelForGrade(params.gradeLabel, gradeProfile);
  const safeClass = normalizeClassroomForGrade(row.classroom, gradeProfile);
  const safeKts1 = sanitizeExamLabelForGrade(params.kts1Name, gradeProfile);
  const safeKts2 = sanitizeExamLabelForGrade(params.kts2Name, gradeProfile);
  const mode = params.mode ?? 'auto';
  const deltaSign = row.scoreDelta >= 0 ? '+' : '';
  const netDeltaSign = row.netDelta >= 0 ? '+' : '';
  const weakNote = sanitizeExamLabelForGrade(
    row.weakTopicNote?.trim() || 'temel konu ve soru çözüm tekrarı',
    gradeProfile
  );
  const classTag = safeClass.toLowerCase().includes(safeGrade.toLowerCase())
    ? safeClass
    : `${safeGrade} · ${safeClass}`;

  if (mode === 'short-sms') {
    const medalTag = row.top3Badge ? ` (${row.top3Badge}. Derece Başarı Rozeti!)` : '';
    return `${academyName}: Sayın Veli, ${row.studentName} (${classTag}) ${safeKts2}: ${row.kts2Net.toFixed(1)} Net / ${row.kts2Score.toFixed(1)} Puan (%${row.successPct}, ${row.rank}. sıra)${medalTag}. Gelişim: ${deltaSign}${row.scoreDelta.toFixed(1)}p.`;
  }

  const effectiveMode: Exclude<
    ParentMessageTemplateMode,
    'auto' | 'short-sms' | 'written-prep-20' | 'open-ended-10'
  > =
    mode === 'top3-celebration' || mode === 'progress-update' || mode === 'study-alert'
      ? mode
      : row.top3Badge
        ? 'top3-celebration'
        : row.status === 'Çalışması Gerekiyor' || row.status === 'Destek Gerekiyor'
          ? 'study-alert'
          : 'progress-update';

  const headerBlock = `Sayın Velimiz,\nKurum: ${academyName}\nÖğrenci: ${row.studentName} (${classTag})`;
  const scoreBlock = `Notlar:\n• ${safeKts1}: ${row.kts1Net.toFixed(2)} Net (${row.kts1Score.toFixed(1)} Puan)\n• ${safeKts2}: ${row.kts2Net.toFixed(2)} Net (${row.kts2Score.toFixed(1)} Puan · Kurum ${row.rank}. Sıra / %${row.successPct})`;

  if (effectiveMode === 'top3-celebration') {
    const medalLabel =
      row.top3Badge === 1
        ? '1.lik Altın Başarı'
        : row.top3Badge === 2
          ? '2.lik Gümüş Başarı'
          : row.top3Badge === 3
            ? '3.lük Bronz Başarı'
            : 'Üstün Başarı Onur';
    return `${headerBlock}\nBaşarı Rozeti: ${medalLabel}\n\n${scoreBlock}\n\nGelişim Analizi: ${netDeltaSign}${row.netDelta.toFixed(2)} Net (${deltaSign}${row.scoreDelta.toFixed(1)} Puan) değişimle derece bandındaki yerini korudu. Başarılarının devamını dileriz. — ${academyName}`;
  }

  if (effectiveMode === 'study-alert') {
    return `${headerBlock}\n\n${scoreBlock}\n\nGelişim Analizi: Durumu "${row.status}" (${netDeltaSign}${row.netDelta.toFixed(2)} Net / ${deltaSign}${row.scoreDelta.toFixed(1)} Puan). "${weakNote}" konusunda haftalık etüt çalışması net artışını hızlandıracaktır. Birebir etüt planlaması için görüşmekten memnuniyet duyarız. — ${academyName}`;
  }

  return `${headerBlock}\n\n${scoreBlock}\n\nGelişim Analizi: Haftalık fark ${netDeltaSign}${row.netDelta.toFixed(2)} Net (${deltaSign}${row.scoreDelta.toFixed(1)} Puan). "${weakNote}" pekiştirmesiyle bir üst başarı bandına hızla ilerlemektedir. — ${academyName}`;
}

export const REPORT_CARD_MESSAGE_TEMPLATES: Array<{
  id: ParentMessageTemplateMode;
  label: string;
}> = [
  { id: 'auto', label: 'Akıllı Otomatik' },
  { id: 'top3-celebration', label: 'Üstün Başarı Tebriği' },
  { id: 'progress-update', label: 'Gelişim & Konu Analizi' },
  { id: 'study-alert', label: 'Etüt & Destek Planı' },
  { id: 'written-prep-20', label: '20 Soruluk Yazılıya Hazırlık' },
  { id: 'open-ended-10', label: '10 Soruluk Açık Uçlu Sınav' },
  { id: 'short-sms', label: 'Kısa SMS Özeti' },
];

export const DEFAULT_CUSTOM_PARENT_TEMPLATES: CustomParentMessageTemplate[] = [
  {
    id: 'tpl-written-20',
    name: '20 Soruluk Yazılıya Hazırlık Şablonu',
    category: 'yazili-20',
    body: `Sayın Velimiz,\nKurum: {kurum}\nÖğrenci: {ogrenci} ({sinif})\nSınav: 20 Soruluk Yazılıya Hazırlık Değerlendirmesi\nGelişim Durumu: {durum}\n\nYazılı Hazırlık Sonucu:\n• Başarı: {net} Net · {puan} Puan (%{basari})\n• Güçlü Alan: {guclu}\n• Destek Konusu: {eksik}\n\nOkul yazılısı öncesi kısa tekrar ile tam başarı hedeflenmektedir. — {kurum}`,
  },
  {
    id: 'tpl-open-10',
    name: '10 Soruluk Açık Uçlu Kağıt Analizi Şablonu',
    category: 'acik-uclu-10',
    body: `Sayın Velimiz,\nKurum: {kurum}\nÖğrenci: {ogrenci} ({sinif})\nSınav: 10 Soruluk Açık Uçlu (Klasik) Kağıt Değerlendirmesi\nGelişim Durumu: {durum}\n\nKağıt Puanı: {puan} / 100 (%{basari})\nOdak Konu: {eksik}\n\nAçık uçlu çözüm basamakları üzerinden birebir geri bildirim verilmiştir. — {kurum}`,
  },
  {
    id: 'tpl-etut-takip',
    name: 'Haftalık Etüt & Veli Görüşme Daveti',
    category: 'etut',
    body: `Sayın Velimiz,\n{ogrenci} ({sinif}) öğrencimizin {sinav} sonucu {net} Net ({puan} Puan · {durum}) olarak gerçekleşmiştir.\n"{eksik}" konusunda hafta içi etüt çalışması planlanmıştır. Uygun olduğunuzda görüşmekten memnuniyet duyarız. — {kurum}`,
  },
];

export function applyCustomParentTemplate(params: {
  templateBody: string;
  analysis: ExamAnalysisResult;
  academyName: string;
  gradeProfile: GradeProfile;
}): string {
  const { templateBody, analysis, academyName, gradeProfile } = params;
  const safeGrade = gradeProfile.shortLabel;
  const safeClass = normalizeClassroomForGrade(analysis.classroom, gradeProfile);
  const classTag = safeClass.toLowerCase().includes(safeGrade.toLowerCase())
    ? safeClass
    : `${safeGrade} · ${safeClass}`;
  const safeExam = sanitizeExamLabelForGrade(analysis.examTitle, gradeProfile);
  const successPct =
    analysis.totalQuestions > 0
      ? Math.max(0, Math.round((analysis.totalNet / analysis.totalQuestions) * 100))
      : 0;
  const developmentStatus = resolveReportCardDevelopmentStatus(analysis);
  const sorted = [...analysis.subjectMetrics].sort((a, b) => b.accuracyPct - a.accuracyPct);
  const strongest = sorted[0]
    ? sanitizeExamLabelForGrade(sorted[0].subject, gradeProfile)
    : 'Genel';
  const weakestTopic = analysis.topicGaps
    .filter((t) => t.status === 'Kritik Eksik')
    .slice(0, 2)
    .map((t) => sanitizeExamLabelForGrade(t.topic, gradeProfile))
    .join(', ');
  const weakest =
    weakestTopic ||
    (sorted[sorted.length - 1]
      ? sanitizeExamLabelForGrade(sorted[sorted.length - 1].subject, gradeProfile)
      : 'Temel tekrar');

  const replaced = templateBody
    .replace(/\{ogrenci\}/gi, analysis.studentName || 'Öğrenci')
    .replace(/\{kurum\}/gi, academyName)
    .replace(/\{sinif\}/gi, classTag)
    .replace(/\{sinav\}/gi, safeExam)
    .replace(/\{net\}/gi, analysis.totalNet.toFixed(2))
    .replace(/\{puan\}/gi, analysis.estimatedScore.toFixed(1))
    .replace(/\{basari\}/gi, String(successPct))
    .replace(/\{durum\}/gi, developmentStatus)
    .replace(/\{guclu\}/gi, strongest)
    .replace(/\{eksik\}/gi, weakest);

  return sanitizeExamLabelForGrade(replaced, gradeProfile);
}

export function resolveReportCardDevelopmentStatus(
  analysis: ExamAnalysisResult
): WeeklyPerformanceStatus {
  const successPct =
    analysis.totalQuestions > 0
      ? Math.max(0, Math.round((analysis.totalNet / analysis.totalQuestions) * 100))
      : 0;
  const prevPoint =
    analysis.historicalTrend.length >= 2
      ? analysis.historicalTrend[analysis.historicalTrend.length - 2]
      : null;
  const netDelta = prevPoint ? Number((analysis.totalNet - prevPoint.net).toFixed(2)) : 0;
  return determineWeeklyStatus(successPct, netDelta);
}

export function buildReportCardParentMessage(params: {
  analysis: ExamAnalysisResult;
  academyName: string;
  gradeProfile: GradeProfile;
  shortMode?: boolean;
  templateMode?: ParentMessageTemplateMode;
}): string {
  const { analysis, academyName, gradeProfile, shortMode } = params;
  const safeGrade = gradeProfile.shortLabel;
  const safeClass = normalizeClassroomForGrade(analysis.classroom, gradeProfile);
  const safeExamTitle = sanitizeExamLabelForGrade(analysis.examTitle, gradeProfile);
  const classTag = safeClass.toLowerCase().includes(safeGrade.toLowerCase())
    ? safeClass
    : `${safeGrade} · ${safeClass}`;

  const successPct =
    analysis.totalQuestions > 0
      ? Math.max(0, Math.round((analysis.totalNet / analysis.totalQuestions) * 100))
      : 0;
  const sortedSubjects = [...analysis.subjectMetrics].sort(
    (a, b) => b.accuracyPct - a.accuracyPct
  );
  const strongest = sortedSubjects[0];
  const weakest = sortedSubjects[sortedSubjects.length - 1];
  const criticalTopics = analysis.topicGaps
    .filter((t) => t.status === 'Kritik Eksik')
    .slice(0, 2)
    .map((t) => sanitizeExamLabelForGrade(t.topic, gradeProfile));

  const prevPoint =
    analysis.historicalTrend.length >= 2
      ? analysis.historicalTrend[analysis.historicalTrend.length - 2]
      : null;
  const netDelta = prevPoint ? Number((analysis.totalNet - prevPoint.net).toFixed(2)) : 0;
  const scoreDelta = prevPoint
    ? Number((analysis.estimatedScore - prevPoint.score).toFixed(1))
    : 0;
  const netSign = netDelta >= 0 ? '+' : '';
  const scoreSign = scoreDelta >= 0 ? '+' : '';
  const developmentStatus = resolveReportCardDevelopmentStatus(analysis);

  const requestedMode: ParentMessageTemplateMode =
    params.templateMode ?? (shortMode ? 'short-sms' : 'auto');

  if (requestedMode === 'short-sms') {
    const rankTag = analysis.academyRank <= 3 ? ` (${analysis.academyRank}. Derece!)` : '';
    return `${academyName}: Sayın Veli, ${analysis.studentName} (${classTag}) ${safeExamTitle}: ${analysis.totalNet.toFixed(1)} Net, ${analysis.estimatedScore.toFixed(1)} Puan (%${successPct} · ${developmentStatus}${rankTag}). Öncelik: ${weakest?.subject ?? 'Genel tekrar'}.`;
  }

  const effectiveMode: Exclude<ParentMessageTemplateMode, 'auto' | 'short-sms'> =
    requestedMode !== 'auto'
      ? requestedMode
      : analysis.academyRank <= 3 || developmentStatus === 'Üstün Başarı'
        ? 'top3-celebration'
        : developmentStatus === 'Çalışması Gerekiyor' ||
            developmentStatus === 'Destek Gerekiyor'
          ? 'study-alert'
          : 'progress-update';

  const strongestSafe = strongest
    ? sanitizeExamLabelForGrade(strongest.subject, gradeProfile)
    : '';
  const weakestSafe = weakest
    ? sanitizeExamLabelForGrade(weakest.subject, gradeProfile)
    : '';

  const subjectLine = strongest
    ? `• En Güçlü Ders: ${strongestSafe} (%${strongest.accuracyPct} · ${strongest.net.toFixed(1)} Net)`
    : '';
  const focusSubjectLine =
    weakest && weakest.subject !== strongest?.subject
      ? `• Gelişim Odağı: ${weakestSafe} (%${weakest.accuracyPct} · ${weakest.net.toFixed(1)} Net)`
      : '';
  const trendNote = prevPoint
    ? `Önceki denemeye göre ${netSign}${netDelta.toFixed(2)} Net (${scoreSign}${scoreDelta.toFixed(1)} Puan) değişim gösterdi.`
    : `Sonraki sınav hedefi ${analysis.projectedNet.toFixed(1)} Net (${analysis.projectedScore.toFixed(1)} Puan) olarak öngörülmektedir.`;
  const topicNote =
    criticalTopics.length > 0
      ? ` "${criticalTopics.join(', ')}" konularında kısa tekrar önerilir.`
      : ' Mevcut kazanım hakimiyetini düzenli soru çözümüyle koruyor.';

  const headerBlock = `Sayın Velimiz,\nKurum: ${academyName}\nÖğrenci: ${analysis.studentName} (${classTag})\nSınav: ${safeExamTitle}\nGelişim Durumu: ${developmentStatus}`;
  const scoreBlock = `Notlar:\n• Sonuç: ${analysis.totalNet.toFixed(2)} Net · ${analysis.estimatedScore.toFixed(1)} Puan (%${successPct} Başarı · Kurum ${analysis.academyRank}. Sıra)\n• Dağılım: ${analysis.totalCorrect} Doğru · ${analysis.totalWrong} Yanlış · ${analysis.totalBlank} Boş\n${subjectLine}${focusSubjectLine ? `\n${focusSubjectLine}` : ''}`;

  if (effectiveMode === 'written-prep-20') {
    const focusTopicsText =
      criticalTopics.length > 0
        ? criticalTopics.join(', ')
        : `${weakestSafe || 'ilgili'} kazanım pekiştirmeleri`;
    return `${headerBlock}\nDeğerlendirme Türü: 20 Soruluk Yazılıya Hazırlık\n\n${scoreBlock}\n\nYazılı Hazırlık Değerlendirmesi: Okul yazılısı öncesi ${safeGrade} müfredatında %${successPct} hazırbulunuşluk düzeyindedir. Sınav öncesi ${focusTopicsText} başlıklarından kısa tekrar yapılması tam puan hedefini destekleyecektir. — ${academyName}`;
  }

  if (effectiveMode === 'open-ended-10') {
    const focusTopicsText =
      criticalTopics.length > 0
        ? criticalTopics.join(', ')
        : `${weakestSafe || 'temel'} çözüm adımları`;
    return `${headerBlock}\nDeğerlendirme Türü: 10 Soruluk Açık Uçlu (Klasik) Yazılı\n\n${scoreBlock}\n\nAçık Uçlu Kağıt Değerlendirmesi: Öğrencimizin klasik/açık uçlu sorularda yazılı anlatım ve işlem basamağı başarısı %${successPct} olarak ölçülmüştür. ${focusTopicsText} sorularında adım adım çözüm yazma pratiği önerilmektedir. — ${academyName}`;
  }

  if (effectiveMode === 'top3-celebration') {
    const honorLine =
      analysis.academyRank <= 3
        ? `Kurum genelinde ${analysis.academyRank}. sırada yer alarak üstün başarı göstermiştir.`
        : `%${successPct} başarı oranıyla derece bandındaki yerini güçlü şekilde korumaktadır.`;
    return `${headerBlock}\n\n${scoreBlock}\n\nGelişim Analizi: ${honorLine} ${trendNote} Tebrik eder, başarılarının devamını dileriz. — ${academyName}`;
  }

  if (effectiveMode === 'study-alert') {
    const focusTopicsText =
      criticalTopics.length > 0
        ? criticalTopics.join(', ')
        : `${weakestSafe || 'temel'} kazanım tekrarları`;
    return `${headerBlock}\n\n${scoreBlock}\n\nGelişim Analizi: Öğrencimizin "${developmentStatus}" aşamasında hızlı net artışı sağlaması için ${focusTopicsText} başlıklarında haftalık birebir etüt ve 15 dakikalık günlük tekrar planlanması önerilmektedir. Etüt takvimi için görüşmekten memnuniyet duyarız. — ${academyName}`;
  }

  return `${headerBlock}\n\n${scoreBlock}\n\nGelişim Analizi: ${trendNote}${topicNote}\n\nBilgilerinize sunarız. — ${academyName}`;
}

export function buildSampleWeeklyCohort(params: {
  institution: Institution;
  gradeId: GradeLevelId;
  questionCount: number;
  existingStudents?: StudentRecord[];
}): WeeklyStudentScore[] {
  const profile = getGradeProfile(params.gradeId);
  const qCount = Math.max(10, params.questionCount);
  const defaultClass = defaultClassroomForGrade(params.gradeId);
  const usedNums = new Set<string>();

  const presetNames = [
    { name: 'Alihan Sarı', k1Ratio: 0.85, k2Ratio: 0.94, weak: 'Yeni nesil grafik soruları' },
    { name: 'Zeynep Karahan', k1Ratio: 0.8, k2Ratio: 0.89, weak: 'Kesir problemleri' },
    { name: 'Talha Tayfur', k1Ratio: 0.74, k2Ratio: 0.84, weak: 'Paragraf yorumlama' },
    { name: 'Elif Naz Demir', k1Ratio: 0.72, k2Ratio: 0.79, weak: 'Ondalık gösterim' },
    { name: 'Yusuf Emre Kaya', k1Ratio: 0.68, k2Ratio: 0.75, weak: 'Kuvvet ve hareket' },
    { name: 'Ayşe Beren Yılmaz', k1Ratio: 0.64, k2Ratio: 0.71, weak: 'Yazım kuralları' },
    { name: 'Kerem Can Şahin', k1Ratio: 0.62, k2Ratio: 0.67, weak: 'Yüzdeler' },
    { name: 'Miray Su Çelik', k1Ratio: 0.58, k2Ratio: 0.64, weak: 'Anadolu medeniyetleri' },
    { name: 'Ömer Asaf Aydın', k1Ratio: 0.55, k2Ratio: 0.59, weak: 'Madde ve değişim' },
    { name: 'Defne Yıldız', k1Ratio: 0.52, k2Ratio: 0.55, weak: 'Sözcükte yapı' },
    { name: 'Eymen Aras Koç', k1Ratio: 0.49, k2Ratio: 0.51, weak: 'Doğal sayılarla işlemler' },
    { name: 'Hiranur Öztürk', k1Ratio: 0.44, k2Ratio: 0.48, weak: 'Fen deney soruları' },
    { name: 'Berat Kaan Arslan', k1Ratio: 0.42, k2Ratio: 0.41, weak: 'Temel matematik işlemleri' },
    { name: 'Nehir Aksoy', k1Ratio: 0.36, k2Ratio: 0.39, weak: 'Okuduğunu anlama ve süre' },
    { name: 'Miraç Efe Güneş', k1Ratio: 0.32, k2Ratio: 0.34, weak: 'Temel kazanım tekrarı' },
  ];

  // Prioritize any existing registered students in this institution first
  const realStudents = (params.existingStudents ?? []).filter(
    (s) => s.institutionId === params.institution.id
  );

  const list: WeeklyStudentScore[] = [];

  realStudents.slice(0, 15).forEach((stu, i) => {
    usedNums.add(stu.studentNumber8);
    const ratios = presetNames[i % presetNames.length];
    const k1C = Math.round(qCount * ratios.k1Ratio);
    const k1W = Math.max(0, Math.min(qCount - k1C, Math.round(qCount * 0.12)));
    const k2C = Math.round(qCount * ratios.k2Ratio);
    const k2W = Math.max(0, Math.min(qCount - k2C, Math.round(qCount * 0.09)));

    list.push({
      studentId: stu.id,
      studentName: stu.fullName,
      studentNumber8: stu.studentNumber8,
      classroom: normalizeClassroomForGrade(stu.classroom, profile),
      parentPhone: stu.parentPhone,
      kts1Correct: k1C,
      kts1Wrong: k1W,
      kts1Blank: Math.max(0, qCount - k1C - k1W),
      kts2Correct: k2C,
      kts2Wrong: k2W,
      kts2Blank: Math.max(0, qCount - k2C - k2W),
      weakTopicNote: ratios.weak,
    });
  });

  for (let i = list.length; i < 15; i++) {
    const preset = presetNames[i];
    const num8 = generate8DigitStudentNumber(preset.name, params.institution.code8, usedNums);
    usedNums.add(num8);
    const k1C = Math.round(qCount * preset.k1Ratio);
    const k1W = Math.max(0, Math.min(qCount - k1C, Math.round(qCount * 0.14)));
    const k2C = Math.round(qCount * preset.k2Ratio);
    const k2W = Math.max(0, Math.min(qCount - k2C, Math.round(qCount * 0.1)));

    list.push({
      studentId: `wk-sample-${i + 1}`,
      studentName: preset.name,
      studentNumber8: num8,
      classroom: defaultClass,
      kts1Correct: k1C,
      kts1Wrong: k1W,
      kts1Blank: Math.max(0, qCount - k1C - k1W),
      kts2Correct: k2C,
      kts2Wrong: k2W,
      kts2Blank: Math.max(0, qCount - k2C - k2W),
      weakTopicNote: preset.weak,
    });
  }

  return list;
}
