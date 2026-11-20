import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  FileDown,
  Loader2,
  QrCode,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type PdfPreviewDocType = 'parent' | 'student';

interface PdfPreviewModalProps {
  open: boolean;
  docType: PdfPreviewDocType;
  canSelectStudentDoc: boolean;
  loading: boolean;
  downloading?: boolean;
  error: string | null;
  filename: string;
  pageDataUrls: string[];
  qrEmbedded: boolean;
  onSelectDocType: (docType: PdfPreviewDocType) => void;
  onRetry: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export function PdfPreviewModal({
  open,
  docType,
  canSelectStudentDoc,
  loading,
  downloading = false,
  error,
  filename,
  pageDataUrls,
  qrEmbedded,
  onSelectDocType,
  onRetry,
  onDownload,
  onClose,
}: PdfPreviewModalProps) {
  const [pageView, setPageView] = useState<'all' | 0 | 1>('all');
  const [zoomPct, setZoomPct] = useState<number>(100);

  useEffect(() => {
    if (!open) return;
    setPageView('all');
    setZoomPct(100);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const visiblePages =
    pageView === 'all'
      ? pageDataUrls.map((url, idx) => ({ url, idx }))
      : pageDataUrls[pageView]
        ? [{ url: pageDataUrls[pageView], idx: pageView }]
        : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-5 bg-slate-950/80"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="pdf-preview-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-modal-title"
        data-testid="pdf-preview-modal"
        className="surface-card rounded-2xl border shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Modal Header */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="pdf-preview-modal-title"
                className="text-sm sm:text-base font-extrabold truncate"
              >
                Canlı PDF Önizleme ({pageDataUrls.length || 2} Sayfa A4)
              </h2>
              <p
                className="text-[11px] font-mono-num truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {filename || 'Veli-Bilgilendirme-Raporu.pdf'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {qrEmbedded && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                <span>QR Kod Dahil</span>
              </span>
            )}

            <button
              type="button"
              disabled={loading || downloading || pageDataUrls.length === 0}
              onClick={onDownload}
              data-testid="pdf-preview-download-btn"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>İndiriliyor...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Bu PDF’i İndir</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="PDF önizlemeyi kapat"
              data-testid="pdf-preview-close-btn"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span>Kapat</span>
            </button>
          </div>
        </div>

        {/* Controls Bar */}
        <div
          className="px-4 sm:px-5 py-2.5 border-b surface-alt flex flex-wrap items-center justify-between gap-2.5 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Document Selector */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="PDF Rapor Türü">
            <button
              type="button"
              onClick={() => onSelectDocType('parent')}
              data-testid="pdf-preview-type-parent"
              aria-pressed={docType === 'parent'}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                docType === 'parent' ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              Veli Bilgilendirme Raporu
            </button>
            {canSelectStudentDoc && (
              <button
                type="button"
                onClick={() => onSelectDocType('student')}
                data-testid="pdf-preview-type-student"
                aria-pressed={docType === 'student'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  docType === 'student' ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Profesyonel Karne Analizi
              </button>
            )}
          </div>

          {/* Page & Zoom Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Sayfa Seçimi">
              <button
                type="button"
                onClick={() => setPageView('all')}
                data-testid="pdf-preview-page-all"
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  pageView === 'all' ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Tüm Sayfalar
              </button>
              <button
                type="button"
                onClick={() => setPageView(0)}
                data-testid="pdf-preview-page-1"
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  pageView === 0 ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Sayfa 1
              </button>
              <button
                type="button"
                onClick={() => setPageView(1)}
                data-testid="pdf-preview-page-2"
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  pageView === 1 ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Sayfa 2
              </button>
            </div>

            <div className="flex items-center gap-1 border-l pl-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.max(60, z - 20))}
                aria-label="Küçült"
                data-testid="pdf-preview-zoom-out"
                className="btn-3d-secondary p-1.5 rounded-md cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="text-[11px] font-mono-num font-bold w-11 text-center">
                %{zoomPct}
              </span>
              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.min(140, z + 20))}
                aria-label="Büyüt"
                data-testid="pdf-preview-zoom-in"
                className="btn-3d-secondary p-1.5 rounded-md cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable A4 Sheets Viewport */}
        <div
          className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 dark:bg-slate-900/85"
          data-testid="pdf-preview-viewport"
        >
          {loading ? (
            <div
              className="min-h-[320px] flex flex-col items-center justify-center gap-3"
              data-testid="pdf-preview-loading"
            >
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" aria-hidden="true" />
              <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                A4 PDF sayfaları ve QR kodu canlı oluşturuluyor...
              </div>
            </div>
          ) : error ? (
            <div className="min-h-[260px] flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-sm font-bold text-rose-600">{error}</div>
              <button
                type="button"
                onClick={onRetry}
                className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tekrar Oluştur</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              {visiblePages.map(({ url, idx }) => (
                <figure
                  key={idx}
                  data-testid={`pdf-preview-sheet-${idx + 1}`}
                  className="bg-white rounded-lg shadow-xl border border-slate-300 overflow-hidden transition-all"
                  style={{
                    width: `min(100%, ${Math.round((780 * zoomPct) / 100)}px)`,
                  }}
                >
                  <img
                    src={url}
                    alt={`${filename} — Sayfa ${idx + 1}`}
                    className="w-full h-auto block"
                  />
                  <figcaption className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 text-[11px] font-mono-num font-bold text-slate-600 flex items-center justify-between">
                    <span>A4 Önizleme · Sayfa {idx + 1} / {pageDataUrls.length}</span>
                    <span>{qrEmbedded ? 'Dijital Karne QR Gömülü' : 'QR Kodsuz'}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
