import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Building2,
  FileDown,
  Globe2,
  Loader2,
  School,
  Trophy,
  Users,
} from 'lucide-react';
import {
  CoverConfig,
  ExamRecordSource,
  Institution,
  PersistedExamRecord,
  PrizeExamDefinition,
  RankingPeriodFilter,
} from '../types/academy';
import {
  buildInstitutionRankingsReport,
  GradeLevelRankingGroup,
} from '../utils/institutionRankings';
import { triggerDownload, uint8ArrayToPdfBlob } from '../utils/downloadHelpers';
import { generateGlobalInstitutionRankingPdf } from '../utils/pdfAndZip';

interface GlobalInstitutionRankingBoardProps {
  institutions: Institution[];
  activeInstitution: Institution;
  examHistoryByInst: Record<string, PersistedExamRecord[]>;
  prizeExamsByInst?: Record<string, PrizeExamDefinition[]>;
  cover: CoverConfig;
  isPrivateAdminMode?: boolean;
  onNavigateToOmr?: () => void;
}

interface GradeChartRow {
  gradeLabel: string;
  avgNet: number;
  avgSuccessPct: number;
  avgScore: number;
  studentCount: number;
  classroomCount: number;
}

function GradeComparisonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: GradeChartRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div
      className="surface-card rounded-xl p-3 border shadow-lg text-xs space-y-1 min-w-[200px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="font-extrabold">{row.gradeLabel}</div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Ortalama Net:</span>
        <strong style={{ color: 'var(--chart-1)' }}>{row.avgNet.toFixed(2)} Net</strong>
      </div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Başarı Oranı:</span>
        <strong style={{ color: 'var(--chart-3)' }}>%{row.avgSuccessPct}</strong>
      </div>
      <div className="flex justify-between gap-4 font-mono-num">
        <span style={{ color: 'var(--text-secondary)' }}>Ortalama Puan:</span>
        <strong>{row.avgScore.toFixed(1)}</strong>
      </div>
      <div className="flex justify-between gap-4 font-mono-num pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Ölçüm / Şube:</span>
        <span>{row.studentCount} kayıt · {row.classroomCount} şube</span>
      </div>
    </div>
  );
}

