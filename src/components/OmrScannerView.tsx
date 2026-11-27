import { useState, useEffect, useMemo, useRef, ChangeEvent } from 'react';
import {
  Camera,
  FileKey2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  FileText,
  Users,
  BookOpen,
  Shuffle,
  FileDown,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  UserPlus,
  Search,
  Crop,
  ShieldCheck,
} from 'lucide-react';
import {
  BookletCode,
  BookletDistributionPattern,
  CoverConfig,
  ExamAnalysisResult,
  ExamQuestion,
  ExamSourceMode,
  ExternalPublisherExamConfig,
  ExternalPublisherExamPreset,
  GradeLevelId,
  GradeProfile,
  Institution,
  OpenEndedPaperAnalysis,
  OpenEndedQuestion,
  PenaltyDivisor,
  PrizeExamDefinition,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';
import { getGradeProfile, GRADE_PROFILES } from '../data/curriculum';
import { getLogoPreset } from '../data/logos';
import {
  BOOKLET_CODES,
  getBookletCycleCodes,
  normalizeBookletNumber,
  normalizeExternalAnswerKeyString,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import { defaultClassroomForGrade } from '../utils/excelExport';
import { parseCombinedExternalAnswerKeysText } from '../utils/externalPublisherLibrary';
import {
  generateSampleOmrPair,
  parseAnswerString,
  parseAnswerStringWithQrPreCheck,
} from '../utils/examAnalysis';
import {
  deriveBookletAnswerKeysFromBase,
  downloadOmrExcelTemplate,
  ImportedOmrStudentRow,
  parseOmrExcelOrCsvBuffer,
} from '../utils/omrSpreadsheet';
import { buildStudentRecordForInstitution } from '../utils/studentPanel';
import {
  formatPrizeExamGradesLabel,
  resolvePrizeExamGrades,
  resolveTargetGradeForPrizeActivation,
} from '../utils/institutionRankings';
import {
  analyzeOmrResponseValidation,
  countDistinctErrorRows,
  inspectAnswerStringReadability,
  OMR_ERROR_CATEGORY_LABELS,
  OmrScanErrorItem,
  OmrScanErrorReport,
  validateManualOmrInputs,
} from '../utils/omrValidation';
import {
  isImageUploadFile,
} from '../utils/opticalRegionEditor';
import {
  normalizeDetectedAnswersString,
  prepareImageForOmrUpload,
  resolveTargetKeyBooklet,
  safeParseOmrApiResponse,
} from '../utils/omrImagePrep';
import { parseDigitalKarneQuery } from '../utils/digitalKarneQr';
import {
  decodeTeacherAnalysisQrToken,
  DualQrScanResult,
  extractBothQrCodesFromImageFile,
} from '../utils/qrKeyIntegration';
import { ExternalPublisherHub } from './ExternalPublisherHub';
import { OmrErrorReportModal } from './OmrErrorReportModal';
import { OmrValidationSummaryCard } from './OmrValidationSummaryCard';
import { OpenEndedPaperPanel } from './OpenEndedPaperPanel';
import { OpticalFormPreview } from './OpticalFormPreview';
import { QrKeyIntegrationPanel } from './QrKeyIntegrationPanel';
import {
  OpticalRegionEditorModal,
  UploadedKeyImageAsset,
} from './OpticalRegionEditorModal';

interface OmrScannerViewProps {
  institutionId: string;
  institutionName: string;
  activeInstitution?: Institution;
  gradeProfile: GradeProfile;
  questions: ExamQuestion[];
  studentAnswersRaw: string;
  answerKeyRaw: string;
  studentName: string;
  studentNumber: string;
  classroom: string;
  penaltyDivisor: PenaltyDivisor;
  analysis: ExamAnalysisResult;
  cover: CoverConfig;
  institutionCode8: string;
  parentPhone?: string;
  students?: StudentRecord[];
  batchAssignments?: StudentBookletAssignment[];
  examSourceMode?: ExamSourceMode;
  externalPublisherConfig?: ExternalPublisherExamConfig;
  publisherPresets?: ExternalPublisherExamPreset[];
  activePublisherPresetId?: string | null;
  exportBusy?: boolean;
  onChangeGradeProfile?: (gradeId: GradeLevelId) => void;
  onAddStudent?: (student: StudentRecord) => void;
  onChangeStudentBooklet?: (studentId: string, bookletCode: BookletCode) => void;
  onChangeExamSourceMode?: (mode: ExamSourceMode) => void;
  onUpdateExternalPublisher?: (patch: Partial<ExternalPublisherExamConfig>) => void;
  onSelectPublisherPreset?: (preset: ExternalPublisherExamPreset) => void;
  onSavePublisherPreset?: (asNew?: boolean) => void;
  onDeletePublisherPreset?: (presetId: string) => void;
  onOpenGoogleFormsPanel?: () => void;
  onAutoAssignRegisteredStudents?: (opts?: {
    includeAllGrades?: boolean;
    distributionPattern?: BookletDistributionPattern;
  }) => void;
  onSelectBookletVariant?: (
    code: BookletCode,
    opts?: {
      bookletNumber?: string;
      studentName?: string;
      studentNumber?: string;
      classroom?: string;
      autoSyncAnswerKey?: boolean;
    }
  ) => void;
  onUpdateCover?: (patch: Partial<CoverConfig>) => void;
  initialMode?: 'omr' | 'open-ended';
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  externalOpenEndedQuestions?: OpenEndedQuestion[] | null;
  onSyncOpenEndedQuestions?: (next: OpenEndedQuestion[]) => void;
  onSaveOpenEndedAnalysis?: (result: OpenEndedPaperAnalysis) => void;
  baseQuestions?: ExamQuestion[];
  bookletOrderSeed?: number;
  onImportOmrStudents?: (rows: ImportedOmrStudentRow[]) => void;
  onUpdateOmrState: (patch: {
    studentAnswersRaw?: string;
    answerKeyRaw?: string;
    studentName?: string;
    studentNumber?: string;
    classroom?: string;
    penaltyDivisor?: PenaltyDivisor;
  }) => void;
  onEvaluateNow: (override?: {
    studentAnswersRaw?: string;
    answerKeyRaw?: string;
    studentNumber?: string;
  }) => void;
  onGoToReports: () => void;
  onDownloadOpticalPdf: (
    targetCode?: BookletCode,
    customBookletNumber?: string,
    overrideStudent?: { studentName?: string; studentNumber8?: string; classroom?: string }
  ) => Promise<void>;
  onDownloadAllOpticalPdf?: () => Promise<void>;
  onDownloadAllOpticalZip?: () => Promise<void>;
  onDownloadRegisteredOpticalPdf?: () => Promise<void>;
  prizeExams?: PrizeExamDefinition[];
  activePrizeExamId?: string | null;
  onSelectActivePrizeExamId?: (id: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Görsel okunamadı.'));
    reader.readAsDataURL(file);
  });
}

export function OmrScannerView({
  institutionId,
  institutionName,
  activeInstitution,
  gradeProfile,
  questions,
  studentAnswersRaw,
  answerKeyRaw,
  studentName,
  studentNumber,
  classroom,
  penaltyDivisor,
  analysis,
  cover,
  institutionCode8,
  parentPhone,
  students = [],
  batchAssignments = [],
  examSourceMode = 'kurum',
  externalPublisherConfig = {
    publisherName: '',
    examTitle: '',
    answerKeys: { A: '', B: '', C: '', D: '' },
  },
  publisherPresets = [],
  activePublisherPresetId = null,
  exportBusy = false,
  onChangeGradeProfile,
  onAddStudent,
  onChangeStudentBooklet,
  onChangeExamSourceMode,
  onUpdateExternalPublisher,
  onSelectPublisherPreset,
  onSavePublisherPreset,
  onDeletePublisherPreset,
  onOpenGoogleFormsPanel,
  onAutoAssignRegisteredStudents,
  onSelectBookletVariant,
  onUpdateCover,
  initialMode = 'omr',
  openEndedAnalysis = null,
  externalOpenEndedQuestions = null,
  onSyncOpenEndedQuestions,
  onSaveOpenEndedAnalysis,
  baseQuestions,
  bookletOrderSeed = 0,
  onImportOmrStudents,
  onUpdateOmrState,
  onEvaluateNow,
  onGoToReports,
  onDownloadOpticalPdf,
  onDownloadAllOpticalPdf,
  onDownloadAllOpticalZip,
  onDownloadRegisteredOpticalPdf,
  prizeExams = [],
  activePrizeExamId = null,
  onSelectActivePrizeExamId,
}: OmrScannerViewProps) {
  const [scannerMode, setScannerMode] = useState<'omr' | 'open-ended'>(initialMode);
  const [loadingMode, setLoadingMode] = useState<'student' | 'key' | 'excel' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [includeAllGrades, setIncludeAllGrades] = useState<boolean>(true);
  const [studentFilterQuery, setStudentFilterQuery] = useState<string>('');
  const [showQuickAddStudent, setShowQuickAddStudent] = useState<boolean>(false);
  const [quickStuName, setQuickStuName] = useState<string>('');
  const [quickStuGradeId, setQuickStuGradeId] = useState<GradeLevelId>(gradeProfile.id);
  const [quickStuClass, setQuickStuClass] = useState<string>(defaultClassroomForGrade(gradeProfile.id));
  const [quickStuBooklet, setQuickStuBooklet] = useState<BookletCode>('A');
  const [registeredPattern, setRegisteredPattern] = useState<BookletDistributionPattern>('AB');
  const [autoAnalyzeOnPhoto, setAutoAnalyzeOnPhoto] = useState<boolean>(true);
  const [lastExcelSummary, setLastExcelSummary] = useState<string | null>(null);
  const [errorReport, setErrorReport] = useState<OmrScanErrorReport | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState<boolean>(false);
  const [uploadedKeyImage, setUploadedKeyImage] = useState<UploadedKeyImageAsset | null>(null);
  const [regionEditorOpen, setRegionEditorOpen] = useState<boolean>(false);
  const [regionEditorBooklet, setRegionEditorBooklet] = useState<BookletCode>(cover.bookletCode);
  const [regionEditorLoading, setRegionEditorLoading] = useState<boolean>(false);
  const [regionEditorError, setRegionEditorError] = useState<string | null>(null);
  const [lastImageQrMeta, setLastImageQrMeta] = useState<{
    detectedQrUrl?: string;
    detectedStudentNumber?: string;
  } | null>(null);

  useEffect(() => {
    setScannerMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setQuickStuGradeId(gradeProfile.id);
    setQuickStuClass(defaultClassroomForGrade(gradeProfile.id));
  }, [gradeProfile.id]);

  const activePattern: BookletDistributionPattern =
    examSourceMode === 'farkli-yayin'
      ? externalPublisherConfig.bookletMode ?? 'AB'
      : registeredPattern;
  const visibleBooklets = getBookletCycleCodes(activePattern);

  const selectedSubjectId = externalPublisherConfig?.selectedSubjectId ?? 'all';
  const selectedSubjectObj = useMemo(
    () =>
      selectedSubjectId !== 'all'
        ? gradeProfile.subjects.find((s) => s.id === selectedSubjectId)
        : undefined,
    [gradeProfile.subjects, selectedSubjectId]
  );

  const expectedCount =
    questions.length > 0
      ? questions.length
      : externalPublisherConfig?.questionCount && externalPublisherConfig.questionCount > 0
        ? externalPublisherConfig.questionCount
        : gradeProfile.subjects.reduce((sum, s) => sum + s.questionCount, 0);
  const studentAnswersTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const allInstStudents = useMemo(
    () => students.filter((s) => s.institutionId === institutionId),
    [students, institutionId]
  );
  const sameGradeStudentsCount = allInstStudents.filter(
    (s) => s.gradeId === gradeProfile.id
  ).length;
  const normalizedSearch = studentFilterQuery.trim().toLocaleLowerCase('tr-TR');
  const institutionStudents = allInstStudents.filter((s) => {
    if (!includeAllGrades && s.gradeId !== gradeProfile.id) return false;
    if (!normalizedSearch) return true;
    return (
      s.fullName.toLocaleLowerCase('tr-TR').includes(normalizedSearch) ||
      s.studentNumber8.includes(normalizedSearch) ||
      s.classroom.toLocaleLowerCase('tr-TR').includes(normalizedSearch)
    );
  });
  const allInstStudentsCount = allInstStudents.length;

  const { answers: parsedStudent, preCheck: qrPreCheckResult } = useMemo(
    () =>
      parseAnswerStringWithQrPreCheck(
        studentAnswersRaw,
        expectedCount,
        gradeProfile.optionCount,
        {
          subjectName: selectedSubjectObj?.name,
          expectedStudentNumber: studentNumber,
          expectedStudentName: studentName,
          expectedInstitutionCode: institutionCode8,
          students: allInstStudents,
          detectedQrUrl: lastImageQrMeta?.detectedQrUrl,
          detectedStudentNumber: lastImageQrMeta?.detectedStudentNumber,
        }
      ),
    [
      studentAnswersRaw,
      expectedCount,
      gradeProfile.optionCount,
      selectedSubjectObj?.name,
      studentNumber,
      studentName,
      institutionCode8,
      allInstStudents,
      lastImageQrMeta,
    ]
  );

  const parsedKey = parseAnswerString(
    answerKeyRaw,
    expectedCount,
    gradeProfile.optionCount,
    { subjectName: selectedSubjectObj?.name }
  );

  const validationSummary = useMemo(
    () =>
      analyzeOmrResponseValidation({
        studentNumber,
        studentAnswersRaw,
        answerKeyRaw,
        expectedCount,
        optionCount: gradeProfile.optionCount,
        subjectName: selectedSubjectObj?.name,
      }),
    [
      studentNumber,
      studentAnswersRaw,
      answerKeyRaw,
      expectedCount,
      gradeProfile.optionCount,
      selectedSubjectObj?.name,
    ]
  );

  const applyParsedSpreadsheet = (buf: ArrayBuffer, fileName: string, targetFocus?: 'student' | 'key') => {
    const parsed = parseOmrExcelOrCsvBuffer(buf, {
      expectedCount,
      optionCount: gradeProfile.optionCount,
      activeBookletCode: cover.bookletCode,
      fallbackGradeId: gradeProfile.id,
      institution: {
        id: institutionId,
        name: institutionName,
        code8: institutionCode8,
        city: '',
        createdAt: '',
      },
      existingStudents: students,
      baseQuestions,
      orderSeed: bookletOrderSeed,
      autoDeriveMissingBooklets: true,
    });

    const hasKeys = Object.values(parsed.answerKeysByBooklet).some((v) => Boolean(v && v.length > 0));
    if (hasKeys && onUpdateExternalPublisher) {
      onUpdateExternalPublisher({
        answerKeys: {
          ...externalPublisherConfig.answerKeys,
          ...parsed.answerKeysByBooklet,
        },
      });
    }
    if (parsed.hasExplicitMultiBookletKeys && examSourceMode !== 'farkli-yayin') {
      onChangeExamSourceMode?.('farkli-yayin');
    }

    if (parsed.importedStudents.length > 0) {
      onImportOmrStudents?.(parsed.importedStudents);
    }

    const firstWithAnswers =
      parsed.importedStudents.find((s) => s.studentAnswersRaw.length > 0) ?? parsed.importedStudents[0];

    const nextStudentAns =
      targetFocus === 'key'
        ? studentAnswersRaw
        : parsed.studentAnswersRaw || studentAnswersRaw;
    const nextAnswerKey =
      targetFocus === 'student'
        ? parsed.answerKeyRaw || answerKeyRaw
        : parsed.answerKeyRaw || answerKeyRaw;

    if (firstWithAnswers && targetFocus !== 'key') {
      onUpdateOmrState({
        studentName: firstWithAnswers.fullName,
        studentNumber: firstWithAnswers.studentNumber8,
        classroom: firstWithAnswers.classroom,
        studentAnswersRaw: nextStudentAns,
        answerKeyRaw: nextAnswerKey,
      });
      onUpdateCover?.({
        bookletCode: firstWithAnswers.bookletCode,
        bookletNumber: firstWithAnswers.bookletNumber,
      });
    } else {
      onUpdateOmrState({
        ...(parsed.studentAnswersRaw && targetFocus !== 'key'
          ? { studentAnswersRaw: parsed.studentAnswersRaw }
          : {}),
        ...(parsed.answerKeyRaw && targetFocus !== 'student'
          ? { answerKeyRaw: parsed.answerKeyRaw }
          : {}),
      });
    }

    const msg = `${fileName}: ${parsed.summaryMessage}`;
    setLastExcelSummary(msg);
    setStatusMessage(msg);

    if (parsed.errors.length > 0) {
      const report: OmrScanErrorReport = {
        sourceName: fileName,
        scannedAt: new Date().toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        totalRowsChecked: parsed.totalRowsChecked,
        validRowsCount: Math.max(0, parsed.totalRowsChecked - countDistinctErrorRows(parsed.errors)),
        errors: parsed.errors,
      };
      setErrorReport(report);
      setErrorModalOpen(true);
      setErrorMsg(
        `${fileName}: ${parsed.errors.length} satırda geçersiz öğrenci numarası veya okunmayan cevap tespit edildi.`
      );
    } else {
      setErrorReport(null);
      setErrorModalOpen(false);
      setErrorMsg(null);
    }

    const hasReadableStudentMarks =
      parseAnswerString(nextStudentAns, expectedCount, gradeProfile.optionCount).some(Boolean);
    const hasReadableKeyMarks =
      parseAnswerString(nextAnswerKey, expectedCount, gradeProfile.optionCount).some(Boolean);

    if (autoAnalyzeOnPhoto && hasReadableStudentMarks && hasReadableKeyMarks) {
      onEvaluateNow({
        studentAnswersRaw: nextStudentAns,
        answerKeyRaw: nextAnswerKey,
        studentNumber: firstWithAnswers?.studentNumber8 ?? studentNumber,
      });
    }
  };

  const handleExcelBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMessage(null);
    setLoadingMode('excel');
    try {
      const buf = await file.arrayBuffer();
      applyParsedSpreadsheet(buf, file.name);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Excel/CSV dosyası okunamadı: ${err.message}`
          : 'Excel/CSV dosyası işlenemedi.'
      );
    } finally {
      setLoadingMode(null);
      e.target.value = '';
    }
  };

  const processSingleUploadedFile = async (
    file: File,
    mode: 'student' | 'key',
    explicitBookletCode?: BookletCode
  ) => {
    setErrorMsg(null);
    setStatusMessage(null);

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
        const buf = await file.arrayBuffer();
        applyParsedSpreadsheet(buf, file.name, mode);
        return;
      }

      if (
        file.type.startsWith('text/') ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.json')
      ) {
        const text = await file.text();
        let extracted = text;
        if (lowerName.endsWith('.json')) {
          try {
            const json = JSON.parse(text);
            if (Array.isArray(json.questions)) {
              extracted = json.questions
                .map((q: { correctOption?: string }) => q.correctOption ?? '-')
                .join('');
            } else if (typeof json.answers === 'string') {
              extracted = json.answers;
            }
          } catch {
            // fallback to raw text
          }
        }
        if (mode === 'student') {
          onUpdateOmrState({ studentAnswersRaw: extracted });
          const validationReport = validateManualOmrInputs({
            sourceName: file.name,
            studentName,
            studentNumber,
            studentAnswersRaw: extracted,
            optionCount: gradeProfile.optionCount,
            requireStudentAnswers: true,
            validateAnswerKey: false,
          });
          if (validationReport.errors.length > 0) {
            setErrorReport(validationReport);
            setErrorModalOpen(true);
            setErrorMsg(
              `${file.name}: ${validationReport.errors.length} satırda geçersiz öğrenci numarası veya okunmayan cevap tespit edildi.`
            );
          } else {
            setErrorReport(null);
            setErrorModalOpen(false);
            setStatusMessage(`${file.name} dosyasından öğrenci optiği okundu.`);
            if (autoAnalyzeOnPhoto && extracted.trim() && answerKeyRaw.trim()) {
              onEvaluateNow({ studentAnswersRaw: extracted, answerKeyRaw });
            }
          }
        } else {
          const validationReport = validateManualOmrInputs({
            sourceName: file.name,
            studentAnswersRaw: '',
            answerKeyRaw: extracted,
            optionCount: gradeProfile.optionCount,
            requireStudentAnswers: false,
            validateAnswerKey: true,
          });
          const targetTxtBooklet = explicitBookletCode ?? cover.bookletCode;
          const derived = deriveBookletAnswerKeysFromBase(
            extracted,
            gradeProfile.optionCount,
            baseQuestions,
            bookletOrderSeed
          );
          onUpdateOmrState({ answerKeyRaw: extracted });
          if (onUpdateExternalPublisher) {
            onUpdateExternalPublisher({
              answerKeys: {
                ...externalPublisherConfig.answerKeys,
                ...(targetTxtBooklet === 'A'
                  ? derived
                  : {
                      [targetTxtBooklet]: normalizeExternalAnswerKeyString(
                        extracted,
                        gradeProfile.optionCount
                      ),
                    }),
              },
            });
          }
          if (validationReport.errors.length > 0) {
            setErrorReport(validationReport);
            setErrorModalOpen(true);
            setErrorMsg(
              `${file.name}: Cevap anahtarı dosyasında ${validationReport.errors.length} hatalı/okunmayan satır bulundu.`
            );
          } else {
            setErrorReport(null);
            setErrorModalOpen(false);
            setStatusMessage(
              `${file.name} dosyasından ${targetTxtBooklet} kitapçığı cevap anahtarı okundu.`
            );
            if (autoAnalyzeOnPhoto && studentAnswersRaw.trim() && extracted.trim()) {
              onEvaluateNow({ studentAnswersRaw, answerKeyRaw: extracted });
            }
          }
        }
        return;
      }

      if (mode === 'key' && isImageUploadFile(file)) {
        try {
          const dataUrl = await fileToDataUrl(file);
          setUploadedKeyImage({
            dataUrl,
            fileName: file.name,
            mimeType: file.type || 'image/png',
          });
          setRegionEditorBooklet(explicitBookletCode ?? cover.bookletCode);
        } catch {
          // Non-fatal; continue with upload
        }
      }

      setLoadingMode(mode);
      setErrorMsg(null);
      let dualQrResult: DualQrScanResult | null = null;
      if (mode === 'student' && isImageUploadFile(file)) {
        try {
          dualQrResult = await extractBothQrCodesFromImageFile(file, {
            preferredInstitutionCode8: institutionCode8,
            candidateInstCodes: [institutionCode8],
          });
        } catch {
          dualQrResult = null;
        }
      }

      const prepared = await prepareImageForOmrUpload(file, 1600, 0.86);
      const intendedTargetBooklet =
        mode === 'key' ? explicitBookletCode ?? cover.bookletCode : undefined;

      const sendOmrParseRequest = async (imgPrepared: { base64: string; mimeType: string }) => {
        const resp = await fetch('/api/omr/parse-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: imgPrepared.base64,
            fileMimeType: imgPrepared.mimeType,
            mode,
            expectedCount,
            optionCount: gradeProfile.optionCount,
            targetBooklet: intendedTargetBooklet,
            subjectName: selectedSubjectObj?.name || '',
          }),
        });
        const rawText = await resp.text();
        return safeParseOmrApiResponse(resp.status, rawText);
      };

      let parsedApi = await sendOmrParseRequest(prepared);
      if (!parsedApi.ok && isImageUploadFile(file)) {
        const lighter = await prepareImageForOmrUpload(file, 1080, 0.72);
        parsedApi = await sendOmrParseRequest(lighter);
      }
      if (!parsedApi.ok) {
        throw new Error(parsedApi.error || 'Optik dosya okunamadı.');
      }

      const decodedAnalysisQr =
        (dualQrResult?.decodedAnalysis?.valid ? dualQrResult.decodedAnalysis : undefined) ??
        (parsedApi.detectedAnalysisQr
          ? decodeTeacherAnalysisQrToken(parsedApi.detectedAnalysisQr, institutionCode8, [
              institutionCode8,
            ])
          : undefined);
      const qrPayload =
        decodedAnalysisQr && decodedAnalysisQr.valid && decodedAnalysisQr.payload && !decodedAnalysisQr.institutionMismatch
          ? decodedAnalysisQr.payload
          : undefined;

      const detectedCode = qrPayload?.bookletCode ?? parsedApi.bookletCode ?? null;
      const targetBooklet =
        mode === 'key'
          ? resolveTargetKeyBooklet({
              explicitBookletCode,
              detectedBookletCode: detectedCode,
              activeBookletCode: cover.bookletCode,
            })
          : detectedCode ?? cover.bookletCode;
      if (targetBooklet !== cover.bookletCode) {
        onUpdateCover?.({ bookletCode: targetBooklet });
      }

      const effectiveQrUrl = dualQrResult?.karneQrUrl || parsedApi.detectedQrUrl;
      const parsedQr = effectiveQrUrl
        ? parseDigitalKarneQuery(
            effectiveQrUrl.includes('?')
              ? effectiveQrUrl.slice(effectiveQrUrl.indexOf('?'))
              : effectiveQrUrl
          )
        : null;
      const qrStudentNo = parsedQr?.studentNumber8 || parsedApi.detectedStudentNumber;
      const matchedStudentFromImage = qrStudentNo
        ? allInstStudents.find((s) => s.studentNumber8 === qrStudentNo)
        : parsedQr?.studentName
          ? allInstStudents.find(
              (s) =>
                s.fullName.toLocaleLowerCase('tr-TR') ===
                parsedQr.studentName!.toLocaleLowerCase('tr-TR')
            )
          : undefined;

      const detectedSubjName = qrPayload?.subjectName || parsedApi.detectedSubject;
      const matchedSubjectFromImage = detectedSubjName
        ? gradeProfile.subjects.find((s) => {
            const detNorm = detectedSubjName.toLocaleLowerCase('tr-TR').trim();
            const subNorm = s.name.toLocaleLowerCase('tr-TR').trim();
            return subNorm === detNorm || subNorm.includes(detNorm) || detNorm.includes(subNorm);
          })
        : undefined;

      if (mode === 'student') {
        setLastImageQrMeta({
          detectedQrUrl: effectiveQrUrl,
          detectedStudentNumber: parsedQr?.studentNumber8 || parsedApi.detectedStudentNumber,
        });
        const effectiveSubject = matchedSubjectFromImage ?? selectedSubjectObj;
        const rawAnswersCandidate = parsedApi.answersString;
        const parsedTokensForCount = parseAnswerString(
          rawAnswersCandidate,
          Math.max(expectedCount, rawAnswersCandidate.length),
          gradeProfile.optionCount,
          { subjectName: effectiveSubject?.name }
        );
        const meaningfulCount = parsedTokensForCount.filter(Boolean).length;
        const shouldAutoScopeSingleSubject =
          Boolean(matchedSubjectFromImage) &&
          selectedSubjectId === 'all' &&
          (Boolean(qrPayload) ||
            (meaningfulCount >= 5 &&
              meaningfulCount <= (matchedSubjectFromImage?.questionCount ?? 40) + 2));

        const effectiveExpectedCount = qrPayload?.questionCount
          ? qrPayload.questionCount
          : shouldAutoScopeSingleSubject
            ? meaningfulCount
            : expectedCount;

        if (shouldAutoScopeSingleSubject && matchedSubjectFromImage && onUpdateExternalPublisher) {
          onUpdateExternalPublisher({
            selectedSubjectId: matchedSubjectFromImage.id,
            questionCount: effectiveExpectedCount,
            ...(qrPayload
              ? {
                  answerKeys: {
                    ...externalPublisherConfig.answerKeys,
                    [targetBooklet]: qrPayload.answerKey,
                  },
                }
              : {}),
          });
        } else if (qrPayload && onUpdateExternalPublisher) {
          onUpdateExternalPublisher({
            ...(qrPayload.questionCount > 0 ? { questionCount: qrPayload.questionCount } : {}),
            answerKeys: {
              ...externalPublisherConfig.answerKeys,
              [targetBooklet]: qrPayload.answerKey,
            },
          });
        }

        const nextAns = normalizeDetectedAnswersString(
          rawAnswersCandidate,
          effectiveExpectedCount,
          gradeProfile.optionCount
        );
        const detectedLen = nextAns.length;
        const hasAnyMarkedBubble = /[A-E]/i.test(nextAns);
        const scanErrors: OmrScanErrorItem[] = [];
        const issue = nextAns.trim()
          ? inspectAnswerStringReadability(nextAns, gradeProfile.optionCount)
          : null;
        if (detectedLen === 0 || !nextAns.trim() || !hasAnyMarkedBubble) {
          scanErrors.push({
            id: `photo-stu-empty`,
            rowNumber: 1,
            sheetName: 'Optik Form Fotoğrafı',
            studentName: matchedStudentFromImage?.fullName || parsedQr?.studentName || studentName.trim() || undefined,
            studentNumberRaw: matchedStudentFromImage?.studentNumber8 || qrStudentNo || studentNumber.trim() || undefined,
            rawExcerpt: nextAns.trim() || '(Cevap işareti algılanamadı)',
            category: 'unreadable-answers',
            categoryLabel: OMR_ERROR_CATEGORY_LABELS['unreadable-answers'],
            reason:
              'Fotoğraftan geçerli bir optik cevap işareti okunamadı. Kağıdın aydınlatmasını ve netliğini kontrol edip tekrar deneyin.',
          });
        } else if (issue) {
          scanErrors.push({
            id: `photo-stu-issue`,
            rowNumber: 1,
            sheetName: 'Optik Form Fotoğrafı',
            studentName: matchedStudentFromImage?.fullName || parsedQr?.studentName || studentName.trim() || undefined,
            studentNumberRaw: matchedStudentFromImage?.studentNumber8 || qrStudentNo || studentNumber.trim() || undefined,
            rawExcerpt: nextAns.slice(0, 48),
            category: issue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[issue.category],
            reason: issue.reason,
          });
        }

        const effectiveKey =
          qrPayload?.answerKey ||
          (targetBooklet && externalPublisherConfig.answerKeys[targetBooklet]) ||
          answerKeyRaw;
        const resolvedStuName = matchedStudentFromImage?.fullName || parsedQr?.studentName;
        const resolvedStuNo = matchedStudentFromImage?.studentNumber8 || qrStudentNo;
        const resolvedClassroom = matchedStudentFromImage?.classroom || parsedQr?.classroom;

        onUpdateOmrState({
          ...(nextAns.trim() ? { studentAnswersRaw: nextAns } : {}),
          ...(resolvedStuName ? { studentName: resolvedStuName } : {}),
          ...(resolvedStuNo ? { studentNumber: resolvedStuNo } : {}),
          ...(resolvedClassroom ? { classroom: resolvedClassroom } : {}),
          ...(effectiveKey ? { answerKeyRaw: effectiveKey } : {}),
        });

        const qrNoteParts: string[] = [];
        if (resolvedStuNo) qrNoteParts.push(`Karne QR/Öğrenci No (${resolvedStuNo})`);
        if (qrPayload) qrNoteParts.push(`Şifreli Analiz QR çözüldü (${targetBooklet})`);
        const qrNote = qrNoteParts.length > 0 ? ` · ${qrNoteParts.join(' + ')}` : '';
        const subjNote = effectiveSubject ? ` · Ders: ${effectiveSubject.name}` : '';

        if (!hasAnyMarkedBubble && !resolvedStuNo) {
          setErrorReport({
            sourceName: file.name,
            scannedAt: new Date().toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            totalRowsChecked: 1,
            validRowsCount: 0,
            errors: scanErrors,
          });
          setErrorModalOpen(true);
          setErrorMsg(`${file.name}: Optik formda okunamayan cevap satırı tespit edildi.`);
        } else {
          setErrorReport(
            scanErrors.length > 0
              ? {
                  sourceName: file.name,
                  scannedAt: new Date().toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  totalRowsChecked: 1,
                  validRowsCount: hasAnyMarkedBubble ? 1 : 0,
                  errors: scanErrors,
                }
              : null
          );
          setErrorModalOpen(false);
          if (autoAnalyzeOnPhoto && hasAnyMarkedBubble && effectiveKey.trim()) {
            onEvaluateNow({
              studentAnswersRaw: nextAns,
              answerKeyRaw: effectiveKey,
              ...(resolvedStuNo ? { studentNumber: resolvedStuNo } : {}),
            });
            setStatusMessage(
              `${file.name} görselinden ${detectedLen} soru (${targetBooklet} kitapçığı${subjNote}${qrNote}) okundu ve otomatik analiz edilip karneler güncellendi.`
            );
          } else if (!hasAnyMarkedBubble && resolvedStuNo) {
            setStatusMessage(
              `Karekod / öğrenci bilgisi (${resolvedStuNo}${subjNote}) eşleşti ancak işaretli şık görülmedi. Cevapları 1. alandan tamamlayıp analiz edebilirsiniz.`
            );
          } else if (!effectiveKey.trim()) {
            setStatusMessage(
              `${file.name} görselinden ${detectedLen} soru (${targetBooklet} kitapçığı${subjNote}${qrNote}) okundu. Analizi tamamlamak için 2. bölüme cevap anahtarını girin veya yükleyin.`
            );
          } else {
            setStatusMessage(
              `${file.name} görselinden ${detectedLen} soru tespit edildi (${targetBooklet} kitapçığı${subjNote}${qrNote}).`
            );
          }
        }
      } else {
        const nextKey = normalizeDetectedAnswersString(
          parsedApi.answersString,
          expectedCount,
          gradeProfile.optionCount
        );
        const detectedLen = nextKey.length;
        const scanErrors: OmrScanErrorItem[] = [];
        const issue = nextKey.trim()
          ? inspectAnswerStringReadability(nextKey, gradeProfile.optionCount)
          : null;
        if (detectedLen === 0 || !nextKey.trim()) {
          scanErrors.push({
            id: `photo-key-empty`,
            rowNumber: 1,
            sheetName: 'Cevap Anahtarı Fotoğrafı',
            rawExcerpt: nextKey.trim() || '(Anahtar algılanamadı)',
            category: 'unreadable-answers',
            categoryLabel: OMR_ERROR_CATEGORY_LABELS['unreadable-answers'],
            reason:
              'Cevap anahtarı görselinden okunabilir şık dizisi algılanamadı. İsterseniz "Bölge Editöründe Kırp" ile yalnızca cevap sütununu seçebilirsiniz.',
          });
        } else if (issue) {
          scanErrors.push({
            id: `photo-key-issue`,
            rowNumber: 1,
            sheetName: 'Cevap Anahtarı Fotoğrafı',
            rawExcerpt: nextKey.slice(0, 48),
            category: issue.category,
            categoryLabel: OMR_ERROR_CATEGORY_LABELS[issue.category],
            reason: issue.reason,
          });
        }

        const normalizedKey = normalizeExternalAnswerKeyString(nextKey, gradeProfile.optionCount);
        const derived = deriveBookletAnswerKeysFromBase(
          normalizedKey,
          gradeProfile.optionCount,
          baseQuestions,
          bookletOrderSeed
        );

        const cleanedMultiKeys: Partial<Record<BookletCode, string>> = {};
        BOOKLET_CODES.forEach((bCode) => {
          const rawB = parsedApi.bookletKeys[bCode];
          if (rawB) {
            const normB = normalizeExternalAnswerKeyString(
              normalizeDetectedAnswersString(rawB, expectedCount, gradeProfile.optionCount),
              gradeProfile.optionCount
            );
            if (normB.length > 0) {
              cleanedMultiKeys[bCode] = normB;
            }
          }
        });

        onUpdateOmrState({ answerKeyRaw: normalizedKey || nextKey });
        if (onUpdateExternalPublisher) {
          onUpdateExternalPublisher({
            answerKeys: {
              ...externalPublisherConfig.answerKeys,
              ...(targetBooklet === 'A' ? derived : {}),
              ...cleanedMultiKeys,
              [targetBooklet]: normalizedKey,
            },
          });
        }

        if (scanErrors.length > 0) {
          setErrorReport({
            sourceName: file.name,
            scannedAt: new Date().toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            totalRowsChecked: 1,
            validRowsCount: 0,
            errors: scanErrors,
          });
          setErrorModalOpen(true);
          setErrorMsg(`${file.name}: Cevap anahtarı görselinde okunamayan satır tespit edildi.`);
        } else {
          setErrorReport(null);
          setErrorModalOpen(false);
          if (autoAnalyzeOnPhoto && studentAnswersRaw.trim() && normalizedKey.trim()) {
            onEvaluateNow({ studentAnswersRaw, answerKeyRaw: normalizedKey });
            setStatusMessage(
              `Cevap anahtarı okundu (${detectedLen} soru → ${targetBooklet} sütununa yüklendi) ve öğrenci optiğiyle otomatik analiz edildi.`
            );
          } else {
            setStatusMessage(
              `Cevap anahtarı okundu (${detectedLen} soru → ${targetBooklet} kitapçığı sütununa yüklendi${
                targetBooklet === 'A' ? ' + B-C-D otomatik türetildi' : ''
              }). Şimdi öğrenci cevap kağıdı fotoğrafını yükleyebilirsiniz.`
            );
          }
        }
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Dosya işlenemedi. Görseli kırpıp tekrar deneyebilir veya Excel/CSV yükleyebilirsiniz.'
      );
    } finally {
      setLoadingMode(null);
    }
  };

  const handleOpenRegionEditor = (bookletOverride?: BookletCode) => {
    setRegionEditorBooklet(bookletOverride ?? cover.bookletCode);
    setRegionEditorError(null);
    setRegionEditorOpen(true);
  };

  const handleScanCroppedKeyRegion = async (params: {
    base64: string;
    mimeType: string;
    fileName: string;
    targetBooklet: BookletCode;
    regionSummary: string;
  }) => {
    setRegionEditorLoading(true);
    setRegionEditorError(null);
    try {
      const resp = await fetch('/api/omr/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: params.base64,
          fileMimeType: params.mimeType,
          mode: 'key',
          expectedCount,
          optionCount: gradeProfile.optionCount,
          isCroppedRegion: true,
          regionSummary: params.regionSummary,
          targetBooklet: params.targetBooklet,
          subjectName: selectedSubjectObj?.name || '',
        }),
      });
      const rawText = await resp.text();
      const parsedApi = safeParseOmrApiResponse(resp.status, rawText);
      if (!parsedApi.ok) {
        throw new Error(parsedApi.error || 'Kırpılan alan okunamadı.');
      }

      const nextKey = normalizeDetectedAnswersString(
        parsedApi.answersString,
        expectedCount,
        gradeProfile.optionCount
      );
      if (nextKey.length === 0 || !nextKey.trim()) {
        setRegionEditorError(
          'Seçili bölgede okunabilir cevap anahtarı şıkları bulunamadı. Lütfen kırpım kutusunu yalnızca şıkların üzerine gelecek şekilde daraltıp tekrar deneyin.'
        );
        return;
      }

      const targetBooklet = params.targetBooklet;
      if (targetBooklet !== cover.bookletCode) {
        onUpdateCover?.({ bookletCode: targetBooklet });
      }

      const normalizedKey = normalizeExternalAnswerKeyString(nextKey, gradeProfile.optionCount);
      const derived = deriveBookletAnswerKeysFromBase(
        normalizedKey,
        gradeProfile.optionCount,
        baseQuestions,
        bookletOrderSeed
      );
      onUpdateOmrState({ answerKeyRaw: normalizedKey || nextKey });
      if (onUpdateExternalPublisher) {
        onUpdateExternalPublisher({
          answerKeys: {
            ...externalPublisherConfig.answerKeys,
            ...(targetBooklet === 'A' ? derived : {}),
            [targetBooklet]: normalizedKey,
          },
        });
      }

      setErrorReport(null);
      setErrorModalOpen(false);
      setErrorMsg(null);
      setRegionEditorOpen(false);

      if (autoAnalyzeOnPhoto && studentAnswersRaw.trim() && normalizedKey.trim()) {
        onEvaluateNow({ studentAnswersRaw, answerKeyRaw: normalizedKey });
        setStatusMessage(
          `Manuel bölgeden (${params.regionSummary}) ${nextKey.length} soruluk ${targetBooklet} kitapçığı anahtarı okundu ve öğrenci optiğiyle otomatik analiz edildi.`
        );
      } else {
        setStatusMessage(
          `Manuel bölgeden ${nextKey.length} soruluk ${targetBooklet} kitapçığı cevap anahtarı çıkarıldı${
            targetBooklet === 'A' ? ' (B-C-D otomatik türetildi)' : ''
          }.`
        );
      }
    } catch (err) {
      setRegionEditorError(
        err instanceof Error ? err.message : 'Kırpılan bölgeden cevap anahtarı çıkarılamadı.'
      );
    } finally {
      setRegionEditorLoading(false);
    }
  };

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    mode: 'student' | 'key'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processSingleUploadedFile(file, mode, mode === 'key' ? cover.bookletCode : undefined);
  };

  const handleLoadSample = (accuracy: number) => {
    const sample = generateSampleOmrPair(questions, accuracy);
    onUpdateOmrState({
      studentAnswersRaw: sample.studentString,
      answerKeyRaw: sample.keyString,
    });
    setErrorReport(null);
    setErrorModalOpen(false);
    setErrorMsg(null);
    setStatusMessage(
      `${questions.length} soruluk örnek ${gradeProfile.shortLabel} optik formu ve cevap anahtarı yüklendi.`
    );
  };

  const handleEvaluateWithValidation = () => {
    const report = validateManualOmrInputs({
      sourceName: 'Manuel Optik Girişi',
      studentName,
      studentNumber,
      studentAnswersRaw,
      answerKeyRaw,
      optionCount: gradeProfile.optionCount,
      requireStudentAnswers: true,
      validateAnswerKey: true,
      subjectName: selectedSubjectObj?.name,
    });
    if (report.errors.length > 0) {
      setErrorReport(report);
      setErrorModalOpen(true);
      setErrorMsg(
        `Optik doğrulamada ${report.errors.length} hata tespit edildi (geçersiz öğrenci numarası veya okunmayan cevap satırı).`
      );
      return;
    }
    setErrorReport(null);
    setErrorModalOpen(false);
    setErrorMsg(null);
    onEvaluateNow();
  };

  const handleSelectBookletCode = (code: BookletCode) => {
    if (onSelectBookletVariant) {
      onSelectBookletVariant(code, { autoSyncAnswerKey: true });
    } else {
      onUpdateCover?.({ bookletCode: code });
    }
    setErrorReport(null);
    setErrorMsg(null);
    setStatusMessage(
      examSourceMode === 'farkli-yayin'
        ? `Farklı yayın denemesinde ${code} Kitapçığı seçildi: optik formdaki '${code}' balonu ve harici ${code} cevap anahtarı aktif edildi.`
        : `${code} Kitapçığı seçildi: Optik formdaki '${code}' balonu ve ${questions.length} soruluk cevap anahtarı otomatik kodlandı.`
    );
  };

  const handleSelectRegisteredStudent = (stu: StudentRecord, fallbackIdx: number) => {
    const assignedCode: BookletCode =
      stu.assignedBookletCode && BOOKLET_CODES.includes(stu.assignedBookletCode)
        ? stu.assignedBookletCode
        : BOOKLET_CODES[fallbackIdx % BOOKLET_CODES.length];
    const assignedNo = normalizeBookletNumber(stu.assignedBookletNumber, fallbackIdx + 1);
    if (onSelectBookletVariant) {
      onSelectBookletVariant(assignedCode, {
        bookletNumber: assignedNo,
        studentName: stu.fullName,
        studentNumber: stu.studentNumber8,
        classroom: stu.classroom,
        autoSyncAnswerKey: true,
      });
    } else {
      onUpdateOmrState({
        studentName: stu.fullName,
        studentNumber: stu.studentNumber8,
        classroom: stu.classroom,
      });
      onUpdateCover?.({
        bookletCode: assignedCode,
        bookletNumber: assignedNo,
      });
    }
    setErrorMsg(null);
    setStatusMessage(
      `${stu.fullName} (${stu.studentNumber8}) seçildi → ${assignedCode} Kitapçığı (No: ${assignedNo}) ve ${
        examSourceMode === 'farkli-yayin' ? 'farklı yayın' : 'kurum'
      } ${assignedCode} cevap anahtarı optiğe otomatik kodlandı.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher: OMR vs 10-Question Open-Ended Paper Analysis */}
      <div className="surface-card rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScannerMode('omr')}
            data-testid="omr-classic-tab"
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              scannerMode === 'omr' ? 'btn-3d' : 'btn-3d-secondary'
            }`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Çoktan Seçmeli Optik Okuma (OMR)</span>
          </button>
          <button
            type="button"
            onClick={() => setScannerMode('open-ended')}
            data-testid="omr-open-ended-tab"
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              scannerMode === 'open-ended' ? 'btn-3d' : 'btn-3d-secondary'
            }`}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>10 Soruluk Açık Uçlu Kağıt &amp; Çözüm Analizi</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onChangeGradeProfile && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Düzey:</span>
              <select
                data-testid="omr-grade-level-select"
                value={gradeProfile.id}
                onChange={(e) => onChangeGradeProfile(e.target.value as GradeLevelId)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold surface-alt"
              >
                {GRADE_PROFILES.map((gp) => (
                  <option key={gp.id} value={gp.id}>
                    {gp.shortLabel} ({gp.optionCount} şık)
                  </option>
                ))}
              </select>
            </label>
          )}
          {onOpenGoogleFormsPanel && (
            <button
              type="button"
              data-testid="omr-open-gforms-shortcut-btn"
              onClick={onOpenGoogleFormsPanel}
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>Google Formlar Excel Paneli</span>
            </button>
          )}
          <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {studentName || 'Öğrenci Seçilmedi'}
          </div>
        </div>
      </div>

      {scannerMode === 'open-ended' ? (
        <OpenEndedPaperPanel
          gradeProfile={gradeProfile}
          cover={cover}
          studentName={studentName}
          studentNumber={studentNumber}
          classroom={classroom}
          parentPhone={parentPhone}
          latestAnalysis={openEndedAnalysis}
          externalQuestions={externalOpenEndedQuestions}
          onSyncQuestions={onSyncOpenEndedQuestions}
          onSavePaperAnalysis={(res) => onSaveOpenEndedAnalysis?.(res)}
          onGoToReports={onGoToReports}
        />
      ) : (
        <>
          <div className="surface-card rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold">
                  Farklı Denemelerin Optik Okuma &amp; Cevap Anahtarı Analiz Sistemi
                </h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Kurum denemelerinizde veya başka yayınlardan aldığınız denemelerde kayıtlı öğrencilere otomatik A-B-C-D kitapçık yerleştirip optik analiz yapın.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample(0.8)}
                  className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Örnek Başarılı Optik Yükle (%80)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample(0.58)}
                  className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Örnek Gelişim Odaklı Optik (%58)
                </button>
              </div>
            </div>

            {/* Sınav Kaynağı Seçici: Kurum Denemesi vs Farklı Yayın Denemesi */}
            <div
              data-testid="omr-exam-source-bar"
              className="surface-alt rounded-xl p-3.5 mb-4 space-y-3 border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                  <div>
                    <div className="text-xs font-extrabold">
                      Deneme Kaynağı &amp; Kitapçık Cevap Anahtarı Modu
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Farklı yayına ait deneme seçtiğinizde A, B, C ve D kitapçık cevap anahtarlarını resim çekerek (kamera) veya Excel/CSV yükleyerek girip kayıtlı öğrencilere otomatik A-B-C-D kitapçık yerleştirebilirsiniz.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Deneme kaynağı modu">
                  <button
                    type="button"
                    data-testid="source-mode-kurum-btn"
                    onClick={() => onChangeExamSourceMode?.('kurum')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      examSourceMode === 'kurum' ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    Kurum / Sistem Denemesi (Otomatik A-B-C-D)
                  </button>
                  <button
                    type="button"
                    data-testid="source-mode-external-btn"
                    onClick={() => onChangeExamSourceMode?.('farkli-yayin')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      examSourceMode === 'farkli-yayin' ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    Farklı Yayın Denemesi (Harici A-B-C-D Anahtarları)
                  </button>
                </div>
              </div>

              {prizeExams.length > 0 && onSelectActivePrizeExamId && (
                <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <label className="w-full sm:w-auto min-w-0 max-w-full flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs font-bold">
                      <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>Ödüllü Deneme Bağlantısı:</span>
                      <select
                        data-testid="omr-prize-exam-select"
                        value={activePrizeExamId ?? ''}
                        onChange={(e) => {
                          const nextId = e.target.value || null;
                          onSelectActivePrizeExamId(nextId);
                          const chosen = prizeExams.find((p) => p.id === nextId);
                          if (chosen) {
                            onUpdateCover?.({ examTitle: chosen.title });
                            if (chosen.sourceMode === 'farkli-yayin') {
                              onChangeExamSourceMode?.('farkli-yayin');
                              if (chosen.publisherName || chosen.title) {
                                onUpdateExternalPublisher?.({
                                  examTitle: chosen.title,
                                  ...(chosen.publisherName ? { publisherName: chosen.publisherName } : {}),
                                });
                              }
                            } else {
                              onChangeExamSourceMode?.('kurum');
                            }
                            const nextGrade = resolveTargetGradeForPrizeActivation(chosen, gradeProfile.id);
                            if (nextGrade && onChangeGradeProfile) {
                              onChangeGradeProfile(nextGrade);
                            }
                            const gradesLabel = formatPrizeExamGradesLabel(chosen);
                            setStatusMessage(
                              `Ödüllü Deneme aktif edildi: ${chosen.title} (${gradesLabel} · Ödül: ${chosen.prizeDescription}). Değerlendirilen sonuçlar otomatik Ödüllü Deneme sıralamasına işlenir.`
                            );
                          } else {
                            setStatusMessage('Ödüllü Deneme bağlantısı kaldırıldı.');
                          }
                        }}
                        className="w-full sm:w-auto max-w-full min-w-0 rounded-lg px-2.5 py-1.5 text-xs font-bold surface-card border"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <option value="">Standart Deneme (Ödüllü Deneme Bağlı Değil)</option>
                        {prizeExams.map((px) => (
                          <option key={px.id} value={px.id}>
                            {px.title} ({formatPrizeExamGradesLabel(px)}{px.publisherName ? ` · ${px.publisherName}` : ''} · {px.prizeDescription})
                          </option>
                        ))}
                      </select>
                    </label>
                    {activePrizeExamId && (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Ödüllü Sınav Modu Açık
                      </span>
                    )}
                  </div>

                  {(() => {
                    const activePrize = prizeExams.find((p) => p.id === activePrizeExamId);
                    const prizeGrades = activePrize ? resolvePrizeExamGrades(activePrize) : [];
                    if (prizeGrades.length <= 1 || !onChangeGradeProfile) return null;
                    return (
                      <div
                        data-testid="omr-prize-grade-switcher"
                        className="flex flex-wrap items-center gap-1.5 text-[11px]"
                      >
                        <span className="font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
                          Ödüllü Deneme Sınıfları:
                        </span>
                        {prizeGrades.map((gId) => (
                          <button
                            key={gId}
                            type="button"
                            onClick={() => onChangeGradeProfile(gId)}
                            className={`px-2 py-1 rounded-md font-bold cursor-pointer ${
                              gradeProfile.id === gId ? 'btn-3d' : 'btn-3d-secondary'
                            }`}
                          >
                            {getGradeProfile(gId).shortLabel}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {examSourceMode === 'farkli-yayin' && (
                <ExternalPublisherHub
                  gradeProfile={gradeProfile}
                  questionsCount={questions.length}
                  activeBookletCode={cover.bookletCode}
                  logoStyleId={cover.logoStyleId}
                  externalPublisherConfig={externalPublisherConfig}
                  presets={publisherPresets}
                  activePresetId={activePublisherPresetId}
                  onChangeGradeProfile={onChangeGradeProfile}
                  onUpdateConfig={(patch) => {
                    onUpdateExternalPublisher?.(patch);
                    if (patch.publisherName?.trim() || patch.examTitle?.trim()) {
                      onUpdateCover?.({
                        examTitle:
                          patch.examTitle?.trim() ||
                          patch.publisherName?.trim() ||
                          cover.examTitle,
                      });
                    }
                    if (patch.bookletMode) {
                      setRegisteredPattern(patch.bookletMode);
                      const allowed = getBookletCycleCodes(patch.bookletMode);
                      if (!allowed.includes(cover.bookletCode)) {
                        handleSelectBookletCode('A');
                      }
                    }
                  }}
                  onSelectPreset={(preset) => onSelectPublisherPreset?.(preset)}
                  onSavePreset={(asNew) => onSavePublisherPreset?.(asNew)}
                  onDeletePreset={(id) => onDeletePublisherPreset?.(id)}
                  onSyncActiveAnswerKey={(key) => onUpdateOmrState({ answerKeyRaw: key })}
                  onTriggerPhotoKeyFile={(file, targetBooklet) =>
                    void processSingleUploadedFile(file, 'key', targetBooklet)
                  }
                  onOpenRegionEditor={(targetBooklet) => handleOpenRegionEditor(targetBooklet)}
                  photoLoading={loadingMode === 'key'}
                  onToast={(msg) => setStatusMessage(msg)}
                />
              )}
            </div>

            {/* Tek Ders / Özel Soru Sayılı Optik Kapsamı + Kişiye Özel Optik Güncelleme */}
            <div
              data-testid="omr-subject-scope-bar"
              className="surface-alt rounded-xl p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3 border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <span style={{ color: 'var(--text-secondary)' }}>Ders Seçimi:</span>
                  <select
                    data-testid="omr-subject-scope-select"
                    value={selectedSubjectId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (nextId === 'all') {
                        const fullQ = gradeProfile.subjects.reduce((s, x) => s + x.questionCount, 0);
                        onUpdateExternalPublisher?.({
                          selectedSubjectId: 'all',
                          questionCount: fullQ,
                        });
                        setStatusMessage(`Tam deneme kapsamı (${fullQ} soru) aktif edildi.`);
                        return;
                      }
                      const subj = gradeProfile.subjects.find((s) => s.id === nextId);
                      if (!subj) return;
                      const currentCustomQ = externalPublisherConfig?.questionCount;
                      const chosenQ =
                        currentCustomQ && currentCustomQ >= 5 && currentCustomQ <= 40
                          ? currentCustomQ
                          : subj.questionCount;
                      onUpdateExternalPublisher?.({
                        selectedSubjectId: subj.id,
                        questionCount: chosenQ,
                      });
                      setStatusMessage(
                        `Tek ders optiği seçildi: ${subj.name} (${chosenQ} soru). Yalnızca ${subj.name} sütunu basılır.`
                      );
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-bold surface-card border"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <option value="all">Tam Deneme (Tüm Dersler)</option>
                    {gradeProfile.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        Sadece {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Hızlı soru sayısı seçimi">
                  {[10, 12, 16, 20, 25, 30].map((presetQ) => {
                    const isActiveQ = expectedCount === presetQ;
                    return (
                      <button
                        key={presetQ}
                        type="button"
                        data-testid={`omr-quick-qcount-${presetQ}`}
                        onClick={() => {
                          onUpdateExternalPublisher?.({ questionCount: presetQ });
                          setStatusMessage(
                            `${selectedSubjectObj ? selectedSubjectObj.name : 'Deneme'} optik ve karne kapsamı ${presetQ} soru olarak güncellendi.`
                          );
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono-num font-bold cursor-pointer ${
                          isActiveQ ? 'btn-3d' : 'surface-card border'
                        }`}
                        style={!isActiveQ ? { borderColor: 'var(--border-subtle)' } : undefined}
                      >
                        {presetQ} Soru
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    data-testid="omr-quick-qcount-full"
                    onClick={() => {
                      const fullQ = selectedSubjectObj
                        ? selectedSubjectObj.questionCount
                        : gradeProfile.subjects.reduce((s, x) => s + x.questionCount, 0);
                      onUpdateExternalPublisher?.({ questionCount: fullQ });
                      setStatusMessage(
                        `${selectedSubjectObj ? selectedSubjectObj.name : 'Tam Deneme'} için varsayılan ${fullQ} soru seçildi.`
                      );
                    }}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold surface-card border cursor-pointer"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    Varsayılan
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={exportBusy}
                data-testid="omr-update-personalized-sheet-btn"
                onClick={() => void onDownloadOpticalPdf(cover.bookletCode)}
                className="btn-3d px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Kişiye Özel Optik Güncelle &amp; İndir ({studentName ? studentName.split(' ')[0] : 'Öğrenci'} · {expectedCount}S)
                </span>
              </button>
            </div>

            {/* A-B-C-D Kitapçık & Kitapçık No Otomatik Optik Kodlama Paneli */}
            <div
              data-testid="omr-booklet-coding-bar"
              className="surface-alt rounded-xl p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="text-xs font-extrabold">
                  Kitapçık Türü ({visibleBooklets.join(' · ')}) &amp; Kitapçık No Otomatik Optik Kodlama
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Seçili mod ({activePattern === 'A' ? 'Tek A' : activePattern === 'AB' ? 'A - B' : 'A - B - C - D'}) için aktif kitapçık kutucuğu, 6 haneli Kitapçık No ve cevap anahtarı otomatik kodlanır.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5" role="group" aria-label="Optik kitapçık türü seçimi">
                  {visibleBooklets.map((code) => {
                    const pal = resolveCoverColorPalette(
                      { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
                      getLogoPreset(cover.logoStyleId)
                    );
                    const active = cover.bookletCode === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        data-testid={`omr-booklet-btn-${code}`}
                        onClick={() => handleSelectBookletCode(code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all border ${
                          active ? 'text-white shadow-md' : 'surface-card'
                        }`}
                        style={
                          active
                            ? { backgroundColor: pal.primaryColor, borderColor: pal.goldColor }
                            : { borderColor: pal.primaryColor, color: pal.primaryColor }
                        }
                      >
                        {code} Kitapçığı
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <span style={{ color: 'var(--text-secondary)' }}>Kitapçık No:</span>
                  <input
                    type="text"
                    maxLength={6}
                    data-testid="omr-booklet-number-input"
                    value={cover.bookletNumber ?? '050001'}
                    onChange={(e) =>
                      onUpdateCover?.({
                        bookletNumber: e.target.value.replace(/\D/g, '').slice(0, 6),
                      })
                    }
                    className="w-24 rounded-lg px-2.5 py-1.5 text-xs font-mono-num font-bold surface-card"
                  />
                </label>

                {batchAssignments.length > 0 && (
                  <select
                    data-testid="omr-batch-slot-select"
                    value=""
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      const found = batchAssignments.find((a) => a.index === idx);
                      if (!found) return;
                      if (onSelectBookletVariant) {
                        onSelectBookletVariant(found.bookletCode, {
                          bookletNumber: found.bookletNumber,
                          studentName: found.studentName,
                          studentNumber: found.studentNumber8,
                          classroom: found.classroom,
                          autoSyncAnswerKey: true,
                        });
                      }
                      setStatusMessage(
                        `${found.studentName} · ${found.bookletCode} Kitapçığı (No: ${found.bookletNumber}) optiğe otomatik kodlandı.`
                      );
                    }}
                    aria-label="Dağıtım listesinden öğrenci kitapçığı yükle"
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold surface-card max-w-[260px]"
                  >
                    <option value="">Listeden Öğrenci Seç ({batchAssignments.length})</option>
                    {batchAssignments.map((a) => (
                      <option key={a.index} value={a.index}>
                        #{a.index} · {a.studentName} · {a.bookletCode} ({a.bookletNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Kayıtlı Öğrencilere Otomatik & Manuel Kitapçık Yerleştirme Paneli */}
            <div
              data-testid="omr-registered-students-booklet-panel"
              className="surface-alt rounded-xl p-3.5 mb-5 space-y-3 border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                  <div>
                    <div className="text-xs font-extrabold">
                      Kayıtlı Öğrenciler &amp; Kitapçık Atama Paneli ({institutionName})
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {allInstStudentsCount > 0
                        ? `Tüm kayıtlı öğrenciler listeleniyor (${institutionStudents.length}/${allInstStudentsCount}). İstediğiniz öğrenciye manuel kitapçık (A/B/C/D) seçebilir veya toplu dağıtım yapabilirsiniz.`
                        : `Aktif kurumda (${institutionName}) henüz kayıtlı öğrenci yok; hemen buradan "+ Hızlı Öğrenci Ekle" ile ekleyebilirsiniz.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onAddStudent && (
                    <button
                      type="button"
                      data-testid="omr-toggle-quick-add-student-btn"
                      onClick={() => setShowQuickAddStudent((v) => !v)}
                      className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{showQuickAddStudent ? 'Formu Gizle' : '+ Hızlı Öğrenci Ekle'}</span>
                    </button>
                  )}

                  <select
                    data-testid="omr-registered-pattern-select"
                    value={registeredPattern}
                    onChange={(e) => {
                      const nextPat = e.target.value as BookletDistributionPattern;
                      setRegisteredPattern(nextPat);
                      if (examSourceMode === 'farkli-yayin') {
                        onUpdateExternalPublisher?.({ bookletMode: nextPat });
                      }
                    }}
                    aria-label="Kayıtlı öğrenciler kitapçık dağıtım düzeni"
                    className="rounded-lg px-2.5 py-1.5 text-xs font-bold surface-card"
                  >
                    <option value="A">Tek Kitapçık (A)</option>
                    <option value="AB">A - B (2 Kitapçık)</option>
                    <option value="ABCD">A - B - C - D (4 Kitapçık)</option>
                  </select>

                  {onAutoAssignRegisteredStudents && (
                    <button
                      type="button"
                      disabled={allInstStudentsCount === 0}
                      onClick={() => {
                        onAutoAssignRegisteredStudents({
                          includeAllGrades,
                          distributionPattern: registeredPattern,
                        });
                        setStatusMessage(
                          `${institutionName} kayıtlı öğrencileri için ${
                            registeredPattern === 'AB'
                              ? 'A - B'
                              : registeredPattern === 'ABCD'
                                ? 'A - B - C - D'
                                : 'Tek A'
                          } kitapçık kodları ve kitapçık numaraları otomatik yerleştirildi.`
                        );
                      }}
                      data-testid="omr-auto-assign-registered-btn"
                      className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        Öğrencilere Otomatik{' '}
                        {registeredPattern === 'AB'
                          ? 'A-B'
                          : registeredPattern === 'ABCD'
                            ? 'A-B-C-D'
                            : 'A'}{' '}
                        Dağıt
                      </span>
                    </button>
                  )}

                  {onDownloadRegisteredOpticalPdf && institutionStudents.length > 0 && (
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={onDownloadRegisteredOpticalPdf}
                      data-testid="omr-download-registered-batch-pdf-btn"
                      className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kayıtlı Öğrenci Optikleri (.PDF)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter & Scope Bar for All Institution Students */}
              {allInstStudentsCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search
                      className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--text-secondary)' }}
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      data-testid="omr-registered-search-input"
                      value={studentFilterQuery}
                      onChange={(e) => setStudentFilterQuery(e.target.value)}
                      placeholder="Öğrenci adı, soyadı, 8 haneli no veya şube ara..."
                      className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs surface-card border"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5" role="group" aria-label="Öğrenci sınıf kapsamı">
                    <button
                      type="button"
                      data-testid="omr-students-scope-all-btn"
                      onClick={() => setIncludeAllGrades(true)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        includeAllGrades ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      Tüm Öğrenciler ({allInstStudentsCount})
                    </button>
                    <button
                      type="button"
                      data-testid="omr-students-scope-grade-btn"
                      onClick={() => setIncludeAllGrades(false)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        !includeAllGrades ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      Sadece {gradeProfile.shortLabel} ({sameGradeStudentsCount})
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Quick Add Student Right Inside OMR / Farklı Yayın */}
              {showQuickAddStudent && onAddStudent && (
                <div
                  data-testid="omr-quick-add-student-form"
                  className="surface-card rounded-lg p-3 border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end"
                  style={{ borderColor: 'var(--accent-primary)' }}
                >
                  <label className="lg:col-span-4 block text-xs font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Adı Soyadı</span>
                    <input
                      type="text"
                      data-testid="omr-quick-student-name-input"
                      value={quickStuName}
                      onChange={(e) => setQuickStuName(e.target.value)}
                      placeholder="Örn: Zeynep Sude Karacaoğlu"
                      className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-semibold"
                    />
                  </label>

                  <label className="lg:col-span-3 block text-xs font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>Sınıf Düzeyi</span>
                    <select
                      data-testid="omr-quick-student-grade-select"
                      value={quickStuGradeId}
                      onChange={(e) => {
                        const ng = e.target.value as GradeLevelId;
                        setQuickStuGradeId(ng);
                        setQuickStuClass(defaultClassroomForGrade(ng));
                      }}
                      className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs surface-alt font-bold"
                    >
                      {GRADE_PROFILES.map((gp) => (
                        <option key={gp.id} value={gp.id}>
                          {gp.shortLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="lg:col-span-2 block text-xs font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>Şube</span>
                    <input
                      type="text"
                      data-testid="omr-quick-student-class-input"
                      value={quickStuClass}
                      onChange={(e) => setQuickStuClass(e.target.value)}
                      className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-semibold"
                    />
                  </label>

                  <label className="lg:col-span-1 block text-xs font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>Kitapçık</span>
                    <select
                      data-testid="omr-quick-student-booklet-select"
                      value={quickStuBooklet}
                      onChange={(e) => setQuickStuBooklet(e.target.value as BookletCode)}
                      className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs surface-alt font-bold"
                    >
                      {BOOKLET_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    data-testid="omr-quick-student-submit-btn"
                    onClick={() => {
                      const instObj: Institution = activeInstitution ?? {
                        id: institutionId,
                        name: institutionName,
                        code8: institutionCode8,
                        city: '',
                        createdAt: '',
                      };
                      const res = buildStudentRecordForInstitution({
                        fullName: quickStuName,
                        institution: instObj,
                        gradeId: quickStuGradeId,
                        classroom: quickStuClass,
                        existingStudents: students,
                      });
                      if (!res.ok || !res.student) {
                        setErrorMsg(res.reason || 'Öğrenci eklenemedi.');
                        return;
                      }
                      const createdStudent: StudentRecord = {
                        ...res.student,
                        assignedBookletCode: quickStuBooklet,
                        assignedBookletNumber: normalizeBookletNumber(
                          undefined,
                          allInstStudentsCount + 1
                        ),
                      };
                      onAddStudent(createdStudent);
                      setErrorMsg(null);
                      setStatusMessage(
                        `${createdStudent.fullName} (${createdStudent.studentNumber8}) eklendi → ${quickStuBooklet} kitapçığı atandı.`
                      );
                      setQuickStuName('');
                    }}
                    className="lg:col-span-2 btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ekle</span>
                  </button>
                </div>
              )}

              {institutionStudents.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {institutionStudents.map((stu, idx) => {
                    const code: BookletCode =
                      stu.assignedBookletCode && BOOKLET_CODES.includes(stu.assignedBookletCode)
                        ? stu.assignedBookletCode
                        : visibleBooklets[idx % visibleBooklets.length] ?? 'A';
                    const bNo = normalizeBookletNumber(stu.assignedBookletNumber, idx + 1);
                    const pal = resolveCoverColorPalette(
                      { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
                      getLogoPreset(cover.logoStyleId)
                    );
                    const stuGradeLabel = getGradeProfile(stu.gradeId).shortLabel;
                    const isSelected = studentNumber === stu.studentNumber8;
                    return (
                      <div
                        key={stu.id}
                        data-testid={`omr-registered-student-card-${idx}`}
                        className={`surface-card rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border ${
                          isSelected ? 'ring-2' : ''
                        }`}
                        style={{
                          borderColor: isSelected ? pal.primaryColor : 'var(--border-subtle)',
                        }}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-start gap-2">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-display font-extrabold text-white shrink-0 mt-0.5"
                              style={{ backgroundColor: pal.primaryColor }}
                            >
                              {code}
                            </span>
                            <span className="text-xs font-extrabold leading-snug break-words">
                              {stu.fullName}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                            {stuGradeLabel} · {stu.classroom} · No:{stu.studentNumber8} · Kit:{bNo}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {onChangeStudentBooklet && (
                            <select
                              data-testid={`omr-manual-booklet-select-${idx}`}
                              aria-label={`${stu.fullName} için manuel kitapçık seç`}
                              value={code}
                              onChange={(e) => {
                                const nextB = e.target.value as BookletCode;
                                onChangeStudentBooklet(stu.id, nextB);
                                setStatusMessage(
                                  `${stu.fullName} için kitapçık manuel olarak ${nextB} yapıldı.`
                                );
                              }}
                              className="rounded px-1.5 py-1 text-[11px] font-extrabold surface-alt border cursor-pointer"
                              style={{ borderColor: pal.primaryColor, color: pal.primaryColor }}
                            >
                              {BOOKLET_CODES.map((optCode) => (
                                <option key={optCode} value={optCode}>
                                  {optCode} Kitapçığı
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            data-testid={`omr-select-registered-row-${idx}`}
                            onClick={() => handleSelectRegisteredStudent(stu, idx)}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                              isSelected ? 'btn-3d' : 'btn-3d-secondary'
                            }`}
                          >
                            {isSelected ? 'Seçili' : 'Yükle'}
                          </button>
                          <button
                            type="button"
                            disabled={exportBusy}
                            data-testid={`omr-download-registered-row-${idx}`}
                            onClick={() =>
                              onDownloadOpticalPdf(code, bNo, {
                                studentName: stu.fullName,
                                studentNumber8: stu.studentNumber8,
                                classroom: stu.classroom,
                              })
                            }
                            aria-label={`${stu.fullName} ${code} kitapçığı optik PDF indir`}
                            className="btn-3d-secondary px-2 py-1 rounded text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-60"
                          >
                            <FileDown className="w-3 h-3" aria-hidden="true" />
                            <span>{code}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Student Metadata, 8-Digit Institution Code & Penalty Rule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Adı Soyadı</span>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => onUpdateOmrState({ studentName: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt focus:outline-2"
                />
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Öğrenci No (8 Hane)</span>
                <input
                  type="text"
                  value={studentNumber}
                  onChange={(e) => onUpdateOmrState({ studentNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-mono-num focus:outline-2"
                />
              </label>
              <div className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Kurum Kodu (8 Hane)</span>
                <div
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-mono-num font-bold truncate"
                  style={{ color: 'var(--accent-primary)' }}
                  title={cover.academyName}
                >
                  {institutionCode8}
                </div>
              </div>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf / Şube</span>
                <input
                  type="text"
                  value={classroom}
                  onChange={(e) => onUpdateOmrState({ classroom: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt focus:outline-2"
                />
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Net Hesaplama (Doğru-Yanlış)</span>
                <select
                  data-testid="omr-penalty-select"
                  value={penaltyDivisor}
                  onChange={(e) =>
                    onUpdateOmrState({ penaltyDivisor: Number(e.target.value) as PenaltyDivisor })
                  }
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt focus:outline-2"
                >
                  <option value={0}>Yanlış Doğruyu Götürmez (Net = Doğru · 3–5. Sınıf)</option>
                  <option value={3}>3 Yanlış 1 Doğruyu Götürür (3–8. Sınıf / LGS)</option>
                  <option value={4}>4 Yanlış 1 Doğruyu Götürür (Lise / TYT / AYT)</option>
                </select>
              </label>
            </div>

            {qrPreCheckResult.status !== 'none' && (
              <div
                data-testid="omr-qr-precheck-banner"
                className={`mb-4 rounded-xl px-3.5 py-2.5 text-xs border-t-2 border flex flex-wrap items-center justify-between gap-2 ${
                  qrPreCheckResult.status === 'matched'
                    ? 'surface-alt border-emerald-500/40'
                    : qrPreCheckResult.status === 'mismatch'
                      ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-700'
                      : 'surface-alt border-amber-500/40'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {qrPreCheckResult.status === 'matched' ? (
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  )}
                  <span className="font-semibold">{qrPreCheckResult.message}</span>
                </div>
                {qrPreCheckResult.status === 'mismatch' && qrPreCheckResult.matchedStudentId && (
                  <button
                    type="button"
                    data-testid="omr-qr-switch-student-btn"
                    onClick={() => {
                      const found = allInstStudents.find(
                        (s) => s.id === qrPreCheckResult.matchedStudentId
                      );
                      if (!found) return;
                      onUpdateOmrState({
                        studentName: found.fullName,
                        studentNumber: found.studentNumber8,
                        classroom: found.classroom,
                      });
                      setStatusMessage(
                        `Karekod eşleşmesine göre ${found.fullName} (${found.studentNumber8}) seçildi.`
                      );
                    }}
                    className="btn-3d px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Eşleşen Öğrenciye Geç ({qrPreCheckResult.matchedStudentName})
                  </button>
                )}
              </div>
            )}

            {statusMessage && (
              <div className="mb-4 rounded-lg p-3 text-xs font-semibold flex items-center gap-2 surface-alt">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <span>{statusMessage}</span>
              </div>
            )}
            {errorMsg && (
              <div className="mb-4 rounded-lg p-3 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {uploadedKeyImage && (
                    <button
                      type="button"
                      data-testid="omr-error-open-region-editor-btn"
                      onClick={() => handleOpenRegionEditor()}
                      className="px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0 text-white"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      <Crop className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Bölge Editöründe Kırp</span>
                    </button>
                  )}
                  {errorReport && errorReport.errors.length > 0 && (
                    <button
                      type="button"
                      data-testid="omr-open-error-report-btn"
                      onClick={() => setErrorModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Hata Raporu ({errorReport.errors.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Excel / CSV Toplu Aktarım (Öğrenci + A-B-C-D Cevap Anahtarı) & Fotoğraf Otomatik Analiz */}
            <div
              data-testid="omr-excel-import-panel"
              className="surface-alt rounded-xl p-4 mb-5 border space-y-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <FileSpreadsheet
                    className="w-5 h-5 shrink-0 mt-0.5"
                    style={{ color: '#059669' }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-xs font-extrabold">
                      Excel / CSV ile Öğrenci &amp; A-B-C-D Cevap Anahtarı Toplu Aktarımı + Fotoğraf Otomatik Analiz
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Öğrenci listesini, A-B-C-D kitapçıklarını ve optik cevapları/anahtarlarını tek Excel veya CSV dosyasıyla yükleyin; ya da önce cevap anahtarının fotoğrafını çekip ardından öğrenci cevap kağıdı fotoğrafıyla otomatik analiz başlatın.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    data-testid="omr-excel-choose-btn"
                    className="btn-3d px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {loadingMode === 'excel' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Excel İşleniyor...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Dosya Seç (Excel / CSV)</span>
                      </>
                    )}
                    <input
                      type="file"
                      data-testid="omr-excel-file-input"
                      accept=".xlsx,.xls,.csv,.txt"
                      onChange={handleExcelBulkUpload}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    data-testid="omr-excel-template-btn"
                    onClick={() =>
                      downloadOmrExcelTemplate({
                        bookletKeys: externalPublisherConfig.answerKeys,
                        gradeId: gradeProfile.id,
                        optionCount: gradeProfile.optionCount,
                        questionCount: expectedCount,
                      })
                    }
                    className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Örnek Excel Şablonu (.xlsx)</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
                <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="omr-auto-analyze-toggle"
                    checked={autoAnalyzeOnPhoto}
                    onChange={(e) => setAutoAnalyzeOnPhoto(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  <span>Fotoğraf veya Excel yüklendiğinde otomatik analiz et ve karneleri güncelle</span>
                </label>
                {lastExcelSummary && (
                  <span className="font-semibold" style={{ color: '#059669' }} data-testid="omr-excel-summary">
                    {lastExcelSummary}
                  </span>
                )}
              </div>
            </div>

            <div className="mb-5">
              <QrKeyIntegrationPanel
                institutionCode8={institutionCode8}
                institutionName={institutionName}
                gradeProfile={gradeProfile}
                examTitle={cover.examTitle}
                examSourceMode={examSourceMode}
                activeBookletCode={cover.bookletCode}
                bookletPattern={activePattern}
                expectedCount={expectedCount}
                selectedSubjectName={selectedSubjectObj?.name}
                studentAnswersRaw={studentAnswersRaw}
                answerKeyRaw={answerKeyRaw}
                externalKeys={externalPublisherConfig.answerKeys}
                loadingMode={loadingMode}
                onSelectBookletCode={handleSelectBookletCode}
                onUploadStudentOpticalFile={(file) => processSingleUploadedFile(file, 'student')}
                onUploadKeyFile={(file, bookletCode) =>
                  processSingleUploadedFile(file, 'key', bookletCode)
                }
                onApplyDecodedQrKey={({
                  answerKey,
                  bookletCode,
                  subjectName,
                  questionCount,
                  runAnalysisNow,
                }) => {
                  if (bookletCode !== cover.bookletCode) {
                    onUpdateCover?.({ bookletCode });
                  }
                  const matchedSubj = subjectName
                    ? gradeProfile.subjects.find(
                        (s) =>
                          s.name.toLocaleLowerCase('tr-TR') ===
                          subjectName.toLocaleLowerCase('tr-TR')
                      )
                    : undefined;
                  onUpdateExternalPublisher?.({
                    ...(matchedSubj ? { selectedSubjectId: matchedSubj.id } : {}),
                    ...(questionCount > 0 ? { questionCount } : {}),
                    answerKeys: {
                      ...externalPublisherConfig.answerKeys,
                      [bookletCode]: answerKey,
                    },
                  });
                  onUpdateOmrState({ answerKeyRaw: answerKey });
                  setErrorMsg(null);
                  if (runAnalysisNow && studentAnswersRaw.trim()) {
                    onEvaluateNow({ studentAnswersRaw, answerKeyRaw: answerKey });
                    setStatusMessage(
                      `Şifreli Öğretmen Analiz QR çözüldü (${bookletCode} kitapçığı · ${answerKey.length} soru) ve öğrenci cevaplarıyla anında karşılaştırıldı.`
                    );
                  } else {
                    setStatusMessage(
                      `Şifreli Öğretmen Analiz QR çözüldü: ${bookletCode} kitapçığı (${answerKey.length} soru) aktif cevap anahtarına yüklendi.`
                    );
                  }
                }}
                onApplyBulkAnswerKeys={(keys, summary) => {
                  onUpdateExternalPublisher?.({
                    answerKeys: {
                      ...externalPublisherConfig.answerKeys,
                      ...keys,
                    },
                  });
                  const activeLoaded = keys[cover.bookletCode] || keys.A;
                  if (activeLoaded) {
                    onUpdateOmrState({ answerKeyRaw: activeLoaded });
                  }
                  setErrorMsg(null);
                  setStatusMessage(summary);
                }}
              />
            </div>

            {/* Dual Upload & Input Area: Optical Form vs Answer Key */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Optical Sheet Input */}
              <div className="surface-alt rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <h3 className="text-sm font-bold">1. Öğrenci Optik Cevapları ({cover.bookletCode} Kitapçığı)</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label
                      data-testid="omr-student-camera-btn"
                      className="btn-3d px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Fotoğraf Çek &amp; Analiz Et</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileUpload(e, 'student')}
                        className="sr-only"
                      />
                    </label>
                    <label
                      data-testid="omr-student-upload-btn"
                      className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      {loadingMode === 'student' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          <span>Optik Taranıyor...</span>
                        </>
                      ) : (
                        <span>Dosya Seç (Görsel/PDF/Excel/CSV)</span>
                      )}
                      <input
                        type="file"
                        data-testid="omr-student-upload-input"
                        accept="image/*,.pdf,.xlsx,.xls,.csv,.txt,.json"
                        onChange={(e) => handleFileUpload(e, 'student')}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                <label className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>
                    İşaretlenen cevaplar (boş sorular için <code className="font-mono-num">-</code> kullanın, örn.{' '}
                    <code className="font-mono-num">ABCD-E...</code> veya <code className="font-mono-num">1-A, 2-C</code>)
                  </span>
                  <textarea
                    ref={studentAnswersTextareaRef}
                    rows={4}
                    data-testid="omr-student-answers-textarea"
                    value={studentAnswersRaw}
                    onChange={(e) => onUpdateOmrState({ studentAnswersRaw: e.target.value })}
                    placeholder="ABCD-EABDC..."
                    className="mt-1.5 w-full rounded-lg p-3 text-xs font-mono-num surface-card focus:outline-2"
                  />
                </label>

                <div className="flex justify-between text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  <span>Algılanan İşaret: {parsedStudent.filter(Boolean).length}</span>
                  <span>Boş: {parsedStudent.filter((x) => x === null).length}</span>
                </div>
              </div>

              {/* Answer Key Input */}
              <div className="surface-alt rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileKey2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <h3 className="text-sm font-bold">
                      2. Deneme Cevap Anahtarı ({cover.bookletCode} Kitapçığı)
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label
                      data-testid="omr-key-camera-btn"
                      className="btn-3d px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Anahtar Fotoğrafı Çek</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileUpload(e, 'key')}
                        className="sr-only"
                      />
                    </label>
                    <label
                      data-testid="omr-key-upload-btn"
                      className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      {loadingMode === 'key' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          <span>Anahtar Okunuyor...</span>
                        </>
                      ) : (
                        <span>Dosya Seç (Görsel/PDF/Excel/CSV)</span>
                      )}
                      <input
                        type="file"
                        data-testid="omr-key-upload-input"
                        accept="image/*,.pdf,.xlsx,.xls,.csv,.txt,.json"
                        onChange={(e) => handleFileUpload(e, 'key')}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      data-testid="omr-open-region-editor-btn"
                      onClick={() => handleOpenRegionEditor()}
                      className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <Crop className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Manuel Bölge Editörü</span>
                    </button>
                  </div>
                </div>

                <label className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>
                    {examSourceMode === 'farkli-yayin'
                      ? `Farklı yayın (${externalPublisherConfig.publisherName || 'Harici Deneme'}) — ${cover.bookletCode} kitapçığı cevap anahtarı`
                      : `Aktif ${cover.bookletCode} kitapçığı resmi cevap anahtarı (${expectedCount} soru)`}
                  </span>
                  <textarea
                    rows={4}
                    data-testid="omr-answer-key-textarea"
                    value={answerKeyRaw}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdateOmrState({ answerKeyRaw: val });
                      if (examSourceMode === 'farkli-yayin' && onUpdateExternalPublisher) {
                        onUpdateExternalPublisher({
                          answerKeys: {
                            ...externalPublisherConfig.answerKeys,
                            [cover.bookletCode]: normalizeExternalAnswerKeyString(
                              val,
                              gradeProfile.optionCount
                            ),
                          },
                        });
                      }
                    }}
                    placeholder="ABCDEABCDE..."
                    className="mt-1.5 w-full rounded-lg p-3 text-xs font-mono-num surface-card focus:outline-2"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  <span>Anahtar Uzunluğu: {parsedKey.filter(Boolean).length} / {expectedCount} · {gradeProfile.optionCount} Şık</span>
                  {answerKeyRaw.trim().length > 0 && (
                    <button
                      type="button"
                      data-testid="omr-section2-split-key-btn"
                      onClick={() => {
                        const split = parseCombinedExternalAnswerKeysText(answerKeyRaw, {
                          optionCount: gradeProfile.optionCount,
                          bookletMode: activePattern,
                          autoDeriveMissing: activePattern !== 'A',
                        });
                        if (split.detectedBooklets.length === 0) {
                          setErrorMsg(split.summaryMessage);
                          return;
                        }
                        if (onUpdateExternalPublisher) {
                          onUpdateExternalPublisher({
                            bookletMode: split.recommendedMode,
                            answerKeys: {
                              ...externalPublisherConfig.answerKeys,
                              ...split.answerKeys,
                            },
                          });
                        }
                        const loaded =
                          split.answerKeys[cover.bookletCode] ||
                          split.answerKeys.A ||
                          normalizeExternalAnswerKeyString(answerKeyRaw, gradeProfile.optionCount);
                        onUpdateOmrState({ answerKeyRaw: loaded });
                        setErrorMsg(null);
                        setStatusMessage(split.summaryMessage);
                      }}
                      className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-sans font-bold whitespace-nowrap cursor-pointer"
                    >
                      A / A-B Metnini Ayrıştır
                    </button>
                  )}
                </div>

                {uploadedKeyImage && (
                  <div className="surface-card rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="truncate max-w-[220px]" style={{ color: 'var(--text-secondary)' }}>
                      Görsel: <strong className="text-[var(--text-primary)]">{uploadedKeyImage.fileName}</strong>
                    </span>
                    <button
                      type="button"
                      data-testid="omr-recrop-uploaded-key-btn"
                      onClick={() => handleOpenRegionEditor()}
                      className="font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      <Crop className="w-3 h-3" aria-hidden="true" />
                      <span>Alanı Elle Kırp &amp; Yeniden Oku</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pre-Save Validation Summary Card (Empty Bubbles / Multiple Marks) */}
            <OmrValidationSummaryCard
              summary={validationSummary}
              onFocusStudentAnswers={() => {
                studentAnswersTextareaRef.current?.focus();
                studentAnswersTextareaRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
              }}
              onOpenErrorReport={() => {
                const report = validateManualOmrInputs({
                  sourceName: 'Doğrulama Özeti Ön Kontrolü',
                  studentName,
                  studentNumber,
                  studentAnswersRaw,
                  answerKeyRaw,
                  optionCount: gradeProfile.optionCount,
                  requireStudentAnswers: true,
                  validateAnswerKey: true,
                });
                setErrorReport(report);
                setErrorModalOpen(true);
              }}
            />

            {/* Evaluate 3D CTA */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Analizi başlattığınızda seçili {cover.bookletCode} kitapçığı anahtarına göre tüm ders netleri, 5 çeşit karne ve 3 detaylı analiz güncellenir.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {errorReport && errorReport.errors.length > 0 && !errorMsg && (
                  <button
                    type="button"
                    data-testid="omr-open-error-report-btn"
                    onClick={() => setErrorModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-2 cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    <span>Hata Raporu ({errorReport.errors.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid="omr-evaluate-now-btn"
                  onClick={handleEvaluateWithValidation}
                  className="btn-3d px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>Optiği Analiz Et ve Karneleri Güncelle</span>
                </button>
                <button
                  type="button"
                  onClick={onGoToReports}
                  className="btn-3d-secondary px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>5 Karneye Git</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Live Evaluation Preview & Optical Bubble Verification Grid */}
          <section className="surface-card rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold">Canlı Optik Karşılaştırma Özeti</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Yeşil: Doğru · Kırmızı: Yanlış · Gri: Boş (İlk 60 soru hızlı kontrol ızgarası)
                </p>
                {analysis.columnAlignment && (
                  <div
                    data-testid="omr-column-alignment-badge"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold pt-0.5 text-emerald-700 dark:text-emerald-300"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{analysis.columnAlignment.message}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-5 text-sm font-mono-num font-bold">
                <span className="text-emerald-600 dark:text-emerald-400">
                  Doğru: {analysis.totalCorrect}
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  Yanlış: {analysis.totalWrong}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>Boş: {analysis.totalBlank}</span>
                <span style={{ color: 'var(--accent-primary)' }}>
                  Net: {analysis.totalNet.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
              {analysis.questionDetails.slice(0, 60).map((q) => {
                const cls =
                  q.status === 'dogru'
                    ? 'bg-emerald-600 text-white'
                    : q.status === 'yanlis'
                      ? 'bg-rose-600 text-white'
                      : 'surface-alt';
                return (
                  <div
                    key={q.number}
                    title={`Soru ${q.number} (${q.subject}): Öğrenci=${q.studentAnswer ?? 'Boş'} | Doğru=${q.correctAnswer}`}
                    className={`rounded-md px-1.5 py-1 text-center font-mono-num text-[11px] font-bold ${cls}`}
                  >
                    {q.number}:{q.studentAnswer ?? '-'}
                    <span className="opacity-75">/{q.correctAnswer}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Authentic Turkish Magenta/Pink OMR Optical Sheet Preview + Entegre A-B-C-D İndirme */}
          <OpticalFormPreview
            cover={cover}
            gradeProfile={gradeProfile}
            studentName={studentName}
            studentNumber8={studentNumber}
            institutionCode8={institutionCode8}
            classroom={classroom}
            totalQuestions={expectedCount}
            selectedSubjectId={selectedSubjectId}
            selectedSubjectName={selectedSubjectObj?.name}
            subjectsOverride={
              selectedSubjectObj
                ? [{ ...selectedSubjectObj, questionCount: expectedCount }]
                : undefined
            }
            activeAnswerKey={answerKeyRaw}
            examSourceMode={examSourceMode}
            exportBusy={exportBusy}
            registeredCount={institutionStudents.length}
            visibleBooklets={visibleBooklets}
            onSelectBookletCode={handleSelectBookletCode}
            onDownloadOpticalPdf={(code) => onDownloadOpticalPdf(code)}
            onDownloadAllOpticalPdf={onDownloadAllOpticalPdf}
            onDownloadAllOpticalZip={onDownloadAllOpticalZip}
            onDownloadRegisteredOpticalPdf={onDownloadRegisteredOpticalPdf}
          />

          <OmrErrorReportModal
            open={errorModalOpen}
            report={errorReport}
            onClose={() => setErrorModalOpen(false)}
            onOpenRegionEditor={uploadedKeyImage ? () => handleOpenRegionEditor() : undefined}
          />

          <OpticalRegionEditorModal
            open={regionEditorOpen}
            initialImage={uploadedKeyImage}
            targetBooklet={regionEditorBooklet}
            visibleBooklets={visibleBooklets}
            expectedCount={expectedCount}
            optionCount={gradeProfile.optionCount}
            loading={regionEditorLoading}
            errorMessage={regionEditorError}
            onClose={() => {
              if (!regionEditorLoading) {
                setRegionEditorOpen(false);
              }
            }}
            onChangeImage={(img) => setUploadedKeyImage(img)}
            onScanCroppedRegion={handleScanCroppedKeyRegion}
          />
        </>
      )}
    </div>
  );
}
