import { DifficultyLevel, GradeProfile } from '../types/academy';

export interface QuestionTemplate {
  stem: string;
  correct: string;
  distractors: [string, string, string, string];
  explanation: string;
}

function pickVariant(seed: number, options: string[]): string {
  const idx = Math.abs(seed) % options.length;
  return options[idx];
}

function buildMathQuestion(
  qNumber: number,
  topic: string,
  difficulty: DifficultyLevel,
  profile: GradeProfile,
  variantSeed = 0
): QuestionTemplate {
  const isLower = profile.category === 'İlkokul' || Number(profile.id) <= 6;
  const seed = Math.abs(qNumber * 7 + variantSeed * 29 + topic.length * 3);
  const variant = seed % 10;

  if (isLower) {
    const mode = seed % 6;
    const stepA = 18 + (seed % 14) * 3;
    const stepB = 9 + ((seed * 3) % 11) * 2;
    if (mode === 0) {
      const shelves = 3 + (variantSeed % 3);
      const total = stepA * shelves + stepB;
      return {
        stem: `[${topic}] Bir okul kütüphanesinin ${shelves} rafının her birinde ${stepA} adet hikâye kitabı vardır. Kütüphaneye ${stepB} yeni kitap daha bağışlandığına göre toplam kitap sayısı kaç olur?`,
        correct: `${total}`,
        distractors: [`${total - 10}`, `${total + 12}`, `${stepA + stepB}`, `${total + 18}`],
        explanation: `${shelves} raftaki kitap sayısı ${shelves} × ${stepA} = ${stepA * shelves} olur. ${stepB} yeni kitap eklendiğinde toplam ${total} kitap elde edilir.`,
      };
    }
    if (mode === 1) {
      const side = 6 + (seed % 9);
      const diff = 4 + (variantSeed % 4) * 2;
      const area = side * (side + diff);
      const perimeter = 2 * (side + side + diff);
      return {
        stem: `[${topic}] Kısa kenarı ${side} cm, uzun kenarı kısa kenarından ${diff} cm fazla olan dikdörtgen şeklindeki bir panonun çevresi kaç santimetredir?`,
        correct: `${perimeter} cm`,
        distractors: [`${area} cm`, `${perimeter - 8} cm`, `${side * 4} cm`, `${perimeter + 6} cm`],
        explanation: `Uzun kenar ${side + diff} cm olur. Çevre = 2 × (${side} + ${side + diff}) = ${perimeter} cm bulunur.`,
      };
    }
    if (mode === 2) {
      const mult = 4 + (seed % 6);
      const whole = mult * 30;
      const soldMore = 15 + (variantSeed % 5) * 5;
      const part = whole / 3;
      const rem = whole - part - soldMore;
      return {
        stem: `[${topic}] Bir kırtasiyeci elindeki ${whole} adet kalemin önce 1/3'ünü, ardından kalan kalemlerin ${soldMore} tanesini satmıştır. Kırtasiyecide kaç kalem kalmıştır?`,
        correct: `${rem}`,
        distractors: [`${part + soldMore}`, `${whole - part}`, `${rem - 10}`, `${rem + 15}`],
        explanation: `${whole} kalemin 1/3'ü ${part} tanedir. Kalan ${whole - part} kalemden ${soldMore} çıkarıldığında ${rem} kalem kalır.`,
      };
    }
    if (mode === 3) {
      const perBox = 12 + (seed % 7) * 4;
      const boxes = 5 + (variantSeed % 4);
      const perStudent = 3;
      const distributed = Math.floor((perBox * boxes) / perStudent);
      const exactTotal = distributed * perStudent;
      return {
        stem: `[${topic}] Her birinde ${exactTotal / boxes} adet boya kalemi bulunan ${boxes} kutu kalem, her öğrenciye ${perStudent} kalem düşecek biçimde eşit olarak dağıtılıyor. Bu dağıtımdan kaç öğrenci yararlanır?`,
        correct: `${distributed}`,
        distractors: [`${distributed - 4}`, `${distributed + 5}`, `${boxes * perStudent}`, `${distributed + 10}`],
        explanation: `Toplam ${exactTotal} kalem, her öğrenciye ${perStudent} kalem verildiği için ${exactTotal} ÷ ${perStudent} = ${distributed} öğrenciye dağıtılır.`,
      };
    }
    if (mode === 4) {
      const startHour = 9 + (seed % 3);
      const durMin = 75 + (variantSeed % 4) * 15;
      const totalMins = startHour * 60 + 20 + durMin;
      const endH = Math.floor(totalMins / 60);
      const endM = String(totalMins % 60).padStart(2, '0');
      return {
        stem: `[${topic}] Saat ${String(startHour).padStart(2, '0')}.20'de başlayan bir deneme çalışması ${durMin} dakika sürmüştür. Buna göre çalışma saat kaçta sona ermiştir?`,
        correct: `${String(endH).padStart(2, '0')}.${endM}`,
        distractors: [
          `${String(endH).padStart(2, '0')}.${String((totalMins + 15) % 60).padStart(2, '0')}`,
          `${String(endH + 1).padStart(2, '0')}.${endM}`,
          `${String(endH - 1).padStart(2, '0')}.${endM}`,
          `${String(endH).padStart(2, '0')}.${String((totalMins + 45) % 60).padStart(2, '0')}`,
        ],
        explanation: `${String(startHour).padStart(2, '0')}.20 üzerine ${durMin} dakika eklendiğinde bitiş saati ${String(endH).padStart(2, '0')}.${endM} olur.`,
      };
    }
    const kgPrice = 25 + (seed % 6) * 5;
    const kg = 3 + (variantSeed % 4);
    const paid = 200 + Math.floor((kgPrice * kg) / 50) * 50;
    const change = paid - kgPrice * kg;
    return {
      stem: `[${topic}] Kilogramı ${kgPrice} TL olan fındıktan ${kg} kg alan bir veli satıcıya ${paid} TL vermiştir. Veli kaç TL para üstü alır?`,
      correct: `${change} TL`,
      distractors: [`${change + 15} TL`, `${Math.max(5, change - 10)} TL`, `${kgPrice * kg} TL`, `${change + 25} TL`],
      explanation: `${kg} kg ürün ${kgPrice} × ${kg} = ${kgPrice * kg} TL tutar. ${paid} - ${kgPrice * kg} = ${change} TL para üstü alınır.`,
    };
  }

  // Middle School / High School / TYT / AYT realistic math items (10 parametric modes)
  if (variant === 0) {
    const baseRate = 12 + (seed % 9) * 3;
    const discount = 20 + (seed % 4) * 5;
    const extra = 15 + (variantSeed % 3) * 5;
    const orig = baseRate * 10;
    const sale = Math.round(orig * (1 - discount / 100));
    return {
      stem: `[${topic}] Bir kırtasiye zinciri, etiket fiyatı ${orig} TL olan bir soru bankası setine önce %${discount} indirim uyguluyor. Kasada indirimli fiyat üzerinden ${extra} TL daha ek indirim yapıldığına göre bu setin son satış fiyatı kaç TL olur?`,
      correct: `${sale - extra} TL`,
      distractors: [`${sale} TL`, `${sale - extra - 10} TL`, `${orig - discount - extra} TL`, `${sale + extra} TL`],
      explanation: `${orig} TL'nin %${discount} indirimi sonucu fiyat ${sale} TL olur. Ek ${extra} TL indirimle satış fiyatı ${sale - extra} TL'dir.`,
    };
  }
  if (variant === 1) {
    const xVal = 3 + (seed % 7);
    const k = 2 + ((seed + variantSeed) % 5);
    const c = 5 + (variantSeed % 4);
    const rhs = k * (xVal - 1) + c;
    return {
      stem: `[${topic}] Gerçel sayılar kümesinde ${k}(x - 1) + ${c} = ${rhs} denklemini sağlayan x değeri aşağıdakilerden hangisidir?`,
      correct: `${xVal}`,
      distractors: [`${xVal - 1}`, `${xVal + 2}`, `${xVal + 4}`, `${Math.max(0, xVal - 2)}`],
      explanation: `${k}(x - 1) = ${rhs - c} => x - 1 = ${xVal - 1} => x = ${xVal} bulunur.`,
    };
  }
  if (variant === 2) {
    const v1 = 55 + (seed % 5) * 10;
    const v2 = 75 + (variantSeed % 4) * 10;
    const hrs = 2 + (seed % 4);
    const dist = (v1 + v2) * hrs;
    return {
      stem: `[${topic}] Aralarında ${dist} km uzaklık bulunan A ve B kentlerinden sırasıyla saatte ${v1} km ve ${v2} km sabit hızlarla birbirlerine doğru aynı anda harekete başlayan iki araç kaç saat sonra karşılaşır?`,
      correct: `${hrs} saat`,
      distractors: [`${hrs + 1} saat`, `${hrs + 2} saat`, `${Math.max(1, hrs - 1)} saat`, `${hrs + 0.5} saat`],
      explanation: `Araçların birbirine yaklaşma hızı ${v1} + ${v2} = ${v1 + v2} km/sa'tir. Karşılaşma süresi ${dist} / ${v1 + v2} = ${hrs} saattir.`,
    };
  }
  if (variant === 3) {
    const n = 2 + (seed % 5);
    const exp = n + 3;
    return {
      stem: `[${topic}] Üslü ifadeler kuralına göre (2^${n} · 8^${n - 1}) / 4^${n - 1} işleminin sadeleştirilmiş değeri aşağıdakilerden hangisidir?`,
      correct: `2^${2 * n - 1}`,
      distractors: [`2^${exp}`, `2^${n + 1}`, `4^${n}`, `2^${3 * n}`],
      explanation: `8^${n - 1} = 2^${3 * (n - 1)} ve 4^${n - 1} = 2^${2 * (n - 1)} olduğundan üsler toplanıp çıkarılır: ${n} + ${3 * n - 3} - (${2 * n - 2}) = ${2 * n - 1}.`,
    };
  }
  if (variant === 4) {
    const angleA = 36 + (seed % 6) * 6;
    const angleB = 50 + (variantSeed % 5) * 6;
    const extC = angleA + angleB;
    return {
      stem: `[${topic}] Bir ABC üçgeninde m(BAC) = ${angleA}° ve m(ABC) = ${angleB}° olduğuna göre C köşesine ait dış açının ölçüsü kaç derecedir?`,
      correct: `${extC}°`,
      distractors: [`${180 - extC}°`, `${extC - 12}°`, `${extC + 10}°`, `${180 - angleA}°`],
      explanation: `Bir üçgende bir dış açının ölçüsü, kendisine komşu olmayan iki iç açının ölçüleri toplamına eşittir: ${angleA}° + ${angleB}° = ${extC}°.`,
    };
  }
  if (variant === 5) {
    const red = 3 + (seed % 5);
    const blue = 5 + ((seed + variantSeed) % 4);
    const total = red + blue;
    return {
      stem: `[${topic}] İçinde özdeş ${red} kırmızı ve ${blue} mavi bilye bulunan bir torbadan rastgele seçilen bir bilyenin kırmızı olma olasılığı kaçtır? (${difficulty} Düzey)`,
      correct: `${red}/${total}`,
      distractors: [`${blue}/${total}`, `1/${red}`, `${red}/${blue}`, `${Math.max(1, red - 1)}/${total}`],
      explanation: `Toplam örnek uzay ${red} + ${blue} = ${total} bilyeden oluşur. İstenen kırmızı bilye sayısı ${red} olduğu için olasılık ${red}/${total} olur.`,
    };
  }
  if (variant === 6) {
    const ratioA = 3 + (seed % 4);
    const ratioB = 5 + (variantSeed % 3);
    const mult = 4 + (seed % 5);
    const sum = (ratioA + ratioB) * mult;
    return {
      stem: `[${topic}] İki sayının oranı ${ratioA}/${ratioB} ve bu iki sayının toplamı ${sum} olduğuna göre büyük sayı küçük sayıdan kaç fazladır?`,
      correct: `${(ratioB - ratioA) * mult}`,
      distractors: [`${ratioA * mult}`, `${ratioB * mult}`, `${(ratioB - ratioA) * (mult + 2)}`, `${mult * 2}`],
      explanation: `Sayılar ${ratioA}k ve ${ratioB}k alınırsa (${ratioA + ratioB})k = ${sum} => k = ${mult} olur. Fark (${ratioB} - ${ratioA})·${mult} = ${(ratioB - ratioA) * mult} bulunur.`,
    };
  }
  if (variant === 7) {
    const avg1 = 72 + (seed % 8) * 2;
    const count1 = 4;
    const nextScore = avg1 + 10;
    const newAvg = (avg1 * count1 + nextScore) / (count1 + 1);
    return {
      stem: `[${topic}] İlk ${count1} denemedeki puan ortalaması ${avg1} olan bir öğrenci 5. denemeden ${nextScore} puan almıştır. Öğrencinin 5 deneme sonundaki yeni ortalaması kaçtır?`,
      correct: `${newAvg}`,
      distractors: [`${avg1 + 4}`, `${avg1 + 5}`, `${newAvg - 2}`, `${newAvg + 3}`],
      explanation: `İlk ${count1} denemenin toplamı ${avg1 * count1}, 5. deneme ile toplam ${avg1 * count1 + nextScore} olur. 5'e bölündüğünde ortalama ${newAvg} bulunur.`,
    };
  }
  if (variant === 8) {
    const width = 8 + (seed % 6) * 2;
    const height = 10 + (variantSeed % 5) * 2;
    const area = width * height;
    const cut = 2;
    const newArea = (width - cut) * (height + cut);
    const diff = newArea - area;
    const signLabel = diff >= 0 ? `${diff} cm² artar` : `${Math.abs(diff)} cm² azalır`;
    return {
      stem: `[${topic}] Kenar uzunlukları ${width} cm ve ${height} cm olan bir dikdörtgenin kısa kenarı ${cut} cm azaltılıp uzun kenarı ${cut} cm artırılırsa alanı nasıl değişir?`,
      correct: signLabel,
      distractors: [
        'Değişmez',
        `${Math.abs(diff) + 4} cm² artar`,
        `${Math.abs(diff) + 8} cm² azalır`,
        'İki katına çıkar',
      ],
      explanation: `İlk alan ${width}×${height} = ${area} cm², yeni alan ${width - cut}×${height + cut} = ${newArea} cm² olduğundan fark ${Math.abs(diff)} cm² olur.`,
    };
  }
  const n1 = 12 + (seed % 7) * 4;
  const n2 = 18 + (variantSeed % 5) * 6;
  const gcdVal = (function g(x: number, y: number): number { return y === 0 ? x : g(y, x % y); })(n1, n2);
  const lcmVal = (n1 * n2) / gcdVal;
  return {
    stem: `[${topic}] Uzunlukları ${n1} cm ve ${n2} cm olan iki kurdele hiç artmayacak şekilde eşit uzunluktaki en büyük parçalara ayrılacaktır. Elde edilecek toplam parça sayısı kaçtır?`,
    correct: `${n1 / gcdVal + n2 / gcdVal}`,
    distractors: [`${gcdVal}`, `${lcmVal / n1}`, `${n1 / gcdVal + n2 / gcdVal + 2}`, `${n1 + n2 - gcdVal}`],
    explanation: `EBOB(${n1}, ${n2}) = ${gcdVal} cm'dir. Parça sayıları ${n1}/${gcdVal} + ${n2}/${gcdVal} = ${n1 / gcdVal + n2 / gcdVal} bulunur.`,
  };
}

