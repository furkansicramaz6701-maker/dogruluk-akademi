import {
  DifficultyLevel,
  ExamQuestion,
  GradeProfile,
  OpenEndedQuestion,
} from '../types/academy';
import { sanitizeExamLabelForGrade } from './weeklyAnalysis';

export type TextbookExamKind = 'deneme' | 'yazili-test' | 'yazili-acik-uclu';

export interface TextbookAnalysisResult {
  summary: string;
  detectedSubject: string;
  topics: string[];
  questionHeadings: string[];
  method: 'ai' | 'local';
}

export const DEFAULT_QUESTION_HEADING_PRESETS: string[] = [
  'Kavram & Tanım Doğrulama',
  'Günlük Yaşam & Yeni Nesil Problem',
  'Okuduğunu Anlama & Paragraf Yorumu',
  'Tablo / Grafik / Şekil Yorumlama',
  'Sebep-Sonuç & Karşılaştırma',
  'İşlem Basamakları & Uygulama',
];

function dedupeTurkish(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const clean = raw
      .replace(/^(?:\d+\s*[.):\-]+\s*|[.\-*•\s]+)/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length < 2) continue;
    const key = clean.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function parseCommaOrLineHeadings(input: string): string[] {
  if (!input.trim()) return [];
  const parts = input
    .replace(/\r\n/g, '\n')
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return dedupeTurkish(parts);
}

function getOptionLetters(optionCount: 4 | 5): string[] {
  return optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
}

function detectSubjectFromText(
  rawText: string,
  gradeProfile: GradeProfile,
  explicitSubject?: string
): string {
  if (explicitSubject && explicitSubject !== 'Tümü') {
    const exact = gradeProfile.subjects.find(
      (s) => s.name.toLocaleLowerCase('tr-TR') === explicitSubject.toLocaleLowerCase('tr-TR')
    );
    if (exact) return exact.name;
  }

  const lower = rawText.toLocaleLowerCase('tr-TR');
  let bestSubject = gradeProfile.subjects[0]?.name ?? 'Türkçe';
  let bestScore = -1;

  for (const subj of gradeProfile.subjects) {
    let score = 0;
    const subjNameLower = subj.name.toLocaleLowerCase('tr-TR');
    if (lower.includes(subjNameLower)) score += 5;
    for (const topic of subj.topics) {
      const words = topic
        .toLocaleLowerCase('tr-TR')
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      for (const w of words) {
        if (lower.includes(w)) score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSubject = subj.name;
    }
  }

  return bestSubject;
}

function extractSentences(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 240);
}

function extractUnitAndTopicLines(rawText: string): string[] {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || clean.length > 90) continue;

    // Match explicit unit/chapter/topic headings, numbered headings, or short title lines
    const isUnit =
      /^(?:\d+\.?\s*)?(?:ünite|bölüm|konu|kazanım|başlık)\s*[:.-]?\s+/i.test(clean) ||
      /^\d+(?:\.\d+)*[.)]\s+[A-ZÇĞİÖŞÜ]/u.test(clean);
    const isTitleLike =
      clean.split(/\s+/).length <= 8 &&
      !/[.!?]$/.test(clean) &&
      /[A-ZÇĞİÖŞÜa-zçğıöşü]{3,}/.test(clean);

    if (isUnit || isTitleLike) {
      const stripped = clean
        .replace(/^(?:\d+\.?\s*)?(?:ünite|bölüm|konu|kazanım|başlık)\s*[:.-]?\s*/i, '')
        .replace(/^\d+(?:\.\d+)*[.)]\s*/, '')
        .trim();
      if (stripped.length >= 3 && stripped.length <= 75) {
        candidates.push(stripped);
      }
    }
  }

  return dedupeTurkish(candidates);
}

