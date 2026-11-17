import { DifficultyLevel, GradeProfile } from '../types/academy';

interface QuestionTemplate {
  stem: string;
  correct: string;
  distractors: [string, string, string, string];
  explanation: string;
}

function pickVariant(seed: number, options: string[]): string {
  return options[seed % options.length];
}

function buildMathQuestion(
  qNumber: number,
  topic: string,
  difficulty: DifficultyLevel,
  profile: GradeProfile
): QuestionTemplate {
  const isLower = profile.category === 'İlkokul' || Number(profile.id) <= 6;
  const variant = (qNumber + topic.length) % 6;

  if (isLower) {
    const a = 24 + (qNumber % 15) * 4;
    const b = 12 + (qNumber % 7) * 3;
    if (variant % 3 === 0) {
      const total = a * 3 + b;
      return {
        stem: `Bir okul kütüphanesinin 3 rafının her birinde ${a} adet hikâye kitabı vardır. Kütüphaneye ${b} yeni kitap daha bağışlandığına göre toplam kitap sayısı kaç olur?`,
        correct: `${total}`,
        distractors: [`${total - 12}`, `${total + 10}`, `${a + b}`, `${total + 24}`],
        explanation: `3 raftaki kitap sayısı 3 × ${a} = ${a * 3} olur. ${b} yeni kitap eklendiğinde toplam ${total} kitap elde edilir.`,
      };
    }
    if (variant % 3 === 1) {
      const side = 6 + (qNumber % 9);
      const area = side * (side + 4);
      const perimeter = 2 * (side + side + 4);
      return {
        stem: `Kısa kenarı ${side} cm, uzun kenarı kısa kenarından 4 cm fazla olan dikdörtgen şeklindeki bir panonun çevresi kaç santimetredir?`,
        correct: `${perimeter} cm`,
        distractors: [`${area} cm`, `${perimeter - 8} cm`, `${side * 4} cm`, `${perimeter + 6} cm`],
        explanation: `Uzun kenar ${side + 4} cm olur. Çevre = 2 × (${side} + ${side + 4}) = ${perimeter} cm bulunur.`,
      };
    }
    const whole = 180 + (qNumber % 6) * 30;
    const part = whole / 3;
    return {
      stem: `Bir kırtasiyeci elindeki ${whole} adet kalemin önce 1/3'ünü, ardından kalan kalemlerin 25 tanesini satmıştır. Kırtasiyecide kaç kalem kalmıştır?`,
      correct: `${whole - part - 25}`,
      distractors: [`${part + 25}`, `${whole - part}`, `${whole - part - 15}`, `${part - 25}`],
      explanation: `${whole} kalemin 1/3'ü ${part} tanedir. Kalan ${whole - part} kalemden 25 çıkarıldığında ${whole - part - 25} kalem kalır.`,
    };
  }

  // Middle School / High School / TYT / AYT realistic math items
  if (variant === 0) {
    const baseRate = 12 + (qNumber % 8) * 3;
    const discount = 20 + (qNumber % 3) * 5;
    const orig = baseRate * 10;
    const sale = Math.round(orig * (1 - discount / 100));
    return {
      stem: `[${topic}] Bir kırtasiye zinciri, etiket fiyatı ${orig} TL olan bir soru bankası setine önce %${discount} indirim uyguluyor. Kasada öğrencilere indirimli fiyat üzerinden 15 TL daha ek indirim yapıldığına göre bu setin son satış fiyatı kaç TL olur?`,
      correct: `${sale - 15} TL`,
      distractors: [`${sale} TL`, `${sale - 25} TL`, `${orig - discount - 15} TL`, `${sale + 15} TL`],
      explanation: `${orig} TL'nin %${discount} indirimi sonucu fiyat ${sale} TL olur. Ek 15 TL indirimle satış fiyatı ${sale - 15} TL'dir.`,
    };
  }
  if (variant === 1) {
    const xVal = 3 + (qNumber % 5);
    const k = 2 + (qNumber % 4);
    const rhs = k * xVal + 7;
    return {
      stem: `[${topic}] Gerçel sayılar kümesinde ${k}(x - 1) + ${k + 7} = ${rhs} denklemini sağlayan x değeri aşağıdakilerden hangisidir?`,
      correct: `${xVal}`,
      distractors: [`${xVal - 1}`, `${xVal + 2}`, `${xVal + 4}`, `${xVal - 2}`],
      explanation: `${k}x - ${k} + ${k + 7} = ${rhs} eşitliğinden ${k}x + 7 = ${rhs} => ${k}x = ${k * xVal} => x = ${xVal} bulunur.`,
    };
  }
  if (variant === 2) {
    const v1 = 60 + (qNumber % 4) * 10;
    const v2 = 80 + (qNumber % 3) * 10;
    const hrs = 2 + (qNumber % 3);
    const dist = (v1 + v2) * hrs;
    return {
      stem: `[${topic}] Aralarında ${dist} km uzaklık bulunan A ve B kentlerinden sırasıyla saatte ${v1} km ve ${v2} km sabit hızlarla birbirlerine doğru aynı anda harekete başlayan iki araç kaç saat sonra karşılaşır?`,
      correct: `${hrs} saat`,
      distractors: [`${hrs + 1} saat`, `${hrs + 2} saat`, `${Math.max(1, hrs - 1)} saat`, `${hrs + 0.5} saat`],
      explanation: `Araçların birbirine yaklaşma hızı ${v1} + ${v2} = ${v1 + v2} km/sa'tir. Karşılaşma süresi ${dist} / ${v1 + v2} = ${hrs} saattir.`,
    };
  }
  if (variant === 3) {
    const n = 2 + (qNumber % 4);
    const exp = n + 3;
    return {
      stem: `[${topic}] Üslü ifadeler kuralına göre (2^${n} · 8^${n - 1}) / 4^${n - 1} işleminin sadeleştirilmiş değeri aşağıdakilerden hangisidir?`,
      correct: `2^${2 * n - 1}`,
      distractors: [`2^${exp}`, `2^${n + 1}`, `4^${n}`, `2^${3 * n}`],
      explanation: `8^${n - 1} = 2^${3 * (n - 1)} ve 4^${n - 1} = 2^${2 * (n - 1)} olduğundan üsler toplanıp çıkarılır: ${n} + ${3 * n - 3} - (${2 * n - 2}) = ${2 * n - 1}.`,
    };
  }
  if (variant === 4) {
    const angleA = 40 + (qNumber % 5) * 8;
    const angleB = 55 + (qNumber % 4) * 5;
    const extC = angleA + angleB;
    return {
      stem: `[${topic}] Bir ABC üçgeninde m(BAC) = ${angleA}° ve m(ABC) = ${angleB}° olduğuna göre C köşesine ait dış açının ölçüsü kaç derecedir?`,
      correct: `${extC}°`,
      distractors: [`${180 - extC}°`, `${extC - 15}°`, `${extC + 10}°`, `${180 - angleA}°`],
      explanation: `Bir üçgende bir dış açının ölçüsü, kendisine komşu olmayan iki iç açının ölçüleri toplamına eşittir: ${angleA}° + ${angleB}° = ${extC}°.`,
    };
  }
  const red = 4 + (qNumber % 4);
  const blue = 6 + (qNumber % 3);
  const total = red + blue;
  return {
    stem: `[${topic}] İçinde özdeş ${red} kırmızı ve ${blue} mavi bilye bulunan bir torbadan rastgele seçilen bir bilyenin kırmızı olma olasılığı kaçtır? (${difficulty} Düzey)`,
    correct: `${red}/${total}`,
    distractors: [`${blue}/${total}`, `1/${red}`, `${red}/${blue}`, `${red - 1}/${total}`],
    explanation: `Toplam örnek uzay ${red} + ${blue} = ${total} bilyeden oluşur. İstenen kırmızı bilye sayısı ${red} olduğu için olasılık ${red}/${total} olur.`,
  };
}

