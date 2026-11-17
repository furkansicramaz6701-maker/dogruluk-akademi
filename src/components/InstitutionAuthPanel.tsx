import { ShieldCheck, Lock, Unlock, Users, Layers } from 'lucide-react';
import {
  AllowedScopeId,
  AppPermissionKey,
  Institution,
  InstitutionPermissions,
  InstitutionRole,
  StudentRecord,
} from '../types/academy';
import { createDefaultPermissions } from '../utils/institutionCodes';

interface InstitutionAuthPanelProps {
  institutions: Institution[];
  activeInstitution: Institution;
  students: StudentRecord[];
  onSelectInstitution: (inst: Institution) => void;
  onUpdatePermissions: (institutionId: string, permissions: InstitutionPermissions) => void;
}

const SCOPE_OPTIONS: Array<{ id: AllowedScopeId; label: string; desc: string }> = [
  { id: 'ilkokul', label: 'İlkokul (3–4. Sınıf)', desc: '4 şık · 3Y=1D' },
  { id: 'ortaokul', label: 'Ortaokul & LGS (5–8. Sınıf)', desc: '4 şık · 3Y=1D' },
  { id: 'lise', label: 'Lise (9–12. Sınıf)', desc: '5 şık · 4Y=1D' },
  { id: 'yks', label: 'Üniversite Hazırlık (TYT / AYT)', desc: '5 şık · 4Y=1D' },
];

const MODULE_OPTIONS: Array<{ key: AppPermissionKey; label: string }> = [
  { key: 'omrOkuma', label: 'Optik Okuma (OMR)' },
  { key: 'denemeUretici', label: 'Deneme & PDF Üretici' },
  { key: 'dinamikKaynak', label: 'Dinamik Soru Kaynağı & MEB PDF' },
  { key: 'denemeEditoru', label: 'Deneme Editörü' },
  { key: 'egitimTakvimi', label: 'Eğitim Takvimi' },
  { key: 'karnePdf', label: 'Profesyonel Karne PDF' },
  { key: 'excelAktarim', label: 'Excel Yükle / İndir' },
  { key: 'afis3D', label: '3D Afiş Stüdyosu' },
];

const ROLES: InstitutionRole[] = [
  'Kurum Yöneticisi',
  'Ölçme Uzmanı',
  'Öğretmen',
  'Görüntüleyici',
];

export function InstitutionAuthPanel({
  institutions,
  activeInstitution,
  students,
  onSelectInstitution,
  onUpdatePermissions,
}: InstitutionAuthPanelProps) {
  const perms: InstitutionPermissions =
    activeInstitution.permissions ?? createDefaultPermissions();

  const instStudentCount = students.filter(
    (s) => s.institutionId === activeInstitution.id
  ).length;
  const quotaPct = Math.min(
    100,
    Math.round((instStudentCount / Math.max(1, perms.maxStudents)) * 100)
  );

  const patchPerms = (patch: Partial<InstitutionPermissions>) => {
    onUpdatePermissions(activeInstitution.id, { ...perms, ...patch });
  };

  const toggleScope = (scopeId: AllowedScopeId) => {
    const exists = perms.allowedScopes.includes(scopeId);
    const next = exists
      ? perms.allowedScopes.filter((s) => s !== scopeId)
      : [...perms.allowedScopes, scopeId];
    if (next.length === 0) return; // keep at least one authorized grade scope
    patchPerms({ allowedScopes: next });
  };

  const toggleModule = (key: AppPermissionKey) => {
    patchPerms({
      modules: {
        ...perms.modules,
        [key]: !perms.modules[key],
      },
    });
  };

  const handleRoleChange = (role: InstitutionRole) => {
    const preset = createDefaultPermissions(role, perms.allowedScopes);
    onUpdatePermissions(activeInstitution.id, {
      ...preset,
      status: perms.status,
      maxStudents: perms.maxStudents,
    });
  };

  return (
    <section
      aria-labelledby="institution-auth-panel-title"
      data-testid="institution-auth-panel"
      className="surface-card rounded-xl p-5 space-y-5"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h2 id="institution-auth-panel-title" className="text-lg font-bold leading-tight">
              Kurum Yetki Paneli (Rol, Sınıf Kapsamı & Modül İzinleri)
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Her 8 haneli kurum için yetkili sınıf düzeylerini (örn. yalnızca 3–8. sınıf, TYT/AYT gizli), modül izinlerini ve öğrenci kotasını yönetin
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Yetkilendirilecek Kurum"
            value={activeInstitution.id}
            onChange={(e) => {
              const found = institutions.find((i) => i.id === e.target.value);
              if (found) onSelectInstitution(found);
            }}
            className="rounded-lg px-3 py-2 text-xs font-semibold surface-alt"
          >
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.code8})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              patchPerms({ status: perms.status === 'Aktif' ? 'Askıda' : 'Aktif' })
            }
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              perms.status === 'Aktif' ? 'btn-3d' : 'bg-rose-600 text-white'
            }`}
          >
            {perms.status === 'Aktif' ? (
              <>
                <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lisans Aktif</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lisans Askıda</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Role, Quota & Status */}
        <div className="lg:col-span-4 space-y-4">
          <div className="surface-alt rounded-xl p-4 space-y-3">
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Kurum Yetki Rolü</span>
              <select
                value={perms.role}
                onChange={(e) => handleRoleChange(e.target.value as InstitutionRole)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs font-bold surface-card"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Kayıt Kotası</span>
              <input
                type="number"
                min={10}
                max={10000}
                step={10}
                value={perms.maxStudents}
                onChange={(e) =>
                  patchPerms({ maxStudents: Math.max(10, Number(e.target.value) || 100) })
                }
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs font-mono-num surface-card"
              />
            </label>

            <div className="pt-1 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kota Kullanımı</span>
                </span>
                <span className="font-mono-num font-bold">
                  {instStudentCount} / {perms.maxStudents}
                </span>
              </div>
              <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${quotaPct}%`, backgroundColor: 'var(--chart-3)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Authorized Grade Scopes */}
        <div className="lg:col-span-4 surface-alt rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Layers className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span>Yetkili Sınıf Kapsamları (Sınav Filtresi)</span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Örneğin yalnızca İlkokul/Ortaokul seçildiğinde TYT ve AYT seçenekleri kurum arayüzünden otomatik gizlenir.
          </p>

          <div className="space-y-2">
            {SCOPE_OPTIONS.map((opt) => {
              const checked = perms.allowedScopes.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className="surface-card rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(opt.id)}
                      className="rounded accent-blue-600"
                    />
                    <span>{opt.label}</span>
                  </span>
                  <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                    {opt.desc}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Right: 8 Module Permissions */}
        <div className="lg:col-span-4 surface-alt rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold">Modül Erişim Yetkileri ({Object.values(perms.modules).filter(Boolean).length} / 8 Açık)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
            {MODULE_OPTIONS.map((mod) => {
              const enabled = perms.modules[mod.key];
              return (
                <label
                  key={mod.key}
                  className="surface-card rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <span className="font-semibold truncate">{mod.label}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleModule(mod.key)}
                    className="rounded accent-blue-600"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