const TURKISH_QUESTION_BANK: Omit<QuestionTemplate, never>[] = [
  {
    stem: '"Bir eserin kalıcılığını sağlayan asıl güç, yazarın döneminin geçici beğenilerine değil insanlığın değişmeyen iç dünyasına seslenebilmesidir." Bu cümlede asıl anlatılmak istenen düşünce aşağıdakilerden hangisidir?',
    correct: 'Evrensel insani duyguları işleyen yapıtlar çağlar boyu değerini korur.',
    distractors: [
      'Yazarlar yalnızca kendi dönemlerinin toplumsal sorunlarını anlatmalıdır.',
      'Okur kitlesinin beğenisi zamanla değiştiği için eski eserler unutulur.',
      'Sanatçıların dili sade tutması eserin satış başarısını belirler.',
      'Eleştirmenlerin övdüğü her eser klasikleşme özelliği taşır.',
    ],
    explanation: 'Cümlede geçici beğeniler yerine insanlığın ortak ve değişmeyen iç dünyasına seslenen eserlerin kalıcı olacağı vurgulanmaktadır.',
  },
  {
    stem: '(I) Sabahın erken saatlerinde sis, vadiyi ince bir tül gibi örtmüştü. (II) Uzaktan gelen tren düdüğü sessizliği bölen tek sesti. (III) İstasyon memuru elindeki feneri kaldırarak rayları kontrol etti. (IV) Bu küçük kasaba son yıllarda turizm açısından oldukça gelişmişti. Yukarıdaki numaralanmış cümlelerden hangisi düşüncenin akışını bozmaktadır?',
    correct: 'IV',
    distractors: ['I', 'II', 'III', 'II ve III'],
    explanation: 'İlk üç cümlede sisli bir sabahta istasyondaki atmosfer betimlenirken IV. cümle kasabanın turizm gelişimine geçerek akışı bozmaktadır.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde "yapım eki aldığı hâlde anlam değişmesine uğramamış" veya yazım yanlışı bulunan bir sözcük vardır?',
    correct: 'Bu hafta sonu birçok öğrenci kütüphanede ki masalarda çalıştı.',
    distractors: [
      'Sınav kitapçığındaki soruların tamamını dikkatle okudu.',
      'Öğretmenimiz yarınki deneme hakkında ayrıntılı bilgi verdi.',
      'Herkes sonuçların açıklanacağı saati sabırsızlıkla bekliyordu.',
      'Başarılı olmak için düzenli tekrar yapmayı ihmal etmedi.',
    ],
    explanation: '"kütüphanede ki" ifadesinde sıfat yapan -ki eki bitişik yazılmalıdır ("kütüphanedeki").',
  },
  {
    stem: '"Okumak, yalnızca sayfalar arasında gezinmek değil; başka hayatların penceresinden kendi ruhumuza bakabilmektir." Bu cümlede altı çizili bölümle anlatılmak istenen aşağıdakilerden hangisidir?',
    correct: 'Farklı yaşantıları tanıyarak insanın kendini daha iyi anlaması',
    distractors: [
      'Çok sayıda kitap bitirerek hızlı okuma alışkanlığı kazanmak',
      'Yalnızca biyografi ve anı türündeki eserlere yönelmek',
      'Günlük yaşamın gerçeklerinden tamamen uzaklaşmak',
      'Yazarların üslup özelliklerini eleştirel gözle incelemek',
    ],
    explanation: '"Başka hayatların penceresinden kendi ruhumuza bakmak" empati yoluyla öz farkındalık kazanmayı ifade eder.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde virgül (,) diğerlerinden farklı bir görevde kullanılmıştır?',
    correct: 'Öğrenciler, deneme salonuna sessizce girip yerlerine oturdu.',
    distractors: [
      'Masanın üzerinde kalem, silgi, açacak ve optik form duruyordu.',
      'Türkçe, matematik ve fen testlerini sırasıyla tamamladı.',
      'Sabah erkenden kalktı, kahvaltısını yaptı, okulun yolunu tuttu.',
      'Kitaplar, defterler, not kağıtları düzenli bir biçimde dizilmişti.',
    ],
    explanation: 'Doğru seçenekte virgül özneyi yüklemden uzak düştüğü için belirginleştirmek amacıyla, diğerlerinde eş görevli sözcükleri/sıralı cümleleri ayırmak için kullanılmıştır.',
  },
  {
    stem: '"Bilgi kaynakları çeşitlendikçe okurun metinlerle kurduğu bağ da dönüşüyor. Ancak derinlikli düşünme becerisi hâlâ sabırlı bir okuma kültürü gerektiriyor." Bu parçadan aşağıdakilerden hangisine ulaşılabilir?',
    correct: 'Araçlar değişse de nitelikli anlama için dikkatli ve sabırlı okuma şarttır.',
    distractors: [
      'Dijital çağda basılı kitapların tamamı işlevini yitirmiştir.',
      'Hızlı bilgi tüketimi eleştirel düşünmeyi otomatik olarak artırır.',
      'Modern okurlar artık uzun metinleri hiçbir şekilde okuyamamaktadır.',
      'Teknolojik gelişmeler okuma hızını düşüren tek etkendir.',
    ],
    explanation: 'Parçada araçların değişmesine karşın derinlikli düşünmenin sabırlı okuma gerektirdiği vurgulanmaktadır.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde "dolaylı anlatım" veya başkasından aktarılan bir yargı söz konusudur?',
    correct: 'Öğretmenimiz düzenli tekrar yapanların başarıyı yakalayacağını söyledi.',
    distractors: [
      'Kütüphane penceresinden süzülen ışık masayı aydınlatıyordu.',
      'Yeni sınav takvimini panoya özenle astık.',
      'Kitap fuarında birbirinden değerli yazarlarla tanıştım.',
      'Sabah serinliğinde yürüyüş yapmak zihnimi açıyor.',
    ],
    explanation: 'Öğretmenin sözü kendi cümlesi yerine "-acağını söyledi" biçiminde aktarılarak dolaylı anlatım yapılmıştır.',
  },
  {
    stem: '(I) Deniz kıyısındaki eski fener yıllardır gemilere yol gösteriyordu. (II) Dalgaların kayalara çarpışı gece boyunca hiç dinmedi. (III) Balıkçılar ağlarını sabaha karşı limana çekti. (IV) Liman girişindeki rüzgâr türbinleri geçen ay onarıldı. (V) Güneş doğarken tüm tekne tayfaları çay eşliğinde dinlendi. Numaralanmış cümlelerden hangisi anlatımın bütünlüğünü zedelemektedir?',
    correct: 'IV',
    distractors: ['I', 'II', 'III', 'V'],
    explanation: 'Parçada gece boyunca süren deniz ve balıkçılık atmosferi anlatılırken IV. cümlede türbinlerin geçen ayki onarımından söz edilmektedir.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde "neden-sonuç" ilişkisi vardır?',
    correct: 'Yoğun sis nedeniyle feribot seferleri iki saat ertelendi.',
    distractors: [
      'Denemeyi erken bitirmek için soruları hızlıca gözden geçirdi.',
      'Başarılı olmak amacıyla her akşam yirmi paragraf çözüyor.',
      'Ödevlerini tamamlamak üzere çalışma odasına geçti.',
      'Yeni kitaplar almak için fuara gitmeyi planlıyor.',
    ],
    explanation: 'Feribot seferlerinin ertelenmesi gerçekleşmiş bir sonuç, yoğun sis ise bunun nedenidir.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde altı çizili sözcük mecaz anlamıyla kullanılmıştır?',
    correct: 'Konuşmacının KESKİN sözleri salondaki herkesi şaşırttı.',
    distractors: [
      'Mutfaktaki KESKİN bıçakla meyveleri ince ince doğradı.',
      'Bahçedeki AĞIR taşı iki kişi birlikte kaldırdı.',
      'Kışın soğuk günlerinde KALIN kazağını giydi.',
      'Masadaki BOŞ bardağa taze su doldurdu.',
    ],
    explanation: '"Keskin sözler" ifadesinde sözcük gerçek fiziksel kesicilikten sıyrılarak "etkili, sert" anlamında mecazlaşmıştır.',
  },
  {
    stem: 'Bir metinde "ilk bakışta sıradan görünen ayrıntıların ardındaki derin anlamı yakalamak" ifadesiyle yazarın hangi yönü vurgulanmaktadır?',
    correct: 'Güçlü gözlem ve sezgi yeteneği',
    distractors: [
      'Tarihi olayları kronolojik anlatma becerisi',
      'Yabancı sözcükleri sıkça tercih etmesi',
      'Uzun ve devrik cümleler kurma alışkanlığı',
      'Sadece kendi çocukluk anılarını yazması',
    ],
    explanation: 'Sıradan ayrıntılardaki derin anlamı görmek güçlü bir gözlem ve sezgi gücüne işaret eder.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde "ki" bağlacının yazımı yanlıştır?',
    correct: 'Senki her zaman düzenli çalışmanın önemini savunursun.',
    distractors: [
      'Evdeki hesap çarşıya uymayınca planı yeniledik.',
      'O kadar hızlı okudu ki paragrafı hemen özetledi.',
      'Akşamki toplantıda yeni deneme takvimi görüşülecek.',
      'Biliyorum ki sabırla çalışan her öğrenci hedefini aşar.',
    ],
    explanation: '"Sen ki" ifadesinde "ki" ayrı yazılan bağlaçtır; bitişik yazılması yazım yanlışıdır.',
  },
  {
    stem: '"İyi bir okur, yazarın satırlara döktüğü kadar satır aralarında bıraktığı boşlukları da okuyabilendir." Sözüyle anlatılmak istenen aşağıdakilerden hangisidir?',
    correct: 'Metindeki örtülü anlamları ve sezdirilen düşünceleri kavrayabilmek',
    distractors: [
      'Sayfa kenarlarındaki boşluklara mutlaka özet notları almak',
      'Kitabın yalnızca önsöz ve sonuç bölümlerini incelemek',
      'Okuma hızını dakikalık kelime sayısıyla ölçmek',
      'Yazım ve noktalama yanlışlarını tek tek işaretlemek',
    ],
    explanation: '"Satır aralarındaki boşlukları okumak" açıkça söylenmeyen örtük mesajları sezmek anlamına gelir.',
  },
  {
    stem: 'Aşağıdaki cümlelerin hangisinde "amaç-sonuç" ilişkisi bulunmaktadır?',
    correct: 'Okuma hızını artırmak için her gün düzenli metin analizi yapıyor.',
    distractors: [
      'Yağmur birden bastırınca tüm sporcular salona sığındı.',
      'Zamanında yola çıkmadığımız için ilk dersi kaçırdık.',
      'Hava karardığı için sokak lambaları birer birer yandı.',
      'Elektrik kesildiğinden bilgisayar kendiliğinden kapandı.',
    ],
    explanation: 'Metin analizi yapmasının henüz hedeflediği amacı "okuma hızını artırmak"tır.',
  },
];