export function GlobalInstitutionRankingBoard({
  institutions,
  activeInstitution,
  examHistoryByInst,
  prizeExamsByInst = {},
  cover,
  isPrivateAdminMode = false,
  onNavigateToOmr,
}: GlobalInstitutionRankingBoardProps) {
  const [viewMode, setViewMode] = useState<'overall' | 'classroom'>('overall');
  const [scopeMode, setScopeMode] = useState<'all-institutions' | 'active-only'>(
    isPrivateAdminMode ? 'all-institutions' : 'active-only'
  );
  const [periodFilter, setPeriodFilter] = useState<RankingPeriodFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | ExamRecordSource>('all');
  const [pdfBusy, setPdfBusy] = useState(false);

  const visibleInstitutions = useMemo(
    () => (isPrivateAdminMode ? institutions : [activeInstitution]),
    [isPrivateAdminMode, institutions, activeInstitution]
  );

  const aggregatedRecords = useMemo(() => {
    if (scopeMode === 'active-only' || !isPrivateAdminMode) {
      return examHistoryByInst[activeInstitution.id] ?? [];
    }
    return visibleInstitutions.flatMap((inst) => examHistoryByInst[inst.id] ?? []);
  }, [scopeMode, isPrivateAdminMode, examHistoryByInst, activeInstitution.id, visibleInstitutions]);

  const aggregatedPrizes = useMemo(() => {
    if (scopeMode === 'active-only' || !isPrivateAdminMode) {
      return prizeExamsByInst[activeInstitution.id] ?? [];
    }
    return visibleInstitutions.flatMap((inst) => prizeExamsByInst[inst.id] ?? []);
  }, [scopeMode, isPrivateAdminMode, prizeExamsByInst, activeInstitution.id, visibleInstitutions]);

  const report = useMemo(
    () =>
      buildInstitutionRankingsReport(aggregatedRecords, aggregatedPrizes, {
        period: periodFilter,
        source: sourceFilter,
        institutions: visibleInstitutions,
      }),
    [aggregatedRecords, aggregatedPrizes, periodFilter, sourceFilter, visibleInstitutions]
  );

  const gradeChartData: GradeChartRow[] = useMemo(
    () =>
      report.stackedGradeRankings.map((g: GradeLevelRankingGroup) => ({
        gradeLabel: g.gradeLabel,
        avgNet: g.avgNet,
        avgSuccessPct: g.avgSuccessPct,
        avgScore: g.avgScore,
        studentCount: g.studentCount,
        classroomCount: g.classroomCount,
      })),
    [report.stackedGradeRankings]
  );

  const periodLabelMap: Record<RankingPeriodFilter, string> = {
    all: 'Tüm Zamanlar',
    daily: 'Günlük',
    weekly: 'Haftalık',
    monthly: 'Aylık',
  };

  const sourceLabelMap: Record<'all' | ExamRecordSource, string> = {
    all: 'Tüm Denemeler',
    kurum: 'Kurum Denemesi',
    'farkli-yayin': 'Farklı Yayın',
    odullu: 'Ödüllü Deneme',
  };

  const handleDownloadPdf = async () => {
    if (report.totalEntries === 0 || pdfBusy) return;
    setPdfBusy(true);
    try {
      const bytes = await generateGlobalInstitutionRankingPdf({
        report,
        institutionName:
          scopeMode === 'all-institutions' && isPrivateAdminMode
            ? `${activeInstitution.name} (Küresel Kurum Ağı)`
            : activeInstitution.name,
        institutionCode8: activeInstitution.code8,
        periodLabel: periodLabelMap[periodFilter],
        sourceLabel: sourceLabelMap[sourceFilter],
        signatureName: cover.signatureName,
        logoStyleId: cover.logoStyleId,
      });
      const blob = uint8ArrayToPdfBlob(bytes);
      triggerDownload(blob, `Kuresel-Kurum-Basari-Siralamasi-${activeInstitution.code8}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  const chartColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
  ];

  return (
    <section
      data-testid="global-institution-ranking-section"
      aria-labelledby="global-ranking-title"
      className="surface-card rounded-xl p-5 space-y-5 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header + Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <Globe2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h2 id="global-ranking-title" className="text-lg font-extrabold leading-tight">
              Küresel Kurum &amp; Sınıf Düzeyi Başarı Sıralaması
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Kayıtlı tüm sınıf düzeylerindeki (ör. 5. Sınıf ve 7. Sınıf) net puanları, genel başarı oranlarını ve şube liderliklerini bir arada karşılaştırın.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switch Toggle: Genel Kurum Başarısı vs Sınıf / Şube Performans Dağılımı */}
          <div
            role="group"
            aria-label="Sıralama görünüm modu"
            data-testid="global-ranking-mode-toggle"
            className="surface-alt rounded-xl p-1 inline-flex items-center gap-1 border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              data-testid="global-ranking-mode-overall-btn"
              onClick={() => setViewMode('overall')}
              aria-pressed={viewMode === 'overall'}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                viewMode === 'overall' ? 'btn-3d' : ''
              }`}
            >
              Genel Kurum Başarısı
            </button>
            <button
              type="button"
              data-testid="global-ranking-mode-classroom-btn"
              onClick={() => setViewMode('classroom')}
              aria-pressed={viewMode === 'classroom'}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                viewMode === 'classroom' ? 'btn-3d' : ''
              }`}
            >
              Sınıf / Şube Dağılımı
            </button>
          </div>

          <button
            type="button"
            disabled={report.totalEntries === 0 || pdfBusy}
            data-testid="global-ranking-download-pdf-btn"
            onClick={() => void handleDownloadPdf()}
            className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {pdfBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{pdfBusy ? 'PDF Hazırlanıyor...' : 'Yönetici PDF İndir'}</span>
          </button>
        </div>
      </div>

      {/* Period + Source + Scope Filters */}
      <div className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dönem filtresi">
          {(['all', 'daily', 'weekly', 'monthly'] as RankingPeriodFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`global-ranking-period-${p}`}
              onClick={() => setPeriodFilter(p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                periodFilter === p ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              {periodLabelMap[p]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sınav kaynağı filtresi">
            {(['all', 'kurum', 'farkli-yayin', 'odullu'] as Array<'all' | ExamRecordSource>).map((src) => (
              <button
                key={src}
                type="button"
                data-testid={`global-ranking-source-${src}`}
                onClick={() => setSourceFilter(src)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  sourceFilter === src ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {sourceLabelMap[src]}
              </button>
            ))}
          </div>

          {isPrivateAdminMode && institutions.length > 1 && (
            <select
              data-testid="global-ranking-inst-scope-select"
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as 'all-institutions' | 'active-only')}
              aria-label="Kurum kapsamı seç"
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold surface-card border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <option value="all-institutions">Tüm Kayıtlı Kurumlar</option>
              <option value="active-only">Sadece {activeInstitution.name}</option>
            </select>
          )}
        </div>
      </div>

      {/* Empty State — Strictly zero fake data */}
      {report.totalEntries === 0 ? (
        <div
          data-testid="global-ranking-empty"
          className="surface-alt rounded-xl p-6 text-center space-y-3 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Trophy className="w-8 h-8 mx-auto opacity-60" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div className="space-y-1 max-w-lg mx-auto">
            <div className="text-sm font-extrabold">
              Henüz Gerçek Deneme Kaydı Bulunmuyor
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Optik Okuma (OMR) sekmesinde kurum denemesi, farklı yayın veya ödüllü deneme okutup analiz ettiğinizde 5. sınıf, 7. sınıf ve tüm şubelerin net ve başarı sıralamaları burada otomatik oluşur.
            </p>
          </div>
          {onNavigateToOmr && (
            <button
              type="button"
              onClick={onNavigateToOmr}
              className="btn-3d px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Optik Okuma Modülüne Git
            </button>
          )}
        </div>
      ) : (
        <>
          {/* KPI Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="global-ranking-kpis">
            <div className="surface-alt rounded-xl p-3.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Toplam Değerlendirme
              </div>
              <div className="text-xl font-extrabold font-mono-num mt-1">
                {report.totalEntries}
              </div>
              <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                {report.stackedGradeRankings.length} Sınıf Düzeyi · {report.classroomRankings.length} Şube
              </div>
            </div>
            <div className="surface-alt rounded-xl p-3.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Küresel Ortalama Net
              </div>
              <div className="text-xl font-extrabold font-mono-num mt-1" style={{ color: 'var(--chart-1)' }}>
                {report.avgNet.toFixed(2)} Net
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Tüm düzeyler ortalaması
              </div>
            </div>
            <div className="surface-alt rounded-xl p-3.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Ortalama Puan &amp; Başarı
              </div>
              <div className="text-xl font-extrabold font-mono-num mt-1" style={{ color: 'var(--chart-3)' }}>
                {report.avgScore.toFixed(1)} P
              </div>
              <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                Genel Başarı: %{report.avgSuccessPct}
              </div>
            </div>
            <div className="surface-alt rounded-xl p-3.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Zirve Öğrenci
              </div>
              <div className="text-sm font-extrabold truncate mt-1">
                {report.overallRanking[0]?.studentName}
              </div>
              <div className="text-[11px] font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                {report.overallRanking[0]?.gradeLabel} ({report.overallRanking[0]?.normalizedClassroom}) ·{' '}
                {report.overallRanking[0]?.totalNet.toFixed(2)} Net
              </div>
            </div>
          </div>

          {/* Side-by-Side Grade-Level Net & Success Rate Bar Chart (Recharts) */}
          <div
            data-testid="global-ranking-grade-chart"
            className="surface-alt rounded-xl p-4 space-y-3 border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">
                  Sınıf Düzeyleri Yan Yana Net &amp; Başarı Karşılaştırması
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Örn. 5. Sınıf ile 7. Sınıf ortalama net puanları ve başarı yüzdeleri yan yana görselleştirilir.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-num">
                {gradeChartData.map((g) => (
                  <span key={g.gradeLabel} className="font-bold">
                    {g.gradeLabel}: {g.avgNet.toFixed(2)} Net (%{g.avgSuccessPct})
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeChartData} margin={{ top: 10, right: 6, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="gradeLabel"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    yAxisId="net"
                    width={34}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="pct"
                    width={36}
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip content={<GradeComparisonTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    yAxisId="net"
                    dataKey="avgNet"
                    name="Ortalama Net"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  >
                    {gradeChartData.map((entry, idx) => (
                      <Cell key={entry.gradeLabel} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Bar>
                  <Bar
                    yAxisId="pct"
                    dataKey="avgSuccessPct"
                    name="Başarı Oranı (%)"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {viewMode === 'overall' ? (
            <div className="space-y-5" data-testid="global-ranking-overall-view">
              {/* Institution-by-Institution Summary */}
              {report.institutionSummaries.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kurum Bazlı Genel Başarı Özeti</span>
                  </div>
                  <div className="overflow-x-auto surface-alt rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          <th className="text-left py-2.5 px-3 font-bold">Kurum</th>
                          <th className="text-right py-2.5 px-3 font-bold">Kod</th>
                          <th className="text-right py-2.5 px-3 font-bold">Ölçüm</th>
                          <th className="text-right py-2.5 px-3 font-bold">Düzey / Şube</th>
                          <th className="text-right py-2.5 px-3 font-bold">Ort. Net</th>
                          <th className="text-right py-2.5 px-3 font-bold">Ort. Puan</th>
                          <th className="text-right py-2.5 px-3 font-bold">Başarı %</th>
                          <th className="text-left py-2.5 px-3 font-bold">Kurum Lideri</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.institutionSummaries.map((inst) => (
                          <tr
                            key={inst.institutionId}
                            className="border-b last:border-b-0"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <td className="py-2.5 px-3 font-extrabold">{inst.institutionName}</td>
                            <td className="py-2.5 px-3 text-right font-mono-num">{inst.institutionCode8}</td>
                            <td className="py-2.5 px-3 text-right font-mono-num">{inst.evaluationCount}</td>
                            <td className="py-2.5 px-3 text-right font-mono-num">
                              {inst.gradeCount} düzey · {inst.classroomCount} şube
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-num font-bold" style={{ color: 'var(--chart-1)' }}>
                              {inst.avgNet.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-num font-bold">
                              {inst.avgScore.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                              %{inst.avgSuccessPct}
                            </td>
                            <td className="py-2.5 px-3 font-semibold">{inst.topStudentName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Stacked Vertical Grade-Level Leaderboards (5. Sınıf, 7. Sınıf...) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  <School className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sınıf Düzeyine Göre Alt Alta Başarı Sıralamaları</span>
                </div>
                <div className="space-y-4">
                  {report.stackedGradeRankings.map((group) => (
                    <div
                      key={group.gradeId}
                      data-testid={`global-stacked-grade-${group.gradeId}`}
                      className="surface-alt rounded-xl border overflow-hidden"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b surface-card" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="text-sm font-extrabold">
                          {group.gradeLabel} Başarı Sıralaması
                        </div>
                        <div className="text-xs font-mono-num flex flex-wrap items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
                          <span>{group.studentCount} Öğrenci</span>
                          <span>·</span>
                          <span>Ort. Net: <strong style={{ color: 'var(--text-primary)' }}>{group.avgNet.toFixed(2)}</strong></span>
                          <span>·</span>
                          <span>Ort. Puan: <strong style={{ color: 'var(--text-primary)' }}>{group.avgScore.toFixed(1)}</strong></span>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">%{group.avgSuccessPct} Başarı</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              <th className="text-left py-2 px-3 font-semibold">Sıra</th>
                              <th className="text-left py-2 px-3 font-semibold">Öğrenci</th>
                              <th className="text-left py-2 px-3 font-semibold">Kurum · Şube</th>
                              <th className="text-left py-2 px-3 font-semibold">Deneme / Kaynak</th>
                              <th className="text-right py-2 px-3 font-semibold">D / Y / B</th>
                              <th className="text-right py-2 px-3 font-semibold">Net</th>
                              <th className="text-right py-2 px-3 font-semibold">Puan</th>
                              <th className="text-right py-2 px-3 font-semibold">Başarı</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map((row) => (
                              <tr key={row.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                                <td className="py-2 px-3 font-mono-num font-extrabold">#{row.gradeRank}</td>
                                <td className="py-2 px-3 font-bold">
                                  {row.studentName}
                                  {row.studentNumber8 ? (
                                    <span className="ml-1.5 text-[11px] font-mono-num font-normal" style={{ color: 'var(--text-secondary)' }}>
                                      ({row.studentNumber8})
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-2 px-3">{row.institutionName} · {row.normalizedClassroom}</td>
                                <td className="py-2 px-3">
                                  <span className="font-semibold">{row.examTitle}</span>
                                  <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    · {row.sourceLabel}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono-num">
                                  {row.totalCorrect}D / {row.totalWrong}Y / {row.totalBlank}B
                                </td>
                                <td className="py-2 px-3 text-right font-mono-num font-extrabold" style={{ color: 'var(--chart-1)' }}>
                                  {row.totalNet.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono-num font-bold">
                                  {row.estimatedScore.toFixed(1)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                                  %{row.successPct}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Classroom Performance Breakdown View */
            <div className="space-y-4" data-testid="global-ranking-classroom-view">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sınıf / Şube Bazlı Performans Dağılımı ve Sıralaması</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {report.classroomRankings.map((cls, idx) => (
                  <div
                    key={`${cls.institutionId}-${cls.gradeId}-${cls.classroom}`}
                    data-testid={`global-classroom-card-${cls.classroom}`}
                    className="surface-alt rounded-xl p-4 border space-y-3"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold">
                          #{idx + 1} · {cls.classroom} ({cls.gradeLabel})
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {cls.institutionName} · {cls.studentCount} Değerlendirme
                        </div>
                      </div>
                      <div className="text-right font-mono-num">
                        <div className="text-base font-extrabold" style={{ color: 'var(--chart-1)' }}>
                          {cls.avgNet.toFixed(2)} Net
                        </div>
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          %{cls.avgSuccessPct} Başarı · {cls.avgScore.toFixed(1)} P
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                      {cls.entries.slice(0, 5).map((stu) => (
                        <div key={stu.id} className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">
                            <span className="font-mono-num mr-1.5" style={{ color: 'var(--text-secondary)' }}>
                              {stu.classRank}.
                            </span>
                            {stu.studentName}
                          </span>
                          <span className="font-mono-num shrink-0 font-bold">
                            {stu.totalNet.toFixed(2)} Net · %{stu.successPct}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
