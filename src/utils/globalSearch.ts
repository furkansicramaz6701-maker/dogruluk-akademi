import { ActiveTab, Institution, StudentRecord } from '../types/academy';

export interface SearchModuleItem {
  id: string;
  label: string;
  description: string;
  tab: ActiveTab;
  omrMode?: 'omr' | 'open-ended';
  keywords: string[];
  actionKind?: 'navigate' | 'open-portal';
}

export const WORKSPACE_MODULE_ITEMS: SearchModuleItem[] = [
  {
    id: 'mod-dashboard',
    label: 'Genel Bakış',
    description: 'Aktif kurum özeti, 3–5. sınıf doğru-yanlış götürme ayarı, müfredat ve öğrenci yönetimi',
    tab: 'dashboard',
    keywords: ['genel bakis', 'ana ekran', 'ozet', 'mufredat', 'sinif', 'dogru yanlis goturme', '3. sinif', '4. sinif', '5. sinif'],
  },
  {
    id: 'mod-weekly',
    label: 'Haftalık Liste (KTS)',
    description: 'KTS-1 / KTS-2 sıralama, ilk 3 başarı rozeti, Pano PDF, Excel ve toplu veli mesajı',
    tab: 'weekly',
    keywords: ['haftalik', 'kts', 'liste', 'siralama', 'pano', 'excel', 'rozet'],
  },
  {
    id: 'mod-omr',
    label: 'Optik Okuma (OMR)',
    description: 'Çoktan seçmeli optik cevap kağıdı okuma, anahtar yükleme ve net hesaplama',
    tab: 'omr',
    omrMode: 'omr',
    keywords: ['optik', 'omr', 'tarama', 'cevap anahtari', 'pembe optik'],
  },
  {
    id: 'mod-open-ended',
    label: '10 Soruluk Açık Uçlu Kağıt Analizi',
    description: 'Yazılı/klasik cevap anahtarı ve öğrenci kağıdı yükleme, puanlama ve PDF karne',
    tab: 'omr',
    omrMode: 'open-ended',
    keywords: ['acik uclu', '10 soru', 'kagit analizi', 'klasik', 'cozum', 'yazili kagit'],
  },
  {
    id: 'mod-generator',
    label: 'Deneme & PDF Üretici',
    description: 'Hazır PDF yükleme (kapak temizleme), otomatik deneme ve MEB kazanım üretici',
    tab: 'generator',
    keywords: ['deneme', 'pdf', 'kitapcik', 'kapak', 'meb', 'otomatik deneme'],
  },
  {
    id: 'mod-pdf-proc',
    label: 'PDF Soru İşleyici & 20 Soruluk Yazılı',
    description: 'PDF’ten otomatik soru ayrıştırma, 20 soruluk yazılıya hazırlık seçimi',
    tab: 'generator',
    keywords: ['pdf soru isleyici', '20 soru', 'yaziliya hazirlik', 'soru secimi'],
  },
  {
    id: 'mod-editor',
    label: 'Deneme Editörü (Grafik / Tablo / İngilizce)',
    description: 'Sınıf bazlı soru ekleme, grafik, tablo, matematiksel işlem ve resimli İngilizce soruları',
    tab: 'editor',
    keywords: ['editor', 'grafik', 'tablo', 'matematik', 'ingilizce', 'resim', 'soru duzenle'],
  },
  {
    id: 'mod-reports',
    label: 'Karne & Veli Mesaj Şablonları',
    description: 'Sınıf düzeyine özel analiz karnesi, WhatsApp / SMS veli mesaj taslakları',
    tab: 'reports',
    keywords: ['karne', 'analiz', 'veli mesaj', 'whatsapp', 'sms', 'sablon', 'rapor'],
  },
  {
    id: 'mod-calendar',
    label: 'Eğitim Takvimi',
    description: 'Deneme tarihleri, telafi etütleri ve kamp planlaması',
    tab: 'calendar',
    keywords: ['takvim', 'etut', 'tarih', 'planlama', 'program'],
  },
  {
    id: 'mod-poster',
    label: '3D Afiş & QR Stüdyo',
    description: 'Kuruma özel 3D tanıtım afişi, imza ve QR kod üretimi',
    tab: 'poster',
    keywords: ['afis', 'poster', '3d', 'qr', 'duyuru'],
  },
  {
    id: 'mod-drive',
    label: 'Yedek, Telefon & PC (PWA Kur)',
    description: 'Telefon ve bilgisayara uygulama olarak kurma, WhatsApp linki ve Google Drive yedekleme',
    tab: 'drive',
    keywords: ['yedek', 'drive', 'telefon', 'kur', 'pwa', 'uygulama', 'masaüstü', 'whatsapp gonder'],
  },
  {
    id: 'mod-sample',
    label: 'Örnek Sayfa (Demo & Türkiye Geneli)',
    description: 'Kurum panelini kirletmeyen ayrılmış örnek öğrenci ve Türkiye geneli net karşılaştırma sayfası',
    tab: 'sample',
    keywords: ['ornek', 'örnek sayfa', 'demo', 'turkiye geneli', 'simulasyon'],
  },
  {
    id: 'mod-portal',
    label: 'Kurum Girişi & Şifre Ekranı',
    description: 'Kurum seçimi, 8 haneli kurum kodu ve şifreyle kuruma özel alana geçiş',
    tab: 'dashboard',
    actionKind: 'open-portal',
    keywords: ['kurum giris', 'sifre', 'kod', 'portal', 'acilis', 'degistir', 'cikis'],
  },
];

export interface GlobalSearchResults {
  modules: SearchModuleItem[];
  students: StudentRecord[];
  institutions: Institution[];
}

function normalizeTr(text: string): string {
  return (text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

export function searchWorkspaceEntities(params: {
  query: string;
  students: StudentRecord[];
  institutions: Institution[];
  activeInstitutionId: string;
}): GlobalSearchResults {
  const q = normalizeTr(params.query);
  if (!q) {
    return {
      modules: WORKSPACE_MODULE_ITEMS.slice(0, 6),
      students: [],
      institutions: [],
    };
  }

  const modules = WORKSPACE_MODULE_ITEMS.filter((item) => {
    const haystack = normalizeTr(
      `${item.label} ${item.description} ${item.keywords.join(' ')}`
    );
    return haystack.includes(q);
  }).slice(0, 8);

  const activeStudents = params.students.filter(
    (s) => s.institutionId === params.activeInstitutionId
  );
  const students = activeStudents
    .filter((s) => {
      const haystack = normalizeTr(
        `${s.fullName} ${s.studentNumber8} ${s.classroom} ${s.gradeId}`
      );
      return haystack.includes(q);
    })
    .slice(0, 6);

  const institutions = params.institutions
    .filter((i) => {
      const haystack = normalizeTr(`${i.name} ${i.code8} ${i.city}`);
      return haystack.includes(q);
    })
    .slice(0, 5);

  return { modules, students, institutions };
}
