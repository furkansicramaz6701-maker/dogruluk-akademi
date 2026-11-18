import {
  CloudRain,
  Sun,
  Wind,
  Snowflake,
  Clock,
  BookOpen,
  Ruler,
  Utensils,
  MapPin,
} from 'lucide-react';
import { QuestionVisualSpec } from '../types/academy';

interface QuestionVisualPreviewProps {
  visual: QuestionVisualSpec;
  compact?: boolean;
}

export function QuestionVisualPreview({ visual, compact = false }: QuestionVisualPreviewProps) {
  if (visual.type === 'chart') {
    const bars = visual.bars && visual.bars.length > 0 ? visual.bars : [
      { label: 'Pzt', value: 40 },
      { label: 'Sal', value: 55 },
      { label: 'Çar', value: 35 },
      { label: 'Per', value: 70 },
    ];
    const maxVal = Math.max(10, ...bars.map((b) => Number(b.value) || 0));
    const svgW = 360;
    const svgH = compact ? 130 : 165;
    const chartBottom = svgH - 28;
    const chartTop = 18;
    const availH = chartBottom - chartTop;
    const barGap = (svgW - 60) / Math.max(1, bars.length);
    const barW = Math.min(44, barGap * 0.62);

    return (
      <div
        className="surface-alt rounded-lg p-3 border space-y-1.5"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="visual-preview-chart"
      >
        <div className="flex items-center justify-between gap-2 text-xs font-bold">
          <span>{visual.title}</span>
          {visual.yAxisLabel && (
            <span className="text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {visual.yAxisLabel}
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-[380px] mx-auto block">
          <line x1="34" y1={chartTop} x2="34" y2={chartBottom} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
          <line x1="34" y1={chartBottom} x2={svgW - 12} y2={chartBottom} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
          {bars.map((bar, idx) => {
            const val = Number(bar.value) || 0;
            const h = Math.max(6, Math.round((val / maxVal) * availH));
            const x = 44 + idx * barGap + (barGap - barW) / 2;
            const y = chartBottom - h;
            return (
              <g key={`${bar.label}-${idx}`}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="4"
                  fill={idx % 2 === 0 ? 'var(--chart-1)' : 'var(--chart-3)'}
                />
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="currentColor"
                >
                  {val}
                </text>
                <text
                  x={x + barW / 2}
                  y={svgH - 10}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="currentColor"
                  opacity="0.82"
                >
                  {bar.label.slice(0, 10)}
                </text>
              </g>
            );
          })}
        </svg>
        {visual.caption && (
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {visual.caption}
          </div>
        )}
      </div>
    );
  }

  if (visual.type === 'table') {
    const headers = visual.headers && visual.headers.length > 0 ? visual.headers : ['Veri', 'Değer'];
    const rows = visual.rows && visual.rows.length > 0 ? visual.rows : [['Örnek', '10']];
    return (
      <div
        className="surface-alt rounded-lg p-3 border space-y-1.5"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="visual-preview-table"
      >
        <div className="text-xs font-bold">{visual.title}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-2 py-1.5 font-bold border surface-card"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {headers.map((_, ci) => (
                    <td
                      key={ci}
                      className="px-2 py-1 border font-mono-num"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {row[ci] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visual.caption && (
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {visual.caption}
          </div>
        )}
      </div>
    );
  }

  if (visual.type === 'math') {
    const shape = visual.geometryShape || 'rectangle';
    return (
      <div
        className="surface-alt rounded-lg p-3 border space-y-2"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="visual-preview-math"
      >
        <div className="text-xs font-bold">{visual.title}</div>
        <div className="flex flex-wrap items-center gap-4">
          {shape !== 'none' && (
            <svg width="118" height="78" viewBox="0 0 118 78" className="shrink-0">
              {shape === 'triangle' && (
                <>
                  <polygon
                    points="18,64 18,14 98,64"
                    fill="var(--accent-soft)"
                    stroke="var(--accent-primary)"
                    strokeWidth="2.5"
                  />
                  <rect x="18" y="54" width="10" height="10" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" />
                  <text x="10" y="42" fontSize="10" fontWeight="700" fill="currentColor">a</text>
                  <text x="56" y="75" fontSize="10" fontWeight="700" fill="currentColor">b</text>
                  <text x="60" y="34" fontSize="10" fontWeight="700" fill="currentColor">c</text>
                </>
              )}
              {shape === 'rectangle' && (
                <>
                  <rect
                    x="14"
                    y="16"
                    width="90"
                    height="46"
                    fill="var(--accent-soft)"
                    stroke="var(--accent-primary)"
                    strokeWidth="2.5"
                  />
                  <text x="58" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">Uzun Kenar</text>
                  <text x="58" y="74" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">Kısa Kenar</text>
                </>
              )}
              {shape === 'circle' && (
                <>
                  <circle cx="59" cy="39" r="28" fill="var(--accent-soft)" stroke="var(--accent-primary)" strokeWidth="2.5" />
                  <line x1="59" y1="39" x2="87" y2="39" stroke="var(--chart-3)" strokeWidth="2" />
                  <text x="72" y="35" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">r</text>
                </>
              )}
              {shape === 'fraction' && (
                <>
                  {[0, 1, 2, 3].map((i) => (
                    <rect
                      key={i}
                      x={12 + i * 24}
                      y="24"
                      width="22"
                      height="30"
                      fill={i < 3 ? 'var(--accent-primary)' : 'transparent'}
                      fillOpacity={i < 3 ? 0.78 : 1}
                      stroke="var(--accent-primary)"
                      strokeWidth="2"
                    />
                  ))}
                  <text x="59" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">3 / 4</text>
                </>
              )}
            </svg>
          )}
          <div className="flex-1 min-w-[180px] space-y-1">
            {visual.formula && (
              <div className="surface-card rounded-md px-3 py-2 text-xs font-mono-num font-bold">
                {visual.formula}
              </div>
            )}
            {visual.steps && visual.steps.length > 0 && (
              <ul className="text-[11px] space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                {visual.steps.map((st, idx) => (
                  <li key={idx}>• {st}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 'image': uploaded image OR English illustrated scene preset
  const labels = visual.sceneLabels ?? ['Sunny 28°C', 'Windy 18°C', 'Rainy 12°C', 'Snowy 1°C'];
  const sceneId = visual.scenePresetId || 'weather';

  return (
    <div
      className="surface-alt rounded-lg p-3 border space-y-2"
      style={{ borderColor: 'var(--border-subtle)' }}
      data-testid="visual-preview-image"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span>{visual.title}</span>
        <span className="text-[10px] font-mono-num" style={{ color: 'var(--accent-primary)' }}>
          {visual.imageDataUrl ? 'Özel Görsel' : 'Resimli Sahne'}
        </span>
      </div>

      {visual.imageDataUrl ? (
        <img
          src={visual.imageDataUrl}
          alt={visual.title}
          className={`w-full rounded-md object-contain bg-white border ${compact ? 'max-h-36' : 'max-h-48'}`}
          style={{ borderColor: 'var(--border-subtle)' }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {labels.slice(0, 4).map((lbl, idx) => {
            const Icon =
              sceneId === 'weather'
                ? [Sun, Wind, CloudRain, Snowflake][idx % 4]
                : sceneId === 'daily-routine'
                  ? Clock
                  : sceneId === 'classroom-objects'
                    ? [BookOpen, Ruler, BookOpen, Ruler][idx % 4]
                    : sceneId === 'food-menu'
                      ? Utensils
                      : MapPin;
            const iconBg =
              idx === 0
                ? 'bg-amber-100 text-amber-700'
                : idx === 1
                  ? 'bg-sky-100 text-sky-700'
                  : idx === 2
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-100 text-indigo-700';

            return (
              <div
                key={idx}
                className="surface-card rounded-lg p-2 flex flex-col items-center text-center gap-1.5 border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconBg}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <span className="text-[10.5px] font-bold leading-tight">{lbl}</span>
              </div>
            );
          })}
        </div>
      )}

      {visual.caption && (
        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {visual.caption}
        </div>
      )}
    </div>
  );
}
