import { useState, ChangeEvent } from 'react';
import {
  Camera,
  FileKey2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { CoverConfig, ExamAnalysisResult, ExamQuestion, GradeProfile } from '../types/academy';
import { generateSampleOmrPair, parseAnswerString } from '../utils/examAnalysis';
import { OpticalFormPreview } from './OpticalFormPreview';

interface OmrScannerViewProps {
  gradeProfile: GradeProfile;
  questions: ExamQuestion[];
  studentAnswersRaw: string;
  answerKeyRaw: string;
  studentName: string;
  studentNumber: string;
  classroom: string;
  penaltyDivisor: 3 | 4;
  analysis: ExamAnalysisResult;
  cover: CoverConfig;
  institutionCode8: string;
  onUpdateOmrState: (patch: {
    studentAnswersRaw?: string;
    answerKeyRaw?: string;
    studentName?: string;
    studentNumber?: string;
    classroom?: string;
    penaltyDivisor?: 3 | 4;
  }) => void;
  onEvaluateNow: () => void;
  onGoToReports: () => void;
  onDownloadOpticalPdf: () => Promise<void>;
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
  onUpdateOmrState,
  onEvaluateNow,
  onGoToReports,
  onDownloadOpticalPdf,
}: OmrScannerViewProps) {
  const [loadingMode, setLoadingMode] = useState<'student' | 'key' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    mode: 'student' | 'key'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMessage(null);

    try {
      // Plain text / CSV / JSON direct parsing
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
        onUpdateOmrState(
          mode === 'student'
            ? { studentAnswersRaw: extracted }
            : { answerKeyRaw: extracted }
        );
        setStatusMessage(
          `${file.name} dosyasından ${mode === 'student' ? 'öğrenci optiği' : 'cevap anahtarı'} okundu.`
        );
        return;
      }

      // Image or PDF -> Gemini Vision OMR reader
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
      onUpdateOmrState(
        mode === 'student'
          ? { studentAnswersRaw: data.answersString }
          : { answerKeyRaw: data.answersString }
      );
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

  return (
    <div className="space-y-6">
      <div className="surface-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold">
              Farklı Denemelerin Optik Okuma & Cevap Anahtarı Analiz Sistemi
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Başka yayınlardan aldığınız denemelerin optik fotoğrafını, PDF’ini, CSV/TXT verisini veya şık dizisini yükleyip kendi cevap anahtarıyla karşılaştırın.
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
            <span style={{ color: 'var(--text-secondary)' }}>Net Hesaplama Kuralı</span>
            <select
              value={penaltyDivisor}
              onChange={(e) =>
                onUpdateOmrState({ penaltyDivisor: Number(e.target.value) as 3 | 4 })
              }
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt focus:outline-2"
            >
              <option value={4}>4 Yanlış 1 Doğruyu Götürür (Lise / TYT / AYT)</option>
              <option value={3}>3 Yanlış 1 Doğruyu Götürür (3–8. Sınıf / LGS)</option>
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
                <h3 className="text-sm font-bold">1. Öğrenci Optik Cevapları</h3>
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
                <h3 className="text-sm font-bold">2. Deneme Cevap Anahtarı</h3>
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
                Farklı yayın denemesinin resmi cevap anahtarı ({expectedCount} soru bekleniyor)
              </span>
              <textarea
                rows={4}
                value={answerKeyRaw}
                onChange={(e) => onUpdateOmrState({ answerKeyRaw: e.target.value })}
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
            Analizi başlattığınızda tüm ders netleri, 5 çeşit karne ve 3 detaylı analiz otomatik güncellenir.
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

      {/* Authentic Turkish Magenta/Pink OMR Optical Sheet Preview */}
      <OpticalFormPreview
        cover={cover}
        gradeProfile={gradeProfile}
        studentName={studentName}
        studentNumber8={studentNumber}
        institutionCode8={institutionCode8}
        classroom={classroom}
        totalQuestions={questions.length}
        onDownloadOpticalPdf={onDownloadOpticalPdf}
      />
    </div>
  );
}
