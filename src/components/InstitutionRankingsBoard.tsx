import { FormEvent, useMemo, useState } from 'react';
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
import {
  ArrowRight,
  Award,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  Plus,
  School,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { getGradeProfile, GRADE_PROFILES } from '../data/curriculum';
import {
  ExamRecordSource,
  ExamSourceMode,
  GradeLevelId,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  PersistedExamRecord,
  PrizeExamDefinition,
  RankingPeriodFilter,
  StudentRecord,
  WeeklyStudentScore,
} from '../types/academy';
import {
  buildInstitutionRankingsReport,
  buildWeeklyEffectiveExamRecords,
  ClassroomRankingGroup,
  formatPrizeExamGradesLabel,
  InstitutionComparisonSummary,
  resolvePrizeExamGrades,
  togglePrizeGradeSelection,
} from '../utils/institutionRankings';
import { shortenInstitutionLabel } from '../utils/institutionSuccessDistribution';

interface InstitutionRankingsBoardProps {
  activeInstitution: Institution;
  institutions?: Institution[];
  examHistory: PersistedExamRecord[];
  examHistoryByInst?: Record<string, PersistedExamRecord[]>;
  weeklyEntriesByInst?: Record<string, WeeklyStudentScore[]>;
  prizeExams: PrizeExamDefinition[];
  prizeExamsByInst?: Record<string, PrizeExamDefinition[]>;
  activePrizeExamId: string | null;
  students?: StudentRecord[];
  gradeProfile?: GradeProfile;
  penaltyDivisor?: PenaltyDivisor;
  weeklyQuestionCount?: number;
  weeklyExamTitle?: string;
  weeklyExamDate?: string;
  isPrivateAdminMode?: boolean;
  onSelectInstitution?: (inst: Institution) => void;
  onCreatePrizeExam: (exam: PrizeExamDefinition) => void;
  onDeletePrizeExam: (id: string) => void;
  onActivatePrizeExamForOmr: (prizeExamId: string | null) => void;
  onOpenOmr?: () => void;
}

type RankingsChartMode = 'institution' | 'classroom';
type RankingsScopeMode = 'all-institutions' | 'active-only';

interface WeeklyChartDatum {
  key: string;
  rank: number;
  label: string;
  title: string;
  subtitle: string;
  avgSuccessPct: number;
  avgNet: number;
  avgScore: number;
  countLabel: string;
  leaderName: string;
}

function getSuccessColor(pct: number): string {
  if (pct >= 75) return '#10b981';
  if (pct >= 50) return 'var(--accent-primary)';
  return '#f59e0b';
}

function WeeklyRankingsChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: WeeklyChartDatum }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div
      className="surface-card rounded-xl p-3 border shadow-xl text-xs space-y-1.5 min-w-[220px]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div>
        <div className="font-extrabold leading-snug">
          #{row.rank} · {row.title}
        </div>
        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {row.subtitle}
        </div>
      </div>
      <div className="pt-1.5 border-t space-y-1 font-mono-num" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Başarı Oranı:</span>
          <strong className="text-emerald-600 dark:text-emerald-400">%{row.avgSuccessPct}</strong>
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
          <span style={{ color: 'var(--text-secondary)' }}>Kapsam:</span>
          <span>{row.countLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--text-secondary)' }}>Lider:</span>
          <span className="font-sans font-bold truncate max-w-[125px]">{row.leaderName}</span>
        </div>
      </div>
    </div>
  );
}

