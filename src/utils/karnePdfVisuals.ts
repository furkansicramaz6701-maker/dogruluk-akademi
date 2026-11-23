import {
  PERFORMANCE_THRESHOLDS,
  PerformanceTierVisual,
  resolveExamPerformanceVisual,
} from './karneVisualMetrics';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

/**
 * Draws a crisp 5-pointed vector star centered at (cx, cy).
 */
export function drawVectorStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  fillColor: string,
  strokeColor?: string
) {
  const innerRadius = outerRadius * 0.44;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(0.8, outerRadius * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStarRatingRow(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    cy: number;
    stars: number;
    maxStars?: number;
    radius?: number;
    gap?: number;
    fillColor?: string;
    emptyColor?: string;
    label?: string;
    labelColor?: string;
    labelFont?: string;
  }
) {
  const maxStars = opts.maxStars ?? 5;
  const r = opts.radius ?? 7;
  const gap = opts.gap ?? 4;
  const step = r * 2 + gap;
  const fillColor = opts.fillColor ?? '#f59e0b';
  const emptyColor = opts.emptyColor ?? '#e2e8f0';

  for (let i = 0; i < maxStars; i++) {
    const filled = i < opts.stars;
    const cx = opts.x + r + i * step;
    drawVectorStar(
      ctx,
      cx,
      opts.cy,
      r,
      filled ? fillColor : emptyColor,
      filled ? '#b45309' : '#cbd5e1'
    );
  }

  if (opts.label) {
    const endX = opts.x + maxStars * step + 4;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = opts.labelColor ?? '#0f172a';
    ctx.font = opts.labelFont ?? '800 13px "JetBrains Mono", monospace';
    ctx.fillText(opts.label, endX, opts.cy + 4.5);
    ctx.restore();
  }
}

export function drawTierPillBadge(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    visual: PerformanceTierVisual;
    text?: string;
    fontSize?: number;
  }
) {
  const { x, y, w, h, visual } = opts;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = visual.badgeBg;
  ctx.fill();
  ctx.strokeStyle = visual.badgeBorder;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Status dot
  ctx.beginPath();
  ctx.arc(x + 11, y + h / 2, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = visual.accentColor;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = visual.textColor;
  ctx.font = `800 ${opts.fontSize ?? 11.5}px "DM Sans", sans-serif`;
  ctx.fillText(opts.text ?? visual.shortLabel, x + (w + 8) / 2, y + h / 2 + 4);
  ctx.restore();
}

export function drawSegmentedProgressBar(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    visual: PerformanceTierVisual;
    showScaleLabels?: boolean;
  }
) {
  const { x, y, w, h, visual, showScaleLabels = true } = opts;
  const pct = visual.progressPct;
  const fillW = pct > 0 ? Math.max(10, (w * pct) / 100) : 0;

  ctx.save();

  // Soft 3-zone background track (Tekrar | Gelişmekte | Başarılı)
  const zone1W = (w * PERFORMANCE_THRESHOLDS.tekrarMaxExclusive) / 100;
  const zone2W =
    (w * (PERFORMANCE_THRESHOLDS.basariliMinInclusive - PERFORMANCE_THRESHOLDS.tekrarMaxExclusive)) /
    100;
  const zone3W = w - zone1W - zone2W;

  drawRoundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#fff1f2';
  ctx.fillRect(x, y, zone1W, h);
  ctx.fillStyle = '#fffbeb';
  ctx.fillRect(x + zone1W, y, zone2W, h);
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(x + zone1W + zone2W, y, zone3W, h);

  if (fillW > 0) {
    const grad = ctx.createLinearGradient(x, y, x + fillW, y);
    grad.addColorStop(0, visual.accentColor);
    grad.addColorStop(1, visual.secondaryColor);
    ctx.fillStyle = grad;
    drawRoundedRectPath(ctx, x, y, fillW, h, h / 2);
    ctx.fill();
  }
  ctx.restore();

  // Outer border
  drawRoundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Threshold dividers (45% & 70%)
  [PERFORMANCE_THRESHOLDS.tekrarMaxExclusive, PERFORMANCE_THRESHOLDS.basariliMinInclusive].forEach(
    (mark) => {
      const mx = x + (w * mark) / 100;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, y - 2);
      ctx.lineTo(mx, y + h + 2);
      ctx.stroke();
    }
  );

  // Percentage indicator pill inside or beside bar
  if (showScaleLabels) {
    ctx.font = '700 10.5px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#be123c';
    ctx.fillText('0–44% Tekrar', x, y + h + 15);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b45309';
    ctx.fillText('45–69% Gelişmekte', x + w * 0.575, y + h + 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#047857';
    ctx.fillText('70–100% Başarılı', x + w, y + h + 15);
  }

  ctx.restore();
}

