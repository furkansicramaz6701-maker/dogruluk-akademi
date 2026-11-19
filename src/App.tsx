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
  MoreVertical,
  Search,
  LogOut,
  ShieldCheck,
  FileText,
  Users,
  FlaskConical,
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
  OpenEndedPaperAnalysis,
  PdfUploadStripOptions,
  PenaltyDivisor,
  SmartRecommendation,
  StudentRecord,
  TopicGapMetric,
} from './types/academy';
import {
  buildAutoExamQuestions,
  evaluateOmrExam,
  formatPenaltyRuleLabel,
  generateSampleOmrPair,
  parseAnswerString,
} from './utils/examAnalysis';
import { searchWorkspaceEntities } from './utils/globalSearch';
import {
  DEFAULT_INSTITUTIONS,
  bulkUpsertInstitutions,
  canInstitutionUseModule,
  deleteInstitutionSafely,
  filterGradeProfilesByInstitution,
  isGradeAllowedForInstitution,
  normalizeInstitution,
  updateInstitutionRecord,
  upsertInstitutionList,
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
import { InstitutionPortalScreen } from './components/InstitutionPortalScreen';
import { AcademyTransitionSplash } from './components/AcademyTransitionSplash';
import { ThreeDotStudentModal } from './components/ThreeDotStudentModal';
import { SampleDemoPageView } from './components/SampleDemoPageView';

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
        'sample',
      ];
      if (tabParam && validTabs.includes(tabParam)) return tabParam;
    } catch {
      // Ignore invalid URL
    }
    return 'dashboard';
  });
  const [portalOpen, setPortalOpen] = useState<boolean>(() => {
    try {
      const autostart = new URLSearchParams(window.location.search).get('autostart');
      if (autostart === '1') return false;
      return window.sessionStorage.getItem('da_portal_unlocked_v1') !== '1';
    } catch {
      return true;
    }
  });
  const [loginMode, setLoginMode] = useState<'admin' | 'institution'>(() => {
    try {
      return window.sessionStorage.getItem('da_login_mode_v1') === 'institution'
        ? 'institution'
        : 'admin';
    } catch {
      return 'admin';
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeId, setThemeId] = useState<AcademyThemeId>('klasik-lacivert');
  const [gradeId, setGradeId] = useState<GradeLevelId>('5');
  const [hasLiveAnalysis, setHasLiveAnalysis] = useState<boolean>(false);
  const [omrInitialMode, setOmrInitialMode] = useState<'omr' | 'open-ended'>('omr');
  const [openEndedAnalysis, setOpenEndedAnalysis] = useState<OpenEndedPaperAnalysis | null>(null);
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
  const [penaltyDivisor, setPenaltyDivisor] = useState<PenaltyDivisor>(3);
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
  const [pdfStripOptions, setPdfStripOptions] = useState<PdfUploadStripOptions>({
    stripFrontCover: true,
    stripBackCover: true,
    appendBrandedBackPage: true,
  });

  const [calendarEvents, setCalendarEvents] = useState<EducationCalendarEvent[]>(() => {
    const saved = readStorageJson<EducationCalendarEvent[]>('da_calendar_events_v1', []);
    return Array.isArray(saved) ? saved : [];
  });

  const [cascadeEnabled, setCascadeEnabled] = useState<boolean>(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [modulesMenuOpen, setModulesMenuOpen] = useState(false);
  const modulesMenuRef = useRef<HTMLDivElement | null>(null);
  const [threeDotOpen, setThreeDotOpen] = useState(false);
  const threeDotRef = useRef<HTMLDivElement | null>(null);
  const [studentPanelOpen, setStudentPanelOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [transitionSplash, setTransitionSplash] = useState<{
    visible: boolean;
    subtitle: string;
    institutionName?: string;
  }>(() => {
    try {
      const autostart = new URLSearchParams(window.location.search).get('autostart') === '1';
      if (autostart) return { visible: false, subtitle: '' };
      const isStandaloneApp =
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        document.referrer.includes('android-app://');
      const alreadyUnlocked = window.sessionStorage.getItem('da_portal_unlocked_v1') === '1';
      if (isStandaloneApp && alreadyUnlocked) {
        return {
          visible: true,
          subtitle: 'Doğruluk Akademi Uygulaması Başlatılıyor',
        };
      }
    } catch {
      // Ignore browser environment detection error
    }
    return { visible: false, subtitle: '' };
  });

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
      if (
        threeDotRef.current &&
        !threeDotRef.current.contains(e.target as Node)
      ) {
        setThreeDotOpen(false);
      }
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
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
    setOpenEndedAnalysis(null);
    setAiCoachSummary(undefined);
    setClassroom(defaultClassroomForGrade(gradeId));
    ensureGradeAllowedForInst(normalized);
    showToast(`${normalized.name} (${normalized.code8}) kurum oturumu temiz görünümle açıldı.`);
  };

  const handleAddInstitution = (inst: Institution) => {
    const res = upsertInstitutionList(institutions, inst);
    setInstitutions(res.institutions);
    const saved = res.saved;
    setActiveInstitutionId(saved.id);
    if (res.wasDuplicate) {
      setStudents((prev) =>
        prev.map((s) =>
          s.institutionId === saved.id
            ? { ...s, institutionName: saved.name, institutionCode8: saved.code8 }
            : s
        )
      );
    }
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setOpenEndedAnalysis(null);
    setAiCoachSummary(undefined);
    setClassroom(defaultClassroomForGrade(gradeId));
    ensureGradeAllowedForInst(saved);
    setCover((prev) => ({
      ...prev,
      academyName: saved.name,
      institutionCode8: saved.code8,
      isSampleDemo: false,
    }));
    showToast(
      res.wasDuplicate
        ? `"${saved.name}" zaten kayıtlı olduğu için ikinci kurum açılmadı; mevcut kayıt (${saved.code8}) güncellendi.`
        : `Yeni kurum "${saved.name}" (${saved.code8}) sıfır veriyle oluşturuldu.`
    );
  };

  const handleUpdateInstitution = (
    institutionId: string,
    patch: { name: string; city: string; accessPassword?: string }
  ): { ok: boolean; reason?: string } => {
    const res = updateInstitutionRecord(institutions, institutionId, patch);
    if (!res.ok || !res.updated) {
      if (res.reason) showToast(res.reason);
      return { ok: false, reason: res.reason };
    }
    const updated = res.updated;
    setInstitutions(res.institutions);
    setStudents((prev) =>
      prev.map((s) =>
        s.institutionId === updated.id
          ? { ...s, institutionName: updated.name }
          : s
      )
    );
    if (updated.id === activeInstitutionId) {
      setCover((prev) => ({
        ...prev,
        academyName: updated.name,
        institutionCode8: updated.code8,
      }));
    }
    showToast(`Kurum güncellendi: ${updated.name} (${updated.city})`);
    return { ok: true };
  };

  const handleDeleteInstitution = (
    institutionId: string
  ): { ok: boolean; reason?: string } => {
    const res = deleteInstitutionSafely(institutions, institutionId, activeInstitutionId);
    if (!res.ok || !res.nextActiveInstitution) {
      if (res.reason) showToast(res.reason);
      return { ok: false, reason: res.reason };
    }
    setInstitutions(res.institutions);
    setStudents((prev) => prev.filter((s) => s.institutionId !== institutionId));
    setCalendarEvents((prev) => prev.filter((ev) => ev.institutionId !== institutionId));

    const nextActive = res.nextActiveInstitution;
    if (institutionId === activeInstitutionId) {
      setActiveInstitutionId(nextActive.id);
      setStudentName('');
      setStudentNumber('');
      setStudentAnswersRaw('');
      setHasLiveAnalysis(false);
      setAiCoachSummary(undefined);
      setClassroom(defaultClassroomForGrade(gradeId));
      ensureGradeAllowedForInst(nextActive);
      setCover((prev) => ({
        ...prev,
        academyName: nextActive.name,
        institutionCode8: nextActive.code8,
        isSampleDemo: false,
      }));
    }
    showToast(`"${res.deletedInstitution?.name}" kurumu ve bağlı verileri sistemden silindi.`);
    return { ok: true };
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
    const res = bulkUpsertInstitutions(institutions, items);
    setInstitutions(res.institutions);
    const first = res.firstAffected;
    if (first) {
      setActiveInstitutionId(first.id);
      setCover((prev) => ({
        ...prev,
        academyName: first.name,
        institutionCode8: first.code8,
        isSampleDemo: false,
      }));
    }
    setStudentName('');
    setStudentNumber('');
    setStudentAnswersRaw('');
    setHasLiveAnalysis(false);
    setAiCoachSummary(undefined);
    showToast(
      `Excel işlendi: ${res.addedCount} yeni kurum eklendi, ${res.updatedCount} mevcut kurum güncellendi (tekrar oluşmadı).`
    );
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

  const handleDeleteStudent = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    if (
      target &&
      (studentNumber === target.studentNumber8 ||
        (studentName && studentName === target.fullName))
    ) {
      setStudentName('');
      setStudentNumber('');
      setStudentAnswersRaw('');
      setHasLiveAnalysis(false);
      setOpenEndedAnalysis(null);
      setAiCoachSummary(undefined);
      setClassroom(defaultClassroomForGrade(gradeId));
    }
    if (target) {
      showToast(`${target.fullName} (${target.studentNumber8}) kurum öğrenci listesinden silindi.`);
    }
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
    setOpenEndedAnalysis(null);
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
      penaltyRuleLabel: formatPenaltyRuleLabel(nextProfile.penaltyDivisor, true),
    }));
    showToast(`${nextProfile.label} profili (${nextQuestions.length} soru) yüklendi.`);
  };

  const handleChangePenaltyDivisor = (nextDivisor: PenaltyDivisor) => {
    setPenaltyDivisor(nextDivisor);
    setCover((prev) => ({
      ...prev,
      penaltyRuleLabel: formatPenaltyRuleLabel(nextDivisor, true),
    }));
    showToast(`Doğru-Yanlış kuralı güncellendi: ${formatPenaltyRuleLabel(nextDivisor)}`);
  };

  const unlockPortalWithInstitution = (
    inst: Institution,
    mode: 'admin' | 'password' | 'preview'
  ) => {
    const nextLoginMode: 'admin' | 'institution' =
      mode === 'admin' ? 'admin' : 'institution';
    handleSelectInstitution(inst);
    setLoginMode(nextLoginMode);
    setPortalOpen(false);
    setActiveTab('dashboard');
    setTransitionSplash({
      visible: true,
      institutionName: nextLoginMode === 'institution' ? inst.name : undefined,
      subtitle:
        mode === 'admin'
          ? `Yönetici Ana Paneli Hazırlanıyor (${inst.name})`
          : mode === 'preview'
            ? `${inst.name} Kurum Önizleme Alanı Açılıyor`
            : `${inst.name} Kurum Alanına Geçiliyor`,
    });
    try {
      window.sessionStorage.setItem('da_portal_unlocked_v1', '1');
      window.sessionStorage.setItem('da_login_mode_v1', nextLoginMode);
    } catch {
      // ignore storage errors
    }
    showToast(
      mode === 'admin'
        ? `Doğruluk Akademi Yönetici Ana Paneli açıldı (Şifresiz · ${inst.name}).`
        : mode === 'preview'
          ? `${inst.name} (${inst.code8}) kuruma özel önizleme alanı açıldı.`
          : `${inst.name} (${inst.code8}) kuruma özel alana başarıyla giriş yapıldı.`
    );
  };

  const handleOpenPortalSwitch = () => {
    setThreeDotOpen(false);
    setModulesMenuOpen(false);
    setMobileMenuOpen(false);
    setPortalOpen(true);
    try {
      window.sessionStorage.removeItem('da_portal_unlocked_v1');
    } catch {
      // ignore
    }
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
      const bytes = await generateBookletPdf(
        cover,
        questions,
        uploadedPdfBytes,
        pdfStripOptions
      );
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      triggerDownload(
        blob,
        `Dogruluk-Akademi-${cover.bookletCode}-Kitapcik-Furkan-Imzali.pdf`
      );
      showToast(
        uploadedPdfBytes
          ? `${cover.academyName} ön/arka kapaklı deneme PDF’i indirildi (dış kapaklar temizlendi).`
          : cover.isSampleDemo
            ? 'Furkan 3D imzalı, her sayfada logolu ve arka kapaklı ÖRNEKTİR PDF indirildi.'
            : 'Furkan 3D dijital imzalı ve kuruma özel ön/arka kapaklı deneme PDF’i indirildi.'
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
        pdfStripOptions,
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

  const activeStudentParentPhone = useMemo(
    () =>
      students.find(
        (s) =>
          (studentNumber && s.studentNumber8 === studentNumber) ||
          (studentName && s.fullName === studentName)
      )?.parentPhone,
    [students, studentNumber, studentName]
  );

  const handleTabNavigation = (tab: ActiveTab, requestedOmrMode?: 'omr' | 'open-ended') => {
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
    if (tab === 'omr') {
      setOmrInitialMode(requestedOmrMode ?? 'omr');
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setModulesMenuOpen(false);
    setThreeDotOpen(false);
    setSearchFocused(false);
  };

  const globalSearchResults = useMemo(
    () =>
      searchWorkspaceEntities({
        query: globalSearchQuery,
        students,
        institutions,
        activeInstitutionId: activeInstitution.id,
      }),
    [globalSearchQuery, students, institutions, activeInstitution.id]
  );

  const threeDotQuickItems: Array<{
    id: string;
    label: string;
    sublabel: string;
    tab: ActiveTab;
    omrMode?: 'omr' | 'open-ended';
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'td-overview', label: 'Genel Bakış', sublabel: 'Ana kontrol paneli ve 3–5. sınıf ayarı', tab: 'dashboard', icon: LayoutDashboard },
    { id: 'td-weekly', label: 'Haftalık Liste (KTS)', sublabel: 'Sıralama, ilk 3 rozeti, Pano PDF & Excel', tab: 'weekly', icon: TrendingUp },
    { id: 'td-omr', label: 'Optik Okuma (OMR)', sublabel: 'Çoktan seçmeli optik cevap analizi', tab: 'omr', omrMode: 'omr', icon: Camera },
    { id: 'td-open-ended', label: '10 Soruluk Açık Uçlu Kağıt', sublabel: 'Yazılı kağıdı & çözüm analizi', tab: 'omr', omrMode: 'open-ended', icon: FileText },
    { id: 'td-generator', label: 'Deneme & PDF · Soru İşleyici', sublabel: 'PDF yükle, 20 soruluk yazılı seç, kitapçık al', tab: 'generator', icon: FilePlus2 },
    { id: 'td-editor', label: 'Deneme Editörü', sublabel: 'Grafik, tablo, matematik ve resimli İngilizce', tab: 'editor', icon: PenSquare },
    { id: 'td-reports', label: 'Karne & Veli Mesaj Şablonları', sublabel: 'WhatsApp / SMS taslakları ve PDF karne', tab: 'reports', icon: Award },
    { id: 'td-calendar', label: 'Eğitim Takvimi', sublabel: 'Deneme ve telafi etüt programı', tab: 'calendar', icon: CalendarDays },
    { id: 'td-poster', label: '3D Afiş & QR', sublabel: 'Kurumsal afiş ve QR kod oluşturucu', tab: 'poster', icon: ImageIcon },
    { id: 'td-drive', label: 'Yedek, Telefon & PC (PWA Kur)', sublabel: 'Google Drive yedek & uygulama yükleme', tab: 'drive', icon: Cloud },
    { id: 'td-sample', label: 'Örnek Sayfa (Demo & Türkiye Geneli)', sublabel: 'Kurum verilerinden bağımsız örnek analiz sayfası', tab: 'sample', icon: FlaskConical },
  ];

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
    { id: 'sample', label: 'Örnek Sayfa', shortLabel: 'Örnek Sayfa', icon: FlaskConical },
  ];

  const instStudentsCount = students.filter((s) => s.institutionId === activeInstitution.id).length;
  const allNavItems = [...primaryNavItems, ...moduleNavItems];
  const isModuleTabActive = moduleNavItems.some((m) => m.id === activeTab);

  if (portalOpen) {
    return (
      <InstitutionPortalScreen
        institutions={institutions}
        activeInstitution={activeInstitution}
        students={students}
        activeLogoId={activeLogoId}
        onEnterInstitution={unlockPortalWithInstitution}
        onCreateAndEnterInstitution={(createdInst) => {
          handleAddInstitution(createdInst);
          unlockPortalWithInstitution(createdInst, 'password');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      <AcademyTransitionSplash
        visible={transitionSplash.visible}
        institutionName={transitionSplash.institutionName ?? (loginMode === 'institution' ? activeInstitution.name : undefined)}
        logoVariant={activeLogoId}
        subtitle={transitionSplash.subtitle || 'Doğruluk Akademi Çalışma Alanı Açılıyor'}
        gradeLabel={gradeProfile.shortLabel}
        onFinish={() => setTransitionSplash((prev) => ({ ...prev, visible: false }))}
      />
      <ThreeDotStudentModal
        open={studentPanelOpen}
        activeInstitution={activeInstitution}
        students={students}
        activeGradeId={gradeId}
        activeStudentNumber8={studentNumber}
        onClose={() => setStudentPanelOpen(false)}
        onAddStudent={handleAddStudent}
        onSelectStudent={handleSelectStudent}
        onDeleteStudent={handleDeleteStudent}
        onNavigateModule={handleTabNavigation}
      />
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
          mobileMenuOpen ? 'fixed inset-0 z-50 flex overflow-y-auto' : 'hidden'
        } lg:flex lg:w-64 lg:shrink-0 flex-col justify-between p-5 lg:relative lg:z-20`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          color: 'var(--text-sidebar)',
        }}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Logo3D
                size="sm"
                variant={activeLogoId}
                institutionName={loginMode === 'institution' ? activeInstitution.name : undefined}
              />
              <div className="min-w-0">
                <div className="font-display text-base font-extrabold tracking-tight truncate">
                  {loginMode === 'institution' ? activeInstitution.name : activeLogoPreset.headerTitle}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: 'var(--text-sidebar-muted)' }}
                >
                  {loginMode === 'institution'
                    ? `Kurum Girişi · Kod: ${activeInstitution.code8}`
                    : `Yönetici Ana Paneli · ${activeInstitution.name} · ${activeInstitution.code8}`}
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

            <button
              type="button"
              data-testid="sidebar-student-panel-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                setStudentPanelOpen(true);
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-between gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors bg-white/10 hover:bg-white/15 border border-white/15 mt-2"
            >
              <span className="inline-flex items-center gap-3">
                <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Öğrenci Paneli</span>
              </span>
              <span className="font-mono-num text-xs opacity-90">{instStudentsCount}</span>
            </button>
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
            {loginMode === 'institution' && (
              <div className="hidden sm:inline-flex shrink-0" data-testid="topbar-institution-logo">
                <Logo3D
                  size="sm"
                  variant={activeLogoId}
                  institutionName={activeInstitution.name}
                  animated={false}
                />
              </div>
            )}
            <div className="min-w-0">
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('dashboard');
                }}
                data-testid="topbar-brand-title"
                className="font-display text-base sm:text-lg font-extrabold tracking-tight whitespace-nowrap truncate block leading-tight"
              >
                {loginMode === 'institution' ? activeInstitution.name : activeLogoPreset.headerTitle}
              </a>
              <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                {loginMode === 'institution' ? (
                  <>
                    Kurum Girişi · Kod: <span className="font-mono-num">{activeInstitution.code8}</span>
                  </>
                ) : (
                  <>
                    Yönetici Ana Paneli (Şifresiz) · {activeInstitution.name} · Kod:{' '}
                    <span className="font-mono-num">{activeInstitution.code8}</span>
                  </>
                )}
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

          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
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
              className="btn-3d px-2.5 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-60"
            >
              {exportBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span className="hidden sm:inline">Hazırlanıyor...</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sm:hidden">ZIP</span>
                  <span className="hidden sm:inline">ZIP Paketi İndir</span>
                </>
              )}
            </button>

            {/* Üç Nokta (⋮) Genel Bakış & Modüller Menüsü (Mobil + Masaüstü) */}
            <div className="relative" ref={threeDotRef}>
              <button
                type="button"
                aria-label="Genel Bakış ve Modüller Menüsü"
                aria-expanded={threeDotOpen}
                aria-haspopup="menu"
                data-testid="three-dot-menu-btn"
                onClick={() => setThreeDotOpen((v) => !v)}
                className="btn-3d-secondary p-2 rounded-xl inline-flex items-center justify-center cursor-pointer"
                title="Genel Bakış & Tüm Modüller"
              >
                <MoreVertical className="w-4 h-4" aria-hidden="true" />
              </button>

              {threeDotOpen && (
                <div
                  role="menu"
                  data-testid="three-dot-modules-menu"
                  className="surface-card rounded-2xl p-2 w-72 max-w-[calc(100vw-2rem)] shadow-2xl absolute right-0 mt-2 z-50 space-y-1 border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div
                    className="px-2.5 py-2 border-b mb-1 flex items-center justify-between gap-2"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">Genel Bakış & Modüller</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {activeInstitution.name} · {activeInstitution.code8}
                      </div>
                    </div>
                  </div>

                  <div className="pb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      role="menuitem"
                      type="button"
                      data-testid="three-dot-student-panel-btn"
                      onClick={() => {
                        setThreeDotOpen(false);
                        setStudentPanelOpen(true);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-start gap-2.5 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Users
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: 'var(--accent-primary)' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="font-bold leading-tight truncate">
                          Öğrenci Ekleme &amp; Öğrenci Paneli
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {students.filter((s) => s.institutionId === activeInstitution.id).length} Öğrenci · Hızlı ekle, seç ve yönet
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
                    {threeDotQuickItems.map((item) => {
                      const Icon = item.icon;
                      const isCurrent =
                        activeTab === item.tab &&
                        (!item.omrMode || omrInitialMode === item.omrMode);
                      return (
                        <button
                          key={item.id}
                          role="menuitem"
                          type="button"
                          data-testid={`three-dot-item-${item.id}`}
                          onClick={() => handleTabNavigation(item.tab, item.omrMode)}
                          className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                            isCurrent ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="font-bold leading-tight truncate">{item.label}</div>
                            <div className="text-[10px] opacity-80 truncate">{item.sublabel}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      role="menuitem"
                      type="button"
                      data-testid="three-dot-switch-institution-btn"
                      onClick={handleOpenPortalSwitch}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Kurum Girişi / Değiştir</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Feedback Toast */}
        {toastMsg && (
          <div className="mx-5 mt-4 surface-card rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2 shadow-md">
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
            <span>{toastMsg}</span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-7 max-w-[1360px] w-full mx-auto space-y-5">
          {/* Ana Ekran Global Arama Çubuğu + Kuruma Özel Alan Barı */}
          <section
            aria-label="Ana Arama Çubuğu ve Kuruma Özel Alan"
            className="surface-card rounded-2xl p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 relative z-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {loginMode === 'institution' ? (
                  <div className="shrink-0" data-testid="banner-institution-logo">
                    <Logo3D
                      size="sm"
                      variant={activeLogoId}
                      institutionName={activeInstitution.name}
                      animated={false}
                      interactive={false}
                    />
                  </div>
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-extrabold truncate" data-testid="private-institution-banner">
                    {loginMode === 'institution'
                      ? `Kurum Girişi · ${activeInstitution.name}`
                      : `Yönetici Ana Paneli (Şifresiz) · Aktif Kurum: ${activeInstitution.name}`}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    Kod: <span className="font-mono-num font-bold">{activeInstitution.code8}</span> ·{' '}
                    {students.filter((s) => s.institutionId === activeInstitution.id).length} Öğrenci ·{' '}
                    {formatPenaltyRuleLabel(penaltyDivisor, true)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStudentPanelOpen(true)}
                  data-testid="topbar-student-panel-btn"
                  className="btn-3d px-3 py-2 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Öğrenci Paneli ({instStudentsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPortalSwitch}
                  data-testid="open-portal-btn"
                  className="btn-3d-secondary px-3 py-2 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{loginMode === 'institution' ? 'Kurum / Yönetici Değiştir' : 'Kurum Girişi / Değiştir'}</span>
                </button>
              </div>
            </div>

            {/* Global Arama Çubuğu */}
            <div className="relative w-full lg:max-w-md" ref={searchBoxRef}>
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                value={globalSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                data-testid="global-search-input"
                aria-label="Ana ekranda modül, özellik, öğrenci veya kurum ara"
                placeholder="Modül, 20 soru, açık uçlu, götürme ayarı veya öğrenci ara..."
                className="w-full rounded-xl pl-10 pr-8 py-2.5 text-xs sm:text-sm surface-alt focus:outline-2"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  aria-label="Aramayı temizle"
                  onClick={() => setGlobalSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}

              {searchFocused && (
                <div
                  data-testid="global-search-results"
                  className="surface-card rounded-2xl p-2.5 shadow-2xl absolute left-0 right-0 mt-2 z-50 border max-h-80 overflow-y-auto space-y-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {globalSearchResults.modules.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        Modüller ve Sayfalar
                      </div>
                      {globalSearchResults.modules.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          data-testid={`search-result-${mod.id}`}
                          onClick={() => {
                            if (mod.actionKind === 'open-portal') {
                              handleOpenPortalSwitch();
                            } else {
                              handleTabNavigation(mod.tab, mod.omrMode);
                            }
                            setGlobalSearchQuery('');
                            setSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                        >
                          <div className="font-bold">{mod.label}</div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {mod.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {globalSearchResults.students.length > 0 && (
                    <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        {activeInstitution.name} Öğrencileri
                      </div>
                      {globalSearchResults.students.map((stu) => (
                        <button
                          key={stu.id}
                          type="button"
                          onClick={() => {
                            handleSelectStudent(stu);
                            setActiveTab('dashboard');
                            setSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="font-bold truncate">
                            {stu.fullName} · {stu.classroom}
                          </span>
                          <span className="font-mono-num text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                            {stu.studentNumber8}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {globalSearchResults.institutions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        Kayıtlı Kurumlar
                      </div>
                      {globalSearchResults.institutions.map((inst) => (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => {
                            handleSelectInstitution(inst);
                            setSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="font-bold truncate">{inst.name}</span>
                          <span className="font-mono-num text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                            {inst.code8}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {globalSearchResults.modules.length === 0 &&
                    globalSearchResults.students.length === 0 &&
                    globalSearchResults.institutions.length === 0 && (
                      <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                        "{globalSearchQuery}" için eşleşen modül, öğrenci veya kurum bulunamadı.
                      </div>
                    )}
                </div>
              )}
            </div>
          </section>

          <div key={activeTab} className="academy-stage-enter space-y-5">
          {activeTab === 'dashboard' && (
            <DashboardView
              gradeProfile={gradeProfile}
              onSelectGrade={handleSelectGrade}
              penaltyDivisor={penaltyDivisor}
              onChangePenaltyDivisor={handleChangePenaltyDivisor}
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
              onUpdateInstitution={handleUpdateInstitution}
              onDeleteInstitution={handleDeleteInstitution}
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
              parentPhone={activeStudentParentPhone}
              initialMode={omrInitialMode}
              openEndedAnalysis={openEndedAnalysis}
              onSaveOpenEndedAnalysis={(res) => {
                setOpenEndedAnalysis(res);
                showToast(
                  `${res.studentName} için 10 soruluk açık uçlu kağıt analiz edildi (${res.totalScore}/${res.maxTotalScore}).`
                );
              }}
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
              penaltyDivisor={penaltyDivisor}
              onChangePenaltyDivisor={handleChangePenaltyDivisor}
              questions={questions}
              cover={cover}
              uploadedPdfName={uploadedPdfName}
              uploadedPdfPageCount={uploadedPdfPageCount}
              pdfStripOptions={pdfStripOptions}
              onUpdatePdfStripOptions={(patch) =>
                setPdfStripOptions((prev) => ({ ...prev, ...patch }))
              }
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
              onOpenOpenEnded={() => handleTabNavigation('omr', 'open-ended')}
            />
          )}

          {activeTab === 'editor' && (
            <ExamEditorView
              institution={activeInstitution}
              gradeProfile={gradeProfile}
              onSelectGrade={handleSelectGrade}
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
              penaltyDivisor={penaltyDivisor}
              onChangePenaltyDivisor={handleChangePenaltyDivisor}
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
              activeInstitutionId={activeInstitution.id}
              studentPhone={activeStudentParentPhone}
              calendarEvents={calendarEvents}
              openEndedAnalysis={openEndedAnalysis}
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
              onOpenOmr={() => handleTabNavigation('omr', 'omr')}
              onOpenOpenEndedTab={() => handleTabNavigation('omr', 'open-ended')}
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
                  pdfStripOptions,
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
              onDownloadSourceZip={handleDownloadSourceZip}
              academyName={activeInstitution.name}
              onToast={showToast}
            />
          )}

          {activeTab === 'sample' && (
            <SampleDemoPageView
              gradeProfile={gradeProfile}
              questionCount={questions.length}
              penaltyDivisor={penaltyDivisor}
              activeInstitution={activeInstitution}
              students={students}
              hasLiveAnalysis={hasLiveAnalysis}
              isSampleDemoActive={Boolean(cover.isSampleDemo)}
              analysis={analysis}
              onLoadDemoStudent={handleLoadDemoStudent}
              onResetCleanWorkspace={handleResetCleanWorkspace}
              onReturnToDashboard={() => handleTabNavigation('dashboard')}
              onOpenStudentPanel={() => setStudentPanelOpen(true)}
            />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
