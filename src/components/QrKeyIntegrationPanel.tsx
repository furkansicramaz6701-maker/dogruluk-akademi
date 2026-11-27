import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Check,
  Copy,
  FileKey2,
  KeyRound,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  BookletCode,
  BookletDistributionPattern,
  ExamSourceMode,
  GradeProfile,
} from '../types/academy';
import {
  BOOKLET_CODES,
  getBookletCycleCodes,
  normalizeExternalAnswerKeyString,
} from '../utils/bookletDistribution';
import { parseCombinedExternalAnswerKeysText } from '../utils/externalPublisherLibrary';
import {
  decodeTeacherAnalysisQrToken,
  encodeTeacherAnalysisQrToken,
} from '../utils/qrKeyIntegration';

interface QrKeyIntegrationPanelProps {
  institutionCode8: string;
  institutionName: string;
  gradeProfile: GradeProfile;
  examTitle: string;
  examSourceMode: ExamSourceMode;
  activeBookletCode: BookletCode;
  bookletPattern: BookletDistributionPattern;
  expectedCount: number;
  selectedSubjectName?: string;
  studentAnswersRaw: string;
  answerKeyRaw: string;
  externalKeys: Record<BookletCode, string>;
  loadingMode: 'student' | 'key' | 'excel' | null;
  onSelectBookletCode: (code: BookletCode) => void;
  onUploadStudentOpticalFile: (file: File) => Promise<void>;
  onUploadKeyFile: (file: File, bookletCode: BookletCode) => Promise<void>;
  onApplyDecodedQrKey: (payload: {
    answerKey: string;
    bookletCode: BookletCode;
    subjectName?: string;
    questionCount: number;
    runAnalysisNow?: boolean;
  }) => void;
  onApplyBulkAnswerKeys: (
    keys: Partial<Record<BookletCode, string>>,
    summary: string
  ) => void;
}

