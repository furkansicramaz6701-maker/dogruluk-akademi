import { ChangeEvent, useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileDown,
  FileUp,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  CoverConfig,
  GradeProfile,
  OpenEndedPaperAnalysis,
  OpenEndedQuestion,
} from '../types/academy';
import { extractPrintableTextFromPdfBytes } from '../utils/examPdfParser';
import {
  buildDefaultOpenEndedQuestions,
  buildOpenEndedParentMessage,
  determineOpenEndedStatus,
  evaluateOpenEndedAnswersText,
  parseOpenEndedQuestionsFromText,
} from '../utils/openEndedExam';
import { generateOpenEndedExamPdf } from '../utils/pdfAndZip';
import { buildWhatsAppHref } from '../utils/weeklyAnalysis';

interface OpenEndedPaperPanelProps {
  gradeProfile: GradeProfile;
  cover: CoverConfig;
  studentName: string;
  studentNumber: string;
  classroom: string;
  parentPhone?: string;
  latestAnalysis: OpenEndedPaperAnalysis | null;
  externalQuestions?: OpenEndedQuestion[] | null;
  onSyncQuestions?: (next: OpenEndedQuestion[]) => void;
  onSavePaperAnalysis: (result: OpenEndedPaperAnalysis) => void;
  onGoToReports?: () => void;
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

export function OpenEndedPaperPanel({
  gradeProfile,
  cover,
  studentName,
  studentNumber,
  classroom,
  parentPhone,
  latestAnalysis,
  externalQuestions = null,
  onSyncQuestions,
  onSavePaperAnalysis,
  onGoToReports,
}: OpenEndedPaperPanelProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>('Tümü');
  const [questions, setQuestions] = useState<OpenEndedQuestion[]>(() =>
    externalQuestions && externalQuestions.length > 0
      ? externalQuestions
      : buildDefaultOpenEndedQuestions(gradeProfile, 10)
  );
  const [rawQuestionsInput, setRawQuestionsInput] = useState<string>('');
  const [rawSolutionsInput, setRawSolutionsInput] = useState<string>('');
  const [solutionFile, setSolutionFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  const [studentPaperText, setStudentPaperText] = useState<string>('');
  const [studentPaperFile, setStudentPaperFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  const [busy, setBusy] = useState<boolean>(false);
  const [pdfBusy, setPdfBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>(parentPhone ?? '');
  const [parentMsgText, setParentMsgText] = useState<string>('');

  useEffect(() => {
    if (externalQuestions && externalQuestions.length > 0) {
      setQuestions(externalQuestions);
      return;
    }
    setQuestions(buildDefaultOpenEndedQuestions(gradeProfile, 10, selectedSubject));
  }, [gradeProfile, selectedSubject, externalQuestions]);

  useEffect(() => {
    if (parentPhone) setPhoneInput(parentPhone);
  }, [parentPhone]);

  useEffect(() => {
    if (latestAnalysis) {
      setParentMsgText(
        buildOpenEndedParentMessage({
          paperAnalysis: latestAnalysis,
          academyName: cover.academyName,
          gradeProfile,
        })
      );
    }
  }, [latestAnalysis, cover.academyName, gradeProfile]);

  const handleLoadQuestionsFile = async (
    e: ChangeEvent<HTMLInputElement>,
    target: 'questions' | 'solutions'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      let txt = '';
      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
        txt = await file.text();
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        txt = extractPrintableTextFromPdfBytes(bytes);
        if (target === 'solutions') {
          const b64 = await fileToBase64(file);
          setSolutionFile({ name: file.name, base64: b64, mimeType: 'application/pdf' });
        }
      } else {
        const b64 = await fileToBase64(file);
        if (target === 'solutions') {
          setSolutionFile({ name: file.name, base64: b64, mimeType: file.type || 'image/png' });
        }
      }

      if (target === 'questions') {
        const nextQText = txt || rawQuestionsInput;
        setRawQuestionsInput(nextQText);
        const parsed = parseOpenEndedQuestionsFromText(
          nextQText,
          rawSolutionsInput,
          gradeProfile,
          10,
          selectedSubject
        );
        setQuestions(parsed);
        setNotice(`${file.name} dosyasından ${parsed.length} adet açık uçlu soru yüklendi.`);
      } else {
        if (txt) setRawSolutionsInput(txt);
        const parsed = parseOpenEndedQuestionsFromText(
          rawQuestionsInput,
          txt || rawSolutionsInput,
          gradeProfile,
          10,
          selectedSubject
        );
        setQuestions(parsed);
        setNotice(`${file.name} çözüm/rubrik kaynağı olarak eklendi.`);
      }
    } catch {
      setErrorMsg(`${file.name} dosyası okunamadı.`);
    }
  };

  const handleApplyPastedQuestionsAndSolutions = () => {
    const parsed = parseOpenEndedQuestionsFromText(
      rawQuestionsInput,
      rawSolutionsInput,
      gradeProfile,
      10,
      selectedSubject
    );
    setQuestions(parsed);
    setNotice(`${parsed.length} adet açık uçlu soru ve çözüm rubriği güncellendi.`);
  };

  const handleLoadSamplePaper = () => {
    const sampleLines = questions.slice(0, 10).map((q, idx) => {
      if (idx < 7) {
        return `${q.number}. ${q.modelAnswer.slice(0, 95)}`;
      }
      if (idx === 7 || idx === 8) {
        return `${q.number}. ${q.keywords.slice(0, 2).join(' ')} temel kuralıyla kısmi hesap yapıldı.`;
      }
      return `${q.number}. `;
    });
    setStudentPaperText(sampleLines.join('\n'));
    setNotice('Örnek 10 soruluk öğrenci yazılı yanıtı yüklendi; şimdi kağıdı analiz edebilirsiniz.');
  };

  const handleStudentPaperUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
        const txt = await file.text();
        setStudentPaperText(txt);
        setStudentPaperFile(null);
        setNotice(`${file.name} öğrenci yanıt metni olarak yüklendi.`);
        return;
      }
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await PDFDocument.load(bytes).catch(() => null);
        const extracted = extractPrintableTextFromPdfBytes(bytes);
        if (extracted.trim().length >= 16) {
          setStudentPaperText(extracted);
        }
      }
      const b64 = await fileToBase64(file);
      setStudentPaperFile({
        name: file.name,
        base64: b64,
        mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png'),
      });
      setNotice(`${file.name} öğrenci yazılı kağıdı olarak eklendi. Analiz butonuna basabilirsiniz.`);
    } catch {
      setErrorMsg('Öğrenci kağıdı yüklenemedi.');
    }
  };

  const handleAnalyzePaper = async () => {
    if (!studentPaperText.trim() && !studentPaperFile) {
      setErrorMsg('Lütfen analiz edilecek öğrenci kağıdı görseli/PDF’i yükleyin veya öğrenci yanıtlarını yazın.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setNotice(null);

    try {
      // If an uploaded image/PDF is present, try multimodal Gemini grading first with bounded timeout
      if (studentPaperFile || solutionFile) {
        const controller = new AbortController();
        const tid = window.setTimeout(() => controller.abort(), 14000);
        try {
          const resp = await fetch('/api/open-ended/analyze-paper', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              gradeLabel: gradeProfile.shortLabel,
              studentName: studentName || 'Öğrenci',
              examTitle: `${gradeProfile.shortLabel} 10 Soruluk Açık Uçlu Yazılı`,
              questions,
              solutionFileBase64: solutionFile?.base64,
              solutionFileMimeType: solutionFile?.mimeType,
              solutionText: rawSolutionsInput,
              studentPaperBase64: studentPaperFile?.base64,
              studentPaperMimeType: studentPaperFile?.mimeType,
              studentPaperText,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.questionGrades) && data.questionGrades.length > 0) {
              const grades = data.questionGrades.map(
                (
                  g: Partial<OpenEndedPaperAnalysis['questionGrades'][number]>,
                  idx: number
                ) => ({
                  number: Number(g.number) || idx + 1,
                  subject: g.subject || questions[idx]?.subject || 'Genel',
                  score: Math.min(
                    Number(g.maxPoints) || 10,
                    Math.max(0, Number(g.score) || 0)
                  ),
                  maxPoints: Number(g.maxPoints) || 10,
                  status: (g.status as 'tam' | 'kismi' | 'yanlis' | 'bos') || 'kismi',
                  studentAnswerSummary: g.studentAnswerSummary || '-',
                  feedback: g.feedback || '',
                })
              );
              const maxTotal = grades.reduce((s: number, g: { maxPoints: number }) => s + g.maxPoints, 0) || 100;
              const total = grades.reduce((s: number, g: { score: number }) => s + g.score, 0);
              const pct = Math.round((total / maxTotal) * 100);
              const result: OpenEndedPaperAnalysis = {
                id: `oe-ai-${Date.now()}`,
                studentName: studentName || 'Öğrenci',
                studentNumber: studentNumber || '--------',
                classroom: classroom || gradeProfile.shortLabel,
                examTitle: `${gradeProfile.shortLabel} 10 Soruluk Açık Uçlu Yazılı`,
                gradeId: gradeProfile.id,
                totalScore: total,
                maxTotalScore: maxTotal,
                successPct: pct,
                developmentStatus: determineOpenEndedStatus(pct),
                overallFeedback: data.overallFeedback || `${total}/${maxTotal} puan elde edildi.`,
                questionGrades: grades,
                evaluatedAt: new Date().toLocaleDateString('tr-TR'),
              };
              onSavePaperAnalysis(result);
              setNotice(`Açık uçlu yazılı kağıdı çözümlere göre analiz edildi (${total}/${maxTotal} Puan).`);
              return;
            }
          }
        } catch {
          // Fall through cleanly if text fallback exists; otherwise inform user
          if (!studentPaperText.trim()) {
            setErrorMsg(
              'Görsel/PDF kağıt analizi için yapay zeka servisi yanıt vermedi; metin yanıtı girerek rubrik analizini anında çalıştırabilirsiniz.'
            );
            return;
          }
        } finally {
          window.clearTimeout(tid);
        }
      }

      const fallbackResult = evaluateOpenEndedAnswersText({
        questions,
        studentPaperText,
        studentName: studentName || 'Öğrenci',
        studentNumber: studentNumber || '--------',
        classroom: classroom || gradeProfile.shortLabel,
        examTitle: `${gradeProfile.shortLabel} 10 Soruluk Açık Uçlu Yazılı`,
        gradeProfile,
      });
      onSavePaperAnalysis(fallbackResult);
      setNotice(
        `10 soruluk açık uçlu kağıt rubriğe göre puanlandı: ${fallbackResult.totalScore} / ${fallbackResult.maxTotalScore} (%${fallbackResult.successPct}).`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadOpenEndedPdf = async () => {
    setPdfBusy(true);
    try {
      const bytes = await generateOpenEndedExamPdf({
        cover,
        gradeProfile,
        questions,
        includeSolutionKey: true,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dogruluk-Akademi-${gradeProfile.id}-10-Acik-Uclu-Yazili.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  };

  const waHref = buildWhatsAppHref(phoneInput, parentMsgText);

  return (
    <div className="space-y-6" data-testid="open-ended-panel">
      {/* Header & Controls */}
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">
            10 Soruluk Açık Uçlu (Klasik) Sorular, Çözüm Yükleme & Kağıt Analizi
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {gradeProfile.shortLabel} düzeyinde 10 açık uçlu soru ve çözüm anahtarı hazırlayın/yükleyin, öğrenci yazılı kağıdını çözüme göre puanlayın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            aria-label="Açık uçlu sınav dersi seç"
            className="rounded-xl px-3 py-2 text-xs font-bold surface-alt"
          >
            <option value="Tümü">Karma (Tüm Dersler · 10 Soru)</option>
            {gradeProfile.subjects.map((s) => (
              <option key={s.id} value={s.name}>
                Yalnızca {s.name} (10 Soru)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              const fresh = buildDefaultOpenEndedQuestions(gradeProfile, 10, selectedSubject);
              setQuestions(fresh);
              onSyncQuestions?.(fresh);
              setNotice(`${gradeProfile.shortLabel} için 10 soruluk açık uçlu set ve çözümleri yenilendi.`);
            }}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>10 Soru + Çözüm Üret</span>
          </button>

          <button
            type="button"
            disabled={pdfBusy}
            onClick={handleDownloadOpenEndedPdf}
            className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {pdfBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>Yazılı & Çözüm PDF İndir</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="surface-card rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl px-4 py-3 text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Upload Questions/Solutions & Student Paper Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Questions & Reference Solutions Upload */}
        <section className="surface-card rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold">1. Açık Uçlu Soruları & Örnek Çözümleri Yükle</h4>
            <div className="flex flex-wrap gap-2">
              <label className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Soru PDF/TXT Yükle</span>
                <input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={(e) => handleLoadQuestionsFile(e, 'questions')}
                  className="sr-only"
                />
              </label>
              <label className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Çözüm PDF/Görsel Yükle</span>
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
                  onChange={(e) => handleLoadQuestionsFile(e, 'solutions')}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>10 Soru Metni (1. ... 2. ...)</span>
              <textarea
                rows={4}
                value={rawQuestionsInput}
                onChange={(e) => setRawQuestionsInput(e.target.value)}
                placeholder={'1. Kesirlerde toplama işlemini örnekle açıklayınız.\n2. Çevresi 40 cm olan karenin alanı kaç cm2 dir?'}
                className="mt-1 w-full rounded-lg p-2.5 text-xs surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Çözüm / Rubrik Anahtarı</span>
              <textarea
                rows={4}
                value={rawSolutionsInput}
                onChange={(e) => setRawSolutionsInput(e.target.value)}
                placeholder={'1. Paydalar eşitlenir ve paylar toplanır.\n2. Bir kenar 40/4 = 10 cm, alan 10x10 = 100 cm2 dir.'}
                className="mt-1 w-full rounded-lg p-2.5 text-xs surface-alt"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {solutionFile ? (
              <span className="text-[11px] font-mono-num text-emerald-700 dark:text-emerald-400">
                Ekli Çözüm Dosyası: {solutionFile.name}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Aşağıdaki 10 soruluk tabloda her soruyu tek tek de düzenleyebilirsiniz.
              </span>
            )}
            <button
              type="button"
              onClick={handleApplyPastedQuestionsAndSolutions}
              disabled={!rawQuestionsInput.trim() && !rawSolutionsInput.trim()}
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Metinden Soruları & Çözümleri Aktar
            </button>
          </div>
        </section>

        {/* Right: Student Paper Upload & Analyze */}
        <section className="surface-card rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold">2. Öğrenci Yazılı Kağıdını Yükle & Analiz Ettir</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleLoadSamplePaper}
                className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Örnek Öğrenci Kağıdı Doldur
              </button>
              <label className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kağıt Foto / PDF Yükle</span>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt"
                  onChange={handleStudentPaperUpload}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {studentPaperFile && (
            <div className="surface-alt rounded-lg px-3 py-2 text-xs font-mono-num text-emerald-700 dark:text-emerald-400">
              Yüklü Kağıt: {studentPaperFile.name}
            </div>
          )}

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>
              Öğrencinin Açık Uçlu Kağıt Yanıtları (1–10 Numaralı Metin veya Yüklenen Dosya)
            </span>
            <textarea
              rows={5}
              value={studentPaperText}
              onChange={(e) => setStudentPaperText(e.target.value)}
              aria-label="Öğrenci Açık Uçlu Kağıt Yanıtları"
              placeholder={'1. Paydalar eşitlenir...\n2. Bir kenarı 10 cm, alanı 100 cm2...'}
              className="mt-1 w-full rounded-lg p-2.5 text-xs surface-alt"
            />
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={handleAnalyzePaper}
            data-testid="analyze-open-ended-btn"
            className="btn-3d w-full py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Kağıt Çözümlere Göre Analiz Ediliyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Kağıdı Çözüme Göre Analiz Et (100 Puan Üzerinden)</span>
              </>
            )}
          </button>
        </section>
      </div>

      {/* Editable 10 Open-Ended Questions & Solutions List */}
      <section className="surface-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold">
            Aktif Açık Uçlu Soru & Çözüm Rubriği ({questions.length} Soru · Toplam{' '}
            {questions.reduce((s, q) => s + q.maxPoints, 0)} Puan)
          </h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {questions.map((q, idx) => (
            <div key={q.id} className="surface-alt rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2 font-bold">
                <span style={{ color: 'var(--accent-primary)' }}>
                  Soru {q.number} · {q.subject}
                </span>
                <span className="font-mono-num">{q.maxPoints} Puan</span>
              </div>
              <textarea
                rows={2}
                value={q.prompt}
                onChange={(e) =>
                  setQuestions((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, prompt: e.target.value } : item))
                  )
                }
                aria-label={`Açık uçlu soru ${q.number} metni`}
                className="w-full rounded-lg p-2 text-xs surface-card"
              />
              <textarea
                rows={2}
                value={q.modelAnswer}
                onChange={(e) =>
                  setQuestions((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, modelAnswer: e.target.value } : item
                    )
                  )
                }
                aria-label={`Açık uçlu soru ${q.number} örnek çözümü`}
                className="w-full rounded-lg p-2 text-[11px] surface-card text-emerald-800 dark:text-emerald-300"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Open-Ended Analysis Result + Parent WhatsApp Card */}
      {latestAnalysis && (
        <section
          className="surface-card rounded-xl p-5 space-y-4 border-l-4"
          style={{ borderLeftColor: 'var(--chart-3)' }}
          data-testid="open-ended-analysis-result"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
              <div>
                <h4 className="text-base font-bold">
                  Açık Uçlu Kağıt Analiz Raporu — {latestAnalysis.studentName} ({gradeProfile.shortLabel})
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {latestAnalysis.overallFeedback}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xl font-extrabold font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                  {latestAnalysis.totalScore} / {latestAnalysis.maxTotalScore} Puan
                </div>
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  %{latestAnalysis.successPct} · {latestAnalysis.developmentStatus}
                </div>
              </div>
              {onGoToReports && (
                <button
                  type="button"
                  onClick={onGoToReports}
                  className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Karneye Git
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <th className="py-2 pr-3">Soru</th>
                  <th className="py-2 pr-3">Ders</th>
                  <th className="py-2 pr-3">Durum</th>
                  <th className="py-2 pr-3">Puan</th>
                  <th className="py-2">Analiz & Geri Bildirim</th>
                </tr>
              </thead>
              <tbody>
                {latestAnalysis.questionGrades.map((g) => (
                  <tr key={g.number} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-2 pr-3 font-mono-num font-bold">{g.number}</td>
                    <td className="py-2 pr-3">{g.subject}</td>
                    <td className="py-2 pr-3 font-bold">
                      {g.status === 'tam'
                        ? 'Tam Puan'
                        : g.status === 'kismi'
                          ? 'Kısmi'
                          : g.status === 'bos'
                            ? 'Boş'
                            : 'Hatalı'}
                    </td>
                    <td className="py-2 pr-3 font-mono-num font-bold">
                      {g.score} / {g.maxPoints}
                    </td>
                    <td className="py-2">{g.feedback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Integrated WhatsApp Message Preview for Open-Ended Exam */}
          <div className="surface-alt rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <MessageSquare className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>Açık Uçlu Sınav Veli WhatsApp Mesajı</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Veli Tel: 05XX..."
                  className="rounded-lg px-2.5 py-1.5 text-xs font-mono-num surface-card"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(parentMsgText).catch(() => null);
                    setCopiedMsg(true);
                    setTimeout(() => setCopiedMsg(false), 2000);
                  }}
                  className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedMsg ? 'Kopyalandı' : 'Kopyala'}</span>
                </button>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-ended-whatsapp-btn"
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Veliye Gönder (WhatsApp)</span>
                </a>
              </div>
            </div>
            <textarea
              rows={5}
              value={parentMsgText}
              onChange={(e) => setParentMsgText(e.target.value)}
              aria-label="Açık Uçlu Sınav Veli Mesaj Metni"
              className="w-full rounded-lg p-3 text-xs surface-card"
            />
          </div>
        </section>
      )}
    </div>
  );
}
