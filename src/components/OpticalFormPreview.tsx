import { useEffect, useRef, useState } from 'react';
import { Archive, FileDown, Layers, Loader2, QrCode, Users } from 'lucide-react';
import { getLogoPreset } from '../data/logos';
import { BookletCode, CoverConfig, ExamSourceMode, GradeProfile, SubjectSpec } from '../types/academy';
import { BOOKLET_CODES, resolveCoverColorPalette } from '../utils/bookletDistribution';
import { drawOpticalFormCanvas } from '../utils/pdfAndZip';
import { FurkanDigitalSignature } from './FurkanDigitalSignature';

interface OpticalFormPreviewProps {
  cover: CoverConfig;
  gradeProfile: GradeProfile;
  studentName: string;
  studentNumber8: string;
  institutionCode8: string;
  classroom: string;
  totalQuestions: number;
  selectedSubjectId?: string;
  selectedSubjectName?: string;
  subjectsOverride?: SubjectSpec[];
  activeAnswerKey?: string;
  examSourceMode?: ExamSourceMode;
  exportBusy?: boolean;
  registeredCount?: number;
  visibleBooklets?: BookletCode[];
  onSelectBookletCode?: (code: BookletCode) => void;
  onDownloadOpticalPdf: (targetCode?: BookletCode) => Promise<void>;
  onDownloadAllOpticalPdf?: () => Promise<void>;
  onDownloadAllOpticalZip?: () => Promise<void>;
  onDownloadRegisteredOpticalPdf?: () => Promise<void>;
}