export function drawInlineProgressBar(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    pct: number;
    visual: PerformanceTierVisual;
  }
) {
  const { x, y, w, h, pct, visual } = opts;
  const clamped = Math.max(0, Math.min(100, pct));
  const fillW = clamped > 0 ? Math.max(6, (w * clamped) / 100) : 0;

  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();

  if (fillW > 0) {
    drawRoundedRectPath(ctx, x, y, fillW, h, h / 2);
    ctx.fillStyle = visual.accentColor;
    ctx.fill();
  }

  drawRoundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

/**
 * Executive Page-1 Graphical Progress & Star Rating Summary Strip.
 */
export function drawKarneSuccessBanner(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    successPct: number;
    hasExamData?: boolean;
    title?: string;
  }
) {
  const { x, y, w, h, successPct, hasExamData = true } = opts;
  const visual = resolveExamPerformanceVisual({ successPct, hasExamData });

  ctx.save();

  // Subtle shadow & card container
  ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
  drawRoundedRectPath(ctx, x + 3, y + 4, w, h, 10);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  drawRoundedRectPath(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = visual.badgeBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left accent strip
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = visual.accentColor;
  ctx.fillRect(x, y, 8, h);
  ctx.restore();

  // Left block: Compact Status Label + Status Pill (x + 22 .. x + 196)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '800 11.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BAŞARI DÜZEYİ', x + 22, y + 24);

  drawTierPillBadge(ctx, {
    x: x + 22,
    y: y + 34,
    w: hasExamData ? 168 : 182,
    h: 30,
    visual,
    text: visual.label.toUpperCase(),
    fontSize: 11.5,
  });

  // Center block: Segmented graphical progress bar (x + 216 .. starBoxX - 24)
  const starBoxW = 236;
  const starBoxX = x + w - starBoxW - 14;
  const barX = x + 218;
  const barW = starBoxX - 22 - barX;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(opts.title ?? 'SINAV BAŞARI İLERLEMESİ', barX, y + 24, barW - 76);

  ctx.textAlign = 'right';
  ctx.fillStyle = visual.accentColor;
  ctx.font = '800 17px "JetBrains Mono", monospace';
  ctx.fillText(hasExamData ? `%${visual.progressPct}` : '%0 (Bekleniyor)', barX + barW, y + 25);

  drawSegmentedProgressBar(ctx, {
    x: barX,
    y: y + 33,
    w: barW,
    h: 15,
    visual,
    showScaleLabels: true,
  });

  // Right block: 5-Star Rating + Caption
  ctx.fillStyle = '#f8fafc';
  drawRoundedRectPath(ctx, starBoxX, y + 10, starBoxW, h - 20, 8);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '700 11.5px "DM Sans", sans-serif';
  ctx.fillText('BAŞARI YILDIZ PUANLAMASI', starBoxX + 14, y + 27);

  drawStarRatingRow(ctx, {
    x: starBoxX + 14,
    cy: y + 48,
    stars: visual.stars,
    maxStars: 5,
    radius: 9.5,
    gap: 6,
    fillColor: visual.starFillColor,
    emptyColor: visual.starEmptyColor,
    label: `${visual.stars}/5`,
    labelColor: visual.textColor,
    labelFont: '800 15px "JetBrains Mono", monospace',
  });

  ctx.restore();
}
