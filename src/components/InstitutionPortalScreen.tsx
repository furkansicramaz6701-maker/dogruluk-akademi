import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
} from 'lucide-react';
import {
  Institution,
  LogoStyleId,
  StudentRecord,
} from '../types/academy';
import { buildInstitutionLogoProfile, getLogoPreset } from '../data/logos';
import {
  DEFAULT_INSTITUTION_PASSWORD,
  authenticateInstitution,
  createDefaultPermissions,
  generate8DigitInstitutionCode,
  normalizeInstitutionKey,
  resolvePrimaryAdminInstitution,
} from '../utils/institutionCodes';
import { Logo3D } from './Logo3D';

interface InstitutionPortalScreenProps {
  institutions: Institution[];
  activeInstitution: Institution;
  students: StudentRecord[];
  activeLogoId: LogoStyleId;
  onEnterInstitution: (inst: Institution, mode: 'admin' | 'password' | 'preview') => void;
  onCreateAndEnterInstitution: (inst: Institution) => void;
}

const SCOPE_LABELS: Record<string, string> = {
  ilkokul: 'İlkokul',
  ortaokul: 'Ortaokul & LGS',
  lise: 'Lise',
  yks: 'YKS',
};

export function InstitutionPortalScreen({
  institutions,
  activeInstitution,
  students,
  activeLogoId,
  onEnterInstitution,
  onCreateAndEnterInstitution,
}: InstitutionPortalScreenProps) {
  const [portalMode, setPortalMode] = useState<'institution' | 'admin'>('institution');
  const [selectedId, setSelectedId] = useState<string>(activeInstitution.id);
  const selectedInst = useMemo(
    () => institutions.find((i) => i.id === selectedId) ?? institutions[0] ?? activeInstitution,
    [institutions, selectedId, activeInstitution]
  );

  const [codeInput, setCodeInput] = useState<string>(selectedInst.code8);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newCity, setNewCity] = useState<string>('İstanbul');
  const [newPassword, setNewPassword] = useState<string>('');

  const preset = getLogoPreset(activeLogoId);
  const primaryAdminInst = useMemo(
    () => resolvePrimaryAdminInstitution(institutions),
    [institutions]
  );
  const existingCodes = useMemo(() => new Set(institutions.map((i) => i.code8)), [institutions]);

  const duplicateExisting = useMemo(() => {
    const key = normalizeInstitutionKey(newName);
    if (!key) return null;
    return institutions.find((i) => normalizeInstitutionKey(i.name) === key) ?? null;
  }, [newName, institutions]);

  const previewNewCode = useMemo(
    () =>
      duplicateExisting
        ? duplicateExisting.code8
        : newName.trim()
          ? generate8DigitInstitutionCode(newName, existingCodes)
          : '--------',
    [newName, existingCodes, duplicateExisting]
  );

  // Kurum girişinin başında seçili veya oluşturulan kurumun adı ve otomatik logosu gösterilir
  const liveInstitutionHeaderName = useMemo(() => {
    if (createOpen && newName.trim()) return newName.trim();
    return selectedInst.name;
  }, [createOpen, newName, selectedInst.name]);

  const liveInstitutionHeaderCode = useMemo(() => {
    if (createOpen && newName.trim()) return previewNewCode;
    return selectedInst.code8;
  }, [createOpen, newName, previewNewCode, selectedInst.code8]);

  const liveInstitutionLogoProfile = useMemo(
    () => buildInstitutionLogoProfile(liveInstitutionHeaderName),
    [liveInstitutionHeaderName]
  );

  const newInstitutionLogoProfile = useMemo(
    () => buildInstitutionLogoProfile(newName.trim() || 'Yeni Kurum'),
    [newName]
  );

  const handleSelectCard = (inst: Institution) => {
    setSelectedId(inst.id);
    setCodeInput(inst.code8);
    setAuthError(null);
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = authenticateInstitution(institutions, codeInput, passwordInput);
    if (!res.ok || !res.institution) {
      setAuthError(res.reason || 'Kurum kodu veya şifre doğrulanamadı.');
      return;
    }
    onEnterInstitution(res.institution, 'password');
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      setAuthError('Lütfen yeni kurum adını yazın.');
      return;
    }
    const finalInst: Institution = duplicateExisting
      ? {
          ...duplicateExisting,
          city: newCity.trim() || duplicateExisting.city,
          accessPassword: newPassword.trim() || duplicateExisting.accessPassword || DEFAULT_INSTITUTION_PASSWORD,
        }
      : {
          id: `inst-${Date.now()}`,
          name: cleanName,
          code8: generate8DigitInstitutionCode(cleanName, existingCodes),
          city: newCity.trim() || 'Türkiye',
          createdAt: new Date().toISOString().slice(0, 10),
          accessPassword: newPassword.trim() || DEFAULT_INSTITUTION_PASSWORD,
          permissions: createDefaultPermissions('Kurum Yöneticisi', [
            'ilkokul',
            'ortaokul',
            'lise',
            'yks',
          ]),
        };
    onCreateAndEnterInstitution(finalInst);
  };

  const expectedPreviewPass = selectedInst.accessPassword || DEFAULT_INSTITUTION_PASSWORD;

  return (
    <div
      data-testid="institution-portal-screen"
      className="min-h-screen flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-10 relative"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      <div className="max-w-5xl w-full mx-auto space-y-5 my-auto">
        {/* Top Portal Mode Bar: Kurum Girişi vs Şifresiz Yönetici Girişi */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Giriş Türü Seçimi"
            className="surface-card rounded-2xl p-1.5 inline-flex items-center gap-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={portalMode === 'institution'}
              onClick={() => {
                setPortalMode('institution');
                setAuthError(null);
              }}
              data-testid="portal-mode-institution"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                portalMode === 'institution' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Kurum Girişi</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={portalMode === 'admin'}
              onClick={() => {
                setPortalMode('admin');
                setAuthError(null);
              }}
              data-testid="portal-mode-admin"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                portalMode === 'admin' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Yönetici Girişi (Şifresiz Ana Panel)</span>
            </button>
          </div>

          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Doğruluk Akademi · Çoklu Kurum & Şifresiz Yönetici Ana Paneli
          </div>
        </div>

        {/* Dynamic Brand Header: Kurum Girişinde başında kurum ismi yazar ve kuruma ait logo oluşur */}
        <header className="surface-card rounded-2xl p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div data-testid="portal-header-logo" className="shrink-0">
              {portalMode === 'institution' ? (
                <Logo3D
                  size="md"
                  variant={activeLogoId}
                  institutionName={liveInstitutionHeaderName}
                />
              ) : (
                <Logo3D size="md" variant={activeLogoId} />
              )}
            </div>
            <div className="min-w-0">
              <div
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--accent-primary)' }}
              >
                {portalMode === 'institution'
                  ? `Kurum Girişi · Otomatik Kurum Logosu (${liveInstitutionLogoProfile.initials}) · Kod: ${liveInstitutionHeaderCode}`
                  : 'Doğruluk Akademi · Yönetici Ana Panel Girişi (Şifre İstemez)'}
              </div>
              <h1
                data-testid="portal-header-title"
                className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mt-0.5 truncate"
              >
                {portalMode === 'institution'
                  ? liveInstitutionHeaderName
                  : `${preset.headerTitle} — Yönetici Ana Paneli`}
              </h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {portalMode === 'institution'
                  ? 'Kurum girişinin başında seçili kurum adı ve kuruma özel oluşturulan 3D logo yer alır. Kurum kodu ve şifresiyle kendi alanınızı açın.'
                  : 'Doğruluk Akademi Ana Yönetici paneline giriş için şifre sorulmaz. Tek tıkla tüm modülleri ve kurumları yönetebilirsiniz.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {portalMode === 'institution' && (
              <button
                type="button"
                onClick={() => onEnterInstitution(primaryAdminInst, 'admin')}
                data-testid="portal-admin-enter-btn"
                className="btn-3d px-4 py-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Unlock className="w-4 h-4" aria-hidden="true" />
                <span>Doğruluk Akademi Yönetici Paneli (Şifresiz)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onEnterInstitution(selectedInst, 'preview')}
              data-testid="portal-preview-enter-btn"
              className="btn-3d-secondary px-4 py-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>Önizleme İle Gir</span>
            </button>
          </div>
        </header>

        {portalMode === 'admin' ? (
          /* Yönetici Ana Paneli — Şifresiz Giriş Görünümü */
          <section
            aria-labelledby="portal-admin-title"
            className="surface-card rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
          >
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--chart-3)' }}>
                <Unlock className="w-4 h-4" aria-hidden="true" />
                <span>Şifre Gerektirmeyen Ana Panel Girişi</span>
              </div>
              <h2 id="portal-admin-title" className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Doğruluk Akademi Özel Yönetici Paneli
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Bu giriş yalnızca <strong>Doğruluk Akademi</strong> yönetim ekibine özeldir (parola istemez). Diğer okullar ve dış kurumlar sol sekmedeki <strong>Kurum Girişi</strong> alanından kendi kurum kodu ve şifresiyle ayrı oturum açar.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Özel Panel Kurumu: <strong>{primaryAdminInst.name}</strong></span>
                <span>·</span>
                <span className="font-mono-num">Kod: <strong>{primaryAdminInst.code8}</strong></span>
              </div>
            </div>

            <div className="lg:col-span-5 surface-alt rounded-2xl p-5 space-y-4 border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <Logo3D size="sm" variant={activeLogoId} />
                <div>
                  <div className="text-sm font-extrabold">{preset.headerTitle}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Doğruluk Akademi Özel Yönetici Paneli · Şifresiz
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEnterInstitution(primaryAdminInst, 'admin')}
                data-testid="portal-admin-enter-btn"
                className="btn-3d w-full py-3.5 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4" aria-hidden="true" />
                <span>Doğruluk Akademi Özel Paneline Gir</span>
              </button>
              <button
                type="button"
                onClick={() => setPortalMode('institution')}
                className="btn-3d-secondary w-full py-2.5 px-4 rounded-xl text-xs font-bold cursor-pointer"
              >
                Diğer Kurumlar İçin Kurum Girişine Geç
              </button>
            </div>
          </section>
        ) : (
          /* Kurum Girişi Görünümü */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Institution Picker */}
            <section
              aria-labelledby="portal-inst-list-title"
              className="lg:col-span-7 surface-card rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                  <div>
                    <h2 id="portal-inst-list-title" className="text-base sm:text-lg font-bold">
                      Kurum Seçimi ({institutions.length} Kayıtlı Kurum)
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Kurum seçildiğinde başta kurum adı yazılır ve o kuruma özgü 3D logo üretilir
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen((v) => !v);
                    setAuthError(null);
                  }}
                  data-testid="portal-create-inst-toggle"
                  className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Yeni Kurum Oluştur</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="portal-institution-cards">
                {institutions.map((inst) => {
                  const isSelected = inst.id === selectedInst.id;
                  const instStudentCount = students.filter(
                    (s) => s.institutionId === inst.id
                  ).length;
                  const scopes = (inst.permissions?.allowedScopes ?? ['ilkokul', 'ortaokul', 'lise', 'yks'])
                    .map((s) => SCOPE_LABELS[s] || s)
                    .join(' · ');
                  const isSuspended = inst.permissions?.status === 'Askıda';
                  const instLogo = buildInstitutionLogoProfile(inst.name);

                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => handleSelectCard(inst)}
                      data-testid={`portal-inst-card-${inst.code8}`}
                      aria-pressed={isSelected}
                      className={`text-left rounded-xl p-4 transition-all cursor-pointer border-2 space-y-2.5 ${
                        isSelected
                          ? 'surface-alt shadow-md'
                          : 'surface-card hover:opacity-95'
                      }`}
                      style={{
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Logo3D
                            size="sm"
                            variant={activeLogoId}
                            institutionName={inst.name}
                            animated={false}
                            interactive={false}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{inst.name}</div>
                            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                              {inst.city} · Logo: {instLogo.initials}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--accent-primary)' }}
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      <div
                        className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <span className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
                          Kod: {inst.code8}
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                          <Users className="w-3 h-3" aria-hidden="true" />
                          <span>{instStudentCount} Öğrenci</span>
                        </span>
                      </div>

                      <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {isSuspended ? 'Durum: Askıda' : scopes}
                      </div>
                    </button>
                  );
                })}
              </div>

              {createOpen && (
                <form
                  onSubmit={handleCreateSubmit}
                  data-testid="portal-create-inst-form"
                  className="surface-alt rounded-xl p-4 space-y-3 border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    <span>Yeni Kurum Kaydı & Kuruma Özel Otomatik Logo</span>
                    <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                      Otomatik Kod: {previewNewCode}
                    </span>
                  </div>

                  {/* Live Generated Logo Preview for New Institution */}
                  <div className="surface-card rounded-xl p-3 flex items-center gap-3">
                    <Logo3D
                      size="sm"
                      variant={activeLogoId}
                      institutionName={newName.trim() || 'Yeni Kurum'}
                      animated={false}
                      interactive={false}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">
                        {newName.trim() || 'Yeni Kurum Adı Yazın'}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Kuruma Özel Logo Monogramı: <strong>{newInstitutionLogoProfile.initials}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Kurum Adı (Örn: Yıldız Koleji)"
                      aria-label="Yeni Kurum Adı"
                      className="sm:col-span-2 rounded-lg px-3 py-2.5 text-xs surface-card"
                    />
                    <input
                      type="text"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="Şehir"
                      aria-label="Yeni Kurum Şehri"
                      className="rounded-lg px-3 py-2.5 text-xs surface-card"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={`Kurum Şifresi (boş bırakılırsa ${DEFAULT_INSTITUTION_PASSWORD})`}
                      aria-label="Yeni Kurum Şifresi"
                      className="rounded-lg px-3 py-2.5 text-xs surface-card font-mono-num"
                    />
                    <button
                      type="submit"
                      className="btn-3d py-2.5 px-4 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Kurumu Oluştur & Logosuyla Gir
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Right: Institution Code + Password Login Box */}
            <section
              aria-labelledby="portal-login-title"
              className="lg:col-span-5 surface-card rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <Logo3D
                  size="sm"
                  variant={activeLogoId}
                  institutionName={selectedInst.name}
                  animated={false}
                  interactive={false}
                />
                <div className="min-w-0">
                  <h2 id="portal-login-title" className="text-base sm:text-lg font-bold truncate">
                    {selectedInst.name}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Kurum Kodu ve Şifre İle Kurum Girişi
                  </p>
                </div>
              </div>

              {authError && (
                <div
                  role="alert"
                  data-testid="portal-auth-error"
                  className="rounded-xl p-3 text-xs font-semibold flex items-start gap-2 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                <label className="block text-xs font-semibold">
                  <span style={{ color: 'var(--text-secondary)' }}>Kurum Kodu (8 Haneli)</span>
                  <div className="relative mt-1">
                    <KeyRound
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-secondary)' }}
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      maxLength={8}
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                      data-testid="portal-code-input"
                      placeholder="8 haneli kurum kodu"
                      className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono-num font-bold surface-alt"
                    />
                  </div>
                </label>

                <label className="block text-xs font-semibold">
                  <span style={{ color: 'var(--text-secondary)' }}>Kurum Şifresi</span>
                  <div className="relative mt-1">
                    <Lock
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-secondary)' }}
                      aria-hidden="true"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      data-testid="portal-password-input"
                      placeholder="Kurum şifresini girin"
                      className="w-full rounded-xl pl-9 pr-10 py-2.5 text-sm surface-alt"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </label>

                <div className="surface-alt rounded-xl px-3 py-2.5 text-[11px] flex items-center justify-between gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Önizleme için seçili kurum şifresi:
                  </span>
                  <button
                    type="button"
                    onClick={() => setPasswordInput(expectedPreviewPass)}
                    data-testid="portal-fill-preview-pass-btn"
                    className="font-mono-num font-bold underline cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {expectedPreviewPass} (Doldur)
                  </button>
                </div>

                <button
                  type="submit"
                  data-testid="portal-login-submit-btn"
                  className="btn-3d w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer"
                >
                  {selectedInst.name} Alanına Giriş Yap
                </button>
              </form>

              <div
                className="pt-3 border-t text-[11px] leading-relaxed flex items-start gap-2"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                <span>
                  Ana yönetici girişi için şifre gerekmez; yukarıdaki <strong>Yönetici Girişi · Ana Panel (Şifresiz)</strong> butonunu kullanabilirsiniz.
                </span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
