import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CopyCheck,
  FileWarning,
  ShieldCheck,
} from 'lucide-react';
import { OmrValidationSummary } from '../utils/omrValidation';

interface OmrValidationSummaryCardProps {
  summary: OmrValidationSummary;
  onFocusStudentAnswers?: () => void;
  onOpenErrorReport?: () => void;
}

export function OmrValidationSummaryCard({
  summary,
  onFocusStudentAnswers,
  onOpenErrorReport,
}: OmrValidationSummaryCardProps) {
  const statusPalette =
    summary.severity === 'error'
      ? {
          badgeText: 'Düzeltme Gerekli',
          badgeClass: 'bg-rose-600 text-white',
          icon: AlertCircle,
          iconColor: 'text-rose-600 dark:text-rose-400',
        }
      : summary.severity === 'warning'
        ? {
            badgeText: 'Boş İşaret Uyarısı',
            badgeClass: 'bg-amber-600 text-white',
            icon: AlertTriangle,
            iconColor: 'text-amber-600 dark:text-amber-400',
          }
        : summary.severity === 'ok'
          ? {
              badgeText: 'Kaydetmeye Hazır',
              badgeClass: 'bg-emerald-600 text-white',
              icon: CheckCircle2,
              iconColor: 'text-emerald-600 dark:text-emerald-400',
            }
          : {
              badgeText: 'Veri Bekleniyor',
              badgeClass: 'surface-card text-[var(--text-secondary)]',
              icon: ShieldCheck,
              iconColor: 'text-[var(--accent-primary)]',
            };

  const StatusIcon = statusPalette.icon;

  return (
    <section
      aria-label="Doğrulama Özeti"
      data-testid="omr-validation-summary-card"
      data-severity={summary.severity}
      className="mt-4 surface-alt rounded-xl p-4 border space-y-3"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <StatusIcon
            className={`w-4 h-4 mt-0.5 shrink-0 ${statusPalette.iconColor}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                Doğrulama Özeti (Validation Summary)
              </h4>
              <span
                data-testid="omr-validation-status-badge"
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${statusPalette.badgeClass}`}
              >
                {statusPalette.badgeText}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {summary.headline}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {summary.severity === 'error' && onOpenErrorReport && (
            <button
              type="button"
              data-testid="omr-validation-open-modal-btn"
              onClick={onOpenErrorReport}
              className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
            >
              <FileWarning className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span>Hata Raporunu Aç</span>
            </button>
          )}
          {onFocusStudentAnswers && (
            <button
              type="button"
              onClick={onFocusStudentAnswers}
              className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer"
            >
              Cevap Satırını Düzenle
            </button>
          )}
        </div>
      </div>

      {/* 4 Compact Diagnostic Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div
          className="surface-card rounded-lg p-2.5 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Geçerli İşaret
          </div>
          <div
            data-testid="omr-val-valid-count"
            className="text-base font-extrabold font-mono-num mt-0.5"
          >
            {summary.validCount}{' '}
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              / {summary.expectedCount}
            </span>
          </div>
        </div>

        <div
          className="surface-card rounded-lg p-2.5 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            <CircleDashed className="w-3 h-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Boş İşaretleme (Empty Bubbles)</span>
          </div>
          <div
            data-testid="omr-val-empty-count"
            className={`text-base font-extrabold font-mono-num mt-0.5 ${
              summary.emptyBubbleCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          >
            {summary.emptyBubbleCount}
          </div>
          {summary.emptyQuestionNumbers.length > 0 && (
            <div className="text-[10px] font-mono-num truncate" style={{ color: 'var(--text-secondary)' }}>
              {summary.emptyQuestionNumbers
                .slice(0, 5)
                .map((n) => `S${n}`)
                .join(', ')}
              {summary.emptyQuestionNumbers.length > 5 ? '…' : ''}
            </div>
          )}
        </div>

        <div
          className="surface-card rounded-lg p-2.5 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            <CopyCheck className="w-3 h-3 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>Çoklu İşaretleme (Multiple Marks)</span>
          </div>
          <div
            data-testid="omr-val-multi-count"
            className={`text-base font-extrabold font-mono-num mt-0.5 ${
              summary.multipleMarkCount > 0 ? 'text-rose-600 dark:text-rose-400' : ''
            }`}
          >
            {summary.multipleMarkCount}
          </div>
          {summary.multipleMarkItems.length > 0 && (
            <div className="text-[10px] font-mono-num truncate text-rose-600 dark:text-rose-400">
              {summary.multipleMarkItems
                .slice(0, 3)
                .map((m) => `S${m.questionNumber}:${m.rawToken}`)
                .join(', ')}
              {summary.multipleMarkItems.length > 3 ? '…' : ''}
            </div>
          )}
        </div>

        <div
          className="surface-card rounded-lg p-2.5 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Geçersiz Şık &amp; Anahtar
          </div>
          <div className="text-sm font-extrabold font-mono-num mt-0.5 flex items-center gap-2">
            <span
              data-testid="omr-val-invalid-count"
              className={summary.invalidOptionCount > 0 ? 'text-rose-600 dark:text-rose-400' : ''}
            >
              {summary.invalidOptionCount} Hata
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>·</span>
            <span
              className={
                summary.answerKeyReady
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }
            >
              Anahtar {summary.answerKeyMarkedCount}/{summary.expectedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Warning / Error Detail Lines */}
      {summary.warnings.length > 0 && (
        <ul
          data-testid="omr-validation-warnings-list"
          className="space-y-1.5 pt-1 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {summary.warnings.map((w) => (
            <li
              key={w.id}
              className="flex items-start gap-2 text-xs"
            >
              {w.severity === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div>
                <span className="font-bold">{w.label}: </span>
                <span style={{ color: 'var(--text-secondary)' }}>{w.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