function buildTurkishQuestion(
  qNumber: number,
  topic: string,
  difficulty: DifficultyLevel
): QuestionTemplate {
  const idx = qNumber % 6;
  if (idx === 0) {
    return {
      stem: `[${topic}] "Bir eserin kalıcılığını sağlayan asıl güç, yazarın döneminin geçici beğenilerine değil insanlığın değişmeyen iç dünyasına seslenebilmesidir." Bu cümlede asıl anlatılmak istenen düşünce aşağıdakilerden hangisidir?`,
      correct: 'Evrensel insani duyguları işleyen yapıtlar çağlar boyu değerini korur.',
      distractors: [
        'Yazarlar yalnızca kendi dönemlerinin toplumsal sorunlarını anlatmalıdır.',
        'Okur kitlesinin beğenisi zamanla değiştiği için eski eserler unutulur.',
        'Sanatçıların dili sade tutması eserin satış başarısını belirler.',
        'Eleştirmenlerin övdüğü her eser klasikleşme özelliği taşır.',
      ],
      explanation: 'Cümlede geçici beğeniler yerine insanlığın ortak ve değişmeyen iç dünyasına seslenen eserlerin kalıcı olacağı vurgulanmaktadır.',
    };
  }
  if (idx === 1) {
    return {
      stem: `[${topic}] (I) Sabahın erken saatlerinde sis, vadiyi ince bir tül gibi örtmüştü. (II) Uzaktan gelen tren düdüğü sessizliği bölen tek sesti. (III) İstasyon memuru elindeki feneri kaldırarak rayları kontrol etti. (IV) Bu küçük kasaba son yıllarda turizm açısından oldukça gelişmişti. Yukarıdaki numaralanmış cümlelerden hangisi düşüncenin akışını bozmaktadır?`,
      correct: 'IV',
      distractors: ['I', 'II', 'III', 'II ve III'],
      explanation: 'İlk üç cümlede sisli bir sabahta istasyondaki atmosfer betimlenirken IV. cümle kasabanın turizm gelişimine geçerek akışı bozmaktadır.',
    };
  }
  if (idx === 2) {
    return {
      stem: `[${topic}] Aşağıdaki cümlelerin hangisinde "yapım eki aldığı hâlde anlam değişmesine uğramamış" veya yazım yanlışı bulunan bir sözcük vardır?`,
      correct: 'Bu hafta sonu birçok öğrenci kütüphanede ki masalarda çalıştı.',
      distractors: [
        'Sınav kitapçığındaki soruların tamamını dikkatle okudu.',
        'Öğretmenimiz yarınki deneme hakkında ayrıntılı bilgi verdi.',
        'Herkes sonuçların açıklanacağı saati sabırsızlıkla bekliyordu.',
        'Başarılı olmak için düzenli tekrar yapmayı ihmal etmedi.',
      ],
      explanation: '"kütüphanede ki" ifadesinde sıfat yapan -ki eki bitişik yazılmalıdır ("kütüphanedeki").',
    };
  }
  if (idx === 3) {
    return {
      stem: `[${topic}] "Okumak, yalnızca sayfalar arasında gezinmek değil; başka hayatların penceresinden kendi ruhumuza bakabilmektir." Bu cümlede altı çizili bölümle anlatılmak istenen aşağıdakilerden hangisidir?`,
      correct: 'Farklı yaşantıları tanıyarak insanın kendini daha iyi anlaması',
      distractors: [
        'Çok sayıda kitap bitirerek hızlı okuma alışkanlığı kazanmak',
        'Yalnızca biyografi ve anı türündeki eserlere yönelmek',
        'Günlük yaşamın gerçeklerinden tamamen uzaklaşmak',
        'Yazarların üslup özelliklerini eleştirel gözle incelemek',
      ],
      explanation: '"Başka hayatların penceresinden kendi ruhumuza bakmak" empati yoluyla öz farkındalık kazanmayı ifade eder.',
    };
  }
  if (idx === 4) {
    return {
      stem: `[${topic}] Aşağıdaki cümlelerin hangisinde virgül (,) diğerlerinden farklı bir görevde kullanılmıştır? (${difficulty} Seviye)`,
      correct: 'Öğrenciler, deneme salonuna sessizce girip yerlerine oturdu.',
      distractors: [
        'Masanın üzerinde kalem, silgi, açacak ve optik form duruyordu.',
        'Türkçe, matematik ve fen testlerini sırasıyla tamamladı.',
        'Sabah erkenden kalktı, kahvaltısını yaptı, okulun yolunu tuttu.',
        'Kitaplar, defterler, not kağıtları düzenli bir biçimde dizilmişti.',
      ],
      explanation: 'Doğru seçenekte virgül özneyi yüklemden uzak düştüğü için belirginleştirmek amacıyla, diğerlerinde eş görevli sözcükleri/sıralı cümleleri ayırmak için kullanılmıştır.',
    };
  }
  return {
    stem: `[${topic}] "${pickVariant(qNumber, ['Teknoloji hızla ilerledikçe', 'Bilgi kaynakları çeşitlendikçe'])} okurun metinlerle kurduğu bağ da dönüşüyor. Ancak derinlikli düşünme becerisi hâlâ sabırlı bir okuma kültürü gerektiriyor." Bu parçadan aşağıdakilerden hangisine ulaşılabilir?`,
    correct: 'Araçlar değişse de nitelikli anlama için dikkatli ve sabırlı okuma şarttır.',
    distractors: [
      'Dijital çağda basılı kitapların tamamı işlevini yitirmiştir.',
      'Hızlı bilgi tüketimi eleştirel düşünmeyi otomatik olarak artırır.',
      'Modern okurlar artık uzun metinleri hiçbir şekilde okuyamamaktadır.',
      'Teknolojik gelişmeler okuma hızını düşüren tek etkendir.',
    ],
    explanation: 'Parçada araçların değişmesine karşın derinlikli düşünmenin sabırlı okuma gerektirdiği vurgulanmaktadır.',
  };
}

