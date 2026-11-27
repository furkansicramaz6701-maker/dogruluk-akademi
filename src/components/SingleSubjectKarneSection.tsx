import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, CalendarPlus, CheckCircle2, Grid3X3, ShieldCheck, Target } from 'lucide-react';
import { ExamAnalysisResult, GradeProfile, TopicGapMetric } from '../types/academy';
import { buildSingleSubjectKarneSummary } from '../utils/singleSubjectKarne';
import { DynamicAchievementBadge } from './DynamicAchievementBadge';

interface SingleSubjectKarneSectionProps {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  onScheduleTopicStudy?: (topic: TopicGapMetric) => void;
}

export function SingleSubjectKarneSection({
  analysis,
  gradeProfile,
  onScheduleTopicStudy,
}: SingleSubjectKarneSectionProps) {
  const summary = buildSingleSubjectKarneSummary(analysis);
  if (!summary) return null;

  const { subjectMetric, accuracyPct, netRatePct, priorityTopics, strongestTopic, weakestTopic, coachingNote } =
    summary;

  const chartData = priorityTopics.map((t) => ({
    topicShort: t.topic.length > 22 ? `${t.topic.slice(0, 21)}…` : t.topic,
    topic: t.topic,
    masteryPct: t.masteryPct,
    correct: t.correct,
    wrong: t.wrong,
    blank: t.blank,
    total: t.total,
    status: t.status,
  }));

  return (
    <section
      data-testid="single-subject-karne-section"
      aria-labelledby="single-subject-karne-heading"
      className="surface-card rounded-xl p-5 space-y-5 border"
      style={{ borderColor: 'var(--accent-primary)' }}
    >
      {/* Hero Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Award className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <h3 id="single-subject-karne-heading" className="text-lg font-display font-extrabold">
              Tek Ders Odaklı Gelişmiş Karne: {subjectMetric.subject} ({subjectMetric.total} Soru)
            </h3>
            <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--text-secondary)' }}>
              · {gradeProfile.shortLabel}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {coachingNote}
          </p>
          {analysis.columnAlignment && (
            <div
              data-testid="single-subject-alignment-note"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{analysis.columnAlignment.message}</span>
            </div>
          )}
        </div>

        <DynamicAchievementBadge
          rank={analysis.academyRank}
          successPct={accuracyPct}
          size="md"
        />
      </div>

      {/* 4 Crisp KPI Stat Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="surface-alt rounded-xl p-3.5">
          <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
            {subjectMetric.subject} Neti
          </div>
          <div className="text-2xl font-mono-num font-extrabold mt-1" style={{ color: 'var(--accent-primary)' }}>
            {subjectMetric.net.toFixed(2)} <span className="text-xs font-semibold opacity-70">/ {subjectMetric.total}</span>
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Net Oranı: %{netRatePct}
          </div>
        </div>

        <div className="surface-alt rounded-xl p-3.5">
          <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Doğru · Yanlış · Boş
          </div>
          <div className="text-xl font-mono-num font-extrabold mt-1">
            <span className="text-emerald-600 dark:text-emerald-400">{subjectMetric.correct}D</span>{' '}
            · <span className="text-rose-600 dark:text-rose-400">{subjectMetric.wrong}Y</span>{' '}
            · <span style={{ color: 'var(--text-secondary)' }}>{subjectMetric.blank}B</span>
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            İsabet Oranı: %{accuracyPct}
          </div>
        </div>

        <div className="surface-alt rounded-xl p-3.5">
          <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
            En Güçlü Kazanım
          </div>
          <div className="text-xs font-extrabold mt-1.5 text-emerald-700 dark:text-emerald-300 line-clamp-2">
            {strongestTopic ? strongestTopic.topic : '—'}
          </div>
          <div className="text-[11px] font-mono-num mt-1" style={{ color: 'var(--text-secondary)' }}>
            {strongestTopic ? `%${strongestTopic.masteryPct} (${strongestTopic.correct}/${strongestTopic.total})` : ''}
          </div>
        </div>

        <div className="surface-alt rounded-xl p-3.5">
          <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Öncelikli Odak Konusu
          </div>
          {!weakestTopic ? (
            <div className="text-xs font-extrabold mt-1.5">—</div>
          ) : weakestTopic.status === 'Tam Hakimiyet' ? (
            <>
              <div className="text-xs font-extrabold mt-1.5 text-emerald-700 dark:text-emerald-300">
                Eksik Konu Yok
              </div>
              <div className="text-[11px] font-mono-num mt-1" style={{ color: 'var(--text-secondary)' }}>
                Tüm kazanımlar Tam Hakimiyet
              </div>
            </>
          ) : (
            <>
              <div
                className={`text-xs font-extrabold mt-1.5 line-clamp-2 ${
                  weakestTopic.status === 'Geliştirilmeli'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {weakestTopic.topic}
              </div>
              <div className="text-[11px] font-mono-num mt-1" style={{ color: 'var(--text-secondary)' }}>
                %{weakestTopic.masteryPct} ({weakestTopic.status})
              </div>
            </>
          )}
        </div>
      </div>

      {/* Topic Mastery Chart + Priority Prescription */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 surface-alt rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <h4 className="text-sm font-bold">
                {subjectMetric.subject} Konu Bazlı Kazanım Hakimiyeti (%)
              </h4>
            </div>
            <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {priorityTopics.length} konu
            </span>
          </div>

          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="topicShort" width={135} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`%${value}`, 'Hakimiyet']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.topic || String(label)}
                />
                <Bar dataKey="masteryPct" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.status === 'Tam Hakimiyet'
                          ? '#059669'
                          : entry.status === 'Geliştirilmeli'
                            ? '#d97706'
                            : '#e11d48'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 surface-alt rounded-xl p-4 space-y-2.5">
          <h4 className="text-sm font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            <span>Öncelikli Konu Reçetesi &amp; Etüt Atama</span>
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {priorityTopics.map((topic) => (
              <div
                key={`${topic.subject}-${topic.topic}`}
                className="surface-card rounded-lg p-2.5 flex items-center justify-between gap-2 border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{topic.topic}</div>
                  <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                    {topic.correct}D · {topic.wrong}Y · {topic.blank}B · %{topic.masteryPct} ({topic.status})
                  </div>
                </div>
                {onScheduleTopicStudy && topic.status !== 'Tam Hakimiyet' && (
                  <button
                    type="button"
                    onClick={() => onScheduleTopicStudy(topic)}
                    className="btn-3d-secondary px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <CalendarPlus className="w-3 h-3" aria-hidden="true" />
                    <span>Etüt</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 1..N Question Diagnostic Grid */}
      <div className="surface-alt rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <h4 className="text-sm font-bold">
              {subjectMetric.subject} — {analysis.questionDetails.length} Soruluk Bireysel Soru Analiz Haritası
            </h4>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Yeşil: Doğru · Kırmızı: Yanlış · Gri: Boş (Soru numarası, kazanım ve hata nedeni)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2" data-testid="single-subject-question-grid">
          {analysis.questionDetails.map((q) => {
            const bgCls =
              q.status === 'dogru'
                ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                : q.status === 'yanlis'
                  ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                  : 'surface-card border-slate-200 dark:border-slate-700';
            const badgeCls =
              q.status === 'dogru'
                ? 'text-emerald-700 dark:text-emerald-300'
                : q.status === 'yanlis'
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-slate-500';
            return (
              <div
                key={q.number}
                data-testid={`single-subject-q-${q.number}`}
                className={`rounded-lg p-2.5 border text-xs space-y-1 ${bgCls}`}
              >
                <div className="flex items-center justify-between gap-1 font-mono-num font-extrabold">
                  <span>S{q.number}</span>
                  <span className={badgeCls}>
                    {q.studentAnswer ?? '-'} / {q.correctAnswer}
                  </span>
                </div>
                <div className="text-[11px] font-semibold truncate" title={q.topic}>
                  {q.topic}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {q.difficulty} · {q.status === 'dogru' ? 'Tam Puan' : q.errorType || 'Boş'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
