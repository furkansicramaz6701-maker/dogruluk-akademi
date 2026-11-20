import { ChangeEvent, useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Copy,
  FileDown,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { GRADE_PROFILES } from '../data/curriculum';
import {
  CoverConfig,
  DifficultyLevel,
  EnglishScenePresetId,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  Institution,
  QuestionVisualSpec,
  QuestionVisualType,
} from '../types/academy';
import {
  ENGLISH_SCENE_PRESETS,
  buildVisualQuestionPreset,
  extractPrintableTextFromPdfBytes,
  normalizeIncomingQuestionList,
  parseExamQuestionsFromRawText,
} from '../utils/examPdfParser';
import { filterGradeProfilesByInstitution } from '../utils/institutionCodes';
import {
  auditExamQuestions,
  balanceDifficultyLevels,
  balanceQuestionOptions,
  fillMissingExplanations,
} from '../utils/recommendations';
import { QuestionVisualPreview } from './QuestionVisualPreview';

interface ExamEditorViewProps {
  institution: Institution;
  gradeProfile: GradeProfile;
  onSelectGrade: (id: GradeLevelId) => void;
  questions: ExamQuestion[];
  cover: CoverConfig;
  onUpdateQuestions: (next: ExamQuestion[]) => void;
  onDownloadBookletPdf: () => Promise<void>;
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

export function ExamEditorView({
  institution,
  gradeProfile,
  onSelectGrade,
  questions,
  cover,
  onUpdateQuestions,
  onDownloadBookletPdf,
}: ExamEditorViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('Tümü');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('Tümü');
  const [editorMessage, setEditorMessage] = useState<string | null>(null);

  // PDF / Raw Text Auto-Extract state
  const [pdfImportMode, setPdfImportMode] = useState<'replace' | 'append'>('replace');
  const [pdfExtractBusy, setPdfExtractBusy] = useState<boolean>(false);
  const [rawExamPasteText, setRawExamPasteText] = useState<string>('');
  const [lastExtractedSource, setLastExtractedSource] = useState<string | null>(null);

  const allowedGrades = useMemo(
    () => filterGradeProfilesByInstitution(GRADE_PROFILES, institution),
    [institution]
  );

  const letters =
    gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  const audit = useMemo(
    () => auditExamQuestions(questions, gradeProfile.optionCount),
    [questions, gradeProfile.optionCount]
  );

  const subjects = useMemo(
    () => Array.from(new Set(questions.map((q) => q.subject))),
    [questions]
  );

  const filteredWithIndex = useMemo(() => {
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => {
        if (subjectFilter !== 'Tümü' && q.subject !== subjectFilter) return false;
        if (difficultyFilter !== 'Tümü' && q.difficulty !== difficultyFilter) return false;
        if (searchQuery.trim()) {
          const s = searchQuery.trim().toLowerCase();
          return (
            q.stem.toLowerCase().includes(s) ||
            q.topic.toLowerCase().includes(s) ||
            q.subject.toLowerCase().includes(s) ||
            String(q.number).includes(s)
          );
        }
        return true;
      });
  }, [questions, subjectFilter, difficultyFilter, searchQuery]);

  const safeIdx = Math.min(selectedIndex, Math.max(0, questions.length - 1));
  const activeQ = questions[safeIdx];

  const notify = (msg: string) => {
    setEditorMessage(msg);
    setTimeout(() => setEditorMessage(null), 4500);
  };

  const renumber = (list: ExamQuestion[]): ExamQuestion[] =>
    list.map((q, i) => ({ ...q, number: i + 1 }));

  const updateActiveQuestion = (patch: Partial<ExamQuestion>) => {
    if (!activeQ) return;
    const next = questions.map((q, i) => (i === safeIdx ? { ...q, ...patch } : q));
    onUpdateQuestions(next);
  };

  const updateActiveOption = (key: string, val: string) => {
    if (!activeQ) return;
    updateActiveQuestion({
      options: {
        ...activeQ.options,
        [key]: val,
      },
    });
  };

  const updateActiveVisual = (patch: Partial<QuestionVisualSpec>) => {
    if (!activeQ?.visual) return;
    updateActiveQuestion({
      visual: {
        ...activeQ.visual,
        ...patch,
      },
    });
  };

  const handleSetVisualType = (nextType: QuestionVisualType | 'none') => {
    if (!activeQ) return;
    if (nextType === 'none') {
      updateActiveQuestion({ visual: undefined });
      notify(`Soru ${activeQ.number} için görsel blok kaldırıldı.`);
      return;
    }
    const preset = buildVisualQuestionPreset(nextType, gradeProfile, activeQ.number);
    updateActiveQuestion({ visual: preset.visual });
    notify(`Soru ${activeQ.number} içine "${nextType.toUpperCase()}" görseli eklendi.`);
  };

  const handleAddVisualPresetQuestion = (
    kind: QuestionVisualType,
    scenePresetId: EnglishScenePresetId = 'weather'
  ) => {
    const added = buildVisualQuestionPreset(
      kind,
      gradeProfile,
      questions.length + 1,
      scenePresetId
    );
    const next = [...questions, added];
    onUpdateQuestions(next);
    setSelectedIndex(next.length - 1);
    const labelMap: Record<QuestionVisualType, string> = {
      chart: 'Grafikli',
      table: 'Tablolu',
      math: 'Matematik/Şekilli',
      image: 'Resimli İngilizce',
    };
    notify(`Soru ${added.number} (${labelMap[kind]}) eklendi ve düzenlemeye açıldı.`);
  };

  const handleCustomQuestionImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeQ) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      updateActiveQuestion({
        visual: {
          type: 'image',
          title: activeQ.visual?.title || file.name.replace(/\.[^.]+$/, ''),
          caption: activeQ.visual?.caption || 'Soruya eklenen görsel materyal',
          imageDataUrl: dataUrl,
        },
      });
      notify(`"${file.name}" görseli Soru ${activeQ.number} içine eklendi.`);
    };
    reader.readAsDataURL(file);
  };

  const applyExtractedQuestions = (extracted: ExamQuestion[], sourceLabel: string) => {
    const combined =
      pdfImportMode === 'replace'
        ? renumber(extracted)
        : renumber([...questions, ...extracted]);
    onUpdateQuestions(combined);
    setSelectedIndex(pdfImportMode === 'replace' ? 0 : questions.length);
    setLastExtractedSource(`${sourceLabel} (${extracted.length} soru)`);
    notify(
      `"${sourceLabel}" kaynağından ${extracted.length} soru otomatik hazırlandı ve düzenlemeye açıldı.`
    );
  };

  const handleExtractFromFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPdfExtractBusy(true);
    try {
      let textContent = '';
      let fileBase64 = '';
      let pageCountInfo = '';
      const isText = file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt');

      if (isText) {
        textContent = (await file.text()).slice(0, 24000);
        setRawExamPasteText(textContent.slice(0, 4000));
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        try {
          const doc = await PDFDocument.load(bytes);
          pageCountInfo = ` (${doc.getPageCount()} sayfa)`;
        } catch {
          pageCountInfo = '';
        }
        textContent = extractPrintableTextFromPdfBytes(bytes);
        fileBase64 = await fileToBase64(file);
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);
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
            fileBase64: fileBase64 || undefined,
            fileMimeType: file.type || 'application/pdf',
            count: 8,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            const normalized = normalizeIncomingQuestionList(
              data.questions,
              gradeProfile.id,
              file.name
            );
            applyExtractedQuestions(normalized, `${file.name}${pageCountInfo}`);
            return;
          }
        }
      } catch {
        // Fallback smoothly to deterministic local parser below
      } finally {
        window.clearTimeout(timeoutId);
      }

      const localParsed = parseExamQuestionsFromRawText(
        textContent,
        gradeProfile,
        file.name,
        8
      );
      applyExtractedQuestions(localParsed, `${file.name}${pageCountInfo}`);
    } finally {
      setPdfExtractBusy(false);
    }
  };

  const handleExtractFromPastedText = async () => {
    const clean = rawExamPasteText.trim();
    if (!clean) return;
    setPdfExtractBusy(true);
    try {
      const hasExplicitQuestions =
        /(?:^|\n)\s*(?:Soru\s*)?\d{1,3}\s*[.)\-:]\s+/i.test(clean) &&
        /\b[A-E]\s*[).]/i.test(clean);
      if (hasExplicitQuestions) {
        const fastParsed = parseExamQuestionsFromRawText(
          clean,
          gradeProfile,
          'Yapıştırılan Sınav Metni',
          12
        );
        applyExtractedQuestions(fastParsed, 'Yapıştırılan Sınav Metni');
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);
      try {
        const resp = await fetch('/api/questions/from-exam-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            gradeLabel: gradeProfile.label,
            optionCount: gradeProfile.optionCount,
            fileName: 'Yapıştırılan Sınav Metni',
            textContent: clean.slice(0, 24000),
            count: 8,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            const normalized = normalizeIncomingQuestionList(
              data.questions,
              gradeProfile.id,
              'Yapıştırılan Sınav Metni'
            );
            applyExtractedQuestions(normalized, 'Yapıştırılan Sınav Metni');
            return;
          }
        }
      } catch {
        // Fallback below
      } finally {
        window.clearTimeout(timeoutId);
      }
      const localParsed = parseExamQuestionsFromRawText(
        clean,
        gradeProfile,
        'Yapıştırılan Sınav Metni',
        8
      );
      applyExtractedQuestions(localParsed, 'Yapıştırılan Sınav Metni');
    } finally {
      setPdfExtractBusy(false);
    }
  };

  const handleMove = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= questions.length) return;
    const copy = [...questions];
    const tmp = copy[idx];
    copy[idx] = copy[target];
    copy[target] = tmp;
    onUpdateQuestions(renumber(copy));
    setSelectedIndex(target);
  };

  const handleDuplicate = (idx: number) => {
    const src = questions[idx];
    if (!src) return;
    const clone: ExamQuestion = {
      ...src,
      id: `q-dup-${Date.now()}`,
      options: { ...src.options },
      visual: src.visual ? { ...src.visual } : undefined,
    };
    const copy = [...questions];
    copy.splice(idx + 1, 0, clone);
    onUpdateQuestions(renumber(copy));
    setSelectedIndex(idx + 1);
    notify(`Soru ${src.number} çoğaltıldı.`);
  };

  const handleDelete = (idx: number) => {
    if (questions.length <= 1) return;
    const removedNum = questions[idx]?.number;
    const next = renumber(questions.filter((_, i) => i !== idx));
    onUpdateQuestions(next);
    setSelectedIndex(Math.max(0, Math.min(idx, next.length - 1)));
    notify(`Soru ${removedNum} kitapçıktan çıkarıldı.`);
  };

  const handleAddBlankQuestion = () => {
    const fallbackSubj = gradeProfile.subjects[0];
    const options: Record<string, string> = {};
    letters.forEach((l) => {
      options[l] = `${l} seçeneği metnini buraya yazın`;
    });
    const added: ExamQuestion = {
      id: `q-new-${Date.now()}`,
      number: questions.length + 1,
      subject: fallbackSubj.name,
      topic: fallbackSubj.topics[0] || 'Genel Tekrar',
      gainCode: `${gradeProfile.id}.${fallbackSubj.id.toUpperCase()}.YENI`,
      difficulty: 'Orta',
      stem: `${fallbackSubj.name} (${fallbackSubj.topics[0] || 'Genel'}) için yeni nesil deneme sorusu metnini buraya yazınız.`,
      options,
      correctOption: 'A',
      explanation: 'Doğru yanıt gerekçesi ve kısa çözüm adımını buraya ekleyebilirsiniz.',
      source: 'Müfredat Havuzu',
    };
    const next = [...questions, added];
    onUpdateQuestions(next);
    setSelectedIndex(next.length - 1);
    notify(`Soru ${added.number} oluşturuldu ve düzenlemeye açıldı.`);
  };

  const handleApplyAuditFix = (
    fixType: 'balance-options' | 'balance-difficulty' | 'fill-explanations'
  ) => {
    if (fixType === 'balance-options') {
      onUpdateQuestions(balanceQuestionOptions(questions, gradeProfile.optionCount));
      notify('Tüm soruların doğru cevap şıkları dengeli dağıtıldı.');
    } else if (fixType === 'balance-difficulty') {
      onUpdateQuestions(balanceDifficultyLevels(questions));
      notify('Soru zorluk seviyeleri %30 Kolay / %45 Orta / %25 Zor piramidine hizalandı.');
    } else {
      onUpdateQuestions(fillMissingExplanations(questions));
      notify('Eksik veya kısa çözüm açıklamaları kazanım notlarıyla tamamlandı.');
    }
  };

  const handleInjectNewGenContext = () => {
    if (!activeQ) return;
    if (activeQ.stem.includes('Yeni Nesil Kurgu:')) return;
    updateActiveQuestion({
      stem: `Yeni Nesil Kurgu: Bir okul etkinliğinde/günlük yaşam senaryosunda verilen bilgilere göre analiz yapınız. ${activeQ.stem}`,
      difficulty: activeQ.difficulty === 'Kolay' ? 'Orta' : activeQ.difficulty,
    });
    notify(`Soru ${activeQ.number} yeni nesil bağlam cümlesiyle güncellendi.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header, Grade Selector & Visual Question Quick-Add Actions */}
      <div className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              Deneme Editörü — {cover.examTitle}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Sınıf düzeyini seçin, grafikli/tablolu/matematiksel veya resimli İngilizce soruları ekleyin ya da PDF yükleyip soruları otomatik hazırlayın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="block text-xs font-semibold">
              <span className="sr-only">Sınıf veya Sınav Düzeyi</span>
              <select
                value={gradeProfile.id}
                onChange={(e) => onSelectGrade(e.target.value as GradeLevelId)}
                aria-label="Editör Sınıf veya Sınav Düzeyi"
                data-testid="editor-grade-select"
                className="rounded-xl px-3 py-2 text-xs font-bold surface-alt"
              >
                {allowedGrades.map((gp) => (
                  <option key={gp.id} value={gp.id}>
                    {gp.shortLabel} ({gp.optionCount} Şık)
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleAddBlankQuestion}
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Yeni Soru Ekle</span>
            </button>

            <button
              type="button"
              onClick={onDownloadBookletPdf}
              className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-4 h-4" aria-hidden="true" />
              <span>Düzenlenmiş Kitapçığı PDF İndir</span>
            </button>
          </div>
        </div>

        {/* Rich Visual Question Preset Toolbar */}
        <div
          className="pt-3 border-t flex flex-wrap items-center gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-xs font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
            Hızlı Görsel Soru Ekle:
          </span>
          <button
            type="button"
            onClick={() => handleAddVisualPresetQuestion('chart')}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--chart-1)' }} aria-hidden="true" />
            <span>+ Grafikli Soru</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddVisualPresetQuestion('table')}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Table2 className="w-3.5 h-3.5" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
            <span>+ Tablolu İşlem</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddVisualPresetQuestion('math')}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Sigma className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span>+ Matematik / Şekil</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddVisualPresetQuestion('image', 'weather')}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>+ Resimli İngilizce</span>
          </button>
        </div>
      </div>

      {editorMessage && (
        <div className="surface-card rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{editorMessage}</span>
        </div>
      )}

      {/* PDF / Exam Text Auto-Preparation Panel */}
      <section
        aria-labelledby="editor-pdf-extract-title"
        data-testid="editor-pdf-extract-section"
        className="surface-card rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileUp className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h3 id="editor-pdf-extract-title" className="text-base font-bold">
                Deneme PDF Yükle & Soruları Otomatik Hazırla ({gradeProfile.shortLabel})
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                PDF veya TXT deneme dosyası yükleyin ya da soru metnini yapıştırın; sistem soruları otomatik ayırıp düzenlenebilir hale getirir.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pdfImportMode}
              onChange={(e) => setPdfImportMode(e.target.value as 'replace' | 'append')}
              aria-label="PDF soru ekleme modu"
              className="rounded-lg px-2.5 py-2 text-xs font-semibold surface-alt"
            >
              <option value="replace">Kitapçığı PDF'ten Yeniden Hazırla</option>
              <option value="append">Mevcut Soruların Sonuna Ekle</option>
            </select>

            <label className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
              {pdfExtractBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Sorular Hazırlanıyor...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>PDF / TXT Dosyasından Hazırla</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={handleExtractFromFile}
                aria-label="Deneme PDF veya TXT dosyası seç"
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <label className="lg:col-span-9 block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>
              Veya Sınav Metnini / Numaralı Soruları Yapıştırın (Örn: 1. ... A) ... B) ... C) ... D) ...)
            </span>
            <textarea
              rows={2}
              value={rawExamPasteText}
              onChange={(e) => setRawExamPasteText(e.target.value)}
              placeholder="1. Yukarıdaki tabloya göre... A) 12 B) 18 C) 24 D) 30 Cevap: C"
              className="mt-1 w-full rounded-lg p-2.5 text-xs surface-alt"
            />
          </label>
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <button
              type="button"
              disabled={pdfExtractBusy || !rawExamPasteText.trim()}
              onClick={handleExtractFromPastedText}
              className="btn-3d-secondary w-full py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Metinden Soruları Hazırla</span>
            </button>
            {lastExtractedSource && (
              <div className="text-[11px] font-mono-num text-center" style={{ color: 'var(--chart-3)' }}>
                Son aktarım: {lastExtractedSource}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Editor Quality Audit & Smart Fix Suggestions */}
      <section aria-labelledby="editor-audit-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <h3 id="editor-audit-title" className="text-base font-bold">
              Editör Kalite Denetimi & Akıllı İyileştirme Önerileri
            </h3>
          </div>
          <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            Şık Dengesi: %{audit.optionBalancePct} · Kolay: {audit.difficultyCounts.Kolay} / Orta: {audit.difficultyCounts.Orta} / Zor: {audit.difficultyCounts.Zor}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {audit.suggestions.map((sug) => (
            <div key={sug.id} className="surface-alt rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-bold">{sug.title}</div>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {sug.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApplyAuditFix(sug.fixType)}
                className={`${
                  sug.needsFix ? 'btn-3d' : 'btn-3d-secondary'
                } px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer`}
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Öneriyi Uygula</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Main Split Editor: Question Navigator + Active Question Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Question Navigator & Filters */}
        <section className="lg:col-span-5 surface-card rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-3">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Soru no, konu veya metin ara..."
                aria-label="Soru ara"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs surface-alt"
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Ders filtresi"
              className="sm:col-span-2 rounded-lg px-2.5 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tüm Dersler ({questions.length})</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              aria-label="Zorluk filtresi"
              className="rounded-lg px-2.5 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tüm Zorluk</option>
              <option value="Kolay">Kolay</option>
              <option value="Orta">Orta</option>
              <option value="Zor">Zor</option>
            </select>
          </div>

          <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            Gösterilen: {filteredWithIndex.length} / {questions.length} soru
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredWithIndex.map(({ q, idx }) => {
              const isSelected = idx === safeIdx;
              const visualTag =
                q.visual?.type === 'chart'
                  ? 'Grafik'
                  : q.visual?.type === 'table'
                    ? 'Tablo'
                    : q.visual?.type === 'math'
                      ? 'Matematik'
                      : q.visual?.type === 'image'
                        ? 'Resimli'
                        : null;
              return (
                <div
                  key={q.id}
                  className={`rounded-xl p-3 text-xs transition-all border ${
                    isSelected ? 'surface-card' : 'surface-alt'
                  }`}
                  style={{
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span>
                        Soru {q.number} · {q.subject}
                        {visualTag ? ` [${visualTag}]` : ''}
                      </span>
                      <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                        {q.correctOption} · {q.difficulty}
                      </span>
                    </div>
                    <p
                      className="mt-1 line-clamp-2 text-[11px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {q.stem}
                    </p>
                  </button>

                  <div className="mt-2 pt-2 border-t flex items-center justify-end gap-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Soru ${q.number} yukarı taşı`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer disabled:opacity-40"
                    >
                      <ArrowUp className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === questions.length - 1}
                      aria-label={`Soru ${q.number} aşağı taşı`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer disabled:opacity-40"
                    >
                      <ArrowDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(idx)}
                      aria-label={`Soru ${q.number} çoğalt`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer"
                    >
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      disabled={questions.length <= 1}
                      aria-label={`Soru ${q.number} sil`}
                      className="btn-3d-secondary p-1.5 rounded-md text-rose-600 cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Active Question Detail Editor */}
        {activeQ && (
          <section className="lg:col-span-7 surface-card rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h3 className="text-base font-bold">
                  Soru #{activeQ.number} Düzenleme Formu
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Değişiklikler anında cevap anahtarına, optik analize ve PDF kitapçığa yansır
                </p>
              </div>
              <button
                type="button"
                onClick={handleInjectNewGenContext}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Yeni Nesil Bağlam Ekle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders</span>
                <input
                  type="text"
                  value={activeQ.subject}
                  onChange={(e) => updateActiveQuestion({ subject: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Konu</span>
                <input
                  type="text"
                  value={activeQ.topic}
                  onChange={(e) => updateActiveQuestion({ topic: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Kazanım Kodu</span>
                <input
                  type="text"
                  value={activeQ.gainCode}
                  onChange={(e) => updateActiveQuestion({ gainCode: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Zorluk Seviyesi</span>
                <select
                  value={activeQ.difficulty}
                  onChange={(e) =>
                    updateActiveQuestion({ difficulty: e.target.value as DifficultyLevel })
                  }
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                >
                  <option value="Kolay">Kolay</option>
                  <option value="Orta">Orta</option>
                  <option value="Zor">Zor</option>
                </select>
              </label>
            </div>

            {/* Interactive Rich Visual Editor (Chart / Table / Math / Image) */}
            <div
              className="surface-alt rounded-xl p-4 space-y-3 border"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">
                  Soru Görseli / Grafik / Tablo / Matematik İşlem Düzenleyici
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'Görsel Yok' },
                      { id: 'chart', label: 'Grafik' },
                      { id: 'table', label: 'Tablo' },
                      { id: 'math', label: 'Matematik/Şekil' },
                      { id: 'image', label: 'Resimli' },
                    ] as const
                  ).map((opt) => {
                    const currentType = activeQ.visual?.type ?? 'none';
                    const active = currentType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSetVisualType(opt.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                          active ? 'btn-3d' : 'btn-3d-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeQ.visual && (
                <div className="space-y-3 pt-1">
                  <QuestionVisualPreview visual={activeQ.visual} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block text-xs font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Görsel / Tablo Başlığı</span>
                      <input
                        type="text"
                        value={activeQ.visual.title}
                        onChange={(e) => updateActiveVisual({ title: e.target.value })}
                        className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card"
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Alt Açıklama (İsteğe Bağlı)</span>
                      <input
                        type="text"
                        value={activeQ.visual.caption ?? ''}
                        onChange={(e) => updateActiveVisual({ caption: e.target.value })}
                        className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card"
                      />
                    </label>
                  </div>

                  {activeQ.visual.type === 'chart' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                        <span>Grafik Çubuk Verileri</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveVisual({
                              bars: [
                                ...(activeQ.visual?.bars ?? []),
                                { label: 'Yeni', value: 45 },
                              ],
                            })
                          }
                          className="btn-3d-secondary px-2 py-1 rounded text-[11px] font-bold cursor-pointer"
                        >
                          + Sütun Ekle
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(activeQ.visual.bars ?? []).map((bar, bi) => (
                          <div key={bi} className="flex items-center gap-1.5 surface-card p-1.5 rounded-lg">
                            <input
                              type="text"
                              value={bar.label}
                              onChange={(e) => {
                                const nextBars = [...(activeQ.visual?.bars ?? [])];
                                nextBars[bi] = { ...bar, label: e.target.value };
                                updateActiveVisual({ bars: nextBars });
                              }}
                              aria-label={`Sütun ${bi + 1} etiketi`}
                              className="flex-1 min-w-0 rounded px-2 py-1 text-xs surface-alt"
                            />
                            <input
                              type="number"
                              value={bar.value}
                              onChange={(e) => {
                                const nextBars = [...(activeQ.visual?.bars ?? [])];
                                nextBars[bi] = { ...bar, value: Number(e.target.value) || 0 };
                                updateActiveVisual({ bars: nextBars });
                              }}
                              aria-label={`Sütun ${bi + 1} değeri`}
                              className="w-16 rounded px-2 py-1 text-xs font-mono-num surface-alt"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeQ.visual.type === 'table' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold">
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Tablo Sütun Başlıkları (virgülle ayırın)
                        </span>
                        <input
                          type="text"
                          value={(activeQ.visual.headers ?? []).join(', ')}
                          onChange={(e) =>
                            updateActiveVisual({
                              headers: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card"
                        />
                      </label>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span>Tablo Satırları (hücreleri | ile ayırın)</span>
                          <button
                            type="button"
                            onClick={() => {
                              const cols = Math.max(2, activeQ.visual?.headers?.length ?? 3);
                              updateActiveVisual({
                                rows: [
                                  ...(activeQ.visual?.rows ?? []),
                                  Array.from({ length: cols }, (_, ci) => `Veri ${ci + 1}`),
                                ],
                              });
                            }}
                            className="btn-3d-secondary px-2 py-1 rounded text-[11px] font-bold cursor-pointer"
                          >
                            + Satır Ekle
                          </button>
                        </div>
                        {(activeQ.visual.rows ?? []).map((row, ri) => (
                          <input
                            key={ri}
                            type="text"
                            value={row.join(' | ')}
                            onChange={(e) => {
                              const nextRows = [...(activeQ.visual?.rows ?? [])];
                              nextRows[ri] = e.target.value.split('|').map((c) => c.trim());
                              updateActiveVisual({ rows: nextRows });
                            }}
                            aria-label={`Tablo satırı ${ri + 1}`}
                            className="w-full rounded-lg px-2.5 py-1.5 text-xs font-mono-num surface-card"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {activeQ.visual.type === 'math' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <label className="sm:col-span-2 block text-xs font-semibold">
                        <span style={{ color: 'var(--text-secondary)' }}>Matematiksel Formül / İşlem</span>
                        <input
                          type="text"
                          value={activeQ.visual.formula ?? ''}
                          onChange={(e) => updateActiveVisual({ formula: e.target.value })}
                          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs font-mono-num surface-card"
                        />
                      </label>
                      <label className="block text-xs font-semibold">
                        <span style={{ color: 'var(--text-secondary)' }}>Geometri Şekli</span>
                        <select
                          value={activeQ.visual.geometryShape ?? 'rectangle'}
                          onChange={(e) =>
                            updateActiveVisual({
                              geometryShape: e.target.value as QuestionVisualSpec['geometryShape'],
                            })
                          }
                          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card"
                        >
                          <option value="rectangle">Dikdörtgen</option>
                          <option value="triangle">Dik Üçgen</option>
                          <option value="circle">Daire</option>
                          <option value="fraction">Kesir Modeli (3/4)</option>
                          <option value="none">Şekilsiz (Yalnız Formül)</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {activeQ.visual.type === 'image' && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={activeQ.visual.scenePresetId ?? 'weather'}
                        onChange={(e) => {
                          const nextId = e.target.value as EnglishScenePresetId;
                          const scene = ENGLISH_SCENE_PRESETS.find((p) => p.id === nextId);
                          if (scene) {
                            updateActiveVisual({
                              scenePresetId: scene.id,
                              title: scene.title,
                              sceneLabels: scene.sceneLabels,
                              imageDataUrl: undefined,
                            });
                          }
                        }}
                        aria-label="Hazır İngilizce Görsel Sahnesi"
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold surface-card"
                      >
                        {ENGLISH_SCENE_PRESETS.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            Hazır Sahne: {sc.label}
                          </option>
                        ))}
                      </select>

                      <label className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Özel Resim Yükle (PNG/JPG)</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleCustomQuestionImageUpload}
                          className="sr-only"
                        />
                      </label>

                      {activeQ.visual.imageDataUrl && (
                        <button
                          type="button"
                          onClick={() => updateActiveVisual({ imageDataUrl: undefined })}
                          className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 cursor-pointer"
                        >
                          Yüklenen Resmi Kaldır
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Soru Kökü / Metni</span>
              <textarea
                rows={4}
                value={activeQ.stem}
                onChange={(e) => updateActiveQuestion({ stem: e.target.value })}
                className="mt-1 w-full rounded-lg p-3 text-sm surface-alt leading-relaxed"
              />
            </label>

            <div className="space-y-2.5">
              <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                Seçenekler ve Doğru Cevap İşaretleme
              </div>
              {letters.map((letter) => {
                const isCorrect = activeQ.correctOption === letter;
                return (
                  <div key={letter} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateActiveQuestion({ correctOption: letter })}
                      aria-pressed={isCorrect}
                      aria-label={`${letter} şıkkını doğru cevap yap`}
                      className={`w-10 h-9 rounded-lg text-xs font-extrabold font-mono-num shrink-0 cursor-pointer ${
                        isCorrect ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      {letter}
                    </button>
                    <input
                      type="text"
                      value={activeQ.options[letter] ?? ''}
                      onChange={(e) => updateActiveOption(letter, e.target.value)}
                      aria-label={`${letter} şıkkı metni`}
                      className="flex-1 rounded-lg px-3 py-2 text-xs surface-alt"
                    />
                  </div>
                );
              })}
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Çözüm & Kazanım Açıklaması</span>
              <textarea
                rows={3}
                value={activeQ.explanation}
                onChange={(e) => updateActiveQuestion({ explanation: e.target.value })}
                className="mt-1 w-full rounded-lg p-3 text-xs surface-alt leading-relaxed"
              />
            </label>
          </section>
        )}
      </div>
    </div>
  );
}
