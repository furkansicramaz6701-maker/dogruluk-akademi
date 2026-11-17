import * as XLSX from 'xlsx';
import { getGradeProfile } from '../data/curriculum';
import {
  DifficultyLevel,
  DynamicCurriculumOverride,
  DynamicSourceMix,
  ExamQuestion,
  GradeLevelId,
} from '../types/academy';
import { buildAutoExamQuestions } from './examAnalysis';

/**
 * Parses uploaded/pasted MEB Müfredat or Ders Kitabı text into a structured
 * DynamicCurriculumOverride tailored to the selected grade level (3-12, TYT/AYT).
 */
export function extractCurriculumOverrideFromText(
  rawText: string,
  gradeId: GradeLevelId,
  sourceName: string,
  pageCount?: number
): DynamicCurriculumOverride {
  const profile = getGradeProfile(gradeId);
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && l.length <= 90);

  const detectedTopics = lines
    .filter(
      (l) =>
        /^\d+[\.\)]\s+/.test(l) ||
        /ünite|konu|kazanım|bölüm|tema/i.test(l) ||
        (/^[A-ZÇĞİÖŞÜ]/.test(l) && l.split(' ').length <= 7)
    )
    .map((l) => l.replace(/^\d+[\.\)]\s+/, '').trim())
    .filter((v, i, arr) => v.length >= 4 && arr.indexOf(v) === i)
    .slice(0, 16);

  const subjects = profile.subjects.map((subj, sIdx) => {
    const chunk = detectedTopics.filter((_, tIdx) => tIdx % profile.subjects.length === sIdx);
    const mergedTopics =
      chunk.length > 0
        ? Array.from(new Set([...chunk, ...subj.topics])).slice(0, 6)
        : subj.topics;
    return {
      name: subj.name,
      topics: mergedTopics,
      questionCount: subj.questionCount,
    };
  });

  return {
    sourceName: sourceName || `MEB ${profile.shortLabel} Müfredatı`,
    gradeId,
    subjects,
    extractedAt: new Date().toLocaleDateString('tr-TR'),
    pageCount,
  };
}

/**
 * Generates grade-accurate questions anchored to an uploaded MEB Müfredat PDF override.
 */
export function buildQuestionsFromCurriculumOverride(
  override: DynamicCurriculumOverride,
  targetCount?: number
): ExamQuestion[] {
  const profile = getGradeProfile(override.gradeId);
  const totalRequested =
    targetCount ?? override.subjects.reduce((acc, s) => acc + s.questionCount, 0);
  const base = buildAutoExamQuestions(override.gradeId, 'dengeli', totalRequested);

  return base.map((q, idx) => {
    const subj = override.subjects[idx % Math.max(1, override.subjects.length)];
    const topic = subj?.topics[idx % Math.max(1, subj.topics.length)] ?? q.topic;
    return {
      ...q,
      number: idx + 1,
      subject: subj?.name ?? q.subject,
      topic,
      gainCode: `MEB.${profile.id}.${idx + 1}`,
      source: 'Ders Kitabı',
      stem: `${topic} (${override.sourceName}) kapsamında: ${q.stem}`,
    };
  });
}

/**
 * Blends questions dynamically across multiple sources (Curriculum Pool, MEB PDF,
 * Internet Search, Textbook/Excel Bank) while preserving the active grade's 4/5-option rule.
 */