export function analyzeTextbookTopicsAndHeadings(params: {
  rawText: string;
  fileName?: string;
  gradeProfile: GradeProfile;
  subjectName?: string;
}): TextbookAnalysisResult {
  const { rawText, fileName, gradeProfile, subjectName } = params;
  const cleanedText = rawText.trim();
  const detectedSubject = detectSubjectFromText(cleanedText, gradeProfile, subjectName);

  const matchedSubjectSpec =
    gradeProfile.subjects.find((s) => s.name === detectedSubject) ?? gradeProfile.subjects[0];

  const extractedLines = extractUnitAndTopicLines(cleanedText);
  const curriculumTopics =
    (!cleanedText && (subjectName === 'Tümü' || !subjectName))
      ? gradeProfile.subjects.flatMap((s) => s.topics.slice(0, 3))
      : matchedSubjectSpec?.topics ?? [];

  // Prefer textbook-extracted lines first, then curriculum topics aligned with the grade
  const safeExtracted = extractedLines.map((t) => sanitizeExamLabelForGrade(t, gradeProfile));
  const combinedTopics = dedupeTurkish([...safeExtracted, ...curriculumTopics]).slice(0, 12);

  const lower = cleanedText.toLocaleLowerCase('tr-TR');
  const dynamicHeadings: string[] = [];

  if (combinedTopics[0]) {
    dynamicHeadings.push(`${combinedTopics[0]} — Kavram & Uygulama`);
  }
  if (combinedTopics[1]) {
    dynamicHeadings.push(`${combinedTopics[1]} — Problem & Yorum`);
  }
  if (/örnek|problem|hesapla|işlem|oran|sayı|kesir|denklem/i.test(lower)) {
    dynamicHeadings.push('Günlük Yaşam & Yeni Nesil Problem');
    dynamicHeadings.push('İşlem Basamakları & Uygulama');
  }
  if (/metin|paragraf|cümle|anlam|yazar|ana düşünce|okuma/i.test(lower)) {
    dynamicHeadings.push('Okuduğunu Anlama & Paragraf Yorumu');
  }
  if (/deney|gözlem|tablo|grafik|veri|ölçüm|hipotez/i.test(lower)) {
    dynamicHeadings.push('Tablo / Grafik / Şekil Yorumlama');
  }
  if (/neden|sonuç|karşılaştır|fark|benzer/i.test(lower)) {
    dynamicHeadings.push('Sebep-Sonuç & Karşılaştırma');
  }

  const questionHeadings = dedupeTurkish([
    ...dynamicHeadings,
    ...DEFAULT_QUESTION_HEADING_PRESETS,
  ]).slice(0, 8);

  const sentenceCount = extractSentences(cleanedText).length;
  const sourceLabel = fileName ? `"${fileName}"` : 'ders kitabı metni';
  const summary = cleanedText
    ? `${gradeProfile.shortLabel} ${detectedSubject} kapsamında ${sourceLabel} incelendi (${sentenceCount} cümle / ${combinedTopics.length} konu başlığı tespit edildi).`
    : `${gradeProfile.shortLabel} ${detectedSubject} müfredatından ${combinedTopics.length} konu başlığı ve ${questionHeadings.length} soru başlığı hazırlandı.`;

  return {
    summary,
    detectedSubject,
    topics: combinedTopics,
    questionHeadings,
    method: 'local',
  };
}