function buildTurkishQuestion(
  qNumber: number,
  topic: string,
  difficulty: DifficultyLevel,
  variantSeed = 0
): QuestionTemplate {
  const seed = Math.abs(qNumber * 5 + variantSeed * 19 + topic.length * 7);
  const picked = TURKISH_QUESTION_BANK[seed % TURKISH_QUESTION_BANK.length];
  return {
    stem: `[${topic}] ${picked.stem}${difficulty === 'Zor' ? ' (Analitik Değerlendirme)' : ''}`,
    correct: picked.correct,
    distractors: picked.distractors,
    explanation: picked.explanation,
  };
}

function buildScienceQuestion(
  qNumber: number,
  subject: string,
  topic: string,
  difficulty: DifficultyLevel,
  variantSeed = 0
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  const seed = Math.abs(qNumber * 11 + variantSeed * 23 + topic.length * 3);

  if (sLow.includes('kimya')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] Periyodik sistemin aynı periyodunda soldan sağa doğru gidildikçe elementlerin atom yarıçapı ve elektronegatiflik değerlerindeki değişim aşağıdakilerden hangisinde doğru verilmiştir?`,
        correct: 'Atom yarıçapı genellikle azalır, elektronegatiflik genellikle artar.',
        distractors: [
          'Atom yarıçapı artar, elektronegatiflik azalır.',
          'Her ikisi de aynı oranda düzenli olarak azalır.',
          'Atom yarıçapı değişmez, elektronegatiflik sıfırlanır.',
          'Elektronegatiflik yalnızca soygazlarda en yüksek değere ulaşır.',
        ],
        explanation: 'Aynı periyotta sağa gidildikçe katman sayısı sabit kalırken proton sayısı arttığı için çekim güçlenir; yarıçap küçülür, elektronegatiflik artar.',
      },
      {
        stem: `[${topic}] Oda koşullarında pH değeri 2 olan sulu bir HCl çözeltisiyle ilgili aşağıdaki ifadelerden hangisi yanlıştır?`,
        correct: 'Turnusol kağıdının rengini kırmızıdan maviye çevirir.',
        distractors: [
          'Sulu çözeltisinde H+ iyonu derişimi OH- iyonundan büyüktür.',
          'Aktif metallerle tepkimeye girerek H2 gazı açığa çıkarır.',
          'Bazlarla nötralleşme tepkimesi verir.',
          'Elektrik akımını iyon hareketiyle iletir.',
        ],
        explanation: 'Asitler mavi turnusol kağıdını kırmızıya çevirir; kırmızıdan maviye çevirenler bazlardır.',
      },
      {
        stem: `[${topic}] Sabit sıcaklıkta doymamış bir tuzlu su çözeltisine bir miktar daha yemek tuzu eklenip çözündüğünde çözeltinin kütlece yüzde derişimi ve kaynama noktası nasıl değişir?`,
        correct: 'Kütlece yüzde derişim artar, kaynama noktası yükselir.',
        distractors: [
          'Her ikisi de azalır.',
          'Derişim artar, kaynama noktası düşer.',
          'Kaynama noktası sabit kalır, donma noktası yükselir.',
          'Çözeltinin yoğunluğu azalır.',
        ],
        explanation: 'Çözünen madde miktarı arttıkça derişim yükselir; koligatif özellik gereği kaynama noktası da artar.',
      },
      {
        stem: `[${topic}] Aşağıdaki atom modellerinden hangisi elektronların çekirdek çevresinde belirli enerji düzeylerinde (yörüngelerde) bulunduğunu ilk kez ortaya koymuştur?`,
        correct: 'Bohr Atom Modeli',
        distractors: ['Dalton Atom Modeli', 'Thomson Atom Modeli', 'Avogadro Hipotezi', 'Lavoisier Kütlenin Korunumu'],
        explanation: 'Niels Bohr, elektronların belirli enerjili yörüngelerde hareket ettiğini açıklayan atom modelini geliştirmiştir.',
      },
      {
        stem: `[${topic}] Bir kimyasal tepkimede tepkimeye giren maddelerin toplam kütlesi ile ürünlerin toplam kütlesi arasında nasıl bir ilişki vardır?`,
        correct: 'Kapalı sistemde toplam kütle her zaman korunur ve eşittir.',
        distractors: [
          'Ürünlerin kütlesi her zaman girenlerden fazladır.',
          'Gaz çıkışı olursa atom sayısı azalır.',
          'Sıcaklık arttıkça toplam kütle iki katına çıkar.',
          'Katalizör kullanımı ürün kütlesini artırır.',
        ],
        explanation: 'Kütlenin Korunumu Kanunu gereği atom türü ve sayısı değişmediğinden toplam kütle korunur.',
      },
    ];
    return items[seed % items.length];
  }

  if (sLow.includes('biyoloji')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] Ökaryot bir hücrede oksijenli solunumun Krebs döngüsü ve elektron taşıma sistemi (ETS) evreleri hangi organelde gerçekleşir?`,
        correct: 'Mitokondri',
        distractors: ['Ribozom', 'Golgi aygıtı', 'Lizozom', 'Endoplazmik retikulum'],
        explanation: 'Glikoliz sitoplazmada gerçekleşirken pirüvattan sonraki Krebs döngüsü ve ETS tepkimeleri mitokondride yürütülür.',
      },
      {
        stem: `[${topic}] Hücre zarından madde geçişlerinden aktif taşıma ile pasif taşıma arasındaki temel fark aşağıdakilerden hangisidir?`,
        correct: 'Aktif taşımada ATP enerjisi harcanır ve maddeler az yoğun ortamdan çok yoğun ortama taşınır.',
        distractors: [
          'Pasif taşıma yalnızca ölü hücrelerde, aktif taşıma yalnızca bitkilerde görülür.',
          'Aktif taşımada taşıyıcı proteinler ve enzimler görev almaz.',
          'Pasif taşımada hücre mutlaka enerji tüketir.',
          'Aktif taşıma sadece su moleküllerinin osmozunu kapsar.',
        ],
        explanation: 'Aktif taşıma derişim farkına karşı gerçekleştiği için ATP ve taşıyıcı protein gerektirir.',
      },
      {
        stem: `[${topic}] Bitki hücrelerinde bulunup gelişmiş hayvan hücrelerinde bulunmayan organel ve yapı eşleştirmesi aşağıdakilerden hangisidir?`,
        correct: 'Kloroplast ve hücre duvarı (çeperi)',
        distractors: [
          'Ribozom ve mitokondri',
          'Sentrozom ve lizozom',
          'Hücre zarı ve sitoplazma',
          'Golgi aygıtı ve çekirdek',
        ],
        explanation: 'Fotosentez yapan kloroplast ve selüloz yapılı hücre duvarı bitki hücrelerine özgüdür.',
      },
      {
        stem: `[${topic}] Mitoz bölünme sonucunda oluşan iki yeni hücrenin ana hücre ile karşılaştırıldığında hangi özelliği kesinlikle aynıdır?`,
        correct: 'Kromozom sayısı ve kalıtsal yapısı',
        distractors: [
          'Sitoplazma miktarının büyüklüğü',
          'Organel sayılarının birebir eşitliği',
          'Hücre hacmi ve yüzey alanı oranı',
          'Yaşam süreleri',
        ],
        explanation: 'Mitoz bölünme kalıtsal çeşitlilik oluşturmaz; kromozom sayısı ve gen dizilimi korunur.',
      },
      {
        stem: `[${topic}] İnsanda sindirim sisteminde proteinlerin kimyasal sindiriminin başladığı organ aşağıdakilerden hangisidir?`,
        correct: 'Mide',
        distractors: ['Ağız', 'Yemek borusu', 'Kalın bağırsak', 'Pankreas'],
        explanation: 'Midede salgılanan pepsin enzimi proteinlerin kimyasal sindirimini başlatır.',
      },
    ];
    return items[seed % items.length];
  }

  // Physics or General Science (6+ distinct items + parametric physics calculations)
  const mode = seed % 6;
  if (mode === 0) {
    const m = 4 + (seed % 6) * 2;
    const acc = 3 + (variantSeed % 4);
    const f = m * acc;
    return {
      stem: `[${topic}] Sürtünmesiz yatay düzlemde durmakta olan ${m} kg kütleli bir cisme yatay doğrultuda ${f} N büyüklüğünde net kuvvet uygulanıyor. Cismin kazanacağı ivme kaç m/s² olur?`,
      correct: `${acc} m/s²`,
      distractors: [`${acc + 2} m/s²`, `${Math.max(1, acc - 1)} m/s²`, `${f + m} m/s²`, `${acc * 2} m/s²`],
      explanation: `Newton'un ikinci hareket yasasına (F = m · a) göre a = F / m = ${f} / ${m} = ${acc} m/s² bulunur.`,
    };
  }
  if (mode === 1) {
    return {
      stem: `[${topic}] Bir ışık ışını kırıcılık indisi küçük olan hava ortamından kırıcılık indisi büyük olan cam ortamına normalle açı yapacak şekilde geçerken aşağıdakilerden hangisi gerçekleşir?`,
      correct: 'Işın normale yaklaşarak kırılır ve cam ortamındaki sürati azalır.',
      distractors: [
        'Işın normalden uzaklaşarak kırılır ve sürati artar.',
        'Işının frekansı iki katına çıkar ve doğrultusu değişmez.',
        'Tam yansıma gerçekleşir ve cam ortamına geçemez.',
        'Işının dalga boyu büyür ve hızı sabit kalır.',
      ],
      explanation: 'Az yoğun ortamdan çok yoğun ortama geçen ışık normale yaklaşır ve ortalama yayılma sürati düşer.',
    };
  }
  if (mode === 2) {
    return {
      stem: `[${topic}] Özdeş dirençlerle kurulan bir elektrik devresinde dirençler seri bağlanmak yerine paralel bağlanırsa devrenin eşdeğer direnci ve ana kol akımı nasıl değişir? (${difficulty} Seviye)`,
      correct: 'Eşdeğer direnç azalır, ana kol akımı artar.',
      distractors: [
        'Eşdeğer direnç artar, ana kol akımı azalır.',
        'Her ikisi de sabit kalır.',
        'Eşdeğer direnç sıfırlanır, gerilim artar.',
        'Eşdeğer direnç artar, gerilim düşer.',
      ],
      explanation: 'Paralel bağlamada eşdeğer direnç küçülür; Ohm yasasına (V = I · R) göre sabit gerilimde ana kol akımı artar.',
    };
  }
  if (mode === 3) {
    return {
      stem: `[${topic}] Saf bir maddenin hal değişimi sırasında sıcaklığının sabit kalmasının temel nedeni aşağıdakilerden hangisidir?`,
      correct: 'Verilen ısının taneciklerin kinetik enerjisini değil potansiyel enerjisini (bağ düzenini) değiştirmesi',
      distractors: [
        'Maddenin kütlesinin hal değişimi sırasında tamamen yok olması',
        'Isı kaynağının sıcaklığı otomatik olarak sıfıra düşürmesi',
        'Ortam basıncının her saniye yarıya inmesi',
        'Moleküller arası çekim kuvvetlerinin sonsuza ulaşması',
      ],
      explanation: 'Hal değişimi süresince alınan ısı moleküller arası bağları zayıflatarak potansiyel enerjiyi artırır; ortalama kinetik enerji sabit kaldığı için sıcaklık değişmez.',
    };
  }
  if (mode === 4) {
    const mass = 120 + (seed % 5) * 40;
    const vol = 30 + (variantSeed % 3) * 10;
    const density = Number((mass / vol).toFixed(1));
    return {
      stem: `[${topic}] Kütlesi ${mass} g ve hacmi ${vol} cm³ olan homojen bir katı cismin özkütlesi (yoğunluğu) kaç g/cm³ olur?`,
      correct: `${density}`,
      distractors: [`${Number((density + 1.5).toFixed(1))}`, `${Number((density * 2).toFixed(1))}`, `${mass - vol}`, `${Math.max(0.5, Number((density - 1).toFixed(1)))}`],
      explanation: `Özkütle d = m / V formülüyle ${mass} / ${vol} = ${density} g/cm³ olarak hesaplanır.`,
    };
  }
  return {
    stem: `[${topic}] Dünya'nın Güneş etrafındaki dolanma hareketi ve eksen eğikliği sonucunda aşağıdakilerden hangisi meydana gelir?`,
    correct: 'Yarım kürelerde aynı anda farklı mevsimlerin yaşanması ve gece-gündüz sürelerinin değişmesi',
    distractors: [
      'Gece ve gündüzün yalnızca bir kez oluşması',
      'Ay tutulmasının her gün gerçekleşmesi',
      'Kutuplarda yıl boyunca yalnızca yaz mevsiminin yaşanması',
      'Yer çekimi ivmesinin ekvatorda sıfırlanması',
    ],
    explanation: '23° 27′ eksen eğikliği ve yıllık dolanma mevsimlerin oluşumunu ve yıl içi gece-gündüz süre değişimini belirler.',
  };
}

