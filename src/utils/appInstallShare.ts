import { buildWhatsAppHref } from './weeklyAnalysis';

export type DeviceInstallPlatform = 'ios' | 'android' | 'desktop';

export interface DevicePlatformInfo {
  platform: DeviceInstallPlatform;
  isInAppBrowser: boolean;
  inAppLabel?: string;
}

export function buildPhoneInstallUrl(rawBaseUrl: string): string {
  const trimmed = (rawBaseUrl || '').trim();
  if (!trimmed) return '/?install=1';
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('install', '1');
    return parsed.toString();
  } catch {
    const clean = trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
    return clean ? `${clean}/?install=1` : '/?install=1';
  }
}

export function buildDesktopKitDownloadUrl(appUrl?: string): string {
  const base =
    appUrl?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '/api/export/desktop-kit';
  return `/api/export/desktop-kit?appUrl=${encodeURIComponent(base)}`;
}

export function detectDeviceInstallPlatform(userAgent: string): DevicePlatformInfo {
  const ua = (userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const platform: DeviceInstallPlatform = isIOS
    ? 'ios'
    : isAndroid
      ? 'android'
      : 'desktop';

  let inAppLabel: string | undefined;
  if (/whatsapp/.test(ua)) {
    inAppLabel = 'WhatsApp';
  } else if (/instagram/.test(ua)) {
    inAppLabel = 'Instagram';
  } else if (/fban|fbav|fb_iab/.test(ua)) {
    inAppLabel = 'Facebook';
  } else if (/; wv\b/.test(ua)) {
    inAppLabel = 'Uygulama İçi Tarayıcı';
  }

  return {
    platform,
    isInAppBrowser: Boolean(inAppLabel),
    inAppLabel,
  };
}

export function buildAppWhatsAppShareMessage(params: {
  academyName?: string;
  installUrl: string;
  customNote?: string;
}): string {
  const academy = (params.academyName || '').trim() || 'Doğruluk Akademi';
  const url = buildPhoneInstallUrl(params.installUrl);
  const lines = [
    `*${academy} — Doğruluk Akademi Uygulaması*`,
    '',
    'Sınav üretimi, optik okuma, karne analizi ve veli takip sistemini telefonunuza ve bilgisayarınıza uygulama gibi kurabilirsiniz:',
    url,
    '',
    '• *Telefonda (Android / iPhone):* Bağlantıyı Chrome veya Safari ile açıp "Uygulamayı Kur / Ana Ekrana Ekle" butonuna dokunun. Doğruluk Akademi ikonu ana ekranınıza eklenir.',
    '• *Bilgisayarda (Windows / Mac):* Bağlantıyı açıp sağ üstten "Yükle" butonuna tıklayın; adres çubuğu olmadan masaüstü programı gibi açılır.',
  ];

  const extra = (params.customNote || '').trim();
  if (extra) {
    lines.push('', `Not: ${extra}`);
  }

  return lines.join('\n');
}

export function buildAppWhatsAppShareHref(
  phone: string | undefined,
  message: string
): string {
  return buildWhatsAppHref(phone, message);
}