function buildContextualStem(params: {
  gradeProfile: GradeProfile;
  subject: string;
  topic: string;
  heading: string;
  snippet: string;
  index: number;
  examKind: 'deneme' | 'yazili-test';
}): {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
} {
  const { gradeProfile, subject, topic, heading, snippet, index, examKind } = params;
  const kindPrefix =
    examKind === 'yazili-test' ? `[${heading}] ` : `[${heading}] `;
  const contextLead = snippet
    ? `Ders kitabındaki "${snippet.slice(0, 150)}${snippet.length > 150 ? '...' : ''}" açıklamasına göre, `
    : `${gradeProfile.shortLabel} ${subject} dersinin "${topic}" konusu kapsamında, `;

  const headingLower = heading.toLocaleLowerCase('tr-TR');

  if (headingLower.includes('tablo') || headingLower.includes('grafik') || headingLower.includes('şekil')) {
    return {
      stem: `${kindPrefix}${contextLead}"${topic}" ile ilgili veriler incelendiğinde aşağıdakilerden hangisi en doğru çıkarımdır?`,
      options: [
        `${topic} sürecindeki temel ilişki düzenli ve tutarlı bir artış/değişim göstermektedir`,
        `${topic} verileri arasında hiçbir kavramsal bağ bulunmamaktadır`,
        `Ölçüm sonuçları yalnızca tek bir örnekle genellenebilir`,
        `Konu başlığı yalnızca ezber bilgiye dayanmaktadır`,
        `Tüm değişkenler birbirinden tamamen bağımsız hareket eder`,
      ],
      correctIndex: index % gradeProfile.optionCount,
      explanation: `"${topic}" konusunun "${heading}" odağında veriler arası temel ilişki doğru yorumlanmalıdır.`,
    };
  }

  if (headingLower.includes('problem') || headingLower.includes('işlem') || /matematik|fizik|kimya/i.test(subject)) {
    const base = 12 + (index % 6) * 4;
    const step = 3 + (index % 4);
    const total = base * step;
    return {
      stem: `${kindPrefix}${contextLead}"${topic}" kazanımını pekiştiren bir uygulamada her gün ${base} birimlik çalışma ${step} gün boyunca sürdürülüyor. Toplam kazanım miktarı kaçtır?`,
      options: [
        `${total}`,
        `${total + step * 2}`,
        `${Math.max(4, total - base)}`,
        `${total + base}`,
        `${total + step * 4}`,
      ],
      correctIndex: index % (gradeProfile.optionCount),
      explanation: `İşlem adımı: ${base} × ${step} = ${total}. "${topic}" konusunda adım adım hesaplama gerekir.`,
    };
  }

  if (headingLower.includes('paragraf') || headingLower.includes('okuduğunu') || /türkçe|edebiyat/i.test(subject)) {
    return {
      stem: `${kindPrefix}${contextLead}"${topic}" başlığı altında vurgulanan temel düşünce aşağıdakilerden hangisidir?`,
      options: [
        `${topic} konusunun temel ilkelerini örneklerle anlamak ve doğru yorumlamak`,
        `Metindeki ana fikri göz ardı ederek yalnızca başlığa odaklanmak`,
        `Kavramlar arasındaki anlam bütünlüğünü birbirinden koparmak`,
        `Yalnızca yüzeysel bilgilere bakarak kesin yargıya varmak`,
        `Metinde hiç geçmeyen ilgisiz sonuçları doğru kabul etmek`,
      ],
      correctIndex: index % gradeProfile.optionCount,
      explanation: `Parça ve ders kitabı bağlamında "${topic}" ana düşüncesi doğru seçenekte özetlenmiştir.`,
    };
  }

  if (headingLower.includes('sebep') || headingLower.includes('karşılaştır')) {
    return {
      stem: `${kindPrefix}${contextLead}"${topic}" konusunda sebep-sonuç ilişkisi kurulduğunda hangi değerlendirme doğrudur?`,
      options: [
        `${topic} sürecinde temel etken değiştiğinde ortaya çıkan sonuç doğrudan etkilenir`,
        `Sebep ve sonuç arasında mantıksal bir sıralama aranmaz`,
        `Farklı durumlar karşılaştırılırken ortak ölçüt kullanılmaz`,
        `Doğru sonuca ulaşmak için verilerin yarısı ihmal edilmelidir`,
        `Kavramsal nedenler sonucu hiçbir koşulda değiştirmez`,
      ],
      correctIndex: index % gradeProfile.optionCount,
      explanation: `"${topic}" başlığında neden-sonuç bağlamı doğrudan etkileşim üzerine kuruludur.`,
    };
  }

  return {
    stem: `${kindPrefix}${contextLead}"${topic}" ile ilgili aşağıdaki ifadelerden hangisi ders kitabı kazanımlarına uygun ve doğrudur?`,
    options: [
      `${topic} kavramı, ${gradeProfile.shortLabel} düzeyindeki temel ilke ve örneklerle tutarlı biçimde açıklanır`,
      `${topic} konusu diğer ünitelerle hiçbir ilişki kurmadan değerlendirilir`,
      `Konuyla ilgili temel tanımlar uygulamada geçerliliğini tamamen yitirir`,
      `Yanlış örnekler doğru kural yerine ölçüt kabul edilir`,
      `Kazanımın anlaşılması için kaynak metindeki veriler dikkate alınmaz`,
    ],
    correctIndex: index % gradeProfile.optionCount,
    explanation: `"${topic}" konusu "${heading}" başlığı altında temel tanım ve doğrulama ölçütüne göre çözümlenir.`,
  };
}

