import {
  GradeProfile,
  OpenEndedPaperAnalysis,
  OpenEndedQuestion,
  OpenEndedQuestionGrade,
  WeeklyPerformanceStatus,
} from '../types/academy';
import { sanitizeExamLabelForGrade } from './weeklyAnalysis';

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    've',
    'veya',
    'ile',
    'icin',
    'için',
    'gibi',
    'olan',
    'olarak',
    'bir',
    'bu',
    'şu',
    'da',
    'de',
    'ki',
    'en',
    'çok',
    'az',
    'sonuç',
    'sonuc',
    'çözüm',
    'cozum',
    'cevap',
    'bulunur',
    'olur',
    'edilir',
    'yapılır',
    'ise',
    'dir',
    'dır',
    'tir',
    'tır',
    'tür',
    'tur',
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  return Array.from(new Set(tokens)).slice(0, 6);
}

export function buildDefaultOpenEndedQuestions(
  gradeProfile: GradeProfile,
  count = 10,
  subjectFilter?: string
): OpenEndedQuestion[] {
  const safeCount = Math.min(10, Math.max(1, count));
  const subjects =
    subjectFilter && subjectFilter !== 'Tümü'
      ? gradeProfile.subjects.filter(
          (s) => s.name.toLocaleLowerCase('tr-TR') === subjectFilter.toLocaleLowerCase('tr-TR')
        )
      : gradeProfile.subjects;
  const activeSubjects = subjects.length > 0 ? subjects : gradeProfile.subjects;

  const list: OpenEndedQuestion[] = [];
  for (let i = 0; i < safeCount; i++) {
    const subj = activeSubjects[i % activeSubjects.length];
    const topic = subj.topics[i % subj.topics.length] || subj.name;
    let prompt = `${gradeProfile.shortLabel} ${subj.name} — "${topic}" konusuyla ilgili temel kuralı açıklayınız ve kısa bir örnek yazınız.`;
    let modelAnswer = `${topic} kavramının temel tanımı doğru yazılmalı ve somut bir örnekle gösterilmelidir.`;

    if (/matematik/i.test(subj.name)) {
      const a = 12 + i * 3;
      const b = 4 + (i % 5);
      prompt = `Bir öğrenci günde ${a} dakika kitap okumakta ve ${b} adet ${topic.toLowerCase()} alıştırması çözmektedir. 5 gün sonunda toplam okuduğu süre ile çözdüğü alıştırma sayısını işlem basamaklarını göstererek hesaplayınız.`;
      modelAnswer = `Okuma süresi: ${a} x 5 = ${a * 5} dakika. Alıştırma sayısı: ${b} x 5 = ${b * 5} soru. Tüm işlem adımları açıkça yazılmalıdır.`;
    } else if (/türkçe|edebiyat/i.test(subj.name)) {
      prompt = `"${topic}" konusunu dikkate alarak, günlük yaşamdan özgün iki cümle kurunuz ve bu cümlelerdeki ana düşünceyi 2–3 cümleyle açıklayınız.`;
      modelAnswer = `İki anlamlı Türkçe cümle kurulmalı, yazım-noktalama kurallarına uyulmalı ve ana düşünce doğru ifade edilmelidir.`;
    } else if (/fen|fizik|kimya|biyoloji/i.test(subj.name)) {
      prompt = `"${topic}" konusunda günlük hayattan gözlemlenebilir bir olay örneği veriniz ve bu olayın bilimsel nedenini açıklayınız.`;
      modelAnswer = `${topic} ilkesine uygun gerçek bir örnek verilip sebep-sonuç ilişkisi bilimsel terimlerle açıklanmalıdır.`;
    } else if (/ingilizce/i.test(subj.name)) {
      prompt = `Topic: "${topic}". Write three complete English sentences describing your daily plan or preference using correct grammar.`;
      modelAnswer = `Three grammatically correct English sentences related to ${topic} using proper tense and vocabulary.`;
    }

    list.push({
      id: `oe-${gradeProfile.id}-${i + 1}`,
      number: i + 1,
      subject: subj.name,
      topic,
      maxPoints: 10,
      prompt,
      modelAnswer,
      keywords: extractKeywords(`${topic} ${modelAnswer}`),
    });
  }
  return list;
}

