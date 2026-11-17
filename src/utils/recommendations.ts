import {
  DifficultyLevel,
  EducationCalendarEvent,
  ExamAnalysisResult,
  ExamQuestion,
  GradeLevelId,
  GradeProfile,
  Institution,
  SmartRecommendation,
  TopicGapMetric,
} from '../types/academy';

export interface ExamQualityAudit {
  totalQuestions: number;
  optionCounts: Record<string, number>;
  difficultyCounts: Record<DifficultyLevel, number>;
  missingExplanations: number;
  optionBalancePct: number;
  suggestions: Array<{
    id: string;
    title: string;
    detail: string;
    fixType: 'balance-options' | 'balance-difficulty' | 'fill-explanations';
    needsFix: boolean;
  }>;
}

export function auditExamQuestions(
  questions: ExamQuestion[],
  optionCount: 4 | 5
): ExamQualityAudit {
  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const optionCounts: Record<string, number> = {};
  letters.forEach((l) => {
    optionCounts[l] = 0;
  });

  const difficultyCounts: Record<DifficultyLevel, number> = {
    Kolay: 0,
    Orta: 0,
    Zor: 0,
  };

  let missingExplanations = 0;

  for (const q of questions) {
    if (optionCounts[q.correctOption] !== undefined) {
      optionCounts[q.correctOption] += 1;
    }
    difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] || 0) + 1;
    if (!q.explanation || q.explanation.trim().length < 10) {
      missingExplanations += 1;
    }
  }

  const total = Math.max(1, questions.length);
  const idealPerOpt = total / letters.length;
  const maxDeviation = Math.max(
    ...letters.map((l) => Math.abs(optionCounts[l] - idealPerOpt))
  );
  const optionBalancePct = Math.max(
    0,
    Math.min(100, Math.round(100 - (maxDeviation / idealPerOpt) * 65))
  );

  const easyRatio = difficultyCounts.Kolay / total;
  const hardRatio = difficultyCounts.Zor / total;
  const needsDifficultyFix =
    Math.abs(easyRatio - 0.3) > 0.14 || Math.abs(hardRatio - 0.25) > 0.14;
  const needsOptionFix = maxDeviation > Math.max(2, idealPerOpt * 0.25);

  return {
    totalQuestions: questions.length,
    optionCounts,
    difficultyCounts,
    missingExplanations,
    optionBalancePct,
    suggestions: [
      {
        id: 'audit-opt',
        title: 'Doğru Cevap Şık Dağılımını Dengele',
        detail: needsOptionFix
          ? `Şık dağılım dengesi %${optionBalancePct}. A–${letters[letters.length - 1]} seçeneklerini eşit dağıtmak optik tahmin riskini sıfırlar.`
          : `Şık dağılımı %${optionBalancePct} ile dengeli durumda; istenirse tek tıkla tam eşitlenebilir.`,
        fixType: 'balance-options',
        needsFix: needsOptionFix,
      },
      {
        id: 'audit-diff',
        title: 'ÖSYM Zorluk Piramidine Hizala (%30 Kolay / %45 Orta / %25 Zor)',
        detail: needsDifficultyFix
          ? `Mevcut dağılım: ${difficultyCounts.Kolay} Kolay, ${difficultyCounts.Orta} Orta, ${difficultyCounts.Zor} Zor. ÖSYM standart eğrisine uyarlanması önerilir.`
          : 'Zorluk dağılımı ÖSYM ayırt edicilik standartlarıyla uyumlu.',
        fixType: 'balance-difficulty',
        needsFix: needsDifficultyFix,
      },
      {
        id: 'audit-exp',
        title: 'Çözüm & Kazanım Açıklamalarını Tamamla',
        detail:
          missingExplanations > 0
            ? `${missingExplanations} soruda çözüm açıklaması kısa veya eksik; otomatik çözüm notu üretilebilir.`
            : 'Tüm sorular için kazanım odaklı çözüm açıklaması mevcut.',
        fixType: 'fill-explanations',
        needsFix: missingExplanations > 0,
      },
    ],
  };
}

