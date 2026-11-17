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
