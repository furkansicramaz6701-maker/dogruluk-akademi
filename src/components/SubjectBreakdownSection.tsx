import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ExamAnalysisResult, TopicGapMetric } from '../types/academy';
import {
  buildDetailedSubjectComparison,
  SubjectComparisonItem,
} from '../utils/subjectBreakdown';

interface SubjectBreakdownSectionProps {
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  onScheduleRemedial?: (topicGap: TopicGapMetric) => void;
  onOpenOmr?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: SubjectComparisonItem }>;
  metricMode: 'net' | 'pct';
}

function SubjectComparisonTooltip({ active, payload, metricMode }: CustomTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const deltaLabel =
    metricMode === 'net'
      ? `${row.netDelta >= 0 ? '+' : ''}${row.netDelta.toFixed(2)} Net`
      : `${row.pctDelta >= 0 ? '+' : ''}%${row.pctDelta}`;

  return (
    <div
      className="surface-card rounded-xl p-3 border shadow-lg text-xs space-y-1.5 min-w-[210px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-extrabold text-[var(--text-primary)]">{row.subject}</div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Neti:</span>
        <strong style={{ color: 'var(--chart-1)' }}>
          {row.studentNet.toFixed(2)} / {row.total} (%{row.studentPct})
        </strong>
      </div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Sınıf Ortalaması:</span>
        <strong style={{ color: 'var(--chart-3)' }}>
          {row.classAvgNet.toFixed(2)} / {row.total} (%{row.classAvgPct})
        </strong>
      </div>
      <div
        className="flex justify-between gap-4 font-mono-num pt-1 border-t"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>Fark (Sınıfa Göre):</span>
        <strong
          className={
            row.netDelta >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }
        >
          {deltaLabel}
        </strong>
      </div>
      <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
        {row.correct} Doğru · {row.wrong} Yanlış · {row.blank} Boş
      </div>
    </div>
  );
}

