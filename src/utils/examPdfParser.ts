import { getGradeProfile } from '../data/curriculum';
import {
  DifficultyLevel,
  EnglishScenePresetId,
  ExamQuestion,
  GradeProfile,
  PdfUploadStripOptions,
  QuestionVisualSpec,
  QuestionVisualType,
} from '../types/academy';

export const ENGLISH_SCENE_PRESETS: Array<{
  id: EnglishScenePresetId;
  label: string;
  title: string;
  sceneLabels: string[];
  sampleStem: string;
  sampleOptions: Record<string, string>;
  sampleCorrect: string;
}> = [
  {
    id: 'weather',
    label: 'Hava Durumu (Weather)',
    title: 'Weekly Weather Forecast Chart',
    sceneLabels: ['Mon: Sunny 28°C', 'Tue: Windy 18°C', 'Wed: Rainy 12°C', 'Thu: Snowy 1°C'],
    sampleStem:
      'Look at the weather forecast visual above. Which day do you need an umbrella and a raincoat?',
    sampleOptions: {
      A: 'On Monday, because it is sunny and hot.',
      B: 'On Wednesday, because it is rainy.',
      C: 'On Tuesday, because it is only windy.',
      D: 'On Thursday, because it is hot and dry.',
      E: 'Every day of the weekend.',
    },
    sampleCorrect: 'B',
  },
  {
    id: 'daily-routine',
    label: 'Günlük Rutin (Daily Routine)',
    title: 'Tom’s Morning Routine',
    sceneLabels: ['07:00 Wake up', '07:30 Have breakfast', '08:15 Take school bus', '15:30 Read books'],
    sampleStem:
      'According to the visual above, what does Tom do right after waking up at half past seven?',
    sampleOptions: {
      A: 'He sleeps again.',
      B: 'He rides his bike to the library.',
      C: 'He has breakfast with his family.',
      D: 'He plays computer games at midnight.',
      E: 'He finishes his evening dinner.',
    },
    sampleCorrect: 'C',
  },
  {
    id: 'classroom-objects',
    label: 'Sınıf Eşyaları (Classroom)',
    title: 'Classroom Desk & Objects',
    sceneLabels: ['3 Pencils', '2 Notebooks', '1 Ruler', '1 Blue Backpack'],
    sampleStem:
      'Look at the school bag picture above. How many notebooks are on the desk?',
    sampleOptions: {
      A: 'There is one notebook.',
      B: 'There are two notebooks.',
      C: 'There are three notebooks.',
      D: 'There are five rulers.',
      E: 'There are four backpacks.',
    },
    sampleCorrect: 'B',
  },
  {
    id: 'food-menu',
    label: 'Yiyecek Menüsü (Cafe Menu)',
    title: 'Healthy School Canteen Menu',
    sceneLabels: ['Sandwich: 35 TL', 'Fresh Apple: 15 TL', 'Milk: 20 TL', 'Orange Juice: 25 TL'],
    sampleStem:
      'Emma has 55 TL and wants to buy one sandwich and one milk. How much money does she pay in total?',
    sampleOptions: {
      A: '45 TL',
      B: '50 TL',
      C: '55 TL',
      D: '60 TL',
      E: '65 TL',
    },
    sampleCorrect: 'C',
  },
  {
    id: 'city-directions',
    label: 'Şehir Haritası (My Town)',
    title: 'Neighborhood Map: Places & Directions',
    sceneLabels: ['Library ↔ Bakery', 'School (Next to Park)', 'Hospital (Opposite Cinema)'],
    sampleStem:
      'Look at the town map above. Where is the school located according to the park?',
    sampleOptions: {
      A: 'It is next to the park.',
      B: 'It is behind the cinema.',
      C: 'It is between the bank and pool.',
      D: 'It is far from the neighborhood.',
      E: 'It is inside the hospital.',
    },
    sampleCorrect: 'A',
  },
];

