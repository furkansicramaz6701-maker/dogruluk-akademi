import { useEffect, useRef } from 'react';
import { GraduationCap } from 'lucide-react';
import { LogoStyleId } from '../types/academy';
import { Logo3D } from './Logo3D';

interface AcademyTransitionSplashProps {
  visible: boolean;
  institutionName?: string;
  logoVariant: LogoStyleId;
  subtitle: string;
  gradeLabel?: string;
  onFinish: () => void;
}

export function AcademyTransitionSplash({
  visible,
  institutionName,
  logoVariant,
  subtitle,
  gradeLabel,
  onFinish,
}: AcademyTransitionSplashProps) {
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!visible) return;
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeoutMs = reduced ? 220 : 850;
    const timer = window.setTimeout(() => onFinishRef.current(), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="academy-transition-splash"
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(circle at 50% 35%, var(--bg-sidebar) 0%, #091529 70%, #050b16 100%)',
        color: '#f8fafc',
      }}
    >
      <div className="academy-splash-crest max-w-md w-full rounded-3xl p-7 sm:p-8 border border-white/15 bg-white/5 backdrop-blur-md text-center space-y-5 shadow-2xl">
        <div className="flex justify-center">
          <Logo3D
            size="lg"
            variant={logoVariant}
            institutionName={institutionName}
            animated
            interactive={false}
          />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300">
            <GraduationCap className="w-4 h-4" aria-hidden="true" />
            <span>Doğruluk Akademi · Ölçme &amp; Değerlendirme</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            {institutionName || 'Doğruluk Akademi'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {subtitle}
            {gradeLabel ? ` · ${gradeLabel}` : ''}
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="academy-splash-bar h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #fbbf24 0%, #38bdf8 55%, #1d4ed8 100%)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={onFinish}
            data-testid="academy-transition-skip-btn"
            className="text-xs font-semibold text-slate-300 hover:text-white underline underline-offset-4 cursor-pointer"
          >
            Çalışma Alanını Hemen Aç
          </button>
        </div>
      </div>
    </div>
  );
}
