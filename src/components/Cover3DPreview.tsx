import { useState } from 'react';
import { Rotate3D, ShieldAlert, BookOpen, CheckSquare } from 'lucide-react';
import { getLogoPreset } from '../data/logos';
import { CoverConfig } from '../types/academy';
import {
  extractGradeLabelFromCover,
  normalizeBookletNumber,
  resolveCoverColorPalette,
  resolveCoverLayoutStyle,
} from '../utils/bookletDistribution';
import {
  buildWatermarkDisplayText,
  computeWatermarkPlacements,
  resolvePdfWatermarkConfig,
} from '../utils/pdfWatermark';
import { Logo3D } from './Logo3D';
import { FurkanDigitalSignature } from './FurkanDigitalSignature';

interface Cover3DPreviewProps {
  cover: CoverConfig;
}

export function Cover3DPreview({ cover }: Cover3DPreviewProps) {
  const [angleY, setAngleY] = useState<number>(-14);
  const [angleX, setAngleX] = useState<number>(6);
  const [flipped, setFlipped] = useState<boolean>(false);

  const basePreset = getLogoPreset(cover.logoStyleId);
  const palette = resolveCoverColorPalette(cover, basePreset);
  const layoutOption = resolveCoverLayoutStyle(cover);
  const layoutId = layoutOption.id;
  const preset = {
    ...basePreset,
    primaryColor: palette.primaryColor,
    secondaryColor: palette.secondaryColor,
    goldColor: palette.goldColor,
  };
  const gradeLabel = extractGradeLabelFromCover(cover);
  const bookletNum = cover.bookletNumber ? normalizeBookletNumber(cover.bookletNumber) : '';
  const showSample = Boolean(cover.isSampleDemo);
  const effectiveRotateY = flipped ? angleY + 180 : angleY;
  const watermarkCfg = resolvePdfWatermarkConfig(cover.watermark);
  const watermarkPlaces = computeWatermarkPlacements(watermarkCfg.placement);
  const watermarkText = buildWatermarkDisplayText(watermarkCfg, {
    isSampleDemo: showSample,
  });
  const showCoverWatermark = watermarkCfg.enabled && watermarkCfg.includeCoverAndBack;

  return (
    <div
      className="surface-card rounded-xl p-5 flex flex-col gap-4"
      data-testid="cover-3d-preview"
      data-cover-layout={layoutId}
      data-cover-palette={cover.coverColorThemeId ?? 'otomatik-abcd'}
      data-cover-primary={palette.primaryColor}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rotate3D className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 className="text-base font-bold leading-tight">3D Renkli Kitapçık Kapak Önizleme</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {cover.bookletCode} Kitapçığı{bookletNum ? ` · No: ${bookletNum}` : ''} · {palette.themeLabel} · {layoutOption.name} · {cover.signatureName} 3D İmzalı
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFlipped(false);
              setAngleY(0);
              setAngleX(0);
            }}
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Düz Görünüm
          </button>
          <button
            type="button"
            onClick={() => {
              setFlipped(false);
              setAngleY(-16);
              setAngleX(7);
            }}
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            3D Açı
          </button>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="btn-3d px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            {flipped ? 'Ön Kapağa Dön' : 'Son Sayfa / İmza'}
          </button>
        </div>
      </div>

      {/* 3D Perspective Stage */}
      <div className="perspective-stage py-4 flex items-center justify-center overflow-hidden">
        <div
          className="booklet-3d relative w-[326px] sm:w-[360px] h-[495px]"
          style={{
            transform: `rotateX(${angleX}deg) rotateY(${effectiveRotateY}deg)`,
          }}
        >
          {/* 3D Booklet Spine */}
          <div
            aria-hidden="true"
            className="absolute top-1 bottom-1 -left-3.5 w-3.5 rounded-l-sm"
            style={{
              background: `linear-gradient(180deg, ${preset.primaryColor}, ${preset.secondaryColor})`,
              transform: 'rotateY(-90deg) translateZ(7px)',
              boxShadow: 'inset 0 0 8px rgba(0,0,0,0.45)',
            }}
          />

          {/* Front 3D Colorful Cover Face */}
          <div
            className={`absolute inset-0 bg-white text-slate-900 rounded-r-xl border-2 shadow-2xl p-4 flex flex-col justify-between overflow-hidden ${
              layoutId === 'geometrik-blok' ? 'pl-6' : ''
            }`}
            style={{ backfaceVisibility: 'hidden', borderColor: preset.primaryColor }}
          >
            {/* Layout-Specific Graphical Background Layers */}
            {layoutId === 'klasik-cerceve' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-2 rounded-lg border pointer-events-none opacity-65"
                  style={{ borderColor: preset.goldColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-12 -top-10 w-52 h-52 rounded-full opacity-18 pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${preset.primaryColor}, transparent)` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -left-10 bottom-16 w-44 h-44 rounded-full opacity-18 pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${preset.goldColor}, transparent)` }}
                />
              </>
            )}

            {layoutId === 'diyagonal-serit' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute -left-14 top-28 w-[140%] h-20 -rotate-12 opacity-12 pointer-events-none"
                  style={{ background: `linear-gradient(90deg, ${preset.secondaryColor}, ${preset.primaryColor})` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-14 bottom-20 w-[130%] h-14 -rotate-12 opacity-20 pointer-events-none"
                  style={{ background: `linear-gradient(90deg, ${preset.goldColor}, ${preset.primaryColor})` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -top-6 -right-6 w-24 h-24 rotate-45 opacity-25 pointer-events-none"
                  style={{ backgroundColor: preset.goldColor }}
                />
              </>
            )}

            {layoutId === 'geometrik-blok' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 left-0 w-3 pointer-events-none"
                  style={{ background: `linear-gradient(180deg, ${preset.secondaryColor}, ${preset.primaryColor})` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 left-3 w-1 pointer-events-none"
                  style={{ backgroundColor: preset.goldColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-28 right-0 w-16 h-8 opacity-15 pointer-events-none"
                  style={{ backgroundColor: preset.primaryColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-24 right-0 w-24 h-12 opacity-15 pointer-events-none"
                  style={{ backgroundColor: preset.goldColor }}
                />
              </>
            )}

            {layoutId === 'akademik-kose' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 w-0 h-0 border-t-[44px] border-r-[44px] border-r-transparent opacity-85 pointer-events-none"
                  style={{ borderTopColor: preset.secondaryColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-0 right-0 w-0 h-0 border-t-[44px] border-l-[44px] border-l-transparent opacity-85 pointer-events-none"
                  style={{ borderTopColor: preset.goldColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 w-0 h-0 border-b-[40px] border-r-[40px] border-r-transparent opacity-85 pointer-events-none"
                  style={{ borderBottomColor: preset.goldColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 w-0 h-0 border-b-[40px] border-l-[40px] border-l-transparent opacity-85 pointer-events-none"
                  style={{ borderBottomColor: preset.secondaryColor }}
                />
              </>
            )}

            {/* Header Band */}
            <div className="relative z-10">
              <div
                className="rounded-lg p-3 flex items-center justify-between text-white shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${preset.secondaryColor} 0%, ${preset.primaryColor} 100%)`,
                  borderBottom: `3px solid ${preset.goldColor}`,
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Logo3D size="sm" interactive={false} variant={cover.logoStyleId} />
                  <div className="min-w-0">
                    <div className="font-display font-extrabold text-xs sm:text-sm tracking-wide truncate">
                      {cover.academyName.toUpperCase()}
                    </div>
                    <div className="text-[9.5px] text-amber-200 font-mono-num font-bold truncate">
                      {gradeLabel.toUpperCase()} · KOD: {cover.institutionCode8 || '48291045'}
                    </div>
                  </div>
                </div>
                <div
                  data-testid="cover-3d-booklet-badge"
                  className="bg-white text-slate-900 rounded-md px-2 py-1 text-center shrink-0 shadow"
                  style={{ borderBottom: `2px solid ${preset.primaryColor}` }}
                >
                  <div className="text-[7px] font-bold leading-none">KİTAPÇIK</div>
                  <div className="font-display font-extrabold text-lg leading-tight" style={{ color: preset.secondaryColor }}>
                    {cover.bookletCode}
                  </div>
                  {bookletNum && (
                    <div className="text-[7.5px] font-mono-num font-bold leading-none" style={{ color: preset.primaryColor }}>
                      #{bookletNum}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center mt-3.5 px-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-snug">
                  {cover.examTitle}
                </h4>
                <p className="text-[11px] text-slate-600 mt-1">{gradeLabel} · {cover.subtitle}</p>
                {layoutId === 'akademik-kose' && (
                  <div className="flex items-center justify-center gap-2 mt-1.5" aria-hidden="true">
                    <span className="h-0.5 w-10 rounded-full" style={{ backgroundColor: preset.goldColor }} />
                    <span className="w-2 h-2 rotate-45" style={{ backgroundColor: preset.primaryColor }} />
                    <span className="h-0.5 w-10 rounded-full" style={{ backgroundColor: preset.goldColor }} />
                  </div>
                )}
              </div>

              {/* Colorful 3D Spec Strip */}
              <div
                className="grid grid-cols-3 gap-1.5 mt-3 rounded-lg p-2 text-center text-white shadow-sm"
                style={{
                  background: `linear-gradient(90deg, ${preset.secondaryColor}, ${preset.primaryColor})`,
                }}
              >
                <div>
                  <div className="text-[8.5px] font-semibold text-blue-100">SORU / SINIF</div>
                  <div className="text-[11px] font-mono-num font-extrabold">{cover.questionCount} · {gradeLabel}</div>
                </div>
                <div className="border-x border-white/25">
                  <div className="text-[8.5px] font-semibold text-blue-100">SÜRE</div>
                  <div className="text-xs font-mono-num font-extrabold">{cover.durationMinutes} dk</div>
                </div>
                <div>
                  <div className="text-[8.5px] font-semibold text-blue-100">KİTAPÇIK NO</div>
                  <div className="text-[10.5px] font-mono-num font-extrabold text-amber-300">
                    {bookletNum || (showSample ? 'ÖRNEKTİR' : 'RESMİ')}
                  </div>
                </div>
              </div>

              {/* Reminders Preview */}
              <div className="mt-3 bg-slate-50/90 border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-800 mb-1">
                  <CheckSquare className="w-3 h-3" style={{ color: preset.primaryColor }} aria-hidden="true" />
                  <span>SINAV KAPAĞI HATIRLATMALARI</span>
                </div>
                <ul className="space-y-1 text-[9.5px] text-slate-700 leading-snug">
                  {cover.reminders.slice(0, 4).map((r, i) => (
                    <li key={i} className="truncate">
                      {i + 1}. {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bottom 3D Signature + 3D Çoğaltılamaz Seal */}
            <div className="relative z-10">
              <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-200">
                {/* 3D Embossed Security Seal */}
                <div
                  className="rounded-lg px-2.5 py-1.5 -rotate-3 text-center text-white"
                  style={{
                    background: 'linear-gradient(135deg, #be123c 0%, #881337 100%)',
                    boxShadow: '2px 3px 0 #4c0519, 0 4px 10px rgba(136,19,55,0.35)',
                    border: '1px solid rgba(255,255,255,0.4)',
                  }}
                >
                  <div className="text-[10.5px] font-display font-extrabold tracking-wider">
                    ÇOĞALTILAMAZ
                  </div>
                  <div className="text-[7.5px] font-bold text-amber-200">
                    {showSample ? 'ÖRNEKTİR · MÜHÜRLÜ' : 'RESMİ MÜHÜRLÜ'}
                  </div>
                </div>

                {/* 3D Layered Furkan Calligraphic Digital Signature */}
                <div className="shrink-0">
                  <FurkanDigitalSignature
                    signatureName={cover.signatureName}
                    signatureTitle={cover.signatureTitle}
                    institutionCode8={cover.institutionCode8 || '48291045'}
                    primaryColor={preset.primaryColor}
                    secondaryColor={preset.secondaryColor}
                    goldColor={preset.goldColor}
                    size="sm"
                    tone="paper"
                    showSealStamp={false}
                  />
                </div>
              </div>

              <div
                className="mt-2 rounded text-[8px] font-bold text-white text-center py-1 px-2 truncate"
                style={{
                  background: `linear-gradient(90deg, ${preset.secondaryColor}, ${preset.primaryColor})`,
                }}
              >
                {cover.securityNotice}
              </div>
            </div>

            {showCoverWatermark && (
              <div
                aria-hidden="true"
                data-testid="cover-3d-watermark-preview"
                className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-hidden"
              >
                {watermarkPlaces.drawHeaderFooter && (
                  <>
                    <div
                      className="absolute top-1.5 inset-x-4 text-center font-extrabold tracking-wide truncate"
                      style={{
                        opacity: watermarkCfg.opacity,
                        color: watermarkCfg.colorHex || preset.secondaryColor,
                        fontSize: `${Math.max(6.5, Math.round(7.5 * (watermarkCfg.fontScale ?? 1) * 10) / 10)}px`,
                      }}
                    >
                      {watermarkText}
                    </div>
                    <div
                      className="absolute bottom-1.5 inset-x-4 text-center font-extrabold tracking-wide truncate"
                      style={{
                        opacity: watermarkCfg.opacity,
                        color: watermarkCfg.colorHex || preset.secondaryColor,
                        fontSize: `${Math.max(6.5, Math.round(7.5 * (watermarkCfg.fontScale ?? 1) * 10) / 10)}px`,
                      }}
                    >
                      {watermarkText}
                    </div>
                  </>
                )}
                {watermarkPlaces.drawBackground && (
                  <div
                    className="font-extrabold tracking-wider whitespace-nowrap text-center px-2"
                    style={{
                      opacity: watermarkCfg.opacity,
                      color: watermarkCfg.colorHex || preset.secondaryColor,
                      fontSize: `${Math.round(14 * (watermarkCfg.fontScale ?? 1))}px`,
                      transform: `rotate(${watermarkCfg.angleDeg ?? -32}deg)`,
                    }}
                  >
                    {watermarkText}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Back Cover Face (Last Page "İMZA & ONAY SAYFASI") */}
          <div
            className="absolute inset-0 bg-slate-50 text-slate-900 rounded-l-xl border-2 shadow-2xl p-5 flex flex-col justify-between overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              borderColor: preset.primaryColor,
            }}
          >
            {layoutId === 'geometrik-blok' && (
              <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 right-0 w-2.5 pointer-events-none"
                style={{ background: `linear-gradient(180deg, ${preset.primaryColor}, ${preset.goldColor})` }}
              />
            )}
            {layoutId === 'diyagonal-serit' && (
              <div
                aria-hidden="true"
                className="absolute -left-10 bottom-20 w-[130%] h-12 -rotate-12 opacity-15 pointer-events-none"
                style={{ backgroundColor: preset.primaryColor }}
              />
            )}
            {layoutId === 'akademik-kose' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute top-0 right-0 w-0 h-0 border-t-[32px] border-l-[32px] border-l-transparent opacity-80 pointer-events-none"
                  style={{ borderTopColor: preset.goldColor }}
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 w-0 h-0 border-b-[32px] border-r-[32px] border-r-transparent opacity-80 pointer-events-none"
                  style={{ borderBottomColor: preset.secondaryColor }}
                />
              </>
            )}
            <div>
              <div className="flex items-center justify-between gap-2 text-slate-900 font-display font-bold text-sm border-b border-slate-300 pb-2.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" style={{ color: preset.primaryColor }} aria-hidden="true" />
                  <span>En Son Sayfa · İmza & Onay</span>
                </div>
                <span className="text-[10px] font-mono-num font-extrabold" style={{ color: preset.primaryColor }}>
                  {cover.bookletCode}{bookletNum ? ` #${bookletNum}` : ''}
                </span>
              </div>
              <ol className="mt-3 space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
                {cover.reminders.slice(0, 4).map((rem, i) => (
                  <li key={i}>
                    <strong>{i + 1}.</strong> {rem}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-2">
              <div className="text-[10px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-900">Öğrenci / Gözetmen İmza</div>
                <div>Ad Soyad: _______________</div>
                <div>İmza: ____________________</div>
              </div>
              <FurkanDigitalSignature
                signatureName={cover.signatureName}
                signatureTitle={cover.signatureTitle}
                institutionCode8={cover.institutionCode8 || '48291045'}
                primaryColor={preset.primaryColor}
                secondaryColor={preset.secondaryColor}
                goldColor={preset.goldColor}
                size="sm"
                tone="paper"
                showSealStamp={false}
              />
            </div>

            <div className="border-2 border-rose-400 bg-rose-50 rounded-lg p-2.5 text-rose-900">
              <div className="flex items-center gap-1.5 font-bold text-[11px] mb-0.5">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showSample ? 'ÖRNEKTİR · İZİNSİZ ÇOĞALTILAMAZ' : 'RESMİ YAYIN · İZİNSİZ ÇOĞALTILAMAZ'}</span>
              </div>
              <p className="text-[10px] leading-snug">
                {cover.academyName} ({cover.institutionCode8 || '48291045'}) · {gradeLabel} · {cover.bookletCode} Kitapçığı.
              </p>
            </div>

            {showCoverWatermark && (
              <div
                aria-hidden="true"
                className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-hidden"
              >
                {watermarkPlaces.drawHeaderFooter && (
                  <>
                    <div
                      className="absolute top-1.5 inset-x-4 text-center font-extrabold tracking-wide truncate"
                      style={{
                        opacity: watermarkCfg.opacity,
                        color: watermarkCfg.colorHex || preset.secondaryColor,
                        fontSize: `${Math.max(6.5, Math.round(7.5 * (watermarkCfg.fontScale ?? 1) * 10) / 10)}px`,
                      }}
                    >
                      {watermarkText}
                    </div>
                    <div
                      className="absolute bottom-1.5 inset-x-4 text-center font-extrabold tracking-wide truncate"
                      style={{
                        opacity: watermarkCfg.opacity,
                        color: watermarkCfg.colorHex || preset.secondaryColor,
                        fontSize: `${Math.max(6.5, Math.round(7.5 * (watermarkCfg.fontScale ?? 1) * 10) / 10)}px`,
                      }}
                    >
                      {watermarkText}
                    </div>
                  </>
                )}
                {watermarkPlaces.drawBackground && (
                  <div
                    className="font-extrabold tracking-wider whitespace-nowrap text-center px-2"
                    style={{
                      opacity: watermarkCfg.opacity,
                      color: watermarkCfg.colorHex || preset.secondaryColor,
                      fontSize: `${Math.round(14 * (watermarkCfg.fontScale ?? 1))}px`,
                      transform: `rotate(${watermarkCfg.angleDeg ?? -32}deg)`,
                    }}
                  >
                    {watermarkText}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3D Rotation Slider Controls */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <label className="text-xs flex flex-col gap-1">
          <span className="flex justify-between font-medium" style={{ color: 'var(--text-secondary)' }}>
            <span>Yatay 3D Açı</span>
            <span className="font-mono-num">{angleY}°</span>
          </span>
          <input
            type="range"
            min={-40}
            max={40}
            value={angleY}
            onChange={(e) => setAngleY(Number(e.target.value))}
            className="w-full accent-current"
            style={{ color: 'var(--accent-primary)' }}
          />
        </label>
        <label className="text-xs flex flex-col gap-1">
          <span className="flex justify-between font-medium" style={{ color: 'var(--text-secondary)' }}>
            <span>Dikey 3D Eğim</span>
            <span className="font-mono-num">{angleX}°</span>
          </span>
          <input
            type="range"
            min={-20}
            max={20}
            value={angleX}
            onChange={(e) => setAngleX(Number(e.target.value))}
            className="w-full accent-current"
            style={{ color: 'var(--accent-primary)' }}
          />
        </label>
      </div>
    </div>
  );
}
