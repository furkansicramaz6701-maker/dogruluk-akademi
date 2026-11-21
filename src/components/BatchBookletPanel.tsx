import { useState } from 'react';
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Hash,
  Layers,
  QrCode,
  Shuffle,
  Users,
} from 'lucide-react';
import {
  BookletCode,
  CoverConfig,
  ExamQuestion,
  GradeProfile,
  Institution,
  StudentBookletAssignment,
  StudentRecord,
} from '../types/academy';
import {
  BOOKLET_CODES,
  buildBatchAssignmentsCsv,
  buildBatchBookletAssignments,
  defaultStartBookletNumberForGrade,
  normalizeBookletNumber,
  resolveCoverColorPalette,
} from '../utils/bookletDistribution';
import { triggerDownload } from '../utils/pdfAndZip';
import { getLogoPreset } from '../data/logos';

interface BatchBookletPanelProps {
  institution: Institution;
  gradeProfile: GradeProfile;
  baseQuestions: ExamQuestion[];
  cover: CoverConfig;
  students: StudentRecord[];
  assignments: StudentBookletAssignment[];
  onSetAssignments: (next: StudentBookletAssignment[]) => void;
  onApplyAssignment: (assignment: StudentBookletAssignment) => void;
  onSelectBookletCode: (code: BookletCode) => void;
  onDownloadBookletPdf: () => Promise<void>;
  onDownloadOpticalPdf: () => Promise<void>;
}

