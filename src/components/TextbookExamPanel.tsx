import { ChangeEvent, useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  FileText,
  FileUp,
  ListChecks,
  Loader2,
  PenTool,
  Plus,
  Sparkles,
  Tag,
  Wand2,
} from 'lucide-react';
import {
  CoverConfig,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  OpenEndedQuestion,
} from '../types/academy';
import { extractPrintableTextFromPdfBytes } from '../utils/examPdfParser';
import { uint8ArrayToPdfBlob } from '../utils/downloadHelpers';
import { generateOpenEndedExamPdf, triggerDownload } from '../utils/pdfAndZip';
import {
  analyzeTextbookTopicsAndHeadings,
  buildQuestionsFromTextbookSelection,
  DEFAULT_QUESTION_HEADING_PRESETS,
  normalizeTextbookMcqQuestions,
  normalizeTextbookOpenEndedQuestions,
  parseCommaOrLineHeadings,
  TextbookAnalysisResult,
  TextbookExamKind,
} from '../utils/textbookExamBuilder';
import { NumericStepperInput } from './NumericStepperInput';

interface TextbookExamPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  gradeProfile: GradeProfile;
  allowedGradeProfiles: GradeProfile[];
  onSelectGrade: (gradeId: GradeLevelId) => void;
  cover: CoverConfig;
  existingQuestions: ExamQuestion[];
  exportBusy?: boolean;
  onApplyMcqQuestions: (
    generated: ExamQuestion[],
    meta: { examTitle: string; subtitle: string; modeLabel: string }
  ) => void;
  onApplyOpenEndedQuestions: (generated: OpenEndedQuestion[]) => void;
  onDownloadBookletPdf: () => Promise<void>;
  onOpenEditor?: () => void;
  onOpenOpenEnded?: () => void;
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

