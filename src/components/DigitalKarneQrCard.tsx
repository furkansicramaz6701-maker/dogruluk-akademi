import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  RotateCcw,
} from 'lucide-react';
import { resolveDefaultDigitalKarneBaseUrl } from '../utils/digitalKarneQr';
import { triggerDownload } from '../utils/pdfAndZip';

interface DigitalKarneQrCardProps {
  studentName: string;
  studentNumber: string;
  classroom: string;
  gradeShortLabel: string;
  institutionName: string;
  institutionCode8: string;
  digitalKarneUrl: string;
  qrDataUrl: string;
  customBaseUrl: string;
  embedQrInPdf: boolean;
  onChangeCustomBaseUrl: (value: string) => void;
  onToggleEmbedQrInPdf: (checked: boolean) => void;
  onOpenPreviewModal: () => void;
}

export function DigitalKarneQrCard({
  studentName,
  studentNumber,
  classroom,
  gradeShortLabel,
  institutionName,
  institutionCode8,
  digitalKarneUrl,
  qrDataUrl,
  customBaseUrl,
  embedQrInPdf,
  onChangeCustomBaseUrl,
  onToggleEmbedQrInPdf,
  onOpenPreviewModal,
}: DigitalKarneQrCardProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(digitalKarneUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(false);
    }
  };

  const handleDownloadQrPng = async () => {
    if (!qrDataUrl) return;
    const safeSlug = (studentName || 'ogrenci')
      .toLocaleLowerCase('tr-TR')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const resp = await fetch(qrDataUrl);
    const blob = await resp.blob();
    triggerDownload(
      blob,
      `Dijital-Karne-QR-${safeSlug || 'ogrenci'}-${studentNumber || institutionCode8}.png`
    );
  };

  return (
    <section
      aria-labelledby="digital-karne-qr-title"
      data-testid="reports-qr-generator-card"
      className="surface-card rounded-xl p-5 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        {/* Left: Scannable QR Preview Box */}
        <div className="flex items-center gap-4 shrink-0">
          <div
            className="bg-white rounded-2xl p-3 border shadow-sm flex flex-col items-center gap-1.5"
            style={{ borderColor: '#cbd5e1' }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`${studentName || 'Öğrenci'} dijital karne QR kodu`}
                data-testid="reports-qr-image"
                className="w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-lg"
              />
            ) : (
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                <QrCode className="w-10 h-10" aria-hidden="true" />
              </div>
            )}
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800">
              Dijital Karne QR
            </span>
          </div>
        </div>

        {/* Right: Configuration & Actions */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <QrCode
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent-primary)' }}
                  aria-hidden="true"
                />
                <h3 id="digital-karne-qr-title" className="text-base font-bold">
                  Dijital Karne QR Kod Oluşturucu
                </h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {institutionName} · {studentName || 'Kayıtlı Öğrenci'} ({studentNumber || '—'}) ·{' '}
                {gradeShortLabel} · {classroom} için PDF raporuna doğrudan öğrenci sistemini açan QR kod üretilir.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none surface-alt px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
              <input
                type="checkbox"
                checked={embedQrInPdf}
                onChange={(e) => onToggleEmbedQrInPdf(e.target.checked)}
                data-testid="reports-qr-embed-toggle"
                className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
              />
              <span>PDF Raporlarına QR Ekle</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
            <label className="md:col-span-5 block text-[11px] font-bold">
              <span style={{ color: 'var(--text-secondary)' }}>
                Sistem Alan Adı / QR Hedef Adresi
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="url"
                  value={customBaseUrl}
                  onChange={(e) => onChangeCustomBaseUrl(e.target.value)}
                  placeholder={resolveDefaultDigitalKarneBaseUrl()}
                  data-testid="reports-qr-base-input"
                  className="w-full rounded-lg px-3 py-1.5 text-xs font-mono-num surface-alt border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                />
                {customBaseUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => onChangeCustomBaseUrl('')}
                    title="Varsayılan site adresine dön"
                    className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </label>

            <div className="md:col-span-7">
              <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Doğrudan Dijital Karne Bağlantısı (QR İçeriği)
              </div>
              <div
                data-testid="reports-qr-url-text"
                className="surface-alt rounded-lg px-3 py-1.5 text-[11px] font-mono-num truncate border"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                title={digitalKarneUrl}
              >
                {digitalKarneUrl}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopyUrl}
              data-testid="reports-qr-copy-btn"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Bağlantı Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>QR Bağlantısını Kopyala</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!qrDataUrl}
              onClick={handleDownloadQrPng}
              data-testid="reports-qr-download-png-btn"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>QR PNG İndir</span>
            </button>

            <a
              href={digitalKarneUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="reports-qr-open-link"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dijital Karneyi Aç</span>
            </a>

            <button
              type="button"
              onClick={onOpenPreviewModal}
              data-testid="reports-qr-open-pdf-preview-btn"
              className="px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>QR’lı PDF’i Önizle</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
