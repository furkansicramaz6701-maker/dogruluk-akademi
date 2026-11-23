export type PerformanceTierKey = 'basarili' | 'gelismekte' | 'tekrar' | 'bekleniyor';

export interface PerformanceTierVisual {
  tier: PerformanceTierKey;
  label: string;
  shortLabel: string;
  stars: number; // 0..5 integer star rating
  maxStars: number;
  progressPct: number; // 0..100 clamped
  accentColor: string;
  secondaryColor: string;
  trackColor: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  starFillColor: string;
  starEmptyColor: string;
  caption: string;
}

export const PERFORMANCE_THRESHOLDS = {
  tekrarMaxExclusive: 45,
  basariliMinInclusive: 70,
} as const;

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeStarCountFromPct(pct: number, hasExamData = true): number {
  if (!hasExamData) return 0;
  const p = clampPct(pct);
  if (p >= 85) return 5;
  if (p >= 70) return 4;
  if (p >= 55) return 3;
  if (p >= 40) return 2;
  return 1;
}

export function resolveExamPerformanceVisual(params: {
  successPct: number;
  hasExamData?: boolean;
}): PerformanceTierVisual {
  const hasExamData = params.hasExamData ?? true;
  const pct = clampPct(params.successPct);

  if (!hasExamData) {
    return {
      tier: 'bekleniyor',
      label: 'Deneme Bekleniyor',
      shortLabel: 'BEKLENİYOR',
      stars: 0,
      maxStars: 5,
      progressPct: 0,
      accentColor: '#64748b',
      secondaryColor: '#94a3b8',
      trackColor: '#e2e8f0',
      badgeBg: '#f1f5f9',
      badgeBorder: '#cbd5e1',
      textColor: '#475569',
      starFillColor: '#cbd5e1',
      starEmptyColor: '#e2e8f0',
      caption: 'Optik okuma veya sınav verisi girildiğinde başarı grafiği ve yıldız puanı otomatik oluşur.',
    };
  }

  const stars = computeStarCountFromPct(pct, true);

  if (pct >= PERFORMANCE_THRESHOLDS.basariliMinInclusive) {
    return {
      tier: 'basarili',
      label: 'Başarılı',
      shortLabel: 'BAŞARILI',
      stars,
      maxStars: 5,
      progressPct: pct,
      accentColor: '#059669',
      secondaryColor: '#10b981',
      trackColor: '#d1fae5',
      badgeBg: '#ecfdf5',
      badgeBorder: '#6ee7b7',
      textColor: '#065f46',
      starFillColor: '#f59e0b',
      starEmptyColor: '#cbd5e1',
      caption:
        pct >= 85
          ? 'Üstün hakimiyet: Hedef kazanımların büyük çoğunluğu tam olarak kavrandı.'
          : 'Hedef başarı bandında: Mevcut tempo korunarak üst sıralama pekiştirilebilir.',
    };
  }

  if (pct >= PERFORMANCE_THRESHOLDS.tekrarMaxExclusive) {
    return {
      tier: 'gelismekte',
      label: 'Gelişmekte',
      shortLabel: 'GELİŞMEKTE',
      stars,
      maxStars: 5,
      progressPct: pct,
      accentColor: '#d97706',
      secondaryColor: '#f59e0b',
      trackColor: '#fef3c7',
      badgeBg: '#fffbeb',
      badgeBorder: '#fcd34d',
      textColor: '#92400e',
      starFillColor: '#f59e0b',
      starEmptyColor: '#cbd5e1',
      caption:
        'Orta-iyi gelişim bandında: Düzenli soru çözümü ve dikkat kontrolü ile Başarılı seviyesine çıkabilir.',
    };
  }

  return {
    tier: 'tekrar',
    label: 'Tekrar Gerekli',
    shortLabel: 'TEKRAR',
    stars,
    maxStars: 5,
    progressPct: pct,
    accentColor: '#e11d48',
    secondaryColor: '#f43f5e',
    trackColor: '#ffe4e6',
    badgeBg: '#fff1f2',
    badgeBorder: '#fda4af',
    textColor: '#9f1239',
    starFillColor: '#f59e0b',
    starEmptyColor: '#cbd5e1',
    caption:
      'Öncelikli tekrar bandında: Temel konu özetleri ve birebir etüt desteğiyle hızlı yükseliş hedeflenir.',
  };
}

export function resolveSubjectProgressVisual(
  accuracyPct: number,
  hasExamData = true
): PerformanceTierVisual {
  return resolveExamPerformanceVisual({
    successPct: accuracyPct,
    hasExamData,
  });
}

export function resolveTopicProgressVisual(
  masteryPct: number
): PerformanceTierVisual {
  return resolveExamPerformanceVisual({
    successPct: masteryPct,
    hasExamData: true,
  });
}
