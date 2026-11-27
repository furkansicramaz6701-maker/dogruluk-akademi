import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  Trophy,
} from 'lucide-react';
import {
  ExamAnalysisResult,
  ExamRecordSource,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  PersistedExamRecord,
  StudentRecord,
  WeeklyStudentScore,
} from '../types/academy';
import {
  InstitutionChartMetric,
  InstitutionChartSort,
  InstitutionSuccessRow,
  SuccessDistributionBand,
  buildInstitutionSuccessDistribution,
  shortenInstitutionLabel,
} from '../utils/institutionSuccessDistribution';

interface InstitutionSuccessChartProps {
  institutions: Institution[];
  activeInstitution: Institution;
  examHistoryByInst: Record<string, PersistedExamRecord[]>;
  weeklyEntriesByInst?: Record<string, WeeklyStudentScore[]>;
  students: StudentRecord[];
  gradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  questionCount: number;
  onSelectInstitution?: (inst: Institution) => void;
  onNavigateToOmr?: () => void;
}

function bandBarColor(band: SuccessDistributionBand): string {
  switch (band) {
    case 'high':
      return '#10b981';
    case 'mid':
      return 'var(--accent-primary)';
    case 'support':
      return '#f59e0b';
    case 'none':
      return '#94a3b8';
  }
}

function bandBadgeClass(band: SuccessDistributionBand): string {
  switch (band) {
    case 'high':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'mid':
      return 'text-sky-600 dark:text-sky-400';
    case 'support':
      return 'text-amber-600 dark:text-amber-400';
    case 'none':
      return '';
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: InstitutionSuccessRow }>;
}

function InstitutionSuccessTooltip({ active, payload }: CustomTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div
      className="surface-card rounded-xl p-3 border shadow-xl text-xs space-y-1.5 min-w-[230px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div>
        <div className="font-extrabold leading-snug">{row.institutionName}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {row.city || 'Türkiye'} · Kod: <span className="font-mono-num">{row.institutionCode8}</span>
        </div>
      </div>

      {row.hasData ? (
        <div
          className="pt-1.5 border-t space-y-1 font-mono-num"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <span style={{ color: 'var(--text-secondary)' }}>Başarı Oranı:</span>
            <strong className={bandBadgeClass(row.band)}>%{row.avgSuccessPct}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span style={{ color: 'var(--text-secondary)' }}>Ortalama Net:</span>
            <strong style={{ color: 'var(--chart-1)' }}>{row.avgNet.toFixed(2)} Net</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span style={{ color: 'var(--text-secondary)' }}>Ortalama Puan:</span>
            <strong>{row.avgScore.toFixed(1)} P</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span style={{ color: 'var(--text-secondary)' }}>Ölçüm / Öğrenci:</span>
            <span>
              {row.evaluationCount} ölçüm · {row.registeredStudentCount} kayıt
            </span>
          </div>
          <div
            className="pt-1 border-t flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Zirve Öğrenci:</span>
            <span className="font-sans font-bold truncate max-w-[130px]">{row.topStudentName}</span>
          </div>
        </div>
      ) : (
        <div
          className="pt-1.5 border-t text-[11px]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          Henüz deneme kaydı yok ({row.registeredStudentCount} kayıtlı öğrenci)
        </div>
      )}
    </div>
  );
}

