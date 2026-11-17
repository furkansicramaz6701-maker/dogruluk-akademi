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
} from 'lucide-react';
import { GRADE_PROFILES } from '../data/curriculum';
import {
  CoverConfig,
  DifficultyLevel,
  DynamicCurriculumOverride,
  DynamicSourceMix,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  Institution,
} from '../types/academy';
import { buildAutoExamQuestions } from '../utils/examAnalysis';
import {
  buildDynamicMixedQuestions,
  buildQuestionsFromCurriculumOverride,
  extractCurriculumOverrideFromText,
  parseQuestionsSpreadsheet,
} from '../utils/dynamicQuestionSource';
import { filterGradeProfilesByInstitution } from '../utils/institutionCodes';
import { Cover3DPreview } from './Cover3DPreview';

interface ExamGeneratorViewProps {
  institution: Institution;
  gradeProfile: GradeProfile;
  onSelectGrade: (gradeId: GradeLevelId) => void;
  questions: ExamQuestion[];
  cover: CoverConfig;
  uploadedPdfName: string | null;
  uploadedPdfPageCount: number | null;
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
  questions,
  cover,
  uploadedPdfName,
  uploadedPdfPageCount,
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
}: ExamGeneratorViewProps) {
  const allowedGradeProfiles = filterGradeProfilesByInstitution(GRADE_PROFILES, institution);
  const defaultQuestionTarget = gradeProfile.subjects.reduce((acc, s) => acc + s.questionCount, 0);

  const [aiTab, setAiTab] = useState<'meb-pdf' | 'dynamic-mix' | 'internet' | 'textbook'>('meb-pdf');
  const [difficultyMix, setDifficultyMix] = useState<'dengeli' | 'kolay' | 'zor'>('dengeli');
  const [targetCount, setTargetCount] = useState<number>(defaultQuestionTarget);

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

  const handleGenerateAuto = () => {
    setErrorMsg(null);
    const next = buildAutoExamQuestions(gradeProfile.id, difficultyMix, targetCount);
    onUpdateQuestions(next);
    onUpdateCover({ questionCount: next.length });
    setNotice(
      `${gradeProfile.label} müfredatına göre ${next.length} soruluk (${gradeProfile.optionCount} şıklı) deneme otomatik oluşturuldu.`
    );
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
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Deneme Yükleme, Dinamik Soru Kaynağı & Tam Paket ZIP Merkezi
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            MEB müfredat PDF’i veya seçtiğiniz sınıf düzeyine ({gradeProfile.shortLabel}) uygun şekilde hazır deneme yükleyin ya da dinamik karma deneme oluşturun.
          </p>
        </div>
        <div className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
          Aktif Havuz: {questions.length} Soru · {gradeProfile.shortLabel} ({gradeProfile.optionCount} Şık)
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <span style={{ color: 'var(--text-secondary)' }}>Soru Sayısı</span>
                <select
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGenerateAuto}
              className="btn-3d flex-1 py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{targetCount} Soruluk Otomatik Deneme Oluştur</span>
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

      {/* 3. DİNAMİK SORU KAYNAĞI & MEB MÜFREDAT MERKEZİ */}
      <section aria-labelledby="ai-sources-title" data-testid="dynamic-source-section" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="ai-sources-title" className="text-base font-bold">
              3. Dinamik Soru Kaynağı & MEB Müfredat Merkezi
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              MEB müfredat sayfasından PDF yükleyerek {gradeProfile.shortLabel} aktif müfredatı kurun, çoklu kaynakları harmanlayın veya Excel soru bankası içe aktarın.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <span style={{ color: 'var(--text-secondary)' }}>Kitapçık Türü</span>
              <select
                value={cover.bookletCode}
                onChange={(e) =>
                  onUpdateCover({ bookletCode: e.target.value as 'A' | 'B' })
                }
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
              >
                <option value="A">A Kitapçığı</option>
                <option value="B">B Kitapçığı</option>
              </select>
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
