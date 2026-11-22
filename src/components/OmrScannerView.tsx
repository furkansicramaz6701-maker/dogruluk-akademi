import { useState, useEffect, ChangeEvent } from 'react';
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
} from 'lucide-react';
import {
  BookletCode,
  CoverConfig,
  ExamAnalysisResult,
  ExamQuestion,
  ExamSourceMode,
  ExternalPublisherExamConfig,
  GradeProfile,
  OpenEndedPaperAnalysis,
  OpenEndedQuestion,
  PenaltyDivisor,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';
import { getLogoPreset } from '../data/logos';
import {
  BOOKLET_CODES,
  normalizeBookletNumber,
  normalizeExternalAnswerKeyString,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import { generateSampleOmrPair, parseAnswerString } from '../utils/examAnalysis';
import { OpenEndedPaperPanel } from './OpenEndedPaperPanel';
import { OpticalFormPreview } from './OpticalFormPreview';

interface OmrScannerViewProps {
  institutionId: string;
  institutionName: string;
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
  exportBusy?: boolean;
  onChangeExamSourceMode?: (mode: ExamSourceMode) => void;
  onUpdateExternalPublisher?: (patch: Partial<ExternalPublisherExamConfig>) => void;
  onAutoAssignRegisteredStudents?: (opts?: { includeAllGrades?: boolean }) => void;
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
  onUpdateOmrState: (patch: {
    studentAnswersRaw?: string;
    answerKeyRaw?: string;
    studentName?: string;
    studentNumber?: string;
    classroom?: string;
    penaltyDivisor?: PenaltyDivisor;
  }) => void;
  onEvaluateNow: () => void;
  onGoToReports: () => void;
  onDownloadOpticalPdf: (
    targetCode?: BookletCode,
    customBookletNumber?: string,
    overrideStudent?: { studentName?: string; studentNumber8?: string; classroom?: string }
  ) => Promise<void>;
  onDownloadAllOpticalPdf?: () => Promise<void>;
  onDownloadAllOpticalZip?: () => Promise<void>;
  onDownloadRegisteredOpticalPdf?: () => Promise<void>;
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

export function OmrScannerView({
  institutionId,
  institutionName,
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
  exportBusy = false,
  onChangeExamSourceMode,
  onUpdateExternalPublisher,
  onAutoAssignRegisteredStudents,
  onSelectBookletVariant,
  onUpdateCover,
  initialMode = 'omr',
  openEndedAnalysis = null,
  externalOpenEndedQuestions = null,
  onSyncOpenEndedQuestions,
  onSaveOpenEndedAnalysis,
  onUpdateOmrState,
  onEvaluateNow,
  onGoToReports,
  onDownloadOpticalPdf,
  onDownloadAllOpticalPdf,
  onDownloadAllOpticalZip,
  onDownloadRegisteredOpticalPdf,
}: OmrScannerViewProps) {
  const [scannerMode, setScannerMode] = useState<'omr' | 'open-ended'>(initialMode);
  const [loadingMode, setLoadingMode] = useState<'student' | 'key' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [includeAllGrades, setIncludeAllGrades] = useState<boolean>(false);

  useEffect(() => {
    setScannerMode(initialMode);
  }, [initialMode]);

  const expectedCount = questions.length;
  const parsedStudent = parseAnswerString(
    studentAnswersRaw,
    expectedCount,
    gradeProfile.optionCount
  );
  const parsedKey = parseAnswerString(
    answerKeyRaw,
    expectedCount,
    gradeProfile.optionCount
  );

  const institutionStudents = students.filter(
    (s) => s.institutionId === institutionId && (includeAllGrades || s.gradeId === gradeProfile.id)
  );
  const allInstStudentsCount = students.filter((s) => s.institutionId === institutionId).length;

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    mode: 'student' | 'key'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMessage(null);

    try {
      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.json')
      ) {
        const text = await file.text();
        let extracted = text;
        if (file.name.endsWith('.json')) {
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
        } else {
          onUpdateOmrState({ answerKeyRaw: extracted });
          if (examSourceMode === 'farkli-yayin' && onUpdateExternalPublisher) {
            onUpdateExternalPublisher({
              answerKeys: {
                ...externalPublisherConfig.answerKeys,
                [cover.bookletCode]: normalizeExternalAnswerKeyString(extracted, gradeProfile.optionCount),
              },
            });
          }
        }
        setStatusMessage(
          `${file.name} dosyasından ${mode === 'student' ? 'öğrenci optiği' : `${cover.bookletCode} kitapçığı cevap anahtarı`} okundu.`
        );
        return;
      }

      setLoadingMode(mode);
      const base64 = await fileToBase64(file);
      const resp = await fetch('/api/omr/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileMimeType: file.type || 'image/png',
          mode,
          expectedCount,
          optionCount: gradeProfile.optionCount,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Optik dosya okunamadı');
      }
      if (mode === 'student') {
        onUpdateOmrState({ studentAnswersRaw: data.answersString });
      } else {
        onUpdateOmrState({ answerKeyRaw: data.answersString });
        if (examSourceMode === 'farkli-yayin' && onUpdateExternalPublisher) {
          onUpdateExternalPublisher({
            answerKeys: {
              ...externalPublisherConfig.answerKeys,
              [cover.bookletCode]: normalizeExternalAnswerKeyString(
                data.answersString,
                gradeProfile.optionCount
              ),
            },
          });
        }
      }
      setStatusMessage(
        `${file.name} yapay zeka optik okuyucu ile tarandı (${data.detectedCount} soru tespit edildi).`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Dosya işlenemedi. Metin veya CSV olarak yapıştırabilirsiniz.'
      );
    } finally {
      setLoadingMode(null);
      e.target.value = '';
    }
  };

  const handleLoadSample = (accuracy: number) => {
    const sample = generateSampleOmrPair(questions, accuracy);
    onUpdateOmrState({
      studentAnswersRaw: sample.studentString,
      answerKeyRaw: sample.keyString,
    });
    setErrorMsg(null);
    setStatusMessage(
      `${questions.length} soruluk örnek ${gradeProfile.shortLabel} optik formu ve cevap anahtarı yüklendi.`
    );
  };

  const handleSelectBookletCode = (code: BookletCode) => {
    if (onSelectBookletVariant) {
      onSelectBookletVariant(code, { autoSyncAnswerKey: true });
    } else {
      onUpdateCover?.({ bookletCode: code });
    }
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
        <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          {gradeProfile.shortLabel} · {studentName || 'Öğrenci Seçilmedi'}
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
                      Farklı yayına ait deneme seçtiğinizde A, B, C ve D kitapçıklarının yayın cevap anahtarlarını ayrı ayrı girip kayıtlı öğrencilere otomatik A-B-C-D kitapçık yerleştirebilirsiniz.
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

              {examSourceMode === 'farkli-yayin' && (
                <div
                  data-testid="external-publisher-keys-panel"
                  className="surface-card rounded-xl p-3.5 space-y-3 border"
                  style={{ borderColor: 'var(--accent-primary)' }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Farklı Yayın / Deneme Adı</span>
                      <input
                        type="text"
                        data-testid="external-publisher-name-input"
                        value={externalPublisherConfig.publisherName}
                        onChange={(e) => {
                          const nextPub = e.target.value;
                          onUpdateExternalPublisher?.({ publisherName: nextPub });
                          if (nextPub.trim()) {
                            onUpdateCover?.({ examTitle: nextPub.trim() });
                          }
                        }}
                        placeholder="Örn: Özdebir / Hız / Palme 5. Sınıf TG Deneme-3"
                        className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs surface-alt font-semibold"
                      />
                    </label>
                    <div className="flex items-end justify-between gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <span>
                        Her kitapçığın (A, B, C, D) cevap anahtarını aşağıya girin; öğrenci hangi kitapçıktaysa analizi o kitapçığın yayın anahtarıyla yapılır.
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {BOOKLET_CODES.map((code) => {
                      const pal = resolveCoverColorPalette(
                        { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
                        getLogoPreset(cover.logoStyleId)
                      );
                      const val = externalPublisherConfig.answerKeys[code] ?? '';
                      const isActive = cover.bookletCode === code;
                      return (
                        <div
                          key={code}
                          className={`rounded-lg p-2.5 border ${isActive ? 'ring-1' : ''}`}
                          style={{
                            borderColor: isActive ? pal.primaryColor : 'var(--border-subtle)',
                            backgroundColor: isActive ? pal.softBg : undefined,
                          }}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[11px] font-extrabold" style={{ color: pal.primaryColor }}>
                              {code} Kitapçığı Anahtarı
                            </span>
                            <span className="text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                              {val.length}/{expectedCount}
                            </span>
                          </div>
                          <input
                            type="text"
                            data-testid={`external-key-input-${code}`}
                            value={val}
                            onChange={(e) => {
                              const cleaned = normalizeExternalAnswerKeyString(
                                e.target.value,
                                gradeProfile.optionCount
                              );
                              onUpdateExternalPublisher?.({
                                answerKeys: {
                                  ...externalPublisherConfig.answerKeys,
                                  [code]: cleaned,
                                },
                              });
                              if (cover.bookletCode === code && cleaned.length > 0) {
                                onUpdateOmrState({ answerKeyRaw: cleaned });
                              }
                            }}
                            placeholder={`${code} şıkları (örn. ABCD...)`}
                            className="w-full rounded px-2 py-1 text-xs font-mono-num font-bold surface-alt"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* A-B-C-D Kitapçık & Kitapçık No Otomatik Optik Kodlama Paneli */}
            <div
              data-testid="omr-booklet-coding-bar"
              className="surface-alt rounded-xl p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="text-xs font-extrabold">
                  Kitapçık Türü (A · B · C · D) &amp; Kitapçık No Otomatik Optik Kodlama
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  A, B, C veya D seçtiğinizde optik formdaki kitapçık kutucuğu, 6 haneli Kitapçık No, indirme bağlantısı ve cevap anahtarı otomatik kodlanır.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5" role="group" aria-label="Optik kitapçık türü seçimi">
                  {BOOKLET_CODES.map((code) => {
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
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold surface-card max-w-[220px]"
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

            {/* Kayıtlı Öğrencilere Otomatik A-B-C-D Kitapçık Yerleştirme Paneli */}
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
                      Kayıtlı Öğrenciler Otomatik A-B-C-D Kitapçık Yerleşimi ({institutionName})
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {institutionStudents.length > 0
                        ? `${institutionStudents.length} kayıtlı öğrenciye ${
                            examSourceMode === 'farkli-yayin'
                              ? 'farklı yayın denemesi'
                              : `${gradeProfile.shortLabel} denemesi`
                          } için otomatik A-B-C-D kitapçık ve 6 haneli Kitapçık No yerleştirilir.`
                        : `Aktif kurumda (${institutionName}) bu düzeyde kayıtlı öğrenci henüz yok; sağ üstteki Öğrenci Paneli’nden eklediğinizde otomatik A-B-C-D atanır.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {allInstStudentsCount > institutionStudents.length && (
                    <label className="text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeAllGrades}
                        onChange={(e) => setIncludeAllGrades(e.target.checked)}
                        className="rounded accent-blue-600"
                      />
                      <span>Tüm Sınıflar ({allInstStudentsCount})</span>
                    </label>
                  )}

                  {onAutoAssignRegisteredStudents && (
                    <button
                      type="button"
                      disabled={institutionStudents.length === 0 && allInstStudentsCount === 0}
                      onClick={() => {
                        onAutoAssignRegisteredStudents({ includeAllGrades });
                        setStatusMessage(
                          `${institutionName} kayıtlı öğrencileri için A-B-C-D kitapçık kodları ve kitapçık numaraları otomatik yerleştirildi.`
                        );
                      }}
                      data-testid="omr-auto-assign-registered-btn"
                      className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kayıtlı Öğrencilere Otomatik A-B-C-D Yerleştir</span>
                    </button>
                  )}

                  {onDownloadRegisteredOpticalPdf && institutionStudents.length > 0 && (
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={onDownloadRegisteredOpticalPdf}
                      data-testid="omr-download-registered-batch-pdf-btn"
                      className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kayıtlı Öğrenci Optikleri (.PDF)</span>
                    </button>
                  )}
                </div>
              </div>

              {institutionStudents.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {institutionStudents.map((stu, idx) => {
                    const code: BookletCode =
                      stu.assignedBookletCode && BOOKLET_CODES.includes(stu.assignedBookletCode)
                        ? stu.assignedBookletCode
                        : BOOKLET_CODES[idx % BOOKLET_CODES.length];
                    const bNo = normalizeBookletNumber(stu.assignedBookletNumber, idx + 1);
                    const pal = resolveCoverColorPalette(
                      { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
                      getLogoPreset(cover.logoStyleId)
                    );
                    const isSelected = studentNumber === stu.studentNumber8;
                    return (
                      <div
                        key={stu.id}
                        data-testid={`omr-registered-student-card-${idx}`}
                        className={`surface-card rounded-lg p-2.5 flex items-center justify-between gap-2 border ${
                          isSelected ? 'ring-2' : ''
                        }`}
                        style={{
                          borderColor: isSelected ? pal.primaryColor : 'var(--border-subtle)',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-display font-extrabold text-white shrink-0"
                              style={{ backgroundColor: pal.primaryColor }}
                            >
                              {code}
                            </span>
                            <span className="text-xs font-bold truncate">{stu.fullName}</span>
                          </div>
                          <div className="text-[10px] font-mono-num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {stu.classroom} · Öğr:{stu.studentNumber8} · Kit:{bNo}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-testid={`omr-select-registered-row-${idx}`}
                            onClick={() => handleSelectRegisteredStudent(stu, idx)}
                            className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
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
                            className="btn-3d-secondary px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
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

            {statusMessage && (
              <div className="mb-4 rounded-lg p-3 text-xs font-semibold flex items-center gap-2 surface-alt">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <span>{statusMessage}</span>
              </div>
            )}
            {errorMsg && (
              <div className="mb-4 rounded-lg p-3 text-xs font-semibold flex items-center gap-2 bg-rose-50 text-rose-800 border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Dual Upload & Input Area: Optical Form vs Answer Key */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Optical Sheet Input */}
              <div className="surface-alt rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <h3 className="text-sm font-bold">1. Öğrenci Optik Cevapları ({cover.bookletCode} Kitapçığı)</h3>
                  </div>
                  <label className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
                    {loadingMode === 'student' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Optik Taranıyor...</span>
                      </>
                    ) : (
                      <span>Optik Dosya Yükle (Görsel/PDF/CSV)</span>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf,.csv,.txt,.json"
                      onChange={(e) => handleFileUpload(e, 'student')}
                      className="sr-only"
                    />
                  </label>
                </div>

                <label className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>
                    İşaretlenen cevaplar (boş sorular için <code className="font-mono-num">-</code> kullanın, örn.{' '}
                    <code className="font-mono-num">ABCD-E...</code> veya <code className="font-mono-num">1-A, 2-C</code>)
                  </span>
                  <textarea
                    rows={4}
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
                  <label className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
                    {loadingMode === 'key' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Anahtar Okunuyor...</span>
                      </>
                    ) : (
                      <span>Anahtar Yükle (Görsel/PDF/CSV)</span>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf,.csv,.txt,.json"
                      onChange={(e) => handleFileUpload(e, 'key')}
                      className="sr-only"
                    />
                  </label>
                </div>

                <label className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>
                    {examSourceMode === 'farkli-yayin'
                      ? `Farklı yayın (${externalPublisherConfig.publisherName || 'Harici Deneme'}) — ${cover.bookletCode} kitapçığı cevap anahtarı`
                      : `Aktif ${cover.bookletCode} kitapçığı resmi cevap anahtarı (${expectedCount} soru)`}
                  </span>
                  <textarea
                    rows={4}
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

                <div className="flex justify-between text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  <span>Anahtar Uzunluğu: {parsedKey.filter(Boolean).length} / {expectedCount}</span>
                  <span>Seçenek: {gradeProfile.optionCount} Şık</span>
                </div>
              </div>
            </div>

            {/* Evaluate 3D CTA */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Analizi başlattığınızda seçili {cover.bookletCode} kitapçığı anahtarına göre tüm ders netleri, 5 çeşit karne ve 3 detaylı analiz güncellenir.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onEvaluateNow}
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
              <div>
                <h3 className="text-base font-bold">Canlı Optik Karşılaştırma Özeti</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Yeşil: Doğru · Kırmızı: Yanlış · Gri: Boş (İlk 60 soru hızlı kontrol ızgarası)
                </p>
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
            totalQuestions={questions.length}
            exportBusy={exportBusy}
            registeredCount={institutionStudents.length}
            onSelectBookletCode={handleSelectBookletCode}
            onDownloadOpticalPdf={(code) => onDownloadOpticalPdf(code)}
            onDownloadAllOpticalPdf={onDownloadAllOpticalPdf}
            onDownloadAllOpticalZip={onDownloadAllOpticalZip}
            onDownloadRegisteredOpticalPdf={onDownloadRegisteredOpticalPdf}
          />
        </>
      )}
    </div>
  );
}
