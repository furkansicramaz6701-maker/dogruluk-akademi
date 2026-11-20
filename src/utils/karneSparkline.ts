import { GradeProfile, HistoricalExamPoint } from '../types/academy';
import { sanitizeExamLabelForGrade } from './weeklyAnalysis';

export type SparklineMetricMode = 'net' | 'score';

export interface SparklinePointCoord {
  index: number;
  examName: string;
  shortLabel: string;
  date: string;
  value: number;
  formattedValue: string;
  x: number;
  y: number;
}

export interface KarneSparklineData {
  metric: SparklineMetricMode;
  points: SparklinePointCoord[];
  polylinePoints: string;
  areaPath: string;
  minValue: number;
  maxValue: number;
  latestValue: number;
  deltaValue: number;
  formattedLatest: string;
  formattedDelta: string;
  width: number;
  height: number;
}

export function buildKarneSparklineData(params: {
  historicalTrend: HistoricalExamPoint[];
  metric: SparklineMetricMode;
  gradeProfile?: GradeProfile;
  limit?: number;
  width?: number;
  height?: number;
  paddingX?: number;
  paddingY?: number;
}): KarneSparklineData {
  const {
    historicalTrend,
    metric,
    gradeProfile,
    limit = 5,
    width = 280,
    height = 72,
    paddingX = 16,
    paddingY = 12,
  } = params;

  const sliced = (historicalTrend ?? []).slice(-Math.max(1, limit));
  const rawValues = sliced.map((pt) => (metric === 'net' ? pt.net : pt.score));

  if (sliced.length === 0) {
    return {
      metric,
      points: [],
      polylinePoints: '',
      areaPath: '',
      minValue: 0,
      maxValue: 0,
      latestValue: 0,
      deltaValue: 0,
      formattedLatest: metric === 'net' ? '0.00 Net' : '0.0 Puan',
      formattedDelta: metric === 'net' ? '+0.00 Net' : '+0.0 Puan',
      width,
      height,
    };
  }

  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);
  const span = Math.max(metric === 'net' ? 1 : 5, maxRaw - minRaw);
  const innerW = Math.max(1, width - paddingX * 2);
  const innerH = Math.max(1, height - paddingY * 2);

  const coords: SparklinePointCoord[] = sliced.map((pt, idx) => {
    const val = metric === 'net' ? pt.net : pt.score;
    const x =
      sliced.length === 1
        ? Number((width / 2).toFixed(1))
        : Number((paddingX + (idx / (sliced.length - 1)) * innerW).toFixed(1));
    const normY = (val - minRaw) / span;
    const y = Number((paddingY + innerH - normY * innerH).toFixed(1));
    const safeName = gradeProfile
      ? sanitizeExamLabelForGrade(pt.examName, gradeProfile)
      : pt.examName;
    const denemeMatch = safeName.match(/^(Deneme\s*\d+)/i);
    const shortLabel = denemeMatch
      ? denemeMatch[1]
      : /Son\s+Deneme/i.test(safeName)
      ? 'Son Deneme'
      : safeName.length > 10
      ? `${safeName.slice(0, 9).trim()}…`
      : safeName;

    return {
      index: idx,
      examName: safeName,
      shortLabel,
      date: pt.date,
      value: val,
      formattedValue: metric === 'net' ? `${val.toFixed(1)}` : `${val.toFixed(1)}`,
      x,
      y,
    };
  });

  const polylinePoints = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const firstPt = coords[0];
  const lastPt = coords[coords.length - 1];
  const baseY = Number((height - 2).toFixed(1));
  const areaPath =
    coords.length >= 2
      ? `M ${firstPt.x},${baseY} L ${coords.map((p) => `${p.x},${p.y}`).join(' L ')} L ${lastPt.x},${baseY} Z`
      : '';

  const firstVal = rawValues[0];
  const latestVal = rawValues[rawValues.length - 1];
  const deltaVal = Number((latestVal - firstVal).toFixed(2));
  const sign = deltaVal >= 0 ? '+' : '';
  const unit = metric === 'net' ? 'Net' : 'Puan';
  const decimals = metric === 'net' ? 2 : 1;

  return {
    metric,
    points: coords,
    polylinePoints,
    areaPath,
    minValue: minRaw,
    maxValue: maxRaw,
    latestValue: latestVal,
    deltaValue: deltaVal,
    formattedLatest: `${latestVal.toFixed(decimals)} ${unit}`,
    formattedDelta: `${sign}${deltaVal.toFixed(decimals)} ${unit}`,
    width,
    height,
  };
}
