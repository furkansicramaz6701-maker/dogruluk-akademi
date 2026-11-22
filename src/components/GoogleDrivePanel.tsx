import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitBranch,
  HardDriveDownload,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  DriveFileItem,
  deleteGoogleDriveFile,
  downloadGoogleDriveFileBlob,
  ensureDriveFolder,
  listGoogleDriveFiles,
  uploadBlobToGoogleDrive,
} from '../utils/googleDrive';
import { triggerDownload, triggerStaggeredDownloads } from '../utils/pdfAndZip';
import { AppInstallShareCard } from './AppInstallShareCard';
import { DriveConfirmModal } from './DriveConfirmModal';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface DriveUploadPayload {
  fileName: string;
  mimeType: string;
  blob: Blob;
}

interface GoogleDrivePanelProps {
  driveUser: User | null;
  driveToken: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onBuildWeeklyFiles: () => Promise<DriveUploadPayload[]>;
  onBuildFullSystemZipBlob: () => Promise<DriveUploadPayload>;
  onDownloadSourceZip?: () => Promise<void>;
  academyName: string;
  onToast: (msg: string) => void;
}

interface PendingConfirm {
  kind: 'overwrite' | 'delete';
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
}

const GITHUB_SYNC_COMMANDS = [
  'git add .',
  'git commit -m "Dogruluk Akademi guncel arayuz ve PWA gecisi"',
  'git push origin main',
].join('\n');

