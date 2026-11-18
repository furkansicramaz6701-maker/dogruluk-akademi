import { useState, ChangeEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  BookOpen,
  Camera,
  FilePlus2,
  Award,
  Archive,
  GraduationCap,
  Code2,
  Sparkles,
  CalendarDays,
  PenSquare,
  ArrowRight,
  FileUp,
  ExternalLink,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { GRADE_PROFILES } from '../data/curriculum';
import { HEADER_LOGO_PRESETS } from '../data/logos';
import {
  AcademyThemeId,
  ActiveTab,
  CoverConfig,
  DynamicCurriculumOverride,
  ExamAnalysisResult,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  Institution,
  InstitutionPermissions,
  LogoStyleId,
  PenaltyDivisor,
  RecommendationCategory,
  SmartRecommendation,
  StudentRecord,
} from '../types/academy';
import { formatPenaltyRuleLabel } from '../utils/examAnalysis';
import {
  buildQuestionsFromCurriculumOverride,
  extractCurriculumOverrideFromText,
} from '../utils/dynamicQuestionSource';
import {
  DEFAULT_STUDENTS,
  canInstitutionUseModule,
  filterGradeProfilesByInstitution,
} from '../utils/institutionCodes';
import { Cube3DShowcase } from './Cube3DShowcase';
import { InstitutionAuthPanel } from './InstitutionAuthPanel';
import { InstitutionStudentManager } from './InstitutionStudentManager';
import { Logo3D } from './Logo3D';
import { NetProgressionChart } from './NetProgressionChart';
import { ThemeSelector } from './ThemeSelector';

interface DashboardViewProps {
  gradeProfile: GradeProfile;
  onSelectGrade: (id: GradeLevelId) => void;
  penaltyDivisor: PenaltyDivisor;
  onChangePenaltyDivisor: (divisor: PenaltyDivisor) => void;
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  questionCount: number;
  activeThemeId: AcademyThemeId;
  onSelectTheme: (id: AcademyThemeId) => void;
  activeLogoId: LogoStyleId;
  onSelectLogo: (id: LogoStyleId) => void;
  institutions: Institution[];
  activeInstitution: Institution;
  students: StudentRecord[];
  activeStudentNumber8: string;
  cover: CoverConfig;
  mebOverride: DynamicCurriculumOverride | null;
  onApplyMebCurriculum: (
    override: DynamicCurriculumOverride,
    generatedQuestions: ExamQuestion[]
  ) => void;
  onClearMebCurriculum: () => void;
  onSelectInstitution: (inst: Institution) => void;
  onAddInstitution: (inst: Institution) => void;
  onUpdateInstitution: (
    institutionId: string,
    patch: { name: string; city: string; accessPassword?: string }
  ) => { ok: boolean; reason?: string };
  onDeleteInstitution: (institutionId: string) => { ok: boolean; reason?: string };
  onBulkAddInstitutions: (items: Institution[]) => void;
  onUpdateInstitutionPermissions: (
    institutionId: string,
    permissions: InstitutionPermissions
  ) => void;
  onAddStudent: (student: StudentRecord) => void;
  onBulkAddStudents: (items: StudentRecord[]) => void;
  onSelectStudent: (student: StudentRecord) => void;
  onLoadDemoStudent: (demoStudent: StudentRecord) => void;
  onResetCleanWorkspace: () => void;
  onDownloadStudentReportPdf: () => Promise<void>;
  smartRecommendations: SmartRecommendation[];
  onExecuteRecommendation: (rec: SmartRecommendation) => void;
  onNavigate: (tab: ActiveTab) => void;
  onDownloadZip: () => void;
  onDownloadSourceZip: () => void;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function DashboardView({
  gradeProfile,
  onSelectGrade,
  penaltyDivisor,
  onChangePenaltyDivisor,
  analysis,
  hasLiveAnalysis,
  questionCount,
  activeThemeId,
  onSelectTheme,
  activeLogoId,
  onSelectLogo,
  institutions,
  activeInstitution,
  students,
  activeStudentNumber8,
  cover,
  mebOverride,
  onApplyMebCurriculum,
  onClearMebCurriculum,
  onSelectInstitution,
  onAddInstitution,
  onUpdateInstitution,
  onDeleteInstitution,
  onBulkAddInstitutions,
  onUpdateInstitutionPermissions,
  onAddStudent,
  onBulkAddStudents,
  onSelectStudent,
  onLoadDemoStudent,
  onResetCleanWorkspace,
  onDownloadStudentReportPdf,
  smartRecommendations,
  onExecuteRecommendation,
  onNavigate,
  onDownloadZip,
  onDownloadSourceZip,
}: DashboardViewProps) {
  const [recCategory, setRecCategory] = useState<'Tümü' | RecommendationCategory>('Tümü');
  const [demoAreaOpen, setDemoAreaOpen] = useState(false);
  const [mebQuickBusy, setMebQuickBusy] = useState(false);
  const [mebQuickNotice, setMebQuickNotice] = useState<string | null>(null);

  const allowedGrades = filterGradeProfilesByInstitution(GRADE_PROFILES, activeInstitution);
  const hasSelectedStudent = Boolean(analysis.studentName.trim());

  const filteredRecommendations =
    recCategory === 'Tümü'
      ? smartRecommendations
      : smartRecommendations.filter((r) => r.category === recCategory);

  const categories: Array<GradeProfile['category']> = [
    'İlkokul',
    'Ortaokul & LGS',
    'Lise',
    'Üniversite Hazırlık (YKS)',
  ];

  const activeSubjects =
    mebOverride && mebOverride.gradeId === gradeProfile.id
      ? mebOverride.subjects
      : gradeProfile.subjects;

  const activeRole = activeInstitution.permissions?.role ?? 'Kurum Yöneticisi';
  const activeStatus = activeInstitution.permissions?.status ?? 'Aktif';

  const handleQuickMebPdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMebQuickBusy(true);
    setMebQuickNotice(null);
    const totalTarget = gradeProfile.subjects.reduce((acc, s) => acc + s.questionCount, 0);

    try {
      let textContent = '';
      let pageCount: number | undefined;
      let base64 = '';

      if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
        textContent = (await file.text()).slice(0, 24000);
      } else {
        const buf = await file.arrayBuffer();
        try {
          const doc = await PDFDocument.load(new Uint8Array(buf));
          pageCount = doc.getPageCount();
        } catch {
          pageCount = undefined;
        }
        base64 = await fileToBase64(file);
      }

      const resp = await fetch('/api/curriculum/from-meb-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLabel: gradeProfile.label,
          optionCount: gradeProfile.optionCount,
          sourceName: file.name,
          textContent,
          fileBase64: base64 || undefined,
          fileMimeType: file.type || 'application/pdf',
          count: Math.min(20, totalTarget),
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const subjects =
          Array.isArray(data.subjects) && data.subjects.length > 0
            ? data.subjects.map(
                (s: { name?: string; topics?: string[]; questionCount?: number }, i: number) => ({
                  name: s.name || gradeProfile.subjects[i]?.name || 'Genel',
                  topics:
                    Array.isArray(s.topics) && s.topics.length > 0 ? s.topics : ['MEB Kazanımı'],
                  questionCount: Number(s.questionCount) || 10,
                })
              )
            : gradeProfile.subjects.map((s) => ({
                name: s.name,
                topics: s.topics,
                questionCount: s.questionCount,
              }));

        const override: DynamicCurriculumOverride = {
          sourceName: file.name,
          gradeId: gradeProfile.id,
          subjects,
          extractedAt: new Date().toLocaleDateString('tr-TR'),
          pageCount,
        };
        const generated = buildQuestionsFromCurriculumOverride(override, totalTarget);
        onApplyMebCurriculum(override, generated);
        setMebQuickNotice(
          `${file.name} ile ${gradeProfile.shortLabel} aktif müfredatı güncellendi (${generated.length} soru).`
        );
      } else {
        const override = extractCurriculumOverrideFromText(
          textContent ||
            `${file.name}\n${gradeProfile.subjects.map((s) => s.topics.join('\n')).join('\n')}`,
          gradeProfile.id,
          file.name,
          pageCount
        );
        const generated = buildQuestionsFromCurriculumOverride(override, totalTarget);
        onApplyMebCurriculum(override, generated);
        setMebQuickNotice(
          `${file.name} yerel ayrıştırıcı ile ${gradeProfile.shortLabel} aktif müfredatına işlendi.`
        );
      }
    } catch {
      const override = extractCurriculumOverrideFromText(
        `${file.name}\n${gradeProfile.subjects.map((s) => s.topics.join('\n')).join('\n')}`,
        gradeProfile.id,
        file.name
      );
      const generated = buildQuestionsFromCurriculumOverride(override, totalTarget);
      onApplyMebCurriculum(override, generated);
      setMebQuickNotice(`${file.name} ${gradeProfile.shortLabel} müfredatına uygulandı.`);
    } finally {
      setMebQuickBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top 4-Column KPI Strip — Clean Natural Overview (Zero Forced Fake Sample Numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-kpi-strip">
        <div className="surface-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <span>Aktif Kurum & Yetki</span>
            <span
              className={`font-bold ${
                activeStatus === 'Aktif' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
              }`}
            >
              {activeStatus}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-lg font-display font-extrabold truncate" title={activeInstitution.name}>
              {activeInstitution.name}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>{activeRole}</span>
            <span className="font-mono-num font-bold shrink-0" style={{ color: 'var(--accent-primary)' }}>
              Kod: {activeInstitution.code8}
            </span>
          </div>
        </div>

        <div className="surface-card rounded-xl p-5">
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Aktif Müfredat & Düzey
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-display font-extrabold font-mono-num">
              {gradeProfile.shortLabel}
            </span>
            <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
              {questionCount} Soru · {gradeProfile.optionCount} Şık
            </span>
          </div>
          <div className="mt-1 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {mebOverride ? `MEB PDF: ${mebOverride.sourceName}` : `${gradeProfile.category} · ${formatPenaltyRuleLabel(penaltyDivisor, true)}`}
          </div>
        </div>

        <div className="surface-card rounded-xl p-5">
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Kurum Öğrenci Durumu
          </div>
          {hasSelectedStudent ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-xl font-display font-extrabold truncate">
                  {analysis.studentName}
                </span>
                <span className="text-xs font-mono-num font-bold shrink-0" style={{ color: 'var(--accent-primary)' }}>
                  {activeStudentNumber8}
                </span>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {analysis.classroom} · {students.filter((s) => s.institutionId === activeInstitution.id).length} Kayıtlı Öğrenci
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-base font-display font-extrabold">
                Henüz Öğrenci Seçilmedi
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {(() => {
                  const instCount = students.filter((s) => s.institutionId === activeInstitution.id).length;
                  return instCount > 0
                    ? `Kurumda ${instCount} öğrenci · Aşağıdan seçin veya ekleyin`
                    : 'Kurumda henüz öğrenci yok · Aşağıdan ekleyin';
                })()}
              </div>
            </>
          )}
        </div>

        <div className="surface-card rounded-xl p-5">
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Optik & Analiz Durumu
          </div>
          {hasLiveAnalysis && hasSelectedStudent ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-display font-extrabold font-mono-num">
                  {analysis.totalNet.toFixed(2)} Net
                </span>
                <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
                  {analysis.estimatedScore.toFixed(1)} Puan
                </span>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {analysis.totalCorrect} Doğru · {analysis.totalWrong} Yanlış · {analysis.totalBlank} Boş
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-base font-display font-extrabold">
                Deneme Yapılmadı
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {hasSelectedStudent
                  ? `${analysis.studentName} için henüz optik okuma / deneme yok`
                  : 'Kurumda henüz aktif deneme sonucu yok (Optik Okuma ile başlar)'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3D Kare Küp Animasyonu + Aktif Müfredat & MEB PDF Hızlı Yükleme */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5">
          <Cube3DShowcase
            activeInstitution={activeInstitution}
            gradeProfile={gradeProfile}
            penaltyDivisor={penaltyDivisor}
            questionCount={questionCount}
            activeLogoId={activeLogoId}
            hasMebOverride={Boolean(mebOverride)}
          />
        </div>

        <section
          aria-labelledby="active-curriculum-title"
          className="lg:col-span-7 surface-card rounded-xl p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div>
                  <h2 id="active-curriculum-title" className="text-base font-bold leading-tight">
                    Aktif Müfredat: {gradeProfile.label} ({gradeProfile.optionCount} Şıklı Sistem)
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {gradeProfile.shortLabel} seçildiğinde TYT/AYT gerekmez; MEB sayfasından PDF yükleyerek veya sınıf seçerek müfredatı anında güncelleyebilirsiniz.
                  </p>
                </div>
              </div>
              <a
                href="https://mufredat.meb.gov.tr"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold inline-flex items-center gap-1 underline shrink-0"
                style={{ color: 'var(--accent-primary)' }}
              >
                <span>MEB Müfredat Sayfası</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>

            {mebQuickNotice && (
              <div className="surface-alt rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <span>{mebQuickNotice}</span>
              </div>
            )}

            <div
              className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5"
              data-testid="dashboard-penalty-selector"
            >
              <div className="text-xs">
                <span className="font-bold">Doğru-Yanlış Götürme Kuralı:</span>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {gradeProfile.id === '3' || gradeProfile.id === '4' || gradeProfile.id === '5'
                    ? '3–5. sınıf denemelerinde götürmesiz veya 3Y=1D olarak ayarlayabilirsiniz'
                    : formatPenaltyRuleLabel(penaltyDivisor)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { value: 0 as PenaltyDivisor, label: 'Götürmesiz (Net = Doğru)' },
                  { value: 3 as PenaltyDivisor, label: '3Y = 1D' },
                  { value: 4 as PenaltyDivisor, label: '4Y = 1D' },
                ]).map((opt) => {
                  const active = penaltyDivisor === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`dashboard-penalty-btn-${opt.value}`}
                      aria-pressed={active}
                      onClick={() => onChangePenaltyDivisor(opt.value)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                        active ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {activeSubjects.map((s) => (
                <div key={s.name} className="surface-alt rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>{s.name}</span>
                    <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                      {s.questionCount} Soru
                    </span>
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.topics.slice(0, 3).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <label className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
              {mebQuickBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>PDF İşleniyor...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>MEB PDF İle Müfredat Güncelle</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={handleQuickMebPdfUpload}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="btn-3d-secondary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Dinamik Soru Kaynağını Aç</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {mebOverride && (
              <button
                type="button"
                onClick={() => {
                  onClearMebCurriculum();
                  setMebQuickNotice('Varsayılan sınıf müfredatına dönüldü.');
                }}
                className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                MEB PDF’i Temizle
              </button>
            )}
          </div>
        </section>
      </div>

      {/* İnteraktif Net Gelişim Grafiği (Kurum Geneli & Türkiye Geneli) */}
      <NetProgressionChart
        gradeProfile={gradeProfile}
        questionCount={questionCount}
        penaltyDivisor={penaltyDivisor}
        activeInstitution={activeInstitution}
        students={students}
        hasLiveAnalysis={hasLiveAnalysis}
        activeStudentName={analysis.studentName}
        activeStudentNet={analysis.totalNet}
        activeExamTitle={analysis.examTitle}
      />

      {/* Grade Selector (Filtered cleanly by Kurum Yetki Kapsamı!) */}
      <section aria-labelledby="grade-selector-title" className="surface-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h2 id="grade-selector-title" className="text-lg font-bold leading-tight">
                Sınıf ve Sınav Türü Seçimi ({allowedGrades.length} Yetkili Düzey)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Kurum Yetki Panelindeki kapsamlara göre filtrelenir. Seçilen düzeye göre ders dağılımı ve 4/5 şık kuralı otomatik uygulanır.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const items = allowedGrades.filter((g) => g.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="surface-alt rounded-lg p-3.5">
                <div className="text-xs font-bold mb-2.5" style={{ color: 'var(--text-secondary)' }}>
                  {cat}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((g) => {
                    const active = g.id === gradeProfile.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onSelectGrade(g.id)}
                        aria-pressed={active}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                          active ? 'btn-3d' : 'btn-3d-secondary'
                        }`}
                      >
                        {g.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Kurum Girişi (8 Hane) + Manuel Kurum & Öğrenci Ekleme + Excel/PDF */}
      <InstitutionStudentManager
        institutions={institutions}
        activeInstitution={activeInstitution}
        students={students}
        activeStudentNumber8={activeStudentNumber8}
        activeGradeId={gradeProfile.id}
        cover={cover}
        onSelectInstitution={onSelectInstitution}
        onAddInstitution={onAddInstitution}
        onUpdateInstitution={onUpdateInstitution}
        onDeleteInstitution={onDeleteInstitution}
        onBulkAddInstitutions={onBulkAddInstitutions}
        onAddStudent={onAddStudent}
        onBulkAddStudents={onBulkAddStudents}
        onSelectStudent={onSelectStudent}
        onDownloadStudentReportPdf={onDownloadStudentReportPdf}
      />

      {/* Kurum Yetki Paneli (Rol, Durum, Kota, Sınıf Kapsamları, 8 Modül Yetkisi) */}
      <InstitutionAuthPanel
        institutions={institutions}
        activeInstitution={activeInstitution}
        students={students}
        onSelectInstitution={onSelectInstitution}
        onUpdatePermissions={onUpdateInstitutionPermissions}
        onUpdateInstitution={onUpdateInstitution}
        onDeleteInstitution={onDeleteInstitution}
      />

      {/* 5 Başlık & 3D Logo Seçeneği */}
      <section aria-labelledby="logo-preset-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h2 id="logo-preset-title" className="text-base font-bold leading-tight">
                Başlık & 3D Logo Tasarımı Seçenekleri (5 Kurumsal Seçenek)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Seçtiğiniz başlık ve 3 boyutlu logo; üst başlıkta, sol menüde, 3D kapakta, tüm PDF sayfalarında ve 3D afişte anında uygulanır
              </p>
            </div>
          </div>
          <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
            {HEADER_LOGO_PRESETS.findIndex((p) => p.id === activeLogoId) + 1} / 5 Seçenek
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {HEADER_LOGO_PRESETS.map((preset) => {
            const active = preset.id === activeLogoId;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectLogo(preset.id)}
                className={`rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer transition-all ${
                  active ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                <Logo3D size="sm" interactive={false} variant={preset.id} />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{preset.name}</div>
                  <div className="text-[11px] opacity-85 truncate">{preset.headerTitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Akıllı Akademi & Eğitim Önerileri Merkezi */}
      <section aria-labelledby="smart-recs-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h2 id="smart-recs-title" className="text-base font-bold leading-tight">
                Akıllı Akademi, Sınav & Öğrenci Önerileri ({filteredRecommendations.length} Öneri)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {activeInstitution.name} · {gradeProfile.shortLabel} verilerine göre tek tıkla uygulanabilir eğitim önerileri
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['Tümü', 'Sınav & Editör', 'Öğrenci Telafi', 'Eğitim Takvimi', 'Kurum Büyüme'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setRecCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    recCategory === cat ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {filteredRecommendations.map((rec) => (
            <article
              key={rec.id}
              className="surface-alt rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  <span>{rec.category}</span>
                  <span style={{ color: 'var(--chart-3)' }}>{rec.impactLabel}</span>
                </div>
                <h3 className="text-sm font-bold leading-snug">{rec.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {rec.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onExecuteRecommendation(rec)}
                className="btn-3d-secondary w-full py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{rec.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* Main Split: 3D Subject Performance Pillars + 3D Quick Action Command Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 surface-card rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold">
                  3D Ders Dağılımı & Başarı Sütunları — {gradeProfile.label}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {hasLiveAnalysis && hasSelectedStudent
                    ? `${analysis.studentName} optik analizine göre ders netleri`
                    : `${gradeProfile.shortLabel} aktif ders soru ağırlıkları (Optik değerlendirme sonrası canlı nete dönüşür)`}
                </p>
              </div>
              <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                {analysis.subjectMetrics.length} Ders
              </span>
            </div>

            <div
              className="surface-alt rounded-xl p-3 sm:p-5 pt-6 sm:pt-8 pb-4 perspective-stage"
              style={{ minHeight: '220px' }}
            >
              <div className="grid grid-cols-4 gap-2 sm:gap-5 items-end h-[185px]">
                {analysis.subjectMetrics.slice(0, 4).map((subj, idx) => {
                  const pct =
                    hasLiveAnalysis && hasSelectedStudent
                      ? subj.total > 0
                        ? Math.max(12, Math.round((subj.net / subj.total) * 100))
                        : 12
                      : Math.min(95, Math.max(30, Math.round((subj.total / Math.max(1, questionCount)) * 220)));
                  const colors = [
                    'var(--chart-1)',
                    'var(--chart-2)',
                    'var(--chart-3)',
                    'var(--chart-4)',
                  ];
                  const barColor = colors[idx % colors.length];
                  return (
                    <div key={subj.subject} className="flex flex-col items-center h-full justify-end min-w-0">
                      <div className="text-[11px] sm:text-xs font-mono-num font-bold mb-1.5 text-center truncate w-full">
                        {hasLiveAnalysis && hasSelectedStudent
                          ? `${subj.net.toFixed(1)}/${subj.total}`
                          : `${subj.total} Soru`}
                      </div>
                      <div
                        className="relative w-11 sm:w-16 rounded-t-md transition-all duration-300"
                        style={{
                          height: `${Math.min(125, Math.round((pct / 100) * 125))}px`,
                          backgroundColor: barColor,
                          boxShadow:
                            '6px 6px 0 rgba(15, 23, 42, 0.22), inset -6px 0 0 rgba(0,0,0,0.14), inset 0 6px 0 rgba(255,255,255,0.22)',
                          transform: 'skewY(-3deg)',
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-white text-[11px] sm:text-xs font-mono-num font-bold">
                          {hasLiveAnalysis && hasSelectedStudent
                            ? `%${subj.accuracyPct}`
                            : `${gradeProfile.optionCount} Şık`}
                        </div>
                      </div>
                      <div
                        className="mt-2.5 text-[11px] sm:text-xs font-bold text-center truncate w-full"
                        title={subj.subject}
                      >
                        {subj.subject}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th className="text-left py-2 font-semibold">Ders</th>
                  <th className="text-right py-2 font-semibold">Soru</th>
                  <th className="text-right py-2 font-semibold">Doğru</th>
                  <th className="text-right py-2 font-semibold">Yanlış</th>
                  <th className="text-right py-2 font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {analysis.subjectMetrics.map((s) => (
                  <tr
                    key={s.subject}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="py-2 font-medium">{s.subject}</td>
                    <td className="py-2 text-right font-mono-num">{s.total}</td>
                    <td className="py-2 text-right font-mono-num">
                      {hasLiveAnalysis && hasSelectedStudent ? s.correct : '—'}
                    </td>
                    <td className="py-2 text-right font-mono-num">
                      {hasLiveAnalysis && hasSelectedStudent ? s.wrong : '—'}
                    </td>
                    <td className="py-2 text-right font-mono-num font-bold">
                      {hasLiveAnalysis && hasSelectedStudent ? s.net.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-base font-bold mb-1">Hızlı 3D İşlem Merkezi</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              Kurum yetkilerinize göre aktif modüllere hızlı geçiş yapın veya paket çıktısı alın.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                disabled={!canInstitutionUseModule(activeInstitution, 'omrOkuma').allowed}
                onClick={() => onNavigate('omr')}
                className="btn-3d w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Optik Yükle & Cevap Anahtarı Analizi</div>
                  <div className="text-xs opacity-85 truncate">
                    Pembe/Magenta OMR optik kağıdı ve yapay zeka okuma
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!canInstitutionUseModule(activeInstitution, 'denemeUretici').allowed}
                onClick={() => onNavigate('generator')}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <FilePlus2 className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Dinamik Soru Kaynağı & PDF Üretici</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    MEB PDF müfredatı, kaynak mikseri, 3D kapak & Furkan imza
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!canInstitutionUseModule(activeInstitution, 'denemeEditoru').allowed}
                onClick={() => onNavigate('editor')}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <PenSquare className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Deneme Editörü & Soru Denetimi</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    Soruları düzenle, şık & zorluk dengesini tek tıkla optimize et
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!canInstitutionUseModule(activeInstitution, 'egitimTakvimi').allowed}
                onClick={() => onNavigate('calendar')}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <CalendarDays className="w-5 h-5 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Eğitim Takvimi & Etüt Planlayıcı</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    Kurumsal deneme günleri, kamp ve telafi etütü takvimi
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer"
              >
                <Award className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">5 Çeşit Karne & Kazanım Matrisi</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    Kazanım eksiği, çeldirici hatası, gelişim projeksiyonu ve AI Koç
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onDownloadZip}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer"
              >
                <Archive className="w-5 h-5 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Sınav, PDF & Karne Paketi (ZIP)</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    HTML panel, 3D kapaklı PDF kitapçık, OMR form ve karneler
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onDownloadSourceZip}
                className="btn-3d-secondary w-full rounded-xl p-3.5 text-left flex items-center gap-3 cursor-pointer"
              >
                <Code2 className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">Tam Uygulama Kaynak Kodu (ZIP)</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    Tüm React + Express proje dosyaları ve sunucu kodları
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 10 Academy Themes Selector */}
      <ThemeSelector activeThemeId={activeThemeId} onSelectTheme={onSelectTheme} />

      {/* AYRILMIŞ ÖRNEK & DEMO SİMÜLASYON ALANI (Ana Bakışı Kirletmez) */}
      <section
        aria-labelledby="demo-sandbox-title"
        data-testid="demo-sandbox-section"
        className="surface-card rounded-xl p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h2 id="demo-sandbox-title" className="text-base font-bold leading-tight">
                Örnek Öğrenci & Demo Simülasyon Alanı (Ayrılmış Deneme Bölümü)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Genel Bakış’ı temiz tutmak için örnek veriler buraya ayrılmıştır. Sistemi örnek bir öğrenci optiği ile test etmek isterseniz açabilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasLiveAnalysis && (
              <button
                type="button"
                onClick={onResetCleanWorkspace}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Örneği Temizle (Sade Görünüm)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDemoAreaOpen((v) => !v)}
              aria-expanded={demoAreaOpen}
              className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>{demoAreaOpen ? 'Örnek Alanını Gizle' : 'Örnek Verileri Göster'}</span>
              {demoAreaOpen ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {demoAreaOpen && (
          <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {DEFAULT_STUDENTS.map((demo) => {
              const gp = GRADE_PROFILES.find((p) => p.id === demo.gradeId);
              return (
                <div key={demo.id} className="surface-alt rounded-xl p-4 flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
                      {demo.studentNumber8} · {gp?.shortLabel}
                    </div>
                    <div className="text-sm font-bold">{demo.fullName}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {demo.institutionName} · {demo.classroom}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLoadDemoStudent(demo)}
                    className="btn-3d w-full py-2 px-3 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Örnek Olarak Yükle & Simüle Et
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
