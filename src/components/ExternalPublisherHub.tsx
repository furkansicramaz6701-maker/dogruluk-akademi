import { ChangeEvent, useMemo, useState } from 'react';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Library,
  Plus,
  Save,
  Sparkles,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  BookletCode,
  ExternalPublisherExamConfig,
  ExternalPublisherExamPreset,
  GradeProfile,
} from '../types/academy';
import { getLogoPreset } from '../data/logos';
import {
  BOOKLET_CODES,
  normalizeExternalAnswerKeyString,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import {
  computeExternalPublisherKeyHealth,
  downloadExternalPublisherKeyTemplate,
  parsePublisherAnswerKeysSpreadsheet,
} from '../utils/externalPublisherLibrary';
import { deriveBookletAnswerKeysFromBase } from '../utils/omrSpreadsheet';

interface ExternalPublisherHubProps {
  gradeProfile: GradeProfile;
  questionsCount: number;
  activeBookletCode: BookletCode;
  logoStyleId?: Parameters<typeof getLogoPreset>[0];
  externalPublisherConfig: ExternalPublisherExamConfig;
  presets: ExternalPublisherExamPreset[];
  activePresetId: string | null;
  onUpdateConfig: (patch: Partial<ExternalPublisherExamConfig>) => void;
  onSelectPreset: (preset: ExternalPublisherExamPreset) => void;
  onSavePreset: (asNew?: boolean) => void;
  onDeletePreset: (presetId: string) => void;
  onSyncActiveAnswerKey: (key: string) => void;
  onTriggerPhotoKeyFile?: (file: File) => void;
  photoLoading?: boolean;
  onToast?: (msg: string) => void;
}

export function ExternalPublisherHub({
  gradeProfile,
  questionsCount,
  activeBookletCode,
  logoStyleId,
  externalPublisherConfig,
  presets,
  activePresetId,
  onUpdateConfig,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  onSyncActiveAnswerKey,
  onTriggerPhotoKeyFile,
  photoLoading = false,
  onToast,
}: ExternalPublisherHubProps) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const bookletMode = externalPublisherConfig.bookletMode ?? 'AB';
  const visibleBooklets: BookletCode[] =
    bookletMode === 'AB' ? ['A', 'B'] : BOOKLET_CODES;
  const effectiveOptionCount =
    externalPublisherConfig.optionCount ?? gradeProfile.optionCount;
  const effectiveQuestionCount =
    externalPublisherConfig.questionCount && externalPublisherConfig.questionCount > 0
      ? externalPublisherConfig.questionCount
      : questionsCount;

  const activeKeyHealth = useMemo(
    () =>
      computeExternalPublisherKeyHealth({
        bookletCode: activeBookletCode,
        rawKey: externalPublisherConfig.answerKeys[activeBookletCode] ?? '',
        gradeProfile: { ...gradeProfile, optionCount: effectiveOptionCount },
        expectedQuestionCount: effectiveQuestionCount,
      }),
    [
      activeBookletCode,
      externalPublisherConfig.answerKeys,
      gradeProfile,
      effectiveOptionCount,
      effectiveQuestionCount,
    ]
  );

  const handleExcelKeysUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parsePublisherAnswerKeysSpreadsheet(buf, {
        optionCount: effectiveOptionCount,
        autoDeriveMissing: true,
      });
      if (parsed.detectedBooklets.length === 0) {
        setStatusNote(parsed.summaryMessage);
        onToast?.(parsed.summaryMessage);
        return;
      }
      const nextKeys = {
        ...externalPublisherConfig.answerKeys,
        ...parsed.answerKeys,
      };
      onUpdateConfig({
        ...(parsed.publisherName ? { publisherName: parsed.publisherName } : {}),
        ...(parsed.examTitle ? { examTitle: parsed.examTitle } : {}),
        answerKeys: nextKeys,
      });
      const activeLoaded = nextKeys[activeBookletCode] || nextKeys.A || '';
      if (activeLoaded) {
        onSyncActiveAnswerKey(activeLoaded);
      }
      setStatusNote(`${file.name}: ${parsed.summaryMessage}`);
      onToast?.(parsed.summaryMessage);
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Yayın anahtarı Excel'i okunamadı: ${err.message}`
          : 'Yayın anahtarı Excel dosyası işlenemedi.';
      setStatusNote(msg);
      onToast?.(msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleDeriveFromA = () => {
    const aKey = normalizeExternalAnswerKeyString(
      externalPublisherConfig.answerKeys.A ?? '',
      effectiveOptionCount
    );
    if (aKey.length < 4) {
      const msg = 'Önce A Kitapçığı cevap anahtarına en az 4 soru girin veya yükleyin.';
      setStatusNote(msg);
      onToast?.(msg);
      return;
    }
    const derived = deriveBookletAnswerKeysFromBase(aKey, effectiveOptionCount);
    onUpdateConfig({
      answerKeys: {
        ...externalPublisherConfig.answerKeys,
        A: derived.A,
        B: derived.B,
        C: bookletMode === 'ABCD' ? derived.C : externalPublisherConfig.answerKeys.C,
        D: bookletMode === 'ABCD' ? derived.D : externalPublisherConfig.answerKeys.D,
      },
    });
    if (activeBookletCode !== 'A' && derived[activeBookletCode]) {
      onSyncActiveAnswerKey(derived[activeBookletCode]);
    }
    const msg =
      bookletMode === 'AB'
        ? `A anahtarından (${aKey.length} soru) B kitapçığı cevap anahtarı otomatik türetildi.`
        : `A anahtarından (${aKey.length} soru) B, C ve D kitapçık cevap anahtarları otomatik türetildi.`;
    setStatusNote(msg);
    onToast?.(msg);
  };

  return (
    <div
      data-testid="external-publisher-keys-panel"
      className="surface-card rounded-xl p-4 space-y-4 border"
      style={{ borderColor: 'var(--accent-primary)' }}
    >
      {/* Top Library Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Library className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <div className="text-xs font-extrabold">
              Gelişmiş Farklı Yayınlar Kütüphanesi &amp; Cevap Anahtarı Merkezi
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Yayın profillerini kaydedin, A-B (2 kitapçık) veya A-B-C-D (4 kitapçık) anahtarlarını Excel/fotoğraftan yükleyin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="external-publisher-preset-select"
            value={activePresetId ?? ''}
            onChange={(e) => {
              const found = presets.find((p) => p.id === e.target.value);
              if (found) onSelectPreset(found);
            }}
            aria-label="Kayıtlı farklı yayın denemesi seç"
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold surface-alt max-w-[260px]"
          >
            <option value="">Kayıtlı Yayın Seç ({presets.length})</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.publisherName} · {p.gradeId}. Sınıf ({p.bookletMode === 'AB' ? 'A-B' : 'A-B-C-D'})
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="external-publisher-save-preset-btn"
            onClick={() => onSavePreset(false)}
            className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Yayını Kaydet</span>
          </button>

          <button
            type="button"
            data-testid="external-publisher-save-new-btn"
            onClick={() => onSavePreset(true)}
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Yeni Profil</span>
          </button>

          {activePresetId && presets.length > 1 && (
            <button
              type="button"
              data-testid="external-publisher-delete-preset-btn"
              onClick={() => onDeletePreset(activePresetId)}
              aria-label="Seçili yayın profilini sil"
              className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Publisher Metadata + Booklet Mode Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <label className="lg:col-span-3 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Yayın Adı</span>
          <input
            type="text"
            data-testid="external-publisher-name-input"
            value={externalPublisherConfig.publisherName}
            onChange={(e) => onUpdateConfig({ publisherName: e.target.value })}
            placeholder="Örn: Özdebir / Hız / Palme"
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs surface-alt font-semibold"
          />
        </label>

        <label className="lg:col-span-3 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Deneme Adı</span>
          <input
            type="text"
            data-testid="external-publisher-title-input"
            value={externalPublisherConfig.examTitle}
            onChange={(e) => onUpdateConfig({ examTitle: e.target.value })}
            placeholder="Örn: 5 Aralık Cumartesi TG Denemesi"
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs surface-alt font-semibold"
          />
        </label>

        <label className="lg:col-span-2 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Soru Sayısı</span>
          <input
            type="number"
            min={10}
            max={200}
            data-testid="external-publisher-qcount-input"
            value={effectiveQuestionCount}
            onChange={(e) =>
              onUpdateConfig({
                questionCount: Math.max(10, Math.min(200, Number(e.target.value) || questionsCount)),
              })
            }
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-mono-num font-bold"
          />
        </label>

        <div className="lg:col-span-4">
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Kitapçık Modu
          </div>
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-lg surface-alt"
            role="group"
            aria-label="Farklı yayın kitapçık modu"
          >
            <button
              type="button"
              data-testid="external-mode-ab-btn"
              onClick={() => onUpdateConfig({ bookletMode: 'AB' })}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap cursor-pointer ${
                bookletMode === 'AB' ? 'btn-3d' : 'text-[var(--text-secondary)]'
              }`}
            >
              A - B (2&apos;li)
            </button>
            <button
              type="button"
              data-testid="external-mode-abcd-btn"
              onClick={() => onUpdateConfig({ bookletMode: 'ABCD' })}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap cursor-pointer ${
                bookletMode === 'ABCD' ? 'btn-3d' : 'text-[var(--text-secondary)]'
              }`}
            >
              A - B - C - D
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Import / Derive Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <label
            data-testid="external-excel-upload-btn"
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Excel / CSV&apos;den Yayın Anahtarı Yükle</span>
            <input
              type="file"
              data-testid="external-excel-upload-input"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelKeysUpload}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={() =>
              downloadExternalPublisherKeyTemplate({
                gradeProfile,
                questionCount: effectiveQuestionCount,
                publisherName: externalPublisherConfig.publisherName,
              })
            }
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Örnek Anahtar Excel (.xlsx)</span>
          </button>

          {onTriggerPhotoKeyFile && (
            <label className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{photoLoading ? 'Fotoğraf Okunuyor...' : 'Fotoğraf / PDF ile Anahtar Tara'}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onTriggerPhotoKeyFile(file);
                  e.target.value = '';
                }}
                className="sr-only"
              />
            </label>
          )}

          <button
            type="button"
            data-testid="external-derive-from-a-btn"
            onClick={handleDeriveFromA}
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{bookletMode === 'AB' ? "A'dan B'yi Türet" : "A'dan B-C-D Türet"}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="text-xs font-semibold underline cursor-pointer"
          style={{ color: 'var(--accent-primary)' }}
        >
          {showBreakdown ? 'Ders Dağılımını Gizle' : 'Ders Dağılımını Göster'}
        </button>
      </div>

      {statusNote && (
        <div className="rounded-lg px-3 py-2 text-xs font-semibold surface-alt flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{statusNote}</span>
        </div>
      )}

      {/* Answer Key Inputs Grid (2 columns in AB mode, 4 columns in ABCD mode) */}
      <div
        className={`grid gap-2.5 ${
          bookletMode === 'AB'
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {visibleBooklets.map((code) => {
          const pal = resolveCoverColorPalette(
            { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
            getLogoPreset(logoStyleId)
          );
          const val = externalPublisherConfig.answerKeys[code] ?? '';
          const isActive = activeBookletCode === code;
          const isFull = val.length >= effectiveQuestionCount;

          return (
            <div
              key={code}
              className={`rounded-lg p-3 border ${isActive ? 'ring-1' : ''}`}
              style={{
                borderColor: isActive ? pal.primaryColor : 'var(--border-subtle)',
                backgroundColor: isActive ? pal.softBg : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-extrabold" style={{ color: pal.primaryColor }}>
                  {code} Kitapçığı Cevap Anahtarı
                </span>
                <span
                  className={`text-[11px] font-mono-num font-bold ${
                    isFull ? 'text-emerald-700' : ''
                  }`}
                  style={!isFull ? { color: 'var(--text-secondary)' } : undefined}
                >
                  {val.length}/{effectiveQuestionCount}
                </span>
              </div>
              <input
                type="text"
                data-testid={`external-key-input-${code}`}
                value={val}
                onChange={(e) => {
                  const cleaned = normalizeExternalAnswerKeyString(
                    e.target.value,
                    effectiveOptionCount
                  );
                  onUpdateConfig({
                    answerKeys: {
                      ...externalPublisherConfig.answerKeys,
                      [code]: cleaned,
                    },
                  });
                  if (activeBookletCode === code && cleaned.length > 0) {
                    onSyncActiveAnswerKey(cleaned);
                  }
                }}
                placeholder={`${code} kitapçığı şıkları (örn. ABCD...)`}
                className="w-full rounded px-2.5 py-1.5 text-xs font-mono-num font-bold surface-alt"
              />
            </div>
          );
        })}
      </div>

      {/* Subject Breakdown Verification */}
      {showBreakdown && (
        <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>
                {activeBookletCode} Kitapçığı Ders Sırası Kontrolü ({activeKeyHealth.enteredCount}/
                {activeKeyHealth.expectedCount} Soru)
              </span>
            </span>
            {activeKeyHealth.invalidCount > 0 && (
              <span className="text-rose-600 font-bold inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{activeKeyHealth.invalidCount} geçersiz şık karakteri temizlendi</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {activeKeyHealth.subjectBreakdown.map((item) => (
              <span key={item.subject} className="font-mono-num">
                <strong className="text-[var(--text-primary)]">{item.subject}</strong> (S{item.startQ}–
                {item.endQ}):{' '}
                <span
                  className={
                    item.status === 'tam'
                      ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                      : item.status === 'eksik'
                        ? 'text-amber-700 dark:text-amber-400 font-bold'
                        : ''
                  }
                >
                  {item.enteredCount}/{item.targetCount}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