export function computeKeptUploadedPdfIndices(
  totalPages: number,
  options: PdfUploadStripOptions
): number[] {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [0];

  const startIdx = options.stripFrontCover ? 1 : 0;
  let endExclusive = totalPages;
  if (options.stripBackCover && endExclusive - startIdx >= 2) {
    endExclusive -= 1;
  }
  const indices: number[] = [];
  for (let i = startIdx; i < endExclusive; i++) {
    indices.push(i);
  }
  return indices.length > 0 ? indices : [0];
}

export function buildVisualQuestionPreset(
  kind: QuestionVisualType,
  gradeProfile: GradeProfile,
  nextNumber: number,
  scenePresetId: EnglishScenePresetId = 'weather'
): ExamQuestion {
  const letters =
    gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const pickOpts = (map: Record<string, string>) => {
    const out: Record<string, string> = {};
    letters.forEach((l) => {
      out[l] = map[l] ?? `${l} seçeneği`;
    });
    return out;
  };

  if (kind === 'chart') {
    const mathSubj =
      gradeProfile.subjects.find((s) => /matematik/i.test(s.name))?.name ??
      gradeProfile.subjects[0]?.name ??
      'Matematik';
    const visual: QuestionVisualSpec = {
      type: 'chart',
      title: 'Haftalık Çözülen Soru Sayısı Grafiği',
      yAxisLabel: 'Soru Sayısı',
      caption: 'Bir öğrencinin 4 günlük çalışma performansı sütun grafiğiyle verilmiştir.',
      bars: [
        { label: 'Pazartesi', value: 40 },
        { label: 'Salı', value: 55 },
        { label: 'Çarşamba', value: 35 },
        { label: 'Perşembe', value: 70 },
      ],
    };
    return {
      id: `q-chart-${Date.now()}-${nextNumber}`,
      number: nextNumber,
      subject: mathSubj,
      topic: 'Veri Analizi & Sütun Grafiği',
      gainCode: `${gradeProfile.id}.VERI.GRF`,
      difficulty: 'Orta',
      stem: `Yukarıdaki sütun grafiğinde bir öğrencinin dört gün boyunca çözdüğü soru sayıları verilmiştir. Buna göre 4 günlük günlük ortalama soru sayısı kaçtır?`,
      options: pickOpts({
        A: '45 soru',
        B: '50 soru',
        C: '55 soru',
        D: '60 soru',
        E: '65 soru',
      }),
      correctOption: 'B',
      explanation: 'Toplam soru: 40 + 55 + 35 + 70 = 200. Gün sayısı 4 olduğundan ortalama 200 / 4 = 50 bulunur.',
      source: 'Müfredat Havuzu',
      visual,
    };
  }

  if (kind === 'table') {
    const mathSubj =
      gradeProfile.subjects.find((s) => /matematik|fen/i.test(s.name))?.name ??
      gradeProfile.subjects[0]?.name ??
      'Matematik';
    const visual: QuestionVisualSpec = {
      type: 'table',
      title: 'Kırtasiye Ürün Fiyat ve Adet Tablosu',
      caption: 'Tablodaki ürünlerden belirtilen adetlerde alışveriş yapılmıştır.',
      headers: ['Ürün Adı', 'Birim Fiyat (TL)', 'Alınan Adet', 'Toplam (TL)'],
      rows: [
        ['Defter', '45 TL', '3 adet', '135 TL'],
        ['Kalem Seti', '60 TL', '2 adet', '120 TL'],
        ['Cetvel', '25 TL', '2 adet', '?'],
      ],
    };
    return {
      id: `q-table-${Date.now()}-${nextNumber}`,
      number: nextNumber,
      subject: mathSubj,
      topic: 'Tablolu Problemler & Dört İşlem',
      gainCode: `${gradeProfile.id}.MAT.TBL`,
      difficulty: 'Orta',
      stem: 'Yukarıdaki tabloda bir öğrencinin aldığı kırtasiye ürünleri gösterilmiştir. Tüm ürünler için ödenen toplam tutar kaç TL’dir?',
      options: pickOpts({
        A: '275 TL',
        B: '295 TL',
        C: '305 TL',
        D: '325 TL',
        E: '340 TL',
      }),
      correctOption: 'C',
      explanation: 'Cetvel tutarı 25 × 2 = 50 TL. Genel toplam: 135 + 120 + 50 = 305 TL olur.',
      source: 'Müfredat Havuzu',
      visual,
    };
  }

  if (kind === 'math') {
    const mathSubj =
      gradeProfile.subjects.find((s) => /matematik/i.test(s.name))?.name ??
      gradeProfile.subjects[0]?.name ??
      'Matematik';
    const isUpper =
      gradeProfile.category === 'Lise' || gradeProfile.category === 'Üniversite Hazırlık (YKS)';
    const visual: QuestionVisualSpec = isUpper
      ? {
          type: 'math',
          title: 'Dik Üçgen & Denklem İşlemi',
          formula: 'Alan(ABC) = (a · b) / 2   |   a = 6 cm, b = 8 cm, c = 10 cm',
          steps: ['1. Dik kenarları belirle: a = 6 cm, b = 8 cm', '2. Hipotenüs: √(6² + 8²) = 10 cm'],
          geometryShape: 'triangle',
          caption: 'ABC dik üçgeninde dik kenar uzunlukları verilmiştir.',
        }
      : {
          type: 'math',
          title: 'Kesir & Çevre İşlemi',
          formula: 'Kısa Kenar = 12 cm   |   Uzun Kenar = 18 cm   |   Çevre = 2 × (12 + 18)',
          steps: ['Karşılıklı kenarlar eşittir.', 'Boyalı kesir: 3/4 + 1/4 = 1 tam'],
          geometryShape: 'rectangle',
          caption: 'Dikdörtgen şeklin kenar uzunlukları yukarıda verilmiştir.',
        };
    return {
      id: `q-math-${Date.now()}-${nextNumber}`,
      number: nextNumber,
      subject: mathSubj,
      topic: isUpper ? 'Üçgenler ve Alan Hesabı' : 'Çevre ve Alan İşlemleri',
      gainCode: `${gradeProfile.id}.MAT.GEO`,
      difficulty: 'Orta',
      stem: isUpper
        ? 'Yukarıdaki dik üçgende verilen kenar uzunluklarına göre ABC üçgeninin alanı kaç cm² dir?'
        : 'Yukarıdaki dikdörtgen şeklin kenar uzunluklarına göre çevresi kaç cm dir?',
      options: isUpper
        ? pickOpts({ A: '18', B: '24', C: '30', D: '40', E: '48' })
        : pickOpts({ A: '48 cm', B: '54 cm', C: '60 cm', D: '72 cm', E: '84 cm' }),
      correctOption: isUpper ? 'B' : 'C',
      explanation: isUpper
        ? 'Alan = (6 × 8) / 2 = 24 cm².'
        : 'Çevre = 2 × (12 + 18) = 2 × 30 = 60 cm.',
      source: 'Müfredat Havuzu',
      visual,
    };
  }

  // 'image': Resimli İngilizce sorusu
  const engSubj =
    gradeProfile.subjects.find((s) => /ingilizce|yabancı/i.test(s.name))?.name ?? 'İngilizce';
  const scene =
    ENGLISH_SCENE_PRESETS.find((p) => p.id === scenePresetId) ?? ENGLISH_SCENE_PRESETS[0];
  const visual: QuestionVisualSpec = {
    type: 'image',
    title: scene.title,
    caption: 'Look at the picture and answer the question carefully.',
    scenePresetId: scene.id,
    sceneLabels: scene.sceneLabels,
  };
  return {
    id: `q-img-${Date.now()}-${nextNumber}`,
    number: nextNumber,
    subject: engSubj,
    topic: `Visual English (${scene.label})`,
    gainCode: `${gradeProfile.id}.ING.IMG`,
    difficulty: 'Kolay',
    stem: scene.sampleStem,
    options: pickOpts(scene.sampleOptions),
    correctOption: scene.sampleCorrect,
    explanation: `Görseldeki "${scene.sceneLabels.join(', ')}" ipuçlarına göre doğru seçenek ${scene.sampleCorrect} şıkkıdır.`,
    source: 'Müfredat Havuzu',
    visual,
  };
}

export function extractPrintableTextFromPdfBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);
  // Extract readable parenthesized PDF text literals when present, or plain text lines
  const literalMatches = raw.match(/\(([^()\\]{3,160})\)/g);
  if (literalMatches && literalMatches.length >= 6) {
    return literalMatches
      .map((m) => m.slice(1, -1))
      .filter((s) => /[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/.test(s))
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 24000);
  }
  const utfText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return utfText
    .replace(/[^\x20-\x7E\n\rçğıöşüÇĞİÖŞÜİŞĞÜÖÇ]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .slice(0, 24000);
}

export function parseExamQuestionsFromRawText(
  rawText: string,
  gradeProfile: GradeProfile,
  sourceName = 'Yüklenen Deneme PDF',
  maxCount = 12
): ExamQuestion[] {
  const letters =
    gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const normalizedText = rawText.replace(/\r\n/g, '\n').trim();

  // Split by question start markers: "1.", "1)", "Soru 1:"
  const blocks = normalizedText
    .split(/(?:^|\n)\s*(?:Soru\s*)?(\d{1,3})\s*[.)\-:]\s+/i)
    .filter((b) => b.trim().length > 0);

  const parsed: ExamQuestion[] = [];
  for (let i = 0; i + 1 < blocks.length && parsed.length < maxCount; i += 2) {
    const qNumRaw = Number(blocks[i]);
    const body = blocks[i + 1];
    if (!Number.isFinite(qNumRaw) || !body || body.length < 8) continue;

    // Split options A) ... B) ... C) ... D) ... E)
    const optRegex = /(?:^|\s)([A-E])\s*[).]\s*([^\n]+?)(?=(?:\s+[A-E]\s*[).]\s)|\n|$)/g;
    const optionsMap: Record<string, string> = {};
    let firstOptionIdx = body.length;
    let match: RegExpExecArray | null;
    while ((match = optRegex.exec(body)) !== null) {
      if (match.index < firstOptionIdx) firstOptionIdx = match.index;
      const optLetter = match[1].toUpperCase();
      if (letters.includes(optLetter)) {
        optionsMap[optLetter] = match[2].trim();
      }
    }

    const stem = body.slice(0, firstOptionIdx).replace(/\s+/g, ' ').trim();
    if (stem.length < 6) continue;

    const completeOptions: Record<string, string> = {};
    letters.forEach((l) => {
      completeOptions[l] = optionsMap[l] || `${l} şıkkı (${sourceName})`;
    });

    const answerMatch = body.match(/(?:Cevap|Doğru(?:\s*Cevap)?|Yanıt)\s*[:\-]?\s*([A-E])/i);
    const correctOption =
      answerMatch && letters.includes(answerMatch[1].toUpperCase())
        ? answerMatch[1].toUpperCase()
        : letters[parsed.length % letters.length];

    const matchedSubject =
      gradeProfile.subjects.find((s) =>
        body.toLowerCase().includes(s.name.toLowerCase())
      )?.name ?? gradeProfile.subjects[parsed.length % gradeProfile.subjects.length].name;

    parsed.push({
      id: `pdf-parsed-${Date.now()}-${parsed.length + 1}`,
      number: parsed.length + 1,
      subject: matchedSubject,
      topic: `${sourceName.replace(/\.[^.]+$/, '')} Soru ${parsed.length + 1}`,
      gainCode: `${gradeProfile.id}.PDF.${parsed.length + 1}`,
      difficulty: (['Kolay', 'Orta', 'Zor'] as DifficultyLevel[])[parsed.length % 3],
      stem,
      options: completeOptions,
      correctOption,
      explanation: `${sourceName} belgesinden otomatik aktarıldı.`,
      source: 'PDF Kitapçık',
    });
  }

  if (parsed.length > 0) {
    return parsed;
  }

  // Resilient fallback if uploaded PDF had scanned images or minimal selectable text
  const count = Math.min(maxCount, 6);
  const cleanName = sourceName.replace(/\.[^.]+$/, '').slice(0, 36);
  const fallback: ExamQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const subj = gradeProfile.subjects[i % gradeProfile.subjects.length];
    const topic = subj.topics[i % subj.topics.length] || subj.name;
    if (i === 1) {
      fallback.push({
        ...buildVisualQuestionPreset('chart', gradeProfile, i + 1),
        source: 'PDF Kitapçık',
        topic: `${topic} (${cleanName})`,
      });
    } else if (i === 2) {
      fallback.push({
        ...buildVisualQuestionPreset('table', gradeProfile, i + 1),
        source: 'PDF Kitapçık',
        topic: `${topic} (${cleanName})`,
      });
    } else if (i === 3) {
      fallback.push({
        ...buildVisualQuestionPreset('image', gradeProfile, i + 1, 'weather'),
        source: 'PDF Kitapçık',
      });
    } else {
      const opts: Record<string, string> = {};
      letters.forEach((l, li) => {
        opts[l] = `${topic} — ${l} seçeneği (${li + 1}. önerme)`;
      });
      fallback.push({
        id: `pdf-gen-${Date.now()}-${i + 1}`,
        number: i + 1,
        subject: subj.name,
        topic,
        gainCode: `${gradeProfile.id}.${subj.id.toUpperCase()}.PDF${i + 1}`,
        difficulty: (['Kolay', 'Orta', 'Zor'] as DifficultyLevel[])[i % 3],
        stem: `[${cleanName}] ${gradeProfile.shortLabel} ${subj.name} — "${topic}" kazanımı doğrultusunda hazırlanan ${i + 1}. soruyu düzenleyebilirsiniz.`,
        options: opts,
        correctOption: letters[i % letters.length],
        explanation: `${cleanName} PDF belgesinden oluşturulan soru taslağı.`,
        source: 'PDF Kitapçık',
      });
    }
  }
  return fallback;
}

