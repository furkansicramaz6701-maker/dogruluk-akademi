export type GradeLevelId =
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'
  | 'TYT'
  | 'AYT-SAY'
  | 'AYT-EA'
  | 'AYT-SOZ';

export type AcademyThemeId =
  | 'klasik-lacivert'
  | 'gece-akademisi'
  | 'zumrut-kampus'
  | 'bordo-kolej'
  | 'okyanus-turkuaz'
  | 'kehribar-komur'
  | 'lavanta-indigo'
  | 'antrasit-minimal'
  | 'safir-bakir'
  | 'orman-zeytin';

export interface AcademyTheme {
  id: AcademyThemeId;
  name: string;
  subtitle: string;
  mode: 'light' | 'dark';
  swatches: [string, string, string];
  vars: {
    '--bg-canvas': string;
    '--bg-surface': string;
    '--bg-surface-alt': string;
    '--bg-sidebar': string;
    '--text-sidebar': string;
    '--text-sidebar-muted': string;
    '--border-subtle': string;
    '--text-primary': string;
    '--text-secondary': string;
    '--accent-primary': string;
    '--accent-primary-hover': string;
    '--accent-shadow': string;
    '--accent-contrast': string;
    '--accent-soft': string;
    '--chart-1': string;
    '--chart-2': string;
    '--chart-3': string;
    '--chart-4': string;
  };
}

export interface SubjectSpec {
  id: string;
  name: string;
  questionCount: number;
  topics: string[];
}

export type PenaltyDivisor = 0 | 3 | 4;

export interface GradeProfile {
  id: GradeLevelId;
  label: string;
  shortLabel: string;
  category: 'İlkokul' | 'Ortaokul & LGS' | 'Lise' | 'Üniversite Hazırlık (YKS)';
  examName: string;
  optionCount: 4 | 5;
  penaltyDivisor: PenaltyDivisor;
  durationMinutes: number;
  maxScore: number;
  baseScore: number;
  subjects: SubjectSpec[];
}

export type DifficultyLevel = 'Kolay' | 'Orta' | 'Zor';

export type QuestionSource =
  | 'Müfredat Havuzu'
  | 'İnternet Araştırması'
  | 'Ders Kitabı'
  | 'PDF Kitapçık';

export type QuestionVisualType = 'chart' | 'table' | 'math' | 'image';

export type EnglishScenePresetId =
  | 'weather'
  | 'daily-routine'
  | 'classroom-objects'
  | 'food-menu'
  | 'city-directions';

export interface QuestionVisualSpec {
  type: QuestionVisualType;
  title: string;
  caption?: string;
  bars?: Array<{ label: string; value: number }>;
  yAxisLabel?: string;
  headers?: string[];
  rows?: string[][];
  formula?: string;
  steps?: string[];
  geometryShape?: 'triangle' | 'rectangle' | 'circle' | 'fraction' | 'none';
  imageDataUrl?: string;
  scenePresetId?: EnglishScenePresetId;
  sceneLabels?: string[];
}

export interface PdfUploadStripOptions {
  stripFrontCover: boolean;
  stripBackCover: boolean;
  appendBrandedBackPage: boolean;
}

export interface ExamQuestion {
  id: string;
  number: number;
  subject: string;
  topic: string;
  gainCode: string;
  difficulty: DifficultyLevel;
  stem: string;
  options: Record<string, string>;
  correctOption: string;
  explanation: string;
  source: QuestionSource;
  sourceUrl?: string;
  visual?: QuestionVisualSpec;
}

export type LogoStyleId =
  | 'akademi-kalkani'
  | 'zumrut-mesale'
  | 'kraliyet-armasi'
  | 'futuristik-prizma'
  | 'kurumsal-muhur';

export interface LogoPreset {
  id: LogoStyleId;
  name: string;
  headerTitle: string;
  headerSubtitle: string;
  primaryColor: string;
  secondaryColor: string;
  goldColor: string;
}

export type InstitutionRole =
  | 'Kurum Yöneticisi'
  | 'Ölçme Uzmanı'
  | 'Öğretmen'
  | 'Görüntüleyici';

export type AllowedScopeId = 'ilkokul' | 'ortaokul' | 'lise' | 'yks';

export type AppPermissionKey =
  | 'omrOkuma'
  | 'denemeUretici'
  | 'dinamikKaynak'
  | 'denemeEditoru'
  | 'egitimTakvimi'
  | 'karnePdf'
  | 'excelAktarim'
  | 'afis3D';