export function parseOpenEndedQuestionsFromText(
  rawQuestionsText: string,
  rawSolutionsText: string,
  gradeProfile: GradeProfile,
  maxCount = 10,
  subjectFallback?: string
): OpenEndedQuestion[] {
  const qLines = rawQuestionsText.trim();
  const sLines = rawSolutionsText.trim();
  const splitNumbered = (txt: string): Map<number, string> => {
    const map = new Map<number, string>();
    if (!txt) return map;
    const parts = txt
      .replace(/\r\n/g, '\n')
      .split(/(?:^|\n)\s*(?:Soru|Çözüm|Cevap)?\s*(\d{1,2})\s*[.):\-]\s+/i)
      .filter((p) => p.trim().length > 0);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const n = Number(parts[i]);
      if (Number.isFinite(n) && n >= 1 && n <= maxCount) {
        map.set(n, parts[i + 1].trim());
      }
    }
    if (map.size === 0) {
      const nonEmptyLines = txt
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 4);
      nonEmptyLines.slice(0, maxCount).forEach((line, idx) => {
        map.set(idx + 1, line);
      });
    }
    return map;
  };

  const qMap = splitNumbered(qLines);
  const sMap = splitNumbered(sLines);
  const defaults = buildDefaultOpenEndedQuestions(gradeProfile, maxCount, subjectFallback);

  if (qMap.size === 0 && sMap.size === 0) {
    return defaults;
  }

  const total = Math.min(maxCount, Math.max(qMap.size, sMap.size, 1));
  const result: OpenEndedQuestion[] = [];
  for (let i = 1; i <= total; i++) {
    const base = defaults[(i - 1) % defaults.length];
    const prompt = qMap.get(i) || base.prompt;
    const modelAnswer = sMap.get(i) || base.modelAnswer;
    result.push({
      id: `oe-parsed-${Date.now()}-${i}`,
      number: i,
      subject: subjectFallback && subjectFallback !== 'Tümü' ? subjectFallback : base.subject,
      topic: `${gradeProfile.shortLabel} Açık Uçlu Soru ${i}`,
      maxPoints: 10,
      prompt,
      modelAnswer,
      keywords: extractKeywords(modelAnswer),
    });
  }
  return result;
}

export function determineOpenEndedStatus(successPct: number): WeeklyPerformanceStatus {
  if (successPct >= 85) return 'Üstün Başarı';
  if (successPct >= 65) return 'İyi Gelişim';
  if (successPct >= 45) return 'Destek Gerekiyor';
  return 'Çalışması Gerekiyor';
}