export function InstitutionRankingsBoard({
  activeInstitution,
  institutions,
  examHistory,
  examHistoryByInst,
  weeklyEntriesByInst,
  prizeExams,
  prizeExamsByInst,
  activePrizeExamId,
  students = [],
  gradeProfile,
  penaltyDivisor,
  weeklyQuestionCount = 50,
  weeklyExamTitle,
  weeklyExamDate,
  isPrivateAdminMode = false,
  onSelectInstitution,
  onCreatePrizeExam,
  onDeletePrizeExam,
  onActivatePrizeExamForOmr,
  onOpenOmr,
}: InstitutionRankingsBoardProps) {
  const visibleInstitutions = useMemo(() => {
    if (institutions && institutions.length > 0) return institutions;
    return [activeInstitution];
  }, [institutions, activeInstitution]);

  const [scopeMode, setScopeMode] = useState<RankingsScopeMode>(() =>
    visibleInstitutions.length > 1 ? 'all-institutions' : 'active-only'
  );
  const [chartMode, setChartMode] = useState<RankingsChartMode>('institution');
  const [periodFilter, setPeriodFilter] = useState<RankingPeriodFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | ExamRecordSource>('all');
  const [showPrizeCreator, setShowPrizeCreator] = useState<boolean>(false);

  const [prizeTitle, setPrizeTitle] = useState<string>('');
  const [prizeReward, setPrizeReward] = useState<string>('1.ye Ödül & Başarı Belgesi');
  const [prizePeriod, setPrizePeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [prizeSelectedGrades, setPrizeSelectedGrades] = useState<GradeLevelId[]>([]);
  const [prizeSourceMode, setPrizeSourceMode] = useState<ExamSourceMode>('kurum');
  const [prizePublisher, setPrizePublisher] = useState<string>('');

  const effectiveScope: RankingsScopeMode =
    visibleInstitutions.length <= 1 ? 'active-only' : scopeMode;

  const scopedInstitutions = useMemo(
    () => (effectiveScope === 'active-only' ? [activeInstitution] : visibleInstitutions),
    [effectiveScope, activeInstitution, visibleInstitutions]
  );

  const effectiveRecords = useMemo(() => {
    const scopedIds = new Set(scopedInstitutions.map((i) => i.id));
    const scopedHistoryMap: Record<string, PersistedExamRecord[]> = {};
    if (examHistoryByInst) {
      for (const inst of scopedInstitutions) {
        scopedHistoryMap[inst.id] = examHistoryByInst[inst.id] ?? [];
      }
    } else {
      scopedHistoryMap[activeInstitution.id] = examHistory;
    }

    const scopedWeeklyMap: Record<string, WeeklyStudentScore[]> = {};
    if (weeklyEntriesByInst) {
      for (const [instId, list] of Object.entries(weeklyEntriesByInst)) {
        if (scopedIds.has(instId)) {
          scopedWeeklyMap[instId] = list;
        }
      }
    }

    const fallbackProfile = gradeProfile ?? getGradeProfile('5');
    return buildWeeklyEffectiveExamRecords({
      institutions: scopedInstitutions,
      examHistoryByInst: scopedHistoryMap,
      weeklyEntriesByInst: scopedWeeklyMap,
      students,
      fallbackGradeProfile: fallbackProfile,
      penaltyDivisor: penaltyDivisor ?? fallbackProfile.penaltyDivisor,
      weeklyQuestionCount,
      weeklyExamTitle,
      weeklyExamDate,
    });
  }, [
    scopedInstitutions,
    examHistoryByInst,
    examHistory,
    activeInstitution.id,
    weeklyEntriesByInst,
    students,
    gradeProfile,
    penaltyDivisor,
    weeklyQuestionCount,
    weeklyExamTitle,
    weeklyExamDate,
  ]);

  const effectivePrizeExams = useMemo(() => {
    const byId = new Map<string, PrizeExamDefinition>();
    for (const px of prizeExams) {
      byId.set(px.id, px);
    }
    if (effectiveScope === 'all-institutions' && prizeExamsByInst) {
      for (const inst of scopedInstitutions) {
        for (const px of prizeExamsByInst[inst.id] ?? []) {
          if (!byId.has(px.id)) byId.set(px.id, px);
        }
      }
    }
    return Array.from(byId.values());
  }, [prizeExams, effectiveScope, prizeExamsByInst, scopedInstitutions]);

  const report = useMemo(
    () =>
      buildInstitutionRankingsReport(effectiveRecords, effectivePrizeExams, {
        period: periodFilter,
        source: sourceFilter,
        institutions: scopedInstitutions,
      }),
    [effectiveRecords, effectivePrizeExams, periodFilter, sourceFilter, scopedInstitutions]
  );

  const chartData: WeeklyChartDatum[] = useMemo(() => {
    if (chartMode === 'institution') {
      return report.institutionSummaries.map((inst: InstitutionComparisonSummary, idx: number) => ({
        key: inst.institutionId,
        rank: idx + 1,
        label: shortenInstitutionLabel(inst.institutionName, 14),
        title: inst.institutionName,
        subtitle: `${inst.city || 'Türkiye'} · Kod: ${inst.institutionCode8}`,
        avgSuccessPct: inst.avgSuccessPct,
        avgNet: inst.avgNet,
        avgScore: inst.avgScore,
        countLabel: `${inst.evaluationCount} ölçüm · ${inst.classroomCount} şube`,
        leaderName: inst.topStudentName,
      }));
    }
    return report.classroomRankings.slice(0, 12).map((cls: ClassroomRankingGroup, idx: number) => ({
      key: `${cls.institutionId}::${cls.gradeId}::${cls.classroom}`,
      rank: idx + 1,
      label:
        scopedInstitutions.length > 1
          ? `${cls.classroom} (${shortenInstitutionLabel(cls.institutionName, 8)})`
          : cls.classroom,
      title: `${cls.classroom} (${cls.gradeLabel})`,
      subtitle: cls.institutionName,
      avgSuccessPct: cls.avgSuccessPct,
      avgNet: cls.avgNet,
      avgScore: cls.avgScore,
      countLabel: `${cls.studentCount} öğrenci`,
      leaderName: cls.topStudentName,
    }));
  }, [chartMode, report.institutionSummaries, report.classroomRankings, scopedInstitutions.length]);

  const handleCreatePrize = (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = prizeTitle.trim();
    if (!cleanTitle) return;
    const orderedGrades = resolvePrizeExamGrades({
      gradeId: 'all',
      gradeIds: prizeSelectedGrades,
    });
    const created: PrizeExamDefinition = {
      id: `prize-${Date.now()}`,
      institutionId: activeInstitution.id,
      title: cleanTitle,
      prizeDescription: prizeReward.trim() || 'Derece Başarı Ödülü',
      period: prizePeriod,
      gradeId: orderedGrades.length === 1 ? orderedGrades[0] : 'all',
      gradeIds: orderedGrades.length > 0 ? orderedGrades : undefined,
      sourceMode: prizeSourceMode,
      publisherName: prizeSourceMode === 'farkli-yayin' ? prizePublisher.trim() || undefined : undefined,
      examDate: new Date().toLocaleDateString('tr-TR'),
      createdAt: new Date().toISOString(),
    };
    onCreatePrizeExam(created);
    onActivatePrizeExamForOmr(created.id);
    setPrizeTitle('');
    setShowPrizeCreator(false);
  };

  return (
    <section
      id="weekly-institution-rankings-board"
      data-testid="institution-rankings-board"
      aria-labelledby="institution-rankings-board-title"
      className="surface-card rounded-xl p-5 space-y-5 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header + Ödüllü Deneme Action */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Trophy className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="institution-rankings-board-title" className="text-base font-extrabold">
              Haftalık Kurum Sıra Başarısı, Kurum Sınıf Başarısı &amp; Ödüllü Deneme Sıralamaları
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Haftalık listede yapılan testler ve okutulan tüm Kurum / Farklı Yayın / Ödüllü denemeler burada kurum sıra başarısı ve şube başarısı olarak otomatik sıralanır.
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="toggle-prize-exam-creator-btn"
          onClick={() => setShowPrizeCreator((v) => !v)}
          className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showPrizeCreator ? 'Formu Kapat' : 'Ödüllü Deneme Oluştur'}</span>
        </button>
      </div>

      {/* Ödüllü Deneme Quick Form */}
      {showPrizeCreator && (
        <form
          onSubmit={handleCreatePrize}
          data-testid="prize-exam-creator-form"
          className="surface-alt rounded-xl p-4 border space-y-4"
          style={{ borderColor: 'var(--accent-primary)' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <label className="lg:col-span-4 block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Ödüllü Deneme Adı</span>
              <input
                type="text"
                required
                data-testid="prize-exam-title-input"
                value={prizeTitle}
                onChange={(e) => setPrizeTitle(e.target.value)}
                placeholder="Örn: Özdebir 3–8. Sınıflar Ödüllü Deneme"
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card border font-semibold"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>
            <label className="lg:col-span-3 block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Ödül Açıklaması</span>
              <input
                type="text"
                data-testid="prize-exam-reward-input"
                value={prizeReward}
                onChange={(e) => setPrizeReward(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card border font-semibold"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>
            <label className="lg:col-span-2 block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Dönem</span>
              <select
                data-testid="prize-exam-period-select"
                value={prizePeriod}
                onChange={(e) => setPrizePeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card border font-bold"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </select>
            </label>
            <div className="lg:col-span-3 block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Deneme Kaynağı</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5" role="group" aria-label="Ödüllü deneme kaynağı">
                <button
                  type="button"
                  data-testid="prize-source-kurum-btn"
                  aria-pressed={prizeSourceMode === 'kurum'}
                  onClick={() => setPrizeSourceMode('kurum')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                    prizeSourceMode === 'kurum' ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  Kurum
                </button>
                <button
                  type="button"
                  data-testid="prize-source-external-btn"
                  aria-pressed={prizeSourceMode === 'farkli-yayin'}
                  onClick={() => setPrizeSourceMode('farkli-yayin')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                    prizeSourceMode === 'farkli-yayin' ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  Farklı Yayın
                </button>
              </div>
            </div>
          </div>

          {prizeSourceMode === 'farkli-yayin' && (
            <div className="surface-card rounded-xl p-3 border space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <label className="md:col-span-5 block text-xs font-semibold">
                  <span style={{ color: 'var(--text-secondary)' }}>Yayın Adı (Harici Kitapçık / Cevap Anahtarı)</span>
                  <input
                    type="text"
                    data-testid="prize-publisher-input"
                    value={prizePublisher}
                    onChange={(e) => setPrizePublisher(e.target.value)}
                    placeholder="Örn: Özdebir, Töder, Hız, Ankara Yayıncılık..."
                    className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt border font-semibold"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  />
                </label>
                <div className="md:col-span-7 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
                    Hızlı Yayın Seç:
                  </span>
                  {['Özdebir', 'Töder', 'Hız Yayınları', 'Ankara Yayıncılık', 'Okyanus'].map((pub) => (
                    <button
                      key={pub}
                      type="button"
                      onClick={() => setPrizePublisher(pub)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        prizePublisher === pub ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      {pub}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Multi-Grade Selection Buttons (Tıklayarak Birden Fazla Sınıf Seçme) */}
          <div className="surface-card rounded-xl p-3 border space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold">
                Katılacak Sınıf Düzeyleri (Tıklayarak Birden Fazla Seçebilirsiniz)
              </div>
              <div className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }} data-testid="prize-selected-grades-summary">
                Seçili: {formatPrizeExamGradesLabel({ gradeId: 'all', gradeIds: prizeSelectedGrades })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ödüllü deneme sınıf düzeyleri çoklu seçimi">
              <button
                type="button"
                data-testid="prize-grade-all-btn"
                aria-pressed={prizeSelectedGrades.length === 0}
                onClick={() => setPrizeSelectedGrades([])}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                  prizeSelectedGrades.length === 0 ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {prizeSelectedGrades.length === 0 && <Check className="w-3 h-3" aria-hidden="true" />}
                <span>Tümü</span>
              </button>

              <button
                type="button"
                data-testid="prize-grade-preset-3-8"
                onClick={() => setPrizeSelectedGrades(['3', '4', '5', '6', '7', '8'])}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                  ['3', '4', '5', '6', '7', '8'].every((g) => prizeSelectedGrades.includes(g as GradeLevelId)) &&
                  prizeSelectedGrades.length === 6
                    ? 'btn-3d'
                    : 'btn-3d-secondary'
                }`}
              >
                3–8. Sınıflar Seç
              </button>

              <button
                type="button"
                data-testid="prize-grade-preset-5-8"
                onClick={() => setPrizeSelectedGrades(['5', '6', '7', '8'])}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                  ['5', '6', '7', '8'].every((g) => prizeSelectedGrades.includes(g as GradeLevelId)) &&
                  prizeSelectedGrades.length === 4
                    ? 'btn-3d'
                    : 'btn-3d-secondary'
                }`}
              >
                5–8. Sınıflar Seç
              </button>

              <span className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-subtle)' }} aria-hidden="true" />

              {GRADE_PROFILES.map((gp) => {
                const isSelected = prizeSelectedGrades.includes(gp.id);
                return (
                  <button
                    key={gp.id}
                    type="button"
                    data-testid={`prize-grade-toggle-${gp.id}`}
                    aria-pressed={isSelected}
                    onClick={() =>
                      setPrizeSelectedGrades((prev) => togglePrizeGradeSelection(prev, gp.id))
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                      isSelected ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" aria-hidden="true" />}
                    <span>{gp.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Farklı yayından aldığınız denemeyi seçili sınıflarla oluşturup doğrudan Optik Okuma (OMR) ekranında kullanabilirsiniz.
            </p>
            <button
              type="submit"
              data-testid="prize-exam-submit-btn"
              className="btn-3d py-2 px-5 rounded-lg text-xs font-bold cursor-pointer"
            >
              Ödüllü Deneme Ekle &amp; Aktifleştir
            </button>
          </div>
        </form>
      )}

      {/* Active Prize Exams Strip */}
      {prizeExams.length > 0 && (
        <div className="surface-alt rounded-xl p-3 space-y-2 border" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-xs font-extrabold flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" aria-hidden="true" />
            <span>Tanımlı Ödüllü Denemeler (Optik Okuma İçin Aktifleştirilebilir)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {prizeExams.map((px) => {
              const isActive = activePrizeExamId === px.id;
              const gradesLabel = formatPrizeExamGradesLabel(px);
              const sourceLabel =
                px.sourceMode === 'farkli-yayin'
                  ? px.publisherName
                    ? `Farklı Yayın · ${px.publisherName}`
                    : 'Farklı Yayın'
                  : 'Kurum Denemesi';
              return (
                <div
                  key={px.id}
                  data-testid={`prize-exam-item-${px.id}`}
                  className="surface-card rounded-lg p-2.5 border flex items-center justify-between gap-2"
                  style={{ borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)' }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold truncate">{px.title}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {gradesLabel} · {sourceLabel}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {px.prizeDescription} · {px.period === 'daily' ? 'Günlük' : px.period === 'weekly' ? 'Haftalık' : 'Aylık'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive ? (
                      <>
                        <button
                          type="button"
                          data-testid={`activate-prize-omr-btn-${px.id}`}
                          onClick={() => onOpenOmr?.()}
                          className="btn-3d px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                        >
                          OMR Aktif · Git
                        </button>
                        <button
                          type="button"
                          data-testid={`deactivate-prize-omr-btn-${px.id}`}
                          onClick={() => onActivatePrizeExamForOmr(null)}
                          className="btn-3d-secondary px-2 py-1 rounded text-[11px] font-bold cursor-pointer"
                        >
                          Çık
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        data-testid={`activate-prize-omr-btn-${px.id}`}
                        onClick={() => {
                          onActivatePrizeExamForOmr(px.id);
                          onOpenOmr?.();
                        }}
                        className="btn-3d-secondary px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                      >
                        OMR’de Kullan
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`${px.title} ödüllü denemesini sil`}
                      onClick={() => onDeletePrizeExam(px.id)}
                      className="p-1.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scope, Period & Source Filter Bar */}
      <div className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {visibleInstitutions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 pr-2 border-r" style={{ borderColor: 'var(--border-subtle)' }} role="group" aria-label="Kurum kapsamı filtresi">
              <button
                type="button"
                data-testid="rankings-scope-all"
                aria-pressed={effectiveScope === 'all-institutions'}
                onClick={() => setScopeMode('all-institutions')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  effectiveScope === 'all-institutions' ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Tüm Kurumlar ({visibleInstitutions.length})
              </button>
              <button
                type="button"
                data-testid="rankings-scope-active"
                aria-pressed={effectiveScope === 'active-only'}
                onClick={() => setScopeMode('active-only')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  effectiveScope === 'active-only' ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Aktif Kurum
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kurum sıralaması dönem filtresi">
            {(
              [
                { id: 'all', label: 'Tümü' },
                { id: 'daily', label: 'Günlük' },
                { id: 'weekly', label: 'Haftalık' },
                { id: 'monthly', label: 'Aylık' },
              ] as Array<{ id: RankingPeriodFilter; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`rankings-period-${item.id}`}
                onClick={() => setPeriodFilter(item.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  periodFilter === item.id ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kurum sıralaması kaynak filtresi">
          {(
            [
              { id: 'all', label: 'Tüm Denemeler' },
              { id: 'kurum', label: 'Kurum Denemesi' },
              { id: 'farkli-yayin', label: 'Farklı Yayın' },
              { id: 'odullu', label: 'Ödüllü Deneme' },
            ] as Array<{ id: 'all' | ExamRecordSource; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`rankings-source-${item.id}`}
              onClick={() => setSourceFilter(item.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                sourceFilter === item.id ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {report.totalEntries === 0 ? (
        <div
          data-testid="rankings-board-empty"
          className="surface-alt rounded-xl p-5 text-center text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          Seçilen filtre için henüz sınav veya haftalık test kaydı yok. Haftalık listeden öğrenci/simülasyon eklediğinizde veya Optik Okuma ekranından öğrenci okuttuğunuzda kurum sıra başarısı ve kurum sınıf başarısı sıralamaları otomatik oluşur.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Haftalık Kurum Sıra Başarısı + İnteraktif Grafik */}
          <div className="space-y-4" data-testid="rankings-institution-leaderboard">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-extrabold">
                    Haftalık Kurum Sıra Başarısı ({report.institutionSummaries.length} Kurum · {report.totalEntries} Ölçüm)
                  </h4>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Genel Ortalama: <span className="font-mono-num font-bold">{report.avgNet.toFixed(2)} Net</span> ·{' '}
                    <span className="font-mono-num font-bold">{report.avgScore.toFixed(1)} Puan</span> ·{' '}
                    <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">%{report.avgSuccessPct} Başarı</span>
                  </p>
                </div>
              </div>

              <div
                data-testid="weekly-rankings-chart-toggle"
                role="group"
                aria-label="Haftalık başarı grafiği görünümü"
                className="surface-alt rounded-lg p-1 inline-flex items-center gap-1"
              >
                <button
                  type="button"
                  data-testid="weekly-chart-mode-institution"
                  aria-pressed={chartMode === 'institution'}
                  onClick={() => setChartMode('institution')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    chartMode === 'institution' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kurum Sıra Başarısı</span>
                </button>
                <button
                  type="button"
                  data-testid="weekly-chart-mode-classroom"
                  aria-pressed={chartMode === 'classroom'}
                  onClick={() => setChartMode('classroom')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    chartMode === 'classroom' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kurum Sınıf Başarısı</span>
                </button>
              </div>
            </div>

            {chartData.length > 0 && (
              <div
                className="surface-alt rounded-xl p-3 border w-full min-w-0 h-[256px]"
                style={{ borderColor: 'var(--border-subtle)' }}
                data-testid="weekly-rankings-recharts-container"
              >
                <ResponsiveContainer width="100%" height={232}>
                  <BarChart
                    data={chartData}
                    margin={{
                      top: 10,
                      right: 12,
                      left: 0,
                      bottom: chartData.length >= 3 ? 20 : 6,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={0}
                      angle={chartData.length >= 3 ? -14 : 0}
                      textAnchor={chartData.length >= 3 ? 'end' : 'middle'}
                      height={chartData.length >= 3 ? 52 : 30}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                      tickLine={false}
                    />
                    <YAxis
                      width={40}
                      domain={[0, 100]}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<WeeklyRankingsChartTooltip />} />
                    <Bar
                      key={`${chartMode}-avgSuccessPct`}
                      dataKey="avgSuccessPct"
                      name="Başarı (%)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={52}
                      isAnimationActive={false}
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.key} fill={getSuccessColor(entry.avgSuccessPct)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="surface-alt rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b surface-card" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th className="text-left py-2.5 px-3 font-semibold">Sıra</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Kurum &amp; Şehir</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Kapsam</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Ort. Net</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Ort. Puan</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Başarı %</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Kurum Lideri</th>
                      {onSelectInstitution && scopedInstitutions.length > 1 && (
                        <th className="text-right py-2.5 px-3 font-semibold">İşlem</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.institutionSummaries.map((inst, idx) => {
                      const isActive = inst.institutionId === activeInstitution.id;
                      const targetInst = scopedInstitutions.find((item) => item.id === inst.institutionId);
                      return (
                        <tr
                          key={inst.institutionId}
                          data-testid={`weekly-inst-rank-row-${inst.institutionId}`}
                          className="border-b last:border-b-0"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="py-2.5 px-3 font-mono-num font-extrabold">#{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold">{inst.institutionName}</span>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                  <span>Aktif</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              {inst.city || 'Türkiye'} · Kod: <span className="font-mono-num">{inst.institutionCode8}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                            {inst.evaluationCount} Kayıt · {inst.gradeCount} Düzey · {inst.classroomCount} Şube
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num font-bold" style={{ color: 'var(--chart-1)' }}>
                            {inst.avgNet.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num font-extrabold">
                            {inst.avgScore.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num font-extrabold text-emerald-600 dark:text-emerald-400">
                            %{inst.avgSuccessPct}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {inst.topStudentName}{' '}
                            <span className="font-mono-num text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              ({inst.topScore.toFixed(1)})
                            </span>
                          </td>
                          {onSelectInstitution && scopedInstitutions.length > 1 && (
                            <td className="py-2.5 px-3 text-right">
                              {!isActive && targetInst ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectInstitution(targetInst)}
                                  className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Aktif Et</span>
                                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                                </button>
                              ) : (
                                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                  Seçili
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Kurum Sınıf / Şube Bazlı Ayrı Başarı Sıralamaları */}
          <div className="space-y-3" data-testid="rankings-classroom-groups">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kurum Sınıf / Şube Başarısı Sıralaması ({report.classroomRankings.length} Şube)</span>
              </div>
            </div>

            <div className="surface-alt rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b surface-card" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th className="text-left py-2 px-3 font-semibold">Sıra</th>
                      <th className="text-left py-2 px-3 font-semibold">Sınıf / Şube</th>
                      <th className="text-left py-2 px-3 font-semibold">Kurum</th>
                      <th className="text-left py-2 px-3 font-semibold">Düzey</th>
                      <th className="text-right py-2 px-3 font-semibold">Öğrenci</th>
                      <th className="text-right py-2 px-3 font-semibold">Ort. Net</th>
                      <th className="text-right py-2 px-3 font-semibold">Ort. Puan</th>
                      <th className="text-right py-2 px-3 font-semibold">Başarı %</th>
                      <th className="text-left py-2 px-3 font-semibold">Şube Lideri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.classroomRankings.map((cls, idx) => (
                      <tr
                        key={`summary-${cls.institutionId}-${cls.gradeId}-${cls.classroom}`}
                        data-testid={`weekly-class-rank-row-${cls.classroom}`}
                        className="border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-2 px-3 font-mono-num font-extrabold">#{idx + 1}</td>
                        <td className="py-2 px-3 font-extrabold">{cls.classroom}</td>
                        <td className="py-2 px-3 font-semibold">{cls.institutionName}</td>
                        <td className="py-2 px-3">{cls.gradeLabel}</td>
                        <td className="py-2 px-3 text-right font-mono-num">{cls.studentCount}</td>
                        <td className="py-2 px-3 text-right font-mono-num font-bold" style={{ color: 'var(--chart-1)' }}>
                          {cls.avgNet.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num font-extrabold">
                          {cls.avgScore.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num font-extrabold text-emerald-600 dark:text-emerald-400">
                          %{cls.avgSuccessPct}
                        </td>
                        <td className="py-2 px-3 font-semibold">{cls.topStudentName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {report.classroomRankings.map((cls, idx) => (
                <div
                  key={`${cls.institutionId}-${cls.gradeId}-${cls.classroom}`}
                  data-testid={`rankings-classroom-card-${cls.classroom}`}
                  className="surface-alt rounded-xl p-3.5 border space-y-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate">
                        #{idx + 1} · {cls.classroom} ({cls.gradeLabel})
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {cls.institutionName}
                      </div>
                    </div>
                    <div className="text-xs font-mono-num font-bold shrink-0" style={{ color: 'var(--chart-1)' }}>
                      Ort. {cls.avgNet.toFixed(2)} Net · %{cls.avgSuccessPct}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    {cls.entries.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                          {row.classRank}. {row.studentName}
                        </span>
                        <span className="font-mono-num shrink-0">
                          {row.totalNet.toFixed(2)} Net · %{row.successPct}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ödüllü Deneme Leaderboards */}
          {report.prizeLeaderboards.length > 0 && (
            <div className="space-y-3" data-testid="rankings-prize-leaderboards">
              <div className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ödüllü Deneme Başarı Sıralamaları</span>
              </div>
              <div className="space-y-3">
                {report.prizeLeaderboards.map((pb) => (
                  <div
                    key={pb.prizeExamId}
                    className="surface-alt rounded-xl border overflow-hidden"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b surface-card" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-extrabold">{pb.title}</span>
                        {pb.targetGradesLabel && (
                          <span className="text-[11px] font-bold" style={{ color: 'var(--accent-primary)' }}>
                            · {pb.targetGradesLabel}
                          </span>
                        )}
                        {pb.sourceLabel && (
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            · {pb.sourceLabel}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          Ödül: {pb.prizeDescription}
                        </span>
                      </div>
                      <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                        {pb.entries.length} Katılımcı · {pb.examDate}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            <th className="text-left py-2 px-3 font-semibold">Derece</th>
                            <th className="text-left py-2 px-3 font-semibold">Öğrenci</th>
                            <th className="text-left py-2 px-3 font-semibold">Kurum · Düzey / Şube</th>
                            <th className="text-right py-2 px-3 font-semibold">Net</th>
                            <th className="text-right py-2 px-3 font-semibold">Puan</th>
                            <th className="text-right py-2 px-3 font-semibold">Ödül Durumu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pb.entries.map((row) => (
                            <tr key={row.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                              <td className="py-2 px-3 font-mono-num font-extrabold">#{row.gradeRank}</td>
                              <td className="py-2 px-3 font-bold">{row.studentName}</td>
                              <td className="py-2 px-3">
                                {row.institutionName} · {row.gradeLabel} · {row.normalizedClassroom}
                              </td>
                              <td className="py-2 px-3 text-right font-mono-num font-bold">{row.totalNet.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right font-mono-num font-extrabold">{row.estimatedScore.toFixed(1)}</td>
                              <td className="py-2 px-3 text-right font-bold">
                                {row.gradeRank <= 3 ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {row.gradeRank}. Ödül Kazananı
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)' }}>Başarı Katılımcısı</span>
                                )}
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
          )}

          {/* Alt Alta Sınıf Düzeyi Sıralamaları (5. Sınıf, 7. Sınıf...) */}
          <div className="space-y-3" data-testid="rankings-stacked-grades">
            <div className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <School className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Alt Alta Sınıf Düzeyi Net &amp; Puan Sıralamaları</span>
            </div>
            {report.stackedGradeRankings.map((group) => (
              <div
                key={group.gradeId}
                data-testid={`rankings-grade-block-${group.gradeId}`}
                className="surface-alt rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b surface-card" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="text-sm font-extrabold">{group.gradeLabel} Sıralaması</div>
                  <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                    {group.studentCount} Kayıt · Ort. Net: <strong style={{ color: 'var(--text-primary)' }}>{group.avgNet.toFixed(2)}</strong> · Ort. Puan: <strong style={{ color: 'var(--text-primary)' }}>{group.avgScore.toFixed(1)}</strong>
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
                        <th className="text-right py-2 px-3 font-semibold">Net</th>
                        <th className="text-right py-2 px-3 font-semibold">Puan</th>
                        <th className="text-right py-2 px-3 font-semibold">Başarı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((row) => (
                        <tr key={row.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-2 px-3 font-mono-num font-extrabold">#{row.gradeRank}</td>
                          <td className="py-2 px-3 font-bold">{row.studentName}</td>
                          <td className="py-2 px-3">
                            {row.institutionName} · {row.normalizedClassroom}
                          </td>
                          <td className="py-2 px-3">
                            {row.examTitle}{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>· {row.sourceLabel}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono-num font-bold" style={{ color: 'var(--chart-1)' }}>
                            {row.totalNet.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-num font-extrabold">
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
      )}
    </section>
  );
}