export interface InstitutionPermissions {
  status: 'Aktif' | 'Askıda';
  role: InstitutionRole;
  maxStudents: number;
  allowedScopes: AllowedScopeId[];
  modules: Record<AppPermissionKey, boolean>;
}

export interface Institution {
  id: string;
  name: string;
  code8: string;
  city: string;
  createdAt: string;
  accessPassword?: string;
  permissions?: InstitutionPermissions;
}

export interface StudentRecord {
  id: string;
  fullName: string;
  studentNumber8: string;
  institutionId: string;
  institutionCode8: string;
  institutionName: string;
  classroom: string;
  gradeId: GradeLevelId;
  parentPhone?: string;
  createdAt: string;
  lastOmrAnswers?: string;
  lastAnswerKey?: string;
  lastExamTitle?: string;
  lastEvaluatedAt?: string;
}

export type BookletCode = 'A' | 'B' | 'C' | 'D';

export type CoverColorThemeId =
  | 'otomatik-abcd'
  | 'kurum-temasi'
  | 'lacivert-altin'
  | 'zumrut-gumus'
  | 'bordo-kehribar'
  | 'turkuaz-bakir'
  | 'indigo-lavanta';

export interface StudentBookletAssignment {
  index: number;
  studentName: string;
  studentNumber8: string;
  classroom: string;
  gradeLabel: string;
  bookletCode: BookletCode;
  bookletNumber: string;
  answerKey: string;
}

export interface CoverConfig {
  academyName: string;
  institutionCode8?: string;
  logoStyleId?: LogoStyleId;
  examTitle: string;
  subtitle: string;
  gradeLabel?: string;
  bookletCode: BookletCode;
  bookletNumber?: string;
  coverColorThemeId?: CoverColorThemeId;
  signatureName: string;
  signatureTitle: string;
  securityNotice: string;
  examDate: string;
  durationMinutes: number;
  questionCount: number;
  reminders: string[];
  isSampleDemo?: boolean;
  penaltyRuleLabel?: string;
}

export interface QuestionEvaluation {
  number: number;
  subject: string;
  topic: string;
  gainCode: string;
  difficulty: DifficultyLevel;
  studentAnswer: string | null;
  correctAnswer: string;
  status: 'dogru' | 'yanlis' | 'bos';
  errorType?: 'Bilgi Eksikliği' | 'Çeldiriciye Düşme' | 'Dikkat Hatası' | 'Süre / Boş';
}

export interface SubjectMetrics {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  net: number;
  accuracyPct: number;
  classAvgNet: number;
  academyAvgNet: number;
  turkeyAvgNet: number;
}

export interface TopicGapMetric {
  subject: string;
  topic: string;
  gainCode: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  masteryPct: number;
  status: 'Tam Hakimiyet' | 'Geliştirilmeli' | 'Kritik Eksik';
}

export interface DifficultyMetric {
  difficulty: DifficultyLevel;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  successPct: number;
}

export interface HistoricalExamPoint {
  examName: string;
  date: string;
  net: number;
  score: number;
  academyAvgNet: number;
}

export interface ExamAnalysisResult {
  studentName: string;
  studentNumber: string;
  classroom: string;
  examTitle: string;
  gradeId: GradeLevelId;
  penaltyDivisor: PenaltyDivisor;
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  totalNet: number;
  estimatedScore: number;
  maxScore: number;
  percentile: number;
  classRank: number;
  classSize: number;
  academyRank: number;
  academySize: number;
  subjectMetrics: SubjectMetrics[];
  topicGaps: TopicGapMetric[];
  difficultyMetrics: DifficultyMetric[];
  optionDistribution: Record<string, { student: number; key: number }>;
  errorBreakdown: Record<string, number>;
  questionDetails: QuestionEvaluation[];
  historicalTrend: HistoricalExamPoint[];
  projectedScore: number;
  projectedNet: number;
  aiCoachSummary?: string;
}

export type ReportCardType =
  | 'genel-basari'
  | 'ders-kazanim'
  | 'ai-koc'
  | 'sinif-kurum'
  | 'zaman-strateji';

export type DetailedAnalysisType =
  | 'kazanim-eksikligi'
  | 'celdirici-hata'
  | 'gelisim-projeksiyon';

export type CalendarEventType =
  | 'deneme-sinavi'
  | 'telafi-etutu'
  | 'veli-bilgilendirme'
  | 'kamp-programi';

export interface EducationCalendarEvent {
  id: string;
  institutionId: string;
  title: string;
  date: string;
  time: string;
  gradeId: GradeLevelId;
  type: CalendarEventType;
  classroom: string;
  note: string;
  completed?: boolean;
}