export function normalizeIncomingQuestionList(
  rawQuestions: Array<Partial<ExamQuestion>>,
  gradeId: GradeProfile['id'],
  fallbackSourceName = 'PDF Kitapçık'
): ExamQuestion[] {
  const gp = getGradeProfile(gradeId);
  const letters = gp.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  return rawQuestions.map((q, idx) => {
    const opts: Record<string, string> = {};
    letters.forEach((l) => {
      opts[l] = q.options?.[l] ?? `${l} seçeneği`;
    });
    const correct =
      q.correctOption && letters.includes(q.correctOption.toUpperCase())
        ? q.correctOption.toUpperCase()
        : letters[0];
    return {
      id: q.id || `pdf-q-${Date.now()}-${idx + 1}`,
      number: idx + 1,
      subject: q.subject || gp.subjects[idx % gp.subjects.length].name,
      topic: q.topic || gp.subjects[idx % gp.subjects.length].topics[0] || 'Genel',
      gainCode: q.gainCode || `${gp.id}.PDF.${idx + 1}`,
      difficulty: (q.difficulty as DifficultyLevel) || 'Orta',
      stem: q.stem || `${fallbackSourceName} — Soru ${idx + 1}`,
      options: opts,
      correctOption: correct,
      explanation: q.explanation || `${fallbackSourceName} üzerinden otomatik oluşturuldu.`,
      source: 'PDF Kitapçık',
      visual: q.visual,
    };
  });
}
