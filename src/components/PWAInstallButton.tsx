import { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { AppInstallShareCard } from './AppInstallShareCard';

interface PWAInstallButtonProps {
  compact?: boolean;
  academyName?: string;
  onOpenFullGuide?: () => void;
  onToast?: (msg: string) => void;
}

export function PWAInstallButton({
  compact = false,
  academyName = 'Doğruluk Akademi',
  onOpenFullGuide,
  onToast,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('install') === '1') {
      setShowGuideModal(true);
    }
  }, []);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuideModal(true)}
        className={`btn-3d-secondary whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer font-bold rounded-xl ${
          compact ? 'px-2.5 sm:px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
        title="Telefon ve bilgisayara Doğruluk Akademi ikonuyla kur veya WhatsApp’tan gönder"
      >
        <img
          src="/pwa-192x192.png"
          alt=""
          aria-hidden="true"
          className="w-4 h-4 rounded-md shrink-0 object-cover"
        />
        <span>{compact ? 'Uygulamayı Kur' : 'Telefona & Masaüstüne Kur'}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
        >
          <div className="surface-card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="Doğruluk Akademi İkonu"
                  className="w-11 h-11 rounded-xl shadow-md shrink-0 object-cover"
                />
                <div>
                  <h3 id="pwa-install-guide-title" className="text-base sm:text-lg font-bold">
                    Telefon &amp; Masaüstü Uygulama Kurulumu ve WhatsApp Paylaşımı
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Doğruluk Akademi ikonuyla telefonunuza ve bilgisayarınıza kurun veya WhatsApp’tan gönderin
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Kurulum penceresini kapat"
                className="p-1.5 rounded-lg surface-alt cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <AppInstallShareCard
              academyName={academyName}
              isInstallable={isInstallable}
              isInstalled={isInstalled}
              isIOS={isIOS}
              onNativeInstall={install}
              onToast={onToast}
              compactModal
            />

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {onOpenFullGuide && (
                <button
                  type="button"
                  onClick={() => {
                    setShowGuideModal(false);
                    onOpenFullGuide();
                  }}
                  className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Yedekleme, Telefon &amp; Drive Merkezini Aç
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="btn-3d px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Çevrimdışı Mod — Önbellekteki uygulama ve veriler kullanılıyor</span>
    </div>
  );
}
