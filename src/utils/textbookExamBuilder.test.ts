import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import {
  analyzeTextbookTopicsAndHeadings,
  buildQuestionsFromTextbookSelection,
  normalizeTextbookMcqQuestions,
  normalizeTextbookOpenEndedQuestions,
  parseCommaOrLineHeadings,
} from './textbookExamBuilder';

test('parseCommaOrLineHeadings splits commas, semicolons and newlines cleanly without duplicates', () => {
  const parsed = parseCommaOrLineHeadings(
    '1. Kesirlerde Toplama, Ondalık Gösterim;\nkesirlerde toplama\n2) Yüzdeler'
  );
  assert.deepEqual(parsed, ['Kesirlerde Toplama', 'Ondalık Gösterim', 'Yüzdeler']);
});

test('analyzeTextbookTopicsAndHeadings extracts topics and question headings for 5th grade without YKS leaks', () => {
  const g5 = getGradeProfile('5');
  const sampleText = `
    1. Ünite: Doğal Sayılarla İşlemler
    Doğal sayılar dokuz basamağa kadar okunur ve yazılır. Bölük kavramı öğrenilir.
    2. Ünite: Kesirler
    Birim kesirler sayı doğrusunda gösterilir ve sıralanır. Günlük yaşam problemleri çözülür.
    Örnek problem: Bir öğrenci günde 24 sayfa okursa 5 günde kaç sayfa okur?
  `;

  const result = analyzeTextbookTopicsAndHeadings({
    rawText: sampleText,
    fileName: '5-sinif-matematik.pdf',
    gradeProfile: g5,
    subjectName: 'Matematik',
  });

  assert.equal(result.detectedSubject, 'Matematik');
  assert.ok(result.topics.some((t) => /Doğal Sayılarla İşlemler/i.test(t)));
  assert.ok(result.topics.some((t) => /Kesirler/i.test(t)));
  assert.ok(result.questionHeadings.length >= 4);
  assert.ok(
    !result.topics.some((t) => /\b(TYT|AYT|LGS)\b/i.test(t)),
    '5. sınıf analizinde YKS/TYT/AYT etiketi olmamalı'
  );

  const autoRes = analyzeTextbookTopicsAndHeadings({
    rawText: sampleText,
    fileName: 'kitap.pdf',
    gradeProfile: g5,
    subjectName: 'Tümü',
  });
  assert.equal(autoRes.detectedSubject, 'Matematik');
  assert.ok(!autoRes.topics.includes('Sözcükte Yapı'));
});

test('buildQuestionsFromTextbookSelection builds 4-option MCQs for 5th grade deneme honoring custom topic and question headings', () => {
  const g5 = getGradeProfile('5');
  const { mcqQuestions, openEndedQuestions } = buildQuestionsFromTextbookSelection({
    gradeProfile: g5,
    subjectName: 'Matematik',
    examKind: 'deneme',
    count: 10,
    difficulty: 'dengeli',
    topics: ['Kesirlerde Toplama', 'Ondalık Gösterim'],
    questionHeadings: ['Günlük Yaşam & Yeni Nesil Problem', 'Tablo / Grafik / Şekil Yorumlama'],
    rawText: 'Kesirlerde paydalar eşitlendikten sonra paylar toplanır. Ondalık gösterimde virgüller alt alta yazılır.',
  });

  assert.equal(openEndedQuestions.length, 0);
  assert.equal(mcqQuestions.length, 10);
  for (const q of mcqQuestions) {
    assert.deepEqual(Object.keys(q.options), ['A', 'B', 'C', 'D']);
    assert.ok(['A', 'B', 'C', 'D'].includes(q.correctOption));
    assert.equal(q.source, 'Ders Kitabı');
    assert.ok(
      q.topic === 'Kesirlerde Toplama' || q.topic === 'Ondalık Gösterim',
      `Beklenen konu başlığı gelmedi: ${q.topic}`
    );
    assert.ok(
      q.stem.includes('Günlük Yaşam & Yeni Nesil Problem') ||
        q.stem.includes('Tablo / Grafik / Şekil Yorumlama'),
      `Soru başlığı kökte yer almalı: ${q.stem}`
    );
  }
});