export function GoogleDrivePanel({
  driveUser,
  driveToken,
  onSignIn,
  onSignOut,
  onBuildWeeklyFiles,
  onBuildFullSystemZipBlob,
  onDownloadSourceZip,
  academyName,
  onToast,
}: GoogleDrivePanelProps) {
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [gitCmdCopied, setGitCmdCopied] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const fetchFiles = useCallback(
    async (queryStr = searchQuery) => {
      if (!driveToken) return;
      setLoadingList(true);
      setErrorMsg(null);
      try {
        const list = await listGoogleDriveFiles(driveToken, queryStr);
        setFiles(list);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Google Drive dosyaları alınırken hata oluştu.'
        );
      } finally {
        setLoadingList(false);
      }
    },
    [driveToken, searchQuery]
  );

  useEffect(() => {
    if (driveToken) {
      void fetchFiles('');
    } else {
      setFiles([]);
    }
  }, [driveToken, fetchFiles]);

  const handleConnect = async () => {
    setAuthBusy(true);
    setErrorMsg(null);
    try {
      await onSignIn();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Google Drive bağlantısı başlatılamadı.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void fetchFiles(searchQuery);
  };

  const performUploadBatch = async (
    payloads: DriveUploadPayload[],
    existingList: DriveFileItem[],
    allowOverwrite: boolean
  ) => {
    if (!driveToken) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const folderId = await ensureDriveFolder(driveToken, 'Doğruluk Akademi Arşivi');
      let savedCount = 0;
      for (const item of payloads) {
        const match = existingList.find((f) => f.name === item.fileName);
        await uploadBlobToGoogleDrive(driveToken, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          blob: item.blob,
          folderId: match && allowOverwrite ? undefined : folderId,
          overwriteFileId: match && allowOverwrite ? match.id : undefined,
        });
        savedCount += 1;
      }
      await fetchFiles(searchQuery);
      onToast(`${savedCount} dosya Google Drive ("Doğruluk Akademi Arşivi") klasörüne kaydedildi.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google Drive yükleme işlemi başarısız oldu.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const requestSavePayloads = async (buildFn: () => Promise<DriveUploadPayload[]>) => {
    if (!driveToken) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const payloads = await buildFn();
      const latestFiles = await listGoogleDriveFiles(driveToken, '');
      const collisions = payloads.filter((p) =>
        latestFiles.some((f) => f.name === p.fileName)
      );

      if (collisions.length > 0) {
        setActionBusy(false);
        setPendingConfirm({
          kind: 'overwrite',
          title: 'Google Drive Üzerindeki Mevcut Dosyalar Güncellensin mi?',
          description: `${collisions.map((c) => c.fileName).join(', ')} adlı ${
            collisions.length
          } dosya Google Drive hesabınızda zaten mevcut. Üzerine yazarak güncellemek istiyor musunuz?`,
          confirmLabel: 'Üzerine Yaz & Kaydet',
          action: async () => {
            await performUploadBatch(payloads, latestFiles, true);
          },
        });
        return;
      }

      await performUploadBatch(payloads, latestFiles, false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Dosyalar hazırlanırken hata oluştu.'
      );
      setActionBusy(false);
    }
  };

  const handleDownloadDriveFileToPc = async (file: DriveFileItem) => {
    if (!driveToken) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const blob = await downloadGoogleDriveFileBlob(driveToken, file.id);
      triggerDownload(blob, file.name);
      onToast(`"${file.name}" bilgisayarınıza indirildi.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : `"${file.name}" indirilemedi. Google Doküman dosyalarını Drive bağlantısından açabilirsiniz.`
      );
    } finally {
      setActionBusy(false);
    }
  };

  const requestDeleteDriveFile = (file: DriveFileItem) => {
    if (!driveToken) return;
    setPendingConfirm({
      kind: 'delete',
      title: 'Google Drive Dosyası Silinsin mi?',
      description: `"${file.name}" dosyası Google Drive hesabınızdan kalıcı olarak kaldırılacaktır. Devam etmek istiyor musunuz?`,
      confirmLabel: 'Evet, Drive’dan Sil',
      action: async () => {
        setActionBusy(true);
        try {
          await deleteGoogleDriveFile(driveToken, file.id);
          await fetchFiles(searchQuery);
          onToast(`"${file.name}" Google Drive'dan silindi.`);
        } finally {
          setActionBusy(false);
        }
      },
    });
  };

  const formatSize = (bytesStr?: string) => {
    const n = Number(bytesStr);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <DriveConfirmModal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Onayla'}
        destructive={pendingConfirm?.kind === 'delete'}
        busy={actionBusy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={async () => {
          const current = pendingConfirm;
          setPendingConfirm(null);
          if (current) {
            await current.action();
          }
        }}
      />

      {/* TELEFON & MASAÜSTÜ UYGULAMA KURULUMU + WHATSAPP PAYLAŞIMI (Yedekleme Seçenekleriyle) */}
      <section aria-labelledby="pc-no-email-install-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Doğruluk Akademi Uygulama İkonu"
              className="w-11 h-11 rounded-xl shrink-0 shadow-md object-cover"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="pc-no-email-install-title" className="text-xl font-bold">
                  Telefona &amp; Bilgisayara Uygulama Kur · WhatsApp’tan Gönder
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  E-posta / Hesap Girmeden
                </span>
              </div>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Doğruluk Akademi ikonuyla telefonunuza ve bilgisayar masaüstünüze kurun, QR veya WhatsApp’tan gönderin. Aşağıdaki Google Drive ve yerel ZIP yedekleme araçları da aktif kalmaya devam eder.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={actionBusy}
            onClick={async () => {
              setActionBusy(true);
              try {
                const filesBatch = await onBuildWeeklyFiles();
                await triggerStaggeredDownloads(filesBatch, 260);
                onToast('Yedek: PDF + Excel + PC HTML dosyaları bilgisayarınıza indirildi.');
              } catch (err) {
                onToast(
                  err instanceof Error
                    ? `Raporlar indirilemedi: ${err.message}`
                    : 'Rapor dosyaları indirilirken bir hata oluştu.'
                );
              } finally {
                setActionBusy(false);
              }
            }}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Raporları PC’ye İndir (Yedek)</span>
          </button>
        </div>

        <AppInstallShareCard
          academyName={academyName}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          onNativeInstall={install}
          onToast={onToast}
        />
      </section>

      {/* GITHUB GÜNCEL DOSYALAR & PWA/VERCEL ARAYÜZ EŞİTLEME */}
      <section
        aria-labelledby="github-sync-card-title"
        className="surface-card rounded-xl p-5 space-y-4"
        data-testid="github-sync-panel"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <GitBranch className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="github-sync-card-title" className="text-base sm:text-lg font-bold">
                GitHub’a Güncel Dosyaları Gönder &amp; Uygulama Eşitleme
              </h2>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Web sitesi ve kurulu mobil/masaüstü uygulama (PWA) aynı arayüzü, aynı manifest yapılandırmasını ve akademi geçiş animasyonunu kullanır. Güncel tüm dosyaları ZIP olarak indirip GitHub deponuza gönderdiğinizde Vercel canlı uygulamanız birebir güncellenir.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={actionBusy}
              data-testid="github-download-source-zip-btn"
              onClick={async () => {
                setActionBusy(true);
                try {
                  if (onDownloadSourceZip) {
                    await onDownloadSourceZip();
                  } else {
                    const resp = await fetch('/api/export/app-zip');
                    if (!resp.ok) throw new Error('Kaynak ZIP indirilemedi');
                    const blob = await resp.blob();
                    triggerDownload(blob, 'Dogruluk-Akademi-Uygulama-Kaynak-Kodu.zip');
                    onToast('Güncel GitHub/Vercel kaynak kod paketi indirildi.');
                  }
                } finally {
                  setActionBusy(false);
                }
              }}
              className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Güncel Kaynak Paketini İndir (.zip)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <div
            className="lg:col-span-7 surface-alt rounded-xl p-3.5 border space-y-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">GitHub Gönderim Komutları (Terminal / Git Bash)</span>
              <button
                type="button"
                data-testid="github-copy-commands-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(GITHUB_SYNC_COMMANDS);
                    setGitCmdCopied(true);
                    onToast('GitHub gönderim komutları panoya kopyalandı.');
                    setTimeout(() => setGitCmdCopied(false), 2200);
                  } catch {
                    setGitCmdCopied(false);
                  }
                }}
                className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                {gitCmdCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                    <span>Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    <span>Komutları Kopyala</span>
                  </>
                )}
              </button>
            </div>
            <pre
              className="text-[11px] font-mono-num overflow-x-auto p-2.5 rounded-lg bg-slate-900 text-slate-100 leading-relaxed"
            >
              {GITHUB_SYNC_COMMANDS}
            </pre>
          </div>

          <div
            className="lg:col-span-5 surface-alt rounded-xl p-3.5 border text-xs space-y-1.5"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
              Kurulu Uygulama &amp; Site Eşitleme Adımları
            </div>
            <div>1. <strong className="font-semibold">Güncel Kaynak Paketini İndir (.zip)</strong> butonuyla güncel dosyaları indirip GitHub repo klasörünüzün üzerine açın.</div>
            <div>2. Soldaki Git komutlarıyla güncellemeyi <span className="font-mono-num">main</span> dalına gönderin.</div>
            <div>3. Vercel otomatik derlediğinde web sitesi ve Android/PC uygulama arayüzü akademi geçişiyle birlikte eşitlenir.</div>
          </div>
        </div>
      </section>

      {/* Top Auth & Optional Google Drive Overview Card */}
      <section className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: 'var(--chart-3)' }}
          >
            <Cloud className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">
                Google Drive Bulut Arşivi
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold surface-alt" style={{ color: 'var(--text-secondary)' }}>
                İsteğe Bağlı
              </span>
            </div>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              İsterseniz Google Drive’a bağlanıp PDF, Excel ve HTML raporlarını bulutta saklayabilirsiniz. Bağlantıyı yanlışlıkla reddettiyseniz aşağıdaki düğmeyle yeniden seçebilirsiniz.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {driveToken && driveUser ? (
            <>
              <div className="surface-alt rounded-xl px-3.5 py-2 text-xs">
                <div className="font-bold">{driveUser.displayName || 'Google Kullanıcısı'}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{driveUser.email}</div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Oturumu Kapat</span>
              </button>
            </>
          ) : (
            <GoogleSignInButton onClick={handleConnect} disabled={authBusy} />
          )}
        </div>
      </section>

      {errorMsg && (
        <div className="surface-card rounded-xl p-4 border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Quick Actions: Upload Weekly Analysis & Download Full PC Package */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="surface-card rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <UploadCloud className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span>Haftalık Liste Analizini Google Drive’a Kaydet</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Aktif kurum (<strong>{academyName}</strong>) için Sıralı Pano PDF’i, KTS-1 vs KTS-2 Excel (.xlsx) dosyası ve herhangi bir bilgisayarda internetsiz açılabilen HTML raporunu doğrudan Google Drive’ınızdaki <strong>Doğruluk Akademi Arşivi</strong> klasörüne yükler.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={!driveToken || actionBusy}
              onClick={() => requestSavePayloads(onBuildWeeklyFiles)}
              className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {actionBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="w-4 h-4" aria-hidden="true" />
              )}
              <span>Haftalık Analizi Drive’a Kaydet (PDF + Excel + PC HTML)</span>
            </button>
          </div>
          {!driveToken && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
              Drive’a kayıt için önce yukarıdaki &quot;Sign in with Google&quot; düğmesiyle Google hesabınızı bağlayın.
            </p>
          )}
        </div>

        <div className="surface-card rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <HardDriveDownload className="w-4 h-4" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
            <span>Tam Sınav & Kitapçık Paketini Drive’a Yedekle / PC’ye İndir</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Kitapçık PDF, Optik Form, 5 Çeşit Karne, Konu Matrisi ve 3D Afiş içeren tam ZIP paketini tek tıkla Drive’a yedekleyin veya doğrudan bilgisayarınıza kaydedin.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={!driveToken || actionBusy}
              onClick={() =>
                requestSavePayloads(async () => [await onBuildFullSystemZipBlob()])
              }
              className="btn-3d-secondary px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" aria-hidden="true" />
              <span>Tam Paketi (ZIP) Drive’a Yedekle</span>
            </button>

            <button
              type="button"
              disabled={actionBusy}
              onClick={async () => {
                setActionBusy(true);
                try {
                  const filesBatch = await onBuildWeeklyFiles();
                  await triggerStaggeredDownloads(filesBatch, 260);
                  onToast('Bilgisayarda açılabilir HTML, PDF ve Excel dosyaları indirildi.');
                } catch (err) {
                  onToast(
                    err instanceof Error
                      ? `Dosyalar indirilemedi: ${err.message}`
                      : 'Dosyalar bilgisayarınıza indirilirken bir hata oluştu.'
                  );
                } finally {
                  setActionBusy(false);
                }
              }}
              className="btn-3d-secondary px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Tümünü Bilgisayara İndir</span>
            </button>
          </div>
        </div>
      </section>

      {/* Drive File Explorer */}
      <section className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h3 className="text-base font-bold">
                Google Drive Dosyalarım ({files.length} Dosya)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Drive’daki tüm dosyalarınıza erişin, tarayıcıda görüntüleyin veya bilgisayarınıza indirin
              </p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
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
                placeholder="Drive’da dosya ara..."
                disabled={!driveToken}
                className="rounded-xl pl-8 pr-3 py-2 text-xs surface-alt min-w-[200px]"
              />
            </div>
            <button
              type="submit"
              disabled={!driveToken || loadingList}
              className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Yenile</span>
            </button>
          </form>
        </div>

        {!driveToken ? (
          <div className="surface-alt rounded-xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold">
              Google Drive dosyalarınızı listelemek ve bilgisayar erişimi için Google hesabınızla oturum açın.
            </p>
            <div className="flex justify-center">
              <GoogleSignInButton onClick={handleConnect} disabled={authBusy} />
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="surface-alt rounded-xl p-8 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            {loadingList
              ? 'Google Drive dosyaları yükleniyor...'
              : 'Arama kriterine uygun dosya bulunamadı. Yukarıdan haftalık analizi Drive’a kaydedebilirsiniz.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th className="text-left py-2.5 px-2 font-semibold">Dosya Adı</th>
                  <th className="text-left py-2.5 px-2 font-semibold">Tür</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Boyut</th>
                  <th className="text-left py-2.5 px-2 font-semibold">Güncelleme</th>
                  <th className="text-right py-2.5 px-2 font-semibold">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isSheet = file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx');
                  return (
                    <tr key={file.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-2.5 px-2 font-bold">
                        <span className="inline-flex items-center gap-2">
                          {isFolder ? (
                            <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                          ) : isSheet ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                          )}
                          <span>{file.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>
                        {isFolder ? 'Klasör' : file.name.split('.').pop()?.toUpperCase() || 'Dosya'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num">
                        {formatSize(file.size)}
                      </td>
                      <td className="py-2.5 px-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                        {file.modifiedTime
                          ? new Date(file.modifiedTime).toLocaleDateString('tr-TR')
                          : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap space-x-1.5">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            <span>Drive’da Aç</span>
                          </a>
                        )}
                        {!isFolder && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleDownloadDriveFileToPc(file)}
                            className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Download className="w-3 h-3" aria-hidden="true" />
                            <span>PC’ye İndir</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => requestDeleteDriveFile(file)}
                          aria-label={`${file.name} dosyasını sil`}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
