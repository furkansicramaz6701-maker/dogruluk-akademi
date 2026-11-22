import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  FileDown,
  KeyRound,
  LayoutGrid,
  Layers,
  Loader2,
  Lock,
  Palette,
  QrCode,
  RefreshCw,
  Shuffle,
} from 'lucide-react';
import { getLogoPreset } from '../data/logos';
import {
  BookletCode,
  CoverColorThemeId,
  CoverConfig,
  CoverLayoutStyleId,
  ExamQuestion,
} from '../types/academy';
import {
  buildBookletOrderComparison,
  COVER_COLOR_THEMES,
  COVER_LAYOUT_OPTIONS,
  resolveCoverColorPalette,
  resolveCoverLayoutStyle,
} from '../utils/bookletDistribution';

interface BookletVariantSelectorProps {
  baseQuestions: ExamQuestion[];
  cover: CoverConfig;
  orderSeed: number;
  activeAnswerKey?: string;
  exportBusy?: boolean;
  onSelectBooklet: (code: BookletCode) => void;
  onReshuffleOrder: () => void;
  onDownloadBookletPdf?: (code: BookletCode) => Promise<void>;
  onDownloadAllBookletsZip?: () => Promise<void>;
  onDownloadOpticalPdf?: (code: BookletCode) => Promise<void>;
  onDownloadAllOpticalPdf?: () => Promise<void>;
  onChangeColorTheme?: (themeId: CoverColorThemeId) => void;
  onChangeCoverLayout?: (layoutId: CoverLayoutStyleId) => void;
}

function formatOpticalKeyGroups(key: string): string {
  const clean = key.trim().toUpperCase();
  const blocks: string[] = [];
  for (let i = 0; i < clean.length; i += 5) {
    blocks.push(`${i + 1}-${Math.min(i + 5, clean.length)}:${clean.slice(i, i + 5)}`);
  }
  return blocks.join('  ');
}

function MiniLayoutGlyph({
  layoutId,
  primary,
  secondary,
  gold,
}: {
  layoutId: CoverLayoutStyleId;
  primary: string;
  secondary: string;
  gold: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative w-8 h-10 rounded border bg-white shrink-0 overflow-hidden block shadow-xs"
      style={{ borderColor: secondary }}
    >
      {layoutId === 'klasik-cerceve' && (
        <>
          <span
            className="absolute inset-0.5 rounded-[2px] border"
            style={{ borderColor: gold }}
          />
          <span
            className="absolute top-1 left-1 right-1 h-2.5 rounded-[1px]"
            style={{ background: `linear-gradient(90deg, ${secondary}, ${primary})` }}
          />
          <span
            className="absolute bottom-1 left-1 right-1 h-1"
            style={{ backgroundColor: secondary }}
          />
        </>
      )}
      {layoutId === 'diyagonal-serit' && (
        <>
          <span
            className="absolute -right-2 -top-2 w-8 h-8 rotate-45 opacity-85"
            style={{ backgroundColor: primary }}
          />
          <span
            className="absolute -left-2 -bottom-2 w-7 h-5 -rotate-12 opacity-90"
            style={{ backgroundColor: gold }}
          />
          <span
            className="absolute top-1.5 left-1 right-1 h-2 rounded-[1px]"
            style={{ backgroundColor: secondary }}
          />
        </>
      )}
      {layoutId === 'geometrik-blok' && (
        <>
          <span
            className="absolute top-0 bottom-0 left-0 w-2"
            style={{ backgroundColor: primary }}
          />
          <span
            className="absolute top-0 bottom-0 left-2 w-0.5"
            style={{ backgroundColor: gold }}
          />
          <span
            className="absolute top-1.5 left-3 right-1 h-2.5 rounded-[1px]"
            style={{ backgroundColor: secondary }}
          />
          <span
            className="absolute bottom-1.5 right-1 w-2.5 h-2 rounded-[1px] opacity-80"
            style={{ backgroundColor: primary }}
          />
        </>
      )}
      {layoutId === 'akademik-kose' && (
        <>
          <span
            className="absolute top-0 left-0 w-0 h-0 border-t-[10px] border-r-[10px] border-r-transparent"
            style={{ borderTopColor: secondary }}
          />
          <span
            className="absolute top-0 right-0 w-0 h-0 border-t-[10px] border-l-[10px] border-l-transparent"
            style={{ borderTopColor: gold }}
          />
          <span
            className="absolute bottom-0 left-0 w-0 h-0 border-b-[10px] border-r-[10px] border-r-transparent"
            style={{ borderBottomColor: gold }}
          />
          <span
            className="absolute bottom-0 right-0 w-0 h-0 border-b-[10px] border-l-[10px] border-l-transparent"
            style={{ borderBottomColor: secondary }}
          />
          <span
            className="absolute top-2.5 left-1.5 right-1.5 h-2 rounded-[1px]"
            style={{ backgroundColor: primary }}
          />
        </>
      )}
    </span>
  );
}

