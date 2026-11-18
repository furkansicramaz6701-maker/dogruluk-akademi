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
import { BarChart3, TrendingUp } from 'lucide-react';
import {
  GradeProfile,
  Institution,
  PenaltyDivisor,
  StudentRecord,
} from '../types/academy';
import { formatPenaltyRuleLabel } from '../utils/examAnalysis';
import {
  NetProgressionPoint,
  ProgressionScopeMode,
  buildGradeNetProgression,
} from '../utils/netProgression';

interface NetProgressionChartProps {
  gradeProfile: GradeProfile;
  questionCount: number;
  penaltyDivisor: PenaltyDivisor;
  activeInstitution: Institution;
  students: StudentRecord[];
  hasLiveAnalysis: boolean;
  activeStudentName: string;
  activeStudentNet: number;
  activeExamTitle: string;
}

type ChartDisplayType = 'area' | 'bar';

interface CustomTooltipPayloadItem {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: NetProgressionPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}

function NetChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      className="surface-card rounded-xl p-3 text-xs shadow-xl border space-y-1.5 min-w-[215px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-bold leading-snug">{point.examName}</div>
      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {point.date} · {point.totalQuestions} Soru · {point.participantCount.toLocaleString('tr-TR')} Katılım
      </div>
      <div className="pt-1.5 border-t space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Kurum Geneli Ort.</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
            {point.institutionAvgNet.toFixed(2)} Net
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Türkiye Geneli Ort.</span>
          <span className="font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
            {point.turkeyAvgNet.toFixed(2)} Net
          </span>
        </div>
        {point.activeStudentNet !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span style={{ color: 'var(--text-secondary)' }}>Aktif Öğrenci</span>
            <span className="font-mono-num font-bold" style={{ color: 'var(--chart-4)' }}>
              {point.activeStudentNet.toFixed(2)} Net
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Kurum vs TG Farkı</span>
          <span
            className={`font-mono-num font-bold ${
              point.vsTurkeyDiff >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {point.vsTurkeyDiff >= 0 ? `+${point.vsTurkeyDiff.toFixed(2)}` : point.vsTurkeyDiff.toFixed(2)} Net
          </span>
        </div>
      </div>
    </div>
  );
}

export function NetProgressionChart({
  gradeProfile,
  questionCount,
  penaltyDivisor,
  activeInstitution,
  students,
  hasLiveAnalysis,
  activeStudentName,
  activeStudentNet,
  activeExamTitle,
}: NetProgressionChartProps) {
  const [scopeMode, setScopeMode] = useState<ProgressionScopeMode>('both');
  const [chartType, setChartType] = useState<ChartDisplayType>('area');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const dataset = useMemo(
    () =>
      buildGradeNetProgression({
        gradeProfile,
        questionCount,
        penaltyDivisor,
        institutionId: activeInstitution.id,
        institutionCode8: activeInstitution.code8,
        students,
        liveAnalysis: {
          hasLiveAnalysis,
          studentName: activeStudentName,
          totalNet: activeStudentNet,
          examTitle: activeExamTitle,
        },
      }),
    [
      gradeProfile,
      questionCount,
      penaltyDivisor,
      activeInstitution.id,
      activeInstitution.code8,
      students,
      hasLiveAnalysis,
      activeStudentName,
      activeStudentNet,
      activeExamTitle,
    ]
  );

  const activePoint = useMemo(() => {
    const matched = dataset.points.find((p) => p.id === selectedPointId);
    return matched ?? dataset.points[dataset.points.length - 1];
  }, [dataset.points, selectedPointId]);

  const showInstitution = scopeMode === 'both' || scopeMode === 'institution';
  const showTurkey = scopeMode === 'both' || scopeMode === 'turkey';
  const hasStudentOverlay = dataset.points.some((p) => p.activeStudentNet !== undefined);

  return (
    <section
      aria-labelledby="net-progression-title"
      data-testid="net-progression-chart-section"
      className="surface-card rounded-xl p-5 space-y-5"
    >
      {/* Header + Interactive Scope & Chart Type Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <TrendingUp
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 id="net-progression-title" className="text-base sm:text-lg font-bold leading-tight">
              Net Gelişim Grafiği — {gradeProfile.shortLabel}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {activeInstitution.name} · {dataset.summary.maxQuestions} Soru ·{' '}
              {formatPenaltyRuleLabel(penaltyDivisor, true)} ·{' '}
              {dataset.summary.evaluatedStudentCount > 0
                ? `${dataset.summary.evaluatedStudentCount} optik sonucu işlendi`
                : 'Dönemsel kurum & Türkiye geneli ortalama seyri'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Scope Selector */}
          <div
            role="group"
            aria-label="Ortalama Kapsamı"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            {(
              [
                { id: 'both' as ProgressionScopeMode, label: 'Karşılaştırmalı' },
                { id: 'institution' as ProgressionScopeMode, label: 'Kurum Geneli' },
                { id: 'turkey' as ProgressionScopeMode, label: 'Türkiye Geneli' },
              ] as const
            ).map((opt) => {
              const active = scopeMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`net-scope-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setScopeMode(opt.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Chart Visualization Mode */}
          <div
            role="group"
            aria-label="Grafik Tipi"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            <button
              type="button"
              data-testid="net-chart-type-area"
              aria-pressed={chartType === 'area'}
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                chartType === 'area' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Eğri</span>
            </button>
            <button
              type="button"
              data-testid="net-chart-type-bar"
              aria-pressed={chartType === 'bar'}
              onClick={() => setChartType('bar')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                chartType === 'bar' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sütun</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Readout Strip (Tabular Figures, Zero Pills) */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-y"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Kurum Geneli Son Ortalama
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span
              className="text-xl font-display font-extrabold font-mono-num"
              data-testid="net-summary-institution"
            >
              {dataset.summary.latestInstitutionNet.toFixed(2)} Net
            </span>
            <span className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
              {dataset.summary.institutionGrowth >= 0 ? '+' : ''}
              {dataset.summary.institutionGrowth.toFixed(2)} artış
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Türkiye Geneli Son Ortalama
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span
              className="text-xl font-display font-extrabold font-mono-num"
              data-testid="net-summary-turkey"
            >
              {dataset.summary.latestTurkeyNet.toFixed(2)} Net
            </span>
            <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
              {dataset.summary.turkeyGrowth >= 0 ? '+' : ''}
              {dataset.summary.turkeyGrowth.toFixed(2)} artış
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {hasStudentOverlay ? `Aktif Öğrenci (${activeStudentName})` : 'Kurum vs Türkiye Geneli Farkı'}
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-xl font-display font-extrabold font-mono-num">
              {hasStudentOverlay
                ? `${activeStudentNet.toFixed(2)} Net`
                : `${dataset.summary.institutionVsTurkeyDiff >= 0 ? '+' : ''}${dataset.summary.institutionVsTurkeyDiff.toFixed(2)} Net`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {hasStudentOverlay
                ? `TG Ort: ${dataset.summary.latestTurkeyNet.toFixed(1)}`
                : dataset.summary.institutionVsTurkeyDiff >= 0
                  ? 'TG ortalamasının üzerinde'
                  : 'TG ortalamasına yakınsama'}
            </span>
          </div>
        </div>
      </div>

      {/* Series Legend (Color + Text paired cleanly) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-semibold">
        {showInstitution && (
          <div className="inline-flex items-center gap-2">
            <span
              className="w-3 h-1 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--accent-primary)' }}
              aria-hidden="true"
            />
            <span>Kurum Geneli Ortalaması</span>
          </div>
        )}
        {showTurkey && (
          <div className="inline-flex items-center gap-2">
            <span
              className="w-3 h-0.5 inline-block border-t-2 border-dashed"
              style={{ borderColor: 'var(--chart-3)' }}
              aria-hidden="true"
            />
            <span>Türkiye Geneli Ortalaması</span>
          </div>
        )}
        {hasStudentOverlay && (
          <div className="inline-flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--chart-4)' }}
              aria-hidden="true"
            />
            <span>Aktif Öğrenci ({activeStudentName})</span>
          </div>
        )}
      </div>

      {/* Interactive Recharts Canvas */}
      <div
        className="w-full min-w-0 h-[290px]"
        data-testid="net-progression-recharts-container"
      >
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <ComposedChart
              data={dataset.points}
              margin={{ top: 14, right: 18, left: -4, bottom: 4 }}
              onClick={(state) => {
                const idx = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                if (idx >= 0 && dataset.points[idx]) {
                  setSelectedPointId(dataset.points[idx].id);
                }
              }}
            >
              <defs>
                <linearGradient id="instAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="turkeyAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                interval={0}
                padding={{ left: 14, right: 14 }}
                tickFormatter={(val: string) => val.replace('Deneme ', 'D')}
                tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />
              <YAxis
                domain={[
                  (dataMin: number) => Math.max(0, Math.floor((dataMin - 6) / 5) * 5),
                  (dataMax: number) =>
                    Math.min(dataset.summary.maxQuestions, Math.ceil((dataMax + 6) / 5) * 5),
                ]}
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<NetChartTooltip />} />
              <ReferenceLine
                y={dataset.summary.latestTurkeyNet}
                stroke="var(--chart-3)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />

              {showInstitution && (
                <Area
                  type="monotone"
                  dataKey="institutionAvgNet"
                  name="Kurum Geneli Ort."
                  stroke="var(--accent-primary)"
                  strokeWidth={3}
                  fill="url(#instAreaFill)"
                  isAnimationActive={false}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
                  dot={{ r: 4, strokeWidth: 2, fill: 'var(--accent-primary)' }}
                />
              )}

              {showTurkey && (
                <Area
                  type="monotone"
                  dataKey="turkeyAvgNet"
                  name="Türkiye Geneli Ort."
                  stroke="var(--chart-3)"
                  strokeWidth={2.5}
                  strokeDasharray={scopeMode === 'both' ? '5 4' : undefined}
                  fill="url(#turkeyAreaFill)"
                  isAnimationActive={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                  dot={{ r: 3.5, fill: 'var(--chart-3)' }}
                />
              )}

              {hasStudentOverlay && (
                <Line
                  type="monotone"
                  dataKey="activeStudentNet"
                  name={activeStudentName || 'Aktif Öğrenci'}
                  stroke="var(--chart-4)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={{ r: 5, fill: 'var(--chart-4)' }}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          ) : (
            <BarChart
              data={dataset.points}
              margin={{ top: 14, right: 18, left: -4, bottom: 4 }}
              onClick={(state) => {
                const idx = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                if (idx >= 0 && dataset.points[idx]) {
                  setSelectedPointId(dataset.points[idx].id);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                interval={0}
                tickFormatter={(val: string) => val.replace('Deneme ', 'D')}
                tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, dataset.summary.maxQuestions]}
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<NetChartTooltip />} />
              {showInstitution && (
                <Bar
                  dataKey="institutionAvgNet"
                  name="Kurum Geneli Ort."
                  fill="var(--accent-primary)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              )}
              {showTurkey && (
                <Bar
                  dataKey="turkeyAvgNet"
                  name="Türkiye Geneli Ort."
                  fill="var(--chart-3)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Interactive Exam Selector Strip — Clicking any deneme focuses its exact readout */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {dataset.points.map((pt) => {
            const isFocused = activePoint.id === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                data-testid={`net-point-btn-${pt.shortLabel.replace(/\s+/g, '-').toLowerCase()}`}
                aria-pressed={isFocused}
                onClick={() => setSelectedPointId(pt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  isFocused ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {pt.shortLabel}
              </button>
            );
          })}
        </div>

        <div
          className="surface-alt rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
          data-testid="net-focused-point-detail"
        >
          <div className="min-w-0">
            <span className="font-bold">{activePoint.examName}</span>
            <span className="mx-2" style={{ color: 'var(--text-secondary)' }} aria-hidden="true">·</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {activePoint.date} · {activePoint.participantCount.toLocaleString('tr-TR')} katılımcı
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono-num font-bold">
            {showInstitution && (
              <span style={{ color: 'var(--accent-primary)' }}>
                Kurum: {activePoint.institutionAvgNet.toFixed(2)} Net
                {activePoint.institutionDelta !== 0
                  ? ` (${activePoint.institutionDelta > 0 ? '+' : ''}${activePoint.institutionDelta.toFixed(2)})`
                  : ''}
              </span>
            )}
            {showTurkey && (
              <span style={{ color: 'var(--chart-3)' }}>
                Türkiye: {activePoint.turkeyAvgNet.toFixed(2)} Net
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