test('buildQuestionsFromTextbookSelection builds 5-option MCQs for 11th grade yazili-test', () => {
  const g11 = getGradeProfile('11');
  const { mcqQuestions } = buildQuestionsFromTextbookSelection({
    gradeProfile: g11,
    subjectName: 'Fizik',
    examKind: 'yazili-test',
    count: 20,
    difficulty: 'Orta',
    topics: ['Vektörler', 'Bağıl Hareket'],
    questionHeadings: ['Sebep-Sonuç & Karşılaştırma'],
    rawText: 'Vektörel büyüklüklerde yön ve doğrultu dikkate alınır.',
  });

  assert.equal(mcqQuestions.length, 20);
  assert.deepEqual(Object.keys(mcqQuestions[0].options), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(mcqQuestions[0].number, 1);
  assert.equal(mcqQuestions[19].number, 20);
});

test('buildQuestionsFromTextbookSelection builds 10 open-ended written questions summing to 100 points', () => {
  const g6 = getGradeProfile('6');
  const { mcqQuestions, openEndedQuestions } = buildQuestionsFromTextbookSelection({
    gradeProfile: g6,
    subjectName: 'Fen Bilimleri',
    examKind: 'yazili-acik-uclu',
    count: 10,
    difficulty: 'dengeli',
    topics: ['Güneş Sistemi ve Tutulmalar', 'Vücudumuzdaki Sistemler'],
    questionHeadings: ['Sebep-Sonuç & Karşılaştırma', 'Kavram & Tanım Doğrulama'],
    rawText: 'Ay tutulması sırasında Dünya, Güneş ile Ay arasına girer ve Dünya’nın gölgesi Ay’ın üzerine düşer.',
  });

  assert.equal(mcqQuestions.length, 0);
  assert.equal(openEndedQuestions.length, 10);
  const totalPoints = openEndedQuestions.reduce((acc, q) => acc + q.maxPoints, 0);
  assert.equal(totalPoints, 100);
  assert.ok(openEndedQuestions[0].prompt.includes('Sebep-Sonuç & Karşılaştırma'));
  assert.ok(openEndedQuestions[0].modelAnswer.length > 10);
});

test('normalizers sanitize AI responses to exact option count and point total', () => {
  const g4 = getGradeProfile('4');
  const normalizedMcq = normalizeTextbookMcqQuestions({
    incoming: [
      {
        subject: 'Matematik',
        topic: 'TYT Kesirler',
        stem: 'Yarım litre kaç mililitredir?',
        options: { A: '250', B: '500', C: '750', D: '1000', E: '1250' },
        correctOption: 'E', // Invalid for 4-option grade -> should fallback safely
      },
    ],
    gradeProfile: g4,
    fallbackSubject: 'Matematik',
    topics: ['Kesirler'],
    questionHeadings: ['Kavram & Tanım Doğrulama'],
  });

  assert.deepEqual(Object.keys(normalizedMcq[0].options), ['A', 'B', 'C', 'D']);
  assert.equal(normalizedMcq[0].correctOption, 'A');
  assert.ok(!normalizedMcq[0].topic.includes('TYT'));

  const normalizedOe = normalizeTextbookOpenEndedQuestions({
    incoming: [
      { prompt: 'Kesir nedir?', modelAnswer: 'Bir bütünün eş parçalarından biridir.' },
      { prompt: 'Birim kesir örneği yazınız.', modelAnswer: '1/4 bir birim kesirdir.' },
    ],
    gradeProfile: g4,
    fallbackSubject: 'Matematik',
    topics: ['Kesirler'],
    questionHeadings: ['Kavram & Tanım Doğrulama'],
  });

  assert.equal(normalizedOe.length, 2);
  assert.equal(normalizedOe[0].maxPoints + normalizedOe[1].maxPoints, 100);
});
