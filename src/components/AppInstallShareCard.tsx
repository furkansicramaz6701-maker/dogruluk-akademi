import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Link2,
  Loader2,
  MessageCircle,
  QrCode,
  Share2,
  Smartphone,
} from 'lucide-react';
import {
  buildAppWhatsAppShareHref,
  buildAppWhatsAppShareMessage,
  buildDesktopKitDownloadUrl,
  buildPhoneInstallUrl,
  detectDeviceInstallPlatform,
} from '../utils/appInstallShare';
import { triggerDownload } from '../utils/pdfAndZip';

interface AppInstallShareCardProps {
  academyName?: string;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onNativeInstall: () => Promise<boolean>;
  onToast?: (msg: string) => void;
  compactModal?: boolean;
}

export function AppInstallShareCard({
  academyName = 'Doğruluk Akademi',
  isInstallable,
  isInstalled,
  isIOS,
  onNativeInstall,
  onToast,
  compactModal = false,
}: AppInstallShareCardProps) {
  const defaultOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';

  const [customAppUrl, setCustomAppUrl] = useState(defaultOrigin);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<'url' | 'msg' | null>(null);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [downloadBusyKey, setDownloadBusyKey] = useState<'desktop' | 'source' | null>(null);

  const phoneInstallUrl = useMemo(
    () => buildPhoneInstallUrl(customAppUrl || defaultOrigin),
    [customAppUrl, defaultOrigin]
  );

  const desktopKitUrl = useMemo(
    () => buildDesktopKitDownloadUrl(customAppUrl || defaultOrigin),
    [customAppUrl, defaultOrigin]
  );

  const platformInfo = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return { platform: 'desktop' as const, isInAppBrowser: false };
    }
    return detectDeviceInstallPlatform(navigator.userAgent);
  }, []);

  const defaultWaMessage = useMemo(
    () =>
      buildAppWhatsAppShareMessage({
        academyName,
        installUrl: phoneInstallUrl,
        customNote,
      }),
    [academyName, phoneInstallUrl, customNote]
  );

  const [editableWaMessage, setEditableWaMessage] = useState(defaultWaMessage);

  useEffect(() => {
    setEditableWaMessage(defaultWaMessage);
  }, [defaultWaMessage]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(phoneInstallUrl, {
      width: 196,
      margin: 1,
      color: {
        dark: '#0f2747',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [phoneInstallUrl]);

  const waHref = useMemo(
    () => buildAppWhatsAppShareHref(waPhoneInput, editableWaMessage),
    [waPhoneInput, editableWaMessage]
  );

  const copyText = async (text: string, key: 'url' | 'msg', toastLabel: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onToast?.(toastLabel);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleNativeInstallClick = async () => {
    setInstallFeedback(null);
    if (isInstallable) {
      const ok = await onNativeInstall();
      if (ok) {
        setInstallFeedback(
          'Doğruluk Akademi ikonu cihazınıza kuruldu. Artık masaüstünden veya telefon ana ekranınızdan uygulama gibi açabilirsiniz.'
        );
        onToast?.('Doğruluk Akademi cihazınıza uygulama olarak kuruldu.');
        return;
      }
    }
    setInstallFeedback(
      isIOS || platformInfo.platform === 'ios'
        ? 'iPhone/iPad için Safari alt çubuğundaki Paylaş simgesine dokunun ve "Ana Ekrana Ekle" seçin.'
        : 'Tarayıcı sağ üst menüsünden (⋮) "Uygulamayı Yükle" veya "Ana Ekrana Ekle" seçeneğini kullanabilirsiniz.'
    );
  };

  const handleSystemShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${academyName} — Uygulama Kurulumu`,
          text: editableWaMessage,
          url: phoneInstallUrl,
        });
      } catch {
        // User dismissed share sheet
      }
    } else {
      await copyText(
        phoneInstallUrl,
        'url',
        'Telefon & bilgisayar kurulum bağlantısı panoya kopyalandı.'
      );
    }
  };

  const handleServerZipDownload = async (
    key: 'desktop' | 'source',
    url: string,
    filename: string,
    successMsg: string
  ) => {
    setDownloadBusyKey(key);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Sunucu indirme hatası (${resp.status})`);
      }
      const blob = await resp.blob();
      triggerDownload(blob, filename);
      onToast?.(successMsg);
    } catch (err) {
      onToast?.(
        err instanceof Error
          ? `${filename} indirilemedi: ${err.message}`
          : `${filename} indirilemedi.`
      );
    } finally {
      setDownloadBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Doğruluk Akademi İkonlu Uygulama Başlığı */}
      <div className="surface-alt rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <img
              src="/pwa-192x192.png"
              alt="Doğruluk Akademi Uygulama İkonu"
              className="w-14 h-14 rounded-2xl shadow-md border border-white/30 object-cover"
            />
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow"
              title="Uygulama ikonu hazır"
            >
              <Check className="w-3 h-3" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm sm:text-base font-extrabold">
                Doğruluk Akademi Uygulaması
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                Resmi Kalkan İkonlu
              </span>
              {isInstalled && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  Uygulama Modunda Açık
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Telefon ana ekranına ve bilgisayar masaüstüne <strong>Doğruluk Akademi ikonu</strong> ile kurulur; adres çubuğu olmadan gerçek uygulama gibi açılır.
            </p>
          </div>
        </div>

        {!isInstalled && (
          <button
            type="button"
            onClick={handleNativeInstallClick}
            className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4" aria-hidden="true" />
            <span>
              {isInstallable
                ? 'Tek Tıkla Uygulamayı Kur'
                : platformInfo.platform === 'ios'
                  ? 'iPhone’a Nasıl Kurulur?'
                  : 'Cihaza Uygulama Kur'}
            </span>
          </button>
        )}
      </div>

      {platformInfo.isInAppBrowser && (
        <div className="rounded-xl p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-bold text-amber-900 dark:text-amber-200">
              {platformInfo.inAppLabel} içi tarayıcıdasınız — Ana Ekrana kurmak için:
            </div>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
              Sağ üst veya alt köşedeki menüden <strong>Chrome’da Aç</strong> (Android) veya <strong>Safari’de Aç</strong> (iPhone) seçeneğine dokunduktan sonra kurulum düğmesine basın.
            </p>
          </div>
        </div>
      )}

      {installFeedback && (
        <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{installFeedback}</span>
        </div>
      )}

      {/* 1. Telefon İndirme Bağlantısı & QR + 2. WhatsApp'tan Uygulama Gönder */}
      <div className={`grid grid-cols-1 ${compactModal ? 'md:grid-cols-2' : 'lg:grid-cols-2'} gap-4`}>
        {/* TELEFONA KUR & QR BAĞLANTI */}
        <div className="surface-alt rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>1. Telefon İndirme &amp; Kurulum Bağlantısı</span>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Android &amp; iPhone
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3.5">
            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs shrink-0 flex flex-col items-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Doğruluk Akademi Telefon Kurulum QR Kodu"
                  className="w-28 h-28 object-contain"
                />
              ) : (
                <div className="w-28 h-28 flex items-center justify-center text-slate-400">
                  <QrCode className="w-10 h-10" aria-hidden="true" />
                </div>
              )}
              <span className="text-[10px] font-bold text-slate-700 mt-1">
                Telefonla Okut &amp; Kur
              </span>
            </div>

            <div className="flex-1 min-w-0 space-y-2 w-full">
              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Telefon &amp; Masaüstü Uygulama Linki
                <input
                  type="url"
                  value={customAppUrl}
                  onChange={(e) => setCustomAppUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs font-mono-num surface-card border"
                />
              </label>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      phoneInstallUrl,
                      'url',
                      'Telefon indirme & kurulum bağlantısı panoya kopyalandı.'
                    )
                  }
                  className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'url' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Kopyalandı</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Bağlantıyı Kopyala</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSystemShare}
                  className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Paylaş</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] leading-relaxed rounded-lg p-2.5 surface-card space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <div>
              <strong>Android (Chrome):</strong> Bağlantıyı açıp <strong>Tek Tıkla Uygulamayı Kur</strong> veya <strong>⋮ &gt; Ana ekrana ekle</strong> dokunun.
            </div>
            <div>
              <strong>iPhone / iPad (Safari):</strong> Alt çubuktaki <strong>Paylaş</strong> simgesi &gt; <strong>Ana Ekrana Ekle</strong> seçin. Doğruluk Akademi ikonu ekranınıza yerleşir.
            </div>
          </div>
        </div>

        {/* WHATSAPP'TAN UYGULAMA GÖNDER */}
        <div className="surface-alt rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>2. WhatsApp’tan Uygulamayı Gönder</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                Telefon &amp; PC Linki
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                WhatsApp Numarası (İsteğe Bağlı)
                <input
                  type="tel"
                  value={waPhoneInput}
                  onChange={(e) => setWaPhoneInput(e.target.value)}
                  placeholder="Örn: 0505 226 92 58"
                  className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border"
                />
              </label>

              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Kısa Not (İsteğe Bağlı)
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Örn: Kurum Kodu 31570113"
                  className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border"
                />
              </label>
            </div>

            <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Gönderilecek Uygulama Mesajı (Düzenlenebilir)
              <textarea
                rows={4}
                value={editableWaMessage}
                onChange={(e) => setEditableWaMessage(e.target.value)}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card border resize-y"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm inline-flex items-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>WhatsApp’tan Uygulamayı Gönder</span>
              <ExternalLink className="w-3 h-3 opacity-85" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={() =>
                copyText(
                  editableWaMessage,
                  'msg',
                  'WhatsApp uygulama davet mesajı kopyalandı.'
                )
              }
              className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey === 'msg' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Mesaj Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Mesajı Kopyala</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Bilgisayarda Masaüstü Uygulaması Gibi Aç (Doğruluk Akademi İkonlu) */}
      <div className="surface-alt rounded-xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold flex items-center gap-1.5">
            <Laptop className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span>3. Bilgisayarda Masaüstünde Uygulama Gibi Aç (İkonlu)</span>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            E-posta / Google Hesabı İstemez
          </span>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong>Windows Masaüstü Başlatıcı (.ZIP)</strong> içindeki <strong>Dogruluk-Akademi-Masasustune-Simge-Ekle.bat</strong> dosyasına çift tıkladığınızda masaüstünüze Doğruluk Akademi logolu kısayol eklenir ve program bağımsız pencere olarak açılır.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={handleNativeInstallClick}
              className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Laptop className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tarayıcıdan Masaüstüne Kur</span>
            </button>
          )}

          <button
            type="button"
            disabled={downloadBusyKey !== null}
            onClick={() =>
              void handleServerZipDownload(
                'desktop',
                desktopKitUrl,
                'Dogruluk-Akademi-Bilgisayar-Kurulumu.zip',
                'İkonlu Masaüstü Başlatıcı (.ZIP) indirildi.'
              )
            }
            data-testid="install-card-download-desktop-kit-btn"
            className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {downloadBusyKey === 'desktop' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {downloadBusyKey === 'desktop'
                ? 'Hazırlanıyor...'
                : 'İkonlu Masaüstü Kurulumu İndir (.ZIP)'}
            </span>
          </button>

          <button
            type="button"
            disabled={downloadBusyKey !== null}
            onClick={() =>
              void handleServerZipDownload(
                'source',
                '/api/export/app-zip',
                'Dogruluk-Akademi-Uygulama-Kaynak-Kodu.zip',
                'Tam Uygulama Kaynak Kodu (.ZIP) indirildi.'
              )
            }
            data-testid="install-card-download-source-zip-btn"
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {downloadBusyKey === 'source' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {downloadBusyKey === 'source'
                ? 'Hazırlanıyor...'
                : 'Tam Uygulama Kaynak Kodu (.ZIP)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