export function BookletVariantSelector({
  baseQuestions,
  cover,
  orderSeed,
  activeAnswerKey,
  exportBusy = false,
  onSelectBooklet,
  onReshuffleOrder,
  onDownloadBookletPdf,
  onDownloadAllBookletsZip,
  onDownloadOpticalPdf,
  onDownloadAllOpticalPdf,
  onChangeColorTheme,
  onChangeCoverLayout,
}: BookletVariantSelectorProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = exportBusy || busyKey !== null;

  const runAction = async (key: string, fn?: () => Promise<void>) => {
    if (!fn || isBusy) return;
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  const preset = getLogoPreset(cover.logoStyleId);
  const { items, allOrdersUnique, difficultyPreserved, difficultyCounts } =
    buildBookletOrderComparison(baseQuestions, orderSeed);
  const activeColorThemeId = cover.coverColorThemeId ?? 'otomatik-abcd';
  const activeLayout = resolveCoverLayoutStyle(cover);
  const activePalette = resolveCoverColorPalette(cover, preset);
  const activeItem = items.find((i) => i.code === cover.bookletCode) ?? items[0];
  const syncedOpticalKey =
    activeAnswerKey && activeAnswerKey.length === baseQuestions.length
      ? activeAnswerKey
      : activeItem?.answerKey ?? '';

  return (
    <section
      aria-labelledby="booklet-variant-selector-title"
      data-testid="booklet-variant-selector"
      data-difficulty-preserved={String(difficultyPreserved)}
      className="surface-card rounded-xl p-5 space-y-4 border-l-4"
      style={{ borderLeftColor: activePalette.primaryColor }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Shuffle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: activePalette.primaryColor }} aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="booklet-variant-selector-title" className="text-base font-bold">
                Kitapçık Varyantı Seçici (A · B · C · D)
              </h3>
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-md surface-alt inline-flex items-center gap-1"
                style={{
                  color:
                    allOrdersUnique && difficultyPreserved
                      ? 'var(--chart-3)'
                      : 'var(--text-secondary)',
                }}
                data-testid="variant-uniqueness-badge"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {allOrdersUnique && difficultyPreserved
                    ? 'A ≠ B ≠ C ≠ D · Zorluk Korumalı · Optik Eşleşti'
                    : 'Sıralama Hazır'}
                </span>
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              A, B, C veya D kitapçıklarında her sorunun zorluk derecesi (Kolay / Orta / Zor) ve ders sırası korunarak deterministik yer değişikliği yapılır; optik cevap anahtarı eş zamanlı güncellenir.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReshuffleOrder}
            data-testid="reshuffle-variants-btn"
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Zorluk Korumalı Yeniden Sırala (Düzen #{orderSeed + 1})</span>
          </button>
          {onDownloadAllOpticalPdf && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction('all-opt', onDownloadAllOpticalPdf)}
              data-testid="download-all-variants-optical-pdf-btn"
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {busyKey === 'all-opt' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{busyKey === 'all-opt' ? 'Hazırlanıyor...' : 'A-B-C-D Optik (.PDF)'}</span>
            </button>
          )}
          {onDownloadAllBookletsZip && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction('all-zip', onDownloadAllBookletsZip)}
              data-testid="download-all-variants-zip-btn"
              className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {busyKey === 'all-zip' || exportBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{busyKey === 'all-zip' ? 'Paket Hazırlanıyor...' : 'A-B-C-D Hepsini İndir (.ZIP)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Kurumsal Renk Paleti & Kapak Grafik Düzeni Kontrolleri */}
      {(onChangeColorTheme || onChangeCoverLayout) && (
        <div
          className="surface-alt rounded-xl p-3.5 grid grid-cols-1 xl:grid-cols-12 gap-4 border"
          style={{ borderColor: 'var(--border-subtle)' }}
          data-testid="variant-cover-styling-bar"
        >
          {onChangeColorTheme && (
            <div className="xl:col-span-7 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold inline-flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5" style={{ color: activePalette.primaryColor }} aria-hidden="true" />
                  <span>Kurumsal Kapak Renk Paleti</span>
                </span>
                <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                  Aktif ({cover.bookletCode}): {activePalette.themeLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COVER_COLOR_THEMES.map((theme) => {
                  const selected = activeColorThemeId === theme.id;
                  const swatchPrimary =
                    theme.id === 'kurum-temasi' ? preset.primaryColor : theme.primaryColor;
                  const swatchSecondary =
                    theme.id === 'kurum-temasi' ? preset.secondaryColor : theme.secondaryColor;
                  const swatchGold =
                    theme.id === 'kurum-temasi' ? preset.goldColor : theme.goldColor;
                  const shortName =
                    theme.id === 'otomatik-abcd'
                      ? 'Otomatik A-B-C-D'
                      : theme.id === 'kurum-temasi'
                        ? 'Kurum Logosu'
                        : theme.name.split('&')[0].trim();

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => onChangeColorTheme(theme.id)}
                      aria-pressed={selected}
                      data-testid={`variant-palette-swatch-${theme.id}`}
                      title={`${theme.name} — ${theme.subtitle}`}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer ${
                        selected ? 'surface-card shadow-sm ring-1' : 'surface-card opacity-85 hover:opacity-100'
                      }`}
                      style={{
                        borderColor: selected ? swatchPrimary : 'var(--border-subtle)',
                        color: selected ? swatchSecondary : 'var(--text-primary)',
                      }}
                    >
                      <span className="inline-flex items-center -space-x-1 shrink-0" aria-hidden="true">
                        <span
                          className="w-3 h-3 rounded-full border border-white"
                          style={{ backgroundColor: swatchSecondary }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white"
                          style={{ backgroundColor: swatchPrimary }}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white"
                          style={{ backgroundColor: swatchGold }}
                        />
                      </span>
                      <span>{shortName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {onChangeCoverLayout && (
            <div className="xl:col-span-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold inline-flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" style={{ color: activePalette.primaryColor }} aria-hidden="true" />
                  <span>Kapak Grafik Düzeni</span>
                </span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {activeLayout.name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-1.5">
                {COVER_LAYOUT_OPTIONS.map((layout) => {
                  const selected = activeLayout.id === layout.id;
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      onClick={() => onChangeCoverLayout(layout.id)}
                      aria-pressed={selected}
                      data-testid={`variant-layout-btn-${layout.id}`}
                      title={layout.subtitle}
                      className={`p-1.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        selected ? 'surface-card shadow-sm' : 'surface-card opacity-85 hover:opacity-100'
                      }`}
                      style={{
                        borderColor: selected ? activePalette.primaryColor : 'var(--border-subtle)',
                        backgroundColor: selected ? activePalette.softBg : undefined,
                      }}
                    >
                      <MiniLayoutGlyph
                        layoutId={layout.id}
                        primary={activePalette.primaryColor}
                        secondary={activePalette.secondaryColor}
                        gold={activePalette.goldColor}
                      />
                      <span className="min-w-0">
                        <span
                          className="block text-[11px] font-extrabold truncate"
                          style={{ color: selected ? activePalette.badgeText : 'var(--text-primary)' }}
                        >
                          {layout.name}
                        </span>
                        <span className="block text-[9.5px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {layout.shortLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* A · B · C · D Kitapçık Varyant Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => {
          const isActive = cover.bookletCode === item.code;
          const pal = resolveCoverColorPalette(
            {
              bookletCode: item.code,
              coverColorThemeId: activeColorThemeId,
            },
            preset
          );
          const previewNums = item.mappedBaseNumbers.slice(0, 6).join(' → ');
          const previewKey = item.answerKey.slice(0, 10);

          return (
            <article
              key={item.code}
              className={`rounded-xl transition-all border-2 relative overflow-hidden flex flex-col justify-between ${
                isActive ? 'shadow-md scale-[1.01]' : 'surface-alt hover:opacity-95'
              }`}
              style={{
                borderColor: isActive ? pal.primaryColor : 'var(--border-subtle)',
                backgroundColor: isActive ? pal.softBg : undefined,
              }}
            >
              {/* Dynamic Top/Side Color Bar matching selected palette */}
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 right-0 h-1 pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, ${pal.secondaryColor}, ${pal.primaryColor}, ${pal.goldColor})`,
                }}
              />

              <button
                type="button"
                onClick={() => onSelectBooklet(item.code)}
                data-testid={`variant-selector-card-${item.code}`}
                data-card-color={pal.primaryColor}
                data-card-layout={activeLayout.id}
                data-answer-key={item.answerKey}
                data-difficulty-preserved={String(item.difficultyPreserved)}
                aria-pressed={isActive}
                className="w-full text-left p-3.5 pb-2.5 space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2">
                    <MiniLayoutGlyph
                      layoutId={activeLayout.id}
                      primary={pal.primaryColor}
                      secondary={pal.secondaryColor}
                      gold={pal.goldColor}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded font-display font-extrabold text-xs text-white inline-flex items-center justify-center shadow-xs"
                          style={{ backgroundColor: pal.primaryColor }}
                        >
                          {item.code}
                        </span>
                        <span
                          className="text-xs font-extrabold"
                          style={{ color: isActive ? pal.badgeText : 'var(--text-primary)' }}
                        >
                          {item.code} Kitapçığı
                        </span>
                      </div>
                      <div className="text-[10px] font-mono-num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {item.questionCount} Soru · {item.movedCount === 0 ? 'Ana Sıra' : `${item.movedCount} Yer Değişti`}
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-md text-white shrink-0"
                      style={{ backgroundColor: pal.primaryColor }}
                    >
                      Aktif
                    </span>
                  )}
                </div>

                <div className="pt-1.5 border-t space-y-1 text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center gap-1 font-mono-num font-bold truncate" style={{ color: isActive ? pal.badgeText : 'var(--text-primary)' }}>
                    <Layers className="w-3 h-3 shrink-0" style={{ color: pal.primaryColor }} aria-hidden="true" />
                    <span>Sıra: {previewNums || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono-num text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="truncate">
                      Optik: {previewKey}{item.answerKey.length > 10 ? '…' : ''}
                    </span>
                    <span
                      className="font-sans font-bold shrink-0"
                      style={{ color: pal.primaryColor }}
                    >
                      {activeLayout.shortLabel}
                    </span>
                  </div>
                </div>
              </button>

              {(onDownloadBookletPdf || onDownloadOpticalPdf) && (
                <div className="px-3.5 pb-3 pt-1 flex flex-col gap-1.5">
                  {onDownloadBookletPdf && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(`pdf-${item.code}`, () => onDownloadBookletPdf(item.code))
                      }
                      data-testid={`download-variant-pdf-${item.code}`}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[11px] font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 disabled:opacity-60"
                      style={{ backgroundColor: pal.primaryColor }}
                    >
                      {busyKey === `pdf-${item.code}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {busyKey === `pdf-${item.code}`
                          ? `${item.code} PDF Hazırlanıyor...`
                          : `${item.code} Kitapçığı PDF İndir`}
                      </span>
                    </button>
                  )}
                  {onDownloadOpticalPdf && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(`opt-${item.code}`, () => onDownloadOpticalPdf(item.code))
                      }
                      data-testid={`download-variant-optical-${item.code}`}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[11px] font-bold surface-card border inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 disabled:opacity-60"
                      style={{ borderColor: pal.primaryColor, color: pal.primaryColor }}
                    >
                      {busyKey === `opt-${item.code}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                      ) : (
                        <QrCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {busyKey === `opt-${item.code}`
                          ? `${item.code} Optik Hazırlanıyor...`
                          : `${item.code} Optik Form PDF`}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Eş Zamanlı Optik Anahtar & Zorluk Dağılımı Doğrulama Şeridi */}
      <div
        data-testid="variant-optical-key-sync-bar"
        className="surface-alt rounded-xl px-3.5 py-2.5 border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 text-xs"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-start sm:items-center gap-2 min-w-0">
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" style={{ color: activePalette.primaryColor }} aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-bold mr-1.5">
              Aktif Optik Anahtar ({cover.bookletCode} Kitapçığı):
            </span>
            <code
              data-testid="variant-active-optical-key"
              data-optical-key={syncedOpticalKey}
              className="font-mono-num text-[11px] font-bold break-all"
              style={{ color: activePalette.primaryColor }}
            >
              {formatOpticalKeyGroups(syncedOpticalKey.slice(0, 25))}
              {syncedOpticalKey.length > 25 ? ` … (${syncedOpticalKey.length} soru)` : ''}
            </code>
          </div>
        </div>

        <div
          data-testid="variant-difficulty-lock-badge"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold shrink-0"
          style={{ color: difficultyPreserved ? 'var(--chart-3)' : 'var(--text-secondary)' }}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            Zorluk Kilidi: {difficultyCounts.Kolay} Kolay · {difficultyCounts.Orta} Orta · {difficultyCounts.Zor} Zor ({difficultyPreserved ? 'Sıra %100 Korundu' : 'Karma'})
          </span>
        </div>
      </div>
    </section>
  );
}
