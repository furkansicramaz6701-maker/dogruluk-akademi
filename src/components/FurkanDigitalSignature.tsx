import { useId } from 'react';
import { ShieldCheck } from 'lucide-react';

interface FurkanDigitalSignatureProps {
  signatureName?: string;
  signatureTitle?: string;
  institutionCode8?: string;
  primaryColor?: string;
  secondaryColor?: string;
  goldColor?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'paper' | 'theme' | 'dark';
  showSealStamp?: boolean;
}

export function FurkanDigitalSignature({
  signatureName = 'Furkan',
  signatureTitle = 'Kurucu & Eğitim Koordinatörü',
  institutionCode8 = '31570113',
  primaryColor = '#1d4ed8',
  secondaryColor = '#0f2747',
  goldColor = '#f59e0b',
  size = 'md',
  tone = 'theme',
  showSealStamp = true,
}: FurkanDigitalSignatureProps) {
  const uid = useId().replace(/:/g, '');

  const dims =
    size === 'sm'
      ? { w: 124, h: 46 }
      : size === 'lg'
        ? { w: 230, h: 86 }
        : { w: 172, h: 64 };

  const inkStart = tone === 'dark' ? '#e0f2fe' : secondaryColor;
  const inkMid = tone === 'dark' ? '#93c5fd' : primaryColor;
  const inkEnd = tone === 'dark' ? '#fef08a' : secondaryColor;
  const textMainClass =
    tone === 'paper'
      ? 'text-slate-900'
      : tone === 'dark'
        ? 'text-white'
        : '';
  const textMutedClass =
    tone === 'paper'
      ? 'text-slate-500'
      : tone === 'dark'
        ? 'text-blue-200/80'
        : '';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {showSealStamp && (
        <div
          className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 shadow-sm"
          style={{
            borderColor: goldColor,
            background:
              tone === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(29,78,216,0.12))',
          }}
          title="3D Dijital Onay Mührü"
        >
          <div
            className="absolute inset-1 rounded-full border border-dashed opacity-70"
            style={{ borderColor: primaryColor }}
          />
          <ShieldCheck
            className="w-4 h-4 relative z-10"
            style={{ color: tone === 'dark' ? '#fde047' : primaryColor }}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="text-center leading-tight">
        <svg
          width={dims.w}
          height={dims.h}
          viewBox="0 0 280 104"
          fill="none"
          role="img"
          aria-label={`${signatureName} Orijinal 3D Dijital İmza`}
          className="mx-auto overflow-visible"
        >
          <defs>
            <linearGradient id={`ink-${uid}`} x1="0%" y1="0%" x2="100%" y2="25%">
              <stop offset="0%" stopColor={inkStart} />
              <stop offset="52%" stopColor={inkMid} />
              <stop offset="100%" stopColor={inkEnd} />
            </linearGradient>
            <linearGradient id={`gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="48%" stopColor="#fde047" />
              <stop offset="100%" stopColor={goldColor} />
            </linearGradient>
            <filter id={`drop-${uid}`} x="-12%" y="-15%" width="128%" height="135%">
              <feDropShadow dx="2.5" dy="3.5" stdDeviation="1.8" floodColor="#0f172a" floodOpacity="0.28" />
            </filter>
          </defs>

          {/* Subtle watermark seal ellipse behind signature */}
          <ellipse
            cx="154"
            cy="52"
            rx="84"
            ry="32"
            stroke={goldColor}
            strokeOpacity="0.24"
            strokeWidth="1.6"
            strokeDasharray="4 4"
            transform="rotate(-6 154 52)"
          />

          {/* 1) Gold metallic 3D bevel highlight underlay */}
          <g transform="translate(1.8, 2.1)">
            {/* Ornate calligraphic F */}
            <path
              d="M 18 32 C 30 8, 70 4, 96 14 C 82 14, 56 17, 46 22 C 39 42, 34 62, 23 82 C 18 89, 10 86, 15 76"
              stroke={`url(#gold-${uid})`}
              strokeWidth="5.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* F sweeping crossbar connecting into 'urkan' */}
            <path
              d="M 22 48 C 40 42, 56 41, 66 44 C 70 57, 79 58, 86 43 C 88 55, 95 57, 102 45 C 107 37, 114 40, 113 50 C 117 44, 127 22, 134 11 C 138 5, 131 44, 127 58 C 133 44, 145 36, 149 42 C 145 48, 136 52, 148 56 C 158 58, 169 40, 178 44 C 182 47, 174 58, 166 56 C 162 53, 170 42, 179 45 C 181 53, 185 57, 193 45 C 197 41, 202 45, 200 54 C 206 42, 214 41, 217 51 C 221 57, 238 46, 260 40"
              stroke={`url(#gold-${uid})`}
              strokeWidth="4.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Sweeping double underline flourish */}
            <path
              d="M 18 89 C 78 68, 182 65, 256 76 C 222 81, 148 86, 94 94"
              stroke={`url(#gold-${uid})`}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* 2) Crisp Sapphire & Royal Ink Calligraphic Foreground */}
          <g filter={`url(#drop-${uid})`}>
            {/* Ornate calligraphic F */}
            <path
              d="M 18 32 C 30 8, 70 4, 96 14 C 82 14, 56 17, 46 22 C 39 42, 34 62, 23 82 C 18 89, 10 86, 15 76"
              stroke={`url(#ink-${uid})`}
              strokeWidth="4.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Flowing cursive -urkan with tall calligraphic k-loop and trailing flourish */}
            <path
              d="M 22 48 C 40 42, 56 41, 66 44 C 70 57, 79 58, 86 43 C 88 55, 95 57, 102 45 C 107 37, 114 40, 113 50 C 117 44, 127 22, 134 11 C 138 5, 131 44, 127 58 C 133 44, 145 36, 149 42 C 145 48, 136 52, 148 56 C 158 58, 169 40, 178 44 C 182 47, 174 58, 166 56 C 162 53, 170 42, 179 45 C 181 53, 185 57, 193 45 C 197 41, 202 45, 200 54 C 206 42, 214 41, 217 51 C 221 57, 238 46, 260 40"
              stroke={`url(#ink-${uid})`}
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Sweeping signature underline flourish */}
            <path
              d="M 18 89 C 78 68, 182 65, 256 76 C 222 81, 148 86, 94 94"
              stroke={`url(#ink-${uid})`}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Quill star spark accent at signature crest */}
          <path
            d="M 260 32 L 262.4 37.6 L 268 40 L 262.4 42.4 L 260 48 L 257.6 42.4 L 252 40 L 257.6 37.6 Z"
            fill={goldColor}
          />
          <circle cx="96" cy="14" r="2.6" fill={goldColor} />
        </svg>

        <div className={`text-[11px] font-extrabold tracking-tight leading-none ${textMainClass}`}>
          {signatureName} · <span style={{ color: tone === 'dark' ? '#fde047' : primaryColor }}>3D Dijital İmza</span>
        </div>
        <div
          className={`text-[9px] font-mono-num mt-0.5 ${textMutedClass}`}
          style={tone === 'theme' ? { color: 'var(--text-secondary)' } : undefined}
        >
          {signatureTitle} · Kod: {institutionCode8}
        </div>
      </div>
    </div>
  );
}
