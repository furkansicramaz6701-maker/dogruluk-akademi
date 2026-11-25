import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  Crop,
  FileDown,
  FileSpreadsheet,
  Library,
  Loader2,
  Minus,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import {
  BookletCode,
  ExternalPublisherExamConfig,
  ExternalPublisherExamPreset,
  GradeProfile,
} from '../types/academy';
import { getGradeProfile, GRADE_PROFILES } from '../data/curriculum';
import { getLogoPreset } from '../data/logos';
import {
  BOOKLET_CODES,
  getBookletCycleCodes,
  normalizeExternalAnswerKeyString,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import {
  computeExternalPublisherKeyHealth,
  downloadExternalPublisherKeyTemplate,
  parseCombinedExternalAnswerKeysText,
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
  onChangeGradeProfile?: (gradeId: GradeProfile['id']) => void;
  onSelectPreset: (preset: ExternalPublisherExamPreset) => void;
  onSavePreset: (asNew?: boolean) => void;
  onDeletePreset: (presetId: string) => void;
  onSyncActiveAnswerKey: (key: string) => void;
  onTriggerPhotoKeyFile?: (file: File, targetBooklet?: BookletCode) => void;
  onOpenRegionEditor?: (targetBooklet?: BookletCode) => void;
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
  onChangeGradeProfile,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  onSyncActiveAnswerKey,
  onTriggerPhotoKeyFile,
  onOpenRegionEditor,
  photoLoading = false,
  onToast,
}: ExternalPublisherHubProps) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [showPasteSplit, setShowPasteSplit] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const bookletMode = externalPublisherConfig.bookletMode ?? 'AB';
  const visibleBooklets: BookletCode[] = getBookletCycleCodes(bookletMode);
  const selectedSubjectId = externalPublisherConfig.selectedSubjectId ?? 'all';
  const effectiveOptionCount =
    externalPublisherConfig.optionCount ?? gradeProfile.optionCount;
  const effectiveQuestionCount =
    externalPublisherConfig.questionCount && externalPublisherConfig.questionCount > 0
      ? externalPublisherConfig.questionCount
      : questionsCount;

  const [questionCountDraft, setQuestionCountDraft] = useState<string>(String(effectiveQuestionCount));
  useEffect(() => {
    setQuestionCountDraft(String(effectiveQuestionCount));
  }, [effectiveQuestionCount]);

  const commitQuestionCount = (rawVal: number) => {
    const clamped = Math.max(5, Math.min(200, Math.round(rawVal)));
    setQuestionCountDraft(String(clamped));
    onUpdateConfig({ questionCount: clamped });
  };

  const activeKeyHealth = useMemo(
    () =>
      computeExternalPublisherKeyHealth({
        bookletCode: activeBookletCode,
        rawKey: externalPublisherConfig.answerKeys[activeBookletCode] ?? '',
        gradeProfile: { ...gradeProfile, optionCount: effectiveOptionCount },
        expectedQuestionCount: effectiveQuestionCount,
        selectedSubjectId,
      }),
    [
      activeBookletCode,
      externalPublisherConfig.answerKeys,
      gradeProfile,
      effectiveOptionCount,
      effectiveQuestionCount,
      selectedSubjectId,
    ]
  );

  const handleGradeSwitch = (nextGradeId: GradeProfile['id']) => {
    const nextProf = getGradeProfile(nextGradeId);
    const totalQ = nextProf.subjects.reduce((s, x) => s + x.questionCount, 0);
    onUpdateConfig({
      gradeId: nextGradeId,
      optionCount: nextProf.optionCount,
      questionCount: totalQ,
      selectedSubjectId: 'all',
    });
    onChangeGradeProfile?.(nextGradeId);
    const msg = `Sınıf düzeyi ${nextProf.shortLabel} (${nextProf.optionCount} şık · ${totalQ} soru) olarak güncellendi.`;
    setStatusNote(msg);
    onToast?.(msg);
  };

  const handleSubjectScopeChange = (nextSubjId: string) => {
    if (nextSubjId === 'all') {
      const totalQ = gradeProfile.subjects.reduce((s, x) => s + x.questionCount, 0);
      onUpdateConfig({
        selectedSubjectId: 'all',
        questionCount: totalQ,
      });
      setStatusNote(`Tam deneme kapsamı seçildi (${totalQ} soru).`);
      return;
    }
    const found = gradeProfile.subjects.find((s) => s.id === nextSubjId);
    if (!found) return;
    onUpdateConfig({
      selectedSubjectId: found.id,
      questionCount: found.questionCount,
      examTitle: externalPublisherConfig.examTitle?.trim()
        ? externalPublisherConfig.examTitle
        : `${gradeProfile.shortLabel} ${found.name} Konu Testi`,
    });
    setStatusNote(`${found.name} ders testi seçildi (${found.questionCount} soru).`);
  };

  const handleParseCombinedText = () => {
    const res = parseCombinedExternalAnswerKeysText(pasteRawText, {
      optionCount: effectiveOptionCount,
      bookletMode,
      autoDeriveMissing: bookletMode !== 'A',
    });
    if (res.detectedBooklets.length === 0) {
      setStatusNote(res.summaryMessage);
      onToast?.(res.summaryMessage);
      return;
    }
    const nextKeys = {
      ...externalPublisherConfig.answerKeys,
      ...res.answerKeys,
    };
    const nextMode = res.recommendedMode;
    onUpdateConfig({
      bookletMode: nextMode,
      answerKeys: nextKeys,
    });
    const activeLoaded = nextKeys[activeBookletCode] || nextKeys.A || '';
    if (activeLoaded) {
      onSyncActiveAnswerKey(activeLoaded);
    }
    setStatusNote(res.summaryMessage);
    onToast?.(res.summaryMessage);
    setShowPasteSplit(false);
  };

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
                {p.publisherName} · {p.gradeId}. Sınıf ({p.bookletMode === 'A' ? 'Tek A' : p.bookletMode === 'AB' ? 'A-B' : 'A-B-C-D'})
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

      {/* Publisher Metadata + Grade Level + Subject Test + Booklet Mode Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <label className="lg:col-span-2 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Sınıf Düzeyi</span>
          <select
            data-testid="external-grade-select"
            value={externalPublisherConfig.gradeId ?? gradeProfile.id}
            onChange={(e) => handleGradeSwitch(e.target.value as GradeProfile['id'])}
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-bold"
          >
            {GRADE_PROFILES.map((gp) => (
              <option key={gp.id} value={gp.id}>
                {gp.shortLabel} ({gp.optionCount} şık)
              </option>
            ))}
          </select>
        </label>

        <label className="lg:col-span-2 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Ders / Kapsam</span>
          <select
            data-testid="external-subject-scope-select"
            value={selectedSubjectId}
            onChange={(e) => handleSubjectScopeChange(e.target.value)}
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-bold"
          >
            <option value="all">Tam Deneme (Tüm Dersler)</option>
            {gradeProfile.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.questionCount} soru)
              </option>
            ))}
          </select>
        </label>

        <label className="lg:col-span-2 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Yayın Adı</span>
          <input
            type="text"
            data-testid="external-publisher-name-input"
            value={externalPublisherConfig.publisherName}
            onChange={(e) => onUpdateConfig({ publisherName: e.target.value })}
            placeholder="Özdebir / Ders Testi"
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-semibold"
          />
        </label>

        <label className="lg:col-span-2 block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Deneme Adı</span>
          <input
            type="text"
            data-testid="external-publisher-title-input"
            value={externalPublisherConfig.examTitle}
            onChange={(e) => onUpdateConfig({ examTitle: e.target.value })}
            placeholder="Örn: Hafta Sonu Testi"
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt font-semibold"
          />
        </label>

        <div className="lg:col-span-2">
          <label
            htmlFor="external-publisher-qcount-input"
            className="block text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            Soru Sayısı
          </label>
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              data-testid="external-publisher-qcount-dec"
              aria-label="Soru sayısını 1 azalt"
              onClick={() => commitQuestionCount(effectiveQuestionCount - 1)}
              className="btn-3d-secondary px-2 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <input
              id="external-publisher-qcount-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              data-testid="external-publisher-qcount-input"
              value={questionCountDraft}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 3);
                setQuestionCountDraft(digitsOnly);
                if (digitsOnly !== '') {
                  const parsed = Number(digitsOnly);
                  if (parsed >= 5 && parsed <= 200) {
                    onUpdateConfig({ questionCount: parsed });
                  }
                }
              }}
              onBlur={() => {
                const parsed = Number(questionCountDraft);
                if (!questionCountDraft || !Number.isFinite(parsed)) {
                  setQuestionCountDraft(String(effectiveQuestionCount));
                } else {
                  commitQuestionCount(parsed);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsed = Number(questionCountDraft);
                  commitQuestionCount(Number.isFinite(parsed) && parsed > 0 ? parsed : effectiveQuestionCount);
                }
              }}
              className="w-full min-w-[54px] text-center rounded-lg px-2 py-1.5 text-xs surface-alt font-mono-num font-bold"
            />
            <button
              type="button"
              data-testid="external-publisher-qcount-inc"
              aria-label="Soru sayısını 1 artır"
              onClick={() => commitQuestionCount(effectiveQuestionCount + 1)}
              className="btn-3d-secondary px-2 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Kitapçık Düzeni
          </div>
          <div
            className="grid grid-cols-3 gap-1 p-1 rounded-lg surface-alt"
            role="group"
            aria-label="Farklı yayın kitapçık modu"
          >
            <button
              type="button"
              data-testid="external-mode-a-btn"
              onClick={() => onUpdateConfig({ bookletMode: 'A' })}
              className={`px-1.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                bookletMode === 'A' ? 'btn-3d' : 'text-[var(--text-secondary)]'
              }`}
            >
              Tek (A)
            </button>
            <button
              type="button"
              data-testid="external-mode-ab-btn"
              onClick={() => onUpdateConfig({ bookletMode: 'AB' })}
              className={`px-1.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                bookletMode === 'AB' ? 'btn-3d' : 'text-[var(--text-secondary)]'
              }`}
            >
              A - B
            </button>
            <button
              type="button"
              data-testid="external-mode-abcd-btn"
              onClick={() => onUpdateConfig({ bookletMode: 'ABCD' })}
              className={`px-1.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                bookletMode === 'ABCD' ? 'btn-3d' : 'text-[var(--text-secondary)]'
              }`}
            >
              A-B-C-D
            </button>
          </div>
        </div>
      </div>

      {/* Quick Question Count Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
          Hızlı Soru Seçimi:
        </span>
        {[10, 12, 16, 20, 25, 30, 40, 50, 60, 80, 90, 120].map((presetQ) => {
          const isSelected = effectiveQuestionCount === presetQ;
          return (
            <button
              key={presetQ}
              type="button"
              data-testid={`external-qcount-preset-${presetQ}`}
              onClick={() => commitQuestionCount(presetQ)}
              className={`px-2 py-1 rounded-md text-[11px] font-mono-num font-bold cursor-pointer transition-colors ${
                isSelected ? 'btn-3d' : 'surface-alt hover:opacity-85'
              }`}
            >
              {presetQ}
            </button>
          );
        })}
      </div>

      {/* Bulk Import: Camera Photo Capture + Image/PDF + Excel / CSV + Text Split + Derive */}
      <div className="rounded-lg p-3 surface-alt border space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold">
            Cevap Anahtarı Yükleme (Kamera · Görsel/PDF · Excel/CSV · Toplu Metin Ayrıştırma)
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="external-toggle-paste-split-btn"
              onClick={() => setShowPasteSplit((v) => !v)}
              className="text-xs font-bold underline cursor-pointer"
              style={{ color: 'var(--accent-primary)' }}
            >
              {showPasteSplit ? 'Metin Ayrıştırıcıyı Gizle' : 'Metin Yapıştır & A-B/ABCD Ayrıştır'}
            </button>
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-xs font-semibold underline cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showBreakdown ? 'Ders Dağılımını Gizle' : 'Ders Dağılımını Göster'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onTriggerPhotoKeyFile && (
            <>
              <label
                data-testid="external-camera-key-btn"
                className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {photoLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Fotoğraf Okunuyor...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Cevap Anahtarı Resmi Çek</span>
                  </>
                )}
                <input
                  type="file"
                  data-testid="external-camera-key-input"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onTriggerPhotoKeyFile(file, activeBookletCode);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>

              <label
                data-testid="external-photo-pdf-upload-btn"
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Görsel / PDF Dosyası Seç ({activeBookletCode})</span>
                <input
                  type="file"
                  data-testid="external-photo-pdf-upload-input"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onTriggerPhotoKeyFile(file, activeBookletCode);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>
            </>
          )}

          {onOpenRegionEditor && (
            <button
              type="button"
              data-testid="external-open-region-editor-btn"
              onClick={() => onOpenRegionEditor(activeBookletCode)}
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crop className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Manuel Bölge Editörü</span>
            </button>
          )}

          <label
            data-testid="external-excel-upload-btn"
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border"
            style={{ borderColor: '#059669' }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Excel / CSV&apos;den Anahtar Yükle</span>
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
            data-testid="external-excel-template-btn"
            onClick={() =>
              downloadExternalPublisherKeyTemplate({
                gradeProfile,
                questionCount: effectiveQuestionCount,
                publisherName: externalPublisherConfig.publisherName,
              })
            }
            className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Örnek Anahtar Excel (.xlsx)</span>
          </button>

          {bookletMode !== 'A' && (
            <button
              type="button"
              data-testid="external-derive-from-a-btn"
              onClick={handleDeriveFromA}
              className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{bookletMode === 'AB' ? "A'dan B'yi Türet" : "A'dan B-C-D Türet"}</span>
            </button>
          )}
        </div>

        {showPasteSplit && (
          <div
            data-testid="external-paste-split-panel"
            className="surface-card rounded-lg p-3 border space-y-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              A, A-B veya A-B-C-D kitapçık anahtarlarını tek seferde yapıştırın (örn.{' '}
              <code className="font-mono-num">A: 1-A 2-B... B: 1-D 2-C...</code> veya{' '}
              <code className="font-mono-num">1 A B C D</code>); sistem otomatik kitapçıklara ayırır:
            </div>
            <textarea
              rows={3}
              data-testid="external-paste-split-textarea"
              value={pasteRawText}
              onChange={(e) => setPasteRawText(e.target.value)}
              placeholder={'A: ABCDABCD...\nB: DCBADCBA...'}
              className="w-full rounded-lg p-2.5 text-xs font-mono-num surface-alt"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteSplit(false)}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-testid="external-paste-split-apply-btn"
                onClick={handleParseCombinedText}
                className="btn-3d px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ayrıştır &amp; Kitapçıklara Dağıt</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {statusNote && (
        <div className="rounded-lg px-3 py-2 text-xs font-semibold surface-alt flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{statusNote}</span>
        </div>
      )}

      {/* Answer Key Inputs Grid (1 col in Tek A, 2 cols in AB, 4 cols in ABCD) */}
      <div
        className={`grid gap-2.5 ${
          bookletMode === 'A'
            ? 'grid-cols-1'
            : bookletMode === 'AB'
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
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-xs font-extrabold" style={{ color: pal.primaryColor }}>
                  {code} Kitapçığı Cevap Anahtarı
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onTriggerPhotoKeyFile && (
                    <>
                      <label
                        data-testid={`external-card-upload-${code}`}
                        title={`${code} kitapçığı için ekran görüntüsü / görsel / PDF yükle`}
                        className="px-1.5 py-0.5 rounded surface-alt text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                      >
                        <Upload className="w-3 h-3" style={{ color: pal.primaryColor }} aria-hidden="true" />
                        <span>Yükle</span>
                        <input
                          type="file"
                          data-testid={`external-card-upload-input-${code}`}
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onTriggerPhotoKeyFile(file, code);
                            e.target.value = '';
                          }}
                          className="sr-only"
                        />
                      </label>
                      <label
                        data-testid={`external-card-camera-${code}`}
                        title={`${code} kitapçığı için kamera ile resim çek`}
                        className="px-1.5 py-0.5 rounded surface-alt text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                      >
                        <Camera className="w-3 h-3" style={{ color: pal.primaryColor }} aria-hidden="true" />
                        <span>Çek</span>
                        <input
                          type="file"
                          data-testid={`external-card-camera-input-${code}`}
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onTriggerPhotoKeyFile(file, code);
                            e.target.value = '';
                          }}
                          className="sr-only"
                        />
                      </label>
                    </>
                  )}
                  <span
                    className={`text-[11px] font-mono-num font-bold ${
                      isFull ? 'text-emerald-700' : ''
                    }`}
                    style={!isFull ? { color: 'var(--text-secondary)' } : undefined}
                  >
                    {val.length}/{effectiveQuestionCount}
                  </span>
                </div>
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
