import { useState } from 'react';
import { Box, Pause, Play, RotateCw } from 'lucide-react';
import { GradeProfile, Institution, LogoStyleId } from '../types/academy';
import { getLogoPreset } from '../data/logos';

interface Cube3DShowcaseProps {
  activeInstitution: Institution;
  gradeProfile: GradeProfile;
  questionCount: number;
  activeLogoId: LogoStyleId;
  hasMebOverride: boolean;
}

type CubeFaceKey = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';

const FACE_TRANSFORMS: Record<CubeFaceKey, string> = {
  front: 'rotateX(-12deg) rotateY(-18deg)',
  right: 'rotateX(-10deg) rotateY(-90deg)',
  back: 'rotateX(-10deg) rotateY(-180deg)',
  left: 'rotateX(-10deg) rotateY(90deg)',
  top: 'rotateX(-90deg) rotateY(0deg)',
  bottom: 'rotateX(90deg) rotateY(0deg)',
};

export function Cube3DShowcase({
  activeInstitution,
  gradeProfile,
  questionCount,
  activeLogoId,
  hasMebOverride,
}: Cube3DShowcaseProps) {
  const [spinning, setSpinning] = useState(true);
  const [focusedFace, setFocusedFace] = useState<CubeFaceKey | null>(null);
  const preset = getLogoPreset(activeLogoId);
  const half = 68; // half of 136px cube size

  const faces: Array<{
    key: CubeFaceKey;
    label: string;
    title: string;
    value: string;
    sub: string;
    transform: string;
    bg: string;
  }> = [
    {
      key: 'front',
      label: 'Akademi',
      title: 'KURUMSAL KİMLİK',
      value: preset.headerTitle,
      sub: activeInstitution.name,
      transform: `rotateY(0deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, ${preset.primaryColor}, ${preset.secondaryColor})`,
    },
    {
      key: 'right',
      label: 'Kurum Kodu',
      title: '8 HANELİ LİSANS',
      value: activeInstitution.code8,
      sub: activeInstitution.permissions?.role ?? 'Kurum Yöneticisi',
      transform: `rotateY(90deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, #0f766e, #115e59)`,
    },
    {
      key: 'back',
      label: 'Müfredat',
      title: 'AKTİF DÜZEY',
      value: gradeProfile.shortLabel,
      sub: `${questionCount} Soru · ${gradeProfile.optionCount} Şık`,
      transform: `rotateY(180deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, #4338ca, #1e1b4b)`,
    },
    {
      key: 'left',
      label: 'Kaynak',
      title: 'DİNAMİK KAYNAK',
      value: hasMebOverride ? 'MEB PDF' : 'MEB & Web',
      sub: `${gradeProfile.penaltyDivisor}Y = 1D Kuralı`,
      transform: `rotateY(-90deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, #b45309, #78350f)`,
    },
    {
      key: 'top',
      label: 'OMR & PDF',
      title: 'ÖLÇME MOTORU',
      value: 'OMR + PDF',
      sub: 'Pembe Optik & Karne',
      transform: `rotateX(90deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, #be123c, #881337)`,
    },
    {
      key: 'bottom',
      label: 'Güvenlik',
      title: '3D DİJİTAL ONAY',
      value: 'Furkan İmza',
      sub: 'Çoğaltılamaz Mühür',
      transform: `rotateX(-90deg) translateZ(${half}px)`,
      bg: `linear-gradient(145deg, #0f172a, #334155)`,
    },
  ];

  return (
    <section
      aria-labelledby="cube-3d-title"
      data-testid="cube-3d-showcase"
      className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="cube-3d-title" className="text-base font-bold leading-tight">
              3D Kare Küp Animasyonu (Canlı Sistem Küpü)
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Üzerine gelince durur; 6 yüzlü 3 boyutlu kare blok aktif kurum, sınıf ve kaynak verisini gösterir
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setFocusedFace(null);
              setSpinning((v) => !v);
            }}
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            {spinning && !focusedFace ? (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Duraklat</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Döndür</span>
              </>
            )}
          </button>
          {focusedFace && (
            <button
              type="button"
              onClick={() => {
                setFocusedFace(null);
                setSpinning(true);
              }}
              aria-label="Otomatik 3D dönüşe dön"
              className="btn-3d-secondary p-1.5 rounded-lg cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* 3D Rotating Cube Stage */}
      <div className="surface-alt rounded-xl py-8 px-4 flex items-center justify-center cube-3d-stage min-h-[210px] overflow-hidden">
        <div
          className={`relative w-[136px] h-[136px] ${
            focusedFace || !spinning ? 'cube-3d-box cube-3d-paused' : 'cube-3d-box'
          }`}
          style={
            focusedFace
              ? {
                  animation: 'none',
                  transform: FACE_TRANSFORMS[focusedFace],
                }
              : undefined
          }
        >
          {faces.map((face) => (
            <div
              key={face.key}
              className="cube-3d-face p-3 flex flex-col justify-between text-white text-center select-none"
              style={{
                transform: face.transform,
                background: face.bg,
                opacity: 0.94,
              }}
            >
              <div className="text-[9px] font-bold tracking-wider uppercase text-amber-200">
                {face.title}
              </div>
              <div className="text-sm font-display font-extrabold leading-tight font-mono-num break-words">
                {face.value}
              </div>
              <div className="text-[10px] text-white/85 truncate">{face.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Face Focus Controls */}
      <div className="flex flex-wrap gap-1.5">
        {faces.map((face) => {
          const active = focusedFace === face.key;
          return (
            <button
              key={face.key}
              type="button"
              onClick={() => {
                setFocusedFace(face.key);
                setSpinning(false);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                active ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              {face.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