/**
 * Rotates options so the correct answer lands evenly across A-D/E
 * while preserving the exact correct answer text!
 */
export function balanceQuestionOptions(
  questions: ExamQuestion[],
  optionCount: 4 | 5
): ExamQuestion[] {
  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  return questions.map((q, idx) => {
    const targetLetter = letters[idx % letters.length];
    if (q.correctOption === targetLetter) return q;

    const currentCorrectText = q.options[q.correctOption] ?? '';
    const targetExistingText = q.options[targetLetter] ?? '';
    if (!currentCorrectText || !targetExistingText) return q;

    return {
      ...q,
      options: {
        ...q.options,
        [targetLetter]: currentCorrectText,
        [q.correctOption]: targetExistingText,
      },
      correctOption: targetLetter,
    };
  });
}

export function balanceDifficultyLevels(questions: ExamQuestion[]): ExamQuestion[] {
  const total = questions.length;
  const easyCap = Math.round(total * 0.3);
  const mediumCap = Math.round(total * 0.45);
  return questions.map((q, idx) => {
    const difficulty: DifficultyLevel =
      idx < easyCap ? 'Kolay' : idx < easyCap + mediumCap ? 'Orta' : 'Zor';
    return { ...q, difficulty };
  });
}

export function fillMissingExplanations(questions: ExamQuestion[]): ExamQuestion[] {
  return questions.map((q) => {
    if (q.explanation && q.explanation.trim().length >= 12) return q;
    return {
      ...q,
      explanation: `${q.subject} (${q.topic} - ${q.gainCode}) kazanımına göre doğru cevap ${q.correctOption} seçeneğidir. Çeldiricileri eleyerek adım adım kontrol ediniz.`,
    };
  });
}