export function BatchBookletPanel({
  institution,
  gradeProfile,
  baseQuestions,
  cover,
  students,
  assignments,
  onSetAssignments,
  onApplyAssignment,
  onSelectBookletCode,
  onDownloadBookletPdf,
  onDownloadOpticalPdf,
}: BatchBookletPanelProps) {
  const [batchCount, setBatchCount] = useState<number>(50);
  const [startNumberRaw, setStartNumberRaw] = useState<string>(() =>
    String(defaultStartBookletNumberForGrade(gradeProfile.id)).padStart(6, '0')
  );
  const [startingCode, setStartingCode] = useState<BookletCode>('A');
  const [filterCode, setFilterCode] = useState<'ALL' | BookletCode>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [panelNotice, setPanelNotice] = useState<string | null>(null);

  const preset = getLogoPreset(cover.logoStyleId);

  const handleGenerateBatch = () => {
    const parsedStart = Number(startNumberRaw.replace(/\D/g, ''));
    const next = buildBatchBookletAssignments({
      gradeProfile,
      baseQuestions,
      count: batchCount,
      startBookletNumber:
        Number.isFinite(parsedStart) && parsedStart > 0
          ? parsedStart
          : defaultStartBookletNumberForGrade(gradeProfile.id),
      startingBookletCode: startingCode,
      students,
      institutionId: institution.id,
    });
    onSetAssignments(next);
    if (next[0]) {
      onApplyAssignment(next[0]);
    }
    setPanelNotice(
      `${gradeProfile.shortLabel} için ${next.length} adet A-B-C-D kitapçık ve kişiye özel kitapçık numarası (${next[0]?.bookletNumber} – ${next[next.length - 1]?.bookletNumber}) oluşturuldu.`
    );
  };

  const handleDownloadCsv = () => {
    if (assignments.length === 0) return;
    const csv = buildBatchAssignmentsCsv(assignments, cover.examTitle);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(
      blob,
      `${gradeProfile.id}-Sinif-${assignments.length}-Kitapcik-Numara-Listesi.csv`
    );
    setPanelNotice(`${assignments.length} öğrencilik A-B-C-D kitapçık dağıtım listesi (.CSV) indirildi.`);
  };

  const countsByCode = BOOKLET_CODES.reduce(
    (acc, code) => {
      acc[code] = assignments.filter((a) => a.bookletCode === code).length;
      return acc;
    },
    { A: 0, B: 0, C: 0, D: 0 } as Record<BookletCode, number>
  );

  const visibleAssignments = assignments.filter((a) => {
    if (filterCode !== 'ALL' && a.bookletCode !== filterCode) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLocaleLowerCase('tr-TR');
      return (
        a.studentName.toLocaleLowerCase('tr-TR').includes(q) ||
        a.bookletNumber.includes(q) ||
        a.classroom.toLocaleLowerCase('tr-TR').includes(q)
      );
    }
    return true;
  });

  const activeBookletNo = normalizeBookletNumber(cover.bookletNumber, 1);

  return (
    <section
      aria-labelledby="batch-booklet-title"
      data-testid="batch-booklet-panel"
      className="surface-card rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Layers className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="batch-booklet-title" className="text-base font-bold">
              Sınıf Bazlı Çoklu Deneme & Öğrenci Kitapçık Numarası Dağıtımı (A · B · C · D)
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Örneğin {gradeProfile.shortLabel} için 50 adet A-B-C-D kitapçığı ve her öğrenciye benzersiz 6 haneli Kitapçık No üretin; her kitapçığın rengi, soru sırası, optik kodu ve cevap anahtarı otomatik eşleşir.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Hızlı A B C D Kitapçık Geçişi">
          {BOOKLET_CODES.map((code) => {
            const pal = resolveCoverColorPalette(
              { bookletCode: code, coverColorThemeId: cover.coverColorThemeId ?? 'otomatik-abcd' },
              preset
            );
            const active = cover.bookletCode === code;
            return (
              <button
                key={code}
                type="button"
                data-testid={`batch-quick-code-${code}`}
                onClick={() => onSelectBookletCode(code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all border ${
                  active ? 'text-white shadow-md scale-[1.03]' : 'surface-alt'
                }`}
                style={
                  active
                    ? { backgroundColor: pal.primaryColor, borderColor: pal.goldColor }
                    : { borderColor: pal.primaryColor, color: pal.primaryColor }
                }
              >
                {code} Kitapçığı
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Row */}
      <div className="surface-alt rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <label className="block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Oluşturulacak Deneme / Öğrenci Adedi</span>
          <div className="mt-1 flex gap-1.5">
            <select
              value={[20, 30, 50, 60, 100].includes(batchCount) ? batchCount : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom') setBatchCount(Number(e.target.value));
              }}
              aria-label="Hazır deneme adedi seçimi"
              data-testid="batch-count-select"
              className="flex-1 rounded-lg px-2.5 py-2 text-xs surface-card font-bold"
            >
              <option value={20}>20 Adet (1 Şube)</option>
              <option value={30}>30 Adet (Tek Sınıf)</option>
              <option value={50}>50 Adet (Sınıf Bazlı Paket)</option>
              <option value={60}>60 Adet (2 Şube)</option>
              <option value={100}>100 Adet (Tüm Düzey)</option>
              {![20, 30, 50, 60, 100].includes(batchCount) && (
                <option value="custom">Özel: {batchCount} Adet</option>
              )}
            </select>
            <input
              type="number"
              min={1}
              max={200}
              value={batchCount}
              onChange={(e) => setBatchCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              aria-label="Özel kitapçık adedi"
              className="w-16 rounded-lg px-2 py-2 text-xs font-mono-num font-bold surface-card text-center"
            />
          </div>
        </label>

        <label className="block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Başlangıç Kitapçık No (6 Hane)</span>
          <div className="mt-1 relative">
            <Hash
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-secondary)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              maxLength={6}
              value={startNumberRaw}
              onChange={(e) => setStartNumberRaw(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="batch-start-number-input"
              placeholder="050001"
              className="w-full rounded-lg pl-8 pr-2.5 py-2 text-xs font-mono-num font-bold surface-card"
            />
          </div>
        </label>

        <label className="block text-xs font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Başlangıç Kitapçık Türü</span>
          <select
            value={startingCode}
            onChange={(e) => setStartingCode(e.target.value as BookletCode)}
            className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card font-bold"
          >
            <option value="A">A → B → C → D Sıralı</option>
            <option value="B">B → C → D → A Sıralı</option>
            <option value="C">C → D → A → B Sıralı</option>
            <option value="D">D → A → B → C Sıralı</option>
          </select>
        </label>

        <button
          type="button"
          onClick={handleGenerateBatch}
          data-testid="generate-batch-booklets-btn"
          className="btn-3d py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Shuffle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{batchCount} Adet A-B-C-D Kitapçık &amp; No Oluştur</span>
        </button>
      </div>

      {panelNotice && (
        <div className="rounded-lg px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 surface-alt">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{panelNotice}</span>
        </div>
      )}

      {assignments.length > 0 && (
        <div className="space-y-3">
          {/* Distribution Summary + Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="surface-alt px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>Toplam: {assignments.length} Kitapçık</span>
              </span>
              {BOOKLET_CODES.map((code) => {
                const pal = resolveCoverColorPalette(
                  { bookletCode: code, coverColorThemeId: 'otomatik-abcd' },
                  preset
                );
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setFilterCode((prev) => (prev === code ? 'ALL' : code))}
                    className={`px-2.5 py-1.5 rounded-lg font-mono-num font-bold border cursor-pointer ${
                      filterCode === code ? 'text-white' : 'surface-alt'
                    }`}
                    style={
                      filterCode === code
                        ? { backgroundColor: pal.primaryColor, borderColor: pal.primaryColor }
                        : { borderColor: pal.primaryColor, color: pal.primaryColor }
                    }
                  >
                    {code}: {countsByCode[code]} Adet
                  </button>
                );
              })}
              {filterCode !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilterCode('ALL')}
                  className="text-xs underline font-semibold cursor-pointer"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Tümünü Göster
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Öğrenci veya Kitapçık No ara..."
                className="rounded-lg px-2.5 py-1.5 text-xs surface-alt w-48"
              />
              <button
                type="button"
                onClick={handleDownloadCsv}
                data-testid="download-batch-csv-btn"
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Dağıtım Listesi (.CSV)</span>
              </button>
              <button
                type="button"
                onClick={onDownloadBookletPdf}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Seçili ({cover.bookletCode} #{activeBookletNo}) PDF</span>
              </button>
              <button
                type="button"
                onClick={onDownloadOpticalPdf}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Seçili Optik PDF</span>
              </button>
            </div>
          </div>

          {/* Roster Table */}
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
            <table className="w-full text-left text-xs border-collapse" data-testid="batch-booklet-table">
              <thead className="surface-alt sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 font-bold">Sıra</th>
                  <th className="px-3 py-2 font-bold">Öğrenci Adı Soyadı</th>
                  <th className="px-3 py-2 font-bold">Sınıf</th>
                  <th className="px-3 py-2 font-bold">Kitapçık</th>
                  <th className="px-3 py-2 font-bold">Kitapçık No</th>
                  <th className="px-3 py-2 font-bold">Otomatik Cevap Anahtarı</th>
                  <th className="px-3 py-2 font-bold text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssignments.map((row) => {
                  const isActiveRow =
                    cover.bookletCode === row.bookletCode &&
                    activeBookletNo === row.bookletNumber;
                  const pal = resolveCoverColorPalette(
                    { bookletCode: row.bookletCode, coverColorThemeId: 'otomatik-abcd' },
                    preset
                  );
                  return (
                    <tr
                      key={`${row.index}-${row.bookletNumber}`}
                      data-testid={`batch-row-${row.index}`}
                      className={`border-t transition-colors ${
                        isActiveRow ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                      }`}
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="px-3 py-2 font-mono-num font-bold">#{row.index}</td>
                      <td className="px-3 py-2 font-semibold">
                        <div>{row.studentName}</div>
                        <div className="text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                          Öğr No: {row.studentNumber8}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-semibold">{row.classroom}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded font-display font-extrabold text-white"
                          style={{ backgroundColor: pal.primaryColor }}
                        >
                          {row.bookletCode}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono-num font-bold">{row.bookletNumber}</td>
                      <td className="px-3 py-2 font-mono-num text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {row.answerKey.slice(0, 14)}
                        {row.answerKey.length > 14 ? '…' : ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          data-testid={`apply-batch-row-${row.index}`}
                          onClick={() => onApplyAssignment(row)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            isActiveRow ? 'btn-3d' : 'btn-3d-secondary'
                          }`}
                        >
                          {isActiveRow ? 'Aktif Seçili' : 'Seç ve Uygula'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