function rotateOptionTexts(
  rawOptions: string[],
  targetCorrectIndex: number,
  letters: string[]
): { options: Record<string, string>; correctOption: string } {
  const safeCorrectText = rawOptions[0];
  const distractors = rawOptions.slice(1, letters.length);
  const arranged: string[] = new Array(letters.length);
  const safeTarget = ((targetCorrectIndex % letters.length) + letters.length) % letters.length;
  arranged[safeTarget] = safeCorrectText;

  let dIdx = 0;
  for (let i = 0; i < letters.length; i++) {
    if (i === safeTarget) continue;
    arranged[i] = distractors[dIdx] ?? `Seçenek ${letters[i]}`;
    dIdx++;
  }

  const optionsObj: Record<string, string> = {};
  letters.forEach((l, idx) => {
    optionsObj[l] = arranged[idx];
  });

  return {
    options: optionsObj,
    correctOption: letters[safeTarget],
  };
}

export function normalizeTextbookMcqQuestions(params: {
  incoming: Array<Partial<ExamQuestion>>;
  gradeProfile: GradeProfile;
  fallbackSubject: string;
  topics: string[];
  questionHeadings: string[];
}): ExamQuestion[] {
  const { incoming, gradeProfile, fallbackSubject, topics, questionHeadings } = params;
  const letters = getOptionLetters(gradeProfile.optionCount);

  return incoming.map((q, idx) => {
    const topic = sanitizeExamLabelForGrade(
      q.topic || topics[idx % Math.max(1, topics.length)] || 'Ders Kitabı Konusu',
      gradeProfile
    );
    const heading = questionHeadings[idx % Math.max(1, questionHeadings.length)] || 'Kavram & Uygulama';
    const rawOpts = q.options ?? {};
    const options: Record<string, string> = {};

    letters.forEach((letter, lIdx) => {
      options[letter] =
        rawOpts[letter]?.trim() ||
        `${topic} ile ilgili ${lIdx + 1}. seçenek değerlendirmesi`;
    });

    const upperCorrect = String(q.correctOption ?? 'A').trim().toUpperCase();
    const correctOption = letters.includes(upperCorrect) ? upperCorrect : letters[0];

    const difficulty: DifficultyLevel =
      q.difficulty === 'Kolay' || q.difficulty === 'Orta' || q.difficulty === 'Zor'
        ? q.difficulty
        : idx % 3 === 0
          ? 'Kolay'
          : idx % 3 === 1
            ? 'Orta'
            : 'Zor';

    const rawStem = (q.stem ?? '').trim();
    const stemHasHeading = rawStem.startsWith('[') || rawStem.toLocaleLowerCase('tr-TR').includes(heading.toLocaleLowerCase('tr-TR'));
    const stem = rawStem
      ? stemHasHeading
        ? rawStem
        : `[${heading}] ${rawStem}`
      : `[${heading}] ${topic} konusuyla ilgili soru ${idx + 1}`;

    return {
      id: `tb-mcq-${Date.now()}-${idx + 1}`,
      number: idx + 1,
      subject: sanitizeExamLabelForGrade(q.subject || fallbackSubject, gradeProfile),
      topic,
      gainCode: q.gainCode || `DK.${gradeProfile.id}.${idx + 1}`,
      difficulty,
      stem,
      options,
      correctOption,
      explanation:
        q.explanation?.trim() ||
        `"${topic}" konusunda "${heading}" başlığına göre doğru cevap ${correctOption} seçeneğidir.`,
      source: 'Ders Kitabı',
    };
  });
}