function buildSocialQuestion(
  qNumber: number,
  subject: string,
  topic: string,
  variantSeed = 0
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  const seed = Math.abs(qNumber * 13 + variantSeed * 17 + topic.length * 5);

  if (sLow.includes('coğrafya')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] Türkiye'de kıyı kesimlerde nem oranının yüksek olması ve denizel etkinin görülmesi, sıcaklık farkları üzerinde nasıl bir etki oluşturur?`,
        correct: 'Günlük ve yıllık sıcaklık farklarının iç kesimlere göre daha az olmasını sağlar.',
        distractors: [
          'Kış aylarında sıcaklığın iç kesimlerden daha sert düşmesine yol açar.',
          'Yıl boyunca yalnızca konveksiyonel yağışların oluşmasını sağlar.',
          'Toprak oluşumunu tamamen durdurarak çölleşmeyi hızlandırır.',
          'Yaz mevsiminin iç bölgelerden daha kurak geçmesine neden olur.',
        ],
        explanation: 'Su kütleleri ve yüksek nem, ısıyı yavaş alıp yavaş verdiği için kıyı bölgelerde sıcaklık farklarını dengeler.',
      },
      {
        stem: `[${topic}] Harita ölçeğinin paydası büyütüldüğünde (örneğin 1/100.000'den 1/1.000.000'a geçildiğinde) haritada aşağıdakilerden hangisi gerçekleşir?`,
        correct: 'Ayrıntıyı gösterme gücü azalır, düzlemde kapladığı alan küçülür.',
        distractors: [
          'Harita daha büyük ölçekli hâle gelir ve ayrıntılar artar.',
          'Hata ve bozulma oranı tamamen ortadan kalkar.',
          'İzohipsler arasındaki yükselti farkı küçülür.',
          'Gerçek alan ile izdüşüm alan eşitlenir.',
        ],
        explanation: 'Payda büyüdükçe ölçek küçülür; küçülen ölçekle daha geniş alanlar gösterilir fakat ayrıntı azalır.',
      },
      {
        stem: `[${topic}] Akarsuların aşındırma ve biriktirme faaliyetleri sonucunda oluşturduğu yer şekillerinden hangisi yalnızca biriktirme şekli olarak sınıflandırılır?`,
        correct: 'Delta ovası ve birikinti konisi',
        distractors: ['Çentik vadi', 'Dev kazanı', 'Peri bacası', 'Kanyon vadi'],
        explanation: 'Eğimin azaldığı kıyı ve eteklerde taşınan alüvyonların yığılmasıyla delta ovası ve birikinti konileri oluşur.',
      },
    ];
    return items[seed % items.length];
  }

  if (sLow.includes('felsefe')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] Bilimsel bilginin doğruluğunu deney ve gözleme dayandıran, olgular dışındaki metafizik önermeleri anlamsız sayan bilgi kuramı yaklaşımı aşağıdakilerden hangisidir?`,
        correct: 'Pozitivizm (Olguculuk)',
        distractors: ['Rasyonalizm', 'Septisizm', 'Entüisyonizm', 'İdealizm'],
        explanation: 'Auguste Comte ile sistemleşen pozitivizm, yalnızca gözlemlenebilir ve sınanabilir olguların bilimsel bilgi oluşturabileceğini savunur.',
      },
      {
        stem: `[${topic}] Doğru bilginin doğuştan akılda bulunduğunu ve duyu verilerinin yanıltıcı olabileceğini savunan felsefi akım hangisidir?`,
        correct: 'Rasyonalizm (Akılcılık)',
        distractors: ['Empirizm', 'Pragmatizm', 'Pozitivizm', 'Nihilizm'],
        explanation: 'Rasyonalizm bilginin temel kaynağını deneyde değil insan aklında ve doğuştan gelen ilkelerde görür.',
      },
      {
        stem: `[${topic}] Bir eylemin ahlaki değerini yalnızca bireye ve topluma sağladığı fayda üzerinden ölçen etik anlayış aşağıdakilerden hangisidir?`,
        correct: 'Utilitarizm (Faydacılık)',
        distractors: ['Ödev Ahlakı', 'Stoacılık', 'Varoluşçuluk', 'Rasyonalizm'],
        explanation: 'Bentham ve Mill ile öne çıkan utilitarizm en çok sayıda insana en yüksek faydayı sağlayan eylemi iyi kabul eder.',
      },
    ];
    return items[seed % items.length];
  }

  if (sLow.includes('din')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] İslam düşüncesinde bireyin kendi iradesiyle yaptığı davranışların sorumluluğunu üstlenmesini ifade eden kavram aşağıdakilerden hangisidir?`,
        correct: 'Cüzî İrade',
        distractors: ['Külli İrade', 'Tevekkül', 'Sünnetullah', 'Rızık'],
        explanation: 'İnsana verilen sınırlı seçme özgürlüğü cüzî irade olarak adlandırılır ve sorumluluk bu iradeye dayanır.',
      },
      {
        stem: `[${topic}] Bir iş için gerekli tüm önlemleri alıp elinden gelen gayreti gösterdikten sonra sonucu Allah'a bırakmak aşağıdaki kavramlardan hangisiyle ifade edilir?`,
        correct: 'Tevekkül',
        distractors: ['İsraf', 'Tekebbür', 'Gıybet', 'İhlas'],
        explanation: 'Tevekkül, çalışma ve tedbirden sonra Allah\'a güvenip dayanmaktır.',
      },
      {
        stem: `[${topic}] İslam dininde maddi durumu yerinde olan Müslümanların yılda bir kez mallarının belirli bir oranını ihtiyaç sahiplerine vermesi hangi ibadettir?`,
        correct: 'Zekât',
        distractors: ['İtikâf', 'Teyemmüm', 'Kurban', 'Umre'],
        explanation: 'Zekât, nisap miktarı mala sahip olanların vermesi gereken farz bir mali ibadettir.',
      },
    ];
    return items[seed % items.length];
  }

  if (sLow.includes('ingilizce')) {
    const items: QuestionTemplate[] = [
      {
        stem: `[${topic}] Mark: "Why don't we join the science exhibition this Saturday?" / Elif: "____. I have to prepare for my math exam." Diyaloğu anlamlı biçimde tamamlayan seçenek hangisidir?`,
        correct: "I'd love to, but I can't make it.",
        distractors: [
          'That sounds awesome! What time shall we meet?',
          'Sure, count me in for the weekend.',
          "Don't mention it, you're always welcome.",
          'Yes, I already bought two tickets.',
        ],
        explanation: 'Elif matematik sınavına hazırlanması gerektiğini belirterek nazikçe mazeret bildiren reddetme ifadesini kullanmalıdır.',
      },
      {
        stem: `[${topic}] "Scientists are developing renewable energy sources ____ we can reduce carbon emissions." Boşluğa uygun bağlaç hangisidir?`,
        correct: 'so that',
        distractors: ['although', 'unless', 'because of', 'despite'],
        explanation: 'Amaç bildiren yan cümle kurmak için "so that" (-sın diye / amacıyla) bağlacı kullanılır.',
      },
      {
        stem: `[${topic}] Teacher: "How often do you revise your school notes?" / Kerem: "____. That's why I feel ready before every quiz." Diyaloğa uygun ifade hangisidir?`,
        correct: 'Every evening without skipping a day',
        distractors: [
          'Almost never, I dislike studying',
          'Only once a year after summer',
          'I forgot where my notebook is',
          'No, I prefer watching cartoons all night',
        ],
        explanation: 'Kerem sınavlara her zaman hazır hissettiğini söylediğine göre notlarını düzenli olarak tekrar etmektedir.',
      },
      {
        stem: `[${topic}] Which sentence expresses a polite request in a classroom conversation?`,
        correct: 'Could you please repeat the last question?',
        distractors: [
          'Close the door right now!',
          'I am not listening to anyone.',
          'Why did you arrive late yesterday?',
          'Give me that pen immediately.',
        ],
        explanation: '"Could you please..." kalıbı İngilizcede nazik bir rica bildirmek için kullanılır.',
      },
    ];
    return items[seed % items.length];
  }

  // Tarih / Sosyal Bilgiler / Hayat Bilgisi (6 distinct items)
  const items: QuestionTemplate[] = [
    {
      stem: `[${topic}] Amasya Genelgesi'nde yer alan "Milletin bağımsızlığını yine milletin azim ve kararı kurtaracaktır" maddesiyle aşağıdakilerden hangisi vurgulanmıştır?`,
      correct: 'Milli mücadelenin yöntemi ve ulusal egemenlik ilkesi',
      distractors: [
        'Ekonomik kapitülasyonların genişletilmesi',
        'Yabancı manda ve himayenin kabul edilmesi',
        'Saltanat yönetiminin kalıcı olarak güçlendirilmesi',
        'Azınlıklara ayrı devlet kurma hakkı tanınması',
      ],
      explanation: 'Genelgenin bu maddesi kurtuluşun millet iradesiyle gerçekleşeceğini belirterek ulusal egemenlik düşüncesini ortaya koymuştur.',
    },
    {
      stem: `[${topic}] İlk Çağ uygarlıklarında ticaret yollarının (Kral Yolu, İpek Yolu) gelişmesi toplumlar arasında öncelikle hangi alanda hızlanmaya yol açmıştır?`,
      correct: 'Kültürel etkileşim ve bilimsel bilginin yayılması',
      distractors: [
        'Yerleşik yaşamın tamamen terk edilmesi',
        'Sözlü hukuk kurallarının yasaklanması',
        'Tarım faaliyetlerinin tümüyle sona ermesi',
        'Şehir devletlerinin dışa kapanması',
      ],
      explanation: 'Ticaret yolları yalnızca mal değişimini değil; yazı, alfabe, teknik buluş ve kültürlerin taşınmasını da sağlamıştır.',
    },
    {
      stem: `[${topic}] Cumhuriyetin ilanından sonra kabul edilen Tevhid-i Tedrisat Kanunu ile eğitim alanında ulaşılmak istenen temel amaç aşağıdakilerden hangisidir?`,
      correct: 'Tüm eğitim kurumlarını tek çatı altında toplayarak çağdaş ve eşit eğitim sağlamak',
      distractors: [
        'Okullardaki fen ve matematik derslerini azaltmak',
        'Eğitim yönetimini tamamen yerel belediyelere devretmek',
        'Yabancı okullara yeni ayrıcalıklar tanımak',
        'Zorunlu ilköğretimi beş yıldan bir yıla indirmek',
      ],
      explanation: '3 Mart 1924 tarihli Tevhid-i Tedrisat Kanunu ile eğitim-öğretim birleştirilerek laik ve ulusal bir sistem kurulmuştur.',
    },
    {
      stem: `[${topic}] Toplum içinde bireylerin sahip olduğu hakları kullanırken başkalarının haklarına saygı göstermesi aşağıdaki kavramlardan hangisiyle doğrudan ilgilidir?`,
      correct: 'Vatandaşlık bilinci ve toplumsal sorumluluk',
      distractors: [
        'Ekonomik tekelcilik',
        'Bireysel ayrıcalık arayışı',
        'Coğrafi göç hareketi',
        'Tarihsel kronoloji yanılgısı',
      ],
      explanation: 'Haklar ancak sorumluluk bilinciyle dengelendiğinde demokratik ve huzurlu bir toplumsal yaşam sürdürülür.',
    },
    {
      stem: `[${topic}] Sanayi İnkılabı ile birlikte insan ve hayvan gücünün yerini buharlı makinelerin alması dünya tarihinde hangi sonucu doğurmuştur?`,
      correct: 'Seri üretimin hızlanması, kentleşmenin artması ve ham madde arayışının büyümesi',
      distractors: [
        'Tarımsal üretimin tüm dünyada tamamen yasaklanması',
        'Şehir nüfusunun köylere göre hızla azalması',
        'Deniz ticaretinin sona ermesi',
        'Matbaanın icadının gecikmesi',
      ],
      explanation: 'Makineleşme fabrika üretimini ve kente göçü hızlandırarak küresel ticaret dengelerini değiştirmiştir.',
    },
    {
      stem: `[${topic}] Türkiye Selçuklu Devleti döneminde Anadolu'nun önemli ticaret yolları üzerine kervansaraylar yapılmasının öncelikli amacı nedir?`,
      correct: 'Tüccarların güvenliğini sağlayarak uluslararası ticareti canlandırmak',
      distractors: [
        'Tarım arazilerini tamamen ormanlaştırmak',
        'Deniz filoları için tersane kurmak',
        'Yerel dillerin yazılışını yasaklamak',
        'Göçebe toplulukları yalnızca dağlık bölgelere yönlendirmek',
      ],
      explanation: 'Kervansaraylar üç gün ücretsiz konaklama ve güvenlik sunarak Anadolu ticaret ağını güçlendirmiştir.',
    },
  ];
  return items[seed % items.length];
}

export function generateRealisticQuestionContent(
  qNumber: number,
  subject: string,
  topic: string,
  difficulty: DifficultyLevel,
  profile: GradeProfile,
  variantSeed = 0
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  if (sLow.includes('mat')) {
    return buildMathQuestion(qNumber, topic, difficulty, profile, variantSeed);
  }
  if (sLow.includes('türk') || sLow.includes('edebiyat')) {
    return buildTurkishQuestion(qNumber, topic, difficulty, variantSeed);
  }
  if (
    sLow.includes('fen') ||
    sLow.includes('fizik') ||
    sLow.includes('kimya') ||
    sLow.includes('biyoloji')
  ) {
    return buildScienceQuestion(qNumber, subject, topic, difficulty, variantSeed);
  }
  return buildSocialQuestion(qNumber, subject, topic, variantSeed);
}

export { pickVariant };