function buildScienceQuestion(
  qNumber: number,
  subject: string,
  topic: string,
  difficulty: DifficultyLevel
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  const idx = qNumber % 5;

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
    ];
    return items[idx % items.length];
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
    ];
    return items[idx % items.length];
  }

  // Physics or General Science
  if (idx === 0) {
    const m = 4 + (qNumber % 5) * 2;
    const f = m * (3 + (qNumber % 3));
    const acc = f / m;
    return {
      stem: `[${topic}] Sürtünmesiz yatay düzlemde durmakta olan ${m} kg kütleli bir cisme yatay doğrultuda ${f} N büyüklüğünde net kuvvet uygulanıyor. Cismin kazanacağı ivme kaç m/s² olur?`,
      correct: `${acc} m/s²`,
      distractors: [`${acc + 2} m/s²`, `${Math.max(1, acc - 1)} m/s²`, `${f + m} m/s²`, `${acc * 2} m/s²`],
      explanation: `Newton'un ikinci hareket yasasına (F = m · a) göre a = F / m = ${f} / ${m} = ${acc} m/s² bulunur.`,
    };
  }
  if (idx === 1) {
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
  if (idx === 2) {
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

function buildSocialQuestion(
  qNumber: number,
  subject: string,
  topic: string
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  const idx = qNumber % 4;

  if (sLow.includes('coğrafya')) {
    return idx % 2 === 0
      ? {
          stem: `[${topic}] Türkiye'de kıyı kesimlerde nem oranının yüksek olması ve denizel etkinin görülmesi, sıcaklık farkları üzerinde nasıl bir etki oluşturur?`,
          correct: 'Günlük ve yıllık sıcaklık farklarının iç kesimlere göre daha az olmasını sağlar.',
          distractors: [
            'Kış aylarında sıcaklığın iç kesimlerden daha sert düşmesine yol açar.',
            'Yıl boyunca yalnızca konveksiyonel yağışların oluşmasını sağlar.',
            'Toprak oluşumunu tamamen durdurarak çölleşmeyi hızlandırır.',
            'Yaz mevsiminin iç bölgelerden daha kurak geçmesine neden olur.',
          ],
          explanation: 'Su kütleleri ve yüksek nem, ısıyı yavaş alıp yavaş verdiği için kıyı bölgelerde sıcaklık farklarını dengeler.',
        }
      : {
          stem: `[${topic}] Harita ölçeğinin paydası büyütüldüğünde (örneğin 1/100.000'den 1/1.000.000'a geçildiğinde) haritada aşağıdakilerden hangisi gerçekleşir?`,
          correct: 'Ayrıntıyı gösterme gücü azalır, düzlemde kapladığı alan küçülür.',
          distractors: [
            'Harita daha büyük ölçekli hâle gelir ve ayrıntılar artar.',
            'Hata ve bozulma oranı tamamen ortadan kalkar.',
            'İzohipsler arasındaki yükselti farkı küçülür.',
            'Gerçek alan ile izdüşüm alan eşitlenir.',
          ],
          explanation: 'Payda büyüdükçe ölçek küçülür; küçülen ölçekle daha geniş alanlar gösterilir fakat ayrıntı azalır.',
        };
  }

  if (sLow.includes('felsefe')) {
    return {
      stem: `[${topic}] Bilimsel bilginin doğruluğunu deney ve gözleme dayandıran, olgular dışındaki metafizik önermeleri anlamsız sayan bilgi kuramı yaklaşımı aşağıdakilerden hangisidir?`,
      correct: 'Pozitivizm (Olguculuk)',
      distractors: ['Rasyonalizm', 'Septisizm', 'Entüisyonizm', 'İdealizm'],
      explanation: 'Auguste Comte ile sistemleşen pozitivizm, yalnızca gözlemlenebilir ve sınanabilir olguların bilimsel bilgi oluşturabileceğini savunur.',
    };
  }

  if (sLow.includes('din')) {
    return {
      stem: `[${topic}] İslam düşüncesinde bireyin kendi iradesiyle yaptığı davranışların sorumluluğunu üstlenmesini ifade eden kavram aşağıdakilerden hangisidir?`,
      correct: 'Cüzî İrade',
      distractors: ['Külli İrade', 'Tevekkül', 'Sünnetullah', 'Rızık'],
      explanation: 'İnsana verilen sınırlı seçme özgürlüğü cüzî irade olarak adlandırılır ve sorumluluk bu iradeye dayanır.',
    };
  }

  if (sLow.includes('ingilizce')) {
    return idx % 2 === 0
      ? {
          stem: `[${topic}] Mark: "Why don't we join the science exhibition this Saturday?" / Elif: "____. I have to prepare for my math exam." Diyaloğu anlamlı biçimde tamamlayan seçenek hangisidir?`,
          correct: "I'd love to, but I can't make it.",
          distractors: [
            'That sounds awesome! What time shall we meet?',
            'Sure, count me in for the weekend.',
            "Don't mention it, you're always welcome.",
            'Yes, I already bought two tickets.',
          ],
          explanation: 'Elif matematik sınavına hazırlanması gerektiğini belirterek nazikçe mazeret bildiren reddetme ifadesini kullanmalıdır.',
        }
      : {
          stem: `[${topic}] "Scientists are developing renewable energy sources ____ we can reduce carbon emissions." Boşluğa uygun bağlaç hangisidir?`,
          correct: 'so that',
          distractors: ['although', 'unless', 'because of', 'despite'],
          explanation: 'Amaç bildiren yan cümle kurmak için "so that" (-sın diye / amacıyla) bağlacı kullanılır.',
        };
  }

  // Tarih / Sosyal Bilgiler / Hayat Bilgisi
  return idx % 2 === 0
    ? {
        stem: `[${topic}] Amasya Genelgesi'nde yer alan "Milletin bağımsızlığını yine milletin azim ve kararı kurtaracaktır" maddesiyle aşağıdakilerden hangisi vurgulanmıştır?`,
        correct: 'Milli mücadelenin yöntemi ve ulusal egemenlik ilkesi',
        distractors: [
          'Ekonomik kapitülasyonların genişletilmesi',
          'Yabancı manda ve himayenin kabul edilmesi',
          'Saltanat yönetiminin kalıcı olarak güçlendirilmesi',
          'Azınlıklara ayrı devlet kurma hakkı tanınması',
        ],
        explanation: 'Genelgenin bu maddesi kurtuluşun millet iradesiyle gerçekleşeceğini belirterek ulusal egemenlik düşüncesini ortaya koymuştur.',
      }
    : {
        stem: `[${topic}] İlk Çağ uygarlıklarında ticaret yollarının (Kral Yolu, İpek Yolu) gelişmesi toplumlar arasında öncelikle hangi alanda hızlanmaya yol açmıştır?`,
        correct: 'Kültürel etkileşim ve bilimsel bilginin yayılması',
        distractors: [
          'Yerleşik yaşamın tamamen terk edilmesi',
          'Sözlü hukuk kurallarının yasaklanması',
          'Tarım faaliyetlerinin tümüyle sona ermesi',
          'Şehir devletlerinin dışa kapanması',
        ],
        explanation: 'Ticaret yolları yalnızca mal değişimini değil; yazı, alfabe, teknik buluş ve kültürlerin taşınmasını da sağlamıştır.',
      };
}

export function generateRealisticQuestionContent(
  qNumber: number,
  subject: string,
  topic: string,
  difficulty: DifficultyLevel,
  profile: GradeProfile
): QuestionTemplate {
  const sLow = subject.toLocaleLowerCase('tr-TR');
  if (sLow.includes('mat')) {
    return buildMathQuestion(qNumber, topic, difficulty, profile);
  }
  if (sLow.includes('türk') || sLow.includes('edebiyat')) {
    return buildTurkishQuestion(qNumber, topic, difficulty);
  }
  if (
    sLow.includes('fen') ||
    sLow.includes('fizik') ||
    sLow.includes('kimya') ||
    sLow.includes('biyoloji')
  ) {
    return buildScienceQuestion(qNumber, subject, topic, difficulty);
  }
  return buildSocialQuestion(qNumber, subject, topic);
}
