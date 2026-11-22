import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import {
  GradeProfile,
  Institution,
  PenaltyDivisor,
  StudentRecord,
  WeeklyQuestionPreset,
  WeeklyStudentScore,
} from '../types/academy';
import { formatPenaltyRuleLabel } from '../utils/examAnalysis';
import {
  WeeklyProgressPatternKey,
  WeeklyTrendMetric,
  WeeklyTrendOrder,
  WeeklyTrendPoint,
  buildSampleWeeklyCohort,
  buildWeeklyTrendComparisonDataset,
  computeWeeklyComparison,
} from '../utils/weeklyAnalysis';

interface WeeklyPerformanceComparisonProps {
  activeInstitution: Institution;
  gradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  students: StudentRecord[];
  weeklyEntries?: WeeklyStudentScore[];
  weeklyQuestionCount?: WeeklyQuestionPreset;
  kts1Name?: string;
  kts2Name?: string;
  onOpenWeeklyList: () => void;
}

interface TooltipPayloadItem {
  payload?: WeeklyTrendPoint;
}

interface WeeklyTrendTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  metric: WeeklyTrendMetric;
  kts1Label: string;
  kts2Label: string;
}

function WeeklyTrendTooltip({
  active,
  payload,
  metric,
  kts1Label,
  kts2Label,
}: WeeklyTrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  const deltaColor =
    pt.pattern === 'rising'
      ? 'text-emerald-600 dark:text-emerald-400'
      : pt.pattern === 'support'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-sky-600 dark:text-sky-400';

  const scoreSign = pt.scoreDelta >= 0 ? '+' : '';
  const netSign = pt.netDelta >= 0 ? '+' : '';

  return (
    <div
      className="surface-card rounded-xl p-3 text-xs shadow-xl border space-y-2 min-w-[235px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div>
        <div className="font-bold leading-snug">{pt.studentName}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {pt.classroom} · No: <span className="font-mono-num">{pt.studentNumber8}</span> · {pt.rank}. Sıra
        </div>
      </div>

      <div
        className="pt-1.5 border-t space-y-1"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>{kts1Label}</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--chart-2)' }}>
            {pt.kts1Score.toFixed(1)} Puan · {pt.kts1Net.toFixed(2)} Net
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>{kts2Label}</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
            {pt.kts2Score.toFixed(1)} Puan · {pt.kts2Net.toFixed(2)} Net
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-4 pt-1 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>Haftalık Değişim</span>
          <span className={`font-mono-num font-bold ${deltaColor}`}>
            {metric === 'score'
              ? `${scoreSign}${pt.scoreDelta.toFixed(1)} Puan (${netSign}${pt.netDelta.toFixed(2)} Net)`
              : `${netSign}${pt.netDelta.toFixed(2)} Net (${scoreSign}${pt.scoreDelta.toFixed(1)} Puan)`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Gelişim Eğilimi</span>
          <span className={`font-bold ${deltaColor}`}>{pt.patternLabel}</span>
        </div>
      </div>

      {pt.weakTopicNote && (
        <div
          className="pt-1 border-t text-[11px]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          Odak Konu: {pt.weakTopicNote}
        </div>
      )}
    </div>
  );
}

interface CustomTrendDotProps {
  cx?: number;
  cy?: number;
  payload?: WeeklyTrendPoint;
  focusedStudentId?: string | null;
}

function Kts2PatternDot({ cx, cy, payload, focusedStudentId }: CustomTrendDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  const isFocused = payload.studentId === focusedStudentId;
  const fill =
    payload.pattern === 'rising'
      ? '#10b981'
      : payload.pattern === 'support'
        ? '#e11d48'
        : 'var(--accent-primary)';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isFocused ? 6 : 4.5}
      fill={fill}
      stroke="#ffffff"
      strokeWidth={isFocused ? 2.5 : 1.75}
    />
  );
}

