import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  UserPlus,
  KeyRound,
  CheckCircle2,
  Users,
  Sparkles,
  AlertCircle,
  FileSpreadsheet,
  FileDown,
  Upload,
  Award,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { GRADE_PROFILES, getGradeProfile } from '../data/curriculum';
import {
  CoverConfig,
  GradeLevelId,
  Institution,
  StudentRecord,
} from '../types/academy';
import {
  defaultClassroomForGrade,
  exportInstitutionsToXlsx,
  exportStudentsToXlsx,
  parseInstitutionsSpreadsheet,
  parseStudentsSpreadsheet,
} from '../utils/excelExport';
import {
  canInstitutionUseModule,
  createDefaultPermissions,
  filterGradeProfilesByInstitution,
  generate8DigitInstitutionCode,
  generate8DigitStudentNumber,
  normalizeInstitutionKey,
} from '../utils/institutionCodes';
import { uint8ArrayToPdfBlob } from '../utils/downloadHelpers';
import {
  generateInstitutionsListPdf,
  generateStudentsListPdf,
  triggerDownload,
} from '../utils/pdfAndZip';

interface InstitutionStudentManagerProps {
  institutions: Institution[];
  activeInstitution: Institution;
  students: StudentRecord[];
  activeStudentNumber8: string;
  activeGradeId: GradeLevelId;
  cover: CoverConfig;
  onSelectInstitution: (inst: Institution) => void;
  onAddInstitution: (inst: Institution) => void;
  onUpdateInstitution: (
    institutionId: string,
    patch: { name: string; city: string; accessPassword?: string }
  ) => { ok: boolean; reason?: string };
  onDeleteInstitution: (institutionId: string) => { ok: boolean; reason?: string };
  onBulkAddInstitutions: (items: Institution[]) => void;
  onAddStudent: (student: StudentRecord) => void;
  onBulkAddStudents: (items: StudentRecord[]) => void;
  onSelectStudent: (student: StudentRecord) => void;
  onDownloadStudentReportPdf: () => Promise<void>;
  isPrivateAdminMode?: boolean;
}