export function evaluateOpenEndedAnswersText(params: {
  questions: OpenEndedQuestion[];
  studentPaperText: string;
  studentName: string;
  studentNumber: string;
  classroom: string;
  examTitle: string;
  gradeProfile: GradeProfile;
}): OpenEndedPaperAnalysis {
  const { questions, studentPaperText, studentName, studentNumber, classroom, examTitle, gradeProfile } =
    params;

  const answerMap = new Map<number, string>();
  const trimmed = studentPaperText.trim();
  if (trimmed) {
    const parts = trimmed
      .replace(/\r\n/g, '\n')
      .split(/(?:^|\n)\s*(?:Soru|Cevap)?\s*(\d{1,2})\s*[.):\-]\s+/i)
      .filter((p) => p.trim().length > 0);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const n = Number(parts[i]);
      if (Number.isFinite(n)) {
        answerMap.set(n, parts[i + 1].trim());
      }
    }
    if (answerMap.size === 0) {
      const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      lines.slice(0, questions.length).forEach((line, idx) => {
        answerMap.set(idx + 1, line);
      });
    }
  }

  const questionGrades: OpenEndedQuestionGrade[] = questions.map((q) => {
    const studentAns = (answerMap.get(q.number) ?? '').trim();
    if (!studentAns) {
      return {
        number: q.number,
        subject: q.subject,
        score: 0,
        maxPoints: q.maxPoints,
        status: 'bos',
        studentAnswerSummary: 'Boş bırakıldı',
        feedback: `Soru ${q.number} yanıtlanmamış. Örnek çözüm incelenerek tekrar edilmeli.`,
      };
    }

    const ansLower = studentAns.toLowerCase();
    const keywords = q.keywords.length > 0 ? q.keywords : extractKeywords(q.modelAnswer);
    const numbersInModel = Array.from(new Set(q.modelAnswer.match(/\d+/g) ?? []));

    let matched = 0;
    keywords.forEach((kw) => {
      const k = kw.toLowerCase();
      const stem = k.length >= 5 ? k.slice(0, Math.max(4, k.length - 2)) : k;
      if (ansLower.includes(k) || ansLower.includes(stem)) matched++;
    });
    let numMatched = 0;
    numbersInModel.forEach((num) => {
      if (ansLower.includes(num)) numMatched++;
    });

    const kwRatio = keywords.length > 0 ? matched / keywords.length : 0.7;
    const hasNumbers = numbersInModel.length > 0;
    const numRatio = hasNumbers ? numMatched / numbersInModel.length : 0;
    const lengthFactor = studentAns.length >= 25 ? 0.25 : studentAns.length >= 8 ? 0.18 : 0.05;
    const rawScoreRatio = hasNumbers
      ? Math.max(numRatio * 0.72 + kwRatio * 0.28 + lengthFactor * 0.6, kwRatio * 0.7 + lengthFactor)
      : kwRatio * 0.8 + lengthFactor;
    const ratio = Math.min(1, Math.max(0.2, rawScoreRatio));
    const score = Math.min(q.maxPoints, Math.max(2, Math.round(ratio * q.maxPoints)));

    const status: OpenEndedQuestionGrade['status'] =
      score >= Math.ceil(q.maxPoints * 0.8)
        ? 'tam'
        : score >= Math.ceil(q.maxPoints * 0.4)
          ? 'kismi'
          : 'yanlis';

    const feedback =
      status === 'tam'
        ? 'Doğru çözüm ve temel kavramlar eksiksiz verilmiş.'
        : status === 'kismi'
          ? 'Yaklaşım doğru ancak örnek çözümdeki bazı işlem adımları/anahtar kavramlar eksik.'
          : 'Kavramsal veya işlemsel hata tespit edildi; örnek çözüm üzerinden tekrar önerilir.';

    return {
      number: q.number,
      subject: q.subject,
      score,
      maxPoints: q.maxPoints,
      status,
      studentAnswerSummary: studentAns.slice(0, 120),
      feedback,
    };
  });

  const maxTotalScore = questions.reduce((acc, q) => acc + q.maxPoints, 0) || 100;
  const totalScore = questionGrades.reduce((acc, g) => acc + g.score, 0);
  const successPct = Math.round((totalScore / maxTotalScore) * 100);
  const developmentStatus = determineOpenEndedStatus(successPct);

  const weakNums = questionGrades
    .filter((g) => g.status === 'yanlis' || g.status === 'bos' || g.status === 'kismi')
    .map((g) => `Soru ${g.number}`)
    .slice(0, 4);

  const overallFeedback =
    weakNums.length === 0
      ? `${gradeProfile.shortLabel} açık uçlu yazılı değerlendirmesinde tüm sorulardan tam puan düzeyinde başarı sağlanmıştır.`
      : `${gradeProfile.shortLabel} açık uçlu kağıt analizinde toplam ${totalScore}/${maxTotalScore} puan (%${successPct}) alındı. Gelişim odağı: ${weakNums.join(', ')}.`;

  return {
    id: `oe-res-${Date.now()}`,
    studentName: studentName || 'Öğrenci',
    studentNumber: studentNumber || '--------',
    classroom: classroom || `${gradeProfile.shortLabel}`,
    examTitle: sanitizeExamLabelForGrade(examTitle, gradeProfile),
    gradeId: gradeProfile.id,
    totalScore,
    maxTotalScore,
    successPct,
    developmentStatus,
    overallFeedback,
    questionGrades,
    evaluatedAt: new Date().toLocaleDateString('tr-TR'),
  };
}

export function buildOpenEndedParentMessage(params: {
  paperAnalysis: OpenEndedPaperAnalysis;
  academyName: string;
  gradeProfile: GradeProfile;
}): string {
  const { paperAnalysis, academyName, gradeProfile } = params;
  const safeTitle = sanitizeExamLabelForGrade(paperAnalysis.examTitle, gradeProfile);
  const fullCount = paperAnalysis.questionGrades.filter((g) => g.status === 'tam').length;
  const partialCount = paperAnalysis.questionGrades.filter((g) => g.status === 'kismi').length;
  const weakList = paperAnalysis.questionGrades
    .filter((g) => g.status === 'yanlis' || g.status === 'bos')
    .map((g) => `${g.number}. soru (${g.subject})`)
    .slice(0, 3);

  const weakLine =
    weakList.length > 0
      ? `Tekrar Önerisi: ${weakList.join(', ')} çözümleri üzerinden tekrar yapılması faydalı olacaktır.`
      : 'Tüm açık uçlu sorularda yüksek çözüm hakimiyeti gözlemlenmiştir.';

  return sanitizeExamLabelForGrade(
    `Sayın Velimiz,\nKurum: ${academyName}\nÖğrenci: ${paperAnalysis.studentName} (${gradeProfile.shortLabel} · ${paperAnalysis.classroom})\nSınav: ${safeTitle} (${paperAnalysis.questionGrades.length} Soruluk Açık Uçlu Yazılı)\nGelişim Durumu: ${paperAnalysis.developmentStatus}\n\nYazılı Kağıdı Sonucu:\n• Toplam Puan: ${paperAnalysis.totalScore} / ${paperAnalysis.maxTotalScore} (%${paperAnalysis.successPct})\n• Tam Puan: ${fullCount} soru · Kısmi Puan: ${partialCount} soru\n\nAnaliz Özeti: ${weakLine} — ${academyName}`,
    gradeProfile
  );
}