export function QrKeyIntegrationPanel({
  institutionCode8,
  institutionName,
  gradeProfile,
  examTitle,
  examSourceMode,
  activeBookletCode,
  bookletPattern,
  expectedCount,
  selectedSubjectName,
  studentAnswersRaw,
  answerKeyRaw,
  externalKeys,
  loadingMode,
  onSelectBookletCode,
  onUploadStudentOpticalFile,
  onUploadKeyFile,
  onApplyDecodedQrKey,
  onApplyBulkAnswerKeys,
}: QrKeyIntegrationPanelProps) {
  const [targetBooklet, setTargetBooklet] = useState<BookletCode>(activeBookletCode);
  const [qrTokenInput, setQrTokenInput] = useState<string>('');
  const [bulkKeysInput, setBulkKeysInput] = useState<string>('');
  const [showBulkPaste, setShowBulkPaste] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [panelFeedback, setPanelFeedback] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setTargetBooklet(activeBookletCode);
  }, [activeBookletCode]);

  const visibleBooklets = getBookletCycleCodes(bookletPattern);
  const activeKeyForTarget = useMemo(() => {
    const ext = externalKeys[targetBooklet];
    if (ext && ext.trim().length > 0) return ext.trim();
    if (targetBooklet === activeBookletCode && answerKeyRaw.trim().length > 0) {
      return answerKeyRaw.trim();
    }
    return '';
  }, [externalKeys, targetBooklet, activeBookletCode, answerKeyRaw]);

  const generatedTeacherToken = useMemo(() => {
    const fallbackSample = 'A'.repeat(Math.min(40, Math.max(1, expectedCount)));
    return encodeTeacherAnalysisQrToken({
      bookletCode: targetBooklet,
      gradeId: gradeProfile.id,
      subjectName: selectedSubjectName,
      questionCount: expectedCount,
      answerKey: activeKeyForTarget || fallbackSample,
      examTitle: examTitle || institutionName,
      sourceMode: examSourceMode,
      institutionCode8,
    });
  }, [
    targetBooklet,
    gradeProfile.id,
    selectedSubjectName,
    expectedCount,
    activeKeyForTarget,
    examTitle,
    institutionName,
    examSourceMode,
    institutionCode8,
  ]);

  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(
      canvas,
      generatedTeacherToken,
      {
        width: 112,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#4c0519', light: '#ffffff' },
      },
      () => {
        // Ignore non-fatal render edge cases
      }
    );
  }, [generatedTeacherToken]);

  const decodedManualResult = useMemo(() => {
    if (!qrTokenInput.trim()) return null;
    return decodeTeacherAnalysisQrToken(qrTokenInput, institutionCode8);
  }, [qrTokenInput, institutionCode8]);

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(generatedTeacherToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      setPanelFeedback('Karekod şifresi kopyalanamadı; metin alanından seçebilirsiniz.');
    }
  };

  const handleStudentFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onUploadStudentOpticalFile(file);
  };

  const handleKeyFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onUploadKeyFile(file, targetBooklet);
  };

  const handleParseBulkKeys = () => {
    if (!bulkKeysInput.trim()) return;
    const split = parseCombinedExternalAnswerKeysText(bulkKeysInput, {
      optionCount: gradeProfile.optionCount,
      bookletMode: bookletPattern,
      autoDeriveMissing: bookletPattern !== 'A',
    });
    if (split.detectedBooklets.length === 0) {
      const normalizedSingle = normalizeExternalAnswerKeyString(
        bulkKeysInput,
        gradeProfile.optionCount
      );
      if (!normalizedSingle) {
        setPanelFeedback('Metin içinde geçerli A-E şık dizisi bulunamadı.');
        return;
      }
      onApplyBulkAnswerKeys(
        { [targetBooklet]: normalizedSingle },
        `${targetBooklet} kitapçığı için ${normalizedSingle.length} soruluk cevap anahtarı yüklendi.`
      );
      setPanelFeedback(
        `${targetBooklet} kitapçığı anahtarı panele aktarıldı (${normalizedSingle.length} soru).`
      );
      return;
    }
    onApplyBulkAnswerKeys(split.answerKeys, split.summaryMessage);
    setPanelFeedback(split.summaryMessage);
  };

  return (
    <section
      data-testid="qr-key-integration-panel"
      aria-labelledby="qr-key-panel-title"
      className="surface-card rounded-xl p-5 space-y-4 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <QrCode className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="qr-key-panel-title" className="text-base font-extrabold leading-tight">
              Çift Karekod &amp; Kitapçık Cevap Anahtarı Entegre Yükleme Paneli
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              1. karekod öğrenci kimliği ve dijital karneyi doğrular; 2. karekod ({' '}
              <span className="font-mono-num font-bold">DAK2</span> şifreli) yalnızca öğretmen sisteminde çözülen cevap anahtarını taşır — öğrenciler kamerayla okutsa bile cevapları göremez.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Hedef kitapçık seçimi">
          {visibleBooklets.map((code) => {
            const active = targetBooklet === code;
            return (
              <button
                key={code}
                type="button"
                data-testid={`qr-panel-booklet-${code}`}
                onClick={() => {
                  setTargetBooklet(code);
                  onSelectBookletCode(code);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                  active ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {code} Kitapçığı
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-Column Integrated Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Column 1: Dual-QR Optical Sheet Scan & Key Upload Actions */}
        <div className="lg:col-span-5 surface-alt rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-xs font-extrabold flex items-center gap-1.5">
              <Camera className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>1. Optik Kağıt &amp; Cevap Anahtarı Yükleme</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Kapsam: <strong>{selectedSubjectName || 'Tam Deneme'}</strong> ·{' '}
              <span className="font-mono-num font-bold">{expectedCount} Soru</span> ·{' '}
              <span className="font-mono-num font-bold">{targetBooklet} Kitapçığı</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              data-testid="qr-panel-upload-optical-btn"
              className="btn-3d px-3 py-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              {loadingMode === 'student' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Çift QR Taranıyor...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Optik Kağıdı Okut (Çift QR)</span>
                </>
              )}
              <input
                type="file"
                data-testid="qr-panel-upload-optical-input"
                accept="image/*,.pdf"
                onChange={handleStudentFile}
                className="sr-only"
              />
            </label>

            <label
              data-testid="qr-panel-upload-key-btn"
              className="btn-3d-secondary px-3 py-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              {loadingMode === 'key' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Anahtar Okunuyor...</span>
                </>
              ) : (
                <>
                  <FileKey2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{targetBooklet} Anahtarı Yükle</span>
                </>
              )}
              <input
                type="file"
                data-testid="qr-panel-upload-key-input"
                accept="image/*,.pdf,.xlsx,.xls,.csv,.txt"
                onChange={handleKeyFile}
                className="sr-only"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Aktif Anahtar:{' '}
              <strong className="font-mono-num" style={{ color: 'var(--text-primary)' }}>
                {activeKeyForTarget ? `${activeKeyForTarget.length} soru hazır` : 'Henüz girilmedi'}
              </strong>
            </span>
            <button
              type="button"
              data-testid="qr-panel-toggle-bulk-paste-btn"
              onClick={() => setShowBulkPaste((v) => !v)}
              className="font-bold cursor-pointer hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              {showBulkPaste ? 'Toplu Metin Kutusunu Gizle' : 'A / A-B-C-D Metin Yapıştır'}
            </button>
          </div>

          {showBulkPaste && (
            <div className="space-y-2 pt-1">
              <textarea
                rows={3}
                data-testid="qr-panel-bulk-paste-textarea"
                value={bulkKeysInput}
                onChange={(e) => setBulkKeysInput(e.target.value)}
                placeholder="Örn: A: ABCDABCD...  B: DCBADCBA... veya sadece şık dizisi"
                className="w-full rounded-lg p-2 text-xs font-mono-num surface-card border"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
              <button
                type="button"
                data-testid="qr-panel-apply-bulk-paste-btn"
                onClick={handleParseBulkKeys}
                className="btn-3d w-full py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                Cevap Anahtarlarını Kitapçıklara Ayrıştır
              </button>
            </div>
          )}
        </div>

        {/* Column 2: Encrypted Teacher-Only QR #2 Preview */}
        <div className="lg:col-span-4 surface-alt rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>2. Şifreli Öğretmen Analiz QR ({targetBooklet})</span>
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Optik forma basılan 2. karekod. Öğrenci kamerası yalnızca şifreli metin görür.
              </p>
            </div>
            <button
              type="button"
              data-testid="qr-panel-copy-token-btn"
              onClick={handleCopyToken}
              className="btn-3d-secondary px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              {copiedToken ? <Check className="w-3 h-3" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
              <span>{copiedToken ? 'Kopyalandı' : 'Kodu Kopyala'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-lg border border-slate-200 shrink-0">
              <canvas
                ref={qrCanvasRef}
                data-testid="qr-panel-teacher-qr-canvas"
                aria-label={`${targetBooklet} Kitapçığı Şifreli Analiz Karekodu`}
                className="block w-[108px] h-[108px]"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
              <div>
                <div className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Öğrencinin Gördüğü (Şifreli):
                </div>
                <div
                  data-testid="qr-panel-encrypted-preview"
                  className="font-mono-num text-[10px] break-all surface-card rounded p-1.5 border max-h-14 overflow-hidden"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {generatedTeacherToken.slice(0, 54)}...
                </div>
              </div>
              <div className="font-mono-num text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                Kurum Anahtarı: <strong>{institutionCode8}</strong> · Şifreli Korumalı
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Teacher QR Token Decoder & Instant Analysis Trigger */}
        <div className="lg:col-span-3 surface-alt rounded-xl p-4 flex flex-col justify-between gap-2.5">
          <div className="space-y-1">
            <div className="text-xs font-extrabold flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
              <span>3. Şifreli QR Çöz &amp; Analiz</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Okutulan <span className="font-mono-num font-bold">DAK2</span> kodunu yapıştırarak anahtarı doğrulayın ve anında analiz edin.
            </p>
          </div>

          <textarea
            rows={2}
            data-testid="qr-panel-token-input"
            value={qrTokenInput}
            onChange={(e) => setQrTokenInput(e.target.value)}
            placeholder="DAK2.... şifreli analiz karekodunu buraya yapıştırın"
            className="w-full rounded-lg p-2 text-[11px] font-mono-num surface-card border"
            style={{ borderColor: 'var(--border-subtle)' }}
          />

          {decodedManualResult && (
            <div
              data-testid="qr-panel-decoded-status"
              className={`rounded-lg p-2 text-[11px] border ${
                decodedManualResult.valid
                  ? 'surface-card border-emerald-500/40'
                  : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-700'
              }`}
            >
              {decodedManualResult.valid && decodedManualResult.payload ? (
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Doğrulandı · {decodedManualResult.payload.bookletCode} Kitapçığı ·{' '}
                      {decodedManualResult.payload.questionCount} Soru
                    </span>
                  </div>
                  <div className="font-mono-num truncate" style={{ color: 'var(--text-secondary)' }}>
                    Anahtar: {decodedManualResult.payload.answerKey.slice(0, 24)}
                    {decodedManualResult.payload.answerKey.length > 24 ? '...' : ''}
                  </div>
                </div>
              ) : (
                <span>{decodedManualResult.error}</span>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!decodedManualResult?.valid || !decodedManualResult.payload}
            data-testid="qr-panel-apply-decoded-btn"
            onClick={() => {
              if (!decodedManualResult?.valid || !decodedManualResult.payload) return;
              const p = decodedManualResult.payload;
              onApplyDecodedQrKey({
                answerKey: p.answerKey,
                bookletCode: p.bookletCode,
                subjectName: p.subjectName,
                questionCount: p.questionCount,
                runAnalysisNow: Boolean(studentAnswersRaw.trim()),
              });
              setPanelFeedback(
                `${p.bookletCode} kitapçığı şifreli karekodundan ${p.answerKey.length} soruluk anahtar çözüldü${
                  studentAnswersRaw.trim() ? ' ve analiz güncellendi.' : '.'
                }`
              );
            }}
            className="btn-3d w-full py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {studentAnswersRaw.trim() ? 'Anahtarı Uygula & Analiz Et' : 'Çözülen Anahtarı Yükle'}
            </span>
          </button>
        </div>
      </div>

      {panelFeedback && (
        <div
          data-testid="qr-panel-feedback"
          className="surface-alt rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>{panelFeedback}</span>
        </div>
      )}
    </section>
  );
}
