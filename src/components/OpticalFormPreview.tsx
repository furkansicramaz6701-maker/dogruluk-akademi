import { useEffect, useRef } from 'react';
import { FileDown, QrCode } from 'lucide-react';
import { getLogoPreset } from '../data/logos';
import { CoverConfig, GradeProfile } from '../types/academy';
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
  onDownloadOpticalPdf: () => Promise<void>;
}

export function OpticalFormPreview({
  cover,
  gradeProfile,
  studentName,
  studentNumber8,
  institutionCode8,
  classroom,
  totalQuestions,
  onDownloadOpticalPdf,
}: OpticalFormPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const preset = getLogoPreset(cover.logoStyleId);

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
    });
  }, [
    cover,
    gradeProfile,
    studentName,
    studentNumber8,
    institutionCode8,
    classroom,
    totalQuestions,
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
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Kurum Kodu ({institutionCode8}), Öğrenci No ({studentNumber8 || '--------'}) ve Ad-Soyad ({studentName || 'Öğrenci Seçilmedi'}) alanları otomatik kodlanır
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDownloadOpticalPdf}
          className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileDown className="w-4 h-4" aria-hidden="true" />
          <span>Optik Kağıdını PDF İndir</span>
        </button>
      </div>

      <div className="surface-alt rounded-xl p-4 flex justify-center overflow-x-auto">
        <canvas
          ref={canvasRef}
          className="max-w-[540px] w-full h-auto rounded-lg shadow-xl border border-slate-300 bg-white"
          aria-label="Optik Cevap Kağıdı Önizleme"
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