export function normalizeTextbookOpenEndedQuestions(params: {
  incoming: Array<Partial<OpenEndedQuestion>>;
  gradeProfile: GradeProfile;
  fallbackSubject: string;
  topics: string[];
  questionHeadings: string[];
}): OpenEndedQuestion[] {
  const { incoming, gradeProfile, fallbackSubject, topics, questionHeadings } = params;
  const count = Math.max(1, incoming.length);
  const basePoint = Math.floor(100 / count);
  const remainder = 100 - basePoint * count;

  return incoming.map((q, idx) => {
    const topic = sanitizeExamLabelForGrade(
      q.topic || topics[idx % Math.max(1, topics.length)] || 'Ders Kitabı Konusu',
      gradeProfile
    );
    const heading = questionHeadings[idx % Math.max(1, questionHeadings.length)] || 'Açık Uçlu Yorum';
    const rawPrompt = (q.prompt ?? '').trim();
    const prompt = rawPrompt
      ? rawPrompt.startsWith('[')
        ? rawPrompt
        : `[${heading}] ${rawPrompt}`
      : `[${heading}] ${topic} konusunu ders kitabındaki bilgilere dayanarak açıklayınız.`;
    const modelAnswer =
      q.modelAnswer?.trim() ||
      `${topic} kavramının temel tanımı ve örnek açıklaması eksiksiz verilmelidir.`;
    const keywords =
      Array.isArray(q.keywords) && q.keywords.length > 0
        ? q.keywords.slice(0, 6)
        : dedupeTurkish([
            ...topic.split(/\s+/).filter((w) => w.length >= 4),
            ...heading.split(/\s+/).filter((w) => w.length >= 4),
          ]).slice(0, 5);

    return {
      id: `tb-oe-${Date.now()}-${idx + 1}`,
      number: idx + 1,
      subject: sanitizeExamLabelForGrade(q.subject || fallbackSubject, gradeProfile),
      topic: `${topic} (${heading})`,
      maxPoints:
        typeof q.maxPoints === 'number' && q.maxPoints > 0
          ? q.maxPoints
          : basePoint + (idx < remainder ? 1 : 0),
      prompt,
      modelAnswer,
      keywords,
    };
  });
}

