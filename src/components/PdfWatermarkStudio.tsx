import { useState } from 'react';
import {
  CheckCircle2,
  Droplets,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  CoverConfig,
  PdfWatermarkConfig,
  PdfWatermarkPlacement,
  PdfWatermarkPreset,
} from '../types/academy';
import {
  buildWatermarkDisplayText,
  computeWatermarkPlacements,
  DEFAULT_PDF_WATERMARK_TEXT,
  MAX_WATERMARK_ANGLE_DEG,
  MAX_WATERMARK_FONT_SCALE,
  MAX_WATERMARK_OPACITY,
  MIN_WATERMARK_ANGLE_DEG,
  MIN_WATERMARK_FONT_SCALE,
  MIN_WATERMARK_OPACITY,
  resolvePdfWatermarkConfig,
  WATERMARK_COLOR_OPTIONS,
} from '../utils/pdfWatermark';

interface PdfWatermarkStudioProps {
  cover: CoverConfig;
  watermarkPresets: PdfWatermarkPreset[];
  uploadedPdfName?: string | null;
  exportBusy?: boolean;
  onUpdateCover: (patch: Partial<CoverConfig>) => void;
  onAddOrUpdateWatermarkPreset: (input: {
    id?: string;
    text: string;
    placement: PdfWatermarkPlacement;
    opacity: number;
    fontScale?: number;
    angleDeg?: number;
    colorHex?: string;
    stripExistingMargins?: boolean;
  }) => { ok: boolean; saved?: PdfWatermarkPreset; wasUpdated: boolean; reason?: string };
  onDeleteWatermarkPreset: (id: string) => { ok: boolean; reason?: string };
  onDownloadBookletPdf: () => void;
}

const PLACEMENT_OPTIONS: Array<{
  id: PdfWatermarkPlacement;
  label: string;
  hint: string;
}> = [
  { id: 'background', label: 'Arka Plan (Çapraz)', hint: 'Sayfa ortası 3 satır çapraz' },
  { id: 'header-footer', label: 'Üst & Alt Kısım', hint: 'Üst/alt kenar şeritleri' },
  { id: 'both', label: 'Her İkisi', hint: 'Arka plan + üst & alt' },
];

