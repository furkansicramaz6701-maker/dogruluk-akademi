import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumericStepperInputProps {
  value: number;
  onChange: (nextValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  ariaLabel?: string;
  inputTestId?: string;
  decTestId?: string;
  incTestId?: string;
  surfaceClass?: 'surface-alt' | 'surface-card';
  className?: string;
  compact?: boolean;
}

export function NumericStepperInput({
  value,
  onChange,
  min = 1,
  max = 200,
  step = 1,
  id,
  ariaLabel,
  inputTestId,
  decTestId,
  incTestId,
  surfaceClass = 'surface-alt',
  className = '',
  compact = false,
}: NumericStepperInputProps) {
  const safeVal = Number.isFinite(value) ? Math.round(value) : min;
  const [draft, setDraft] = useState<string>(String(safeVal));

  useEffect(() => {
    setDraft(String(safeVal));
  }, [safeVal]);

  const commit = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(raw)));
    setDraft(String(clamped));
    onChange(clamped);
  };

  const padBtn = compact ? 'px-1.5 py-1' : 'px-2 py-1.5';
  const padInput = compact ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-xs';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        data-testid={decTestId}
        aria-label={ariaLabel ? `${ariaLabel} azalt` : 'Değeri azalt'}
        onClick={() => commit(safeVal - step)}
        disabled={safeVal <= min}
        className={`btn-3d-secondary ${padBtn} rounded-lg font-bold shrink-0 cursor-pointer disabled:opacity-45`}
      >
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        data-testid={inputTestId}
        value={draft}
        onChange={(e) => {
          const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
          setDraft(digitsOnly);
          if (digitsOnly !== '') {
            const parsed = Number(digitsOnly);
            if (parsed >= min && parsed <= max) {
              onChange(parsed);
            }
          }
        }}
        onBlur={() => {
          const parsed = Number(draft);
          if (!draft || !Number.isFinite(parsed)) {
            setDraft(String(safeVal));
          } else {
            commit(parsed);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const parsed = Number(draft);
            commit(Number.isFinite(parsed) && draft !== '' ? parsed : safeVal);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            commit(safeVal + step);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            commit(safeVal - step);
          }
        }}
        className={`w-full min-w-[48px] text-center rounded-lg ${padInput} ${surfaceClass} font-mono-num font-bold`}
      />
      <button
        type="button"
        data-testid={incTestId}
        aria-label={ariaLabel ? `${ariaLabel} artır` : 'Değeri artır'}
        onClick={() => commit(safeVal + step)}
        disabled={safeVal >= max}
        className={`btn-3d-secondary ${padBtn} rounded-lg font-bold shrink-0 cursor-pointer disabled:opacity-45`}
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
