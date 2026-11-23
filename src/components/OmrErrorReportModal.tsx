import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  FileDown,
  Filter,
  X,
} from 'lucide-react';
import { triggerDownload } from '../utils/downloadHelpers';
import {
  buildErrorReportCsvContent,
  formatErrorReportClipboardText,
  OMR_ERROR_CATEGORY_LABELS,
  OmrErrorCategory,
  OmrScanErrorReport,
} from '../utils/omrValidation';

interface OmrErrorReportModalProps {
  open: boolean;
  report: OmrScanErrorReport | null;
  onClose: () => void;
}

const CATEGORY_BADGE_CLASSES: Record<OmrErrorCategory, string> = {
  'invalid-student-number':
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
  'unreadable-answers':
    'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
  'invalid-option':
    'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800',
  'duplicate-student-number':
    'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800',
  'missing-answer-key':
    'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800',
};

export function OmrErrorReportModal({ open, report, onClose }: OmrErrorReportModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | OmrErrorCategory>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedCategory('all');
    setCopied(false);
  }, [report, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<OmrErrorCategory, number>> = {};
    if (!report) return counts;
    for (const item of report.errors) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [report]);

  const visibleErrors = useMemo(() => {
    if (!report) return [];
    if (selectedCategory === 'all') return report.errors;
    return report.errors.filter((e) => e.category === selectedCategory);
  }, [report, selectedCategory]);

  if (!open || !report || typeof document === 'undefined') {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorReportClipboardText(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API might be unavailable in restricted contexts
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildErrorReportCsvContent(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'Dogruluk-Akademi-OMR-Hata-Raporu.csv');
  };

  const activeCategories = (Object.keys(OMR_ERROR_CATEGORY_LABELS) as OmrErrorCategory[]).filter(
    (cat) => (categoryCounts[cat] ?? 0) > 0
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="omr-error-report-title"
        data-testid="omr-error-report-modal"
        onClick={(e) => e.stopPropagation()}
        className="surface-card w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-start justify-between gap-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="omr-error-report-title" className="text-base sm:text-lg font-extrabold">
                Optik Okuma Hata Raporu
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Kaynak: <span className="font-semibold">{report.sourceName}</span> · Saat:{' '}
                <span className="font-mono-num">{report.scannedAt}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Hata raporunu kapat"
            className="p-2 rounded-lg surface-alt hover:opacity-80 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Summary KPI Bar + Filters */}
        <div
          className="px-5 py-3.5 border-b space-y-3 surface-alt"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="surface-card rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Kontrol Edilen Satır / Alan
              </div>
              <div className="text-lg font-extrabold font-mono-num mt-0.5">
                {report.totalRowsChecked}
              </div>
            </div>
            <div className="surface-card rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Sorunsuz Okunan
              </div>
              <div className="text-lg font-extrabold font-mono-num mt-0.5 text-emerald-600 dark:text-emerald-400">
                {report.validRowsCount}
              </div>
            </div>
            <div className="surface-card rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Tespit Edilen Hata
              </div>
              <div
                data-testid="omr-error-total-count"
                className="text-lg font-extrabold font-mono-num mt-0.5 text-rose-600 dark:text-rose-400"
              >
                {report.errors.length}
              </div>
            </div>
          </div>

          {activeCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Hata türü filtresi">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
                <Filter className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Filtre:</span>
              </span>
              <button
                type="button"
                data-testid="omr-error-filter-all"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  selectedCategory === 'all' ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                Tümü ({report.errors.length})
              </button>
              {activeCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  data-testid={`omr-error-filter-${cat}`}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    selectedCategory === cat ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  {OMR_ERROR_CATEGORY_LABELS[cat]} ({categoryCounts[cat] ?? 0})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error List Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {visibleErrors.length === 0 ? (
            <div className="surface-alt rounded-xl p-6 text-center text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Seçili filtrede listelenecek hata kaydı bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="surface-alt border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <th className="py-2.5 px-3 font-extrabold whitespace-nowrap">Satır / Kaynak</th>
                    <th className="py-2.5 px-3 font-extrabold whitespace-nowrap">Hata Türü</th>
                    <th className="py-2.5 px-3 font-extrabold whitespace-nowrap">Öğrenci / No</th>
                    <th className="py-2.5 px-3 font-extrabold">Hatalı Veri &amp; Çözüm Açıklaması</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {visibleErrors.map((err, idx) => (
                    <tr
                      key={err.id}
                      data-testid={`omr-error-row-${idx}`}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono-num font-extrabold bg-rose-600 text-white">
                          Satır #{err.rowNumber}
                        </span>
                        <div className="text-[11px] mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {err.sheetName}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                            CATEGORY_BADGE_CLASSES[err.category]
                          }`}
                        >
                          {err.categoryLabel}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold">{err.studentName || '—'}</div>
                        {err.studentNumberRaw && (
                          <div className="text-[11px] font-mono-num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            No: {err.studentNumberRaw}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 space-y-1.5 min-w-[260px]">
                        <div>
                          <code className="inline-block px-2 py-0.5 rounded surface-alt font-mono-num text-[11px] font-bold text-rose-700 dark:text-rose-300 break-all">
                            {err.rawExcerpt}
                          </code>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                          {err.reason}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-3 surface-alt"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Listelenen satırlardaki öğrenci numarasını (8 rakam) veya optik şıkları düzelttikten sonra yeniden analiz edebilirsiniz.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="omr-error-copy-btn"
              onClick={handleCopy}
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Raporu Kopyala</span>
                </>
              )}
            </button>
            <button
              type="button"
              data-testid="omr-error-csv-btn"
              onClick={handleDownloadCsv}
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CSV İndir</span>
            </button>
            <button
              type="button"
              data-testid="omr-error-report-close-btn"
              onClick={onClose}
              className="btn-3d px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