export function InstitutionStudentManager({
  institutions,
  activeInstitution,
  students,
  activeStudentNumber8,
  activeGradeId,
  cover,
  onSelectInstitution,
  onAddInstitution,
  onUpdateInstitution,
  onDeleteInstitution,
  onBulkAddInstitutions,
  onAddStudent,
  onBulkAddStudents,
  onSelectStudent,
  onDownloadStudentReportPdf,
  isPrivateAdminMode = false,
}: InstitutionStudentManagerProps) {
  // 1. Institution Login by 8-digit code
  const [loginCodeInput, setLoginCodeInput] = useState<string>('');
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 1b. Inline Edit & 2-step Delete for active institution
  const [editingInst, setEditingInst] = useState<boolean>(false);
  const [editInstName, setEditInstName] = useState<string>(activeInstitution.name);
  const [editInstCity, setEditInstCity] = useState<string>(activeInstitution.city);
  const [editInstPassword, setEditInstPassword] = useState<string>(
    activeInstitution.accessPassword || '123456'
  );
  const [confirmDeleteInst, setConfirmDeleteInst] = useState<boolean>(false);

  // 2. Manual Institution Creation
  const [newInstName, setNewInstName] = useState<string>('');
  const [newInstCity, setNewInstCity] = useState<string>('');
  const [newInstPassword, setNewInstPassword] = useState<string>('');

  // 3. Manual Student Creation with Grade Level + instant live 8-digit preview
  const [studentNameInput, setStudentNameInput] = useState<string>('');
  const [selectedInstId, setSelectedInstId] = useState<string>(activeInstitution.id);
  const [studentGradeId, setStudentGradeId] = useState<GradeLevelId>(activeGradeId);
  const [classroomInput, setClassroomInput] = useState<string>(() =>
    defaultClassroomForGrade(activeGradeId)
  );
  const [studentPhoneInput, setStudentPhoneInput] = useState<string>('');
  const [studentFeedback, setStudentFeedback] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<boolean>(false);

  const instExcelInputRef = useRef<HTMLInputElement | null>(null);
  const stuExcelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedInstId(activeInstitution.id);
    setEditInstName(activeInstitution.name);
    setEditInstCity(activeInstitution.city);
    setEditInstPassword(activeInstitution.accessPassword || '123456');
    setEditingInst(false);
    setConfirmDeleteInst(false);
    setStudentFeedback(null);
    setLoginError(null);
  }, [activeInstitution.id, activeInstitution.name, activeInstitution.city, activeInstitution.accessPassword]);

  useEffect(() => {
    setStudentGradeId(activeGradeId);
    setClassroomInput(defaultClassroomForGrade(activeGradeId));
  }, [activeGradeId]);

  const selectedInst =
    institutions.find((i) => i.id === selectedInstId) ?? activeInstitution;
  const allowedGradeProfiles = useMemo(
    () => filterGradeProfilesByInstitution(GRADE_PROFILES, selectedInst),
    [selectedInst]
  );
  const selectedStudentGradeProfile = useMemo(
    () => getGradeProfile(studentGradeId),
    [studentGradeId]
  );

  useEffect(() => {
    if (!allowedGradeProfiles.some((g) => g.id === studentGradeId) && allowedGradeProfiles[0]) {
      const nextId = allowedGradeProfiles[0].id;
      setStudentGradeId(nextId);
      setClassroomInput(defaultClassroomForGrade(nextId));
    }
  }, [allowedGradeProfiles, studentGradeId]);

  const existingInstCodes = useMemo(
    () => new Set(institutions.map((i) => i.code8)),
    [institutions]
  );
  const existingStuNumbers = useMemo(
    () => new Set(students.map((s) => s.studentNumber8)),
    [students]
  );

  const duplicateExistingInst = useMemo(() => {
    const key = normalizeInstitutionKey(newInstName);
    if (!key) return null;
    return institutions.find((i) => normalizeInstitutionKey(i.name) === key) ?? null;
  }, [newInstName, institutions]);

  // Live auto-generated 8-digit Institution Code preview when typing a new institution
  const previewNewInstCode = useMemo(
    () =>
      duplicateExistingInst
        ? duplicateExistingInst.code8
        : newInstName.trim()
          ? generate8DigitInstitutionCode(newInstName, existingInstCodes)
          : '--------',
    [newInstName, existingInstCodes, duplicateExistingInst]
  );

  // Live auto-generated 8-digit Student Number as soon as name + institution are selected
  const previewAutoStudentNumber8 = useMemo(() => {
    if (!studentNameInput.trim()) return '--------';
    return generate8DigitStudentNumber(
      studentNameInput,
      selectedInst.code8,
      existingStuNumbers
    );
  }, [studentNameInput, selectedInst.code8, existingStuNumbers]);

  const handleCodeLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginFeedback(null);
    const normalized = loginCodeInput.replace(/\D/g, '').slice(0, 8);
    if (normalized.length !== 8) {
      setLoginError('Lütfen 8 haneli geçerli bir Kurum Kodu girin.');
      return;
    }
    const found = institutions.find((i) => i.code8 === normalized);
    if (!found) {
      setLoginError(`${normalized} koduna kayıtlı kurum bulunamadı. Aşağıdan yeni kurum ekleyebilirsiniz.`);
      return;
    }
    onSelectInstitution(found);
    setSelectedInstId(found.id);
    setLoginFeedback(`${found.name} (${found.code8}) kurum oturumu açıldı.`);
    setLoginCodeInput('');
  };

  const handleCreateInstitution = (e: FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim()) return;
    setLoginError(null);
    const matched = duplicateExistingInst;
    const code8 = matched
      ? matched.code8
      : generate8DigitInstitutionCode(newInstName, existingInstCodes);
    const created: Institution = {
      id: matched ? matched.id : `inst-${Date.now()}`,
      name: newInstName.trim(),
      code8,
      city: newInstCity.trim() || matched?.city || 'Türkiye',
      createdAt: matched?.createdAt || new Date().toLocaleDateString('tr-TR'),
      accessPassword: newInstPassword.trim() || matched?.accessPassword || '123456',
      permissions: matched?.permissions,
    };
    onAddInstitution(created);
    setSelectedInstId(created.id);
    setNewInstName('');
    setNewInstCity('');
    setNewInstPassword('');
    setLoginFeedback(
      matched
        ? `"${created.name}" zaten kayıtlı olduğu için mevcut kurum (${created.code8}) güncellendi; ikinci kopya oluşturulmadı.`
        : `"${created.name}" eklendi! 8 haneli Kurum Kodu: ${created.code8} · Şifre: ${created.accessPassword}`
    );
  };

  const handleSaveEditInstitution = () => {
    setLoginError(null);
    const res = onUpdateInstitution(activeInstitution.id, {
      name: editInstName,
      city: editInstCity,
      accessPassword: editInstPassword,
    });
    if (!res.ok) {
      setLoginError(res.reason || 'Kurum güncellenemedi.');
      return;
    }
    setEditingInst(false);
    setLoginFeedback(`"${editInstName.trim()}" bilgileri ve kurum şifresi güncellendi.`);
  };

  const handleConfirmDeleteInstitution = () => {
    setLoginError(null);
    const deletedName = activeInstitution.name;
    const res = onDeleteInstitution(activeInstitution.id);
    if (!res.ok) {
      setLoginError(res.reason || 'Kurum silinemedi.');
      setConfirmDeleteInst(false);
      return;
    }
    setConfirmDeleteInst(false);
    setLoginFeedback(`"${deletedName}" kurumu listeden silindi.`);
  };

  const handleStudentGradeChange = (nextGrade: GradeLevelId) => {
    setStudentGradeId(nextGrade);
    setClassroomInput(defaultClassroomForGrade(nextGrade));
  };

  const handleCreateStudent = (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const cleanName = studentNameInput.trim();
    if (!cleanName) return;
    const perms = selectedInst.permissions ?? createDefaultPermissions();
    if (perms.status === 'Askıda') {
      setLoginError(`${selectedInst.name} lisansı askıda olduğu için yeni öğrenci eklenemez.`);
      return;
    }
    const currentCount = students.filter((s) => s.institutionId === selectedInst.id).length;
    if (currentCount >= perms.maxStudents) {
      setLoginError(`${selectedInst.name} öğrenci kotası (${perms.maxStudents}) doldu. Kurum Yetki Paneli'nden kotayı artırın.`);
      return;
    }
    const studentNumber8 = generate8DigitStudentNumber(
      cleanName,
      selectedInst.code8,
      existingStuNumbers
    );
    const rec: StudentRecord = {
      id: `stu-${Date.now()}`,
      fullName: cleanName,
      studentNumber8,
      institutionId: selectedInst.id,
      institutionCode8: selectedInst.code8,
      institutionName: selectedInst.name,
      classroom: classroomInput.trim() || defaultClassroomForGrade(studentGradeId),
      gradeId: studentGradeId,
      parentPhone: studentPhoneInput.trim() || undefined,
      createdAt: new Date().toLocaleDateString('tr-TR'),
    };
    onAddStudent(rec);
    const gp = getGradeProfile(rec.gradeId);
    setStudentFeedback(
      `${rec.fullName} kaydedildi! Düzey: ${gp.shortLabel} (${gp.optionCount} şık) · Kurum: ${rec.institutionCode8} · Öğrenci No: ${rec.studentNumber8}`
    );
    setStudentNameInput('');
    setStudentPhoneInput('');
  };

  const handleImportInstitutionsExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoginError(null);
    try {
      const buf = await file.arrayBuffer();
      const imported = parseInstitutionsSpreadsheet(buf, existingInstCodes);
      if (imported.length === 0) {
        setLoginError('Excel dosyasında geçerli "Kurum Adı" sütunu bulunamadı.');
        return;
      }
      onBulkAddInstitutions(imported);
      setLoginFeedback(`${imported.length} kurum Excel'den aktarıldı ve 8 haneli kodları üretildi.`);
    } catch {
      setLoginError('Kurum Excel dosyası okunamadı. Lütfen geçerli bir .xlsx veya .csv seçin.');
    }
  };

  const handleImportStudentsExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoginError(null);
    try {
      const buf = await file.arrayBuffer();
      const imported = parseStudentsSpreadsheet(
        buf,
        selectedInst,
        studentGradeId,
        existingStuNumbers
      );
      if (imported.length === 0) {
        setLoginError('Excel dosyasında geçerli "Adı Soyadı" sütunu bulunamadı.');
        return;
      }
      onBulkAddStudents(imported);
      setStudentFeedback(
        `${imported.length} öğrenci ${selectedInst.name} kurumuna sınıf düzeyleriyle birlikte aktarıldı.`
      );
    } catch {
      setLoginError('Öğrenci Excel dosyası okunamadı. Lütfen geçerli bir .xlsx veya .csv seçin.');
    }
  };

  const handleDownloadInstitutionsPdf = async () => {
    setPdfBusy(true);
    setLoginError(null);
    try {
      const bytes = await generateInstitutionsListPdf(institutions, students, cover);
      const blob = uint8ArrayToPdfBlob(bytes);
      triggerDownload(blob, 'Dogruluk-Akademi-Kurumlar-Listesi.pdf');
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? `Kurumlar PDF indirilemedi: ${err.message}`
          : 'Kurumlar PDF hazırlanırken bir hata oluştu.'
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadStudentsPdf = async () => {
    setPdfBusy(true);
    setLoginError(null);
    try {
      const instStudentsList = students.filter((s) => s.institutionId === activeInstitution.id);
      const listToExport =
        instStudentsList.length > 0 || isPrivateAdminMode ? instStudentsList : students;
      const bytes = await generateStudentsListPdf(listToExport, activeInstitution, cover);
      const blob = uint8ArrayToPdfBlob(bytes);
      triggerDownload(blob, `Ogrenciler-${activeInstitution.code8}.pdf`);
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? `Öğrenciler PDF indirilemedi: ${err.message}`
          : 'Öğrenciler PDF hazırlanırken bir hata oluştu.'
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const instStudents = students.filter((s) => s.institutionId === activeInstitution.id);
  const excelPerm = canInstitutionUseModule(activeInstitution, 'excelAktarim');
  const karnePerm = canInstitutionUseModule(activeInstitution, 'karnePdf');

  return (
    <section
      aria-labelledby="institution-student-manager-title"
      className="surface-card rounded-xl p-5 space-y-5"
    >
      {/* Header + Active Institution Session */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <Building2 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h2 id="institution-student-manager-title" className="text-lg font-bold leading-tight">
              {isPrivateAdminMode
                ? 'Doğruluk Akademi Özel Öğrenci Kayıt & Excel / PDF Merkezi'
                : 'Ayrı Kurum Girişi (8 Hane), Öğrenci Kayıt & Excel / PDF Merkezi'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {isPrivateAdminMode
                ? 'Yalnızca Doğruluk Akademi öğrencilerini yönetin, 8 haneli numara üretin ve Excel / PDF listeleri dışa aktarın.'
                : '3. sınıftan 12. sınıfa ve Üniversite Hazırlık (TYT/AYT) düzeyine kadar her öğrenci kendi müfredatında değerlendirilir; kurum ve öğrenci listelerini Excel/PDF olarak yükleyip indirebilirsiniz.'}
            </p>
          </div>
        </div>

        <div className="surface-alt rounded-lg px-3.5 py-2 text-xs flex items-center gap-3">
          <div>
            <div style={{ color: 'var(--text-secondary)' }}>Aktif Kurum</div>
            <div className="font-bold">{activeInstitution.name}</div>
          </div>
          <div className="border-l pl-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Kurum Kodu (8 Hane)</div>
            <div className="font-mono-num font-extrabold text-sm" style={{ color: 'var(--accent-primary)' }}>
              {activeInstitution.code8}
            </div>
          </div>
        </div>
      </div>

      {loginFeedback && (
        <div className="rounded-lg p-3 text-xs font-semibold flex items-center gap-2 surface-alt">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{loginFeedback}</span>
        </div>
      )}
      {loginError && (
        <div className="rounded-lg p-3 text-xs font-semibold flex items-center gap-2 bg-rose-50 text-rose-800 border border-rose-200">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{loginError}</span>
        </div>
      )}
      {studentFeedback && (
        <div className="rounded-lg p-3 text-xs font-semibold flex items-center gap-2 surface-alt">
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <span>{studentFeedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Kurum Bilgisi (Özel Admin) veya Çoklu Kurum Yönetimi */}
        <div className="lg:col-span-5 space-y-4">
          {isPrivateAdminMode ? (
            <div className="surface-alt rounded-xl p-4 space-y-3" data-testid="private-admin-inst-card">
              <div className="flex items-center justify-between gap-2 text-xs font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                  <span>Doğruluk Akademi Özel Yönetim Alanı</span>
                </span>
                <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                  Kod: {activeInstitution.code8}
                </span>
              </div>
              <div className="surface-card rounded-lg p-3 text-xs space-y-1">
                <div className="font-extrabold text-sm">{activeInstitution.name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  Şehir: {activeInstitution.city} · Durum: {activeInstitution.permissions?.status ?? 'Aktif'}
                </div>
                <div className="text-[11px] pt-1" style={{ color: 'var(--text-secondary)' }}>
                  Bu yönetici paneli yalnızca Doğruluk Akademi için ayrılmıştır; harici okul/kurumlar kendi bağımsız <strong>Kurum Girişi</strong> ekranından yönetilir.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditInstName(activeInstitution.name);
                    setEditInstCity(activeInstitution.city);
                    setEditingInst((v) => !v);
                    setConfirmDeleteInst(false);
                  }}
                  className="btn-3d-secondary flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Doğruluk Akademi Bilgilerini Düzenle</span>
                </button>
              </div>
              {editingInst && (
                <div className="surface-card rounded-lg p-3 space-y-2 border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="text-[11px] font-bold">
                    Kurum Bilgilerini Güncelle ({activeInstitution.code8})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editInstName}
                      onChange={(e) => setEditInstName(e.target.value)}
                      aria-label="Kurum Adını Güncelle"
                      placeholder="Kurum Adı"
                      className="sm:col-span-2 rounded-lg px-2.5 py-1.5 text-xs surface-alt"
                    />
                    <input
                      type="text"
                      value={editInstCity}
                      onChange={(e) => setEditInstCity(e.target.value)}
                      aria-label="Kurum Şehrini Güncelle"
                      placeholder="Şehir"
                      className="rounded-lg px-2.5 py-1.5 text-xs surface-alt"
                    />
                    <input
                      type="text"
                      value={editInstPassword}
                      onChange={(e) => setEditInstPassword(e.target.value)}
                      aria-label="Kurum Şifresini Güncelle"
                      placeholder="Kurum Şifresi"
                      className="sm:col-span-3 rounded-lg px-2.5 py-1.5 text-xs surface-alt font-mono-num"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingInst(false)}
                      className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      <span>Vazgeç</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditInstitution}
                      className="btn-3d px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer"
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Ayrı Kurum Girişi */}
          <form onSubmit={handleCodeLogin} className="surface-alt rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <KeyRound className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>Ayrı Kurum Girişi (8 Haneli Kurum Kodu İle)</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={loginCodeInput}
                onChange={(e) => setLoginCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Örn: 8 haneli kod girin..."
                className="flex-1 rounded-lg px-3 py-2 text-xs surface-card font-mono-num"
              />
              <button
                type="submit"
                className="btn-3d px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Kurum Girişi
              </button>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Veya Kayıtlı Kurumlardan Hızlı Seç</span>
              <select
                value={activeInstitution.id}
                onChange={(e) => {
                  const found = institutions.find((i) => i.id === e.target.value);
                  if (found) {
                    onSelectInstitution(found);
                    setSelectedInstId(found.id);
                    setLoginFeedback(`${found.name} (${found.code8}) kurumuna geçiş yapıldı.`);
                  }
                }}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card"
              >
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} — Kod: {inst.code8} ({inst.city})
                  </option>
                ))}
              </select>
            </label>

            {/* Aktif Kurum Düzenleme ve Silme Çubuğu */}
            <div
              className="pt-2.5 border-t flex flex-wrap items-center gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setEditInstName(activeInstitution.name);
                  setEditInstCity(activeInstitution.city);
                  setEditingInst((v) => !v);
                  setConfirmDeleteInst(false);
                }}
                className="btn-3d-secondary flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kurumu Güncelle</span>
              </button>
              <button
                type="button"
                disabled={institutions.length <= 1}
                title={
                  institutions.length <= 1
                    ? 'Son aktif kurum silinemez'
                    : `${activeInstitution.name} kurumunu sil`
                }
                onClick={() => {
                  setConfirmDeleteInst((v) => !v);
                  setEditingInst(false);
                }}
                className="btn-3d-secondary py-1.5 px-3 rounded-lg text-[11px] font-bold text-rose-600 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kurumu Sil</span>
              </button>
            </div>

            {editingInst && (
              <div className="surface-card rounded-lg p-3 space-y-2 border" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-[11px] font-bold">
                  Aktif Kurumu Düzenle ({activeInstitution.code8})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={editInstName}
                    onChange={(e) => setEditInstName(e.target.value)}
                    aria-label="Kurum Adını Güncelle"
                    placeholder="Kurum Adı"
                    className="sm:col-span-2 rounded-lg px-2.5 py-1.5 text-xs surface-alt"
                  />
                  <input
                    type="text"
                    value={editInstCity}
                    onChange={(e) => setEditInstCity(e.target.value)}
                    aria-label="Kurum Şehrini Güncelle"
                    placeholder="Şehir"
                    className="rounded-lg px-2.5 py-1.5 text-xs surface-alt"
                  />
                  <input
                    type="text"
                    value={editInstPassword}
                    onChange={(e) => setEditInstPassword(e.target.value)}
                    aria-label="Kurum Şifresini Güncelle"
                    placeholder="Kurum Şifresi"
                    className="sm:col-span-3 rounded-lg px-2.5 py-1.5 text-xs surface-alt font-mono-num"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingInst(false)}
                    className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                    <span>Vazgeç</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditInstitution}
                    className="btn-3d px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            )}

            {confirmDeleteInst && (
              <div className="rounded-lg p-3 space-y-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs">
                <div className="font-bold text-rose-800 dark:text-rose-200">
                  "{activeInstitution.name}" kurumunu silmek istediğinize emin misiniz?
                </div>
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Kuruma kayıtlı öğrenciler ve takvim etkinlikleri de temizlenir.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteInst(false)}
                    className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteInstitution}
                    className="px-3 py-1 rounded-md text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                  >
                    Evet, Sil
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Manuel Kurum Ekleme + Excel/PDF İndirme & Yükleme */}
          <form onSubmit={handleCreateInstitution} className="surface-alt rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <span>Manuel Yeni Kurum Ekle (Satış / Lisans)</span>
              </span>
              <span className="font-mono-num" style={{ color: 'var(--chart-3)' }}>
                Kod: {previewNewInstCode}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newInstName}
                onChange={(e) => setNewInstName(e.target.value)}
                placeholder="Kurum Adı (Örn: Yıldız Akademi)"
                aria-label="Yeni Kurum Adı"
                className="sm:col-span-2 rounded-lg px-3 py-2 text-xs surface-card"
              />
              <input
                type="text"
                value={newInstCity}
                onChange={(e) => setNewInstCity(e.target.value)}
                placeholder="Şehir"
                aria-label="Yeni Kurum Şehri"
                className="rounded-lg px-3 py-2 text-xs surface-card"
              />
              <input
                type="text"
                value={newInstPassword}
                onChange={(e) => setNewInstPassword(e.target.value)}
                placeholder="Kurum Giriş Şifresi (varsayılan: 123456)"
                aria-label="Yeni Kurum Giriş Şifresi"
                className="sm:col-span-3 rounded-lg px-3 py-2 text-xs surface-card font-mono-num"
              />
            </div>

            {duplicateExistingInst && (
              <div className="rounded-lg px-3 py-2 text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                "{duplicateExistingInst.name}" ({duplicateExistingInst.code8}) zaten kayıtlı — ikinci kopya açılmaz, mevcut kurum güncellenir.
              </div>
            )}

            <button
              type="submit"
              disabled={!newInstName.trim()}
              className="btn-3d-secondary w-full py-2 px-3 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {duplicateExistingInst
                ? `Mevcut Kurumu Güncelle (${duplicateExistingInst.code8})`
                : 'Kurumu Ekle & 8 Haneli Kurum Kodu Üret'}
            </button>

            <div
              className="pt-2.5 border-t flex flex-wrap gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <input
                ref={instExcelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportInstitutionsExcel}
                className="hidden"
                aria-label="Excel dosyasından kurum yükle"
              />
              <button
                type="button"
                onClick={() => instExcelInputRef.current?.click()}
                className="btn-3d-secondary flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Excel İle Kurum Yükle</span>
              </button>
              <button
                type="button"
                onClick={() => exportInstitutionsToXlsx(institutions, students)}
                className="btn-3d-secondary flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: '#059669' }} aria-hidden="true" />
                <span>Kurumlar Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={handleDownloadInstitutionsPdf}
                className="btn-3d-secondary flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" style={{ color: '#be123c' }} aria-hidden="true" />
                <span>Kurumlar PDF</span>
              </button>
            </div>
          </form>
          </>
          )}
        </div>

        {/* Right: Manuel Öğrenci Ekleme (Sınıf Düzeyi Seçimli) + Öğrenci Listesi + Excel/PDF */}
        <div className="lg:col-span-7 space-y-4">
          <form onSubmit={handleCreateStudent} className="surface-alt rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <UserPlus className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>Manuel Öğrenci Ekle (Sınıf Düzeyi & 8 Hane Otomatik)</span>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {selectedStudentGradeProfile.shortLabel} · {selectedStudentGradeProfile.optionCount} Şık ·{' '}
                {selectedStudentGradeProfile.penaltyDivisor}Y = 1D
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Adı Soyadı</span>
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="Örn: Alihan Sarı"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {isPrivateAdminMode ? 'Özel Kurum' : 'Kurum Seç'}
                </span>
                <select
                  value={isPrivateAdminMode ? activeInstitution.id : selectedInst.id}
                  disabled={isPrivateAdminMode}
                  onChange={(e) => setSelectedInstId(e.target.value)}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card disabled:opacity-80"
                >
                  {(isPrivateAdminMode ? [activeInstitution] : institutions).map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.code8})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf / Sınav Düzeyi</span>
                <select
                  value={studentGradeId}
                  onChange={(e) => handleStudentGradeChange(e.target.value as GradeLevelId)}
                  aria-label="Öğrenci Sınıf veya Sınav Düzeyi"
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card"
                >
                  {allowedGradeProfiles.map((g) => (
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
                  placeholder={defaultClassroomForGrade(studentGradeId)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Veli WhatsApp Tel</span>
                <input
                  type="tel"
                  value={studentPhoneInput}
                  onChange={(e) => setStudentPhoneInput(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  aria-label="Veli WhatsApp Telefonu"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-card font-mono-num"
                />
              </label>
            </div>

            {/* Real-time 8-digit Auto-Code Preview Strip */}
            <div className="surface-card rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Seçilen Kurum Kodu (8 Hane)</div>
                <div className="font-mono-num font-extrabold text-sm mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                  {selectedInst.code8} · {selectedInst.name}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Sistemin Atadığı Öğrenci No (8 Hane)</div>
                <div className="font-mono-num font-extrabold text-sm mt-0.5" style={{ color: 'var(--chart-3)' }}>
                  {previewAutoStudentNumber8}
                  {studentNameInput.trim() ? ` (${studentNameInput.trim()})` : ''}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!studentNameInput.trim()}
              className="btn-3d w-full py-2.5 px-4 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Öğrenciyi Kaydet & {selectedStudentGradeProfile.shortLabel} Düzeyiyle Aktif Seç
            </button>
          </form>

          {/* Registered Students in Active Institution + Excel & PDF Toolbar */}
          <div className="surface-alt rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <span>{activeInstitution.name} — Kayıtlı Öğrenciler ({instStudents.length})</span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>Seçmek için tıklayın (müfredat otomatik değişir)</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={stuExcelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportStudentsExcel}
                className="hidden"
                aria-label="Excel dosyasından öğrenci yükle"
              />
              <button
                type="button"
                disabled={!excelPerm.allowed}
                title={excelPerm.reason}
                onClick={() => stuExcelInputRef.current?.click()}
                className="btn-3d-secondary py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Excel İle Öğrenci Yükle</span>
              </button>
              <button
                type="button"
                disabled={!excelPerm.allowed}
                title={excelPerm.reason}
                onClick={() =>
                  exportStudentsToXlsx(
                    instStudents.length > 0 || isPrivateAdminMode ? instStudents : students,
                    activeInstitution
                  )
                }
                className="btn-3d-secondary py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: '#059669' }} aria-hidden="true" />
                <span>Öğrenciler Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                disabled={pdfBusy || !karnePerm.allowed}
                title={karnePerm.reason}
                onClick={handleDownloadStudentsPdf}
                className="btn-3d-secondary py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
              >
                <FileDown className="w-3.5 h-3.5" style={{ color: '#be123c' }} aria-hidden="true" />
                <span>Öğrenciler PDF</span>
              </button>
              <button
                type="button"
                disabled={pdfBusy || !karnePerm.allowed}
                title={karnePerm.reason}
                onClick={() => {
                  setPdfBusy(true);
                  void onDownloadStudentReportPdf().finally(() => setPdfBusy(false));
                }}
                className="btn-3d py-1.5 px-3 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
              >
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Seçili Öğrenci Karne PDF</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[175px] overflow-y-auto">
              {instStudents.length === 0 ? (
                <div className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
                  Bu kurumda henüz öğrenci yok. Yukarıdan ekleyin veya Excel yükleyin.
                </div>
              ) : (
                instStudents.map((stu) => {
                  const isActive = stu.studentNumber8 === activeStudentNumber8;
                  const stuGradeLabel = getGradeProfile(stu.gradeId).shortLabel;
                  const hasExam = Boolean(stu.lastOmrAnswers && stu.lastOmrAnswers.trim().length > 0);
                  return (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => onSelectStudent(stu)}
                      className={`text-left rounded-lg p-2.5 text-xs transition-all cursor-pointer ${
                        isActive ? 'btn-3d' : 'surface-card hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold truncate">{stu.fullName}</span>
                        <span
                          className="text-[10px] font-semibold shrink-0 opacity-85"
                          style={!isActive ? { color: hasExam ? 'var(--chart-3)' : 'var(--text-secondary)' } : undefined}
                        >
                          {hasExam ? 'Optik Kayıtlı' : 'Deneme Yapılmadı'}
                        </span>
                      </div>
                      <div className="font-mono-num text-[11px] opacity-85 mt-0.5 truncate">
                        {stuGradeLabel} · No: {stu.studentNumber8} · {stu.classroom}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