export type RecommendationCategory =
  | 'Sınav & Editör'
  | 'Öğrenci Telafi'
  | 'Eğitim Takvimi'
  | 'Kurum Büyüme';

export interface SmartRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  impactLabel: string;
  actionLabel: string;
  actionType:
    | 'apply-balanced-exam'
    | 'apply-hard-exam'
    | 'add-calendar-remedial'
    | 'open-editor'
    | 'open-calendar'
    | 'open-poster'
    | 'open-reports'
    | 'download-zip';
  payload?: {
    topic?: string;
    subject?: string;
  };
}

export interface DynamicCurriculumOverride {
  sourceName: string;
  gradeId: GradeLevelId;
  subjects: { name: string; topics: string[]; questionCount: number }[];
  extractedAt: string;
  pageCount?: number;
}

export interface DynamicSourceMix {
  curriculumPool: number;
  mebPdf: number;
  internetSearch: number;
  textbookBank: number;
}

export type WeeklyQuestionPreset = 20 | 40 | 50 | 60 | 80 | 90 | 120;

export interface WeeklyExamMeta {
  id: string;
  name: string;
  date: string;
  questionCount: WeeklyQuestionPreset | number;
  gradeId: GradeLevelId;
}

export interface WeeklyStudentScore {
  studentId: string;
  studentName: string;
  studentNumber8: string;
  classroom: string;
  parentPhone?: string;
  kts1Correct: number;
  kts1Wrong: number;
  kts1Blank: number;
  kts2Correct: number;
  kts2Wrong: number;
  kts2Blank: number;
  weakTopicNote?: string;
}

export type WeeklyPerformanceStatus =
  | 'Üstün Başarı'
  | 'İyi Gelişim'
  | 'Destek Gerekiyor'
  | 'Çalışması Gerekiyor';

export type ParentMessageTemplateMode =
  | 'auto'
  | 'top3-celebration'
  | 'progress-update'
  | 'study-alert'
  | 'short-sms'
  | 'written-prep-20'
  | 'open-ended-10';

export interface CustomParentMessageTemplate {
  id: string;
  name: string;
  category: 'genel' | 'yazili-20' | 'acik-uclu-10' | 'etut';
  body: string;
}

export interface OpenEndedQuestion {
  id: string;
  number: number;
  subject: string;
  topic: string;
  maxPoints: number;
  prompt: string;
  modelAnswer: string;
  keywords: string[];
}

export interface OpenEndedQuestionGrade {
  number: number;
  subject: string;
  score: number;
  maxPoints: number;
  status: 'tam' | 'kismi' | 'yanlis' | 'bos';
  studentAnswerSummary: string;
  feedback: string;
}

export interface OpenEndedPaperAnalysis {
  id: string;
  studentName: string;
  studentNumber: string;
  classroom: string;
  examTitle: string;
  gradeId: GradeLevelId;
  totalScore: number;
  maxTotalScore: number;
  successPct: number;
  developmentStatus: WeeklyPerformanceStatus;
  overallFeedback: string;
  questionGrades: OpenEndedQuestionGrade[];
  evaluatedAt: string;
}

export type WeeklySortKey = 'rank' | 'kts1' | 'kts2' | 'delta';

export type WeeklyStatusFilter =
  | 'all'
  | 'top3'
  | 'Üstün Başarı'
  | 'İyi Gelişim'
  | 'needs-support';

export type WeeklyBulkFilterMode = 'all' | 'top3' | 'needs-support';

export interface WeeklyComparisonRow {
  rank: number;
  top3Badge: 1 | 2 | 3 | null;
  studentId: string;
  studentName: string;
  studentNumber8: string;
  classroom: string;
  parentPhone?: string;
  kts1Net: number;
  kts1Score: number;
  kts2Net: number;
  kts2Score: number;
  netDelta: number;
  scoreDelta: number;
  successPct: number;
  status: WeeklyPerformanceStatus;
  focusAdvice: string;
  weakTopicNote?: string;
}

export interface WeeklyCohortInsights {
  totalStudents: number;
  avgKts1Score: number;
  avgKts2Score: number;
  avgScoreDelta: number;
  avgSuccessPct: number;
  topPerformer: WeeklyComparisonRow | null;
  risingStar: WeeklyComparisonRow | null;
  needsSupportCount: number;
  highAchieverCount: number;
}

export type ActiveTab =
  | 'dashboard'
  | 'weekly'
  | 'omr'
  | 'generator'
  | 'editor'
  | 'calendar'
  | 'reports'
  | 'poster'
  | 'drive'
  | 'sample';

