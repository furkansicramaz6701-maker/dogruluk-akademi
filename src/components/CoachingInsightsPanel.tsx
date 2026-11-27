import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Compass,
  Loader2,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CoachingFocusPriority,
  CoachingInsightsReport,
  CoachingTrendDirection,
  ExamAnalysisResult,
  GradeProfile,
  PenaltyDivisor,
  TopicGapMetric,
  WeeklyStudentScore,
} from '../types/academy';
import {
  buildCoachingInsightsPayload,
  buildMultiExamTrendSummary,
  extractExtraExamsFromWeekly,
  normalizeCoachingInsightsResponse,
  prioritizeTopicGapsForCoaching,
} from '../utils/coachingInsights';

interface CoachingInsightsPanelProps {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  hasLiveAnalysis: boolean;
  penaltyDivisor: PenaltyDivisor;
  weeklyEntries?: WeeklyStudentScore[];
  weeklyQuestionCount?: number;
  onScheduleRemedial?: (topicGap: TopicGapMetric) => void;
  onApplyCoachNote?: (summary: string) => void;
  onInsightsChange?: (report: CoachingInsightsReport | null) => void;
  onQuickShare?: () => void;
  onOpenOmr?: () => void;
}

const DIRECTION_STYLES: Record<
  CoachingTrendDirection,
  { label: string; colorClass: string; dotClass: string }
