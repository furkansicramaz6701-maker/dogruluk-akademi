import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layers, TrendingUp } from 'lucide-react';
import { ExamAnalysisResult, OpenEndedPaperAnalysis } from '../types/academy';
import {
  MultiExamChartSeriesPoint,
  buildMultiExamComparativeDataset,
  selectMultiExamChartSeries,
} from '../utils/multiExamComparative';

interface MultiExamComparativeChartProps {
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  onOpenOmr?: () => void;
}

interface ComparativeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: MultiExamChartSeriesPoint }>;
  metricMode: 'net' | 'pct';
  showClassAverage: boolean;
  subjectLabel: string;
}

function ComparativeTooltip({
  active,
  payload,
  metricMode,
  showClassAverage,
  subjectLabel,
}: ComparativeTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const unit = metricMode === 'net' ? 'Net' : '%';
  const sign = row.delta >= 0 ? '+' : '';

  return (
    <div
      className="surface-card rounded-xl p-3 border shadow-lg text-xs space-y-1.5 min-w-[220px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-extrabold">
        {row.examLabel} ({row.date})
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        Odak: {subjectLabel}
      </div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Öğrenci:</span>
        <strong style={{ color: 'var(--chart-1)' }}>
          {metricMode === 'net' ? `${row.studentValue.toFixed(2)} ${unit}` : `%${row.studentValue}`}
        </strong>
      </div>
      {showClassAverage && (
        <>
          <div className="flex justify-between gap-4 font-mono-num">
            <span style={{ color: 'var(--text-secondary)' }}>Sınıf Ortalaması:</span>
            <strong style={{ color: 'var(--chart-3)' }}>
              {metricMode === 'net'
                ? `${row.classAvgValue.toFixed(2)} ${unit}`
                : `%${row.classAvgValue}`}
            </strong>
          </div>
          <div
            className="flex justify-between gap-4 font-mono-num pt-1 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Sınıfa Göre Fark:</span>
            <strong
              className={
                row.delta >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }
            >
              {metricMode === 'net'
                ? `${sign}${row.delta.toFixed(2)} Net`
                : `${sign}%${row.delta.toFixed(1)}`}
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

export function MultiExamComparativeChart({
  analysis,
  hasLiveAnalysis,
  openEndedAnalysis,
  onOpenOmr,
}: MultiExamComparativeChartProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [metricMode, setMetricMode] = useState<'net' | 'pct'>('net');
  const [showClassAverage, setShowClassAverage] = useState<boolean>(true);

  const dataset = useMemo(
    () =>
      buildMultiExamComparativeDataset({
        analysis,
        hasLiveAnalysis,
        openEndedAnalysis,
      }),
    [analysis, hasLiveAnalysis, openEndedAnalysis]
  );

  // Reset subject selection cleanly if grade changes
  const activeSubject =
    selectedSubject === 'ALL' || dataset.subjectOptions.includes(selectedSubject)
      ? selectedSubject
      : 'ALL';

  const series = useMemo(
    () => selectMultiExamChartSeries(dataset, activeSubject, metricMode),
    [dataset, activeSubject, metricMode]
  );

  const subjectLabel =
    activeSubject === 'ALL' ? 'Tüm Sınav (Genel Net)' : activeSubject;

  if (!hasLiveAnalysis && !openEndedAnalysis) {
    return (
      <section
        aria-label="Son 5 Sınav Karşılaştırmalı Gelişim"
        data-testid="multi-exam-comparative-section"
        className="surface-card rounded-xl p-5 border"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5" style={{ color: 'var(--chart-1)' }} aria-hidden="true" />
            <div>
              <h3 className="text-base font-bold">
                Son 5 Sınav Karşılaştırmalı Ders Gelişimi
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Optik değerlendirme yapıldığında öğrencinin son 5 denemedeki ders bazlı ilerlemesi sınıf ortalamasıyla karşılaştırılır.
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

  return (
    <section
      aria-labelledby="multi-exam-comparative-heading"
      data-testid="multi-exam-comparative-section"
      className="surface-card rounded-xl p-5 space-y-4 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <TrendingUp
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--chart-1)' }}
            aria-hidden="true"
          />
          <div>
            <h3 id="multi-exam-comparative-heading" className="text-base font-extrabold">
              Son 5 Sınav Karşılaştırmalı Gelişim ({subjectLabel})
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Öğrencinin son 5 denemedeki ilerleyişini ders seçerek ve sınıf ortalaması katmanını açıp kapatarak inceleyin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold">
            <span className="sr-only">Ders Filtresi</span>
            <select
              value={activeSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              data-testid="multi-exam-subject-select"
              aria-label="Son 5 Sınav Ders Seçimi"
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold surface-alt border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <option value="ALL">Tüm Sınav (Genel)</option>
              {dataset.subjectOptions.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </label>

          <div
            className="inline-flex rounded-lg p-0.5 surface-alt border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => setMetricMode('net')}
              aria-pressed={metricMode === 'net'}
              className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                metricMode === 'net' ? 'btn-3d' : ''
              }`}
            >
              Net
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('pct')}
              aria-pressed={metricMode === 'pct'}
              className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                metricMode === 'pct' ? 'btn-3d' : ''
              }`}
            >
              % Başarı
            </button>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={showClassAverage}
            data-testid="multi-exam-class-avg-toggle"
            onClick={() => setShowClassAverage((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              showClassAverage ? 'btn-3d' : 'btn-3d-secondary'
            }`}
          >
            <span>
              {showClassAverage ? 'Sınıf Ortalaması: Açık' : 'Sınıf Ortalaması: Kapalı'}
            </span>
          </button>
        </div>
      </div>

      {/* 3 Quick Comparative KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Son Deneme ({subjectLabel})
          </div>
          <div className="text-lg font-extrabold font-mono-num mt-0.5" style={{ color: 'var(--chart-1)' }}>
            {metricMode === 'net'
              ? `${series.latestStudentValue.toFixed(2)} Net`
              : `%${series.latestStudentValue}`}
          </div>
        </div>

        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Sınıf Ortalamasına Göre Fark
          </div>
          <div
            className={`text-lg font-extrabold font-mono-num mt-0.5 ${
              series.deltaFromClass >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {series.deltaFromClass >= 0 ? '+' : ''}
            {metricMode === 'net'
              ? `${series.deltaFromClass.toFixed(2)} Net`
              : `%${series.deltaFromClass.toFixed(1)}`}
          </div>
        </div>

        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            5 Sınavlık İlerleme İvmesi
          </div>
          <div
            className={`text-lg font-extrabold font-mono-num mt-0.5 ${
              series.trendDelta5Exams >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {series.trendDelta5Exams >= 0 ? '+' : ''}
            {metricMode === 'net'
              ? `${series.trendDelta5Exams.toFixed(2)} Net`
              : `%${series.trendDelta5Exams.toFixed(1)}`}
          </div>
        </div>
      </div>

      {/* Recharts Line / Composed Chart */}
      <div
        className="w-full h-[270px] surface-alt rounded-xl p-3 border"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="multi-exam-comparative-chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series.points}
            margin={{ top: 12, right: 38, left: -6, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis
              dataKey="shortLabel"
              interval={0}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              domain={[0, series.maxAxisValue]}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
            />
            <Tooltip
              content={
                <ComparativeTooltip
                  metricMode={metricMode}
                  showClassAverage={showClassAverage}
                  subjectLabel={subjectLabel}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="studentValue"
              name="Öğrenci Performansı"
              fill="var(--chart-1)"
              fillOpacity={0.12}
              stroke="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="studentValue"
              name="Öğrenci"
              stroke="var(--chart-1)"
              strokeWidth={3}
              dot={{ r: 4.5, fill: 'var(--bg-surface)', strokeWidth: 2.5 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
            {showClassAverage && (
              <Line
                type="monotone"
                dataKey="classAvgValue"
                name="Sınıf Ortalaması"
                stroke="var(--chart-3)"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 4, fill: 'var(--bg-surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="w-3.5 h-0.5 inline-block rounded" style={{ backgroundColor: 'var(--chart-1)' }} />
            Öğrenci ({dataset.studentName})
          </span>
          {showClassAverage && (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-3.5 h-0.5 inline-block rounded" style={{ backgroundColor: 'var(--chart-3)' }} />
              Sınıf Ortalaması ({subjectLabel})
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          1. Sınav → 5. Son Deneme
        </span>
      </div>
    </section>
  );
}