export function WeeklyPerformanceComparison({
  activeInstitution,
  gradeProfile,
  penaltyDivisor,
  students,
  weeklyEntries,
  weeklyQuestionCount = 50,
  kts1Name = 'KTS-1',
  kts2Name = 'KTS-2',
  onOpenWeeklyList,
}: WeeklyPerformanceComparisonProps) {
  const [metric, setMetric] = useState<WeeklyTrendMetric>('score');
  const [patternFilter, setPatternFilter] = useState<'all' | WeeklyProgressPatternKey>('all');
  const [orderBy, setOrderBy] = useState<WeeklyTrendOrder>('rank');
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);

  const hasLiveWeeklyEntries = Boolean(weeklyEntries && weeklyEntries.length > 0);

  const effectiveEntries = useMemo(() => {
    if (weeklyEntries && weeklyEntries.length > 0) {
      return weeklyEntries;
    }
    return buildSampleWeeklyCohort({
      institution: activeInstitution,
      gradeId: gradeProfile.id,
      questionCount: weeklyQuestionCount,
      existingStudents: students,
    });
  }, [weeklyEntries, activeInstitution, gradeProfile.id, weeklyQuestionCount, students]);

  const comparisonRows = useMemo(
    () =>
      computeWeeklyComparison({
        entries: effectiveEntries,
        kts1TotalQuestions: weeklyQuestionCount,
        kts2TotalQuestions: weeklyQuestionCount,
        gradeProfile,
        penaltyDivisorOverride: penaltyDivisor,
      }),
    [effectiveEntries, weeklyQuestionCount, gradeProfile, penaltyDivisor]
  );

  const dataset = useMemo(
    () =>
      buildWeeklyTrendComparisonDataset({
        rows: comparisonRows,
        metric,
        patternFilter,
        orderBy,
        gradeProfile,
        questionCount: weeklyQuestionCount,
      }),
    [comparisonRows, metric, patternFilter, orderBy, gradeProfile, weeklyQuestionCount]
  );

  const focusedPoint = useMemo(() => {
    if (dataset.points.length === 0) return null;
    const matched = dataset.points.find((p) => p.studentId === focusedStudentId);
    return matched ?? dataset.points[0];
  }, [dataset.points, focusedStudentId]);

  const unitLabel = metric === 'score' ? 'Puan' : 'Net';
  const formatVal = (val: number) => (metric === 'score' ? val.toFixed(1) : val.toFixed(2));
  const avgDeltaSign = dataset.summary.avgDeltaValue >= 0 ? '+' : '';

  return (
    <section
      aria-labelledby="weekly-performance-comparison-title"
      data-testid="weekly-performance-comparison"
      className="surface-card rounded-xl p-5 space-y-5"
    >
      {/* Header & Interactive Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <TrendingUp
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id="weekly-performance-comparison-title"
              className="text-base sm:text-lg font-bold leading-tight"
            >
              Haftalık Performans Karşılaştırması ({kts1Name} vs {kts2Name}) — {gradeProfile.shortLabel}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {activeInstitution.name} · {dataset.summary.totalStudents} Öğrenci · {weeklyQuestionCount} Soru ·{' '}
              {formatPenaltyRuleLabel(penaltyDivisor, true)} ·{' '}
              {hasLiveWeeklyEntries
                ? 'Canlı Haftalık Liste Verisi'
                : 'Örnek Kohort Trend Önizlemesi'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Metric Switch (Puan vs Net) */}
          <div
            role="group"
            aria-label="Karşılaştırma Ölçütü"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            {(
              [
                { id: 'score' as WeeklyTrendMetric, label: 'Puan' },
                { id: 'net' as WeeklyTrendMetric, label: 'Net' },
              ] as const
            ).map((opt) => {
              const active = metric === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`weekly-trend-metric-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setMetric(opt.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sort Order Switch */}
          <div
            role="group"
            aria-label="Grafik Sıralama Düzeni"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            {(
              [
                { id: 'rank' as WeeklyTrendOrder, label: 'Başarı Sırası' },
                { id: 'delta' as WeeklyTrendOrder, label: 'Gelişim Farkı (Δ)' },
              ] as const
            ).map((opt) => {
              const active = orderBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`weekly-trend-order-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setOrderBy(opt.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="weekly-trend-open-list-btn"
            onClick={onOpenWeeklyList}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Haftalık Listeyi Aç</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* At-a-Glance Summary Strip (Tabular Figures, Hairline Dividers, Zero Pill Clutter) */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 py-3 border-y"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {kts1Name} → {kts2Name} Ortalama ({unitLabel})
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span
              className="text-lg font-display font-extrabold font-mono-num"
              data-testid="weekly-trend-avg-readout"
            >
              {formatVal(dataset.summary.avgKts1Value)} → {formatVal(dataset.summary.avgKts2Value)}
            </span>
            <span
              className={`text-xs font-mono-num font-bold ${
                dataset.summary.avgDeltaValue >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {avgDeltaSign}
              {formatVal(dataset.summary.avgDeltaValue)} {unitLabel}
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Hızlı Yükseliş Gösterenler
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span
              className="text-lg font-display font-extrabold font-mono-num"
              data-testid="weekly-trend-rising-count"
            >
              {dataset.summary.risingCount} / {dataset.summary.totalStudents} Öğrenci
            </span>
            <span className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
              %{dataset.summary.risingPct} ivme
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            En Yüksek Haftalık Sıçrama
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-display font-extrabold truncate max-w-[165px]">
              {dataset.summary.biggestGainer?.studentName ?? '—'}
            </span>
            {dataset.summary.biggestGainer && (
              <span className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                +{formatVal(dataset.summary.biggestGainer.deltaValue)} {unitLabel}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Destek & Etüt Odağı
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span
              className="text-lg font-display font-extrabold font-mono-num"
              data-testid="weekly-trend-support-count"
            >
              {dataset.summary.supportCount} Öğrenci
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {dataset.summary.supportCount > 0
                ? 'Yakın takip & telafi önerisi'
                : 'Tüm kohort dengede'}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Progress Pattern Filter + Legend */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Gelişim Eğilimi Filtresi"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { id: 'all' as const, label: `Tümü (${dataset.summary.totalStudents})` },
              { id: 'rising' as const, label: `Hızlı Yükseliş (${dataset.summary.risingCount})` },
              { id: 'steady' as const, label: `Dengeli İlerleme (${dataset.summary.steadyCount})` },
              { id: 'support' as const, label: `Destek Odağı (${dataset.summary.supportCount})` },
            ] as const
          ).map((tab) => {
            const active = patternFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`weekly-pattern-filter-${tab.id}`}
                aria-pressed={active}
                onClick={() => setPatternFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Paired Line & Pattern Legend (Text + Swatch) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
          <div className="inline-flex items-center gap-2">
            <span
              className="w-4 h-0.5 inline-block border-t-2 border-dashed"
              style={{ borderColor: 'var(--chart-2)' }}
              aria-hidden="true"
            />
            <span>{kts1Name} (1. Hafta)</span>
          </div>
          <div className="inline-flex items-center gap-2">
            <span
              className="w-4 h-1 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--accent-primary)' }}
              aria-hidden="true"
            />
            <span>{kts2Name} (2. Hafta)</span>
          </div>
          <div className="inline-flex items-center gap-2">
            <span
              className="w-4 h-0.5 inline-block border-t-2 border-dotted"
              style={{ borderColor: 'var(--chart-3)' }}
              aria-hidden="true"
            />
            <span>{kts2Name} Ort. ({formatVal(dataset.summary.avgKts2Value)})</span>
          </div>
        </div>
      </div>

      {/* Recharts Two-Week Trendline Chart */}
      {dataset.points.length === 0 ? (
        <div
          className="surface-alt rounded-xl p-8 text-center space-y-3"
          data-testid="weekly-trend-empty-filter"
        >
          <p className="text-sm font-semibold">
            Seçili gelişim eğilimi filtresine uyan öğrenci kaydı bulunmuyor.
          </p>
          <button
            type="button"
            onClick={() => setPatternFilter('all')}
            className="btn-3d px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
          >
            Tüm Öğrencileri Göster
          </button>
        </div>
      ) : (
        <div
          className="w-full min-w-0 h-[310px]"
          data-testid="weekly-trend-recharts-container"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={dataset.points}
              margin={{ top: 14, right: 20, left: 0, bottom: 18 }}
              onClick={(state) => {
                const idx =
                  typeof state?.activeTooltipIndex === 'number'
                    ? state.activeTooltipIndex
                    : -1;
                if (idx >= 0 && dataset.points[idx]) {
                  setFocusedStudentId(dataset.points[idx].studentId);
                }
              }}
            >
              <defs>
                <linearGradient id="weeklyKts2AreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-subtle)"
                vertical={false}
              />

              <XAxis
                dataKey="shortName"
                interval={0}
                angle={dataset.points.length > 8 ? -24 : 0}
                textAnchor={dataset.points.length > 8 ? 'end' : 'middle'}
                height={dataset.points.length > 8 ? 52 : 32}
                padding={{ left: 12, right: 12 }}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />

              <YAxis
                domain={dataset.summary.yDomain}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />

              <Tooltip
                content={
                  <WeeklyTrendTooltip
                    metric={metric}
                    kts1Label={kts1Name}
                    kts2Label={kts2Name}
                  />
                }
              />

              <ReferenceLine
                y={dataset.summary.avgKts2Value}
                stroke="var(--chart-3)"
                strokeDasharray="4 4"
                strokeWidth={1.75}
              />

              {/* Week 1 Baseline Trendline */}
              <Line
                type="monotone"
                dataKey="kts1Value"
                name={kts1Name}
                stroke="var(--chart-2)"
                strokeWidth={2.25}
                strokeDasharray="5 4"
                isAnimationActive={false}
                dot={{
                  r: 3.5,
                  fill: 'var(--bg-surface)',
                  stroke: 'var(--chart-2)',
                  strokeWidth: 2,
                }}
                activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#ffffff' }}
              />

              {/* Week 2 Trendline + Subtle Area */}
              <Area
                type="monotone"
                dataKey="kts2Value"
                name={kts2Name}
                stroke="var(--accent-primary)"
                strokeWidth={3}
                fill="url(#weeklyKts2AreaFill)"
                isAnimationActive={false}
                dot={<Kts2PatternDot focusedStudentId={focusedPoint?.studentId} />}
                activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#ffffff' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Focused Student Quick Comparison Strip */}
      {focusedPoint && (
        <div
          className="surface-alt rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
          data-testid="weekly-trend-focused-student"
        >
          <div className="min-w-0">
            <span className="font-bold">{focusedPoint.studentName}</span>
            <span className="mx-2" style={{ color: 'var(--text-secondary)' }} aria-hidden="true">
              ·
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {focusedPoint.classroom} · {focusedPoint.rank}. Sıra · {focusedPoint.patternLabel}
              {focusedPoint.weakTopicNote ? ` · Odak: ${focusedPoint.weakTopicNote}` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono-num font-bold shrink-0">
            <span style={{ color: 'var(--chart-2)' }}>
              {kts1Name}: {formatVal(focusedPoint.kts1Value)} {unitLabel}
            </span>
            <span style={{ color: 'var(--accent-primary)' }}>
              {kts2Name}: {formatVal(focusedPoint.kts2Value)} {unitLabel}
            </span>
            <span
              className={
                focusedPoint.pattern === 'rising'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : focusedPoint.pattern === 'support'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-sky-600 dark:text-sky-400'
              }
            >
              {focusedPoint.deltaValue >= 0 ? '+' : ''}
              {formatVal(focusedPoint.deltaValue)} {unitLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