> = {
  yukselis: {
    label: 'Yükseliş İvmesi',
    colorClass: 'text-emerald-700 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  dengeli: {
    label: 'Dengeli Seyir',
    colorClass: 'text-blue-700 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
  'destek-gerekli': {
    label: 'Destek & Telafi Odağı',
    colorClass: 'text-rose-700 dark:text-rose-300',
    dotClass: 'bg-rose-500',
  },
};

const PRIORITY_STYLES: Record<
  CoachingFocusPriority,
  { label: string; textClass: string; dotClass: string }
> = {
  yuksek: {
    label: 'Yüksek Öncelik',
    textClass: 'text-rose-700 dark:text-rose-300',
    dotClass: 'bg-rose-500',
  },
  orta: {
    label: 'Orta Öncelik',
    textClass: 'text-amber-700 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  pekistirme: {
    label: 'Pekiştirme',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
};

export function CoachingInsightsPanel({
  analysis,
  gradeProfile,
  hasLiveAnalysis,
  penaltyDivisor,
  weeklyEntries = [],
  weeklyQuestionCount = 20,
  onScheduleRemedial,
  onApplyCoachNote,
  onInsightsChange,
  onQuickShare,
  onOpenOmr,
}: CoachingInsightsPanelProps) {
  const [insights, setInsights] = useState<CoachingInsightsReport | null>(null);
  const [insightsContextKey, setInsightsContextKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noteApplied, setNoteApplied] = useState(false);

  const extraHistory = useMemo(
    () =>
      extractExtraExamsFromWeekly({
        weeklyEntries,
        studentNumber: analysis.studentNumber,
        studentName: analysis.studentName,
        penaltyDivisor,
        questionCount: weeklyQuestionCount,
        gradeProfile,
      }),
    [
      weeklyEntries,
      analysis.studentNumber,
      analysis.studentName,
      penaltyDivisor,
      weeklyQuestionCount,
      gradeProfile,
    ]
  );

  const trendSummary = useMemo(
    () => buildMultiExamTrendSummary(analysis, extraHistory),
    [analysis, extraHistory]
  );

  const prioritizedGaps = useMemo(
    () => prioritizeTopicGapsForCoaching(analysis.topicGaps, 6),
    [analysis.topicGaps]
  );

  const criticalCount = analysis.topicGaps.filter((t) => t.status === 'Kritik Eksik').length;
  const developingCount = analysis.topicGaps.filter((t) => t.status === 'Geliştirilmeli').length;

  const currentContextKey = `${analysis.studentNumber}::${analysis.examTitle}::${analysis.totalNet}::${trendSummary.examCount}`;
  const activeInsights =
    insights && insightsContextKey === currentContextKey ? insights : null;

  useEffect(() => {
    onInsightsChange?.(activeInsights);
  }, [activeInsights, onInsightsChange]);

  const handleGenerateInsights = async () => {
    setLoading(true);
    setErrorMsg(null);
    setNoteApplied(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 35000);
    try {
      const payload = buildCoachingInsightsPayload(
        analysis,
        gradeProfile,
        extraHistory
      );
      const resp = await fetch('/api/analysis/coaching-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
        signal: controller.signal,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          data?.error || 'Gemini koçluk içgörüleri alınırken bir hata oluştu.'
        );
      }
      const normalized = normalizeCoachingInsightsResponse(
        data.insights,
        prioritizedGaps
      );
      setInsights(normalized);
      setInsightsContextKey(currentContextKey);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg(
          'Gemini yanıt süresi zaman aşımına uğradı. Lütfen tekrar deneyin.'
        );
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Gemini koçluk servisine ulaşılamadı.'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleScheduleFromFocus = (subject: string, topic: string) => {
    if (!onScheduleRemedial) return;
    const matched = analysis.topicGaps.find(
      (g) =>
        g.topic.toLocaleLowerCase('tr-TR') === topic.toLocaleLowerCase('tr-TR') ||
        (g.subject.toLocaleLowerCase('tr-TR') === subject.toLocaleLowerCase('tr-TR') &&
          g.topic.toLocaleLowerCase('tr-TR').includes(topic.toLocaleLowerCase('tr-TR')))
    );
    const gap: TopicGapMetric = matched ?? {
      subject,
      topic,
      gainCode: `${gradeProfile.shortLabel.replace(/\s+/g, '')}.KOC`,
      total: 4,
      correct: 1,
      wrong: 2,
      blank: 1,
      masteryPct: 25,
      status: 'Kritik Eksik',
    };
    onScheduleRemedial(gap);
  };

  const momentumMeta = DIRECTION_STYLES[trendSummary.momentum];

  return (
    <section
      aria-labelledby="coaching-insights-title"
      data-testid="coaching-insights-panel"
      className="surface-card rounded-xl p-5 space-y-4 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Compass className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="coaching-insights-title" className="text-base font-extrabold">
                Coaching Insights — Deneme &amp; Konu Odağı Analizi
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${momentumMeta.colorClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${momentumMeta.dotClass}`} aria-hidden="true" />
                {momentumMeta.label}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {hasLiveAnalysis
                ? `${analysis.studentName || 'Öğrenci'} · ${
                    trendSummary.examCount <= 1
                      ? '1. Deneme (İlk Kayıt)'
                      : `${trendSummary.examCount} deneme geçmişi`
                  } ve ${prioritizedGaps.length} öncelikli konu açığı Gemini ile analiz edilir`
                : 'Henüz deneme yapılmamış — Optik değerlendirme tamamlandığında kişisel çalışma odak alanları burada üretilir'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasLiveAnalysis ? (
            <>
              {onQuickShare && (
                <button
                  type="button"
                  data-testid="coaching-insights-quick-share-btn"
                  onClick={onQuickShare}
                  className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Hızlı Paylaş (WhatsApp)</span>
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGenerateInsights()}
                data-testid="coaching-insights-generate-btn"
                className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Gemini Analiz Ediyor...</span>
                  </>
                ) : activeInsights ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>İçgörüyü Yenile</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Gemini Koçluk İçgörüsü Oluştur</span>
                  </>
                )}
              </button>
            </>
          ) : (
            onOpenOmr && (
              <button
                type="button"
                onClick={onOpenOmr}
                className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Optik Okumaya Git
              </button>
            )
          )}
        </div>
      </div>

      {!hasLiveAnalysis ? (
        <div
          className="surface-alt rounded-xl p-4 text-xs leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
          data-testid="coaching-insights-empty-state"
        >
          Öğrenciye ait optik form değerlendirildiğinde, <strong>ilk deneme kaydından itibaren</strong> net/puan gidişatı ile eksik kazanımlar burada Gemini AI tarafından analiz edilerek kişisel çalışma odak alanlarına dönüştürülür.
        </div>
      ) : (
        <>
          {/* Multi-Exam Deterministic Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="surface-alt rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {trendSummary.examCount <= 1
                  ? 'İlk Deneme Kaydı (1 Sınav)'
                  : `Çoklu Deneme Net Trendi (${trendSummary.examCount} Sınav)`}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-display font-extrabold font-mono-num">
                  {trendSummary.examCount <= 1
                    ? `${(trendSummary.latestExam?.net ?? analysis.totalNet).toFixed(2)} Net`
                    : `${trendSummary.netDelta >= 0 ? '+' : ''}${trendSummary.netDelta.toFixed(2)} Net`}
                </span>
                {trendSummary.examCount > 1 && (
                  <span
                    className={`text-xs font-mono-num font-bold inline-flex items-center gap-0.5 ${
                      trendSummary.recentStepNetDelta >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {trendSummary.recentStepNetDelta >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    Son sınav: {trendSummary.recentStepNetDelta >= 0 ? '+' : ''}
                    {trendSummary.recentStepNetDelta.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                {trendSummary.examCount <= 1
                  ? `İlk Deneme Kaydı: ${(trendSummary.latestExam?.net ?? analysis.totalNet).toFixed(1)}n`
                  : `İlk: ${trendSummary.firstExam?.net.toFixed(1) ?? '0.0'}n → Son: ${trendSummary.latestExam?.net.toFixed(1) ?? '0.0'}n`}
              </div>
            </div>

            <div className="surface-alt rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Puan İvmesi &amp; Akademi Farkı
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-display font-extrabold font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                  {analysis.estimatedScore.toFixed(1)} Puan
                </span>
                <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
                  ({trendSummary.scoreDelta >= 0 ? '+' : ''}
                  {trendSummary.scoreDelta.toFixed(1)}p)
                </span>
              </div>
              <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                Akademi ort. farkı: {trendSummary.avgGapVsAcademy >= 0 ? '+' : ''}
                {trendSummary.avgGapVsAcademy.toFixed(2)} net
              </div>
            </div>

            <div className="surface-alt rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Tespit Edilen Konu Açıkları
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-display font-extrabold font-mono-num text-rose-600 dark:text-rose-400">
                  {criticalCount} Kritik
                </span>
                <span className="text-xs font-mono-num font-bold text-amber-600 dark:text-amber-400">
                  · {developingCount} Geliştirilmeli
                </span>
              </div>
              <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                Öncelik: {prioritizedGaps[0] ? `${prioritizedGaps[0].subject} (${prioritizedGaps[0].topic})` : 'Tüm konular dengeli'}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              data-testid="coaching-insights-error"
              className="rounded-xl p-3.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="leading-snug">{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateInsights()}
                className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          {/* Pre-generation Preview or Loading or Gemini Results */}
          {loading && (
            <div
              className="surface-alt rounded-xl p-5 flex items-center gap-3 text-xs font-semibold"
              aria-live="polite"
            >
              <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>
                {trendSummary.examCount <= 1
                  ? 'Gemini ilk deneme kaydını ve'
                  : `Gemini ${trendSummary.examCount} denemenin net trendini ve`}{' '}
                {prioritizedGaps.length} konu açığını analiz ederek kişisel odak planı hazırlıyor...
              </span>
            </div>
          )}

          {!loading && !activeInsights && !errorMsg && (
            <div className="surface-alt rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                  <span>Odak Analizi İçin Hazır Konu Açıkları</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {prioritizedGaps.length > 0
                    ? prioritizedGaps
                        .slice(0, 4)
                        .map((g) => `${g.subject}: ${g.topic} (%${g.masteryPct})`)
                        .join(' · ')
                    : 'Tüm konularda yüksek hakimiyet gözleniyor; pekiştirme önerisi üretilebilir.'}
                </p>
              </div>
              <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-secondary)' }}>
                Üstteki butona tıklayarak Gemini analizi başlatın
              </span>
            </div>
          )}

          {!loading && activeInsights && (
            <div className="space-y-4" data-testid="coaching-insights-result" aria-live="polite">
              {/* Headline & Multi-exam Trend Narrative */}
              <div
                className="surface-alt rounded-xl p-4 space-y-2.5 border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpenCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <h4 className="text-sm font-extrabold leading-snug">
                      {activeInsights.headline}
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                    Gemini · {activeInsights.generatedAt}
                  </span>
                </div>

                <p className="text-xs leading-relaxed">
                  {activeInsights.trendSummary}
                </p>

                <div className="surface-card rounded-lg p-2.5 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="font-bold">Güçlü Alanlar: </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {activeInsights.strengthsHighlight}
                    </span>
                  </div>
                </div>
              </div>

              {/* Personalized Study Focus Areas */}
              {activeInsights.focusAreas.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-extrabold flex items-center justify-between">
                    <span>Kişiselleştirilmiş Çalışma Odak Alanları ({activeInsights.focusAreas.length})</span>
                    <span className="text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                      Konu açıklarına göre önceliklendirildi
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeInsights.focusAreas.map((area, idx) => {
                      const pStyle = PRIORITY_STYLES[area.priority];
                      return (
                        <article
                          key={`${area.subject}-${area.topic}-${idx}`}
                          data-testid={`coaching-focus-area-${idx}`}
                          className="surface-alt rounded-xl p-3.5 border flex flex-col justify-between gap-3"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold" style={{ color: 'var(--accent-primary)' }}>
                                  {area.subject}
                                </div>
                                <h5 className="text-xs font-extrabold leading-snug">
                                  {area.topic}
                                </h5>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 text-[10px] font-bold">
                                <span className={`inline-flex items-center gap-1 uppercase tracking-wide ${pStyle.textClass}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pStyle.dotClass}`} aria-hidden="true" />
                                  {pStyle.label}
                                </span>
                                <span style={{ color: 'var(--border-subtle)' }} aria-hidden="true">|</span>
                                <span
                                  className="font-mono-num inline-flex items-center gap-1"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  <Clock className="w-3 h-3" aria-hidden="true" />
                                  {area.weeklyHours} sa/hf
                                </span>
                              </div>
                            </div>

                            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                              {area.reason}
                            </p>

                            <div className="surface-card rounded-lg p-2.5 text-xs leading-snug">
                              <strong className="font-bold">Önerilen Çalışma: </strong>
                              {area.recommendedAction}
                            </div>
                          </div>

                          {onScheduleRemedial && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleScheduleFromFocus(area.subject, area.topic)}
                                data-testid={`coaching-schedule-focus-${idx}`}
                                className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Etüt Planla</span>
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sync Coaching Note to Karne */}
              {onApplyCoachNote && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-[11px] italic flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                    “{activeInsights.weeklyCoachNote}”
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const summaryText = `${activeInsights.headline}\n\n${activeInsights.trendSummary}\n\nÖncelikli Odak Alanları:\n${activeInsights.focusAreas
                        .map(
                          (f, i) =>
                            `${i + 1}. ${f.subject} — ${f.topic} (${f.weeklyHours} sa/hf): ${f.recommendedAction}`
                        )
                        .join('\n')}\n\nKoç Notu: ${activeInsights.weeklyCoachNote}`;
                      onApplyCoachNote(summaryText);
                      setNoteApplied(true);
                    }}
                    data-testid="coaching-apply-to-karne-btn"
                    className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {noteApplied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Karneye Aktarıldı</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Karneye Koç Notunu Aktar</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