export function InstitutionSuccessChart({
  institutions,
  activeInstitution,
  examHistoryByInst,
  weeklyEntriesByInst,
  students,
  gradeProfile,
  penaltyDivisor,
  analysis,
  hasLiveAnalysis,
  questionCount,
  onSelectInstitution,
  onNavigateToOmr,
}: InstitutionSuccessChartProps) {
  const [metric, setMetric] = useState<InstitutionChartMetric>('successPct');
  const [sortBy, setSortBy] = useState<InstitutionChartSort>('performance');
  const [sourceFilter, setSourceFilter] = useState<'all' | ExamRecordSource>('all');
  const [includeEmpty, setIncludeEmpty] = useState<boolean>(true);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);

  const dataset = useMemo(
    () =>
      buildInstitutionSuccessDistribution({
        institutions,
        activeInstitutionId: activeInstitution.id,
        examHistoryByInst,
        weeklyEntriesByInst,
        students,
        gradeProfile,
        penaltyDivisor,
        liveAnalysis: {
          hasLiveAnalysis,
          analysis,
          totalQuestions: questionCount,
        },
        sourceFilter,
        metric,
        sortBy,
        includeEmptyInstitutions: includeEmpty,
      }),
    [
      institutions,
      activeInstitution.id,
      examHistoryByInst,
      weeklyEntriesByInst,
      students,
      gradeProfile,
      penaltyDivisor,
      hasLiveAnalysis,
      analysis,
      questionCount,
      sourceFilter,
      metric,
      sortBy,
      includeEmpty,
    ]
  );

  const focusedRow = useMemo(() => {
    if (dataset.chartRows.length === 0) return null;
    if (selectedInstitutionId) {
      const found = dataset.chartRows.find((r) => r.institutionId === selectedInstitutionId);
      if (found) return found;
    }
    return (
      dataset.chartRows.find((r) => r.hasData) ??
      dataset.chartRows.find((r) => r.isActiveInstitution) ??
      dataset.chartRows[0]
    );
  }, [dataset.chartRows, selectedInstitutionId]);

  const barDataKey =
    metric === 'successPct'
      ? 'avgSuccessPct'
      : metric === 'avgNet'
        ? 'avgNet'
        : 'avgScore';

  const metricLabel =
    metric === 'successPct'
      ? 'Başarı Oranı (%)'
      : metric === 'avgNet'
        ? 'Ortalama Net'
        : 'Ortalama Puan';

  const referenceAverage =
    metric === 'successPct'
      ? dataset.summary.globalAvgSuccessPct
      : metric === 'avgNet'
        ? dataset.summary.globalAvgNet
        : dataset.summary.globalAvgScore;

  const formatMetricValue = (row: InstitutionSuccessRow): string => {
    if (!row.hasData) return 'Veri Yok';
    if (metric === 'successPct') return `%${row.avgSuccessPct}`;
    if (metric === 'avgNet') return `${row.avgNet.toFixed(2)} Net`;
    return `${row.avgScore.toFixed(1)} P`;
  };

  const yAxisDomain: [number, number | 'auto'] =
    metric === 'successPct' ? [0, 100] : metric === 'avgScore' ? [0, 500] : [0, 'auto'];

  return (
    <section
      aria-labelledby="institution-success-chart-title"
      data-testid="institution-success-chart-section"
      className="surface-card rounded-xl p-5 space-y-5 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header + Metric & Sort Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <BarChart3
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id="institution-success-chart-title"
              className="text-base sm:text-lg font-extrabold leading-tight"
            >
              Kurumlar Arası Başarı Dağılımı ({dataset.summary.totalInstitutions} Kurum)
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Kayıtlı kurumların mevcut sınav, optik okuma ve haftalık liste sonuçlarına göre karşılaştırmalı başarı dağılımı.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Kurum grafiği ölçütü"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            {(
              [
                { id: 'successPct' as InstitutionChartMetric, label: 'Başarı (%)' },
                { id: 'avgNet' as InstitutionChartMetric, label: 'Ort. Net' },
                { id: 'avgScore' as InstitutionChartMetric, label: 'Ort. Puan' },
              ] as const
            ).map((opt) => {
              const active = metric === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`inst-chart-metric-${opt.id}`}
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

          <div
            role="group"
            aria-label="Kurum sıralama düzeni"
            className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
          >
            {(
              [
                { id: 'performance' as InstitutionChartSort, label: 'Başarıya Göre' },
                { id: 'evaluations' as InstitutionChartSort, label: 'Ölçüm Sayısı' },
                { id: 'name' as InstitutionChartSort, label: 'Ada Göre' },
              ] as const
            ).map((opt) => {
              const active = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`inst-chart-sort-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setSortBy(opt.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Row: Exam Source + Include Empty Institutions + Legend */}
      <div className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Deneme kaynağı filtresi">
          {(
            [
              { id: 'all', label: 'Tüm Kaynaklar' },
              { id: 'kurum', label: 'Kurum' },
              { id: 'farkli-yayin', label: 'Farklı Yayın' },
              { id: 'odullu', label: 'Ödüllü' },
            ] as const
          ).map((src) => (
            <button
              key={src.id}
              type="button"
              data-testid={`inst-chart-source-${src.id}`}
              aria-pressed={sourceFilter === src.id}
              onClick={() => setSourceFilter(src.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                sourceFilter === src.id ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-3 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" />
              <span>%75+ ({dataset.summary.bandCounts.high})</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: 'var(--accent-primary)' }}
                aria-hidden="true"
              />
              <span>%50–74 ({dataset.summary.bandCounts.mid})</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" aria-hidden="true" />
              <span>&lt;%50 ({dataset.summary.bandCounts.support})</span>
            </span>
          </div>

          {dataset.summary.institutionsWithData > 0 && dataset.summary.bandCounts.none > 0 && (
            <button
              type="button"
              data-testid="inst-chart-toggle-empty"
              aria-pressed={includeEmpty}
              onClick={() => setIncludeEmpty((v) => !v)}
              className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
            >
              {includeEmpty ? 'Verisizleri Gizle' : 'Tüm Kurumları Göster'}
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-3 border-y"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="inst-chart-summary-strip"
      >
        <div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            En Yüksek Başarılı Kurum
          </div>
          <div className="mt-0.5 text-sm font-extrabold truncate">
            {dataset.summary.topInstitution
              ? dataset.summary.topInstitution.institutionName
              : 'Henüz Ölçüm Yok'}
          </div>
          <div className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
            {dataset.summary.topInstitution
              ? `%${dataset.summary.topInstitution.avgSuccessPct} · ${dataset.summary.topInstitution.avgNet.toFixed(2)} Net`
              : `${dataset.summary.totalInstitutions} kurum kayıtlı`}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Kurumlar Genel Ortalaması
          </div>
          <div className="mt-0.5 text-lg font-extrabold font-mono-num" style={{ color: 'var(--accent-primary)' }}>
            %{dataset.summary.globalAvgSuccessPct}
          </div>
          <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {dataset.summary.globalAvgNet.toFixed(2)} Net · {dataset.summary.globalAvgScore.toFixed(1)} Puan
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Kurumlar Arası Başarı Farkı
          </div>
          <div className="mt-0.5 text-lg font-extrabold font-mono-num">
            {dataset.summary.institutionsWithData >= 2
              ? `%${dataset.summary.successSpreadPct} Fark`
              : '—'}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {dataset.summary.institutionsWithData} / {dataset.summary.totalInstitutions} kurumda aktif veri
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Toplam Değerlendirme &amp; Kayıt
          </div>
          <div className="mt-0.5 text-lg font-extrabold font-mono-num">
            {dataset.summary.totalEvaluations} Ölçüm
          </div>
          <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {dataset.summary.totalRegisteredStudents} kayıtlı öğrenci
          </div>
        </div>
      </div>

      {dataset.summary.totalEvaluations === 0 ? (
        <div
          data-testid="inst-chart-empty-state"
          className="surface-alt rounded-xl p-5 space-y-4 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Trophy className="w-5 h-5 mt-0.5 shrink-0 opacity-75" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold">
                  Kayıtlı Kurumlarda Henüz Sınav Değerlendirmesi Bulunmuyor
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Sahte veri üretilmez; Optik Okuma (OMR) veya Haftalık Liste üzerinden değerlendirme yapıldığında kurumlar arası Recharts sütun dağılımı canlı güncellenir.
                </p>
              </div>
            </div>

            {onNavigateToOmr && (
              <button
                type="button"
                data-testid="inst-chart-go-omr-btn"
                onClick={onNavigateToOmr}
                className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Optik Okuma ile Başla</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {dataset.rows.map((inst) => (
              <div
                key={inst.institutionId}
                className="surface-card rounded-lg p-3 border flex items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{inst.institutionName}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {inst.city || 'Türkiye'} · Kod: <span className="font-mono-num">{inst.institutionCode8}</span>
                  </div>
                </div>
                <span className="font-mono-num font-bold shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {inst.registeredStudentCount} öğrenci
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Interactive Recharts BarChart */}
          <div
            className="w-full min-w-0 h-[280px]"
            data-testid="institution-success-recharts-container"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={dataset.chartRows}
                margin={{
                  top: 14,
                  right: 12,
                  left: 0,
                  bottom: dataset.chartRows.length >= 3 ? 22 : 8,
                }}
                onClick={(state) => {
                  const idx =
                    typeof state?.activeTooltipIndex === 'number'
                      ? state.activeTooltipIndex
                      : -1;
                  if (idx >= 0 && dataset.chartRows[idx]) {
                    setSelectedInstitutionId(dataset.chartRows[idx].institutionId);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="shortName"
                  interval={0}
                  angle={dataset.chartRows.length >= 3 ? -14 : 0}
                  textAnchor={dataset.chartRows.length >= 3 ? 'end' : 'middle'}
                  height={dataset.chartRows.length >= 3 ? 52 : 32}
                  tickFormatter={(v: string) => shortenInstitutionLabel(v, 14)}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  width={42}
                  domain={yAxisDomain}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<InstitutionSuccessTooltip />} />
                {referenceAverage > 0 && (
                  <ReferenceLine
                    y={referenceAverage}
                    stroke="var(--chart-3)"
                    strokeDasharray="5 4"
                    strokeWidth={1.75}
                  />
                )}
                <Bar
                  key={barDataKey}
                  dataKey={barDataKey}
                  name={metricLabel}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={54}
                  isAnimationActive={false}
                  onClick={(entry) => {
                    const row = entry as unknown as InstitutionSuccessRow;
                    if (row?.institutionId) {
                      setSelectedInstitutionId(row.institutionId);
                    }
                  }}
                >
                  {dataset.chartRows.map((row) => {
                    const isFocused = focusedRow?.institutionId === row.institutionId;
                    return (
                      <Cell
                        key={row.institutionId}
                        cursor="pointer"
                        fill={bandBarColor(row.band)}
                        stroke={isFocused ? 'var(--text-primary)' : 'transparent'}
                        strokeWidth={isFocused ? 2 : 0}
                        fillOpacity={row.hasData ? (isFocused ? 1 : 0.85) : 0.35}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Institution Selector Bar + Drilldown Readout */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {dataset.chartRows.map((row) => {
                const isFocused = focusedRow?.institutionId === row.institutionId;
                return (
                  <button
                    key={row.institutionId}
                    type="button"
                    data-testid={`inst-chart-select-${row.institutionId}`}
                    aria-pressed={isFocused}
                    onClick={() => setSelectedInstitutionId(row.institutionId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isFocused ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{row.shortName}</span>
                    <span className="font-mono-num opacity-85">({formatMetricValue(row)})</span>
                  </button>
                );
              })}
            </div>

            {focusedRow && (
              <div
                data-testid="institution-success-detail-card"
                className="surface-alt rounded-xl p-4 border space-y-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold">{focusedRow.institutionName}</span>
                      {focusedRow.isActiveInstitution && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Aktif Kurum</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {focusedRow.city || 'Türkiye'} · Kurum Kodu:{' '}
                      <span className="font-mono-num font-bold">{focusedRow.institutionCode8}</span> ·{' '}
                      {focusedRow.bandLabel}
                    </div>
                  </div>

                  {!focusedRow.isActiveInstitution && onSelectInstitution && (
                    <button
                      type="button"
                      data-testid="inst-chart-activate-btn"
                      onClick={() => {
                        const target = institutions.find(
                          (i) => i.id === focusedRow.institutionId
                        );
                        if (target) onSelectInstitution(target);
                      }}
                      className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span>Bu Kurumu Aktif Et</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="surface-card rounded-lg p-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Başarı &amp; Net
                    </div>
                    <div className="font-mono-num font-extrabold mt-0.5">
                      %{focusedRow.avgSuccessPct} · {focusedRow.avgNet.toFixed(2)} Net
                    </div>
                  </div>
                  <div className="surface-card rounded-lg p-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Ortalama Puan
                    </div>
                    <div className="font-mono-num font-extrabold mt-0.5">
                      {focusedRow.avgScore.toFixed(1)} Puan
                    </div>
                  </div>
                  <div className="surface-card rounded-lg p-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Kaynak Dağılımı
                    </div>
                    <div className="font-mono-num font-bold mt-0.5">
                      K:{focusedRow.sourceCounts.kurum} · FY:{focusedRow.sourceCounts.farkliYayin} · Ö:{focusedRow.sourceCounts.odullu}
                    </div>
                  </div>
                  <div className="surface-card rounded-lg p-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Kurum Lideri
                    </div>
                    <div className="font-bold truncate mt-0.5">
                      {focusedRow.topStudentName}{' '}
                      {focusedRow.topScore > 0 ? (
                        <span className="font-mono-num text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                          ({focusedRow.topScore.toFixed(1)})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {focusedRow.gradeBreakdown.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                      Sınıf Düzeyleri:
                    </span>
                    {focusedRow.gradeBreakdown.map((g) => (
                      <span
                        key={g.gradeId}
                        className="surface-card px-2.5 py-1 rounded-md font-mono-num font-semibold border"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {g.gradeLabel}: %{g.avgSuccessPct} ({g.avgNet.toFixed(1)} Net · {g.evaluationCount} kayıt)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