export function TextbookExamPanel({
  isOpen,
  onToggleOpen,
  gradeProfile,
  allowedGradeProfiles,
  onSelectGrade,
  cover,
  existingQuestions,
  exportBusy = false,
  onApplyMcqQuestions,
  onApplyOpenEndedQuestions,
  onDownloadBookletPdf,
  onOpenEditor,
  onOpenOpenEnded,
}: TextbookExamPanelProps) {
  const [subject, setSubject] = useState<string>('Tümü');
  const [textbookText, setTextbookText] = useState<string>('');
  const [textbookFile, setTextbookFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
    pageCount?: number;
  } | null>(null);

  // Sınav Türü: Deneme vs Yazılı (Test veya Açık Uçlu)
  const [mainMode, setMainMode] = useState<'deneme' | 'yazili'>('deneme');
  const [yaziliFormat, setYaziliFormat] = useState<'yazili-test' | 'yazili-acik-uclu'>('yazili-test');
  const activeExamKind: TextbookExamKind =
    mainMode === 'deneme' ? 'deneme' : yaziliFormat;

  // Analiz & Konu / Soru Başlıkları
  const [analysisResult, setAnalysisResult] = useState<TextbookAnalysisResult | null>(null);
  const [availableTopics, setAvailableTopics] = useState<string[]>(
    gradeProfile.subjects[0]?.topics ?? []
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    (gradeProfile.subjects[0]?.topics ?? []).slice(0, 3)
  );
  const [customTopicInput, setCustomTopicInput] = useState<string>('');

  const [availableHeadings, setAvailableHeadings] = useState<string[]>(
    DEFAULT_QUESTION_HEADING_PRESETS
  );
  const [selectedHeadings, setSelectedHeadings] = useState<string[]>(
    DEFAULT_QUESTION_HEADING_PRESETS.slice(0, 2)
  );
  const [customHeadingInput, setCustomHeadingInput] = useState<string>('');

  const [questionCount, setQuestionCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<'dengeli' | 'Kolay' | 'Orta' | 'Zor'>('dengeli');

  // Üretilen önizleme
  const [generatedMcq, setGeneratedMcq] = useState<ExamQuestion[]>([]);
  const [generatedOpenEnded, setGeneratedOpenEnded] = useState<OpenEndedQuestion[]>([]);

  const [busyMode, setBusyMode] = useState<'analyze' | 'generate' | 'pdf' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sınıf değiştiğinde ders ve konu başlıklarını sınıf düzeyine uygun tut
  useEffect(() => {
    const validSubjects = gradeProfile.subjects.map((s) => s.name);
    const nextSubject =
      subject === 'Tümü' || validSubjects.includes(subject)
        ? subject
        : 'Tümü';

    if (nextSubject !== subject) {
      setSubject(nextSubject);
    }

    const currSpec =
      nextSubject === 'Tümü'
        ? gradeProfile.subjects.flatMap((s) => s.topics.slice(0, 2))
        : gradeProfile.subjects.find((s) => s.name === nextSubject)?.topics ?? [];

    setAvailableTopics(currSpec);
    setSelectedTopics(currSpec.slice(0, 3));
    setAnalysisResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeProfile]);

  const handleManualSubjectChange = (nextSubject: string) => {
    setSubject(nextSubject);
    const currSpec =
      nextSubject === 'Tümü'
        ? gradeProfile.subjects.flatMap((s) => s.topics.slice(0, 2))
        : gradeProfile.subjects.find((s) => s.name === nextSubject)?.topics ?? [];
    setAvailableTopics(currSpec);
    setSelectedTopics(currSpec.slice(0, 3));
    setAnalysisResult(null);
  };

  // Yazılı / Deneme geçişinde önerilen soru sayısını güncelle
  useEffect(() => {
    if (mainMode === 'yazili') {
      setQuestionCount(yaziliFormat === 'yazili-acik-uclu' ? 10 : 20);
    } else {
      setQuestionCount(10);
    }
  }, [mainMode, yaziliFormat]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setNotice(null);

    try {
      const base64 = await fileToBase64(file);
      let extractedText = '';
      let pageCount: number | undefined;

      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        extractedText = await file.text();
      } else if (
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
      ) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        try {
          const doc = await PDFDocument.load(bytes);
          pageCount = doc.getPageCount();
        } catch {
          // ignore page count error if non-standard pdf
        }
        extractedText = await extractPrintableTextFromPdfBytes(bytes);
      }

      setTextbookFile({
        name: file.name,
        base64,
        mimeType: file.type || 'application/pdf',
        pageCount,
      });

      if (extractedText.trim().length > 20) {
        setTextbookText(extractedText.slice(0, 30000));
        // Otomatik yerel ön-analiz ile konu başlıklarını hemen çıkar
        const localQuick = analyzeTextbookTopicsAndHeadings({
          rawText: extractedText,
          fileName: file.name,
          gradeProfile,
          subjectName: subject,
        });
        if (subject === 'Tümü' && localQuick.detectedSubject) {
          setSubject(localQuick.detectedSubject);
        }
        setAnalysisResult(localQuick);
        setAvailableTopics(localQuick.topics);
        setSelectedTopics(localQuick.topics.slice(0, 4));
        setAvailableHeadings(localQuick.questionHeadings);
        setSelectedHeadings(localQuick.questionHeadings.slice(0, 3));
        setNotice(
          `"${file.name}"${pageCount ? ` (${pageCount} sayfa)` : ''} yüklendi; ${localQuick.detectedSubject} dersi için ${localQuick.topics.length} konu başlığı ve ${localQuick.questionHeadings.length} soru başlığı çıkarıldı.`
        );
      } else {
        setNotice(
          `"${file.name}"${pageCount ? ` (${pageCount} sayfa)` : ''} yüklendi. "Ders Kitabından Analiz Et" butonuna basarak konu ve soru başlıklarını çıkarabilirsiniz.`
        );
      }
    } catch {
      setErrorMsg('Ders kitabı dosyası okunamadı. Lütfen geçerli bir PDF veya TXT seçin.');
    }
  };

  const handleAnalyzeTextbook = async () => {
    if (!textbookText.trim() && !textbookFile) {
      setErrorMsg(
        'Lütfen analiz için önce bir ders kitabı PDF/TXT yükleyin veya ders kitabı metni yapıştırın.'
      );
      return;
    }

    setBusyMode('analyze');
    setErrorMsg(null);
    setNotice(null);

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 12000);

    try {
      const resp = await fetch('/api/textbook/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gradeLabel: gradeProfile.shortLabel,
          subject,
          fileName: textbookFile?.name ?? 'Ders Kitabı Metni',
          textContent: textbookText,
          fileBase64: textbookFile?.base64,
          fileMimeType: textbookFile?.mimeType,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const topics = Array.isArray(data.topics) ? (data.topics as string[]).filter(Boolean) : [];
        const headings = Array.isArray(data.questionHeadings)
          ? (data.questionHeadings as string[]).filter(Boolean)
          : DEFAULT_QUESTION_HEADING_PRESETS;

        const detected =
          typeof data.detectedSubject === 'string' &&
          gradeProfile.subjects.some(
            (s) => s.name.toLocaleLowerCase('tr-TR') === data.detectedSubject.toLocaleLowerCase('tr-TR')
          )
            ? gradeProfile.subjects.find(
                (s) => s.name.toLocaleLowerCase('tr-TR') === data.detectedSubject.toLocaleLowerCase('tr-TR')
              )!.name
            : subject === 'Tümü'
              ? gradeProfile.subjects[0]?.name ?? 'Genel'
              : subject;

        if (subject === 'Tümü') {
          setSubject(detected);
        }

        const aiResult: TextbookAnalysisResult = {
          summary:
            data.summary ||
            `${gradeProfile.shortLabel} ders kitabı yapay zeka ile analiz edildi.`,
          detectedSubject: detected,
          topics: topics.length > 0 ? topics : availableTopics,
          questionHeadings: headings,
          method: 'ai',
        };
        setAnalysisResult(aiResult);
        setAvailableTopics(aiResult.topics);
        setSelectedTopics(aiResult.topics.slice(0, 4));
        setAvailableHeadings((prev) => Array.from(new Set([...aiResult.questionHeadings, ...prev])));
        setSelectedHeadings(aiResult.questionHeadings.slice(0, 3));
        setNotice(
          `Ders kitabı AI ile analiz edildi (${detected}): ${aiResult.topics.length} konu başlığı ve ${aiResult.questionHeadings.length} soru başlığı önerildi.`
        );
        return;
      }

      // If AI endpoint returned 503/unavailable and we have readable text, use local PDF/text analyzer transparently
      const errData = await resp.json().catch(() => ({}));
      if (textbookText.trim().length >= 15) {
        const localRes = analyzeTextbookTopicsAndHeadings({
          rawText: textbookText,
          fileName: textbookFile?.name,
          gradeProfile,
          subjectName: subject,
        });
        if (subject === 'Tümü' && localRes.detectedSubject) {
          setSubject(localRes.detectedSubject);
        }
        setAnalysisResult(localRes);
        setAvailableTopics(localRes.topics);
        setSelectedTopics(localRes.topics.slice(0, 4));
        setAvailableHeadings((prev) => Array.from(new Set([...localRes.questionHeadings, ...prev])));
        setSelectedHeadings(localRes.questionHeadings.slice(0, 3));
        setNotice(
          `Metin tabanlı PDF analiz tamamlandı (${localRes.detectedSubject} · ${localRes.topics.length} konu başlığı · ${localRes.questionHeadings.length} soru başlığı).`
        );
      } else {
        setErrorMsg(
          errData.error ||
            'Taranmış görsel PDF analizi için sunucu AI servisi yanıt vermedi; kitap metnini aşağıya yapıştırarak analiz edebilirsiniz.'
        );
      }
    } catch {
      if (textbookText.trim().length >= 15) {
        const localRes = analyzeTextbookTopicsAndHeadings({
          rawText: textbookText,
          fileName: textbookFile?.name,
          gradeProfile,
          subjectName: subject,
        });
        if (subject === 'Tümü' && localRes.detectedSubject) {
          setSubject(localRes.detectedSubject);
        }
        setAnalysisResult(localRes);
        setAvailableTopics(localRes.topics);
        setSelectedTopics(localRes.topics.slice(0, 4));
        setAvailableHeadings((prev) => Array.from(new Set([...localRes.questionHeadings, ...prev])));
        setSelectedHeadings(localRes.questionHeadings.slice(0, 3));
        setNotice(
          `Metin tabanlı PDF analiz tamamlandı (${localRes.detectedSubject} · ${localRes.topics.length} konu başlığı · ${localRes.questionHeadings.length} soru başlığı).`
        );
      } else {
        setErrorMsg('Ders kitabı analiz edilirken bağlantı hatası oluştu.');
      }
    } finally {
      window.clearTimeout(tid);
      setBusyMode(null);
    }
  };

  const toggleChip = (
    item: string,
    selectedList: string[],
    setSelectedList: (next: string[]) => void
  ) => {
    if (selectedList.includes(item)) {
      setSelectedList(selectedList.filter((x) => x !== item));
    } else {
      setSelectedList([...selectedList, item]);
    }
  };

  const handleAddCustomTopics = () => {
    const parsed = parseCommaOrLineHeadings(customTopicInput);
    if (parsed.length === 0) return;
    setAvailableTopics((prev) => Array.from(new Set([...parsed, ...prev])));
    setSelectedTopics((prev) => Array.from(new Set([...prev, ...parsed])));
    setCustomTopicInput('');
  };

  const handleAddCustomHeadings = () => {
    const parsed = parseCommaOrLineHeadings(customHeadingInput);
    if (parsed.length === 0) return;
    setAvailableHeadings((prev) => Array.from(new Set([...parsed, ...prev])));
    setSelectedHeadings((prev) => Array.from(new Set([...prev, ...parsed])));
    setCustomHeadingInput('');
  };

  const handleGenerateExamFromTextbook = async () => {
    // Include any un-submitted text typed in custom inputs automatically
    const extraTopics = parseCommaOrLineHeadings(customTopicInput);
    const extraHeadings = parseCommaOrLineHeadings(customHeadingInput);
    const activeTopics = Array.from(new Set([...selectedTopics, ...extraTopics]));
    const activeHeadings = Array.from(new Set([...selectedHeadings, ...extraHeadings]));

    if (extraTopics.length > 0) {
      setAvailableTopics((prev) => Array.from(new Set([...extraTopics, ...prev])));
      setSelectedTopics(activeTopics);
      setCustomTopicInput('');
    }
    if (extraHeadings.length > 0) {
      setAvailableHeadings((prev) => Array.from(new Set([...extraHeadings, ...prev])));
      setSelectedHeadings(activeHeadings);
      setCustomHeadingInput('');
    }

    if (activeTopics.length === 0 && !textbookText.trim() && !textbookFile) {
      setErrorMsg(
        'Lütfen en az bir konu başlığı seçin/yazın veya bir ders kitabı PDF/metni ekleyin.'
      );
      return;
    }

    setBusyMode('generate');
    setErrorMsg(null);
    setNotice(null);

    const safeCount = Math.min(40, Math.max(1, Number(questionCount) || 10));
    const effectiveSubject =
      subject === 'Tümü' ? analysisResult?.detectedSubject || gradeProfile.subjects[0]?.name || 'Genel' : subject;

    const applyGeneratedResult = (
      mcq: ExamQuestion[],
      openEnded: OpenEndedQuestion[],
      sourceLabel: string
    ) => {
      if (activeExamKind === 'yazili-acik-uclu') {
        setGeneratedOpenEnded(openEnded);
        setGeneratedMcq([]);
        onApplyOpenEndedQuestions(openEnded);
        setNotice(
          `${gradeProfile.shortLabel} ${effectiveSubject} için ${openEnded.length} soruluk Açık Uçlu Yazılı Kağıdı (${sourceLabel}) oluşturuldu ve Açık Uçlu Kağıt sistemine aktarıldı.`
        );
      } else {
        setGeneratedMcq(mcq);
        setGeneratedOpenEnded([]);
        const modeTitle =
          activeExamKind === 'yazili-test' ? 'Yazılıya Hazırlık Testi' : 'Ders Kitabı Deneme Sınavı';
        onApplyMcqQuestions(mcq, {
          examTitle: `${gradeProfile.shortLabel} ${effectiveSubject} — ${modeTitle}`,
          subtitle: `Konular: ${activeTopics.slice(0, 3).join(', ') || effectiveSubject}`,
          modeLabel: modeTitle,
        });
        setNotice(
          `${gradeProfile.shortLabel} ${effectiveSubject} için ${mcq.length} soruluk ${modeTitle} (${sourceLabel}) oluşturuldu ve aktif kitapçığa uygulandı.`
        );
      }
    };

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 12000);

    try {
      const resp = await fetch('/api/textbook/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gradeLabel: gradeProfile.shortLabel,
          subject: effectiveSubject,
          examKind: activeExamKind,
          count: safeCount,
          optionCount: gradeProfile.optionCount,
          difficulty,
          topics: activeTopics,
          questionHeadings: activeHeadings,
          textContent: textbookText,
          fileBase64: textbookFile?.base64,
          fileMimeType: textbookFile?.mimeType,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (activeExamKind === 'yazili-acik-uclu' && Array.isArray(data.openEndedQuestions) && data.openEndedQuestions.length > 0) {
          const normalizedOe = normalizeTextbookOpenEndedQuestions({
            incoming: data.openEndedQuestions,
            gradeProfile,
            fallbackSubject: effectiveSubject,
            topics: activeTopics,
            questionHeadings: activeHeadings,
          });
          applyGeneratedResult([], normalizedOe, 'Gemini AI');
          return;
        }
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          const normalizedMcq = normalizeTextbookMcqQuestions({
            incoming: data.questions,
            gradeProfile,
            fallbackSubject: effectiveSubject,
            topics: activeTopics,
            questionHeadings: activeHeadings,
          });
          applyGeneratedResult(normalizedMcq, [], 'Gemini AI');
          return;
        }
      }

      // Local deterministic textbook/topic assembly when AI key isn't active in env
      const localBuilt = buildQuestionsFromTextbookSelection({
        gradeProfile,
        subjectName: subject,
        examKind: activeExamKind,
        count: safeCount,
        difficulty,
        topics: activeTopics,
        questionHeadings: activeHeadings,
        rawText: textbookText,
      });
      applyGeneratedResult(
        localBuilt.mcqQuestions,
        localBuilt.openEndedQuestions,
        textbookText.trim() ? 'Ders Kitabı Metni & Kazanım Üreticisi' : 'Konu & Soru Başlığı Üreticisi'
      );
    } catch {
      const localBuilt = buildQuestionsFromTextbookSelection({
        gradeProfile,
        subjectName: subject,
        examKind: activeExamKind,
        count: safeCount,
        difficulty,
        topics: activeTopics,
        questionHeadings: activeHeadings,
        rawText: textbookText,
      });
      applyGeneratedResult(
        localBuilt.mcqQuestions,
        localBuilt.openEndedQuestions,
        'Konu & Soru Başlığı Üreticisi'
      );
    } finally {
      window.clearTimeout(tid);
      setBusyMode(null);
    }
  };

  const handleDownloadOpenEndedPdf = async () => {
    if (generatedOpenEnded.length === 0) return;
    setBusyMode('pdf');
    setErrorMsg(null);
    try {
      const bytes = await generateOpenEndedExamPdf({
        cover,
        gradeProfile,
        questions: generatedOpenEnded,
        includeSolutionKey: true,
      });
      const blob = uint8ArrayToPdfBlob(bytes);
      const filename = `Dogruluk-Akademi-${gradeProfile.id}-Ders-Kitabi-Acik-Uclu-Yazili.pdf`;
      triggerDownload(blob, filename);
      setNotice(`${filename} indirildi.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Açık uçlu yazılı PDF’i indirilemedi: ${err.message}`
          : 'Açık uçlu yazılı PDF’i oluşturulamadı.'
      );
    } finally {
      setBusyMode(null);
    }
  };

  return (
    <section
      id="textbook-exam-studio-section"
      aria-labelledby="textbook-panel-toggle-title"
      className="surface-card rounded-xl overflow-hidden border-2 transition-colors scroll-mt-20"
      style={{ borderColor: isOpen ? 'var(--accent-primary)' : 'var(--border-subtle)' }}
    >
      {/* Aşağıda Panel Açma Butonu (Bar) */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        data-testid="toggle-textbook-panel-btn"
        className="w-full p-5 flex flex-wrap items-center justify-between gap-4 text-left cursor-pointer hover:opacity-95 transition-opacity"
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)' }}
          >
            <BookOpenCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h3 id="textbook-panel-toggle-title" className="text-base font-bold flex flex-wrap items-center gap-2">
              <span>Ders Kitabından (PDF) Sınıf Bazlı Deneme / Yazılı Oluşturma Paneli</span>
              <span
                className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)' }}
              >
                {gradeProfile.shortLabel} · {gradeProfile.optionCount} Şık
              </span>
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Tıklayın: Aşağıya açılan panelden ders kitabı PDF’ini analiz edin, <strong>Deneme</strong> veya <strong>Yazılı</strong> seçin, <strong>Konu Başlıkları & Soru Başlıkları</strong> söyleyerek otomatik soru çıkarın.
            </p>
          </div>
        </div>

        <span
          className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
        >
          <span>{isOpen ? 'Paneli Gizle' : 'Deneme / Yazılı Panelini Aç'}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {/* Aşağıya Açılan İnteraktif Panel */}
      {isOpen && (
        <div
          data-testid="textbook-exam-panel"
          className="p-5 pt-4 border-t space-y-6 surface-alt"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {notice && (
            <div className="surface-card rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 border border-emerald-300/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}
          {errorMsg && (
            <div className="rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ADIM 1: SINIF, DERS & DERS KİTABI PDF YÜKLEME + ANALİZ */}
          <div className="surface-card rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>1. Sınıf Düzeyi, Ders Kitabı PDF Yükleme & Konu/Soru Başlığı Analizi</span>
              </div>
              {analysisResult && (
                <span
                  data-testid="textbook-analysis-method-badge"
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)' }}
                >
                  {analysisResult.method === 'ai'
                    ? 'Gemini AI Kitap Analizi'
                    : 'Yerel PDF / Metin Analizi'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf Düzeyi</span>
                <select
                  value={gradeProfile.id}
                  onChange={(e) => onSelectGrade(e.target.value as GradeLevelId)}
                  aria-label="Ders kitabı sınıf düzeyi"
                  data-testid="textbook-grade-select"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-semibold"
                >
                  {allowedGradeProfiles.map((gp) => (
                    <option key={gp.id} value={gp.id}>
                      {gp.shortLabel} ({gp.optionCount} Şık)
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders</span>
                <select
                  value={subject}
                  onChange={(e) => handleManualSubjectChange(e.target.value)}
                  aria-label="Ders kitabı dersi"
                  data-testid="textbook-subject-select"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-semibold"
                >
                  <option value="Tümü">Karma / Kitaptan Otomatik Tespit Et</option>
                  {gradeProfile.subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <label className="btn-3d-secondary w-full py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer">
                  <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {textbookFile
                      ? `${textbookFile.name}${textbookFile.pageCount ? ` (${textbookFile.pageCount} syf)` : ''}`
                      : 'Ders Kitabı PDF / TXT Seç'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleFileChange}
                    data-testid="textbook-pdf-upload"
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>
                Ders Kitabı Ünite / Konu Metni (PDF yüklenince otomatik dolar veya doğrudan metin yapıştırabilirsiniz)
              </span>
              <textarea
                rows={3}
                value={textbookText}
                onChange={(e) => setTextbookText(e.target.value)}
                data-testid="textbook-raw-text"
                placeholder="Örn: 1. Ünite: Kesirler ve Ondalık Gösterim — Bir bütünün eş parçalarından her birine birim kesir denir. Paydaları eşit kesirlerde toplama işlemi yapılırken..."
                className="mt-1 w-full rounded-lg p-3 text-xs surface-alt"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {analysisResult
                  ? analysisResult.summary
                  : 'Analiz et dediğinizde kitaptaki ünite/konu başlıkları ve önerilen soru başlıkları otomatik çıkarılır.'}
              </p>
              <button
                type="button"
                disabled={busyMode === 'analyze'}
                onClick={handleAnalyzeTextbook}
                data-testid="textbook-analyze-btn"
                className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {busyMode === 'analyze' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Kitap Analiz Ediliyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    <span>Ders Kitabından Analiz Et (Başlıkları Çıkar)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ADIM 2: DENEME Mİ, YAZILI MI OLUŞTUR? */}
          <div className="surface-card rounded-xl p-4 space-y-3">
            <div className="text-sm font-bold">
              2. Ne Oluşturmak İstiyorsunuz? (Deneme mi, Yazılı mı?)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMainMode('deneme')}
                data-testid="textbook-mode-deneme"
                className={`p-3.5 rounded-xl text-left border-2 transition-all cursor-pointer ${
                  mainMode === 'deneme' ? 'surface-alt' : 'surface-card opacity-85'
                }`}
                style={{
                  borderColor: mainMode === 'deneme' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold inline-flex items-center gap-2">
                    <ListChecks className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <span>Deneme Sınavı Oluştur</span>
                  </span>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--accent-primary)' }}>
                    {gradeProfile.optionCount} Şıklı Kitapçık
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {gradeProfile.shortLabel} standardına uygun çoktan seçmeli deneme kitapçığı ve optik cevap anahtarı üretir.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMainMode('yazili')}
                data-testid="textbook-mode-yazili"
                className={`p-3.5 rounded-xl text-left border-2 transition-all cursor-pointer ${
                  mainMode === 'yazili' ? 'surface-alt' : 'surface-card opacity-85'
                }`}
                style={{
                  borderColor: mainMode === 'yazili' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold inline-flex items-center gap-2">
                    <PenTool className="w-4 h-4" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                    <span>Yazılı Sınav Oluştur</span>
                  </span>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--chart-3)' }}>
                    Test veya Açık Uçlu Klasik
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Okul yazılıları için 20 soruluk çoktan seçmeli yazılı veya 10 soruluk rubrikli açık uçlu yazılı kağıdı hazırlar.
                </p>
              </button>
            </div>

            {mainMode === 'yazili' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
                  Yazılı Türü:
                </span>
                <button
                  type="button"
                  onClick={() => setYaziliFormat('yazili-test')}
                  data-testid="textbook-yazili-test"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    yaziliFormat === 'yazili-test' ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  Çoktan Seçmeli Yazılı (20 Soru / Karma)
                </button>
                <button
                  type="button"
                  onClick={() => setYaziliFormat('yazili-acik-uclu')}
                  data-testid="textbook-yazili-open"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    yaziliFormat === 'yazili-acik-uclu' ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  Açık Uçlu (Klasik) Yazılı Kağıdı (Çözüm & Puanlı)
                </button>
              </div>
            )}
          </div>

          {/* ADIM 3: KONU BAŞLIKLARI VE SORU BAŞLIKLARI SÖYLE / SEÇ */}
          <div className="surface-card rounded-xl p-4 space-y-5">
            <div className="text-sm font-bold flex items-center gap-2">
              <Tag className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>3. Konu Başlıklarını ve Soru Başlıklarını Seç / Söyle</span>
            </div>

            {/* Konu Başlıkları */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">
                  Konu Başlıkları ({selectedTopics.length} seçili)
                </span>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedTopics(availableTopics)}
                    className="underline cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTopics([])}
                    className="underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Temizle
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableTopics.map((topic) => {
                  const active = selectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleChip(topic, selectedTopics, setSelectedTopics)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                        active ? 'btn-3d' : 'surface-alt'
                      }`}
                      style={{
                        borderColor: active ? 'transparent' : 'var(--border-subtle)',
                      }}
                    >
                      {active ? '✓ ' : '+ '}
                      {topic}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => setCustomTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTopics();
                    }
                  }}
                  data-testid="textbook-custom-topics-input"
                  placeholder="İstediğiniz konu başlıklarını yazın (virgülle ayırabilirsiniz: Kesirlerde Toplama, Ondalık Gösterim)"
                  className="flex-1 min-w-[240px] rounded-lg px-3 py-2 text-xs surface-alt"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTopics}
                  data-testid="add-custom-topic-btn"
                  className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Konu Başlığı Ekle</span>
                </button>
              </div>
            </div>

            {/* Soru Başlıkları */}
            <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">
                  Soru Başlıkları / Soru Tarzları ({selectedHeadings.length} seçili)
                </span>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedHeadings(availableHeadings)}
                    className="underline cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHeadings([])}
                    className="underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Temizle
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableHeadings.map((heading) => {
                  const active = selectedHeadings.includes(heading);
                  return (
                    <button
                      key={heading}
                      type="button"
                      onClick={() => toggleChip(heading, selectedHeadings, setSelectedHeadings)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                        active ? 'btn-3d' : 'surface-alt'
                      }`}
                      style={{
                        borderColor: active ? 'transparent' : 'var(--border-subtle)',
                      }}
                    >
                      {active ? '✓ ' : '+ '}
                      {heading}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={customHeadingInput}
                  onChange={(e) => setCustomHeadingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomHeadings();
                    }
                  }}
                  data-testid="textbook-custom-headings-input"
                  placeholder="İstediğiniz soru başlıklarını söyleyin/yazın (örn: Kesir Problemleri, Doğru-Yanlış Karşılaştırma)"
                  className="flex-1 min-w-[240px] rounded-lg px-3 py-2 text-xs surface-alt"
                />
                <button
                  type="button"
                  onClick={handleAddCustomHeadings}
                  data-testid="add-custom-heading-btn"
                  className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Soru Başlığı Ekle</span>
                </button>
              </div>
            </div>

            {/* Adet, Zorluk & Oluştur Butonu */}
            <div
              className="pt-3 border-t grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="md:col-span-3 block text-xs font-semibold">
                <label
                  htmlFor="textbook-question-count-input"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Üretilecek Soru Sayısı
                </label>
                <div className="mt-1">
                  <NumericStepperInput
                    id="textbook-question-count-input"
                    ariaLabel="Üretilecek Soru Sayısı"
                    inputTestId="textbook-question-count-input"
                    value={questionCount}
                    min={1}
                    max={40}
                    surfaceClass="surface-alt"
                    onChange={(val) => setQuestionCount(val)}
                  />
                </div>
              </div>

              <label className="md:col-span-3 block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Zorluk Seviyesi</span>
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as 'dengeli' | 'Kolay' | 'Orta' | 'Zor')
                  }
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-semibold"
                >
                  <option value="dengeli">Dengeli Karma</option>
                  <option value="Kolay">Kolay (Pekiştirme)</option>
                  <option value="Orta">Orta (Kazanım)</option>
                  <option value="Zor">Zor (Yeni Nesil)</option>
                </select>
              </label>

              <div className="md:col-span-6">
                <button
                  type="button"
                  disabled={busyMode === 'generate'}
                  onClick={handleGenerateExamFromTextbook}
                  data-testid="textbook-generate-btn"
                  className="btn-3d w-full py-2.5 px-5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {busyMode === 'generate' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Sorular Oluşturuluyor...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" aria-hidden="true" />
                      <span>
                        {activeExamKind === 'yazili-acik-uclu'
                          ? `Ders Kitabından Açık Uçlu Yazılı Oluştur (${questionCount} Soru)`
                          : activeExamKind === 'yazili-test'
                            ? `Ders Kitabından Yazılı Testi Oluştur (${questionCount} Soru)`
                            : `Ders Kitabından Deneme Sınavı Oluştur (${questionCount} Soru)`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ADIM 4: ÜRETİLEN SORULAR ÖNİZLEME & PDF AKTARIM */}
          {(generatedMcq.length > 0 || generatedOpenEnded.length > 0) && (
            <div
              data-testid="textbook-generated-preview"
              className="surface-card rounded-xl p-4 space-y-4 border-l-4"
              style={{ borderLeftColor: 'var(--chart-3)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold">
                    {generatedOpenEnded.length > 0
                      ? `Oluşturulan Açık Uçlu Yazılı Kağıdı (${generatedOpenEnded.length} Soru · 100 Puan)`
                      : `Oluşturulan ${
                          activeExamKind === 'yazili-test' ? 'Yazılı Testi' : 'Deneme Kitapçığı'
                        } (${generatedMcq.length} Soru · Aktif Kitapçık: ${existingQuestions.length} Soru)`}
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Seçtiğiniz konu başlıkları ve soru başlıklarına göre hazırlandı. Doğrudan PDF alabilir veya düzenleyebilirsiniz.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {generatedOpenEnded.length > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={busyMode === 'pdf' || exportBusy}
                        onClick={handleDownloadOpenEndedPdf}
                        data-testid="textbook-download-open-ended-pdf-btn"
                        className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {busyMode === 'pdf' ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <FileDown className="w-4 h-4" aria-hidden="true" />
                        )}
                        <span>{busyMode === 'pdf' ? 'PDF Hazırlanıyor...' : 'Açık Uçlu Yazılı PDF İndir'}</span>
                      </button>
                      {onOpenOpenEnded && (
                        <button
                          type="button"
                          onClick={onOpenOpenEnded}
                          className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-4 h-4" aria-hidden="true" />
                          <span>Açık Uçlu Kağıt Analizine Git</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={exportBusy}
                        onClick={onDownloadBookletPdf}
                        data-testid="textbook-download-booklet-pdf-btn"
                        className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {exportBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <FileDown className="w-4 h-4" aria-hidden="true" />
                        )}
                        <span>{exportBusy ? 'PDF Hazırlanıyor...' : 'Kapaklı Kitapçık PDF İndir'}</span>
                      </button>
                      {onOpenEditor && (
                        <button
                          type="button"
                          onClick={onOpenEditor}
                          className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Deneme Editöründe Düzenle
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {generatedOpenEnded.length > 0
                  ? generatedOpenEnded.map((q) => (
                      <article key={q.id} className="surface-alt rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span>
                            Soru {q.number} · {q.subject}
                          </span>
                          <span style={{ color: 'var(--accent-primary)' }}>{q.maxPoints} Puan</span>
                        </div>
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                          Konu: {q.topic}
                        </div>
                        <p className="text-xs font-medium leading-relaxed">{q.prompt}</p>
                        <div className="text-[11px] pt-1 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--chart-3)' }}>
                          <strong>Örnek Çözüm:</strong> {q.modelAnswer}
                        </div>
                      </article>
                    ))
                  : generatedMcq.map((q) => (
                      <article key={q.id} className="surface-alt rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span>
                            Soru {q.number} · {q.subject} · {q.topic}
                          </span>
                          <span style={{ color: 'var(--accent-primary)' }}>
                            {q.difficulty} · Cevap: {q.correctOption}
                          </span>
                        </div>
                        <p className="text-xs font-medium leading-relaxed">{q.stem}</p>
                        <div className="grid grid-cols-2 gap-1 text-[11px]">
                          {Object.entries(q.options).map(([k, v]) => (
                            <div
                              key={k}
                              className={
                                k === q.correctOption ? 'font-bold text-emerald-700 dark:text-emerald-400' : ''
                              }
                            >
                              {k}) {v}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
