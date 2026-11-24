import { ChangeEvent, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import {
  BookletCode,
  BookletDistributionPattern,
  CoverConfig,
  ExamSourceMode,
  ExternalPublisherExamConfig,
  ExternalPublisherExamPreset,
  GradeProfile,
  Institution,
  StudentRecord,
} from '../types/academy';
import {
  BOOKLET_CODES,
  getBookletCycleCodes,
  normalizeBookletNumber,
} from '../utils/bookletDistribution';
import {
  assignBookletPatternToSubmissions,
  buildGoogleFormsSampleCohort,
  downloadGoogleFormsAssignedWorkbook,
  downloadGoogleFormsTemplateWorkbook,
  GoogleFormStudentSubmission,
  normalizePosterGoogleFormUrl,
  parseGoogleFormsSpreadsheetBuffer,
} from '../utils/googleFormsIntegration';

interface GoogleFormsPanelProps {
  institution: Institution;
  gradeProfile: GradeProfile;
  cover: CoverConfig;
  questionsCount: number;
  students: StudentRecord[];
  posterGoogleFormUrl: string;
  onChangePosterGoogleFormUrl: (nextUrl: string) => void;
  examSourceMode: ExamSourceMode;
  onChangeExamSourceMode: (mode: ExamSourceMode) => void;
  externalPublisherConfig: ExternalPublisherExamConfig;
  publisherPresets: ExternalPublisherExamPreset[];
  activePublisherPresetId: string | null;
  onSelectPublisherPreset: (preset: ExternalPublisherExamPreset) => void;
  onApplySubmissionsToInstitution: (params: {
    submissions: GoogleFormStudentSubmission[];
    pattern: BookletDistributionPattern;
    groupByClassroom: boolean;
  }) => void;
  onGenerateGoogleFormsOpticalPdf: (
    submissions: GoogleFormStudentSubmission[]
  ) => Promise<void>;
  onGoToPoster: () => void;
  onGoToOmr: () => void;
  exportBusy: boolean;
  onToast: (msg: string) => void;
}

export function GoogleFormsPanel({
  institution,
  gradeProfile,
  cover,
  questionsCount,
  students,
  posterGoogleFormUrl,
  onChangePosterGoogleFormUrl,
  examSourceMode,
  onChangeExamSourceMode,
  externalPublisherConfig,
  publisherPresets,
  activePublisherPresetId,
  onSelectPublisherPreset,
  onApplySubmissionsToInstitution,
  onGenerateGoogleFormsOpticalPdf,
  onGoToPoster,
  onGoToOmr,
  exportBusy,
  onToast,
}: GoogleFormsPanelProps) {
  const [submissions, setSubmissions] = useState<GoogleFormStudentSubmission[]>([]);
  const [pattern, setPattern] = useState<BookletDistributionPattern>('AB');
  const [groupByClassroom, setGroupByClassroom] = useState<boolean>(true);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const normalizedUrl = useMemo(
    () => normalizePosterGoogleFormUrl(posterGoogleFormUrl),
    [posterGoogleFormUrl]
  );

  const activeCycleCodes = useMemo(() => getBookletCycleCodes(pattern), [pattern]);

  const stats = useMemo(() => {
    const counts: Record<BookletCode, number> = { A: 0, B: 0, C: 0, D: 0 };
    const classes = new Set<string>();
    for (const s of submissions) {
      counts[s.bookletCode] += 1;
      classes.add(s.classroom);
    }
    return { counts, classCount: classes.size };
  }, [submissions]);

  const handlePatternChange = (nextPattern: BookletDistributionPattern) => {
    setPattern(nextPattern);
    if (submissions.length > 0) {
      setSubmissions((prev) =>
        assignBookletPatternToSubmissions(prev, {
          pattern: nextPattern,
          groupByClassroom,
        })
      );
    }
  };

  const handleGroupByClassChange = (nextGroup: boolean) => {
    setGroupByClassroom(nextGroup);
    if (submissions.length > 0) {
      setSubmissions((prev) =>
        assignBookletPatternToSubmissions(prev, {
          pattern,
          groupByClassroom: nextGroup,
        })
      );
    }
  };

  const handleSpreadsheetUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseGoogleFormsSpreadsheetBuffer(buf, {
        institution,
        fallbackGradeId: gradeProfile.id,
        existingStudents: students,
        distributionPattern: pattern,
        groupByClassroom,
      });
      setSubmissions(parsed.submissions);
      setSourceFileName(file.name);
      setWarnings(parsed.warnings);
      onToast(parsed.summaryMessage);
    } catch (err) {
      onToast(
        err instanceof Error
          ? `Google Form Excel okunamadı: ${err.message}`
          : 'Google Form Excel dosyası okunamadı.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadSampleCohort = () => {
    const sample = buildGoogleFormsSampleCohort({
      institution,
      fallbackGradeId: gradeProfile.id,
      pattern,
      groupByClassroom,
    });
    setSubmissions(sample);
    setSourceFileName('5-Aralik-2026-Google-Form-Ornek.xlsx');
    setWarnings([]);
    onToast(
      `5 Aralık 2026 Cumartesi denemesi için ${sample.length} örnek Google Form başvurusu ${
        pattern === 'AB' ? 'A - B' : pattern === 'ABCD' ? 'A - B - C - D' : 'Tek A'
      } düzeniyle yüklendi.`
    );
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(normalizedUrl.href);
      setCopiedLink(true);
      onToast('Afiş Google Form katılım linki panoya kopyalandı.');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast('Link panoya kopyalanamadı; yukarıdaki kutudan seçebilirsiniz.');
    }
  };

  const handleBookletOverride = (rowId: string, nextCode: BookletCode) => {
    setSubmissions((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, bookletCode: nextCode } : row))
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            Google Formlar Excel Yanıt Paneli &amp; Otomatik Optik Üretici
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Afişte paylaştığınız Google Form linkinden gelen Excel/CSV yanıtlarını yükleyin; öğrencilerin adı, soyadı, sınıf/şubesi ve A-B optik kağıtları otomatik oluşsun.
          </p>
        </div>

        <button
          type="button"
          data-testid="gforms-generate-optical-pdf-btn"
          disabled={exportBusy || submissions.length === 0}
          onClick={() => onGenerateGoogleFormsOpticalPdf(submissions)}
          className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span>
            {exportBusy
              ? 'Optikler Hazırlanıyor...'
              : `Otomatik Optik PDF Oluştur (${submissions.length})`}
          </span>
        </button>
      </div>

      {/* Synced Poster Link Card */}
      <section className="surface-card rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">
              01. Afiş Google Form Katılım Linki (5 Aralık 2026 Cumartesi)
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Bu adres 3D Afiş &amp; QR Stüdyosundaki afiş ve QR kod ile doğrudan senkronize çalışır.
            </p>
          </div>
          <button
            type="button"
            data-testid="gforms-go-poster-btn"
            onClick={onGoToPoster}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>3D Afiş &amp; QR&apos;a Git</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            data-testid="gforms-poster-url-input"
            value={posterGoogleFormUrl}
            onChange={(e) => onChangePosterGoogleFormUrl(e.target.value)}
            placeholder="https://forms.gle/... veya https://docs.google.com/forms/d/..."
            className="flex-1 min-w-[240px] rounded-lg px-3 py-2 text-xs font-mono-num surface-alt"
          />
          <button
            type="button"
            onClick={handleCopyUrl}
            className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedLink ? (
              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{copiedLink ? 'Kopyalandı' : 'Linki Kopyala'}</span>
          </button>
          <a
            href={normalizedUrl.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Formu Aç</span>
          </a>
        </div>
      </section>

      {/* Excel Upload + A-B Booklet Pattern + External Publisher Selector */}
      <section className="surface-card rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">
              02. Google Form Yanıt Excel&apos;ini Yükle &amp; A-B Kitapçık Düzenini Seç
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Google Forms → Yanıtlar → Excel / CSV (.xlsx, .csv) çıktısını seçin; Ad, Soyad, Sınıf/Şube ve 8 haneli numara otomatik ayrıştırılır.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              data-testid="gforms-upload-excel-label"
              className="btn-3d px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Google Form Excel / CSV Seç</span>
              <input
                type="file"
                data-testid="gforms-upload-excel-input"
                accept=".xlsx,.xls,.csv"
                onChange={handleSpreadsheetUpload}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              data-testid="gforms-load-sample-btn"
              onClick={handleLoadSampleCohort}
              className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Örnek 5 Aralık Başvurusu Yükle</span>
            </button>

            <button
              type="button"
              data-testid="gforms-download-template-btn"
              onClick={() => downloadGoogleFormsTemplateWorkbook(gradeProfile.id)}
              className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Örnek Form Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Distribution Pattern & Publisher Key Sync */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="space-y-2">
            <div className="text-xs font-bold">Kitapçık Dağılım Düzeni</div>
            <div
              className="grid grid-cols-3 gap-1.5 p-1 rounded-lg surface-alt"
              role="group"
              aria-label="Google Form optik kitapçık düzeni"
            >
              {[
                { id: 'AB' as const, label: 'A - B (2 Kitapçık)' },
                { id: 'ABCD' as const, label: 'A - B - C - D' },
                { id: 'A' as const, label: 'Tek Kitapçık (A)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`gforms-pattern-btn-${opt.id}`}
                  onClick={() => handlePatternChange(opt.id)}
                  className={`px-2.5 py-2 rounded-md text-xs font-bold cursor-pointer ${
                    pattern === opt.id ? 'btn-3d' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                data-testid="gforms-group-by-class-checkbox"
                checked={groupByClassroom}
                onChange={(e) => handleGroupByClassChange(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span>Aynı sınıf / şube içinde sırayla {pattern === 'AB' ? 'A - B' : 'A - B - C - D'} dağıt</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">Deneme &amp; Yayın Cevap Anahtarı Bağlantısı</span>
              <button
                type="button"
                data-testid="gforms-go-omr-publisher-btn"
                onClick={() => {
                  onChangeExamSourceMode('farkli-yayin');
                  onGoToOmr();
                }}
                className="text-xs font-bold underline cursor-pointer"
                style={{ color: 'var(--accent-primary)' }}
              >
                Yayın Anahtarı (Resim Çek / Excel Yükle)
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="gforms-source-mode-select"
                value={examSourceMode}
                onChange={(e) => onChangeExamSourceMode(e.target.value as ExamSourceMode)}
                aria-label="Deneme kaynağı seç"
                className="rounded-lg px-2.5 py-2 text-xs font-semibold surface-alt"
              >
                <option value="kurum">Kurum Denemesi (Otomatik Anahtar)</option>
                <option value="farkli-yayin">Farklı Yayın Denemesi</option>
              </select>

              {examSourceMode === 'farkli-yayin' && (
                <select
                  data-testid="gforms-publisher-preset-select"
                  value={activePublisherPresetId ?? ''}
                  onChange={(e) => {
                    const found = publisherPresets.find((p) => p.id === e.target.value);
                    if (found) onSelectPublisherPreset(found);
                  }}
                  aria-label="Yayın profili seç"
                  className="flex-1 min-w-[180px] rounded-lg px-2.5 py-2 text-xs font-semibold surface-alt"
                >
                  <option value="">
                    {externalPublisherConfig.publisherName
                      ? `Aktif: ${externalPublisherConfig.publisherName}`
                      : 'Yayın Profili Seç'}
                  </option>
                  {publisherPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.publisherName} · {p.gradeId}. Sınıf ({p.bookletMode === 'AB' ? 'A-B' : 'A-B-C-D'})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {examSourceMode === 'farkli-yayin' ? (
                <span>
                  Yayın: <strong className="text-[var(--text-primary)]">{externalPublisherConfig.publisherName || 'Seçilmedi'}</strong>
                  {' · '}A Anahtar: {externalPublisherConfig.answerKeys.A.length}/{questionsCount}
                  {' · '}B Anahtar: {externalPublisherConfig.answerKeys.B.length}/{questionsCount}
                </span>
              ) : (
                <span>
                  Aktif Deneme: <strong className="text-[var(--text-primary)]">{cover.examTitle}</strong> ({questionsCount} soru)
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Preview Table & Batch Optical Actions */}
      <section className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">
              03. Çıkan Öğrenci Listesi &amp; Otomatik Optik Atamaları
            </h3>
            <div className="text-xs mt-0.5 font-mono-num flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
              <span>Toplam: <strong className="text-[var(--text-primary)]">{submissions.length}</strong> öğrenci</span>
              <span aria-hidden="true">·</span>
              <span>Sınıf/Şube: <strong className="text-[var(--text-primary)]">{stats.classCount}</strong></span>
              {activeCycleCodes.map((code) => (
                <span key={code}>
                  <span aria-hidden="true">· </span>
                  {code} Kitapçığı: <strong className="text-[var(--text-primary)]">{stats.counts[code]}</strong>
                </span>
              ))}
              {sourceFileName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Kaynak: {sourceFileName}</span>
                </>
              )}
            </div>
          </div>

          {submissions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="gforms-apply-to-students-btn"
                onClick={() =>
                  onApplySubmissionsToInstitution({
                    submissions,
                    pattern,
                    groupByClassroom,
                  })
                }
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Kurum Öğrencilerine Aktar &amp; Kaydet</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadGoogleFormsAssignedWorkbook(
                    submissions,
                    examSourceMode === 'farkli-yayin'
                      ? externalPublisherConfig.examTitle ||
                          externalPublisherConfig.publisherName ||
                          cover.examTitle
                      : cover.examTitle
                  )
                }
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Dağıtımı Excel İndir</span>
              </button>

              <button
                type="button"
                onClick={onGoToOmr}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Optik Okuma (OMR)</span>
              </button>
            </div>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg p-3 text-xs surface-alt space-y-1">
            {warnings.slice(0, 4).map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {submissions.length === 0 ? (
          <div
            data-testid="gforms-empty-state"
            className="surface-alt rounded-xl p-8 text-center space-y-2"
          >
            <FileSpreadsheet className="w-8 h-8 mx-auto opacity-60" aria-hidden="true" />
            <div className="text-sm font-bold">Henüz Google Form yanıt dosyası yüklenmedi</div>
            <p className="text-xs max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Google Formlar üzerinden gelen Excel / CSV yanıt dosyasını seçtiğinizde tüm öğrencilerin adı, soyadı, sınıfı ve {pattern === 'AB' ? 'A - B' : 'A - B - C - D'} kitapçık optikleri burada otomatik hazırlanır.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th className="py-2 pr-3 font-bold">#</th>
                  <th className="py-2 pr-3 font-bold">Adı</th>
                  <th className="py-2 pr-3 font-bold">Soyadı</th>
                  <th className="py-2 pr-3 font-bold">Sınıf / Şube</th>
                  <th className="py-2 pr-3 font-bold">Düzey</th>
                  <th className="py-2 pr-3 font-bold">Öğrenci No</th>
                  <th className="py-2 pr-3 font-bold">Kitapçık</th>
                  <th className="py-2 pr-3 font-bold">Kitapçık No</th>
                  <th className="py-2 font-bold">Veli Tel</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((row, idx) => (
                  <tr
                    key={row.id}
                    data-testid={`gforms-student-row-${idx}`}
                    className="border-b"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="py-2 pr-3 font-mono-num">{idx + 1}</td>
                    <td className="py-2 pr-3 font-semibold">{row.firstName}</td>
                    <td className="py-2 pr-3 font-semibold">{row.lastName || '—'}</td>
                    <td className="py-2 pr-3 font-mono-num font-bold">{row.classroom}</td>
                    <td className="py-2 pr-3 font-mono-num">{row.gradeId}. Sınıf</td>
                    <td className="py-2 pr-3 font-mono-num">{row.studentNumber8}</td>
                    <td className="py-2 pr-3">
                      <select
                        data-testid={`gforms-row-booklet-select-${idx}`}
                        value={row.bookletCode}
                        onChange={(e) =>
                          handleBookletOverride(row.id, e.target.value as BookletCode)
                        }
                        aria-label={`${row.fullName} kitapçık türü`}
                        className="rounded px-2 py-1 text-xs font-mono-num font-bold surface-alt"
                      >
                        {BOOKLET_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c} Kitapçığı
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 font-mono-num">
                      {normalizeBookletNumber(row.bookletNumber, idx + 1)}
                    </td>
                    <td className="py-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                      {row.parentPhone || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
