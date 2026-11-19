import { useId, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { GradeProfile, HistoricalExamPoint } from '../types/academy';
import {
  buildKarneSparklineData,
  SparklineMetricMode,
} from '../utils/karneSparkline';

interface KarneTrendSparklineProps {
  historicalTrend: HistoricalExamPoint[];
  gradeProfile: GradeProfile;
  studentName?: string;
}

export function KarneTrendSparkline({
  historicalTrend,
  gradeProfile,
  studentName,
}: KarneTrendSparklineProps) {
  const uid = useId().replace(/:/g, '');
  const [metric, setMetric] = useState<SparklineMetricMode>('net');

  const spark = useMemo(
    () =>
      buildKarneSparklineData({
        historicalTrend,
        metric,
        gradeProfile,
        limit: 5,
      }),
    [historicalTrend, metric, gradeProfile]
  );

  const gradId = `karneSparkGrad-${uid}`;
  const isPositive = spark.deltaValue >= 0;
  const strokeColor = metric === 'net' ? 'var(--chart-1)' : 'var(--chart-3)';

  return (
    <div
      className="surface-alt rounded-xl p-3.5 border space-y-2.5"
      style={{ borderColor: 'var(--border-subtle)' }}
      data-testid="karne-sparkline-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-extrabold truncate">
            Son {spark.points.length || 5} Deneme {metric === 'net' ? 'Net' : 'Puan'} Gelişimi
          </div>
          <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span>{studentName || 'Öğrenci'}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-mono-num font-bold inline-flex items-center gap-0.5 ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
              data-testid="karne-sparkline-delta"
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3 h-3" aria-hidden="true" />
              )}
              <span>{spark.formattedDelta}</span>
            </span>
          </div>
        </div>

        <div
          className="inline-flex items-center gap-1 p-0.5 rounded-lg surface-card border shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="group"
          aria-label="Sparkline metrik seçimi"
        >
          <button
            type="button"
            aria-pressed={metric === 'net'}
            data-testid="karne-sparkline-toggle-net"
            onClick={() => setMetric('net')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
              metric === 'net' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            Net
          </button>
          <button
            type="button"
            aria-pressed={metric === 'score'}
            data-testid="karne-sparkline-toggle-score"
            onClick={() => setMetric('score')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
              metric === 'score' ? 'btn-3d' : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            Toplam Puan
          </button>
        </div>
      </div>

      {spark.points.length === 0 ? (
        <div
          className="text-xs py-4 text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          Son 5 deneme verisi oluştuğunda gelişim grafiği burada görünür.
        </div>
      ) : (
        <>
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${spark.width} ${spark.height}`}
              className="w-full h-[76px] block"
              role="img"
              aria-label={`Son ${spark.points.length} deneme ${
                metric === 'net' ? 'net' : 'toplam puan'
              } sparkline grafiği: ${spark.points
                .map((p) => `${p.examName} ${p.formattedValue}`)
                .join(', ')}`}
              data-testid="karne-sparkline-svg"
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {spark.areaPath && (
                <path d={spark.areaPath} fill={`url(#${gradId})`} />
              )}

              {spark.points.length >= 2 && (
                <polyline
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={spark.polylinePoints}
                />
              )}

              {spark.points.map((pt, idx) => {
                const isLast = idx === spark.points.length - 1;
                return (
                  <g key={`${pt.examName}-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isLast ? 4.2 : 3}
                      fill={isLast ? strokeColor : 'var(--bg-surface)'}
                      stroke={strokeColor}
                      strokeWidth="2"
                    >
                      <title>{`${pt.examName} (${pt.date}): ${pt.formattedValue} ${
                        metric === 'net' ? 'Net' : 'Puan'
                      }`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>

          <div
            className="grid gap-1 pt-1 border-t"
            style={{
              borderColor: 'var(--border-subtle)',
              gridTemplateColumns: `repeat(${spark.points.length}, minmax(0, 1fr))`,
            }}
          >
            {spark.points.map((pt, idx) => {
              const isLast = idx === spark.points.length - 1;
              return (
                <div key={`${pt.examName}-lbl-${idx}`} className="text-center min-w-0">
                  <div
                    className={`font-mono-num text-[11px] font-bold truncate ${
                      isLast ? '' : 'opacity-85'
                    }`}
                    style={{
                      color: isLast ? strokeColor : 'var(--text-primary)',
                    }}
                  >
                    {pt.formattedValue}
                  </div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: 'var(--text-secondary)' }}
                    title={pt.examName}
                  >
                    {pt.shortLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
