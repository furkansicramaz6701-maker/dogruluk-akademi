import { useId, useState, MouseEvent } from 'react';
import { buildInstitutionLogoProfile, getLogoPreset } from '../data/logos';
import { LogoStyleId } from '../types/academy';

interface Logo3DProps {
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  animated?: boolean;
  variant?: LogoStyleId;
  institutionName?: string;
}

export function Logo3D({
  size = 'md',
  interactive = true,
  animated = true,
  variant = 'akademi-kalkani',
  institutionName,
}: Logo3DProps) {
  const uid = useId().replace(/:/g, '');
  const basePreset = getLogoPreset(variant);
  const instProfile = institutionName?.trim()
    ? buildInstitutionLogoProfile(institutionName)
    : null;
  const activeVariant = instProfile ? instProfile.variant : variant;
  const primaryColor = instProfile ? instProfile.primaryColor : basePreset.primaryColor;
  const secondaryColor = instProfile ? instProfile.secondaryColor : basePreset.secondaryColor;
  const goldColor = instProfile ? instProfile.goldColor : basePreset.goldColor;
  const displayTitle = instProfile ? instProfile.institutionName : basePreset.headerTitle;
  const monogram = instProfile ? instProfile.initials : 'DA';
  const px = size === 'sm' ? 42 : size === 'lg' ? 76 : 56;
  const depthScale = size === 'sm' ? 0.78 : size === 'lg' ? 1.35 : 1;

  const defaultTilt = { rx: 14, ry: -18, gx: 30, gy: 25 };
  const [tilt, setTilt] = useState(defaultTilt);
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Number((-ny * 26 + 6).toFixed(2)),
      ry: Number((nx * 28 - 6).toFixed(2)),
      gx: Math.round((nx + 0.5) * 100),
      gy: Math.round((ny + 0.5) * 100),
    });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt(defaultTilt);
  };

  const depthLayers = [
    { z: -10, dx: 4.5, dy: 6, bg: 'rgba(2, 6, 23, 0.58)', border: 'rgba(255,255,255,0.05)' },
    { z: -8, dx: 3.6, dy: 4.8, bg: secondaryColor, border: 'rgba(251, 191, 36, 0.32)' },
    { z: -6, dx: 2.7, dy: 3.6, bg: secondaryColor, border: 'rgba(255,255,255,0.12)' },
    { z: -4, dx: 1.8, dy: 2.4, bg: primaryColor, border: 'rgba(255,255,255,0.2)' },
    { z: -2, dx: 0.9, dy: 1.2, bg: primaryColor, border: 'rgba(251, 191, 36, 0.42)' },
  ];

  const faceGradId = `daFace-${uid}`;
  const goldGradId = `daGold-${uid}`;
  const shieldGradId = `daShield-${uid}`;
  const bookShadowId = `daShadow-${uid}`;
  const shouldFloat = animated && !hovered;

  return (
    <div
      className="perspective-stage relative inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: px, height: px }}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Live 3D Orbital Halo Ring */}
      {animated && (
        <div
          aria-hidden="true"
          className="logo-3d-orbit absolute -inset-1.5 rounded-full pointer-events-none"
          style={{
            border: `1.5px dashed ${goldColor}`,
            opacity: hovered ? 0.85 : 0.48,
          }}
        />
      )}

      {/* Ambient Grounded 3D Shadow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-300"
        style={{
          transform: hovered
            ? `translate(${5 * depthScale}px, ${9 * depthScale}px) scale(0.94)`
            : `translate(${4 * depthScale}px, ${7 * depthScale}px) scale(0.92)`,
          background:
            'radial-gradient(circle at 45% 45%, rgba(2, 6, 23, 0.72) 0%, rgba(2, 6, 23, 0) 75%)',
          filter: `blur(${Math.round(5 * depthScale)}px)`,
        }}
      />

      {/* 3D Extruded Badge Assembly */}
      <div
        className={`relative w-full h-full transition-transform duration-200 ease-out ${
          shouldFloat ? 'logo-3d-live' : ''
        }`}
        style={{
          transformStyle: 'preserve-3d',
          transform: shouldFloat
            ? undefined
            : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${hovered ? 1.08 : 1})`,
        }}
      >
        {/* Stepped 3D Depth Plates */}
        {depthLayers.map((layer, idx) => (
          <div
            key={idx}
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              backgroundColor: layer.bg,
              border: `1px solid ${layer.border}`,
              transform: `translateZ(${layer.z * depthScale}px) translate(${layer.dx * depthScale}px, ${layer.dy * depthScale}px)`,
            }}
          />
        ))}

        {/* Front 3D Beveled Face */}
        <div
          className="relative w-full h-full rounded-2xl flex items-center justify-center overflow-hidden"
          style={{
            transform: `translateZ(${2 * depthScale}px)`,
            background: `linear-gradient(145deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            border: '1.5px solid rgba(255, 255, 255, 0.38)',
            boxShadow: `
              inset 1.5px 1.5px 2px rgba(255, 255, 255, 0.45),
              inset -2px -2px 4px rgba(2, 6, 23, 0.48),
              0 ${Math.round(6 * depthScale)}px ${Math.round(14 * depthScale)}px rgba(2, 6, 23, 0.4)
            `,
          }}
        >
          {/* Dynamic Specular Light Sheen */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none transition-opacity duration-200"
            style={{
              background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255, 255, 255, 0.38) 0%, rgba(255, 255, 255, 0.08) 42%, rgba(255, 255, 255, 0) 72%)`,
            }}
          />

          {/* Live Diagonal Specular Sheen Sweep */}
          {animated && (
            <div
              aria-hidden="true"
              className="logo-3d-sheen absolute inset-y-0 w-1/2 pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0) 100%)',
              }}
            />
          )}

          {/* Top Glossy Rim */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[46%] pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
            }}
          />

          {/* Variant-Aware 3D Crest SVG */}
          <svg
            viewBox="0 0 64 64"
            className="w-[78%] h-[78%] relative z-10"
            fill="none"
            role="img"
            aria-label={`${displayTitle} 3D Logo`}
          >
            <defs>
              <linearGradient id={faceGradId} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(15,23,42,0.34)" />
              </linearGradient>
              <linearGradient id={goldGradId} x1="20" y1="8" x2="44" y2="54" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="45%" stopColor={goldColor} />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <linearGradient id={shieldGradId} x1="32" y1="6" x2="32" y2="59" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.82" />
              </linearGradient>
              <filter id={bookShadowId} x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="1.8" stdDeviation="1.4" floodColor="#020617" floodOpacity="0.48" />
              </filter>
            </defs>

            {activeVariant === 'zumrut-mesale' && (
              <>
                <polygon
                  points="32,5 54,16 54,48 32,59 10,48 10,16"
                  fill={`url(#${faceGradId})`}
                  stroke={`url(#${shieldGradId})`}
                  strokeWidth="2.4"
                  filter={`url(#${bookShadowId})`}
                />
                <polygon points="32,5 54,16 54,48 32,59" fill="rgba(2,6,23,0.16)" />
                <polygon
                  points="32,10 49,19 49,45 32,54 15,45 15,19"
                  stroke={`url(#${goldGradId})`}
                  strokeWidth="1.2"
                />
                {/* Torch of Knowledge */}
                <path d="M27 30 H37 L34.5 48 H29.5 Z" fill="#ffffff" filter={`url(#${bookShadowId})`} />
                <path d="M25 27 H39 L37 31 H27 Z" fill={`url(#${goldGradId})`} />
                <path
                  d="M32 13 C36 17 38 22 32 26 C26 22 28 17 32 13 Z"
                  fill={`url(#${goldGradId})`}
                  stroke="#ffffff"
                  strokeWidth="0.8"
                />
              </>
            )}

            {activeVariant === 'kraliyet-armasi' && (
              <>
                <polygon
                  points="32,4 58,28 32,60 6,28"
                  fill={`url(#${faceGradId})`}
                  stroke={`url(#${shieldGradId})`}
                  strokeWidth="2.4"
                  filter={`url(#${bookShadowId})`}
                />
                <polygon points="32,4 58,28 32,60" fill="rgba(2,6,23,0.18)" />
                <polygon points="32,10 51,28 32,53 13,28" stroke={`url(#${goldGradId})`} strokeWidth="1.3" />
                <path
                  d="M32 16 L43 34 L32 45 L21 34 Z"
                  fill="#ffffff"
                  filter={`url(#${bookShadowId})`}
                />
                <circle cx="32" cy="30" r="3.5" fill={secondaryColor} />
                <path d="M32 16 V26.5" stroke={secondaryColor} strokeWidth="2" />
              </>
            )}

            {activeVariant === 'futuristik-prizma' && (
              <>
                <polygon
                  points="32,6 55,19 55,45 32,58 9,45 9,19"
                  fill={`url(#${faceGradId})`}
                  stroke={`url(#${shieldGradId})`}
                  strokeWidth="2.3"
                  filter={`url(#${bookShadowId})`}
                />
                <polygon points="32,16 46,24 32,32 18,24" fill="#ffffff" fillOpacity="0.92" />
                <polygon points="18,24 32,32 32,48 18,40" fill="#cbd5e1" fillOpacity="0.85" />
                <polygon points="46,24 32,32 32,48 46,40" fill={`url(#${goldGradId})`} fillOpacity="0.92" />
              </>
            )}

            {activeVariant === 'kurumsal-muhur' && (
              <>
                <circle
                  cx="32"
                  cy="32"
                  r="25"
                  fill={`url(#${faceGradId})`}
                  stroke={`url(#${goldGradId})`}
                  strokeWidth="2.6"
                  filter={`url(#${bookShadowId})`}
                />
                <circle cx="32" cy="32" r="20" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="3 2" />
                <text
                  x="32"
                  y="37"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="16"
                  fontWeight="800"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {monogram}
                </text>
                <path
                  d="M23 44 L32 48 L41 44"
                  stroke={`url(#${goldGradId})`}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </>
            )}

            {activeVariant === 'akademi-kalkani' && (
              <>
                <path
                  d="M32 5 L55 13.5 V31.5 C55 45.2 45 55.5 32 60 C19 55.5 9 45.2 9 31.5 V13.5 L32 5 Z"
                  fill={`url(#${faceGradId})`}
                  stroke={`url(#${shieldGradId})`}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  filter={`url(#${bookShadowId})`}
                />
                <path d="M32 5 L55 13.5 V31.5 C55 45.2 45 55.5 32 60 V5 Z" fill="rgba(2, 6, 23, 0.16)" />
                <path
                  d="M32 9.5 L50.5 16.5 V31 C50.5 42.3 42.4 51 32 55 C21.6 51 13.5 42.3 13.5 31 V16.5 L32 9.5 Z"
                  stroke={`url(#${goldGradId})`}
                  strokeWidth="1.2"
                  strokeOpacity="0.82"
                  strokeLinejoin="round"
                />
                <g filter={`url(#${bookShadowId})`}>
                  <path d="M15 24 L32 29 L49 24 V42 L32 47.5 L15 42 Z" fill="#0f172a" fillOpacity="0.5" />
                  <path d="M32 27.5 L16.5 22.5 V39.5 L32 44.5 Z" fill="#ffffff" />
                  <path d="M32 27.5 L47.5 22.5 V39.5 L32 44.5 Z" fill="#dbeafe" />
                  <path d="M20 27.5 L28.5 30.2 M20 32 L28.5 34.7" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M44 27.5 L35.5 30.2 M44 32 L35.5 34.7" stroke="#64748b" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M32 27.5 V45.5" stroke="#0f2747" strokeWidth="2.2" strokeLinecap="round" />
                </g>
                <path
                  d="M32 12.2 L34.3 17 L39.5 17.6 L35.6 21.1 L36.7 26.2 L32 23.5 L27.3 26.2 L28.4 21.1 L24.5 17.6 L29.7 17 Z"
                  fill={`url(#${goldGradId})`}
                  stroke="#ffffff"
                  strokeWidth="0.7"
                  strokeLinejoin="round"
                  filter={`url(#${bookShadowId})`}
                />
                <path
                  d="M27.5 49 L30.8 52.2 L37 46.5"
                  stroke={`url(#${goldGradId})`}
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Kuruma Özel Monogram Rozeti (Doğruluk Akademi dışındaki kurum logolarında alt köşede belirir) */}
            {instProfile && activeVariant !== 'kurumsal-muhur' && monogram !== 'DA' && (
              <g>
                <rect
                  x="38"
                  y="40"
                  width="22"
                  height="16"
                  rx="5"
                  fill={secondaryColor}
                  stroke={goldColor}
                  strokeWidth="1.4"
                />
                <text
                  x="49"
                  y="51.5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="9.5"
                  fontWeight="800"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {monogram}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
