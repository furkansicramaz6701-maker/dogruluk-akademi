import { Award, Compass, Crown, Flame, Medal, ShieldCheck, Sparkles } from 'lucide-react';
import { getDynamicAchievementTier } from '../utils/weeklyAnalysis';

interface DynamicAchievementBadgeProps {
  rank?: number | null;
  successPct: number;
  scoreDelta?: number;
  netDelta?: number;
  isRisingStar?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function DynamicAchievementBadge({
  rank = null,
  successPct,
  scoreDelta = 0,
  netDelta = 0,
  isRisingStar = false,
  size = 'md',
  showLabel = true,
}: DynamicAchievementBadgeProps) {
  const tier = getDynamicAchievementTier({
    rank,
    successPct,
    scoreDelta,
    netDelta,
    isRisingStar,
  });

  const circleSize =
    size === 'sm' ? 'w-8 h-8 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-sm' : 'w-11 h-11 text-xs';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';

  const visualMap: Record<
    typeof tier.key,
    { bg: string; border: string; text: string; ring: string; Icon: typeof Crown }
  > = {
    'gold-crown': {
      bg: 'bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600',
      border: 'border-amber-600',
      text: 'text-amber-950',
      ring: 'shadow-[0_0_16px_rgba(245,158,11,0.45)]',
      Icon: Crown,
    },
    'silver-medal': {
      bg: 'bg-gradient-to-br from-slate-50 via-slate-200 to-slate-400',
      border: 'border-slate-500',
      text: 'text-slate-900',
      ring: 'shadow-[0_0_14px_rgba(148,163,184,0.45)]',
      Icon: Medal,
    },
    'bronze-medal': {
      bg: 'bg-gradient-to-br from-orange-200 via-amber-500 to-orange-700',
      border: 'border-orange-700',
      text: 'text-white',
      ring: 'shadow-[0_0_14px_rgba(234,88,12,0.4)]',
      Icon: Medal,
    },
    'rising-star': {
      bg: 'bg-gradient-to-br from-amber-300 via-rose-400 to-amber-500',
      border: 'border-amber-500',
      text: 'text-white',
      ring: 'shadow-[0_0_15px_rgba(245,158,11,0.45)]',
      Icon: Sparkles,
    },
    'mastery-shield': {
      bg: 'bg-gradient-to-br from-emerald-300 via-emerald-500 to-teal-700',
      border: 'border-emerald-700',
      text: 'text-white',
      ring: 'shadow-[0_0_14px_rgba(16,185,129,0.35)]',
      Icon: ShieldCheck,
    },
    'progress-flame': {
      bg: 'bg-gradient-to-br from-sky-300 via-blue-500 to-indigo-700',
      border: 'border-blue-700',
      text: 'text-white',
      ring: 'shadow-[0_0_12px_rgba(37,99,235,0.32)]',
      Icon: Flame,
    },
    'focus-compass': {
      bg: 'bg-gradient-to-br from-amber-100 via-orange-300 to-rose-400',
      border: 'border-rose-500',
      text: 'text-rose-950',
      ring: 'shadow-sm',
      Icon: Compass,
    },
  };

  const style = visualMap[tier.key] ?? {
    bg: 'bg-gradient-to-br from-blue-400 to-indigo-600',
    border: 'border-blue-700',
    text: 'text-white',
    ring: 'shadow-sm',
    Icon: Award,
  };
  const Icon = style.Icon;

  return (
    <div className="inline-flex items-center gap-2.5">
      <div
        title={`${tier.title} · ${tier.subtitle}`}
        className={`relative rounded-full border-2 flex flex-col items-center justify-center font-extrabold shrink-0 transition-transform duration-300 hover:scale-105 ${circleSize} ${style.bg} ${style.border} ${style.text} ${style.ring}`}
      >
        <Icon className={iconSize} aria-hidden="true" />
        {size !== 'sm' && (
          <span className="text-[9px] leading-none font-mono-num mt-0.5">{tier.badgeText}</span>
        )}
      </div>

      {showLabel && (
        <div className="min-w-0 leading-tight">
          <div className="text-xs font-extrabold truncate">{tier.title}</div>
          <div className="text-[10.5px] font-mono-num truncate" style={{ color: 'var(--text-secondary)' }}>
            {tier.subtitle}
          </div>
        </div>
      )}
    </div>
  );
}
