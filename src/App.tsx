import { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  LayoutDashboard,
  Camera,
  FilePlus2,
  Award,
  Archive,
  Loader2,
  CheckCircle2,
  Menu,
  X,
  Image as ImageIcon,
  PenSquare,
  CalendarDays,
  Sparkles,
  TrendingUp,
  Cloud,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { DEFAULT_COVER_REMINDERS, GRADE_PROFILES, getGradeProfile } from './data/curriculum';
import { getLogoPreset } from './data/logos';
import { ACADEMY_THEMES, getThemeById } from './data/themes';
import {
  AcademyThemeId,
  ActiveTab,
  AppPermissionKey,
  CoverConfig,
  DynamicCurriculumOverride,
  EducationCalendarEvent,
  ExamQuestion,
  GradeLevelId,
  Institution,
  InstitutionPermissions,
  LogoStyleId,
  SmartRecommendation,
  StudentRecord,
  TopicGapMetric,
} from './types/academy';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  generateSampleOmrPair,
  parseAnswerString,
} from './utils/examAnalysis';
import {
  DEFAULT_INSTITUTIONS,
  canInstitutionUseModule,
  filterGradeProfilesByInstitution,
  isGradeAllowedForInstitution,
  normalizeInstitution,
} from './utils/institutionCodes';
import {
  buildWeeklyPcStandaloneHtml,
  generateBookletPdf,
  generateCompleteSystemZip,
  generateOpticalSheetPdf,
  generateStudentReportCardPdf,
  generateWeeklyRankingPdf,
  triggerDownload,
} from './utils/pdfAndZip';
import { buildWeeklyComparisonWorkbookBlob, defaultClassroomForGrade } from './utils/excelExport';
import {
  buildDefaultCalendarEvents,
  buildRemedialCalendarEvent,
  buildSmartRecommendations,
} from './utils/recommendations';
import {
  buildGradeAppropriateSubtitle,
  buildSampleWeeklyCohort,
  computeWeeklyComparison,
  normalizeClassroomForGrade,
} from './utils/weeklyAnalysis';
import {
  DriveFileItem,
  ensureDriveFolder,
  initGoogleDriveAuth,
  listGoogleDriveFiles,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  uploadBlobToGoogleDrive,
} from './utils/googleDrive';
import { DashboardView } from './components/DashboardView';
import { OmrScannerView } from './components/OmrScannerView';
import { ExamGeneratorView } from './components/ExamGeneratorView';
import { ExamEditorView } from './components/ExamEditorView';
import { EducationCalendarView } from './components/EducationCalendarView';
import { ReportsAnalysisView } from './components/ReportsAnalysisView';
import { Poster3DStudio } from './components/Poster3DStudio';
import { WeeklyComparisonView } from './components/WeeklyComparisonView';
import { GoogleDrivePanel, DriveUploadPayload } from './components/GoogleDrivePanel';
import { DriveConfirmModal } from './components/DriveConfirmModal';
import { Logo3D } from './components/Logo3D';
import { Education3DCascade } from './components/Education3DCascade';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const tabParam = new URLSearchParams(window.location.search).get('tab') as ActiveTab | null;
      const validTabs: ActiveTab[] = [
        'dashboard',
        'weekly',
        'omr',
        'generator',
        'editor',
        'reports',
        'calendar',
        'poster',
        'drive',
      ];
      if (tabParam && validTabs.includes(tabParam)) return tabParam;
    } catch {
      // Ignore invalid URL
    }
    return 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeId, setThemeId] = useState<AcademyThemeId>('klasik-lacivert');
  const [gradeId, setGradeId] = useState<GradeLevelId>('5');
  const [hasLiveAnalysis, setHasLiveAnalysis] = useState<boolean>(false);
  const [mebOverride, setMebOverride] = useState<DynamicCurriculumOverride | null>(null);

  const [activeLogoId, setActiveLogoId] = useState<LogoStyleId>(() => {
    try {
      const saved = window.localStorage.getItem('da_active_logo_v1') as LogoStyleId | null;
      return saved || 'akademi-kalkani';
    } catch {
      return 'akademi-kalkani';
    }
  });

  const [institutions, setInstitutions] = useState<Institution[]>(() => {
    const list = readStorageJson<Institution[]>('da_institutions_v1', DEFAULT_INSTITUTIONS);
    const normalized = Array.isArray(list) && list.length > 0 ? list.map(normalizeInstitution) : DEFAULT_INSTITUTIONS;
    return normalized;
  });

  const [activeInstitutionId, setActiveInstitutionId] = useState<string>(() => {
    try {
      return window.localStorage.getItem('da_active_inst_v1') || DEFAULT_INSTITUTIONS[0].id;
    } catch {
      return DEFAULT_INSTITUTIONS[0].id;
    }
  });

  const [students, setStudents] = useState<StudentRecord[]>(() => {
    const list = readStorageJson<StudentRecord[]>('da_students_v1', []);
    if (!Array.isArray(list)) return [];
    return list.map((s) => ({
      ...s,
      classroom: normalizeClassroomForGrade(s.classroom, getGradeProfile(s.gradeId)),
    }));
  });

  const activeInstitution = useMemo(
    () => institutions.find((i) => i.id === activeInstitutionId) ?? institutions[0],
    [institutions, activeInstitutionId]
  );

  const activeLogoPreset = useMemo(() => getLogoPreset(activeLogoId), [activeLogoId]);
  const gradeProfile = useMemo(() => getGradeProfile(gradeId), [gradeId]);

  const [questions, setQuestions] = useState<ExamQuestion[]>(() =>
    buildAutoExamQuestions('5', 'dengeli')
  );

  const [studentAnswersRaw, setStudentAnswersRaw] = useState<string>('');
  const [answerKeyRaw, setAnswerKeyRaw] = useState<string>(() =>
    buildAutoExamQuestions('5', 'dengeli')
      .map((q) => q.correctOption)
      .join('')
  );
  const [studentName, setStudentName] = useState<string>('');
  const [studentNumber, setStudentNumber] = useState<string>('');
  const [classroom, setClassroom] = useState<string>('5-A');
  const [penaltyDivisor, setPenaltyDivisor] = useState<3 | 4>(3);
  const [aiCoachSummary, setAiCoachSummary] = useState<string | undefined>(undefined);

  const [cover, setCover] = useState<CoverConfig>(() => ({
    academyName: activeInstitution.name,
    institutionCode8: activeInstitution.code8,
    logoStyleId: activeLogoId,
    examTitle: '5. Sınıf Kurumsal Deneme Sınavı',
    subtitle: buildGradeAppropriateSubtitle(getGradeProfile('5')),
    bookletCode: 'A',
    signatureName: 'Furkan',
    signatureTitle: 'Kurucu & Eğitim Koordinatörü',
    securityNotice:
      'ÇOĞALTILAMAZ · İZİNSİZ KOPYALANAMAZ VE DAĞITILAMAZ · DOĞRULUK AKADEMİ',
    examDate: new Date().toLocaleDateString('tr-TR'),
    durationMinutes: 90,
    questionCount: 70,
    isSampleDemo: false,
    reminders: DEFAULT_COVER_REMINDERS,
  }));

  const [uploadedPdfBytes, setUploadedPdfBytes] = useState<Uint8Array | null>(null);
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [uploadedPdfPageCount, setUploadedPdfPageCount] = useState<number | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<EducationCalendarEvent[]>(() => {
    const saved = readStorageJson<EducationCalendarEvent[]>('da_calendar_events_v1', []);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return [
      ...buildDefaultCalendarEvents(DEFAULT_INSTITUTIONS[0].id, '5'),
      ...buildDefaultCalendarEvents(DEFAULT_INSTITUTIONS[1].id, '8'),
    ];
  });

  const [cascadeEnabled, setCascadeEnabled] = useState<boolean>(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [modulesMenuOpen, setModulesMenuOpen] = useState(false);
  const modulesMenuRef = useRef<HTMLDivElement | null>(null);

  // Google Drive Auth State (Strictly in-memory token, never localStorage)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveSaveConfirm, setDriveSaveConfirm] = useState<{
    open: boolean;
    payloads: DriveUploadPayload[];
    existingFiles: DriveFileItem[];
    collisionNames: string[];
  } | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const weeklyBuilderRef = useRef<(() => Promise<DriveUploadPayload[]>) | null>(null);

  const activeTheme = useMemo(() => getThemeById(themeId), [themeId]);

  useEffect(() => {
    try {
      window.localStorage.setItem('da_active_logo_v1', activeLogoId);
      window.localStorage.setItem('da_institutions_v1', JSON.stringify(institutions));
      window.localStorage.setItem('da_active_inst_v1', activeInstitutionId);
      window.localStorage.setItem('da_students_v1', JSON.stringify(students));
      window.localStorage.setItem('da_calendar_events_v1', JSON.stringify(calendarEvents));
    } catch {
      // Ignore storage quota errors
    }
  }, [activeLogoId, institutions, activeInstitutionId, students, calendarEvents]);

  // Apply selected theme CSS variables and dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    Object.entries(activeTheme.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  }, [activeTheme]);

  // Initialize Firebase Google Drive auth listener + outside-click handler for Modüller dropdown
  useEffect(() => {
    const unsub = initGoogleDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveToken(token);
      },
      () => {
        setDriveUser(null);
        setDriveToken(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        modulesMenuRef.current &&
        !modulesMenuRef.current.contains(e.target as Node)
      ) {
        setModulesMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Evaluate OMR deterministically from current state
  const [evalTick, setEvalTick] = useState(0);
  const analysis = useMemo(() => {
    void evalTick;
    const studentArr = parseAnswerString(
      studentAnswersRaw,
      questions.length,
      gradeProfile.optionCount
    );
    const keyArr = parseAnswerString(
      answerKeyRaw,
      questions.length,
      gradeProfile.optionCount
    );
    const res = evaluateOmrExam({
      studentName,
      studentNumber,
      classroom,
      examTitle: cover.examTitle,
      gradeId,
      penaltyDivisor,
      studentAnswers: studentArr,
      answerKey: keyArr,
      questions,
    });
    if (aiCoachSummary) {
      res.aiCoachSummary = aiCoachSummary;
    }
    return res;
  }, [
    evalTick,
    studentAnswersRaw,
    answerKeyRaw,
    questions,
    gradeProfile.optionCount,
    studentName,
    studentNumber,
    classroom,
    cover.examTitle,
    gradeId,
    penaltyDivisor,
    aiCoachSummary,
  ]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleSelectLogo = (id: LogoStyleId) => {
    const preset = getLogoPreset(id);
    setActiveLogoId(id);
    setCover((prev) => ({
      ...prev,
      logoStyleId: id,
    }));
    showToast(`"${preset.name}" başlık ve 3D logo tasarımı aktif edildi.`);
  };

  const syncGradeForStudent = (
    targetGradeId: GradeLevelId,
    options?: { preserveAnswers?: boolean }
  ) => {
    const nextProfile = getGradeProfile(targetGradeId);
    const shouldResetExam = !options?.preserveAnswers;
    if (targetGradeId === gradeId) {
      if (shouldResetExam) {
        setStudentAnswersRaw('');
        setHasLiveAnalysis(false);
        setAiCoachSummary(undefined);
      }
      return;
    }
    const nextQuestions = buildAutoExamQuestions(targetGradeId, 'dengeli');
    setGradeId(targetGradeId);
    setMebOverride(null);
    setQuestions(nextQuestions);
    setPenaltyDivisor(nextProfile.penaltyDivisor);
    if (shouldResetExam) {
      setStudentAnswersRaw('');
      setHasLiveAnalysis(false);
    }
    setAnswerKeyRaw(nextQuestions.map((q) => q.correctOption).join(''));
    setAiCoachSummary(undefined);
    setCover((prev) => ({
      ...prev,
      examTitle: nextProfile.examName,
      subtitle: buildGradeAppropriateSubtitle(nextProfile),
      durationMinutes: nextProfile.durationMinutes,
      questionCount: nextQuestions.length,
    }));
  };

  const ensureGradeAllowedForInst = (inst: Institution) => {
    if (!isGradeAllowedForInstitution(inst, gradeId, GRADE_PROFILES)) {
      const allowed = filterGradeProfilesByInstitution(GRADE_PROFILES, inst);
      if (allowed[0]) {
        syncGradeForStudent(allowed[0].id);
        setClassroom(defaultClassroomForGrade(allowed[0].id));
      }
    }
  };

  const handleSelectInstitution = (inst: Institution) => {
    const normalized = normalizeInstitution(inst);
    setActiveInstitutionId(normalized.id);
    setCover((prev) => ({
      ...prev,
      academyName: normalized.name,
      institutionCode8: normalized.code8,
      isSampleDemo: false,
    }));
    // Kurum seçildiğinde önceki veriler ve sahte netler asla taşınmaz; her zaman temiz/boş başlar.
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setAiCoachSummary(undefined);
    setClassroom(defaultClassroomForGrade(gradeId));
    ensureGradeAllowedForInst(normalized);
    showToast(`${normalized.name} (${normalized.code8}) kurum oturumu temiz görünümle açıldı.`);
  };

  const handleAddInstitution = (inst: Institution) => {
    const normalized = normalizeInstitution(inst);
    setInstitutions((prev) => [normalized, ...prev]);
    setActiveInstitutionId(normalized.id);
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setAiCoachSummary(undefined);
    setClassroom(defaultClassroomForGrade(gradeId));
    ensureGradeAllowedForInst(normalized);
    setCalendarEvents((prev) => [
      ...buildDefaultCalendarEvents(normalized.id, gradeId),
      ...prev,
    ]);
    setCover((prev) => ({
      ...prev,
      academyName: normalized.name,
      institutionCode8: normalized.code8,
      isSampleDemo: false,
    }));
    showToast(`Yeni kurum "${normalized.name}" (${normalized.code8}) eklendi. Öğrenci ve sınav verileri temiz açıldı.`);
  };

  const handleUpdateInstitutionPermissions = (
    institutionId: string,
    permissions: InstitutionPermissions
  ) => {
    setInstitutions((prev) =>
      prev.map((i) => (i.id === institutionId ? { ...i, permissions } : i))
    );
    if (institutionId === activeInstitutionId) {
      const updatedInst = { ...activeInstitution, permissions };
      ensureGradeAllowedForInst(updatedInst);
    }
    showToast(`Kurum yetki ayarları güncellendi (${permissions.role} · ${permissions.status}).`);
  };

  const handleBulkAddInstitutions = (items: Institution[]) => {
    if (items.length === 0) return;
    const normalized = items.map(normalizeInstitution);
    setInstitutions((prev) => [...normalized, ...prev]);
    const first = normalized[0];
    setActiveInstitutionId(first.id);
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setAiCoachSummary(undefined);
    setCover((prev) => ({
      ...prev,
      academyName: first.name,
      institutionCode8: first.code8,
      isSampleDemo: false,
    }));
    showToast(`${normalized.length} kurum Excel'den başarıyla eklendi!`);
  };

  const handleAddStudent = (stu: StudentRecord) => {
    setStudents((prev) => [stu, ...prev]);
    const targetInst = institutions.find((i) => i.id === stu.institutionId);
    setCover((prev) => ({
      ...prev,
      academyName: targetInst ? targetInst.name : prev.academyName,
      institutionCode8: targetInst ? targetInst.code8 : prev.institutionCode8,
      isSampleDemo: false,
    }));
    if (targetInst) {
      setActiveInstitutionId(targetInst.id);
    }
    syncGradeForStudent(stu.gradeId);
    setStudentName(stu.fullName);
    setStudentNumber(stu.studentNumber8);
    setClassroom(stu.classroom);
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    const gp = getGradeProfile(stu.gradeId);
    showToast(
      `${stu.fullName} kaydedildi · ${gp.shortLabel} · No: ${stu.studentNumber8} (Henüz deneme yapılmadı)`
    );
  };

  const handleBulkAddStudents = (items: StudentRecord[]) => {
    if (items.length === 0) return;
    setStudents((prev) => [...items, ...prev]);
    const first = items[0];
    setCover((prev) => ({ ...prev, isSampleDemo: false }));
    syncGradeForStudent(first.gradeId);
    setStudentName(first.fullName);
    setStudentNumber(first.studentNumber8);
    setClassroom(first.classroom);
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    showToast(`${items.length} öğrenci Excel'den içe aktarıldı (Deneme bekleniyor).`);
  };

  const handleSelectStudent = (stu: StudentRecord) => {
    const targetInst = institutions.find((i) => i.id === stu.institutionId);
    setCover((prev) => ({
      ...prev,
      academyName: targetInst ? targetInst.name : prev.academyName,
      institutionCode8: targetInst ? targetInst.code8 : prev.institutionCode8,
      isSampleDemo: false,
    }));
    if (targetInst && targetInst.id !== activeInstitutionId) {
      setActiveInstitutionId(targetInst.id);
    }
    const hasSavedExam = Boolean(stu.lastOmrAnswers && stu.lastOmrAnswers.trim().length > 0);
    syncGradeForStudent(stu.gradeId, { preserveAnswers: hasSavedExam });
    setStudentName(stu.fullName);
    setStudentNumber(stu.studentNumber8);
    setClassroom(stu.classroom);
    if (hasSavedExam) {
      setStudentAnswersRaw(stu.lastOmrAnswers || '');
      if (stu.lastAnswerKey) setAnswerKeyRaw(stu.lastAnswerKey);
      setHasLiveAnalysis(true);
    } else {
      setStudentAnswersRaw('');
      setHasLiveAnalysis(false);
    }
    const gp = getGradeProfile(stu.gradeId);
    showToast(
      hasSavedExam
        ? `Aktif öğrenci: ${stu.fullName} (${stu.studentNumber8}) · ${gp.shortLabel} optik kaydı yüklendi`
        : `Aktif öğrenci: ${stu.fullName} (${stu.studentNumber8}) · ${gp.shortLabel} (Henüz deneme yapılmadı)`
    );
  };

  const handleLoadDemoStudent = (demo: StudentRecord) => {
    setCover((prev) => ({ ...prev, isSampleDemo: true }));
    const nextProfile = getGradeProfile(demo.gradeId);
    const nextQuestions = buildAutoExamQuestions(demo.gradeId, 'dengeli');
    const nextSample = generateSampleOmrPair(nextQuestions, 0.76);
    setGradeId(demo.gradeId);
    setMebOverride(null);
    setQuestions(nextQuestions);
    setPenaltyDivisor(nextProfile.penaltyDivisor);
    setStudentAnswersRaw(nextSample.studentString);
    setAnswerKeyRaw(nextSample.keyString);
    setAiCoachSummary(undefined);
    setCover((prev) => ({
      ...prev,
      examTitle: nextProfile.examName,
      subtitle: buildGradeAppropriateSubtitle(nextProfile),
      durationMinutes: nextProfile.durationMinutes,
      questionCount: nextQuestions.length,
      isSampleDemo: true,
    }));
    setStudentName(demo.fullName);
    setStudentNumber(demo.studentNumber8);
    setClassroom(demo.classroom);
    setHasLiveAnalysis(true);
    showToast(`Örnek simülasyon yüklendi: ${demo.fullName} (${nextProfile.shortLabel})`);
  };

  const handleResetCleanWorkspace = () => {
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setClassroom(defaultClassroomForGrade(gradeId));
    setHasLiveAnalysis(false);
    setAiCoachSummary(undefined);
    setCover((prev) => ({ ...prev, isSampleDemo: false }));
    showToast('Sade çalışma alanına dönüldü; örnek simülasyon verisi temizlendi.');
  };

  const handleApplyMebCurriculum = (
    override: DynamicCurriculumOverride,
    generatedQuestions: ExamQuestion[]
  ) => {
    setMebOverride(override);
    setQuestions(generatedQuestions);
    setAnswerKeyRaw(generatedQuestions.map((q) => q.correctOption).join(''));
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setCover((prev) => ({
      ...prev,
      questionCount: generatedQuestions.length,
    }));
    showToast(`MEB PDF "${override.sourceName}" aktif müfredat olarak uygulandı.`);
  };

  const handleClearMebCurriculum = () => {
    setMebOverride(null);
    const nextQuestions = buildAutoExamQuestions(gradeId, 'dengeli');
    setQuestions(nextQuestions);
    setAnswerKeyRaw(nextQuestions.map((q) => q.correctOption).join(''));
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setCover((prev) => ({
      ...prev,
      questionCount: nextQuestions.length,
    }));
    showToast(`${gradeProfile.shortLabel} standart müfredatına dönüldü.`);
  };

  const handleSelectGrade = (nextGradeId: GradeLevelId) => {
    setGradeId(nextGradeId);
    setMebOverride(null);
    const nextProfile = getGradeProfile(nextGradeId);
    const nextQuestions = buildAutoExamQuestions(nextGradeId, 'dengeli');
    setQuestions(nextQuestions);
    setPenaltyDivisor(nextProfile.penaltyDivisor);
    setClassroom(defaultClassroomForGrade(nextGradeId));
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setAnswerKeyRaw(nextQuestions.map((q) => q.correctOption).join(''));
    setAiCoachSummary(undefined);
    setCover((prev) => ({
      ...prev,
      examTitle: nextProfile.examName,
      subtitle: buildGradeAppropriateSubtitle(nextProfile),
      durationMinutes: nextProfile.durationMinutes,
      questionCount: nextQuestions.length,
    }));
    showToast(`${nextProfile.label} profili (${nextQuestions.length} soru) yüklendi.`);
  };

  const handleDownloadStudentReportPdf = async () => {
    setExportBusy(true);
    try {
      const pdfBytes = await generateStudentReportCardPdf(analysis, cover, gradeProfile);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const safeName = analysis.studentName
        .toLocaleLowerCase('tr-TR')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      triggerDownload(blob, `Karne-Analizi-${safeName || 'ogrenci'}-${analysis.studentNumber}.pdf`);
      showToast(`${analysis.studentName} için 2 sayfalık profesyonel PDF Karne Analizi indirildi.`);
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadBookletPdf = async () => {
    setExportBusy(true);
    try {
      const bytes = await generateBookletPdf(cover, questions, uploadedPdfBytes);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      triggerDownload(
        blob,
        `Dogruluk-Akademi-${cover.bookletCode}-Kitapcik-Furkan-Imzali.pdf`
      );
      showToast(
        cover.isSampleDemo
          ? 'Furkan 3D imzalı, her sayfada logolu ve son sayfası ÖRNEKTİR PDF indirildi.'
          : 'Furkan 3D dijital imzalı ve kurum logolu deneme PDF’i indirildi.'
      );
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadOpticalPdf = async () => {
    setExportBusy(true);
    try {
      const bytes = await generateOpticalSheetPdf(
        cover,
        Math.max(questions.length, 120),
        gradeProfile.optionCount,
        {
          gradeProfile,
          studentName,
          studentNumber8: studentNumber,
          institutionCode8: activeInstitution.code8,
          classroom,
        }
      );
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      triggerDownload(blob, `Optik-Form-${studentNumber}-${activeInstitution.code8}.pdf`);
      showToast('ÖSYM/MEB tipi 8 haneli kodlamalı optik cevap kağıdı PDF’i indirildi.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadZip = async () => {
    setExportBusy(true);
    try {
      const zipBlob = await generateCompleteSystemZip({
        cover,
        questions,
        analysis,
        uploadedPdfBytes,
        optionCount: gradeProfile.optionCount,
        gradeProfile,
        studentName,
        studentNumber8: studentNumber,
        classroom,
      });
      triggerDownload(zipBlob, 'Dogruluk-Akademi-Tam-Paket.zip');
      showToast('Tüm sistemi, 3D kapaklı PDF, optik form ve karneleri içeren ZIP indirildi.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadSourceZip = async () => {
    setExportBusy(true);
    try {
      const resp = await fetch('/api/export/app-zip');
      if (!resp.ok) throw new Error('Uygulama ZIP dosyası indirilemedi');
      const blob = await resp.blob();
      triggerDownload(blob, 'Dogruluk-Akademi-Uygulama-Kaynak-Kodu.zip');
      showToast('Tam uygulama proje kaynak kodu ZIP dosyası indirildi.');
    } finally {
      setExportBusy(false);
    }
  };

  const smartRecommendations = useMemo(
    () =>
      buildSmartRecommendations({
        activeInstitution,
        gradeProfile,
        analysis,
        questionsCount: questions.length,
        calendarCount: calendarEvents.filter((e) => e.institutionId === activeInstitution.id).length,
        hasLiveAnalysis,
      }),
    [activeInstitution, gradeProfile, analysis, questions.length, calendarEvents, hasLiveAnalysis]
  );

  const handleAddCalendarEvent = (ev: EducationCalendarEvent) => {
    setCalendarEvents((prev) => [ev, ...prev]);
    showToast(`Takvime eklendi: ${ev.title} (${ev.date})`);
  };

  const handleScheduleRemedial = (topicGap: TopicGapMetric) => {
    const ev = buildRemedialCalendarEvent({
      topicGap,
      institutionId: activeInstitution.id,
      gradeId,
      classroom,
    });
    handleAddCalendarEvent(ev);
  };

  const handleExecuteRecommendation = (rec: SmartRecommendation) => {
    if (rec.actionType === 'apply-balanced-exam') {
      const next = buildAutoExamQuestions(gradeId, 'dengeli', questions.length);
      const pair = generateSampleOmrPair(next, 0.78);
      setQuestions(next);
      setAnswerKeyRaw(pair.keyString);
      showToast(`${gradeProfile.shortLabel} için ÖSYM standardında dengeli ${next.length} soruluk deneme hazırlandı.`);
    } else if (rec.actionType === 'apply-hard-exam') {
      const next = buildAutoExamQuestions(gradeId, 'zor', questions.length);
      const pair = generateSampleOmrPair(next, 0.72);
      setQuestions(next);
      setAnswerKeyRaw(pair.keyString);
      showToast(`${gradeProfile.shortLabel} için derece seçici zorlukta deneme oluşturuldu.`);
    } else if (rec.actionType === 'add-calendar-remedial') {
      const gap =
        analysis.topicGaps.find((t) => t.topic === rec.payload?.topic) ??
        analysis.topicGaps[0];
      if (gap) {
        handleScheduleRemedial(gap);
      }
      setActiveTab('calendar');
    } else if (rec.actionType === 'open-editor') {
      setActiveTab('editor');
    } else if (rec.actionType === 'open-calendar') {
      setActiveTab('calendar');
    } else if (rec.actionType === 'open-poster') {
      setActiveTab('poster');
    } else if (rec.actionType === 'open-reports') {
      setActiveTab('reports');
    } else if (rec.actionType === 'download-zip') {
      void handleDownloadZip();
    }
  };

  const handleDriveSignIn = async () => {
    const { user, accessToken } = await signInWithGoogleDrive();
    setDriveUser(user);
    setDriveToken(accessToken);
    showToast(`Google Drive bağlandı: ${user.email || user.displayName}`);
  };

  const handleDriveSignOut = async () => {
    await signOutGoogleDrive();
    setDriveUser(null);
    setDriveToken(null);
    showToast('Google Drive oturumu kapatıldı.');
  };

  const buildDefaultWeeklyFilesForDrive = async (): Promise<DriveUploadPayload[]> => {
    if (weeklyBuilderRef.current) {
      return weeklyBuilderRef.current();
    }
    const sampleEntries = buildSampleWeeklyCohort({
      institution: activeInstitution,
      gradeId,
      questionCount: 50,
      existingStudents: students,
    });
    const rows = computeWeeklyComparison({
      entries: sampleEntries,
      kts1TotalQuestions: 50,
      kts2TotalQuestions: 50,
      gradeProfile,
    });
    const pdfBytes = await generateWeeklyRankingPdf({
      rows,
      academyName: activeInstitution.name,
      institutionCode8: activeInstitution.code8,
      kts1Name: 'Haftalık 1 (KTS-1)',
      kts2Name: 'Haftalık 2 (KTS-2)',
      kts1QuestionCount: 50,
      kts2QuestionCount: 50,
      gradeProfile,
      cover,
    });
    const excelBlob = buildWeeklyComparisonWorkbookBlob({
      rows,
      academyName: activeInstitution.name,
      kts1Name: 'Haftalık 1 (KTS-1)',
      kts2Name: 'Haftalık 2 (KTS-2)',
      gradeLabel: gradeProfile.shortLabel,
    });
    const htmlStr = buildWeeklyPcStandaloneHtml({
      rows,
      academyName: activeInstitution.name,
      institutionCode8: activeInstitution.code8,
      kts1Name: 'Haftalık 1 (KTS-1)',
      kts2Name: 'Haftalık 2 (KTS-2)',
      kts1QuestionCount: 50,
      kts2QuestionCount: 50,
      gradeLabel: gradeProfile.shortLabel,
      signatureName: cover.signatureName,
    });
    return [
      {
        fileName: `Pano-Asma-Sirali-Liste-${gradeProfile.id}.pdf`,
        mimeType: 'application/pdf',
        blob: new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
      },
      {
        fileName: `Haftalik-Karsilastirma-${gradeProfile.id}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        blob: excelBlob,
      },
      {
        fileName: `Bilgisayarda-Ac-Haftalik-Liste-${gradeProfile.id}.html`,
        mimeType: 'text/html',
        blob: new Blob([htmlStr], { type: 'text/html;charset=utf-8' }),
      },
    ];
  };

  const executeDriveUpload = async (
    payloads: DriveUploadPayload[],
    existingFiles: DriveFileItem[],
    overwrite: boolean
  ) => {
    if (!driveToken) return;
    setDriveBusy(true);
    try {
      const folderId = await ensureDriveFolder(driveToken, 'Doğruluk Akademi Arşivi');
      for (const item of payloads) {
        const found = existingFiles.find((f) => f.name === item.fileName);
        await uploadBlobToGoogleDrive(driveToken, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          blob: item.blob,
          folderId: found && overwrite ? undefined : folderId,
          overwriteFileId: found && overwrite ? found.id : undefined,
        });
      }
      showToast(`${payloads.length} dosya Google Drive ("Doğruluk Akademi Arşivi") klasörüne kaydedildi.`);
    } finally {
      setDriveBusy(false);
    }
  };

  const handleSaveWeeklyToDrive = async (payloads: DriveUploadPayload[]) => {
    if (!driveToken) {
      setActiveTab('drive');
      return;
    }
    setDriveBusy(true);
    try {
      const existingFiles = await listGoogleDriveFiles(driveToken, '');
      const collisions = payloads.filter((p) =>
        existingFiles.some((f) => f.name === p.fileName)
      );
      if (collisions.length > 0) {
        setDriveBusy(false);
        setDriveSaveConfirm({
          open: true,
          payloads,
          existingFiles,
          collisionNames: collisions.map((c) => c.fileName),
        });
        return;
      }
      await executeDriveUpload(payloads, existingFiles, false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive yüklemesi başarısız oldu.');
      setDriveBusy(false);
    }
  };

  const handleTabNavigation = (tab: ActiveTab) => {
    const permMap: Partial<Record<ActiveTab, AppPermissionKey>> = {
      omr: 'omrOkuma',
      generator: 'denemeUretici',
      editor: 'denemeEditoru',
      calendar: 'egitimTakvimi',
      poster: 'afis3D',
    };
    const requiredKey = permMap[tab];
    if (requiredKey) {
      const check = canInstitutionUseModule(activeInstitution, requiredKey);
      if (!check.allowed) {
        showToast(check.reason || 'Bu modül kurum yetki ayarlarınızda kapalı.');
        return;
      }
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setModulesMenuOpen(false);
  };

  const primaryNavItems: Array<{
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'dashboard', label: 'Genel Bakış', shortLabel: 'Genel Bakış', icon: LayoutDashboard },
    { id: 'weekly', label: 'Haftalık Liste', shortLabel: 'Haftalık Liste', icon: TrendingUp },
    { id: 'omr', label: 'Optik Okuma', shortLabel: 'Optik', icon: Camera },
    { id: 'reports', label: 'Karne & Analiz', shortLabel: 'Karne', icon: Award },
  ];

  const moduleNavItems: Array<{
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'generator', label: 'Deneme & PDF', shortLabel: 'Deneme & PDF', icon: FilePlus2 },
    { id: 'editor', label: 'Deneme Editörü', shortLabel: 'Deneme Editörü', icon: PenSquare },
    { id: 'calendar', label: 'Eğitim Takvimi', shortLabel: 'Eğitim Takvimi', icon: CalendarDays },
    { id: 'poster', label: '3D Afiş & QR', shortLabel: '3D Afiş', icon: ImageIcon },
    { id: 'drive', label: 'Yedek, Telefon & PC', shortLabel: 'Yedek & Kur', icon: Cloud },
  ];

  const allNavItems = [...primaryNavItems, ...moduleNavItems];
  const isModuleTabActive = moduleNavItems.some((m) => m.id === activeTab);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      <OfflineIndicator />
      <DriveConfirmModal
        open={Boolean(driveSaveConfirm?.open)}
        title="Google Drive Üzerindeki Dosyalar Güncellensin mi?"
        description={`${driveSaveConfirm?.collisionNames.join(', ') ?? ''} dosyaları Google Drive'da zaten mevcut. Üzerine yazarak güncellemek istiyor musunuz?`}
        confirmLabel="Üzerine Yaz & Kaydet"
        busy={driveBusy}
        onCancel={() => setDriveSaveConfirm(null)}
        onConfirm={async () => {
          const cur = driveSaveConfirm;
          setDriveSaveConfirm(null);
          if (cur) {
            await executeDriveUpload(cur.payloads, cur.existingFiles, true);
          }
        }}
      />
      {/* 3D Educational Descending Elements */}
      <Education3DCascade enabled={cascadeEnabled} />

      {/* Left Sidebar (Desktop + Drawer on Mobile) */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-0 z-50 flex' : 'hidden'
        } lg:flex lg:w-64 lg:shrink-0 flex-col justify-between p-5 relative z-20`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          color: 'var(--text-sidebar)',
        }}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Logo3D size="sm" variant={activeLogoId} />
              <div className="min-w-0">
                <div className="font-display text-base font-extrabold tracking-tight truncate">
                  {activeLogoPreset.headerTitle}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: 'var(--text-sidebar-muted)' }}
                >
                  {activeInstitution.name} · {activeInstitution.code8}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Menüyü kapat"
              className="lg:hidden p-2 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Ana menü" className="space-y-1.5">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabNavigation(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer transition-transform ${
                    active ? 'btn-3d' : 'hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Compact Theme Switcher & Live 3D Cascade Toggle in Sidebar */}
          <div className="pt-4 border-t border-white/15 space-y-3">
            <label className="block text-xs font-semibold" style={{ color: 'var(--text-sidebar-muted)' }}>
              <span>Aktif Tema ({ACADEMY_THEMES.length} Tema)</span>
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value as AcademyThemeId)}
                className="mt-1.5 w-full rounded-lg px-2.5 py-2 text-xs font-semibold bg-white/10 text-white border border-white/20 focus:outline-2"
              >
                {ACADEMY_THEMES.map((t) => (
                  <option key={t.id} value={t.id} className="text-slate-900 bg-white">
                    {t.name} ({t.mode === 'dark' ? 'Koyu' : 'Açık'})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              aria-pressed={cascadeEnabled}
              onClick={() => setCascadeEnabled((v) => !v)}
              className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/20 flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                <span>3D Eğitim Akışı</span>
              </span>
              <span className="text-[11px] opacity-90">{cascadeEnabled ? 'Açık' : 'Kapalı'}</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-white/15 text-xs space-y-1" style={{ color: 'var(--text-sidebar-muted)' }}>
          <div className="font-bold text-white">{cover.signatureName} 3D İmzalı</div>
          <div>{gradeProfile.shortLabel} · {questions.length} Soru · Çoğaltılamaz</div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative z-20">
        {/* Top Bar Contract: [Brand Title] — [nav links] — [1 primary action] */}
        <header
          className="surface-card border-x-0 border-t-0 px-3 sm:px-5 py-3 flex items-center justify-between gap-2 sm:gap-6 sticky top-0 z-30"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menüyü aç"
              className="lg:hidden p-2 rounded-lg surface-alt shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('dashboard');
                }}
                className="font-display text-base sm:text-lg font-extrabold tracking-tight whitespace-nowrap truncate block leading-tight"
              >
                {activeLogoPreset.headerTitle}
              </a>
              <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                {activeInstitution.name} · Kod: <span className="font-mono-num">{activeInstitution.code8}</span>
              </div>
            </div>
          </div>

          <nav aria-label="Üst gezinme" className="hidden md:flex items-center gap-4 xl:gap-5 text-[13px] font-semibold">
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabNavigation(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 cursor-pointer transition-colors ${
                  activeTab === item.id
                    ? 'underline underline-offset-8 decoration-2 font-bold'
                    : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  color: activeTab === item.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                }}
              >
                {item.shortLabel}
              </button>
            ))}

            <div className="relative" ref={modulesMenuRef}>
              <button
                type="button"
                aria-expanded={modulesMenuOpen}
                aria-haspopup="menu"
                onClick={() => setModulesMenuOpen((v) => !v)}
                className={`whitespace-nowrap shrink-0 py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isModuleTabActive ? 'btn-3d text-xs' : 'surface-alt text-xs font-bold'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Modüller</span>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {modulesMenuOpen && (
                <div
                  role="menu"
                  className="surface-card rounded-xl p-1.5 w-52 shadow-2xl absolute right-0 mt-2 z-50 space-y-1"
                >
                  {moduleNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        role="menuitem"
                        type="button"
                        onClick={() => handleTabNavigation(item.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2.5 cursor-pointer ${
                          active ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <PWAInstallButton
              compact
              academyName={activeInstitution.name}
              onOpenFullGuide={() => handleTabNavigation('drive')}
              onToast={showToast}
            />
            <button
              type="button"
              disabled={exportBusy}
              onClick={handleDownloadZip}
              className="btn-3d px-3 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-60"
            >
              {exportBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Hazırlanıyor...</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>ZIP Paketi İndir</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Feedback Toast */}
        {toastMsg && (
          <div className="mx-5 mt-4 surface-card rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2 shadow-md">
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
            <span>{toastMsg}</span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-7 max-w-[1360px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              gradeProfile={gradeProfile}
              onSelectGrade={handleSelectGrade}
              analysis={analysis}
              hasLiveAnalysis={hasLiveAnalysis}
              questionCount={questions.length}
              activeThemeId={themeId}
              onSelectTheme={setThemeId}
              activeLogoId={activeLogoId}
              onSelectLogo={handleSelectLogo}
              institutions={institutions}
              activeInstitution={activeInstitution}
              students={students}
              activeStudentNumber8={studentNumber}
              cover={cover}
              mebOverride={mebOverride}
              onApplyMebCurriculum={handleApplyMebCurriculum}
              onClearMebCurriculum={handleClearMebCurriculum}
              onSelectInstitution={handleSelectInstitution}
              onAddInstitution={handleAddInstitution}
              onBulkAddInstitutions={handleBulkAddInstitutions}
              onUpdateInstitutionPermissions={handleUpdateInstitutionPermissions}
              onAddStudent={handleAddStudent}
              onBulkAddStudents={handleBulkAddStudents}
              onSelectStudent={handleSelectStudent}
              onLoadDemoStudent={handleLoadDemoStudent}
              onResetCleanWorkspace={handleResetCleanWorkspace}
              onDownloadStudentReportPdf={handleDownloadStudentReportPdf}
              smartRecommendations={smartRecommendations}
              onExecuteRecommendation={handleExecuteRecommendation}
              onNavigate={handleTabNavigation}
              onDownloadZip={handleDownloadZip}
              onDownloadSourceZip={handleDownloadSourceZip}
            />
          )}

          {activeTab === 'omr' && (
            <OmrScannerView
              gradeProfile={gradeProfile}
              questions={questions}
              studentAnswersRaw={studentAnswersRaw}
              answerKeyRaw={answerKeyRaw}
              studentName={studentName}
              studentNumber={studentNumber}
              classroom={classroom}
              penaltyDivisor={penaltyDivisor}
              analysis={analysis}
              cover={cover}
              institutionCode8={activeInstitution.code8}
              onUpdateOmrState={(patch) => {
                if (patch.studentAnswersRaw !== undefined)
                  setStudentAnswersRaw(patch.studentAnswersRaw);
                if (patch.answerKeyRaw !== undefined) setAnswerKeyRaw(patch.answerKeyRaw);
                if (patch.studentName !== undefined) setStudentName(patch.studentName);
                if (patch.studentNumber !== undefined) setStudentNumber(patch.studentNumber);
                if (patch.classroom !== undefined) setClassroom(patch.classroom);
                if (patch.penaltyDivisor !== undefined) setPenaltyDivisor(patch.penaltyDivisor);
              }}
              onEvaluateNow={() => {
                if (!studentAnswersRaw.trim()) {
                  showToast('Lütfen önce öğrenci optik cevaplarını yükleyin veya girin.');
                  return;
                }
                setEvalTick((t) => t + 1);
                setHasLiveAnalysis(true);
                if (studentNumber) {
                  setStudents((prev) =>
                    prev.map((s) =>
                      s.studentNumber8 === studentNumber
                        ? {
                            ...s,
                            lastOmrAnswers: studentAnswersRaw,
                            lastAnswerKey: answerKeyRaw,
                            lastExamTitle: cover.examTitle,
                            lastEvaluatedAt: new Date().toLocaleDateString('tr-TR'),
                          }
                        : s
                    )
                  );
                }
                showToast('Optik form cevap anahtarıyla karşılaştırıldı ve tüm karneler güncellendi.');
              }}
              onGoToReports={() => setActiveTab('reports')}
              onDownloadOpticalPdf={handleDownloadOpticalPdf}
            />
          )}

          {activeTab === 'generator' && (
            <ExamGeneratorView
              institution={activeInstitution}
              gradeProfile={gradeProfile}
              onSelectGrade={handleSelectGrade}
              questions={questions}
              cover={cover}
              uploadedPdfName={uploadedPdfName}
              uploadedPdfPageCount={uploadedPdfPageCount}
              mebOverride={mebOverride}
              onApplyMebCurriculum={handleApplyMebCurriculum}
              onClearMebCurriculum={handleClearMebCurriculum}
              onUpdateQuestions={(next) => {
                setQuestions(next);
                const pair = generateSampleOmrPair(next, 0.76);
                setAnswerKeyRaw(pair.keyString);
              }}
              onUpdateCover={(patch) => setCover((prev) => ({ ...prev, ...patch }))}
              onUploadExamPdf={(bytes, name, pageCount) => {
                setUploadedPdfBytes(bytes);
                setUploadedPdfName(name);
                setUploadedPdfPageCount(pageCount);
              }}
              onClearExamPdf={() => {
                setUploadedPdfBytes(null);
                setUploadedPdfName(null);
                setUploadedPdfPageCount(null);
              }}
              onDownloadBookletPdf={handleDownloadBookletPdf}
              onDownloadOpticalPdf={handleDownloadOpticalPdf}
              onDownloadZip={handleDownloadZip}
              onDownloadSourceZip={handleDownloadSourceZip}
              onOpenEditor={() => handleTabNavigation('editor')}
            />
          )}

          {activeTab === 'editor' && (
            <ExamEditorView
              gradeProfile={gradeProfile}
              questions={questions}
              cover={cover}
              onUpdateQuestions={(next) => {
                setQuestions(next);
                setCover((prev) => ({ ...prev, questionCount: next.length }));
                setAnswerKeyRaw(next.map((q) => q.correctOption).join(''));
              }}
              onDownloadBookletPdf={handleDownloadBookletPdf}
            />
          )}

          {activeTab === 'calendar' && (
            <EducationCalendarView
              activeInstitution={activeInstitution}
              gradeProfile={gradeProfile}
              classroom={classroom}
              analysis={analysis}
              events={calendarEvents}
              onAddEvent={handleAddCalendarEvent}
              onToggleComplete={(id) =>
                setCalendarEvents((prev) =>
                  prev.map((ev) => (ev.id === id ? { ...ev, completed: !ev.completed } : ev))
                )
              }
              onDeleteEvent={(id) =>
                setCalendarEvents((prev) => prev.filter((ev) => ev.id !== id))
              }
            />
          )}

          {activeTab === 'weekly' && (
            <WeeklyComparisonView
              key={activeInstitution.id}
              activeInstitution={activeInstitution}
              gradeProfile={gradeProfile}
              students={students}
              cover={cover}
              driveConnected={Boolean(driveToken)}
              onSaveWeeklyToDrive={handleSaveWeeklyToDrive}
              onOpenDriveTab={() => handleTabNavigation('drive')}
              onToast={showToast}
              onSyncWeeklyExportsRef={(builder) => {
                weeklyBuilderRef.current = builder;
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsAnalysisView
              analysis={analysis}
              cover={cover}
              gradeProfile={gradeProfile}
              hasLiveAnalysis={hasLiveAnalysis}
              institutionName={activeInstitution.name}
              institutionCode8={activeInstitution.code8}
              studentPhone={
                students.find(
                  (s) =>
                    (studentNumber && s.studentNumber8 === studentNumber) ||
                    (studentName && s.fullName === studentName)
                )?.parentPhone
              }
              onUpdateCoachSummary={(summary) => {
                setAiCoachSummary(summary);
                showToast('Gemini AI Eğitim Koçu karnesi güncellendi.');
              }}
              onDownloadZip={handleDownloadZip}
              onScheduleRemedial={(topicGap) => {
                handleScheduleRemedial(topicGap);
                setActiveTab('calendar');
              }}
              onOpenWeeklyList={() => handleTabNavigation('weekly')}
              onOpenOmr={() => handleTabNavigation('omr')}
            />
          )}

          {activeTab === 'poster' && (
            <Poster3DStudio
              gradeProfile={gradeProfile}
              analysis={analysis}
              cover={cover}
            />
          )}

          {activeTab === 'drive' && (
            <GoogleDrivePanel
              driveUser={driveUser}
              driveToken={driveToken}
              onSignIn={handleDriveSignIn}
              onSignOut={handleDriveSignOut}
              onBuildWeeklyFiles={buildDefaultWeeklyFilesForDrive}
              onBuildFullSystemZipBlob={async () => {
                const zipBlob = await generateCompleteSystemZip({
                  cover,
                  questions,
                  analysis,
                  uploadedPdfBytes,
                  optionCount: gradeProfile.optionCount,
                  gradeProfile,
                  studentName,
                  studentNumber8: studentNumber,
                  classroom,
                });
                return {
                  fileName: `Dogruluk-Akademi-Tam-Paket-${activeInstitution.code8}.zip`,
                  mimeType: 'application/zip',
                  blob: zipBlob,
                };
              }}
              academyName={activeInstitution.name}
              onToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
}