export function PdfWatermarkStudio({
  cover,
  watermarkPresets,
  uploadedPdfName,
  exportBusy,
  onUpdateCover,
  onAddOrUpdateWatermarkPreset,
  onDeleteWatermarkPreset,
  onDownloadBookletPdf,
}: PdfWatermarkStudioProps) {
  const wm = resolvePdfWatermarkConfig(cover.watermark);
  const wmPct = Math.round(wm.opacity * 100);
  const fontScalePct = Math.round((wm.fontScale ?? 1) * 100);
  const angleDeg = wm.angleDeg ?? -32;
  const wmDisplay = buildWatermarkDisplayText(wm, {
    isSampleDemo: Boolean(cover.isSampleDemo),
  });
  const wmPlaces = computeWatermarkPlacements(wm.placement);

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);

  const updateWm = (patch: Partial<PdfWatermarkConfig>) => {
    onUpdateCover({
      watermark: resolvePdfWatermarkConfig({ ...wm, ...patch }),
    });
  };

  const handleApplyPreset = (preset: PdfWatermarkPreset) => {
    setEditingPresetId(null);
    setStudioError(null);
    onUpdateCover({
      watermark: resolvePdfWatermarkConfig({
        ...wm,
        enabled: true,
        text: preset.text,
        placement: preset.placement,
        opacity: preset.opacity,
        fontScale: preset.fontScale,
        angleDeg: preset.angleDeg,
        colorHex: preset.colorHex,
        stripExistingMargins: preset.stripExistingMargins,
      }),
    });
    setStudioNotice(`"${preset.text}" filigranı aktif edildi.`);
  };

  const handleStartEditPreset = (preset: PdfWatermarkPreset) => {
    setEditingPresetId(preset.id);
    setStudioError(null);
    onUpdateCover({
      watermark: resolvePdfWatermarkConfig({
        ...wm,
        enabled: true,
        text: preset.text,
        placement: preset.placement,
        opacity: preset.opacity,
        fontScale: preset.fontScale,
        angleDeg: preset.angleDeg,
        colorHex: preset.colorHex,
        stripExistingMargins: preset.stripExistingMargins,
      }),
    });
    setStudioNotice(`"${preset.text}" düzenleme moduna alındı; metin ve ayarları düzeltip kaydedebilirsiniz.`);
  };

  const handleSavePreset = () => {
    setStudioError(null);
    const currentText = (cover.watermark?.text ?? wm.text).trim();
    const res = onAddOrUpdateWatermarkPreset({
      id: editingPresetId ?? undefined,
      text: currentText,
      placement: wm.placement,
      opacity: wm.opacity,
      fontScale: wm.fontScale,
      angleDeg: wm.angleDeg,
      colorHex: wm.colorHex,
      stripExistingMargins: wm.stripExistingMargins,
    });
    if (!res.ok) {
      setStudioError(res.reason || 'Filigran kaydedilemedi.');
      return;
    }
    setEditingPresetId(null);
    setStudioNotice(
      res.wasUpdated
        ? `"${res.saved?.text}" filigranı düzeltildi ve kaydedildi.`
        : `"${res.saved?.text}" yeni filigran olarak listeye eklendi.`
    );
  };

  const handleDeletePreset = (preset: PdfWatermarkPreset) => {
    setStudioError(null);
    const res = onDeleteWatermarkPreset(preset.id);
    if (!res.ok) {
      setStudioError(res.reason || 'Filigran silinemedi.');
      return;
    }
    if (editingPresetId === preset.id) {
      setEditingPresetId(null);
    }
    setStudioNotice(`"${preset.text}" filigran kaydı silindi.`);
  };

  return (
    <section
      id="pdf-watermark-studio-section"
      aria-labelledby="pdf-watermark-studio-title"
      data-testid="pdf-watermark-settings"
      className="surface-card rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Droplets className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="pdf-watermark-studio-title" className="text-base font-bold leading-tight">
                PDF Filigran Ekleme &amp; Düzeltme Stüdyosu
              </h3>
              <span
                className="text-[11px] font-mono-num px-2 py-0.5 rounded font-bold"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent-primary)',
                }}
              >
                {wm.enabled ? `%${wmPct} Opaklık` : 'Kapalı'}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {uploadedPdfName
                ? `Yüklenen "${uploadedPdfName}" dahil tüm PDF sayfalarına yeni filigran ekleyin, eski şeritleri temizleyin veya kayıtlı filigranları düzeltin.`
                : 'Tüm PDF kitapçıklarına kurumsal veya kişiye/kuruma özel filigran ekleyin, kaydedin ve istediğiniz zaman düzeltin.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer surface-alt px-3 py-2 rounded-xl">
            <input
              type="checkbox"
              checked={wm.enabled}
              data-testid="watermark-enabled-toggle"
              onChange={(e) => updateWm({ enabled: e.target.checked })}
              className="rounded cursor-pointer"
            />
            <span>Filigran Aktif</span>
          </label>
          <button
            type="button"
            disabled={exportBusy}
            onClick={onDownloadBookletPdf}
            data-testid="watermark-download-pdf-btn"
            className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {exportBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>Filigranlı PDF İndir ({cover.bookletCode})</span>
          </button>
        </div>
      </div>

      {studioNotice && (
        <div className="surface-alt rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{studioNotice}</span>
        </div>
      )}
      {studioError && (
        <div className="rounded-lg px-3 py-2 text-xs font-semibold bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800">
          {studioError}
        </div>
      )}

      {wm.enabled && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Add / Edit Form + Presets + Controls */}
          <div className="lg:col-span-8 space-y-4">
            {/* Saved Watermarks List (Quick Select / Edit / Delete) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Kayıtlı PDF Filigranları ({watermarkPresets.length})
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Seçmek için metne, düzeltmek için kaleme tıklayın
                </span>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="watermark-presets-list">
                {watermarkPresets.map((preset) => {
                  const isActive =
                    preset.text.trim().toLocaleLowerCase('tr-TR') ===
                    wm.text.trim().toLocaleLowerCase('tr-TR');
                  const isEditing = editingPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs border transition-all ${
                        isEditing
                          ? 'ring-2 ring-amber-400 surface-alt'
                          : isActive
                            ? 'btn-3d border-transparent'
                            : 'surface-alt'
                      }`}
                      style={{
                        borderColor: isActive ? 'transparent' : 'var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="font-bold cursor-pointer truncate max-w-[230px]"
                      >
                        {preset.text}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEditPreset(preset)}
                        aria-label={`"${preset.text}" filigranını düzelt`}
                        title="Filigranı Düzelt / Düzenle"
                        data-testid={`watermark-edit-preset-${preset.id}`}
                        className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" aria-hidden="true" />
                      </button>
                      {!preset.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset)}
                          aria-label={`"${preset.text}" filigranını sil`}
                          title="Filigranı Sil"
                          data-testid={`watermark-delete-preset-${preset.id}`}
                          className="p-1 rounded-md hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add / Fix Text Input Row */}
            <div className="surface-alt rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[220px] block text-xs font-semibold">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {editingPresetId
                      ? 'Filigran Düzeltme Modu (Metni ve Aşağıdaki Ayarları Güncelleyin)'
                      : 'Filigran Metni (Yeni Ekle veya Anlık Uygula)'}
                  </span>
                  <input
                    type="text"
                    value={cover.watermark?.text ?? wm.text}
                    data-testid="watermark-text-input"
                    onChange={(e) =>
                      onUpdateCover({
                        watermark: {
                          ...wm,
                          text: e.target.value,
                        },
                      })
                    }
                    placeholder="Örn: Doğruluk Akademi - Kurumsal veya Kurum/Kişi Adı"
                    className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card font-semibold"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleSavePreset}
                  data-testid={
                    editingPresetId
                      ? 'watermark-update-preset-btn'
                      : 'watermark-save-preset-btn'
                  }
                  className="btn-3d px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {editingPresetId ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Düzeltmeyi Kaydet</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Listeye Ekle</span>
                    </>
                  )}
                </button>

                {editingPresetId && (
                  <button
                    type="button"
                    onClick={() => setEditingPresetId(null)}
                    className="btn-3d-secondary px-2.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>İptal</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEditingPresetId(null);
                    updateWm({ text: DEFAULT_PDF_WATERMARK_TEXT });
                  }}
                  data-testid="watermark-reset-text-btn"
                  className="btn-3d-secondary px-3 py-2 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Varsayılan Metin</span>
                </button>
              </div>

              {/* Placement Options */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Filigran Konumu
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PLACEMENT_OPTIONS.map((opt) => {
                    const active = wm.placement === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        data-testid={`watermark-placement-${opt.id}`}
                        onClick={() => updateWm({ placement: opt.id })}
                        className={`px-3 py-2 rounded-lg text-left transition-all cursor-pointer border ${
                          active ? 'btn-3d border-transparent' : 'surface-card'
                        }`}
                        style={{
                          borderColor: active ? 'transparent' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="text-xs font-bold leading-tight">{opt.label}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sliders: Opacity, Font Scale, Angle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-xs font-semibold">
                  <span className="flex items-center justify-between mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Opaklık</span>
                    <span
                      data-testid="watermark-opacity-value"
                      className="font-mono-num font-bold"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      %{wmPct}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={Math.round(MIN_WATERMARK_OPACITY * 100)}
                    max={Math.round(MAX_WATERMARK_OPACITY * 100)}
                    step={1}
                    value={wmPct}
                    data-testid="watermark-opacity-slider"
                    onChange={(e) => updateWm({ opacity: Number(e.target.value) / 100 })}
                    className="w-full accent-current cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                </label>

                <label className="block text-xs font-semibold">
                  <span className="flex items-center justify-between mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Yazı Boyutu</span>
                    <span
                      data-testid="watermark-fontscale-value"
                      className="font-mono-num font-bold"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      %{fontScalePct}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={Math.round(MIN_WATERMARK_FONT_SCALE * 100)}
                    max={Math.round(MAX_WATERMARK_FONT_SCALE * 100)}
                    step={5}
                    value={fontScalePct}
                    data-testid="watermark-fontscale-slider"
                    onChange={(e) => updateWm({ fontScale: Number(e.target.value) / 100 })}
                    className="w-full accent-current cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                </label>

                <label className="block text-xs font-semibold">
                  <span className="flex items-center justify-between mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Eğim Açısı</span>
                    <span
                      data-testid="watermark-angle-value"
                      className="font-mono-num font-bold"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {angleDeg}°
                    </span>
                  </span>
                  <input
                    type="range"
                    min={MIN_WATERMARK_ANGLE_DEG}
                    max={MAX_WATERMARK_ANGLE_DEG}
                    step={1}
                    value={angleDeg}
                    data-testid="watermark-angle-slider"
                    onChange={(e) => updateWm({ angleDeg: Number(e.target.value) })}
                    className="w-full accent-current cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                </label>
              </div>

              {/* Color Swatches + Correction Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--text-secondary)' }}>
                    Renk:
                  </span>
                  {WATERMARK_COLOR_OPTIONS.map((c) => {
                    const active = (wm.colorHex || '') === c.hex;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateWm({ colorHex: c.hex })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer border ${
                          active ? 'btn-3d border-transparent' : 'surface-card'
                        }`}
                        style={{ borderColor: active ? 'transparent' : 'var(--border-subtle)' }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/60"
                          style={{ backgroundColor: c.hex || '#1d4ed8' }}
                        />
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer surface-card px-3 py-2.5 rounded-lg">
                  <input
                    type="checkbox"
                    checked={wm.includeCoverAndBack}
                    data-testid="watermark-cover-toggle"
                    onChange={(e) =>
                      updateWm({ includeCoverAndBack: e.target.checked })
                    }
                    className="rounded cursor-pointer"
                  />
                  <span>Ön kapak ve son imza sayfasına da uygula</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer surface-card px-3 py-2.5 rounded-lg">
                  <input
                    type="checkbox"
                    checked={Boolean(wm.stripExistingMargins)}
                    data-testid="watermark-strip-margins-toggle"
                    onChange={(e) =>
                      updateWm({ stripExistingMargins: e.target.checked })
                    }
                    className="rounded cursor-pointer"
                  />
                  <span>Yüklenen PDF üst/alt eski filigran şeridini temizle (Düzelt)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Right: Live A4 Page Watermark Preview */}
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span style={{ color: 'var(--text-secondary)' }}>Canlı A4 PDF Sayfa Önizleme</span>
              <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                %{wmPct} · {angleDeg}°
              </span>
            </div>
            <div
              data-testid="watermark-live-preview"
              aria-label="Filigran canlı önizleme"
              className="relative h-64 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-inner overflow-hidden flex items-center justify-center select-none p-5"
            >
              {/* Subtle mock exam lines so user sees readability behind/under watermark */}
              <div aria-hidden="true" className="w-full space-y-3 opacity-35">
                <div className="h-2.5 w-2/3 bg-slate-300 rounded" />
                <div className="h-2 w-full bg-slate-200 rounded" />
                <div className="h-2 w-5/6 bg-slate-200 rounded" />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="h-2 bg-slate-200 rounded" />
                  <div className="h-2 bg-slate-200 rounded" />
                </div>
                <div className="h-2.5 w-1/2 bg-slate-300 rounded pt-2" />
                <div className="h-2 w-full bg-slate-200 rounded" />
                <div className="h-2 w-4/5 bg-slate-200 rounded" />
              </div>

              {wmPlaces.drawHeaderFooter && (
                <>
                  <div
                    className="absolute top-2 inset-x-4 text-center font-extrabold tracking-wide truncate"
                    style={{
                      opacity: wm.opacity,
                      color: wm.colorHex || '#0f2747',
                      fontSize: `${Math.max(8, Math.round(10 * (wm.fontScale ?? 1)))}px`,
                    }}
                  >
                    {wmDisplay}
                  </div>
                  <div
                    className="absolute bottom-2 inset-x-4 text-center font-extrabold tracking-wide truncate"
                    style={{
                      opacity: wm.opacity,
                      color: wm.colorHex || '#0f2747',
                      fontSize: `${Math.max(8, Math.round(10 * (wm.fontScale ?? 1)))}px`,
                    }}
                  >
                    {wmDisplay}
                  </div>
                </>
              )}

              {wmPlaces.drawBackground && (
                <div
                  className="font-extrabold tracking-wider whitespace-nowrap px-4 pointer-events-none"
                  style={{
                    opacity: wm.opacity,
                    color: wm.colorHex || '#0f2747',
                    fontSize: `${Math.round(15 * (wm.fontScale ?? 1))}px`,
                    transform: `rotate(${angleDeg}deg)`,
                  }}
                >
                  {wmDisplay}
                </div>
              )}

              <span className="absolute bottom-1.5 right-2.5 text-[9px] font-mono-num text-slate-400">
                A4 Önizleme
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