function addDaysIso(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildDefaultCalendarEvents(
  institutionId: string,
  gradeId: GradeLevelId,
  baseDate: Date = new Date()
): EducationCalendarEvent[] {
  return [
    {
      id: `cal-${institutionId}-1`,
      institutionId,
      title: `${gradeId} Türkiye Geneli Kurumsal Deneme — 1. Oturum`,
      date: addDaysIso(baseDate, 2),
      time: '09:30',
      gradeId,
      type: 'deneme-sinavi',
      classroom: 'Tüm Şubeler',
      note: 'Pembe/Magenta OMR optik kağıtları ve Furkan imzalı A/B kitapçıkları dağıtılacak.',
    },
    {
      id: `cal-${institutionId}-2`,
      institutionId,
      title: 'Kritik Konu Telafi Etütü (Matematik & Paragraf)',
      date: addDaysIso(baseDate, 4),
      time: '15:00',
      gradeId,
      type: 'telafi-etutu',
      classroom: gradeId === 'TYT' || gradeId.startsWith('AYT') ? '12-A Sayısal' : `${gradeId}-A`,
      note: 'Optik analiz sonrası %50 altı kazanımlar için soru çözüm atölyesi.',
    },
    {
      id: `cal-${institutionId}-3`,
      institutionId,
      title: 'Veli Karne & Kazanım Matrisi Değerlendirme Toplantısı',
      date: addDaysIso(baseDate, 7),
      time: '17:30',
      gradeId,
      type: 'veli-bilgilendirme',
      classroom: 'Konferans Salonu',
      note: '5 çeşit analiz karnesi ve 3D gelişim projeksiyonu velilerle paylaşılacak.',
    },
    {
      id: `cal-${institutionId}-4`,
      institutionId,
      title: 'Hafta Sonu Yoğun Yeni Nesil Soru Kampı',
      date: addDaysIso(baseDate, 10),
      time: '10:00',
      gradeId,
      type: 'kamp-programi',
      classroom: 'Etüt Merkezi B-2',
      note: '3D kitapçık ve zaman yönetimi simülasyonu.',
    },
    {
      id: `cal-${institutionId}-5`,
      institutionId,
      title: `${gradeId} Kurum İçi Tarama & Hız Denemesi`,
      date: addDaysIso(baseDate, 14),
      time: '10:00',
      gradeId,
      type: 'deneme-sinavi',
      classroom: 'Tüm Şubeler',
      note: 'Net artış projeksiyonunu doğrulama sınavı.',
    },
  ];
}

export function buildRemedialCalendarEvent(params: {
  topicGap: Pick<TopicGapMetric, 'subject' | 'topic' | 'gainCode' | 'masteryPct'>;
  institutionId: string;
  gradeId: GradeLevelId;
  classroom: string;
  offsetDays?: number;
}): EducationCalendarEvent {
  const targetDate = addDaysIso(new Date(), params.offsetDays ?? 3);
  return {
    id: `cal-rem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    institutionId: params.institutionId,
    title: `Telafi Etütü: ${params.topicGap.subject} — ${params.topicGap.topic}`,
    date: targetDate,
    time: '16:00',
    gradeId: params.gradeId,
    type: 'telafi-etutu',
    classroom: params.classroom,
    note: `Kazanım Kodu: ${params.topicGap.gainCode} · Güncel başarı %${params.topicGap.masteryPct}. Hedef: +%25 net kazanım.`,
  };
}

export function buildSmartRecommendations(params: {
  activeInstitution: Institution;
  gradeProfile: GradeProfile;
  analysis: ExamAnalysisResult;
  questionsCount: number;
  calendarCount: number;
  hasLiveAnalysis?: boolean;
}): SmartRecommendation[] {
  const hasExam = params.hasLiveAnalysis !== false;
  const sortedGaps = [...params.analysis.topicGaps].sort(
    (a, b) => a.masteryPct - b.masteryPct
  );
  const weakestTopic = sortedGaps[0];
  const secondWeakTopic = sortedGaps[1];
  const weakestSubject = [...params.analysis.subjectMetrics].sort(
    (a, b) => a.accuracyPct - b.accuracyPct
  )[0];
  const strongestSubject = [...params.analysis.subjectMetrics].sort(
    (a, b) => b.accuracyPct - a.accuracyPct
  )[0];

  const displayStudent = params.analysis.studentName.trim() || `${params.gradeProfile.shortLabel} grubu`;

  const list: SmartRecommendation[] = [
    {
      id: 'rec-remedial-1',
      category: 'Öğrenci Telafi',
      title: weakestTopic
        ? `${weakestTopic.subject}: "${weakestTopic.topic}" İçin ${hasExam ? 'Acil Telafi Etütü' : 'Kazanım Etütü Planla'}`
        : 'Kritik Konular İçin Etüt Planla',
      description: !hasExam
        ? `${displayStudent} için henüz deneme değerlendirmesi yapılmadı. ${params.gradeProfile.shortLabel} müfredatı (${weakestTopic?.gainCode ?? 'MEB'}) için ön hazırlık etütü ekleyebilirsiniz.`
        : weakestTopic
          ? `${displayStudent} bu konuda %${weakestTopic.masteryPct} başarıda (${weakestTopic.gainCode}). 3 gün sonraya birebir soru çözüm etütü eklenmesi +4.5 net katkı sağlar.`
          : 'Düşük başarı gösteren konular için takvime telafi etütü ekleyin.',
      impactLabel: hasExam ? '+4.5 Net Potansiyeli' : 'Ön Hazırlık',
      actionLabel: 'Takvime Telafi Ekle',
      actionType: 'add-calendar-remedial',
      payload: weakestTopic
        ? { subject: weakestTopic.subject, topic: weakestTopic.topic }
        : undefined,
    },
    {
      id: 'rec-remedial-2',
      category: 'Öğrenci Telafi',
      title: secondWeakTopic
        ? `${secondWeakTopic.subject}: "${secondWeakTopic.topic}" Hız & Çeldirici Çalışması`
        : 'Çeldirici Analizi ile Hata Azaltma',
      description: !hasExam
        ? `Optik Okuma tamamlandığında ${displayStudent} için çeldirici hata analizi ve tekrar önerileri burada otomatik oluşur.`
        : secondWeakTopic
          ? `Bu ünitedeki yanlışlar çoğunlukla çeldirici şıklardan geliyor (%${secondWeakTopic.masteryPct} başarı). Editörden ek pekiştirme sorusu üretilebilir.`
          : 'Yanlış yapılan soruları çeldirici analizi ile inceleyin.',
      impactLabel: hasExam ? 'Hata Azaltma' : 'Beklemede',
      actionLabel: 'Takvime Etüt Ekle',
      actionType: 'add-calendar-remedial',
      payload: secondWeakTopic
        ? { subject: secondWeakTopic.subject, topic: secondWeakTopic.topic }
        : undefined,
    },
    {
      id: 'rec-exam-balanced',
      category: 'Sınav & Editör',
      title: `${params.gradeProfile.shortLabel} İçin ÖSYM Standardında Dengeli ${params.questionsCount} Soruluk Deneme`,
      description:
        'Kolay (%35), Orta (%45) ve Zor (%20) dağılımıyla yeni nesil gerçekçi sorular oluşturup mevcut havuzu tazeleyin.',
      impactLabel: 'Yeni Nesil Set',
      actionLabel: 'Dengeli Deneme Üret',
      actionType: 'apply-balanced-exam',
    },
    {
      id: 'rec-exam-hard',
      category: 'Sınav & Editör',
      title: `${strongestSubject?.subject || 'Üst Düzey'} İçin Derece Seçici Zorluk Paketi`,
      description: `${displayStudent} için zorluk oranı yüksek seçici deneme ile ilk %5 dilim provası yapın.`,
      impactLabel: 'Derece Provası',
      actionLabel: 'Seçici Deneme Kur',
      actionType: 'apply-hard-exam',
    },
    {
      id: 'rec-editor-open',
      category: 'Sınav & Editör',
      title: 'Deneme Editöründe Şık & Kazanım Dengesini Denetle',
      description:
        'Soru köklerini düzenleyin, şık dağılımını (A–E) otomatik eşitleyin ve Furkan 3D imzalı PDF kitapçığı kusursuz hale getirin.',
      impactLabel: 'Tam Kontrol',
      actionLabel: 'Editöre Git',
      actionType: 'open-editor',
    },
    {
      id: 'rec-calendar-open',
      category: 'Eğitim Takvimi',
      title: `${params.activeInstitution.name} — Aylık ${params.calendarCount} Etkinlikli Takvimi Yönet`,
      description:
        'Kurum kodu bazlı deneme günlerini, kamp tarihlerini ve veli görüşmelerini aylık takvim üzerinden planlayın.',
      impactLabel: 'Planlı İlerleme',
      actionLabel: 'Takvimi Aç',
      actionType: 'open-calendar',
    },
    {
      id: 'rec-growth-poster',
      category: 'Kurum Büyüme',
      title: `${params.activeInstitution.code8} Kurumu İçin 3D Deneme Duyuru Afişi Hazırla`,
      description:
        'Seçili 3D logo ve kurum kodunuzla öğrenci ve veli gruplarında paylaşılabilir yüksek çözünürlüklü 3D afiş oluşturun.',
      impactLabel: 'Kurum Tanıtımı',
      actionLabel: '3D Afiş Tasarla',
      actionType: 'open-poster',
    },
    {
      id: 'rec-growth-zip',
      category: 'Kurum Büyüme',
      title: `${weakestSubject?.subject || 'Tüm Dersler'} Dahil 8 Dosyalık Tam Kurum ZIP Paketi İndir`,
      description:
        'Pembe OMR optik form, 3D kapaklı PDF, 5 çeşit karne ve taşınabilir HTML yönetim panelini tek arşivde paylaşın.',
      impactLabel: '8 Dosyalı Paket',
      actionLabel: 'Tam ZIP İndir',
      actionType: 'download-zip',
    },
  ];

  return list;
}