export function SubjectBreakdownSection({
  analysis,
  hasLiveAnalysis,
  onScheduleRemedial,
  onOpenOmr,
}: SubjectBreakdownSectionProps) {
  const [metricMode, setMetricMode] = useState<'net' | 'pct'>('net');

  const breakdown = useMemo(
    () => buildDetailedSubjectComparison(analysis),
    [analysis]
  );

  const handleScheduleSubjectRemedial = (item: SubjectComparisonItem) => {
    if (!onScheduleRemedial) return;
    const matchedGap = analysis.topicGaps
      .filter((t) => t.subject === item.subject)
      .sort((a, b) => a.masteryPct - b.masteryPct)[0];
    onScheduleRemedial(
      matchedGap ?? {
        subject: item.subject,
        topic: `${item.subject} Temel Kazanım Tekrarı`,
        gainCode: 'DERS.ETUT',
        total: item.total,
        correct: item.correct,
        wrong: item.wrong,
        blank: item.blank,
        masteryPct: item.accuracyPct,
        status: item.priorityLevel === 'kritik' ? 'Kritik Eksik' : 'Geliştirilmeli',
      }
    );
  };

  if (!hasLiveAnalysis || breakdown.items.length === 0) {
    return (
      <section
        aria-label="Detaylı Ders Dağılımı"
        data-testid="detailed-subject-breakdown-section"
        className="surface-card rounded-xl p-5 border"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--chart-1)' }} aria-hidden="true" />
            <div>
              <h3 className="text-base font-extrabold">
                Detaylı Ders Dağılımı (Öğrenci vs Sınıf Ortalaması)
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Henüz deneme yapılmamış — Optik değerlendirme tamamlandığında ders bazlı net ve başarı yüzdesi burada görüntülenir.
              </p>
            </div>
          </div>
          {onOpenOmr && (
            <button
              type="button"
              onClick={onOpenOmr}
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer"
            >
              Optik Okumaya Git
            </button>
          )}
        </div>
      </section>
    );
  }

  const isSingleSubject = breakdown.items.length === 1;

  return (
    <section
      aria-labelledby="subject-breakdown-heading"
      data-testid="detailed-subject-breakdown-section"
      className="surface-card rounded-xl p-5 space-y-4 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header & Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: 'var(--chart-1)' }}
          >
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="subject-breakdown-heading" className="text-base font-extrabold">
              {isSingleSubject
                ? `Tek Ders Performans Özeti (${breakdown.items[0].subject})`
                : 'Detaylı Ders Dağılımı — Öğrenci vs Sınıf Ortalaması'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {isSingleSubject
                ? 'Seçili derse ait net ve sınıf ortalaması karşılaştırması aşağıda sunulmuştur; gerekirse telafi etüdü planlayabilirsiniz.'
                : 'Sınıf ortalamasının altında kalan zayıf dersleri net farkıyla belirleyin ve doğrudan telafi etüdü planlayın.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 surface-alt p-1 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            data-testid="subject-breakdown-mode-net"
            onClick={() => setMetricMode('net')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              metricMode === 'net' ? 'btn-3d' : 'text-[var(--text-secondary)]'
            }`}
          >
            Net Karşılaştırması
          </button>
          <button
            type="button"
            data-testid="subject-breakdown-mode-pct"
            onClick={() => setMetricMode('pct')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              metricMode === 'pct' ? 'btn-3d' : 'text-[var(--text-secondary)]'
            }`}
          >
            Başarı % Karşılaştırması
          </button>
        </div>
      </div>

      {/* Weak Subjects Callout Strip */}
      <div
        data-testid="subject-breakdown-weak-strip"
        className="surface-alt rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {breakdown.weakSubjects.length > 0 ? (
            <AlertTriangle
              className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}
          <div className="text-xs min-w-0">
            {breakdown.weakSubjects.length > 0 ? (
              <>
                <span className="font-extrabold">Sınıf Ortalaması Altındaki Dersler: </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {breakdown.weakSubjects
                    .map(
                      (s) =>
                        `${s.subject} (${s.netDelta >= 0 ? '+' : ''}${s.netDelta.toFixed(2)} Net · %${s.studentPct})`
                    )
                    .join(' · ')}
                </span>
              </>
            ) : (
              <>
                <span className="font-extrabold">
                  {isSingleSubject
                    ? 'Seçili Ders Sınıf Ortalaması Üstünde: '
                    : 'Tüm Dersler Sınıf Ortalaması Üstünde: '}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Öğrenci toplamda sınıf ortalamasına göre +
                  {(breakdown.overallStudentNet - breakdown.overallClassAvgNet).toFixed(2)} net önde.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num shrink-0">
          <span>
            Öğrenci Toplam: <strong>{breakdown.overallStudentNet.toFixed(2)}</strong>
          </span>
          <span className="hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Sınıf Ort.: <strong>{breakdown.overallClassAvgNet.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Chart + Per-Subject Diagnostic Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 surface-alt rounded-xl p-4 border" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="h-[290px] w-full" data-testid="subject-breakdown-barchart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={breakdown.items}
                margin={{ top: 12, right: 12, left: -12, bottom: 12 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="shortSubject"
                  interval={0}
                  tickMargin={6}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={metricMode === 'pct' ? [0, 100] : [0, 'auto']}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit={metricMode === 'pct' ? '%' : ''}
                />
                <Tooltip
                  cursor={{ fill: 'var(--bg-surface)', opacity: 0.4 }}
                  content={<SubjectComparisonTooltip metricMode={metricMode} />}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <Bar
                  name="Öğrenci Performansı"
                  dataKey={metricMode === 'net' ? 'studentNet' : 'studentPct'}
                  fill="var(--chart-1)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Bar
                  name="Sınıf Ortalaması"
                  dataKey={metricMode === 'net' ? 'classAvgNet' : 'classAvgPct'}
                  fill="var(--chart-3)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          {breakdown.items.map((item) => {
            const isBelow = item.netDelta < 0;
            return (
              <div
                key={item.subject}
                data-testid={`subject-breakdown-row-${item.subject}`}
                className="surface-alt rounded-xl p-3 border flex flex-wrap items-center justify-between gap-2"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isBelow ? (
                      <TrendingDown
                        className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <TrendingUp
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-xs font-extrabold truncate">{item.subject}</span>
                    <span
                      className={`text-[11px] font-bold ${
                        item.priorityLevel === 'kritik'
                          ? 'text-rose-600 dark:text-rose-400'
                          : item.priorityLevel === 'gelistirilmeli'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      · {item.statusLabel}
                    </span>
                  </div>
                  <div
                    className="text-[11px] font-mono-num mt-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Öğrenci: <strong className="text-[var(--text-primary)]">{item.studentNet.toFixed(1)}</strong>/{item.total} Net (%{item.studentPct}) · Sınıf Ort.: {item.classAvgNet.toFixed(1)} (%{item.classAvgPct})
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-mono-num font-extrabold ${
                      isBelow
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {item.netDelta >= 0 ? '+' : ''}
                    {item.netDelta.toFixed(2)}
                  </span>
                  {item.isWeak && onScheduleRemedial && (
                    <button
                      type="button"
                      onClick={() => handleScheduleSubjectRemedial(item)}
                      className="btn-3d-secondary px-2 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
                    >
                      <CalendarPlus className="w-3 h-3" aria-hidden="true" />
                      <span>Etüt</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
