import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Camera,
  CheckCircle2,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { GRADE_PROFILES, getGradeProfile } from '../data/curriculum';
import {
  ActiveTab,
  GradeLevelId,
  Institution,
  StudentRecord,
} from '../types/academy';
import { defaultClassroomForGrade } from '../utils/excelExport';
import {
  filterGradeProfilesByInstitution,
  generate8DigitStudentNumber,
} from '../utils/institutionCodes';
import {
  buildStudentRecordForInstitution,
  filterInstitutionStudents,
  getInstitutionQuotaStatus,
} from '../utils/studentPanel';

interface ThreeDotStudentModalProps {
  open: boolean;
  activeInstitution: Institution;
  students: StudentRecord[];
  activeGradeId: GradeLevelId;
  activeStudentNumber8: string;
  onClose: () => void;
  onAddStudent: (student: StudentRecord) => void;
  onSelectStudent: (student: StudentRecord) => void;
  onDeleteStudent: (studentId: string) => void;
  onNavigateModule: (tab: ActiveTab, omrMode?: 'omr' | 'open-ended') => void;
}

export function ThreeDotStudentModal({
  open,
  activeInstitution,
  students,
  activeGradeId,
  activeStudentNumber8,
  onClose,
  onAddStudent,
  onSelectStudent,
  onDeleteStudent,
  onNavigateModule,
}: ThreeDotStudentModalProps) {
  const [fullNameInput, setFullNameInput] = useState('');
  const [gradeIdInput, setGradeIdInput] = useState<GradeLevelId>(activeGradeId);
  const [classroomInput, setClassroomInput] = useState(() =>
    defaultClassroomForGrade(activeGradeId)
  );
  const [phoneInput, setPhoneInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allowedGrades = useMemo(
    () => filterGradeProfilesByInstitution(GRADE_PROFILES, activeInstitution),
    [activeInstitution]
  );

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setConfirmDeleteId(null);
    const validGrade = allowedGrades.some((g) => g.id === activeGradeId)
      ? activeGradeId
      : allowedGrades[0]?.id ?? activeGradeId;
    setGradeIdInput(validGrade);
    setClassroomInput(defaultClassroomForGrade(validGrade));
  }, [open, activeGradeId, allowedGrades]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const instStudents = useMemo(
    () => filterInstitutionStudents(students, activeInstitution.id, ''),
    [students, activeInstitution.id]
  );

  const filteredStudents = useMemo(
    () => filterInstitutionStudents(students, activeInstitution.id, searchQuery),
    [students, activeInstitution.id, searchQuery]
  );

  const quota = useMemo(
    () => getInstitutionQuotaStatus(students, activeInstitution),
    [students, activeInstitution]
  );

  const existingNumbers = useMemo(
    () => new Set(students.map((s) => s.studentNumber8)),
    [students]
  );

  const previewNumber8 = useMemo(() => {
    if (!fullNameInput.trim()) return '--------';
    return generate8DigitStudentNumber(
      fullNameInput,
      activeInstitution.code8,
      existingNumbers
    );
  }, [fullNameInput, activeInstitution.code8, existingNumbers]);

  if (!open) return null;

  const handleGradeChange = (nextGrade: GradeLevelId) => {
    setGradeIdInput(nextGrade);
    setClassroomInput(defaultClassroomForGrade(nextGrade));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormNotice(null);

    const res = buildStudentRecordForInstitution({
      fullName: fullNameInput,
      institution: activeInstitution,
      gradeId: gradeIdInput,
      classroom: classroomInput,
      parentPhone: phoneInput,
      existingStudents: students,
    });

    if (!res.ok || !res.student) {
      setFormError(res.reason || 'Öğrenci eklenemedi.');
      return;
    }

    onAddStudent(res.student);
    setFormNotice(
      `${res.student.fullName} (${res.student.studentNumber8}) eklendi ve aktif seçildi.`
    );
    setFullNameInput('');
    setPhoneInput('');
    setClassroomInput(defaultClassroomForGrade(gradeIdInput));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="three-dot-student-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="three-dot-student-panel-title"
        data-testid="three-dot-student-modal"
        className="surface-card rounded-2xl border shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Modal Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--accent-soft, rgba(37,99,235,0.12))', color: 'var(--accent-primary)' }}
            >
              <Users className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="three-dot-student-panel-title"
                className="text-base sm:text-lg font-extrabold leading-tight truncate"
              >
                Öğrenci Ekleme &amp; Öğrenci Paneli
              </h2>
              <p
                className="text-xs truncate font-mono-num"
                style={{ color: 'var(--text-secondary)' }}
              >
                {activeInstitution.name} · Kod: {activeInstitution.code8} ·{' '}
                {quota.count} / {quota.maxStudents} Öğrenci
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Öğrenci panelini kapat"
            data-testid="three-dot-student-modal-close"
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Kapat</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Quick Add Student Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-5 surface-alt rounded-xl p-4 border space-y-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                <UserPlus
                  className="w-4 h-4"
                  style={{ color: 'var(--accent-primary)' }}
                  aria-hidden="true"
                />
                <span>Hızlı Öğrenci Ekle</span>
              </div>
              <span
                className="text-[11px] font-mono-num font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                8 Haneli Otomatik No
              </span>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-lg px-3 py-2 text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
              >
                {formError}
              </div>
            )}

            {formNotice && (
              <div className="surface-card rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2 border" style={{ borderColor: 'var(--border-subtle)' }}>
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--chart-3)' }}
                  aria-hidden="true"
                />
                <span>{formNotice}</span>
              </div>
            )}

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Adı Soyadı</span>
              <input
                type="text"
                value={fullNameInput}
                onChange={(e) => setFullNameInput(e.target.value)}
                placeholder="Örn: Mert Kaya"
                data-testid="modal-student-name-input"
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card border"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf / Sınav Düzeyi</span>
                <select
                  value={gradeIdInput}
                  onChange={(e) => handleGradeChange(e.target.value as GradeLevelId)}
                  data-testid="modal-student-grade-select"
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {allowedGrades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.shortLabel} ({g.category})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf / Şube</span>
                <input
                  type="text"
                  value={classroomInput}
                  onChange={(e) => setClassroomInput(e.target.value)}
                  placeholder={defaultClassroomForGrade(gradeIdInput)}
                  data-testid="modal-student-classroom-input"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                />
              </label>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Veli WhatsApp Tel (İsteğe Bağlı)</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="05XX XXX XX XX"
                data-testid="modal-student-phone-input"
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card border font-mono-num"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>

            <div
              className="surface-card rounded-lg px-3 py-2.5 border flex items-center justify-between gap-2 text-xs"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Atanacak Öğrenci No</span>
              <span
                className="font-mono-num font-extrabold"
                style={{ color: 'var(--accent-primary)' }}
              >
                {previewNumber8}
              </span>
            </div>

            <button
              type="submit"
              disabled={!fullNameInput.trim() || quota.isSuspended || quota.isAtLimit}
              data-testid="modal-student-submit-btn"
              className="btn-3d w-full py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Öğrenciyi Ekle ve Seç</span>
            </button>
          </form>

          {/* Right: Active Institution Student Panel */}
          <div
            className="lg:col-span-7 surface-alt rounded-xl p-4 border space-y-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold">
                Kurum Öğrenci Paneli ({instStudents.length} Kayıtlı Öğrenci)
              </div>
              <span
                className="text-[11px] font-mono-num"
                style={{ color: 'var(--text-secondary)' }}
              >
                Kalan Kota: {quota.remaining}
              </span>
            </div>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="İsim, 8 haneli no veya şube ara..."
                aria-label="Öğrenci panelinde ara"
                data-testid="modal-student-search-input"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs surface-card border"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </div>

            <div
              className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5"
              data-testid="modal-student-list"
            >
              {filteredStudents.length === 0 ? (
                <div
                  className="surface-card rounded-xl p-5 text-center text-xs space-y-1 border"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {instStudents.length === 0
                      ? 'Bu kurumda henüz kayıtlı öğrenci yok (0 Öğrenci)'
                      : 'Arama kriterine uyan öğrenci bulunamadı'}
                  </div>
                  <p>
                    {instStudents.length === 0
                      ? 'Yeni kurum oluşturulduğunda tüm veriler sıfır başlar. Soldaki formdan öğrenci eklediğinizde liste güncellenir.'
                      : 'Farklı bir isim, şube veya 8 haneli numara deneyin.'}
                  </p>
                </div>
              ) : (
                filteredStudents.map((stu) => {
                  const isActive = stu.studentNumber8 === activeStudentNumber8;
                  const gradeLabel = getGradeProfile(stu.gradeId).shortLabel;
                  const hasExam = Boolean(stu.lastOmrAnswers && stu.lastOmrAnswers.trim().length > 0);
                  const confirmingDelete = confirmDeleteId === stu.id;

                  return (
                    <div
                      key={stu.id}
                      data-testid={`modal-student-row-${stu.studentNumber8}`}
                      className="surface-card rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      style={{
                        borderColor: isActive
                          ? 'var(--accent-primary)'
                          : 'var(--border-subtle)',
                      }}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold leading-snug break-words">
                            {stu.fullName}
                          </span>
                          <span
                            className="text-[11px] font-semibold shrink-0"
                            style={{
                              color: hasExam ? 'var(--chart-3)' : 'var(--text-secondary)',
                            }}
                          >
                            {hasExam ? 'Optik Kayıtlı' : 'Deneme Yapılmadı'}
                          </span>
                        </div>
                        <div
                          className="text-[11px] font-mono-num truncate"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {gradeLabel} · No: {stu.studentNumber8} · {stu.classroom}
                          {stu.parentPhone ? ` · ${stu.parentPhone}` : ''}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectStudent(stu);
                            setFormNotice(`${stu.fullName} aktif öğrenci olarak seçildi.`);
                          }}
                          data-testid={`modal-student-select-${stu.studentNumber8}`}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                            isActive ? 'btn-3d' : 'btn-3d-secondary'
                          }`}
                        >
                          {isActive ? 'Aktif' : 'Seç'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectStudent(stu);
                            onNavigateModule('omr', 'omr');
                            onClose();
                          }}
                          data-testid={`modal-student-omr-${stu.studentNumber8}`}
                          aria-label={`${stu.fullName} için Optik Okumayı aç`}
                          className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Camera className="w-3 h-3" aria-hidden="true" />
                          <span>Optik</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectStudent(stu);
                            onNavigateModule('reports');
                            onClose();
                          }}
                          data-testid={`modal-student-reports-${stu.studentNumber8}`}
                          aria-label={`${stu.fullName} için Karne ve Analizi aç`}
                          className="btn-3d-secondary px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Award className="w-3 h-3" aria-hidden="true" />
                          <span>Karne</span>
                        </button>

                        {confirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteStudent(stu.id);
                                setConfirmDeleteId(null);
                                setFormNotice(`${stu.fullName} listeden silindi.`);
                              }}
                              data-testid={`modal-student-confirm-delete-${stu.studentNumber8}`}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Onayla
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="btn-3d-secondary px-2 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(stu.id)}
                            aria-label={`${stu.fullName} sil`}
                            data-testid={`modal-student-delete-${stu.studentNumber8}`}
                            className="btn-3d-secondary px-2 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 inline-flex items-center whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
