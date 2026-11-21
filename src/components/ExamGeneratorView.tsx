import { useEffect, useState, ChangeEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  Globe,
  BookOpenCheck,
  FileUp,
  FileDown,
  Archive,
  Plus,
  Trash2,
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  PackageCheck,
  Code2,
  Layers,
  SlidersHorizontal,
  FileSpreadsheet,
  FileText,
  ListChecks,
} from 'lucide-react';
import { GRADE_PROFILES } from '../data/curriculum';
import { getLogoPreset } from '../data/logos';
import {
  BookletCode,
  CoverColorThemeId,
  CoverConfig,
  DifficultyLevel,
  DynamicCurriculumOverride,
  DynamicSourceMix,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  Institution,
  OpenEndedQuestion,
  PdfUploadStripOptions,
  PenaltyDivisor,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';
import {
  BOOKLET_CODES,
  COVER_COLOR_THEMES,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import { buildAutoExamQuestions, selectCuratedQuestions } from '../utils/examAnalysis';
import {
  buildDynamicMixedQuestions,
  buildQuestionsFromCurriculumOverride,
  extractCurriculumOverrideFromText,
  parseQuestionsSpreadsheet,
} from '../utils/dynamicQuestionSource';
import {
  computeKeptUploadedPdfIndices,
  extractPrintableTextFromPdfBytes,
  normalizeIncomingQuestionList,
  parseExamQuestionsFromRawText,
} from '../utils/examPdfParser';
import { filterGradeProfilesByInstitution } from '../utils/institutionCodes';
import { BatchBookletPanel } from './BatchBookletPanel';
import { Cover3DPreview } from './Cover3DPreview';
import { QuestionVisualPreview } from './QuestionVisualPreview';
import { TextbookExamPanel } from './TextbookExamPanel';

interface ExamGeneratorViewProps {
  institution: Institution;
  gradeProfile: GradeProfile;
  onSelectGrade: (gradeId: GradeLevelId) => void;
  penaltyDivisor?: PenaltyDivisor;
  onChangePenaltyDivisor?: (divisor: PenaltyDivisor) => void;
  questions: ExamQuestion[];
  baseQuestions?: ExamQuestion[];
  cover: CoverConfig;
  students?: StudentRecord[];
  batchAssignments?: StudentBookletAssignment[];
  onSetBatchAssignments?: (next: StudentBookletAssignment[]) => void;
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
  uploadedPdfName: string | null;
  uploadedPdfPageCount: number | null;
  pdfStripOptions: PdfUploadStripOptions;
  onUpdatePdfStripOptions: (patch: Partial<PdfUploadStripOptions>) => void;
  mebOverride: DynamicCurriculumOverride | null;
  onApplyMebCurriculum: (
    override: DynamicCurriculumOverride,
    generatedQuestions: ExamQuestion[]
  ) => void;
  onClearMebCurriculum: () => void;
  onUpdateQuestions: (questions: ExamQuestion[]) => void;
  onUpdateCover: (patch: Partial<CoverConfig>) => void;
  onUploadExamPdf: (bytes: Uint8Array, name: string, pageCount: number) => void;
  onClearExamPdf: () => void;
  onDownloadBookletPdf: () => Promise<void>;
  onDownloadOpticalPdf: () => Promise<void>;
  onDownloadZip: () => Promise<void>;
  onDownloadSourceZip: () => Promise<void>;
  onOpenEditor?: () => void;
  onOpenOpenEnded?: () => void;
  onApplyOpenEndedQuestions?: (questions: OpenEndedQuestion[]) => void;
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

export function ExamGeneratorView({
  institution,
  gradeProfile,
  onSelectGrade,
  penaltyDivisor,
  onChangePenaltyDivisor,
  questions,
  baseQuestions,
  cover,
  students = [],
  batchAssignments = [],
  onSetBatchAssignments,
  onSelectBookletVariant,
  uploadedPdfName,
  uploadedPdfPageCount,
  pdfStripOptions,
  onUpdatePdfStripOptions,
  mebOverride,
  onApplyMebCurriculum,
  onClearMebCurriculum,
  onUpdateQuestions,
  onUpdateCover,
  onUploadExamPdf,
  onClearExamPdf,
  onDownloadBookletPdf,
  onDownloadOpticalPdf,
  onDownloadZip,
  onDownloadSourceZip,
  onOpenEditor,
  onOpenOpenEnded,
  onApplyOpenEndedQuestions,
}: ExamGeneratorViewProps) {
  const allowedGradeProfiles = filterGradeProfilesByInstitution(GRADE_PROFILES, institution);
  const defaultQuestionTarget = gradeProfile.subjects.reduce((acc, s) => acc + s.questionCount, 0);

  const [aiTab, setAiTab] = useState<'pdf-processor' | 'meb-pdf' | 'dynamic-mix' | 'internet' | 'textbook'>('pdf-processor');
  const [difficultyMix, setDifficultyMix] = useState<'dengeli' | 'kolay' | 'zor'>('dengeli');
  const [targetCount, setTargetCount] = useState<number>(defaultQuestionTarget);
  const [subjectScope, setSubjectScope] = useState<string>('Tümü');
  const [show20Picker, setShow20Picker] = useState<boolean>(false);
  const [showTextbookPanel, setShowTextbookPanel] = useState<boolean>(false);
  const [pickedQuestionIds, setPickedQuestionIds] = useState<string[]>([]);

  // PDF Soru İşleyici state
  const [pdfProcText, setPdfProcText] = useState<string>('');
  const [pdfProcTargetCount, setPdfProcTargetCount] = useState<number>(20);
  const [pdfProcFileName, setPdfProcFileName] = useState<string | null>(null);
  const [pdfProcList, setPdfProcList] = useState<ExamQuestion[]>([]);
  const [pdfProcSelectedIds, setPdfProcSelectedIds] = useState<string[]>([]);

  // MEB Müfredat PDF state
  const [mebSourceTitle, setMebSourceTitle] = useState<string>(
    `MEB ${gradeProfile.shortLabel} Öğretim Programı`
  );
  const [mebCurriculumText, setMebCurriculumText] = useState<string>('');
  const [mebPdfFile, setMebPdfFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
    pageCount?: number;
  } | null>(null);
  const [mebQuestionCount, setMebQuestionCount] = useState<number>(defaultQuestionTarget);

  // Dinamik Kaynak Mikseri state
  const [sourceMix, setSourceMix] = useState<DynamicSourceMix>({
    curriculumPool: Math.max(10, Math.round(defaultQuestionTarget * 0.4)),
    mebPdf: Math.max(5, Math.round(defaultQuestionTarget * 0.3)),
    internetSearch: Math.max(5, Math.round(defaultQuestionTarget * 0.15)),
    textbookBank: Math.max(5, Math.round(defaultQuestionTarget * 0.15)),
  });
  const [customBank, setCustomBank] = useState<ExamQuestion[]>([]);
  const [customBankFileName, setCustomBankFileName] = useState<string | null>(null);

  // Internet search state
  const [searchSubject, setSearchSubject] = useState<string>(
    gradeProfile.subjects[0]?.name ?? 'Türkçe'
  );
  const [searchTopic, setSearchTopic] = useState<string>(
    gradeProfile.subjects[0]?.topics[0] ?? 'Paragrafta Ana Düşünce'
  );
  const [searchDifficulty, setSearchDifficulty] = useState<DifficultyLevel>('Orta');
  const [searchCount, setSearchCount] = useState<number>(5);
  const [webSources, setWebSources] = useState<Array<{ uri: string; title?: string }>>([]);

  // Textbook upload state
  const [textbookSubject, setTextbookSubject] = useState<string>(
    gradeProfile.subjects[0]?.name ?? 'Genel'
  );
  const [textbookText, setTextbookText] = useState<string>('');
  const [textbookFile, setTextbookFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [textbookCount, setTextbookCount] = useState<number>(5);

  // Reminders editor
  const [newReminder, setNewReminder] = useState<string>('');

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync defaults cleanly when grade changes (so 3. sınıf doesn't keep TYT subjects/counts)
  useEffect(() => {
    const total = gradeProfile.subjects.reduce((acc, s) => acc + s.questionCount, 0);
    setTargetCount(total);
    setSubjectScope('Tümü');
    setMebQuestionCount(total);
    setMebSourceTitle(`MEB ${gradeProfile.shortLabel} Öğretim Programı`);
    setSearchSubject(gradeProfile.subjects[0]?.name ?? 'Türkçe');
    setSearchTopic(gradeProfile.subjects[0]?.topics[0] ?? 'Genel Kazanım');
    setTextbookSubject(gradeProfile.subjects[0]?.name ?? 'Genel');
    setSourceMix({
      curriculumPool: Math.max(8, Math.round(total * 0.4)),
      mebPdf: Math.max(4, Math.round(total * 0.3)),
      internetSearch: Math.max(4, Math.round(total * 0.15)),
      textbookBank: Math.max(4, Math.round(total * 0.15)),
    });
  }, [gradeProfile]);

  const handleGenerateAuto = (forcedCount?: number, forcedSubject?: string) => {
    setErrorMsg(null);
    const countToUse = forcedCount ?? targetCount;
    const subjToUse = forcedSubject ?? subjectScope;
    const next = buildAutoExamQuestions(gradeProfile.id, difficultyMix, countToUse, subjToUse);
    onUpdateQuestions(next);
    onUpdateCover({
      questionCount: next.length,
      examTitle:
        countToUse === 20
          ? `${cover.academyName.split(' ')[0]} ${gradeProfile.shortLabel} 20 Soruluk Yazılıya Hazırlık${subjToUse !== 'Tümü' ? ` (${subjToUse})` : ''}`
          : cover.examTitle,
    });
    setNotice(
      `${gradeProfile.label}${subjToUse !== 'Tümü' ? ` · ${subjToUse}` : ''} müfredatına göre ${next.length} soruluk (${gradeProfile.optionCount} şıklı) ${countToUse === 20 ? 'yazılıya hazırlık denemesi' : 'deneme'} oluşturuldu.`
    );
  };

  const handleProcessExamPdfFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('pdf-proc');
    setErrorMsg(null);
    try {
      let textContent = '';
      let base64 = '';
      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
        textContent = (await file.text()).slice(0, 24000);
        setPdfProcText(textContent.slice(0, 5000));
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        textContent = extractPrintableTextFromPdfBytes(bytes);
        base64 = await fileToBase64(file);
      }

      const controller = new AbortController();
      const tid = window.setTimeout(() => controller.abort(), 7000);
      try {
        const resp = await fetch('/api/questions/from-exam-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            gradeLabel: gradeProfile.label,
            optionCount: gradeProfile.optionCount,
            fileName: file.name,
            textContent,
            fileBase64: base64 || undefined,
            fileMimeType: file.type || 'application/pdf',
            count: pdfProcTargetCount,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            const norm = normalizeIncomingQuestionList(data.questions, gradeProfile.id, file.name);
            setPdfProcFileName(file.name);
            setPdfProcList(norm);
            setPdfProcSelectedIds(norm.slice(0, pdfProcTargetCount).map((q) => q.id));
            setNotice(`PDF Soru İşleyici: "${file.name}" içinden ${norm.length} soru ayrıştırıldı.`);
            return;
          }
        }
      } catch {
        // Fallback below
      } finally {
        window.clearTimeout(tid);
      }

      const parsed = parseExamQuestionsFromRawText(
        textContent,
        gradeProfile,
        file.name,
        pdfProcTargetCount
      );
      setPdfProcFileName(file.name);
      setPdfProcList(parsed);
      setPdfProcSelectedIds(parsed.slice(0, pdfProcTargetCount).map((q) => q.id));
      setNotice(`PDF Soru İşleyici: "${file.name}" dosyasından ${parsed.length} soru hazırlandı.`);
    } finally {
      setBusy(null);
    }
  };

  const handleProcessRawText = () => {
    if (!pdfProcText.trim()) return;
    const parsed = parseExamQuestionsFromRawText(
      pdfProcText,
      gradeProfile,
      pdfProcFileName || 'PDF Metin Kaynağı',
      pdfProcTargetCount
    );
    setPdfProcList(parsed);
    setPdfProcSelectedIds(parsed.slice(0, pdfProcTargetCount).map((q) => q.id));
    setNotice(`PDF Soru İşleyici: Metinden ${parsed.length} soru ayrıştırıldı.`);
  };

  const handleApplyProcessedPdfQuestions = (openEditorAfter = false) => {
    const selected = selectCuratedQuestions(pdfProcList, pdfProcSelectedIds, pdfProcTargetCount);
    if (selected.length === 0) return;
    onUpdateQuestions(selected);
    onUpdateCover({ questionCount: selected.length });
    setNotice(`PDF Soru İşleyici ile seçilen ${selected.length} soru aktif deneme kitapçığına aktarıldı.`);
    if (openEditorAfter && onOpenEditor) {
      onOpenEditor();
    }
  };

  const handleApply20QuestionSelection = () => {
    const basePool =
      subjectScope === 'Tümü'
        ? questions
        : questions.filter((q) => q.subject === subjectScope);
    const chosen =
      pickedQuestionIds.length > 0
        ? selectCuratedQuestions(questions, pickedQuestionIds, 20)
        : basePool.length >= 20
          ? basePool.slice(0, 20).map((q, idx) => ({ ...q, number: idx + 1 }))
          : buildAutoExamQuestions(gradeProfile.id, difficultyMix, 20, subjectScope);
    onUpdateQuestions(chosen);
    onUpdateCover({
      questionCount: chosen.length,
      examTitle: `${cover.academyName.split(' ')[0]} ${gradeProfile.shortLabel} 20 Soruluk Yazılıya Hazırlık`,
    });
    setTargetCount(20);
    setShow20Picker(false);
    setNotice(`20 soruluk yazılıya hazırlık seçimi uygulandı (${chosen.length} soru).`);
  };

  const handleMebFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
        const txt = await file.text();
        setMebCurriculumText(txt.slice(0, 24000));
        setMebPdfFile(null);
        setMebSourceTitle(file.name);
        setNotice(`${file.name} MEB müfredat metni olarak yüklendi.`);
      } else {
        const buf = await file.arrayBuffer();
        let pageCount: number | undefined;
        try {
          const doc = await PDFDocument.load(new Uint8Array(buf));
          pageCount = doc.getPageCount();
        } catch {
          pageCount = undefined;
        }
        const base64 = await fileToBase64(file);
        setMebPdfFile({
          name: file.name,
          base64,
          mimeType: file.type || 'application/pdf',
          pageCount,
        });
        setMebSourceTitle(file.name);
        setNotice(
          `${file.name}${pageCount ? ` (${pageCount} sayfa)` : ''} MEB müfredat PDF’i yüklendi.`
        );
      }
    } catch {
      setErrorMsg('MEB müfredat dosyası okunamadı.');
    } finally {
      e.target.value = '';
    }
  };

  const handleApplyMebPdf = async () => {
    if (!mebPdfFile && !mebCurriculumText.trim()) {
      setErrorMsg('Lütfen MEB sayfasından indirdiğiniz PDF/TXT dosyasını seçin veya müfredat konularını yapıştırın.');
      return;
    }
    setBusy('meb-pdf');
    setErrorMsg(null);
    setNotice(null);

    const safeLabel = mebSourceTitle.trim() || mebPdfFile?.name || `MEB ${gradeProfile.shortLabel} Müfredatı`;
    try {
      const resp = await fetch('/api/curriculum/from-meb-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLabel: gradeProfile.label,
          optionCount: gradeProfile.optionCount,
          sourceName: safeLabel,
          textContent: mebCurriculumText,
          fileBase64: mebPdfFile?.base64,
          fileMimeType: mebPdfFile?.mimeType,
          count: Math.min(20, mebQuestionCount),
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const subjects = Array.isArray(data.subjects) && data.subjects.length > 0
          ? data.subjects.map((s: { name?: string; topics?: string[]; questionCount?: number }, i: number) => ({
              name: s.name || gradeProfile.subjects[i]?.name || 'Genel',
              topics: Array.isArray(s.topics) && s.topics.length > 0 ? s.topics : ['MEB Kazanım'],
              questionCount: Number(s.questionCount) || 10,
            }))
          : gradeProfile.subjects.map((s) => ({
              name: s.name,
              topics: s.topics,
              questionCount: s.questionCount,
            }));

        const override: DynamicCurriculumOverride = {
          sourceName: safeLabel,
          gradeId: gradeProfile.id,
          subjects,
          extractedAt: new Date().toLocaleDateString('tr-TR'),
          pageCount: mebPdfFile?.pageCount,
        };

        const aiQuestions: ExamQuestion[] = Array.isArray(data.questions)
          ? data.questions.map((q: Partial<ExamQuestion>, idx: number) => ({
              id: `meb-${Date.now()}-${idx}`,
              number: idx + 1,
              subject: q.subject || subjects[0]?.name || 'Türkçe',
              topic: q.topic || 'MEB Kazanımı',
              gainCode: q.gainCode || `MEB.${gradeProfile.id}.${idx + 1}`,
              difficulty: (q.difficulty as DifficultyLevel) || 'Orta',
              stem: q.stem || '',
              options: q.options || { A: '', B: '', C: '', D: '' },
              correctOption: q.correctOption || 'A',
              explanation: q.explanation || '',
              source: 'Ders Kitabı',
            }))
          : [];

        const fullBank = buildQuestionsFromCurriculumOverride(override, mebQuestionCount);
        const merged =
          aiQuestions.length > 0
            ? [...aiQuestions, ...fullBank.slice(aiQuestions.length)].map((q, i) => ({
                ...q,
                number: i + 1,
              }))
            : fullBank;

        onApplyMebCurriculum(override, merged);
        setNotice(
          `${gradeProfile.shortLabel} aktif müfredatı "${safeLabel}" belgesinden güncellendi (${merged.length} soru, ${gradeProfile.optionCount} şık).`
        );
        return;
      }

      // Yerel müfredat ayrıştırıcı fallback (API key yoksa da sorunsuz çalışır)
      const override = extractCurriculumOverrideFromText(
        mebCurriculumText || `${safeLabel}\n${gradeProfile.subjects.map((s) => s.topics.join('\n')).join('\n')}`,
        gradeProfile.id,
        safeLabel,
        mebPdfFile?.pageCount
      );
      const generated = buildQuestionsFromCurriculumOverride(override, mebQuestionCount);
      onApplyMebCurriculum(override, generated);
      setNotice(
        `${gradeProfile.shortLabel} aktif müfredatı "${safeLabel}" kaynağından yerel ayrıştırıcı ile oluşturuldu (${generated.length} soru).`
      );
    } catch {
      const override = extractCurriculumOverrideFromText(
        mebCurriculumText || `${safeLabel}\n${gradeProfile.subjects.map((s) => s.topics.join('\n')).join('\n')}`,
        gradeProfile.id,
        safeLabel,
        mebPdfFile?.pageCount
      );
      const generated = buildQuestionsFromCurriculumOverride(override, mebQuestionCount);
      onApplyMebCurriculum(override, generated);
      setNotice(
        `${gradeProfile.shortLabel} aktif müfredatı "${safeLabel}" kaynağından yerel olarak oluşturuldu (${generated.length} soru).`
      );
    } finally {
      setBusy(null);
    }
  };

  const handleCustomBankSpreadsheet = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseQuestionsSpreadsheet(buf, gradeProfile.optionCount);
      if (parsed.length === 0) {
        setErrorMsg('Excel/CSV dosyasında geçerli "Soru" sütunu bulunamadı.');
      } else {
        setCustomBank(parsed);
        setCustomBankFileName(file.name);
        setSourceMix((prev) => ({
          ...prev,
          textbookBank: Math.max(prev.textbookBank, parsed.length),
        }));
        setNotice(`${file.name} dosyasından ${parsed.length} adet soru Dinamik Soru Havuzuna eklendi.`);
      }
    } catch {
      setErrorMsg('Excel/CSV soru bankası okunamadı.');
    } finally {
      e.target.value = '';
    }
  };

  const handleBuildDynamicMix = () => {
    setErrorMsg(null);
    const mixed = buildDynamicMixedQuestions({
      gradeId: gradeProfile.id,
      mix: sourceMix,
      customBank,
      mebOverride,
      difficulty: difficultyMix,
    });
    onUpdateQuestions(mixed);
    onUpdateCover({ questionCount: mixed.length });
    setNotice(
      `Dinamik Kaynak Mikseri ile ${gradeProfile.shortLabel} (${gradeProfile.optionCount} şık) için ${mixed.length} soruluk karma deneme oluşturuldu.`
    );
  };

  const handleInternetGenerate = async () => {
    setBusy('internet');
    setErrorMsg(null);
    setNotice(null);
    try {
      const resp = await fetch('/api/questions/internet-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLabel: gradeProfile.label,
          subject: searchSubject,
          topic: searchTopic,
          count: searchCount,
          optionCount: gradeProfile.optionCount,
          difficulty: searchDifficulty,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'İnternetten soru üretilemedi.');

      const incoming = (data.questions ?? []) as Array<Partial<ExamQuestion>>;
      const mapped: ExamQuestion[] = incoming.map((q, idx) => ({
        id: `web-${Date.now()}-${idx}`,
        number: idx + 1,
        subject: q.subject || searchSubject,
        topic: q.topic || searchTopic,
        gainCode: q.gainCode || `WEB.${idx + 1}`,
        difficulty: (q.difficulty as DifficultyLevel) || searchDifficulty,
        stem: q.stem || '',
        options: q.options || { A: '', B: '', C: '', D: '' },
        correctOption: q.correctOption || 'A',
        explanation: q.explanation || '',
        source: 'İnternet Araştırması',
        sourceUrl: data.sources?.[0]?.uri,
      }));

      const merged = [...mapped, ...questions.slice(mapped.length)].map((q, i) => ({
        ...q,
        number: i + 1,
      }));
      onUpdateQuestions(merged);
      setWebSources(data.sources ?? []);
      setNotice(
        `İnternet araştırması ile "${searchTopic}" konusunda ${mapped.length} güncel soru oluşturuldu ve kitapçığa eklendi.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bağlantı hatası.');
    } finally {
      setBusy(null);
    }
  };

  const handleTextbookFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
        const txt = await file.text();
        setTextbookText(txt.slice(0, 24000));
        setTextbookFile(null);
      } else {
        const base64 = await fileToBase64(file);
        setTextbookFile({
          name: file.name,
          base64,
          mimeType: file.type || 'application/pdf',
        });
      }
      setNotice(`${file.name} ders kitabı kaynağı olarak yüklendi.`);
    } catch {
      setErrorMsg('Ders kitabı dosyası okunamadı.');
    } finally {
      e.target.value = '';
    }
  };

  const handleTextbookGenerate = async () => {
    if (!textbookText.trim() && !textbookFile) {
      setErrorMsg('Lütfen bir ders kitabı PDF/TXT dosyası yükleyin veya konu metni yapıştırın.');
      return;
    }
    setBusy('textbook');
    setErrorMsg(null);
    setNotice(null);
    try {
      const resp = await fetch('/api/questions/from-textbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLabel: gradeProfile.label,
          subject: textbookSubject,
          count: textbookCount,
          optionCount: gradeProfile.optionCount,
          textContent: textbookText,
          fileBase64: textbookFile?.base64,
          fileMimeType: textbookFile?.mimeType,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Ders kitabından soru oluşturulamadı.');

      const incoming = (data.questions ?? []) as Array<Partial<ExamQuestion>>;
      const mapped: ExamQuestion[] = incoming.map((q, idx) => ({
        id: `book-${Date.now()}-${idx}`,
        number: idx + 1,
        subject: q.subject || textbookSubject,
        topic: q.topic || 'Ders Kitabı Ünitesi',
        gainCode: q.gainCode || `KITAP.${idx + 1}`,
        difficulty: (q.difficulty as DifficultyLevel) || 'Orta',
        stem: q.stem || '',
        options: q.options || { A: '', B: '', C: '', D: '' },
        correctOption: q.correctOption || 'A',
        explanation: q.explanation || '',
        source: 'Ders Kitabı',
      }));

      const merged = [...mapped, ...questions.slice(mapped.length)].map((q, i) => ({
        ...q,
        number: i + 1,
      }));
      onUpdateQuestions(merged);
      setNotice(
        `Ders kitabı içeriğinden ${mapped.length} adet özgün soru üretilip deneme kitapçığına eklendi.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ders kitabı analiz hatası.');
    } finally {
      setBusy(null);
    }
  };

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(buf);
      const pages = doc.getPageCount();
      onUploadExamPdf(buf, file.name, pages);
      onUpdateCover({ questionCount: 120 });
      setNotice(
        `${file.name} (${pages} sayfa) yüklendi. Doğruluk Akademi kapak tasarımı, Furkan imzası ve Çoğaltılamaz damgası ile birleştirilmeye hazır.`
      );
    } catch {
      setErrorMsg('PDF dosyası geçerli değil veya şifre korumalı.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddReminder = () => {
    const val = newReminder.trim();
    if (!val) return;
    onUpdateCover({ reminders: [...cover.reminders, val] });
    setNewReminder('');
  };

  const handleRemoveReminder = (idx: number) => {
    onUpdateCover({
      reminders: cover.reminders.filter((_, i) => i !== idx),
    });
  };

  const totalMixCount =
    sourceMix.curriculumPool +
    sourceMix.mebPdf +
    sourceMix.internetSearch +
    sourceMix.textbookBank;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              PDF Soru İşleyici, Deneme Yapma Yöntemleri & Tam Paket ZIP Merkezi
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {gradeProfile.shortLabel} düzeyinde hazır PDF’ten soru işleyin, 20 soruluk yazılıya hazırlık denemesi seçin veya 10 soruluk açık uçlu sınav kağıdı analiz edin.
            </p>
          </div>
          <div className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
            Aktif Havuz: {questions.length} Soru · {gradeProfile.shortLabel} ({gradeProfile.optionCount} Şık)
          </div>
        </div>

        {/* Denemeler Yapma Yöntemi Bar */}
        <div
          className="pt-3 border-t flex flex-wrap items-center gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
          data-testid="exam-methods-bar"
        >
          <span className="text-xs font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
            Deneme Yapma Yöntemi:
          </span>
          <button
            type="button"
            onClick={() => {
              setAiTab('pdf-processor');
              document
                .querySelector('[data-testid="dynamic-source-section"]')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>1. PDF Soru İşleyici</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetCount(20);
              setShow20Picker(true);
              handleGenerateAuto(20, subjectScope);
            }}
            data-testid="quick-20-yazili-btn"
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
            <span>2. 20 Soruluk Yazılıya Hazırlık</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetCount(defaultQuestionTarget);
              setShow20Picker(false);
              handleGenerateAuto(defaultQuestionTarget, 'Tümü');
            }}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>3. Tam Müfredat Denemesi ({defaultQuestionTarget} Soru)</span>
          </button>
          {onOpenOpenEnded && (
            <button
              type="button"
              onClick={onOpenOpenEnded}
              data-testid="quick-10-open-ended-btn"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>4. 10 Soruluk Açık Uçlu & Kağıt Analizi</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowTextbookPanel(true);
              window.setTimeout(() => {
                document
                  .getElementById('textbook-exam-studio-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 60);
            }}
            data-testid="quick-open-textbook-panel-btn"
            className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpenCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>5. Ders Kitabı PDF (Deneme / Yazılı Paneli)</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 surface-card">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 bg-rose-50 text-rose-800 border border-rose-200">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* DUAL PRIMARY WORKFLOW: 1) DENEME PDF YÜKLEME + 2) OTOMATİK DENEME OLUŞTURMA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Deneme Yükleme (PDF) */}
        <section aria-labelledby="upload-pdf-title" className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <h3 id="upload-pdf-title" className="text-base font-bold">
                  1. Hazır Deneme Yükleme (PDF)
                </h3>
              </div>
              {uploadedPdfName && (
                <span className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                  Yüklendi ({uploadedPdfPageCount} sayfa)
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Hazır deneme PDF’inizi yükleyin; sistem 1. sayfaya <strong>Doğruluk Akademi</strong> kapağını, <strong>{cover.signatureName}</strong> imzasını, <strong>ÇOĞALTILAMAZ</strong> mührünü ve hatırlatmaları otomatik yerleştirir.
            </p>

            <label className="surface-alt rounded-xl p-5 border-2 border-dashed flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition-colors hover:opacity-95" style={{ borderColor: 'var(--border-subtle)' }}>
              <FileUp className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span className="text-sm font-bold">
                {uploadedPdfName ? `Seçili PDF: ${uploadedPdfName}` : 'Hazır Deneme PDF Dosyası Seç veya Bırak'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                PDF formatı (.pdf) · Tüm sayfalara güvenlik alt bilgisi işlenir
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfUpload}
                className="sr-only"
              />
            </label>

            {/* Yüklenen Deneme Ön/Arka Kapak Temizleme ve Kuruma Özel Arka Kapak Seçenekleri */}
            <div
              className="surface-alt rounded-xl p-3.5 space-y-2 text-xs"
              data-testid="pdf-strip-options-panel"
            >
              <div className="font-bold">Dış Kapak Temizleme & Arka Sayfa Ayarları</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdfStripOptions.stripFrontCover}
                  onChange={(e) => onUpdatePdfStripOptions({ stripFrontCover: e.target.checked })}
                  className="rounded accent-blue-600"
                />
                <span>İlk Sayfayı (Orijinal Dış Kapağı) Sil — yerine kendi kapağımızı koy</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdfStripOptions.stripBackCover}
                  onChange={(e) => onUpdatePdfStripOptions({ stripBackCover: e.target.checked })}
                  className="rounded accent-blue-600"
                />
                <span>Son Sayfayı (Başka Kuruma Ait Arka Sayfayı) Sil</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdfStripOptions.appendBrandedBackPage}
                  onChange={(e) =>
                    onUpdatePdfStripOptions({ appendBrandedBackPage: e.target.checked })
                  }
                  className="rounded accent-blue-600"
                />
                <span>
                  Kuruma Özel Arka Sayfa Ekle ({cover.academyName})
                </span>
              </label>

              {uploadedPdfPageCount !== null && (
                <div
                  className="pt-2 border-t text-[11px] font-mono-num font-bold"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--accent-primary)' }}
                >
                  {(() => {
                    const kept = computeKeptUploadedPdfIndices(uploadedPdfPageCount, pdfStripOptions);
                    const totalOut = 1 + kept.length + (pdfStripOptions.appendBrandedBackPage ? 1 : 0);
                    return `Çıktı Özeti: 1 Ön Kapak + ${kept.length} İç Sayfa${
                      pdfStripOptions.appendBrandedBackPage ? ' + 1 Kuruma Özel Arka Kapak' : ''
                    } = ${totalOut} Sayfa`;
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onDownloadBookletPdf}
              className="btn-3d flex-1 py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Kapaklı Deneme PDF İndir</span>
            </button>
            {uploadedPdfName && (
              <button
                type="button"
                onClick={onClearExamPdf}
                className="btn-3d-secondary px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                PDF’i Kaldır
              </button>
            )}
          </div>
        </section>

        {/* Card B: Otomatik Deneme Oluşturma */}
        <section aria-labelledby="auto-exam-title" className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <h3 id="auto-exam-title" className="text-base font-bold">
                  2. Otomatik Deneme Oluşturma (Sınıf Bazlı)
                </h3>
              </div>
              <span className="text-xs font-mono-num font-bold whitespace-nowrap shrink-0" style={{ color: 'var(--chart-3)' }}>
                {questions.length} Soru Hazır
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Kurum yetki kapsamınızdaki sınıf düzeylerinden birini seçin ({institution.name}). 3–8. sınıflar 4 şıklı, lise/YKS 5 şıklı olarak hazırlanır.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Yetkili Sınıf / Sınav</span>
                <select
                  value={gradeProfile.id}
                  onChange={(e) => onSelectGrade(e.target.value as GradeLevelId)}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
                  {allowedGradeProfiles.map((gp) => (
                    <option key={gp.id} value={gp.id}>
                      {gp.shortLabel} ({gp.category})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders Kapsamı</span>
                <select
                  value={subjectScope}
                  onChange={(e) => setSubjectScope(e.target.value)}
                  aria-label="Deneme Ders Kapsamı"
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
                  <option value="Tümü">Karma (Tüm Dersler)</option>
                  {gradeProfile.subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Soru Sayısı</span>
                <select
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  aria-label="Otomatik Deneme Soru Sayısı"
                  data-testid="exam-question-count-select"
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
                  <option value={20}>20 Soru (Yazılıya Hazırlık)</option>
                  <option value={defaultQuestionTarget}>
                    {defaultQuestionTarget} Soru ({gradeProfile.shortLabel} Standardı)
                  </option>
                  <option value={40}>40 Soru (Alan Tarama)</option>
                  <option value={60}>60 Soru (İlk/Ortaokul)</option>
                  <option value={80}>80 Soru (AYT Alan)</option>
                  <option value={90}>90 Soru (LGS Tam)</option>
                  <option value={120}>120 Soru (Tam Kitapçık)</option>
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Zorluk Profili</span>
                <select
                  value={difficultyMix}
                  onChange={(e) =>
                    setDifficultyMix(e.target.value as 'dengeli' | 'kolay' | 'zor')
                  }
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
                  <option value="dengeli">Dengeli (%35K · %45O · %20Z)</option>
                  <option value="kolay">Pekiştirme (%55K · %35O · %10Z)</option>
                  <option value="zor">Derece & Seçici (%20K · %40O · %40Z)</option>
                </select>
              </label>

              {onChangePenaltyDivisor && (
                <label className="block text-xs font-semibold sm:col-span-2 lg:col-span-4">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Doğru-Yanlış Götürme Ayarı (3., 4., 5. Sınıf & Tüm Düzeyler)
                  </span>
                  <select
                    data-testid="generator-penalty-select"
                    value={penaltyDivisor ?? gradeProfile.penaltyDivisor}
                    onChange={(e) =>
                      onChangePenaltyDivisor(Number(e.target.value) as PenaltyDivisor)
                    }
                    className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt font-semibold"
                  >
                    <option value={0}>Yanlış Doğruyu Götürmez (Net = Doğru · 3–5. Sınıf Seçeneği)</option>
                    <option value={3}>3 Yanlış 1 Doğruyu Götürür (Ortaokul / İlkokul / LGS)</option>
                    <option value={4}>4 Yanlış 1 Doğruyu Götürür (Lise / YKS)</option>
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleGenerateAuto()}
              className="btn-3d flex-1 py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{targetCount} Soruluk Otomatik Deneme Oluştur</span>
            </button>
            <button
              type="button"
              onClick={() => setShow20Picker((v) => !v)}
              data-testid="select-20-quiz-btn"
              className="btn-3d-secondary px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
              <span>20 Soruluk Soru Seçimi</span>
            </button>
            <button
              type="button"
              onClick={onDownloadOpticalPdf}
              className="btn-3d-secondary px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Optik Form PDF</span>
            </button>
          </div>
        </section>
      </div>

      {/* 20 SORULUK YAZILIYA HAZIRLIK & SORU SEÇİMİ PANELİ */}
      {show20Picker && (
        <section
          className="surface-card rounded-xl p-5 space-y-4 border-l-4"
          style={{ borderLeftColor: 'var(--accent-primary)' }}
          data-testid="quiz-20-selector-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">
                20 Soruluk Yazılıya Hazırlık & Soru Seçimi ({subjectScope === 'Tümü' ? 'Tüm Dersler' : subjectScope})
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Aşağıdaki havuzdan en fazla 20 soru işaretleyin veya otomatik 20 yazılı sorusu oluşturun ({pickedQuestionIds.length}/20 seçili).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const filtered =
                    subjectScope === 'Tümü'
                      ? questions
                      : questions.filter((q) => q.subject === subjectScope);
                  setPickedQuestionIds(filtered.slice(0, 20).map((q) => q.id));
                }}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                İlk 20 Soruyu Seç
              </button>
              <button
                type="button"
                onClick={handleApply20QuestionSelection}
                data-testid="apply-20-quiz-btn"
                className="btn-3d px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                20 Soruluk Deneme Olarak Uygula
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
            {(subjectScope === 'Tümü'
              ? questions
              : questions.filter((q) => q.subject === subjectScope)
            )
              .slice(0, 40)
              .map((q) => {
                const checked = pickedQuestionIds.includes(q.id);
                return (
                  <label
                    key={q.id}
                    className={`surface-alt rounded-lg p-2.5 text-xs flex items-start gap-2 cursor-pointer border ${
                      checked ? 'border-blue-500' : 'border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (pickedQuestionIds.length >= 20) return;
                          setPickedQuestionIds((prev) => [...prev, q.id]);
                        } else {
                          setPickedQuestionIds((prev) => prev.filter((id) => id !== q.id));
                        }
                      }}
                      className="mt-0.5 rounded accent-blue-600"
                    />
                    <div className="min-w-0">
                      <div className="font-bold truncate">
                        S{q.number} · {q.subject}
                      </div>
                      <div className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {q.stem}
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>
        </section>
      )}

      {/* TAM PAKET ZIP MERKEZİ */}
      <section aria-labelledby="full-zip-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h3 id="full-zip-title" className="text-base font-bold">
                Tam Paket ZIP Merkezi (Tüm Sistem Tek Dosyada)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {uploadedPdfName
                  ? `Yüklenen "${uploadedPdfName}" PDF’i, Furkan imzalı kapak ve 5 çeşit analiz karnesi tek ZIP’e paketlenir.`
                  : `${questions.length} soruluk otomatik deneme kitapçığı, optik form, 5 çeşit karne ve Konu Kazanım Matrisi tek ZIP’e paketlenir.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onDownloadZip}
              className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Archive className="w-4 h-4" aria-hidden="true" />
              <span>Tam Sınav & Karne Paketi (.ZIP) İndir</span>
            </button>
            <button
              type="button"
              onClick={onDownloadSourceZip}
              className="btn-3d-secondary px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Code2 className="w-4 h-4" aria-hidden="true" />
              <span>Uygulama Kaynak Kodu (.ZIP)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {[
            { file: '01_Dogruluk_Akademi_Panel.html', desc: '10 Temalı Taşınabilir Panel' },
            { file: '02_Deneme_Kitapcigi_Furkan_Imzali.pdf', desc: 'Kapaklı & Çoğaltılamaz PDF' },
            { file: '03_Optik_Form_Sablonu.pdf', desc: 'ÖSYM/MEB Tipi Optik Kağıdı' },
            { file: '04_Cevap_Anahtari_ve_Sorular.json', desc: 'Tüm Soru & Analiz Verisi' },
            { file: '05_Cevap_Anahtari.csv', desc: 'Excel Uyumlu Cevap Anahtarı' },
            { file: '06_5_Cesit_Analiz_Karnesi.html', desc: '5 Karne & Kazanım Matrisi' },
            { file: '07_Konu_Kazanim_Matrisi.csv', desc: 'Konu Başarı Yüzdeleri CSV' },
            { file: '08_Dogruluk_Akademi_3D_Afis.png', desc: 'Kurumsal Duyuru Afişi PNG' },
          ].map((item) => (
            <div key={item.file} className="surface-alt rounded-lg px-3 py-2 space-y-0.5">
              <div className="font-mono-num font-semibold break-all text-[11px]">{item.file}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. PDF SORU İŞLEYİCİ, DİNAMİK SORU KAYNAĞI & MEB MÜFREDAT MERKEZİ */}
      <section aria-labelledby="ai-sources-title" data-testid="dynamic-source-section" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="ai-sources-title" className="text-base font-bold">
              3. PDF Soru İşleyici & Dinamik Soru Kaynağı Merkezi
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Hazır PDF’ten soruları ayıklayıp seçin, MEB müfredat PDF’i ile {gradeProfile.shortLabel} havuzu kurun veya çoklu kaynakları harmanlayın.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAiTab('pdf-processor')}
              data-testid="tab-pdf-processor"
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                aiTab === 'pdf-processor' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PDF Soru İşleyici</span>
            </button>
            <button
              type="button"
              onClick={() => setAiTab('meb-pdf')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                aiTab === 'meb-pdf' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>MEB Müfredat PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setAiTab('dynamic-mix')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                aiTab === 'dynamic-mix' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dinamik Kaynak Mikseri</span>
            </button>
            <button
              type="button"
              onClick={() => setAiTab('internet')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                aiTab === 'internet' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>İnternetten Bul</span>
            </button>
            <button
              type="button"
              onClick={() => setAiTab('textbook')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                aiTab === 'textbook' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <BookOpenCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ders Kitabı Yükle</span>
            </button>
          </div>
        </div>

        {/* TAB 0: PDF SORU İŞLEYİCİ */}
        {aiTab === 'pdf-processor' && (
          <div className="surface-alt rounded-xl p-4 space-y-4" data-testid="pdf-processor-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">
                  PDF Soru İşleyici — Soruları Ayıkla, Seç & Denemeye Dönüştür ({gradeProfile.shortLabel})
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  PDF veya TXT sınav dosyası yükleyin ya da soru metni yapıştırın; işlenen sorulardan istediklerinizi seçip 20 soruluk veya tam deneme olarak aktarın.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pdfProcTargetCount}
                  onChange={(e) => setPdfProcTargetCount(Number(e.target.value))}
                  aria-label="PDF işleyici hedef soru sayısı"
                  className="rounded-lg px-2.5 py-2 text-xs font-bold surface-card"
                >
                  <option value={10}>10 Soru</option>
                  <option value={20}>20 Soru (Yazılıya Hazırlık)</option>
                  <option value={40}>40 Soru</option>
                </select>
                <label className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                  {busy === 'pdf-proc' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>PDF İşleniyor...</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>PDF / TXT Yükle & İşle</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleProcessExamPdfFile}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <label className="lg:col-span-9 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Veya PDF’ten Kopyalanan Soruları Buraya Yapıştırın (1. ... A) ... B) ...)
                </span>
                <textarea
                  rows={3}
                  value={pdfProcText}
                  onChange={(e) => setPdfProcText(e.target.value)}
                  placeholder="1. Bir sınıftaki 18 öğrencinin yarısı gözlüklüdür. Gözlüksüz kaç öğrenci vardır? A) 6 B) 9 C) 10 D) 12 Cevap: B"
                  className="mt-1 w-full rounded-lg p-2.5 text-xs surface-card"
                />
              </label>
              <div className="lg:col-span-3">
                <button
                  type="button"
                  disabled={!pdfProcText.trim()}
                  onClick={handleProcessRawText}
                  data-testid="pdf-proc-parse-text-btn"
                  className="btn-3d-secondary w-full py-2.5 px-3 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Metindeki Soruları İşle
                </button>
              </div>
            </div>

            {pdfProcList.length > 0 && (
              <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: 'var(--accent-primary)' }}>
                    İşlenen Sorular ({pdfProcSelectedIds.length} / {pdfProcList.length} seçili)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyProcessedPdfQuestions(false)}
                      data-testid="apply-processed-pdf-btn"
                      className="btn-3d px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Seçilenleri Aktif Denemeye Aktar
                    </button>
                    {onOpenEditor && (
                      <button
                        type="button"
                        onClick={() => handleApplyProcessedPdfQuestions(true)}
                        className="btn-3d-secondary px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Aktar & Editörde Aç
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {pdfProcList.map((q) => {
                    const checked = pdfProcSelectedIds.includes(q.id);
                    return (
                      <label
                        key={q.id}
                        className="surface-card rounded-lg p-3 text-xs flex items-start gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPdfProcSelectedIds((prev) => [...prev, q.id]);
                            } else {
                              setPdfProcSelectedIds((prev) => prev.filter((id) => id !== q.id));
                            }
                          }}
                          className="mt-0.5 rounded accent-blue-600"
                        />
                        <div className="min-w-0">
                          <div className="font-bold">
                            Soru {q.number} · {q.subject} · Cevap: {q.correctOption}
                          </div>
                          <div className="text-[11px] line-clamp-2 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {q.stem}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: MEB Müfredat PDF Yükle & Aktif Müfredat Güncelle */}
        {aiTab === 'meb-pdf' && (
          <div className="surface-alt rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold">
                Resmi MEB Müfredat & EBA Kaynak Bağlantıları ({gradeProfile.shortLabel} · {gradeProfile.optionCount} Şık):
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="https://mufredat.meb.gov.tr"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <span>mufredat.meb.gov.tr</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
                <a
                  href="https://ogmmateryal.eba.gov.tr"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <span>ogmmateryal.eba.gov.tr</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
                <a
                  href="https://www.eba.gov.tr"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <span>eba.gov.tr</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            </div>

            {mebOverride && (
              <div className="surface-card rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold" style={{ color: 'var(--chart-3)' }}>
                    Aktif MEB Müfredatı:
                  </span>{' '}
                  <strong>{mebOverride.sourceName}</strong> ({mebOverride.subjects.length} ders · {mebOverride.extractedAt})
                </div>
                <button
                  type="button"
                  onClick={onClearMebCurriculum}
                  className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer"
                >
                  Varsayılan Müfredata Dön
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>MEB Kaynak Adı / Belge Başlığı</span>
                <input
                  type="text"
                  value={mebSourceTitle}
                  onChange={(e) => setMebSourceTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Üretilecek Soru Sayısı</span>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={mebQuestionCount}
                  onChange={(e) => setMebQuestionCount(Math.max(10, Number(e.target.value) || 40))}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card font-mono-num"
                />
              </label>

              <div className="flex items-end">
                <label className="btn-3d-secondary w-full py-2 px-4 rounded-xl text-xs font-bold text-center cursor-pointer inline-flex items-center justify-center gap-1.5">
                  <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {mebPdfFile ? `PDF: ${mebPdfFile.name}` : 'MEB Müfredat PDF / TXT Seç'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleMebFileSelect}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>
                Veya MEB Sayfasındaki Ünite / Kazanım Listesini Buraya Yapıştırın ({gradeProfile.shortLabel})
              </span>
              <textarea
                rows={4}
                value={mebCurriculumText}
                onChange={(e) => setMebCurriculumText(e.target.value)}
                placeholder={`Örn (${gradeProfile.shortLabel}):\n1. Doğal Sayılarla Dört İşlem\n2. Kesirler ve Ondalık Gösterim\n3. Paragrafta Anlam ve Söz Sanatları\n4. Kuvvet ve Hareket`}
                className="mt-1.5 w-full rounded-lg p-3 text-xs surface-card"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy === 'meb-pdf'}
                onClick={handleApplyMebPdf}
                className="btn-3d px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {busy === 'meb-pdf' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>MEB Müfredatı İşleniyor...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" aria-hidden="true" />
                    <span>MEB PDF ile Aktif Müfredatı Kur ({gradeProfile.shortLabel})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Dinamik Kaynak Mikseri & Excel Soru Bankası */}
        {aiTab === 'dynamic-mix' && (
          <div className="surface-alt rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="surface-card rounded-lg p-3 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Müfredat Havuzu (Adet)</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={sourceMix.curriculumPool}
                  onChange={(e) =>
                    setSourceMix((p) => ({ ...p, curriculumPool: Math.max(0, Number(e.target.value)) }))
                  }
                  className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono-num surface-alt"
                />
              </label>

              <label className="surface-card rounded-lg p-3 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>MEB Müfredat PDF (Adet)</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={sourceMix.mebPdf}
                  onChange={(e) =>
                    setSourceMix((p) => ({ ...p, mebPdf: Math.max(0, Number(e.target.value)) }))
                  }
                  className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono-num surface-alt"
                />
              </label>

              <label className="surface-card rounded-lg p-3 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>İnternet Araştırması (Adet)</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={sourceMix.internetSearch}
                  onChange={(e) =>
                    setSourceMix((p) => ({ ...p, internetSearch: Math.max(0, Number(e.target.value)) }))
                  }
                  className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono-num surface-alt"
                />
              </label>

              <label className="surface-card rounded-lg p-3 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Özel Soru Bankası / Excel</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={sourceMix.textbookBank}
                  onChange={(e) =>
                    setSourceMix((p) => ({ ...p, textbookBank: Math.max(0, Number(e.target.value)) }))
                  }
                  className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono-num surface-alt"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="btn-3d-secondary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>
                  {customBankFileName
                    ? `Excel Banka: ${customBankFileName} (${customBank.length} soru)`
                    : 'Excel / CSV Soru Bankası İçe Aktar'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleCustomBankSpreadsheet}
                  className="sr-only"
                />
              </label>

              <button
                type="button"
                onClick={handleBuildDynamicMix}
                className="btn-3d px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                <span>Dinamik Karma Deneme Oluştur ({totalMixCount} Soru · {gradeProfile.optionCount} Şık)</span>
              </button>
            </div>
          </div>
        )}

        {aiTab === 'internet' && (
          <div className="surface-alt rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders</span>
                <select
                  value={searchSubject}
                  onChange={(e) => setSearchSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-card"
                >
                  {gradeProfile.subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Araştırılacak Konu / Kazanım</span>
                <input
                  type="text"
                  value={searchTopic}
                  onChange={(e) => setSearchTopic(e.target.value)}
                  placeholder="Örn: Kesirler, Üslü İfadeler, Paragraf..."
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-card"
                />
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Zorluk & Adet</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <select
                    value={searchDifficulty}
                    onChange={(e) => setSearchDifficulty(e.target.value as DifficultyLevel)}
                    className="rounded-lg px-2 py-2 text-sm surface-card"
                  >
                    <option value="Kolay">Kolay</option>
                    <option value="Orta">Orta</option>
                    <option value="Zor">Zor</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={searchCount}
                    onChange={(e) => setSearchCount(Number(e.target.value))}
                    className="rounded-lg px-2 py-2 text-sm surface-card font-mono-num"
                  />
                </div>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={busy === 'internet'}
                  onClick={handleInternetGenerate}
                  className="btn-3d w-full py-2.5 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {busy === 'internet' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>İnternette Aranıyor...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" aria-hidden="true" />
                      <span>İnternetten Bul ve Üret</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {webSources.length > 0 && (
              <div className="text-xs pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="font-bold">Başvurulan İnternet Kaynakları:</span>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {webSources.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      <span>{s.title || s.uri}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {aiTab === 'textbook' && (
          <div className="surface-alt rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders</span>
                <select
                  value={textbookSubject}
                  onChange={(e) => setTextbookSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-card"
                >
                  {gradeProfile.subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Üretilecek Soru Adedi</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={textbookCount}
                  onChange={(e) => setTextbookCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-card font-mono-num"
                />
              </label>
              <div className="flex items-end">
                <label className="btn-3d-secondary w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center cursor-pointer">
                  {textbookFile
                    ? `Yüklendi: ${textbookFile.name}`
                    : 'Ders Kitabı PDF / TXT Yükle'}
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    onChange={handleTextbookFile}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>
                Veya Ders Kitabı Bölüm Metnini Buraya Yapıştırın
              </span>
              <textarea
                rows={4}
                value={textbookText}
                onChange={(e) => setTextbookText(e.target.value)}
                placeholder="Ders kitabındaki ünite metnini, tanım ve örnekleri buraya yapıştırarak doğrudan buradan soru üretebilirsiniz..."
                className="mt-1.5 w-full rounded-lg p-3 text-xs surface-card"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy === 'textbook'}
                onClick={handleTextbookGenerate}
                className="btn-3d px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {busy === 'textbook' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Ders Kitabı Analiz Ediliyor...</span>
                  </>
                ) : (
                  <>
                    <BookOpenCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Ders Kitabından Soru Oluştur</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Cover Customization + 3D Cover Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 surface-card rounded-xl p-5 space-y-4">
          <h3 className="text-base font-bold">
            Doğruluk Akademi Kapak Tasarımı, İmza & Hatırlatma Ayarları
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="block text-xs font-semibold sm:col-span-2">
              <span style={{ color: 'var(--text-secondary)' }}>Deneme Kitapçığı Başlığı</span>
              <input
                type="text"
                value={cover.examTitle}
                onChange={(e) => onUpdateCover({ examTitle: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold sm:col-span-2">
              <span style={{ color: 'var(--text-secondary)' }}>Alt Başlık</span>
              <input
                type="text"
                value={cover.subtitle}
                onChange={(e) => onUpdateCover({ subtitle: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>İmza Sahibi</span>
              <input
                type="text"
                value={cover.signatureName}
                onChange={(e) => onUpdateCover({ signatureName: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Ünvan</span>
              <input
                type="text"
                value={cover.signatureTitle}
                onChange={(e) => onUpdateCover({ signatureTitle: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Kitapçık Türü (A · B · C · D)</span>
              <select
                data-testid="cover-booklet-code-select"
                value={cover.bookletCode}
                onChange={(e) => {
                  const nextCode = e.target.value as BookletCode;
                  if (onSelectBookletVariant) {
                    onSelectBookletVariant(nextCode, { autoSyncAnswerKey: true });
                  } else {
                    onUpdateCover({ bookletCode: nextCode });
                  }
                }}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-bold"
              >
                {BOOKLET_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} Kitapçığı (Otomatik Sıralı &amp; Kodlu)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Kitapçık Numarası (6 Hane)</span>
              <input
                type="text"
                maxLength={6}
                data-testid="cover-booklet-number-input"
                value={cover.bookletNumber ?? '050001'}
                onChange={(e) =>
                  onUpdateCover({ bookletNumber: e.target.value.replace(/\D/g, '').slice(0, 6) })
                }
                placeholder="050001"
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-mono-num font-bold"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Kapak &amp; Sayfa Grafik Renk Tasarımı</span>
              <select
                data-testid="cover-color-theme-select"
                value={cover.coverColorThemeId ?? 'otomatik-abcd'}
                onChange={(e) =>
                  onUpdateCover({ coverColorThemeId: e.target.value as CoverColorThemeId })
                }
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-semibold"
              >
                {COVER_COLOR_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Sınıf Başlığı (Her Sayfa Üstü)</span>
              <input
                type="text"
                data-testid="cover-grade-label-input"
                value={cover.gradeLabel ?? gradeProfile.shortLabel}
                onChange={(e) => onUpdateCover({ gradeLabel: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Sınav Süresi (Dakika)</span>
              <input
                type="number"
                value={cover.durationMinutes}
                onChange={(e) => onUpdateCover({ durationMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt font-mono-num"
              />
            </label>
            <div className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Aktif Renk Paleti Önizleme</span>
              {(() => {
                const pal = resolveCoverColorPalette(cover, getLogoPreset(cover.logoStyleId));
                return (
                  <div className="mt-1 surface-alt rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{pal.themeLabel}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span
                        className="w-4 h-4 rounded border border-white/50"
                        style={{ backgroundColor: pal.secondaryColor }}
                      />
                      <span
                        className="w-4 h-4 rounded border border-white/50"
                        style={{ backgroundColor: pal.primaryColor }}
                      />
                      <span
                        className="w-4 h-4 rounded border border-white/50"
                        style={{ backgroundColor: pal.goldColor }}
                      />
                    </span>
                  </div>
                );
              })()}
            </div>
            <label className="block text-xs font-semibold sm:col-span-2">
              <span style={{ color: 'var(--text-secondary)' }}>
                Çoğaltılamaz Güvenlik & Telif İbaresi
              </span>
              <input
                type="text"
                value={cover.securityNotice}
                onChange={(e) => onUpdateCover({ securityNotice: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              />
            </label>
          </div>

          <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-xs font-bold mb-2">Deneme Kapağında Hatırlatmalar</div>
            <div className="space-y-2 mb-3">
              {cover.reminders.map((rem, idx) => (
                <div
                  key={idx}
                  className="surface-alt rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <span>
                    <strong>{idx + 1}.</strong> {rem}
                  </span>
                  <button
                    type="button"
                    aria-label={`Hatırlatma ${idx + 1} sil`}
                    onClick={() => handleRemoveReminder(idx)}
                    className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newReminder}
                onChange={(e) => setNewReminder(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                placeholder="Yeni kapak hatırlatması ekle..."
                className="flex-1 rounded-lg px-3 py-2 text-xs surface-alt"
              />
              <button
                type="button"
                onClick={handleAddReminder}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ekle</span>
              </button>
            </div>
          </div>
        </section>

        <div className="lg:col-span-6">
          <Cover3DPreview cover={cover} />
        </div>
      </div>

      {/* SINIF BAZLI ÇOKLU (50 ADET) A-B-C-D KİTAPÇIK & ÖĞRENCİ NUMARASI DAĞITIM PANELİ */}
      <BatchBookletPanel
        institution={institution}
        gradeProfile={gradeProfile}
        baseQuestions={baseQuestions ?? questions}
        cover={cover}
        students={students}
        assignments={batchAssignments}
        onSetAssignments={(next) => onSetBatchAssignments?.(next)}
        onApplyAssignment={(row) => {
          if (onSelectBookletVariant) {
            onSelectBookletVariant(row.bookletCode, {
              bookletNumber: row.bookletNumber,
              studentName: row.studentName,
              studentNumber: row.studentNumber8,
              classroom: row.classroom,
              autoSyncAnswerKey: true,
            });
          } else {
            onUpdateCover({
              bookletCode: row.bookletCode,
              bookletNumber: row.bookletNumber,
            });
          }
          setNotice(
            `${row.studentName} (${row.classroom}) için ${row.bookletCode} Kitapçığı · No: ${row.bookletNumber} seçildi (kapak, optik ve cevap anahtarı eşlendi).`
          );
        }}
        onSelectBookletCode={(code) => {
          if (onSelectBookletVariant) {
            onSelectBookletVariant(code, { autoSyncAnswerKey: true });
          } else {
            onUpdateCover({ bookletCode: code });
          }
        }}
        onDownloadBookletPdf={onDownloadBookletPdf}
        onDownloadOpticalPdf={onDownloadOpticalPdf}
      />

      {/* AŞAĞIDA AÇILIR PANEL: DERS KİTABINDAN (PDF) DENEME / YAZILI OLUŞTURMA STÜDYOSU */}
      <TextbookExamPanel
        isOpen={showTextbookPanel}
        onToggleOpen={() => setShowTextbookPanel((prev) => !prev)}
        gradeProfile={gradeProfile}
        allowedGradeProfiles={allowedGradeProfiles}
        onSelectGrade={onSelectGrade}
        cover={cover}
        existingQuestions={questions}
        onApplyMcqQuestions={(generated, meta) => {
          onUpdateQuestions(generated);
          onUpdateCover({
            examTitle: meta.examTitle,
            subtitle: meta.subtitle,
            questionCount: generated.length,
          });
          setNotice(
            `${generated.length} soruluk ${meta.modeLabel} (${gradeProfile.shortLabel}) aktif kitapçığa uygulandı.`
          );
        }}
        onApplyOpenEndedQuestions={(generated) => {
          onApplyOpenEndedQuestions?.(generated);
          setNotice(
            `${generated.length} soruluk Açık Uçlu Yazılı Kağıdı oluşturuldu ve Açık Uçlu değerlendirme paneline aktarıldı.`
          );
        }}
        onDownloadBookletPdf={onDownloadBookletPdf}
        onOpenEditor={onOpenEditor}
        onOpenOpenEnded={onOpenOpenEnded}
      />

      {/* Generated Question Bank Preview */}
      <section className="surface-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold">
              Hazırlanan Deneme Soruları Önizleme ({questions.length} Soru)
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              İlk 8 soru gösterilmektedir; tamamını Deneme Editörü’nde düzenleyebilir veya PDF/ZIP alabilirsiniz
            </p>
          </div>
          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer"
            >
              Deneme Editöründe Düzenle
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {questions.slice(0, 8).map((q) => (
            <article key={q.id} className="surface-alt rounded-lg p-4 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2 font-bold">
                <span>
                  Soru {q.number} · {q.subject} · {q.topic}
                </span>
                <span style={{ color: 'var(--accent-primary)' }}>
                  {q.difficulty} · {q.source}
                </span>
              </div>
              {q.visual && <QuestionVisualPreview visual={q.visual} compact />}
              <p className="text-sm font-medium leading-relaxed">{q.stem}</p>
              <div className="grid grid-cols-1 gap-1 pt-1">
                {Object.entries(q.options).map(([k, v]) => (
                  <div
                    key={k}
                    className={
                      k === q.correctOption ? 'font-bold text-emerald-700 dark:text-emerald-400' : ''
                    }
                  >
                    {k}) {v} {k === q.correctOption ? ' (Doğru Cevap)' : ''}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
