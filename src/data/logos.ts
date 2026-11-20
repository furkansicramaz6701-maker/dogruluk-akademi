import { LogoPreset, LogoStyleId } from '../types/academy';

export const HEADER_LOGO_PRESETS: LogoPreset[] = [
  {
    id: 'akademi-kalkani',
    name: '1. Akademi Kalkanı',
    headerTitle: 'Doğruluk Akademi',
    headerSubtitle: 'Ölçme, Sınav ve Analiz Merkezi',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f2747',
    goldColor: '#fbbf24',
  },
  {
    id: 'zumrut-mesale',
    name: '2. Zümrüt Meşale',
    headerTitle: 'Doğruluk Bilim Akademisi',
    headerSubtitle: 'Yeni Nesil Ölçme ve Değerlendirme Sistemi',
    primaryColor: '#0f766e',
    secondaryColor: '#064e3b',
    goldColor: '#f59e0b',
  },
  {
    id: 'kraliyet-armasi',
    name: '3. Kraliyet Arması',
    headerTitle: 'Doğruluk Kolej & Akademi',
    headerSubtitle: 'Kurumsal Sınav Yayın Koordinatörlüğü',
    primaryColor: '#9f1239',
    secondaryColor: '#4c0519',
    goldColor: '#fde047',
  },
  {
    id: 'futuristik-prizma',
    name: '4. Fütüristik Prizma',
    headerTitle: 'Doğruluk YKS Kampüsü',
    headerSubtitle: 'Yapay Zeka Destekli OMR & Karne',
    primaryColor: '#4338ca',
    secondaryColor: '#1e1b4b',
    goldColor: '#38bdf8',
  },
  {
    id: 'kurumsal-muhur',
    name: '5. Resmi Akademi Mührü',
    headerTitle: 'Doğruluk Ölçme Merkezi',
    headerSubtitle: 'Furkan Onaylı Resmi Sınav Platformu',
    primaryColor: '#334155',
    secondaryColor: '#0f172a',
    goldColor: '#fbbf24',
  },
];

export function getLogoPreset(id?: LogoStyleId): LogoPreset {
  return HEADER_LOGO_PRESETS.find((p) => p.id === id) ?? HEADER_LOGO_PRESETS[0];
}

export interface InstitutionLogoProfile {
  initials: string;
  institutionName: string;
  variant: LogoStyleId;
  primaryColor: string;
  secondaryColor: string;
  goldColor: string;
}

const INSTITUTION_COLOR_PALETTES: Array<{
  primary: string;
  secondary: string;
  gold: string;
  variant: LogoStyleId;
}> = [
  { primary: '#1d4ed8', secondary: '#0f2747', gold: '#fbbf24', variant: 'akademi-kalkani' },
  { primary: '#0f766e', secondary: '#064e3b', gold: '#f59e0b', variant: 'zumrut-mesale' },
  { primary: '#9f1239', secondary: '#4c0519', gold: '#fde047', variant: 'kraliyet-armasi' },
  { primary: '#4338ca', secondary: '#1e1b4b', gold: '#38bdf8', variant: 'futuristik-prizma' },
  { primary: '#0369a1', secondary: '#0c4a6e', gold: '#fde047', variant: 'kurumsal-muhur' },
  { primary: '#7c2d12', secondary: '#431407', gold: '#fbbf24', variant: 'kraliyet-armasi' },
  { primary: '#15803d', secondary: '#052e16', gold: '#fde047', variant: 'zumrut-mesale' },
];

export function extractInstitutionInitials(institutionName: string): string {
  const stopWords = new Set(['ve', 'ile', 'kurumu', 'koleji', 'akademisi', 'akademi', 'okullari', 'okulları', 'egitim', 'eğitim', '&']);
  const words = (institutionName || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return 'DA';

  const meaningful = words.filter((w) => !stopWords.has(w.toLocaleLowerCase('tr-TR')));
  const pool = meaningful.length >= 2 ? meaningful : words;

  if (pool.length === 1) {
    return pool[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  }
  return `${pool[0][0]}${pool[1][0]}`.toLocaleUpperCase('tr-TR');
}

export function buildInstitutionLogoProfile(
  institutionName?: string,
  preferredVariant?: LogoStyleId
): InstitutionLogoProfile {
  const cleanName = (institutionName || '').trim() || 'Doğruluk Akademi';
  const normalized = cleanName.toLocaleLowerCase('tr-TR');
  const isMainDogruluk =
    normalized === 'doğruluk akademi' || normalized === 'doğruluk akademi merkez';

  if (isMainDogruluk && !preferredVariant) {
    const base = HEADER_LOGO_PRESETS[0];
    return {
      initials: 'DA',
      institutionName: cleanName,
      variant: base.id,
      primaryColor: base.primaryColor,
      secondaryColor: base.secondaryColor,
      goldColor: base.goldColor,
    };
  }

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const palette = INSTITUTION_COLOR_PALETTES[(hash >>> 0) % INSTITUTION_COLOR_PALETTES.length];
  const preset = preferredVariant ? getLogoPreset(preferredVariant) : null;

  return {
    initials: extractInstitutionInitials(cleanName),
    institutionName: cleanName,
    variant: preferredVariant ?? palette.variant,
    primaryColor: preset && isMainDogruluk ? preset.primaryColor : palette.primary,
    secondaryColor: preset && isMainDogruluk ? preset.secondaryColor : palette.secondary,
    goldColor: preset && isMainDogruluk ? preset.goldColor : palette.gold,
  };
}