export function OpticalFormPreview({
  cover,
  gradeProfile,
  studentName,
  studentNumber8,
  institutionCode8,
  classroom,
  totalQuestions,
  selectedSubjectId,
  selectedSubjectName,
  subjectsOverride,
  activeAnswerKey,
  examSourceMode = 'kurum',
  exportBusy = false,
  registeredCount = 0,
  visibleBooklets = BOOKLET_CODES,
  onSelectBookletCode,
  onDownloadOpticalPdf,
  onDownloadAllOpticalPdf,
  onDownloadAllOpticalZip,
  onDownloadRegisteredOpticalPdf,
}: OpticalFormPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const preset = getLogoPreset(cover.logoStyleId);
  const isBusy = exportBusy || busyKey !== null;

  const runAction = async (key: string, fn?: () => Promise<void>) => {
    if (!fn || isBusy) return;
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    drawOpticalFormCanvas(canvasRef.current, {
      cover,
      gradeProfile,
      studentName,
      studentNumber8,
      institutionCode8,
      classroom,
      totalQuestions,
      optionCount: gradeProfile.optionCount,
      selectedSubjectId,
      subjectsOverride,
      activeAnswerKey,
      examSourceMode,
    });
  }, [
    cover,
    gradeProfile,
    studentName,
    studentNumber8,
    institutionCode8,
    classroom,
    totalQuestions,
    selectedSubjectId,
    subjectsOverride,
    activeAnswerKey,
    examSourceMode,
  ]);

  return (
    <section aria-labelledby="optical-sheet-preview-title" className="surface-card rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="optical-sheet-preview-title" className="text-base font-bold">
              ÖSYM / MEB Tipi Optik Cevap Kağıdı Canlı Önizleme
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="optical-preview-meta">
              Öğrenci: <strong>{studentName || 'Seçilmedi'}</strong> · Kapsam: <strong>{selectedSubjectName ? `Tek Ders (${selectedSubjectName})` : 'Tam Deneme'} · {totalQuestions} Soru</strong> · Kitapçık: <strong>{cover.bookletCode}</strong> (<span className="font-mono-num">{cover.bookletNumber || '050001'}</span>) · Çift Karekod (Karne QR + Şifreli Analiz QR)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void runAction('active', () => onDownloadOpticalPdf(cover.bookletCode))}
            data-testid="optical-preview-download-active-btn"
            className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {busyKey === 'active' || exportBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="w-4 h-4" aria-hidden="true" />
            )}
            <span>
              {busyKey === 'active'
                ? 'Hazırlanıyor...'
                : `Kişiye Özel Optik PDF İndir (${cover.bookletCode})`}
            </span>
          </button>

          {onDownloadAllOpticalPdf && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction('all-pdf', onDownloadAllOpticalPdf)}
              data-testid="optical-preview-download-all-pdf-btn"
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {busyKey === 'all-pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{busyKey === 'all-pdf' ? 'Hazırlanıyor...' : 'A-B-C-D 4 Sayfa (.PDF)'}</span>
            </button>
          )}

          {onDownloadAllOpticalZip && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction('all-zip', onDownloadAllOpticalZip)}
              data-testid="optical-preview-download-all-zip-btn"
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {busyKey === 'all-zip' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{busyKey === 'all-zip' ? 'Hazırlanıyor...' : 'A-B-C-D Optik (.ZIP)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Entegre A-B-C-D Varyant Seçimi & Doğrudan Kitapçık Optik İndirme Şeridi */}
      <div
        data-testid="optical-preview-variant-bar"
        className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
            Kitapçık Seç &amp; Optik İndir:
          </span>
          {visibleBooklets.map((code) => {
            const pal = resolveCoverColorPalette(
              { bookletCode: code, coverColorThemeId: cover.coverColorThemeId ?? 'otomatik-abcd' },
              preset
            );
            const isSelected = cover.bookletCode === code;
            return (
              <div key={code} className="inline-flex items-center rounded-lg overflow-hidden border" style={{ borderColor: pal.primaryColor }}>
                <button
                  type="button"
                  onClick={() => onSelectBookletCode?.(code)}
                  data-testid={`optical-preview-select-${code}`}
                  aria-pressed={isSelected}
                  className={`px-2.5 py-1.5 text-xs font-extrabold cursor-pointer transition-colors ${
                    isSelected ? 'text-white' : 'surface-card'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: pal.primaryColor }
                      : { color: pal.primaryColor }
                  }
                >
                  {code}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void runAction(`opt-${code}`, () => onDownloadOpticalPdf(code))}
                  data-testid={`optical-download-btn-${code}`}
                  aria-label={`${code} kitapçığı optik formunu PDF indir`}
                  className="px-2.5 py-1.5 text-[11px] font-bold surface-card hover:opacity-90 inline-flex items-center gap-1 cursor-pointer border-l disabled:opacity-60"
                  style={{ borderColor: pal.primaryColor, color: pal.primaryColor }}
                >
                  {busyKey === `opt-${code}` ? (
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileDown className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{busyKey === `opt-${code}` ? 'İndiriliyor...' : `${code} Optik PDF`}</span>
                </button>
              </div>
            );
          })}
        </div>

        {onDownloadRegisteredOpticalPdf && registeredCount > 0 && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void runAction('reg-batch', onDownloadRegisteredOpticalPdf)}
            data-testid="optical-download-registered-batch-btn"
            className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {busyKey === 'reg-batch' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {busyKey === 'reg-batch'
                ? 'Hazırlanıyor...'
                : `Kayıtlı Öğrenciler A-B-C-D Optik (${registeredCount} Sayfa PDF)`}
            </span>
          </button>
        )}
      </div>

      <div className="surface-alt rounded-xl p-4 flex justify-center overflow-x-auto">
        <canvas
          ref={canvasRef}
          data-testid="optical-sheet-canvas"
          data-booklet-code={cover.bookletCode}
          data-booklet-number={cover.bookletNumber || '050001'}
          data-question-count={totalQuestions}
          data-subject-scope={selectedSubjectName || 'Tam Deneme'}
          data-has-dual-qr="true"
          className="max-w-[540px] w-full h-auto rounded-lg shadow-xl border border-slate-300 bg-white"
          aria-label={`Optik Cevap Kağıdı Önizleme — ${cover.bookletCode} Kitapçığı`}
        />
      </div>

      <div className="surface-alt rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Bu optik form ve değerlendirme çıktısı <strong>{cover.academyName}</strong> adına{' '}
          <strong>3D dijital imza</strong> ile mühürlenmiştir.
        </div>
        <FurkanDigitalSignature
          signatureName={cover.signatureName}
          signatureTitle={cover.signatureTitle}
          institutionCode8={institutionCode8}
          primaryColor={preset.primaryColor}
          secondaryColor={preset.secondaryColor}
          goldColor={preset.goldColor}
          size="sm"
        />
      </div>
    </section>
  );
}