export function buildDynamicMixedQuestions(params: {
  gradeId: GradeLevelId;
  mix: DynamicSourceMix;
  customBank?: ExamQuestion[];
  mebOverride?: DynamicCurriculumOverride | null;
  difficulty?: 'dengeli' | 'kolay' | 'zor';
}): ExamQuestion[] {
  const {
    gradeId,
    mix,
    customBank = [],
    mebOverride = null,
    difficulty = 'dengeli',
  } = params;

  const profile = getGradeProfile(gradeId);
  const letters = profile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  const poolCount = Math.max(0, Math.round(mix.curriculumPool));
  const mebCount = Math.max(0, Math.round(mix.mebPdf));
  const webCount = Math.max(0, Math.round(mix.internetSearch));
  const bookCount = Math.max(0, Math.round(mix.textbookBank));

  const totalNeeded = Math.max(1, poolCount + mebCount + webCount + bookCount);
  const fullPool = buildAutoExamQuestions(gradeId, difficulty, totalNeeded);

  const normalizeOptions = (q: ExamQuestion): ExamQuestion => {
    const cleanOpts: Record<string, string> = {};
    letters.forEach((l, idx) => {
      cleanOpts[l] = q.options[l] ?? `${q.topic} için ${idx + 1}. bilimsel çıkarım`;
    });
    const safeCorrect = letters.includes(q.correctOption) ? q.correctOption : letters[0];
    return { ...q, options: cleanOpts, correctOption: safeCorrect };
  };

  const result: ExamQuestion[] = [];
  let cursor = 0;

  // 1. Müfredat Havuzu
  for (let i = 0; i < poolCount; i++) {
    const base = fullPool[cursor % fullPool.length];
    cursor++;
    result.push(
      normalizeOptions({
        ...base,
        id: `dyn-pool-${i + 1}`,
        source: 'Müfredat Havuzu',
      })
    );
  }

  // 2. MEB Müfredatı / PDF Kaynağı
  const mebBaseList = mebOverride
    ? buildQuestionsFromCurriculumOverride(mebOverride, Math.max(1, mebCount))
    : fullPool;
  for (let i = 0; i < mebCount; i++) {
    const base = mebBaseList[i % mebBaseList.length];
    cursor++;
    result.push(
      normalizeOptions({
        ...base,
        id: `dyn-meb-${i + 1}`,
        gainCode: `MEB.${profile.id}.${i + 1}`,
        source: 'Ders Kitabı',
      })
    );
  }

  // 3. Canlı İnternet / Güncel Web Havuzu
  for (let i = 0; i < webCount; i++) {
    const base = fullPool[cursor % fullPool.length];
    cursor++;
    result.push(
      normalizeOptions({
        ...base,
        id: `dyn-web-${i + 1}`,
        gainCode: `WEB.${profile.id}.${i + 1}`,
        source: 'İnternet Araştırması',
      })
    );
  }

  // 4. Yüklenen Özel Soru Bankası / PDF Kitapçık
  for (let i = 0; i < bookCount; i++) {
    const imported = customBank[i % Math.max(1, customBank.length)];
    if (imported) {
      result.push(
        normalizeOptions({
          ...imported,
          id: `dyn-bank-${i + 1}`,
        })
      );
    } else {
      const base = fullPool[cursor % fullPool.length];
      cursor++;
      result.push(
        normalizeOptions({
          ...base,
          id: `dyn-pdf-${i + 1}`,
          source: 'PDF Kitapçık',
        })
      );
    }
  }

  return result.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

/**
 * Imports custom questions from an Excel/CSV file into ExamQuestion[] for Dinamik Soru Kaynağı.
 */
export function parseQuestionsSpreadsheet(
  arrayBuffer: ArrayBuffer,
  optionCount: 4 | 5 = 4
): ExamQuestion[] {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: '',
  });
  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const key of keys) {
      for (const [col, val] of Object.entries(row)) {
        if (col.toLocaleLowerCase('tr-TR').includes(key) && String(val).trim()) {
          return String(val).trim();
        }
      }
    }
    return '';
  };

  return rows
    .map((row, idx): ExamQuestion | null => {
      const stem = pick(row, ['soru', 'kök', 'metin', 'stem', 'question']);
      if (!stem) return null;
      const subject = pick(row, ['ders', 'alan', 'subject']) || 'Genel';
      const topic = pick(row, ['konu', 'ünite', 'unite', 'topic']) || 'Genel Kazanım';
      const gainCode = pick(row, ['kazanım', 'kazanim', 'kod', 'gain']) || `OZEL.${idx + 1}`;
      const rawDiff = pick(row, ['zorluk', 'difficulty']);
      const difficulty: DifficultyLevel =
        rawDiff.toLocaleLowerCase('tr-TR').includes('zor')
          ? 'Zor'
          : rawDiff.toLocaleLowerCase('tr-TR').includes('kol')
            ? 'Kolay'
            : 'Orta';
      const options: Record<string, string> = {};
      letters.forEach((l) => {
        options[l] =
          pick(row, [`şık ${l.toLowerCase()}`, `sik ${l.toLowerCase()}`, l.toLowerCase()]) ||
          `${l} seçeneği`;
      });
      const rawCorrect = pick(row, ['cevap', 'doğru', 'dogru', 'correct']).toUpperCase();
      const correctOption = letters.includes(rawCorrect) ? rawCorrect : 'A';
      return {
        id: `xls-q-${Date.now()}-${idx}`,
        number: idx + 1,
        subject,
        topic,
        gainCode,
        difficulty,
        stem,
        options,
        correctOption,
        explanation: pick(row, ['açıklama', 'aciklama', 'çözüm', 'cozum']) || 'Öğretmen soru bankası kaydı.',
        source: 'PDF Kitapçık',
      };
    })
    .filter((q): q is ExamQuestion => q !== null);
}