export function buildQuestionsFromTextbookSelection(params: {
  gradeProfile: GradeProfile;
  subjectName: string;
  examKind: TextbookExamKind;
  count: number;
  difficulty: 'dengeli' | 'Kolay' | 'Orta' | 'Zor';
  topics: string[];
  questionHeadings: string[];
  rawText: string;
}): {
  mcqQuestions: ExamQuestion[];
  openEndedQuestions: OpenEndedQuestion[];
} {
  const {
    gradeProfile,
    subjectName,
    examKind,
    count,
    difficulty,
    topics,
    questionHeadings,
    rawText,
  } = params;

  const activeSubject =
    subjectName && subjectName !== 'Tümü'
      ? subjectName
      : gradeProfile.subjects[0]?.name ?? 'Türkçe';

  const safeTopics =
    topics.length > 0
      ? topics
      : gradeProfile.subjects.find((s) => s.name === activeSubject)?.topics ?? [
          `${gradeProfile.shortLabel} Temel Konu`,
        ];

  const safeHeadings =
    questionHeadings.length > 0 ? questionHeadings : DEFAULT_QUESTION_HEADING_PRESETS.slice(0, 4);

  const sentences = extractSentences(rawText);
  const safeCount = Math.min(40, Math.max(1, count));

  if (examKind === 'yazili-acik-uclu') {
    const basePoint = Math.floor(100 / safeCount);
    const remainder = 100 - basePoint * safeCount;
    const openEndedQuestions: OpenEndedQuestion[] = [];

    for (let i = 0; i < safeCount; i++) {
      const topic = sanitizeExamLabelForGrade(safeTopics[i % safeTopics.length], gradeProfile);
      const heading = safeHeadings[i % safeHeadings.length];
      const snippet = sentences.length > 0 ? sentences[i % sentences.length] : '';
      const subjectForItem =
        subjectName === 'Tümü'
          ? gradeProfile.subjects[i % gradeProfile.subjects.length]?.name ?? activeSubject
          : activeSubject;

      const contextPart = snippet
        ? `Ders kitabındaki "${snippet.slice(0, 140)}${snippet.length > 140 ? '...' : ''}" bilgisinden hareketle; `
        : `${gradeProfile.shortLabel} ${subjectForItem} dersi kapsamında; `;

      let prompt = `[${heading}] ${contextPart}"${topic}" konusunu kendi cümlelerinizle açıklayıp 1 somut örnek veriniz.`;
      let modelAnswer = `${topic} kavramının temel tanımı doğru yapılmalı, ${heading.toLocaleLowerCase('tr-TR')} odağında geçerli bir örnek yazılmalıdır.`;

      if (/problem|işlem|matematik/i.test(`${heading} ${subjectForItem}`)) {
        const x = 14 + i * 2;
        const y = 3 + (i % 4);
        prompt = `[${heading}] ${contextPart}"${topic}" konusuyla ilgili olarak bir öğrenci her aşamada ${x} birim veri işleyip ${y} tekrar uygulamaktadır. Toplam sonucu işlem basamaklarını göstererek bulunuz.`;
        modelAnswer = `1. Aşama: Verilen değerler (${x} ve ${y}) yazılır. 2. Aşama: ${x} × ${y} = ${x * y} bulunur. Sonuç birimiyle ifade edilir.`;
      } else if (/sebep|karşılaştır/i.test(heading)) {
        prompt = `[${heading}] ${contextPart}"${topic}" ile ilgili iki temel durum veya kavram arasındaki benzerlik ve farkları sebep-sonuç ilişkisi kurarak maddeler halinde yazınız.`;
        modelAnswer = `En az iki geçerli karşılaştırma ölçütü verilmeli ve sebep-sonuç bağı açıkça kurulmalıdır.`;
      }

      const keywords = dedupeTurkish([
        ...topic.split(/\s+/).filter((w) => w.length >= 4),
        ...heading.split(/\s+/).filter((w) => w.length >= 4),
        'örnek',
        'açıklama',
      ]).slice(0, 6);

      openEndedQuestions.push({
        id: `tb-local-oe-${Date.now()}-${i + 1}`,
        number: i + 1,
        subject: subjectForItem,
        topic: `${topic} (${heading})`,
        maxPoints: basePoint + (i < remainder ? 1 : 0),
        prompt,
        modelAnswer,
        keywords,
      });
    }

    return { mcqQuestions: [], openEndedQuestions };
  }

  // Multiple-choice: 'deneme' or 'yazili-test'
  const letters = getOptionLetters(gradeProfile.optionCount);
  const mcqQuestions: ExamQuestion[] = [];

  for (let i = 0; i < safeCount; i++) {
    const topic = sanitizeExamLabelForGrade(safeTopics[i % safeTopics.length], gradeProfile);
    const heading = safeHeadings[i % safeHeadings.length];
    const snippet = sentences.length > 0 ? sentences[i % sentences.length] : '';
    const subjectForItem =
      subjectName === 'Tümü'
        ? gradeProfile.subjects[i % gradeProfile.subjects.length]?.name ?? activeSubject
        : activeSubject;

    const built = buildContextualStem({
      gradeProfile,
      subject: subjectForItem,
      topic,
      heading,
      snippet,
      index: i,
      examKind,
    });

    const rotated = rotateOptionTexts(built.options, i % letters.length, letters);
    const diff: DifficultyLevel =
      difficulty === 'dengeli'
        ? i % 3 === 0
          ? 'Kolay'
          : i % 3 === 1
            ? 'Orta'
            : 'Zor'
        : difficulty;

    mcqQuestions.push({
      id: `tb-local-mcq-${Date.now()}-${i + 1}`,
      number: i + 1,
      subject: subjectForItem,
      topic,
      gainCode: `DK.${gradeProfile.id}.${i + 1}`,
      difficulty: diff,
      stem: built.stem,
      options: rotated.options,
      correctOption: rotated.correctOption,
      explanation: built.explanation,
      source: 'Ders Kitabı',
    });
  }

  return { mcqQuestions, openEndedQuestions: [] };
}
