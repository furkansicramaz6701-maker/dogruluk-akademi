import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarRange, LineChart as LineChartIcon, Target } from 'lucide-react';
import {
  ExamAnalysisResult,
  GradeProfile,
  OpenEndedPaperAnalysis,
} from '../types/academy';
import {
  GrowthCheckpointPoint,
  GrowthMetricMode,
  GrowthPeriodMode,
  SubjectAnalysisBarItem,
  buildStudentGrowthChartData,
} from '../utils/reportsGrowthChart';

interface ReportsAnalysisChartProps {
  analysis: ExamAnalysisResult;
  gradeProfile: GradeProfile;
  hasLiveAnalysis: boolean;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  institutionName?: string;
  onOpenOmr?: () => void;
}

interface GrowthTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: GrowthCheckpointPoint }>;
  metricMode: GrowthMetricMode;
}

function GrowthChartTooltip({ active, payload, metricMode }: GrowthTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  const isNet = metricMode === 'net';
  const studentVal = isNet ? `${pt.studentNet.toFixed(2)} Net` : `${pt.studentScore.toFixed(1)} Puan`;
  const acadVal = isNet ? `${pt.academyAvgNet.toFixed(2)} Net` : `${pt.academyAvgScore.toFixed(1)} Puan`;
  const targetVal = isNet ? `${pt.targetNet.toFixed(2)} Net` : `${pt.targetScore.toFixed(1)} Puan`;
  const delta = isNet ? pt.netDeltaFromPrev : pt.scoreDeltaFromPrev;
  const deltaText =
    delta === 0
      ? '—'
      : `${delta > 0 ? '+' : ''}${isNet ? delta.toFixed(2) : delta.toFixed(1)} ${
          isNet ? 'Net' : 'Puan'
        }`;

  return (
    <div
      className="surface-card rounded-xl p-3 text-xs shadow-xl border space-y-1.5 min-w-[220px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-bold leading-snug">{pt.examName}</div>
      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {pt.termLabel} · {pt.dateLabel} · {pt.statusNote}
      </div>
      <div className="pt-1.5 border-t space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Performansı</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
            {studentVal}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Kurum Ortalaması</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
            {acadVal}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Dönem Hedefi</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--chart-4)' }}>
            {targetVal}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Önceki Adıma Göre</span>
          <span
            className={`font-mono-num font-bold ${
              delta >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {deltaText}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SubjectTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: SubjectAnalysisBarItem }>;
}

function SubjectBarTooltip({ active, payload }: SubjectTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div
      className="surface-card rounded-xl p-3 text-xs shadow-xl border space-y-1 min-w-[195px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-bold">{item.subject}</div>
      <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
        {item.correct}D · {item.wrong}Y · {item.blank}B ({item.total} Soru)
      </div>
      <div className="pt-1 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Net / Başarı</span>
        <span className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
          {item.net.toFixed(2)} Net (%{item.accuracyPct})
        </span>
      </div>
    </div>
  );
}

export function ReportsAnalysisChart({
  analysis,
  gradeProfile,
  hasLiveAnalysis,
  openEndedAnalysis = null,
  institutionName,
  onOpenOmr,
}: ReportsAnalysisChartProps) {
  const [periodMode, setPeriodMode] = useState<GrowthPeriodMode>('donemlik');
  const [metricMode, setMetricMode] = useState<GrowthMetricMode>('net');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  const dataset = useMemo(
    () =>
      buildStudentGrowthChartData({
        analysis,
        gradeProfile,
        hasLiveAnalysis,
        periodMode,
        metricMode,
        openEndedAnalysis,
      }),
    [analysis, gradeProfile, hasLiveAnalysis, periodMode, metricMode, openEndedAnalysis]
  );

  const activePoint = useMemo(() => {
    const matched = dataset.checkpoints.find((c) => c.id === selectedCheckpointId);
    if (matched) return matched;
    return (
      dataset.checkpoints.find((c) => c.isCurrent) ??
      dataset.checkpoints[dataset.checkpoints.length - 1]
    );
  }, [dataset.checkpoints, selectedCheckpointId]);

  const studentKey = metricMode === 'net' ? 'studentNet' : 'studentScore';
  const academyKey = metricMode === 'net' ? 'academyAvgNet' : 'academyAvgScore';
  const targetRefValue =
    metricMode === 'net' ? dataset.summary.targetNet : dataset.summary.targetScore;
  const studentDisplayName =
    analysis.studentName?.trim() || openEndedAnalysis?.studentName?.trim() || 'Öğrenci';

  return (
    <section
      aria-labelledby="reports-analysis-chart-title"
      data-testid="reports-analysis-chart-section"
      className="surface-card rounded-xl p-5 space-y-5"
    >
      {/* Header + Period & Metric Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <LineChartIcon
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id="reports-analysis-chart-title"
              className="text-base sm:text-lg font-bold leading-tight"
            >
              Analiz Grafiği — {periodMode === 'donemlik' ? 'Dönemlik' : 'Yıllık'} Gelişim Çizelgesi
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {studentDisplayName} · {gradeProfile.shortLabel}
              {institutionName ? ` · ${institutionName}` : ''} ·{' '}
              {dataset.isLiveData
                ? 'Canlı Sınav & Kazanım Analizi'
                : 'Henüz sınav değerlendirilmedi (Tüm veriler 0 · Optik okuma ile güncellenir)'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Gelişim Çizelgesi Periyodu"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            <button
              type="button"
              data-testid="reports-growth-period-donemlik"
              aria-pressed={periodMode === 'donemlik'}
              onClick={() => {
                setPeriodMode('donemlik');
                setSelectedCheckpointId(null);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                periodMode === 'donemlik'
                  ? 'btn-3d'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Dönemlik
            </button>
            <button
              type="button"
              data-testid="reports-growth-period-yillik"
              aria-pressed={periodMode === 'yillik'}
              onClick={() => {
                setPeriodMode('yillik');
                setSelectedCheckpointId(null);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                periodMode === 'yillik'
                  ? 'btn-3d'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Yıllık
            </button>
          </div>

          <div
            role="group"
            aria-label="Grafik Ölçüm Metriği"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            <button
              type="button"
              data-testid="reports-growth-metric-net"
              aria-pressed={metricMode === 'net'}
              onClick={() => setMetricMode('net')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                metricMode === 'net'
                  ? 'btn-3d'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Net Gelişimi
            </button>
            <button
              type="button"
              data-testid="reports-growth-metric-score"
              aria-pressed={metricMode === 'score'}
              onClick={() => setMetricMode('score')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                metricMode === 'score'
                  ? 'btn-3d'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Puan Gelişimi
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip (Tabular Figures, Hairline Dividers) */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-3 border-y"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {metricMode === 'net' ? 'Güncel Net' : 'Güncel Sınav Puanı'}
          </div>
          <div
            className="mt-1 text-xl font-display font-extrabold font-mono-num"
            data-testid="reports-growth-latest-metric"
          >
            {metricMode === 'net'
              ? `${dataset.summary.latestNet.toFixed(2)} Net`
              : `${dataset.summary.latestScore.toFixed(1)} Puan`}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {periodMode === 'donemlik' ? 'Dönem Başından Değişim' : 'Eylül’den Bu Yana Artış'}
          </div>
          <div
            className={`mt-1 text-xl font-display font-extrabold font-mono-num ${
              (metricMode === 'net' ? dataset.summary.growthNet : dataset.summary.growthScore) >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
            data-testid="reports-growth-delta-metric"
          >
            {metricMode === 'net'
              ? `${dataset.summary.growthNet >= 0 ? '+' : ''}${dataset.summary.growthNet.toFixed(2)} Net`
              : `${dataset.summary.growthScore >= 0 ? '+' : ''}${dataset.summary.growthScore.toFixed(1)} Puan`}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Kurum Ortalamasına Fark
          </div>
          <div
            className="mt-1 text-xl font-display font-extrabold font-mono-num"
            style={{ color: 'var(--chart-3)' }}
          >
            {metricMode === 'net'
              ? `${dataset.summary.academyDiffNet >= 0 ? '+' : ''}${dataset.summary.academyDiffNet.toFixed(2)} Net`
              : `${dataset.summary.academyDiffScore >= 0 ? '+' : ''}${dataset.summary.academyDiffScore.toFixed(1)} Puan`}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Hedef Tamamlama ({metricMode === 'net' ? `${dataset.summary.targetNet.toFixed(1)} Net` : `${dataset.summary.targetScore.toFixed(0)} Puan`})
          </div>
          <div
            className="mt-1 text-xl font-display font-extrabold font-mono-num"
            style={{ color: 'var(--accent-primary)' }}
          >
            %{dataset.summary.targetAttainmentPct}
          </div>
        </div>
      </div>

      {/* Main Split: Longitudinal Timeline Chart + Subject Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Dönemlik / Yıllık Gelişim Çizelgesi */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 font-bold">
              <CalendarRange className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>
                {periodMode === 'donemlik'
                  ? 'Dönemlik Sınav Seyri (6 Adım)'
                  : 'Yıllık Akademik Takvim Seyri (Eylül – Haziran)'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>Öğrenci</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: 'var(--chart-3)' }} aria-hidden="true" />
                <span>Kurum Ort.</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block border-t-2 border-dotted" style={{ borderColor: 'var(--chart-4)' }} aria-hidden="true" />
                <span>Hedef</span>
              </span>
            </div>
          </div>

          <div
            className="w-full h-[265px] min-w-0"
            data-testid="reports-growth-recharts-container"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={dataset.checkpoints}
                margin={{ top: 12, right: 14, left: -4, bottom: 4 }}
                onClick={(state) => {
                  const idx =
                    typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                  if (idx >= 0 && dataset.checkpoints[idx]) {
                    setSelectedCheckpointId(dataset.checkpoints[idx].id);
                  }
                }}
              >
                <defs>
                  <linearGradient id="reportsGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  interval={0}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={
                    metricMode === 'net'
                      ? [0, dataset.summary.totalQuestions]
                      : [dataset.isLiveData ? gradeProfile.baseScore : 0, dataset.summary.maxScore]
                  }
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip content={<GrowthChartTooltip metricMode={metricMode} />} />
                <ReferenceLine
                  y={targetRefValue}
                  stroke="var(--chart-4)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.75}
                />
                <Area
                  type="monotone"
                  dataKey={studentKey}
                  name={studentDisplayName}
                  stroke="var(--accent-primary)"
                  strokeWidth={3}
                  fill="url(#reportsGrowthFill)"
                  isAnimationActive={false}
                  dot={{ r: 4, strokeWidth: 2, fill: 'var(--accent-primary)' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
                />
                <Line
                  type="monotone"
                  dataKey={academyKey}
                  name="Kurum Ortalaması"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  isAnimationActive={false}
                  dot={{ r: 3, fill: 'var(--chart-3)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Checkpoint Selector Strip + Focused Point Details */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {dataset.checkpoints.map((pt) => {
                const isSelected = activePoint.id === pt.id;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    data-testid={`reports-growth-point-${pt.id}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCheckpointId(pt.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      isSelected ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    {pt.label}
                  </button>
                );
              })}
            </div>

            <div
              className="surface-alt rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border"
              style={{ borderColor: 'var(--border-subtle)' }}
              data-testid="reports-growth-focused-detail"
            >
              <div className="min-w-0">
                <span className="font-bold">{activePoint.examName}</span>
                <span className="mx-1.5" style={{ color: 'var(--text-secondary)' }} aria-hidden="true">·</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {activePoint.termLabel} ({activePoint.dateLabel}) · {activePoint.statusNote}
                </span>
              </div>
              <div className="font-mono-num font-bold flex items-center gap-3 shrink-0">
                <span style={{ color: 'var(--accent-primary)' }}>
                  {activePoint.studentNet.toFixed(2)} Net
                </span>
                <span style={{ color: 'var(--chart-3)' }}>
                  {activePoint.studentScore.toFixed(1)} Puan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Detailed Subject Performance Breakdown */}
        <div
          className="lg:col-span-5 surface-alt rounded-xl p-4 border flex flex-col justify-between space-y-3 min-w-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold">
              <Target className="w-4 h-4" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
              <span>Ders Bazlı Başarı Dağılımı (%)</span>
            </div>
            <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {dataset.subjectBreakdown.length} Ders
            </span>
          </div>

          <div className="w-full h-[180px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dataset.subjectBreakdown}
                margin={{ top: 8, right: 8, left: 0, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="shortSubject"
                  interval={0}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<SubjectBarTooltip />} />
                <ReferenceLine y={80} stroke="var(--chart-4)" strokeDasharray="3 3" />
                <Bar
                  dataKey="accuracyPct"
                  name="Başarı %"
                  fill="var(--chart-1)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
            {dataset.subjectBreakdown.slice(0, 5).map((item) => (
              <div
                key={`subj-row-${item.subject}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-semibold truncate">{item.subject}</span>
                <div className="flex items-center gap-3 font-mono-num shrink-0">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {item.correct}D/{item.wrong}Y
                  </span>
                  <span className="font-bold">{item.net.toFixed(1)} Net</span>
                  <span
                    className={`font-bold w-10 text-right ${
                      item.accuracyPct >= 75
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.accuracyPct >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    %{item.accuracyPct}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div
            className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px]"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <span>
              Güçlü: <strong style={{ color: 'var(--text-primary)' }}>{dataset.summary.strongestSubject}</strong>
              {' · '}
              Öncelikli: <strong style={{ color: 'var(--text-primary)' }}>{dataset.summary.prioritySubject}</strong>
            </span>
            {!dataset.isLiveData && onOpenOmr && (
              <button
                type="button"
                onClick={onOpenOmr}
                className="font-bold underline underline-offset-2 cursor-pointer"
                style={{ color: 'var(--accent-primary)' }}
              >
                Optik Okuma Başlat
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
