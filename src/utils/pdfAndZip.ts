import JSZip from 'jszip';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { getGradeProfile } from '../data/curriculum';
import { getLogoPreset } from '../data/logos';
import { ACADEMY_THEMES } from '../data/themes';
import {
  BookletCode,
  CoverConfig,
  CoverLayoutStyleId,
  ExamAnalysisResult,
  ExamQuestion,
  GradeProfile,
  Institution,
  LogoPreset,
  OpenEndedPaperAnalysis,
  OpenEndedQuestion,
  PdfUploadStripOptions,
  QuestionVisualSpec,
  StudentRecord,
  WeeklyComparisonRow,
} from '../types/academy';
import {
  BOOKLET_CODES,
  buildAllBookletsAnswerKeyCsv,
  buildBookletPdfFilename,
  buildBookletVariantQuestions,
  buildOpticalPdfFilename,
  extractGradeLabelFromCover,
  normalizeBookletNumber,
  resolveCoverColorPalette,
  resolveCoverLayoutStyle,
} from './bookletDistribution';
import { computeKeptUploadedPdfIndices } from './examPdfParser';
import {
  canvasToBlobSafe,
  dataUrlToUint8Array,
  triggerDownload,
  triggerStaggeredDownloads,
  yieldToMainThread,
} from './downloadHelpers';
import { buildWeeklyComparisonWorkbookBlob, defaultClassroomForGrade } from './excelExport';
import {
  buildParentInformationReportData,
  ParentReportData,
} from './parentReportPdf';
import {
  buildWatermarkDisplayText,
  computeCenteredRotatedPosition,
  computeWatermarkPlacements,
  drawCanvasWatermark,
  resolvePdfWatermarkConfig,
} from './pdfWatermark';
import {
  drawInlineProgressBar,
  drawKarneSuccessBanner,
  drawStarRatingRow,
  drawTierPillBadge,
} from './karnePdfVisuals';
import {
  resolveSubjectProgressVisual,
  resolveTopicProgressVisual,
} from './karneVisualMetrics';
import { NextStudySessionSummary } from './weeklyAnalysis';

export { triggerDownload, triggerStaggeredDownloads };

const A4_W = 1240;
const A4_H = 1754;

function toAsciiSafe(text: string): string {
  return text
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawFittedSingleLineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: string,
  family: string,
  startSizePx: number,
  minSizePx = 10
): void {
  let size = startSizePx;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSizePx && ctx.measureText(text).width > maxWidth) {
    size -= 0.5;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(text, x, y, maxWidth);
}

function drawAcademyCrestCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  preset: LogoPreset
) {
  ctx.save();
  ctx.translate(cx, cy);

  // 3D Extruded Back Plates
  for (let i = 3; i >= 1; i--) {
    ctx.fillStyle = i === 3 ? 'rgba(2,6,23,0.45)' : preset.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-r + i * 2.5, -r + i * 3, r * 2, r * 2, r * 0.36);
    ctx.fill();
  }

  // Front Beveled Crest Tile
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, preset.primaryColor);
  grad.addColorStop(1, preset.secondaryColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.36);
  ctx.fill();

  ctx.strokeStyle = preset.goldColor;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.stroke();

  // Inner Shield Outline
  const sr = r * 0.68;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.8, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -sr);
  ctx.lineTo(sr * 0.85, -sr * 0.55);
  ctx.lineTo(sr * 0.85, sr * 0.15);
  ctx.quadraticCurveTo(sr * 0.72, sr * 0.78, 0, sr);
  ctx.quadraticCurveTo(-sr * 0.72, sr * 0.78, -sr * 0.85, sr * 0.15);
  ctx.lineTo(-sr * 0.85, -sr * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Open Book
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -sr * 0.12);
  ctx.lineTo(-sr * 0.55, -sr * 0.32);
  ctx.lineTo(-sr * 0.55, sr * 0.32);
  ctx.lineTo(0, sr * 0.52);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#dbeafe';
  ctx.beginPath();
  ctx.moveTo(0, -sr * 0.12);
  ctx.lineTo(sr * 0.55, -sr * 0.32);
  ctx.lineTo(sr * 0.55, sr * 0.32);
  ctx.lineTo(0, sr * 0.52);
  ctx.closePath();
  ctx.fill();

  // Gold Apex Star
  ctx.fillStyle = preset.goldColor;
  ctx.beginPath();
  ctx.arc(0, -sr * 0.5, sr * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw3DFurkanSignature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  primaryColor = '#0f2747',
  goldColor = '#f59e0b'
) {
  // 3D Institutional Verification Seal Ring behind signature
  ctx.save();
  ctx.translate(x + 148, y + 48);
  ctx.strokeStyle = goldColor;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 82, 31, -0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const drawStrokes = (
    ox: number,
    oy: number,
    strokeStyle: string | CanvasGradient,
    width: number
  ) => {
    ctx.save();
    ctx.translate(x + ox, y + oy);
    ctx.scale(0.92, 0.92);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Ornate Calligraphic Capital F
    ctx.beginPath();
    ctx.moveTo(18, 32);
    ctx.bezierCurveTo(30, 8, 70, 4, 96, 14);
    ctx.bezierCurveTo(82, 14, 56, 17, 46, 22);
    ctx.bezierCurveTo(39, 42, 34, 62, 23, 82);
    ctx.bezierCurveTo(18, 89, 10, 86, 15, 76);
    ctx.stroke();

    // Sweeping cursive -urkan with tall calligraphic k-loop & flourish tail
    ctx.beginPath();
    ctx.moveTo(22, 48);
    ctx.bezierCurveTo(40, 42, 56, 41, 66, 44);
    ctx.bezierCurveTo(70, 57, 79, 58, 86, 43);
    ctx.bezierCurveTo(88, 55, 95, 57, 102, 45);
    ctx.bezierCurveTo(107, 37, 114, 40, 113, 50);
    ctx.bezierCurveTo(117, 44, 127, 22, 134, 11);
    ctx.bezierCurveTo(138, 5, 131, 44, 127, 58);
    ctx.bezierCurveTo(133, 44, 145, 36, 149, 42);
    ctx.bezierCurveTo(145, 48, 136, 52, 148, 56);
    ctx.bezierCurveTo(158, 58, 169, 40, 178, 44);
    ctx.bezierCurveTo(182, 47, 174, 58, 166, 56);
    ctx.bezierCurveTo(162, 53, 170, 42, 179, 45);
    ctx.bezierCurveTo(181, 53, 185, 57, 193, 45);
    ctx.bezierCurveTo(197, 41, 202, 45, 200, 54);
    ctx.bezierCurveTo(206, 42, 214, 41, 217, 51);
    ctx.bezierCurveTo(221, 57, 238, 46, 260, 40);
    ctx.stroke();

    // Double calligraphic underline flourish
    ctx.lineWidth = Math.max(1.8, width * 0.62);
    ctx.beginPath();
    ctx.moveTo(18, 89);
    ctx.bezierCurveTo(78, 68, 182, 65, 256, 76);
    ctx.bezierCurveTo(222, 81, 148, 86, 94, 94);
    ctx.stroke();
    ctx.restore();
  };

  const inkGrad = ctx.createLinearGradient(x, y, x + 240, y + 60);
  inkGrad.addColorStop(0, primaryColor);
  inkGrad.addColorStop(0.55, primaryColor === '#ffffff' ? '#e0f2fe' : '#1d4ed8');
  inkGrad.addColorStop(1, primaryColor);

  const goldGrad = ctx.createLinearGradient(x, y, x + 240, y + 60);
  goldGrad.addColorStop(0, '#d97706');
  goldGrad.addColorStop(0.5, '#fde047');
  goldGrad.addColorStop(1, goldColor);

  // Multi-depth 3D Volumetric Drop Shadow + 24K Gold Bevel + Calligraphic Fountain Ink
  drawStrokes(5.2, 6.2, 'rgba(15, 23, 42, 0.16)', 6.8);
  drawStrokes(3.0, 3.8, 'rgba(15, 23, 42, 0.28)', 5.6);
  drawStrokes(1.6, 1.9, goldGrad, 4.8);
  drawStrokes(0, 0, inkGrad, 3.8);

  // Quill star spark accent at tip
  ctx.save();
  ctx.translate(x + 239, y + 36);
  ctx.fillStyle = goldColor;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(2, -2);
  ctx.lineTo(7, 0);
  ctx.lineTo(2, 2);
  ctx.lineTo(0, 7);
  ctx.lineTo(-2, 2);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-2, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTop3MedalCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rank: 1 | 2 | 3
) {
  const palette =
    rank === 1
      ? { rim: '#d97706', fill1: '#fef08a', fill2: '#f59e0b', text: '#78350f' }
      : rank === 2
        ? { rim: '#64748b', fill1: '#f8fafc', fill2: '#cbd5e1', text: '#1e293b' }
        : { rim: '#9a3412', fill1: '#fed7aa', fill2: '#ea580c', text: '#431407' };

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, r, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.15, cx, cy, r);
  grad.addColorStop(0, palette.fill1);
  grad.addColorStop(1, palette.fill2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.stroke();

  ctx.fillStyle = palette.text;
  ctx.font = `800 ${Math.round(r * 1.05)}px "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), cx, cy + 1);
  ctx.restore();
}

function drawCoverLayoutGeometry(
  ctx: CanvasRenderingContext2D,
  layoutId: CoverLayoutStyleId,
  preset: LogoPreset,
  isBackCover = false
) {
  ctx.save();
  if (layoutId === 'diyagonal-serit') {
    ctx.globalAlpha = isBackCover ? 0.08 : 0.11;
    ctx.fillStyle = preset.primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 290);
    ctx.lineTo(A4_W, 110);
    ctx.lineTo(A4_W, 380);
    ctx.lineTo(0, 560);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = preset.goldColor;
    ctx.beginPath();
    ctx.moveTo(0, A4_H - 360);
    ctx.lineTo(A4_W, A4_H - 540);
    ctx.lineTo(A4_W, A4_H - 250);
    ctx.lineTo(0, A4_H - 90);
    ctx.closePath();
    ctx.fill();

    // Angled top-right corner diamond accent
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = preset.goldColor;
    ctx.beginPath();
    ctx.moveTo(A4_W - 240, 0);
    ctx.lineTo(A4_W, 0);
    ctx.lineTo(A4_W, 240);
    ctx.closePath();
    ctx.fill();
  } else if (layoutId === 'geometrik-blok') {
    // Architectural left vertical spine bar + gold inner stripe + geometric blocks
    ctx.fillStyle = preset.primaryColor;
    ctx.fillRect(0, 0, 32, A4_H);
    ctx.fillStyle = preset.goldColor;
    ctx.fillRect(32, 0, 8, A4_H);

    ctx.globalAlpha = 0.1;
    ctx.fillStyle = preset.primaryColor;
    ctx.fillRect(A4_W - 220, 320, 220, 120);
    ctx.fillStyle = preset.goldColor;
    ctx.fillRect(A4_W - 300, A4_H - 360, 300, 140);
  } else if (layoutId === 'akademik-kose') {
    // 4-Corner Ceremonial Ribbon Triangles
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = preset.secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(180, 0);
    ctx.lineTo(0, 180);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = preset.goldColor;
    ctx.beginPath();
    ctx.moveTo(A4_W, 0);
    ctx.lineTo(A4_W - 180, 0);
    ctx.lineTo(A4_W, 180);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = preset.goldColor;
    ctx.beginPath();
    ctx.moveTo(0, A4_H);
    ctx.lineTo(160, A4_H);
    ctx.lineTo(0, A4_H - 160);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = preset.secondaryColor;
    ctx.beginPath();
    ctx.moveTo(A4_W, A4_H);
    ctx.lineTo(A4_W - 160, A4_H);
    ctx.lineTo(A4_W, A4_H - 160);
    ctx.closePath();
    ctx.fill();
  } else {
    // Klasik Çerçeve subtle ribbons
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = preset.primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, 270);
    ctx.lineTo(A4_W, 120);
    ctx.lineTo(A4_W, 380);
    ctx.lineTo(0, 520);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = preset.goldColor;
    ctx.beginPath();
    ctx.moveTo(0, A4_H - 360);
    ctx.lineTo(A4_W, A4_H - 500);
    ctx.lineTo(A4_W, A4_H - 220);
    ctx.lineTo(0, A4_H - 120);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Outer Institutional 3D Frame
  ctx.strokeStyle = preset.secondaryColor;
  ctx.lineWidth = layoutId === 'geometrik-blok' ? 5 : 8;
  ctx.strokeRect(42, 42, A4_W - 84, A4_H - 84);
  ctx.strokeStyle = preset.goldColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(56, 56, A4_W - 112, A4_H - 112);
}

async function canvasToEncodedBytes(
  canvas: HTMLCanvasElement,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.92
): Promise<Uint8Array> {
  const blob = await canvasToBlobSafe(canvas, mimeType, quality);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function renderCoverCanvasPng(cover: CoverConfig): Promise<Uint8Array> {
  return renderCoverCanvasEncoded(cover, 'image/png');
}

async function renderCoverCanvasEncoded(
  cover: CoverConfig,
  mimeType: 'image/png' | 'image/jpeg'
): Promise<Uint8Array> {
  const basePreset = getLogoPreset(cover.logoStyleId);
  const palette = resolveCoverColorPalette(cover, basePreset);
  const layoutId = resolveCoverLayoutStyle(cover).id;
  const preset: LogoPreset = {
    ...basePreset,
    primaryColor: palette.primaryColor,
    secondaryColor: palette.secondaryColor,
    goldColor: palette.goldColor,
  };
  const gradeLabel = extractGradeLabelFromCover(cover);
  const bookletNum = cover.bookletNumber ? normalizeBookletNumber(cover.bookletNumber) : '';
  const canvas = document.createElement('canvas');
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d')!;

  // Colorful 3D Academic Paper Base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);

  drawCoverLayoutGeometry(ctx, layoutId, preset, false);

  // Colorful Gradient Header Band
  const hGrad = ctx.createLinearGradient(56, 56, A4_W - 56, 280);
  hGrad.addColorStop(0, preset.secondaryColor);
  hGrad.addColorStop(1, preset.primaryColor);
  ctx.fillStyle = hGrad;
  ctx.fillRect(56, 56, A4_W - 112, 222);

  // Gold Accent Strip under Header
  ctx.fillStyle = preset.goldColor;
  ctx.fillRect(56, 278, A4_W - 112, 8);

  // 3D Academy Crest Logo
  drawAcademyCrestCanvas(ctx, 160, 166, 62, preset);

  // Brand & 8-digit Kurum Kodu
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cover.academyName.toUpperCase(), 252, 128);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '600 20px "DM Sans", sans-serif';
  ctx.fillText(`${gradeLabel.toUpperCase()} · ${preset.headerSubtitle.toUpperCase()}`, 252, 168);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 19px "JetBrains Mono", monospace';
  ctx.fillText(
    `KURUM KODU: ${cover.institutionCode8 || '48291045'}${bookletNum ? ` · KİTAPÇIK NO: ${bookletNum}` : ''}`,
    252,
    208
  );

  // 3D Booklet Code Card (A, B, C, or D)
  ctx.fillStyle = 'rgba(2,6,23,0.35)';
  ctx.fillRect(A4_W - 216, 94, 126, 152);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(A4_W - 222, 86, 126, 152);
  ctx.strokeStyle = preset.goldColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(A4_W - 222, 86, 126, 152);
  ctx.fillStyle = preset.secondaryColor;
  ctx.textAlign = 'center';
  ctx.font = '700 17px "DM Sans", sans-serif';
  ctx.fillText('KİTAPÇIK', A4_W - 159, 114);
  ctx.font = '800 68px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cover.bookletCode, A4_W - 159, 176);
  if (bookletNum) {
    ctx.fillStyle = preset.primaryColor;
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillText(`NO:${bookletNum}`, A4_W - 159, 218);
  }

  // Main Title Section
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapTextLines(ctx, cover.examTitle, A4_W - 220);
  let y = 395;
  for (const line of titleLines) {
    ctx.fillStyle = 'rgba(15,23,42,0.12)';
    ctx.fillText(line, A4_W / 2 + 3, y + 4);
    ctx.fillStyle = preset.secondaryColor;
    ctx.fillText(line, A4_W / 2, y);
    y += 60;
  }

  ctx.fillStyle = '#475569';
  ctx.font = '600 25px "DM Sans", sans-serif';
  ctx.fillText(`${gradeLabel} · ${cover.subtitle}`, A4_W / 2, y + 18);

  // Colorful 3D Exam Spec Strip
  const boxY = y + 82;
  ctx.fillStyle = 'rgba(15,23,42,0.12)';
  ctx.fillRect(108, boxY + 8, A4_W - 200, 148);
  const specGrad = ctx.createLinearGradient(100, boxY, A4_W - 100, boxY);
  specGrad.addColorStop(0, preset.secondaryColor);
  specGrad.addColorStop(1, preset.primaryColor);
  ctx.fillStyle = specGrad;
  ctx.fillRect(100, boxY, A4_W - 200, 148);

  const showSampleStamp = Boolean(cover.isSampleDemo);
  const cols = [
    { label: 'TOPLAM SORU / SINIF', val: `${cover.questionCount} Soru · ${gradeLabel}` },
    { label: 'SINAV SÜRESİ', val: `${cover.durationMinutes} Dakika` },
    { label: 'KİTAPÇIK / DURUM', val: `${cover.bookletCode}${bookletNum ? ` #${bookletNum}` : ''} · ${showSampleStamp ? 'ÖRNEK' : 'RESMİ'}` },
  ];
  cols.forEach((col, i) => {
    const cx = 100 + ((A4_W - 200) / 3) * (i + 0.5);
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(100 + ((A4_W - 200) / 3) * i, boxY + 24);
      ctx.lineTo(100 + ((A4_W - 200) / 3) * i, boxY + 124);
      ctx.stroke();
    }
    ctx.fillStyle = '#dbeafe';
    ctx.font = '700 17px "DM Sans", sans-serif';
    ctx.fillText(col.label, cx, boxY + 48);
    ctx.fillStyle = i === 2 ? '#fde047' : '#ffffff';
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(col.val, cx, boxY + 98);
  });

  // Student Info Box
  const stuY = boxY + 186;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = preset.primaryColor;
  ctx.lineWidth = 2.5;
  ctx.fillRect(100, stuY, A4_W - 200, 150);
  ctx.strokeRect(100, stuY, A4_W - 200, 150);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b';
  ctx.font = '600 22px "DM Sans", sans-serif';
  ctx.fillText('Öğrenci Adı Soyadı : ______________________________________________', 136, stuY + 54);
  ctx.fillText(
    `Öğrenci No : ____________________  Kitapçık : ${cover.bookletCode}${bookletNum ? ` (No: ${bookletNum})` : ''}  Sınıf : ${gradeLabel}`,
    136,
    stuY + 108
  );

  // Reminders Box
  const remY = stuY + 184;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(100, remY, A4_W - 200, 320);
  ctx.strokeStyle = preset.secondaryColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(100, remY, A4_W - 200, 320);

  ctx.fillStyle = preset.secondaryColor;
  ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ADAYLAR İÇİN SINAV HATIRLATMALARI VE KURALLAR', 136, remY + 46);

  let ry = remY + 92;
  ctx.font = '500 20px "DM Sans", sans-serif';
  ctx.fillStyle = '#1e293b';
  cover.reminders.slice(0, 6).forEach((rem, idx) => {
    const lines = wrapTextLines(ctx, `${idx + 1}. ${rem}`, A4_W - 280);
    for (const line of lines) {
      if (ry < remY + 300) {
        ctx.fillText(line, 136, ry);
        ry += 28;
      }
    }
    ry += 6;
  });

  // 3D Embossed Security Stamp ("ÇOĞALTILAMAZ · ÖRNEKTİR")
  ctx.save();
  ctx.translate(295, 1465);
  ctx.rotate(-0.07);
  ctx.fillStyle = '#4c0519';
  ctx.fillRect(-170, -40, 348, 92);
  const sealGrad = ctx.createLinearGradient(-175, -46, 175, 46);
  sealGrad.addColorStop(0, '#be123c');
  sealGrad.addColorStop(1, '#881337');
  ctx.fillStyle = sealGrad;
  ctx.fillRect(-176, -46, 348, 92);
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 3;
  ctx.strokeRect(-176, -46, 348, 92);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ÇOĞALTILAMAZ', 0, -6);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 15px "DM Sans", sans-serif';
  ctx.fillText(
    showSampleStamp ? 'ÖRNEKTİR · İZİNSİZ KOPYALANAMAZ' : 'RESMİ BELGE · İZİNSİZ KOPYALANAMAZ',
    0,
    24
  );
  ctx.restore();

  // 3D Furkan Signature Block
  ctx.textAlign = 'center';
  ctx.fillStyle = '#334155';
  ctx.font = '700 18px "DM Sans", sans-serif';
  ctx.fillText('RESMİ 3D DİJİTAL ONAY VE İMZA', A4_W - 270, 1378);
  draw3DFurkanSignature(ctx, A4_W - 390, 1396, preset.secondaryColor, preset.goldColor);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${cover.signatureName} (Onaylı)`, A4_W - 270, 1515);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 18px "DM Sans", sans-serif';
  ctx.fillText(cover.signatureTitle, A4_W - 270, 1545);

  // Bottom Copyright / Non-duplication Stripe
  ctx.fillStyle = preset.secondaryColor;
  ctx.fillRect(56, A4_H - 118, A4_W - 112, 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    showSampleStamp ? `${cover.securityNotice} · ÖRNEKTİR` : cover.securityNotice,
    A4_W / 2,
    A4_H - 84
  );

  drawCanvasWatermark(ctx, A4_W, A4_H, cover.watermark, {
    colorHex: preset.secondaryColor,
    isSampleDemo: showSampleStamp,
    isCoverOrBack: true,
    headerY: 22,
    footerY: A4_H - 21,
  });

  return canvasToEncodedBytes(canvas, mimeType, 0.92);
}

async function loadCanvasImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function drawQuestionVisualOnCanvas(
  ctx: CanvasRenderingContext2D,
  visual: QuestionVisualSpec,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  preset: LogoPreset
): Promise<number> {
  ctx.save();
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, maxW, maxH);
  ctx.strokeRect(x, y, maxW, maxH);

  ctx.textAlign = 'left';
  ctx.fillStyle = preset.secondaryColor;
  ctx.font = '800 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(visual.title.slice(0, 48), x + 12, y + 22);

  if (visual.type === 'chart') {
    const bars = (visual.bars && visual.bars.length > 0 ? visual.bars : [
      { label: 'Pzt', value: 40 },
      { label: 'Sal', value: 55 },
      { label: 'Car', value: 35 },
      { label: 'Per', value: 70 },
    ]).slice(0, 5);
    const maxVal = Math.max(10, ...bars.map((b) => Number(b.value) || 0));
    const baseLineY = y + maxH - 26;
    const chartTopY = y + 36;
    const availH = Math.max(30, baseLineY - chartTopY);
    const slotW = (maxW - 36) / Math.max(1, bars.length);
    const barW = Math.min(44, slotW * 0.56);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 18, chartTopY);
    ctx.lineTo(x + 18, baseLineY);
    ctx.lineTo(x + maxW - 14, baseLineY);
    ctx.stroke();

    bars.forEach((b, idx) => {
      const val = Number(b.value) || 0;
      const bh = Math.max(6, Math.round((val / maxVal) * availH));
      const bx = x + 22 + idx * slotW + (slotW - barW) / 2;
      const by = baseLineY - bh;
      ctx.fillStyle = idx % 2 === 0 ? preset.primaryColor : '#0d9488';
      ctx.fillRect(bx, by, barW, bh);
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText(String(val), bx + barW / 2, by - 4);
      ctx.font = '600 11.5px "DM Sans", sans-serif';
      ctx.fillText(b.label.slice(0, 9), bx + barW / 2, y + maxH - 8);
    });
  } else if (visual.type === 'table') {
    const headers = (visual.headers ?? ['Veri', 'Deger']).slice(0, 4);
    const rows = (visual.rows ?? [['Ornek', '10']]).slice(0, 4);
    const colW = (maxW - 24) / Math.max(1, headers.length);
    let ty = y + 34;
    const rowH = 26;

    ctx.fillStyle = preset.secondaryColor;
    ctx.fillRect(x + 12, ty, maxW - 24, rowH);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12.5px "DM Sans", sans-serif';
    headers.forEach((h, ci) => {
      ctx.textAlign = 'left';
      ctx.fillText(h.slice(0, 14), x + 18 + ci * colW, ty + 18);
    });
    ty += rowH;

    rows.forEach((r, ri) => {
      ctx.fillStyle = ri % 2 === 0 ? '#ffffff' : '#eff6ff';
      ctx.fillRect(x + 12, ty, maxW - 24, rowH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(x + 12, ty, maxW - 24, rowH);
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 12px "DM Sans", sans-serif';
      headers.forEach((_, ci) => {
        ctx.fillText((r[ci] ?? '').slice(0, 14), x + 18 + ci * colW, ty + 17);
      });
      ty += rowH;
    });
  } else if (visual.type === 'math') {
    const shape = visual.geometryShape || 'rectangle';
    // Geometry figure on left
    ctx.strokeStyle = preset.primaryColor;
    ctx.fillStyle = 'rgba(29, 78, 216, 0.12)';
    ctx.lineWidth = 2.5;
    const gx = x + 18;
    const gy = y + 40;
    if (shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(gx + 10, gy + 72);
      ctx.lineTo(gx + 10, gy + 8);
      ctx.lineTo(gx + 102, gy + 72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(gx + 54, gy + 40, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (shape === 'fraction') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < 3 ? preset.primaryColor : '#ffffff';
        ctx.fillRect(gx + i * 24, gy + 24, 22, 32);
        ctx.strokeRect(gx + i * 24, gy + 24, 22, 32);
      }
    } else {
      ctx.fillRect(gx + 6, gy + 14, 96, 52);
      ctx.strokeRect(gx + 6, gy + 14, 96, 52);
    }

    const tx = gx + 122;
    const tw = maxW - 148;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx, gy + 4, tw, 40);
    ctx.strokeStyle = '#93c5fd';
    ctx.strokeRect(tx, gy + 4, tw, 40);
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText((visual.formula || '').slice(0, 38), tx + 10, gy + 29);

    ctx.fillStyle = '#475569';
    ctx.font = '500 12px "DM Sans", sans-serif';
    (visual.steps ?? []).slice(0, 2).forEach((st, idx) => {
      ctx.fillText(`• ${st.slice(0, 42)}`, tx, gy + 64 + idx * 18);
    });
  } else if (visual.type === 'image') {
    if (visual.imageDataUrl) {
      const img = await loadCanvasImage(visual.imageDataUrl);
      if (img) {
        const availW = maxW - 24;
        const availH = maxH - 42;
        const scale = Math.min(availW / img.width, availH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, x + (maxW - dw) / 2, y + 32 + (availH - dh) / 2, dw, dh);
      }
    } else {
      const labels = (visual.sceneLabels ?? ['Sunny', 'Windy', 'Rainy', 'Snowy']).slice(0, 4);
      const cardW = (maxW - 36) / Math.max(1, labels.length);
      labels.forEach((lbl, idx) => {
        const cx = x + 12 + idx * (cardW + 4);
        const cy = y + 36;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, cy, cardW, maxH - 50);
        ctx.strokeStyle = preset.primaryColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx, cy, cardW, maxH - 50);

        ctx.beginPath();
        ctx.arc(cx + cardW / 2, cy + 28, 16, 0, Math.PI * 2);
        ctx.fillStyle = idx % 2 === 0 ? '#fef08a' : '#bae6fd';
        ctx.fill();
        ctx.strokeStyle = preset.secondaryColor;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.font = '700 11.5px "DM Sans", sans-serif';
        const lines = wrapTextLines(ctx, lbl, cardW - 10).slice(0, 2);
        lines.forEach((ln, li) => {
          ctx.fillText(ln, cx + cardW / 2, cy + 62 + li * 15);
        });
      });
    }
  }

  ctx.restore();
  return maxH + 12;
}

export async function renderBrandedBackCoverCanvasPng(
  cover: CoverConfig
): Promise<Uint8Array> {
  return renderBrandedBackCoverCanvasEncoded(cover, 'image/png');
}

async function renderBrandedBackCoverCanvasEncoded(
  cover: CoverConfig,
  mimeType: 'image/png' | 'image/jpeg'
): Promise<Uint8Array> {
  const basePreset = getLogoPreset(cover.logoStyleId);
  const palette = resolveCoverColorPalette(cover, basePreset);
  const layoutId = resolveCoverLayoutStyle(cover).id;
  const preset: LogoPreset = {
    ...basePreset,
    primaryColor: palette.primaryColor,
    secondaryColor: palette.secondaryColor,
    goldColor: palette.goldColor,
  };
  const gradeLabel = extractGradeLabelFromCover(cover);
  const bookletNum = cover.bookletNumber ? normalizeBookletNumber(cover.bookletNumber) : '';
  const canvas = document.createElement('canvas');
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d')!;
  const instCode = cover.institutionCode8 || '48291045';
  const showSampleStamp = Boolean(cover.isSampleDemo);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, A4_W, A4_H);

  drawCoverLayoutGeometry(ctx, layoutId, preset, true);

  // Top Header Strip
  const topGrad = ctx.createLinearGradient(56, 56, A4_W - 56, 220);
  topGrad.addColorStop(0, preset.secondaryColor);
  topGrad.addColorStop(1, preset.primaryColor);
  ctx.fillStyle = topGrad;
  ctx.fillRect(56, 56, A4_W - 112, 160);
  ctx.fillStyle = preset.goldColor;
  ctx.fillRect(56, 216, A4_W - 112, 6);

  drawAcademyCrestCanvas(ctx, 148, 136, 48, preset);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${cover.academyName.toUpperCase()} — SON SAYFA & İMZA ONAYI`, 220, 120);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `SINIF: ${gradeLabel.toUpperCase()} · KİTAPÇIK ${cover.bookletCode}${bookletNum ? ` (NO: ${bookletNum})` : ''} · KURUM KODU: ${instCode}`,
    220,
    162
  );

  // Center Ownership & Exam Identity Card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(110, 290, A4_W - 220, 560);
  ctx.strokeStyle = preset.primaryColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(110, 290, A4_W - 220, 560);

  drawAcademyCrestCanvas(ctx, A4_W / 2, 410, 68, preset);

  ctx.textAlign = 'center';
  ctx.fillStyle = preset.secondaryColor;
  ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cover.academyName.toUpperCase(), A4_W / 2, 535);

  ctx.fillStyle = '#334155';
  ctx.font = '700 24px "DM Sans", sans-serif';
  ctx.fillText(`${gradeLabel} · ${cover.examTitle}`, A4_W / 2, 582);

  ctx.fillStyle = preset.primaryColor;
  ctx.font = '800 22px "JetBrains Mono", monospace';
  ctx.fillText(
    `${cover.bookletCode} KİTAPÇIĞI${bookletNum ? ` · KİTAPÇIK NO: ${bookletNum}` : ''}`,
    A4_W / 2,
    626
  );

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 19px "DM Sans", sans-serif';
  const ownershipLines = wrapTextLines(
    ctx,
    `Bu deneme sınavı kitapçığı yalnızca ${cover.academyName} (Kurum Kodu: ${instCode}) adına hazırlanmış ve özelleştirilmiştir. Başka kurum, yayınevi veya üçüncü kişiler tarafından izinsiz çoğaltılamaz, dağıtılamaz.`,
    A4_W - 320
  );
  let oy = 682;
  for (const line of ownershipLines) {
    ctx.fillText(line, A4_W / 2, oy);
    oy += 32;
  }

  // Self-evaluation / Student Note Box
  ctx.fillStyle = palette.softBg;
  ctx.fillRect(110, 890, A4_W - 220, 320);
  ctx.strokeStyle = preset.primaryColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(110, 890, A4_W - 220, 320);
  ctx.textAlign = 'left';
  ctx.fillStyle = preset.secondaryColor;
  ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('SINAV SONRASI KONTROL & OPTİK TESLİM HATIRLATMASI', 148, 940);
  ctx.fillStyle = '#334155';
  ctx.font = '500 19px "DM Sans", sans-serif';
  const checks = [
    `1. Optik formunuzdaki 8 haneli Kurum Kodu (${instCode}) ve Öğrenci Numaranızı kontrol ediniz.`,
    `2. Kitapçık türünü (${cover.bookletCode} Kitapçığı)${bookletNum ? ` ve Kitapçık Numarasını (${bookletNum})` : ''} optik kağıda eksiksiz kodlayınız.`,
    '3. Cevaplarınızı sınav bitiminde gözetmen öğretmene kitapçık ile birlikte teslim ediniz.',
    '4. Sınav sonuç karneniz ve haftalık gelişim analiziniz veli bilgilendirme sistemiyle paylaşılacaktır.',
  ];
  checks.forEach((c, i) => {
    const lines = wrapTextLines(ctx, c, A4_W - 300);
    ctx.fillText(lines[0] || c, 148, 996 + i * 52);
  });

  // Prominent Final Page Signature Box (Kurum Yetkili & Gözetmen / Öğrenci Onay İmzası)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(110, 1245, A4_W - 220, 330);
  ctx.strokeStyle = preset.goldColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(110, 1245, A4_W - 220, 330);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9f1239';
  ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    showSampleStamp ? 'SON SAYFA · İMZA & ONAY · ÖRNEKTİR' : 'RESMİ KURUM SON SAYFASI · İMZA & ONAY',
    144,
    1296
  );
  ctx.fillStyle = '#334155';
  ctx.font = '600 18px "DM Sans", sans-serif';
  ctx.fillText(`${cover.academyName} · Kurum Kodu: ${instCode}`, 144, 1334);
  ctx.fillText(`Sınıf: ${gradeLabel} · Kitapçık: ${cover.bookletCode}${bookletNum ? ` · No: ${bookletNum}` : ''}`, 144, 1368);

  // Gözetmen / Öğrenci İmza Satırı
  ctx.fillStyle = '#475569';
  ctx.font = '600 17px "DM Sans", sans-serif';
  ctx.fillText('Öğrenci Adı Soyadı : ________________________', 144, 1442);
  ctx.fillText('Gözetmen / Onay İmza : ______________________', 144, 1492);
  ctx.fillText(`Tarih : ${cover.examDate || new Date().toLocaleDateString('tr-TR')}`, 144, 1538);

  // 3D Furkan Digital Signature on Right of Signature Box
  ctx.textAlign = 'center';
  ctx.fillStyle = preset.secondaryColor;
  ctx.font = '700 16px "DM Sans", sans-serif';
  ctx.fillText('KURUCU / KOORDİNATÖR 3D DİJİTAL İMZA', A4_W - 310, 1296);
  draw3DFurkanSignature(ctx, A4_W - 430, 1320, preset.secondaryColor, preset.goldColor);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${cover.signatureName} (Onaylı)`, A4_W - 310, 1456);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 18px "DM Sans", sans-serif';
  ctx.fillText(cover.signatureTitle, A4_W - 310, 1490);

  // Bottom Banner
  ctx.fillStyle = preset.secondaryColor;
  ctx.fillRect(56, A4_H - 118, A4_W - 112, 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    showSampleStamp ? `${cover.securityNotice} · ÖRNEKTİR` : cover.securityNotice,
    A4_W / 2,
    A4_H - 84
  );

  drawCanvasWatermark(ctx, A4_W, A4_H, cover.watermark, {
    colorHex: preset.secondaryColor,
    isSampleDemo: showSampleStamp,
    isCoverOrBack: true,
    headerY: 22,
    footerY: A4_H - 21,
  });

  return canvasToEncodedBytes(canvas, mimeType, 0.92);
}

async function renderQuestionsPagesEncoded(
  questions: ExamQuestion[],
  cover: CoverConfig,
  mimeType: 'image/png' | 'image/jpeg',
  imageQuality = 0.9
): Promise<Uint8Array[]> {
  const basePreset = getLogoPreset(cover.logoStyleId);
  const palette = resolveCoverColorPalette(cover, basePreset);
  const layoutId = resolveCoverLayoutStyle(cover).id;
  const preset: LogoPreset = {
    ...basePreset,
    primaryColor: palette.primaryColor,
    secondaryColor: palette.secondaryColor,
    goldColor: palette.goldColor,
  };
  const gradeLabel = extractGradeLabelFromCover(cover);
  const bookletNum = cover.bookletNumber ? normalizeBookletNumber(cover.bookletNumber) : '';
  const pages: Uint8Array[] = [];
  const hasAnyVisual = questions.some((q) => Boolean(q.visual));
  const perPage = hasAnyVisual ? 4 : 6;
  const totalPages = Math.max(1, Math.ceil(questions.length / perPage));

  for (let start = 0; start < questions.length; start += perPage) {
    const pageIndex = pages.length + 1;
    const isLastPage = pageIndex === totalPages;
    const slice = questions.slice(start, start + perPage);
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Graphical Side & Corner Accent Shapes on EVERY PAGE matching layoutId
    ctx.save();
    ctx.fillStyle = preset.primaryColor;
    ctx.globalAlpha = layoutId === 'geometrik-blok' ? 0.95 : 0.85;
    ctx.fillRect(28, 36, layoutId === 'geometrik-blok' ? 14 : 10, A4_H - 72);
    ctx.fillStyle = preset.goldColor;
    ctx.fillRect(28, 36, layoutId === 'geometrik-blok' ? 14 : 10, 140);
    ctx.globalAlpha = layoutId === 'diyagonal-serit' ? 0.1 : 0.06;
    ctx.fillStyle = preset.primaryColor;
    ctx.beginPath();
    ctx.moveTo(A4_W - 260, 0);
    ctx.lineTo(A4_W, 0);
    ctx.lineTo(A4_W, 240);
    ctx.closePath();
    ctx.fill();
    if (layoutId === 'akademik-kose') {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = preset.goldColor;
      ctx.beginPath();
      ctx.moveTo(0, A4_H);
      ctx.lineTo(90, A4_H);
      ctx.lineTo(0, A4_H - 90);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Every-Page Graphical Header Banner: Sınıf + Kitapçık Adı + Kitapçık No + Deneme İsmi
    const hGrad = ctx.createLinearGradient(56, 36, A4_W - 56, 118);
    hGrad.addColorStop(0, preset.secondaryColor);
    hGrad.addColorStop(1, preset.primaryColor);
    ctx.fillStyle = hGrad;
    ctx.fillRect(56, 36, A4_W - 112, 82);
    ctx.fillStyle = preset.goldColor;
    ctx.fillRect(56, 118, A4_W - 112, 5);

    // Drawn Mini Crest Logo on EVERY PAGE
    drawAcademyCrestCanvas(ctx, 102, 77, 25, preset);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 21px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${cover.examTitle}`, 142, 69);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 14.5px "JetBrains Mono", monospace';
    ctx.fillText(
      `SINIF: ${gradeLabel.toUpperCase()} · ${cover.academyName.toUpperCase()} · KURUM KODU: ${cover.institutionCode8 || '48291045'}`,
      142,
      98
    );

    // Right Badge Pill inside Header: Kitapçık A/B/C/D + No + Sayfa
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(A4_W - 355, 46, 282, 62);
    ctx.strokeStyle = preset.goldColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(A4_W - 355, 46, 282, 62);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 19px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `${cover.bookletCode} KİTAPÇIĞI${bookletNum ? ` · NO:${bookletNum}` : ''}`,
      A4_W - 88,
      72
    );
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText(`${gradeLabel} · Sayfa ${pageIndex} / ${totalPages}`, A4_W - 88, 97);

    // Configurable Watermark on EVERY Question Page
    const showSampleStamp = Boolean(cover.isSampleDemo);
    drawCanvasWatermark(ctx, A4_W, A4_H, cover.watermark, {
      colorHex: preset.secondaryColor,
      isSampleDemo: showSampleStamp,
      isCoverOrBack: false,
      headerY: 19,
      footerY: A4_H - 21,
    });

    // Center dividing line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(A4_W / 2, 142);
    ctx.lineTo(A4_W / 2, isLastPage ? A4_H - 210 : A4_H - 110);
    ctx.stroke();

    const perCol = perPage / 2;
    const rowSpacing = perPage === 4 ? (isLastPage ? 670 : 720) : isLastPage ? 445 : 485;

    for (let idx = 0; idx < slice.length; idx++) {
      const q = slice[idx];
      const col = idx < perCol ? 0 : 1;
      const row = idx % perCol;
      const x = col === 0 ? 74 : A4_W / 2 + 34;
      let y = 164 + row * rowSpacing;
      const maxW = A4_W / 2 - 112;

      ctx.textAlign = 'left';
      ctx.fillStyle = preset.secondaryColor;
      ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${q.number}. [${q.subject} · ${q.difficulty}]`, x, y);
      y += 26;

      if (q.visual) {
        const usedH = await drawQuestionVisualOnCanvas(ctx, q.visual, x, y, maxW, 172, preset);
        y += usedH;
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = '500 16.5px "DM Sans", sans-serif';
      const stemLines = wrapTextLines(ctx, q.stem, maxW).slice(0, q.visual ? 4 : 5);
      for (const line of stemLines) {
        ctx.fillText(line, x, y);
        y += 22;
      }
      y += 8;

      Object.entries(q.options).forEach(([optKey, optText]) => {
        const optLines = wrapTextLines(ctx, `${optKey}) ${optText}`, maxW - 12).slice(0, 2);
        ctx.font = '600 15.5px "DM Sans", sans-serif';
        ctx.fillStyle = '#334155';
        for (const ol of optLines) {
          ctx.fillText(ol, x + 8, y);
          y += 21;
        }
        y += 3;
      });
    }

    // Final Question Page Closing Banner + 3D Signature
    if (isLastPage) {
      const endY = A4_H - 205;
      ctx.fillStyle = palette.softBg;
      ctx.fillRect(56, endY, A4_W - 112, 108);
      ctx.strokeStyle = preset.primaryColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(56, endY, A4_W - 112, 108);

      drawAcademyCrestCanvas(ctx, 112, endY + 54, 28, preset);

      ctx.textAlign = 'left';
      ctx.fillStyle = preset.secondaryColor;
      ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        showSampleStamp
          ? 'SORULARIN SONU — SONRAKİ SAYFA İMZA VE ONAY SAYFASIDIR · ÖRNEKTİR'
          : 'SORULARIN SONU — SONRAKİ SAYFA KURUMSAL İMZA VE ONAY SAYFASIDIR',
        162,
        endY + 42
      );
      ctx.fillStyle = '#334155';
      ctx.font = '600 17px "DM Sans", sans-serif';
      ctx.fillText(
        `${cover.academyName} · ${gradeLabel} · ${cover.bookletCode} Kitapçığı${bookletNum ? ` (No: ${bookletNum})` : ''}`,
        162,
        endY + 78
      );

      draw3DFurkanSignature(ctx, A4_W - 310, endY + 10, preset.secondaryColor, preset.goldColor);
    }

    // Every-Page Security Footer
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, A4_H - 86);
    ctx.lineTo(A4_W - 56, A4_H - 86);
    ctx.stroke();

    ctx.fillStyle = preset.secondaryColor;
    ctx.font = '800 15.5px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      showSampleStamp
        ? `${cover.academyName} · ${gradeLabel} · ${cover.bookletCode} Kitapçığı${bookletNum ? ` #${bookletNum}` : ''} · ÖRNEKTİR · Sayfa ${pageIndex}/${totalPages}`
        : `${cover.academyName} · ${gradeLabel} · ${cover.bookletCode} Kitapçığı${bookletNum ? ` #${bookletNum}` : ''} · ${cover.signatureName} 3D İmzalı · Sayfa ${pageIndex}/${totalPages}`,
      A4_W / 2,
      A4_H - 52
    );

    pages.push(await canvasToEncodedBytes(canvas, mimeType, imageQuality));
    await yieldToMainThread();
  }

  return pages;
}

export async function generateBookletPdf(
  cover: CoverConfig,
  questions: ExamQuestion[],
  uploadedPdfBytes?: Uint8Array | null,
  stripOptions: PdfUploadStripOptions = {
    stripFrontCover: true,
    stripBackCover: true,
    appendBrandedBackPage: true,
  },
  imageQuality = 0.9
): Promise<Uint8Array> {
  const coverJpg = await renderCoverCanvasEncoded(cover, 'image/jpeg');
  const shouldIncludeSignatureLastPage =
    uploadedPdfBytes && uploadedPdfBytes.byteLength > 0
      ? stripOptions.appendBrandedBackPage
      : true;
  const backCoverJpg = shouldIncludeSignatureLastPage
    ? await renderBrandedBackCoverCanvasEncoded(cover, 'image/jpeg')
    : null;
  const gradeLabel = extractGradeLabelFromCover(cover);
  const bookletNum = cover.bookletNumber ? normalizeBookletNumber(cover.bookletNumber) : '';

  if (uploadedPdfBytes && uploadedPdfBytes.byteLength > 0) {
    const loadedPdf = await PDFDocument.load(uploadedPdfBytes, {
      ignoreEncryption: true,
    });
    const outPdf = await PDFDocument.create();
    const helvetica = await outPdf.embedFont(StandardFonts.HelveticaBold);

    const coverImg = await outPdf.embedJpg(coverJpg);
    const coverPage = outPdf.addPage([595.28, 841.89]);
    coverPage.drawImage(coverImg, { x: 0, y: 0, width: 595.28, height: 841.89 });

    const totalRaw = loadedPdf.getPageCount();
    const keptIndices = computeKeptUploadedPdfIndices(totalRaw, stripOptions);
    const copiedPages = await outPdf.copyPages(loadedPdf, keptIndices);
    const totalCopied = copiedPages.length;
    const showSampleStamp = Boolean(cover.isSampleDemo);
    const watermarkCfg = resolvePdfWatermarkConfig(cover.watermark);
    const basePreset = getLogoPreset(cover.logoStyleId);
    const palette = resolveCoverColorPalette(cover, basePreset);

    let watermarkOverlayImg: Awaited<ReturnType<typeof outPdf.embedPng>> | null = null;
    if (watermarkCfg.enabled && typeof document !== 'undefined') {
      try {
        const wmCanvas = document.createElement('canvas');
        wmCanvas.width = A4_W;
        wmCanvas.height = A4_H;
        const wmCtx = wmCanvas.getContext('2d');
        if (wmCtx) {
          wmCtx.clearRect(0, 0, A4_W, A4_H);
          drawCanvasWatermark(wmCtx, A4_W, A4_H, watermarkCfg, {
            colorHex: palette.secondaryColor,
            isSampleDemo: showSampleStamp,
            isCoverOrBack: false,
            headerY: 74,
            footerY: A4_H - 64,
          });
          const wmPngBytes = await canvasToEncodedBytes(wmCanvas, 'image/png');
          watermarkOverlayImg = await outPdf.embedPng(wmPngBytes);
        }
      } catch {
        watermarkOverlayImg = null;
      }
    }

    copiedPages.forEach((p, idx) => {
      const { width, height } = p.getSize();
      const isLast = idx === totalCopied - 1;
      const topMaskH = watermarkCfg.stripExistingMargins ? 54 : 30;
      const bottomMaskH = watermarkCfg.stripExistingMargins ? 46 : 24;
      // Mask top & bottom margins lightly so external institution/publisher headers don't clash
      p.drawRectangle({
        x: 0,
        y: height - topMaskH,
        width,
        height: topMaskH,
        color: watermarkCfg.stripExistingMargins ? rgb(1, 1, 1) : rgb(0.96, 0.98, 1),
      });
      p.drawRectangle({
        x: 0,
        y: 0,
        width,
        height: bottomMaskH,
        color: rgb(1, 1, 1),
      });
      // Top Graphical Header Strip + Bottom Security Notice on every page
      p.drawText(
        toAsciiSafe(
          `${cover.examTitle} | ${gradeLabel} | ${cover.bookletCode} KITAPCIGI${bookletNum ? ` #${bookletNum}` : ''} | ${cover.academyName.toUpperCase()}${showSampleStamp ? ' | ORNEKTIR' : ''}`
        ),
        {
          x: 28,
          y: height - 20,
          size: 8.2,
          font: helvetica,
          color: rgb(0.08, 0.2, 0.45),
        }
      );
      p.drawText(
        toAsciiSafe(
          isLast
            ? `${showSampleStamp ? 'ICERIK SONU - ORNEKTIR | ' : 'ICERIK SONU | '}${cover.signatureName} 3D Imzali | ${cover.academyName} | Sayfa ${idx + 1}/${totalCopied}`
            : `${cover.academyName} | ${cover.signatureName} Imzali | COGALTILAMAZ | Sayfa ${idx + 1}/${totalCopied}`
        ),
        {
          x: 28,
          y: 9,
          size: 8.2,
          font: helvetica,
          color: rgb(0.62, 0.08, 0.22),
        }
      );

      if (watermarkCfg.enabled) {
        if (watermarkOverlayImg) {
          p.drawImage(watermarkOverlayImg, { x: 0, y: 0, width, height });
        } else {
          const wmText = toAsciiSafe(
            buildWatermarkDisplayText(watermarkCfg, { isSampleDemo: showSampleStamp })
          );
          const { drawBackground, drawHeaderFooter } = computeWatermarkPlacements(
            watermarkCfg.placement
          );
          const fontScale = watermarkCfg.fontScale ?? 1;
          const pdfAngle = -(watermarkCfg.angleDeg ?? -32);
          if (drawBackground) {
            const diagSize = Math.round(30 * fontScale);
            const tw = helvetica.widthOfTextAtSize(wmText, diagSize);
            const pos = computeCenteredRotatedPosition({
              centerX: width / 2,
              centerY: height / 2,
              textWidth: tw,
              textHeight: diagSize * 0.72,
              angleDeg: pdfAngle,
            });
            p.drawText(wmText, {
              x: pos.x,
              y: pos.y,
              size: diagSize,
              font: helvetica,
              color: rgb(0.06, 0.15, 0.28),
              opacity: watermarkCfg.opacity,
              rotate: degrees(pdfAngle),
            });
          }
          if (drawHeaderFooter) {
            const hfSize = Math.max(7, Math.round(8.5 * fontScale * 10) / 10);
            const tw = helvetica.widthOfTextAtSize(wmText, hfSize);
            const cx = Math.max(24, (width - tw) / 2);
            p.drawText(wmText, {
              x: cx,
              y: height - 42,
              size: hfSize,
              font: helvetica,
              color: rgb(0.06, 0.15, 0.28),
              opacity: watermarkCfg.opacity,
            });
            p.drawText(wmText, {
              x: cx,
              y: 30,
              size: hfSize,
              font: helvetica,
              color: rgb(0.06, 0.15, 0.28),
              opacity: watermarkCfg.opacity,
            });
          }
        }
      }

      if (width > 120) {
        outPdf.addPage(p);
      }
    });

    if (backCoverJpg) {
      const backImg = await outPdf.embedJpg(backCoverJpg);
      const backPage = outPdf.addPage([595.28, 841.89]);
      backPage.drawImage(backImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }

    return outPdf.save();
  }

  const pdfDoc = await PDFDocument.create();
  const coverImg = await pdfDoc.embedJpg(coverJpg);
  const coverPage = pdfDoc.addPage([595.28, 841.89]);
  coverPage.drawImage(coverImg, { x: 0, y: 0, width: 595.28, height: 841.89 });

  const questionPageJpgs = await renderQuestionsPagesEncoded(
    questions,
    cover,
    'image/jpeg',
    imageQuality
  );
  for (const jpgBytes of questionPageJpgs) {
    const img = await pdfDoc.embedJpg(jpgBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  if (backCoverJpg) {
    const backImg = await pdfDoc.embedJpg(backCoverJpg);
    const backPage = pdfDoc.addPage([595.28, 841.89]);
    backPage.drawImage(backImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return pdfDoc.save();
}

export async function generateAllBookletsZip(params: {
  cover: CoverConfig;
  baseQuestions: ExamQuestion[];
  orderSeed?: number;
  uploadedPdfBytes?: Uint8Array | null;
  pdfStripOptions?: PdfUploadStripOptions;
}): Promise<Blob> {
  const zip = new JSZip();
  const orderSeed = params.orderSeed ?? 0;

  for (const code of BOOKLET_CODES) {
    const variantQuestions = buildBookletVariantQuestions(params.baseQuestions, code, orderSeed);
    const variantCover: CoverConfig = {
      ...params.cover,
      bookletCode: code,
      questionCount: variantQuestions.length || params.cover.questionCount,
    };
    const pdfBytes = await generateBookletPdf(
      variantCover,
      variantQuestions,
      params.uploadedPdfBytes,
      params.pdfStripOptions,
      0.84
    );
    const pdfName = buildBookletPdfFilename(variantCover, code);
    zip.file(pdfName, pdfBytes);
    await yieldToMainThread();
  }

  zip.file(
    '00_ABCD_Cevap_Anahtari_Karsilastirma.csv',
    buildAllBookletsAnswerKeyCsv(params.baseQuestions, orderSeed)
  );

  return zip.generateAsync({ type: 'blob' });
}

export interface OpticalSheetRenderOptions {
  cover: CoverConfig;
  gradeProfile?: GradeProfile;
  studentName?: string;
  studentNumber8?: string;
  institutionCode8?: string;
  classroom?: string;
  totalQuestions?: number;
  optionCount?: 4 | 5;
}

/**
 * Draws an authentic Turkish OSYM/MEB magenta/pink OMR optical form matching the reference photos:
 * - Left black timing track marks
 * - QR code, 8-digit Kurum Kodu bubble grid, 8-digit Ogrenci No bubble grid, Adi Soyadi A-Z grid
 * - Subject-grouped answer columns (Sozel/Sayisal or TYT/AYT subjects)
 */
export function drawOpticalFormCanvas(
  canvas: HTMLCanvasElement,
  opts: OpticalSheetRenderOptions
) {
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d')!;

  const PINK = '#be185d';
  const PINK_LIGHT = '#fbcfe8';
  const PINK_HEADER = '#db2777';
  const instName = opts.cover.academyName || 'Doğruluk Akademi';
  const instCode = (opts.institutionCode8 || opts.cover.institutionCode8 || '48291045').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  const stuName = (opts.studentName || 'Alihan Sarı').toLocaleUpperCase('tr-TR');
  const stuNum = (opts.studentNumber8 || '48192034').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  const bookletNoDigits = normalizeBookletNumber(opts.cover.bookletNumber, 1);
  const optionCount = opts.optionCount ?? opts.gradeProfile?.optionCount ?? 5;
  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  // Clean White Paper Base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);

  // Left-Edge Black Timing Track Rectangles (Authentic OMR scanner sync marks)
  ctx.fillStyle = '#111827';
  for (let ty = 64; ty < A4_H - 54; ty += 34) {
    ctx.fillRect(16, ty, 20, 12);
  }

  // Outer Magenta Frame
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 34, A4_W - 84, A4_H - 68);

  // Top Header Title Bar
  ctx.fillStyle = PINK_HEADER;
  ctx.fillRect(52, 34, A4_W - 84, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${instName.toUpperCase()} — OPTİK CEVAP KAĞIDI`, 72, 60);
  ctx.textAlign = 'right';
  ctx.font = '700 15px "DM Sans", sans-serif';
  ctx.fillText(
    `${opts.gradeProfile?.shortLabel || '5. Sınıf'} · KİTAPÇIK ${opts.cover.bookletCode} · NO:${bookletNoDigits} · KURUM: ${instCode}`,
    A4_W - 48,
    60
  );

  // 1. Top-Left QR Code Block
  const qrX = 72;
  const qrY = 104;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX, qrY, 108, 108);
  const qrPattern = [
    '111010111',
    '101101101',
    '111010111',
    '001101001',
    '110110110',
    '010011010',
    '111010101',
    '101110011',
    '111001111',
  ];
  ctx.fillStyle = '#111827';
  qrPattern.forEach((rowStr, rIdx) => {
    for (let cIdx = 0; cIdx < rowStr.length; cIdx++) {
      if (rowStr[cIdx] === '1') {
        ctx.fillRect(qrX + 9 + cIdx * 10, qrY + 9 + rIdx * 10, 9, 9);
      }
    }
  });

  // 2. Student Handwritten Info Box (Next to QR)
  const infoX = 196;
  const infoY = 104;
  const infoW = 356;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2;
  ctx.strokeRect(infoX, infoY, infoW, 134);
  ctx.fillStyle = '#831843';
  ctx.textAlign = 'left';
  drawFittedSingleLineText(
    ctx,
    `Adı Soyadı : ${stuName}`,
    infoX + 12,
    infoY + 24,
    infoW - 24,
    '700',
    '"DM Sans", sans-serif',
    14.5,
    10
  );
  ctx.font = '700 14.5px "DM Sans", sans-serif';
  ctx.fillText(`Öğrenci No : ${stuNum}`, infoX + 12, infoY + 51);
  const fallbackClass = opts.gradeProfile ? defaultClassroomForGrade(opts.gradeProfile.id) : '5-A';
  drawFittedSingleLineText(
    ctx,
    `Sınıf/Şube : ${opts.classroom || fallbackClass} · Kitapçık: ${opts.cover.bookletCode} (${bookletNoDigits})`,
    infoX + 12,
    infoY + 78,
    infoW - 24,
    '700',
    '"DM Sans", sans-serif',
    14.5,
    10.5
  );
  drawFittedSingleLineText(
    ctx,
    `Deneme     : ${opts.cover.examTitle || instName}`,
    infoX + 12,
    infoY + 106,
    infoW - 24,
    '700',
    '"DM Sans", sans-serif',
    14.5,
    10.5
  );

  // Correct Coding Example + Kitapçık Türü Box
  ctx.strokeRect(infoX, 250, 174, 84);
  ctx.fillStyle = PINK_HEADER;
  ctx.fillRect(infoX, 250, 174, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DOĞRU KODLAMA', infoX + 87, 262);
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(infoX + 42, 302, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#831843';
  ctx.font = '600 12px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Tam Doldurun', infoX + 62, 302);

  // Kitapçık Türü (A B C D) - Otomatik Kodlama
  ctx.strokeStyle = PINK;
  ctx.strokeRect(infoX + 186, 250, 170, 84);
  ctx.fillStyle = PINK_HEADER;
  ctx.fillRect(infoX + 186, 250, 170, 24);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '700 12px "DM Sans", sans-serif';
  ctx.fillText('KİTAPÇIK TÜRÜ (OTO)', infoX + 271, 262);
  ['A', 'B', 'C', 'D'].forEach((bCode, bi) => {
    const bx = infoX + 210 + bi * 38;
    const by = 304;
    const isSel = opts.cover.bookletCode === bCode;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    if (isSel) {
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.stroke();
      ctx.fillStyle = PINK;
    }
    ctx.font = '700 12px "DM Sans", sans-serif';
    ctx.fillText(bCode, bx, by + 1);
  });

  // Helper: Draw N-Column Numeric Bubble Grid (0-9)
  const drawNumericGrid = (
    gx: number,
    gy: number,
    title: string,
    digits: string,
    cols: number
  ) => {
    const colW = 20;
    const w = cols * colW + 12;
    const h = 320;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, w, h);
    ctx.fillStyle = PINK_HEADER;
    ctx.fillRect(gx, gy, w, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, gx + w / 2, gy + 13);

    // Top digit preview boxes
    for (let c = 0; c < cols; c++) {
      const cx = gx + 6 + c * colW + colW / 2;
      ctx.strokeStyle = PINK_LIGHT;
      ctx.strokeRect(gx + 6 + c * colW, gy + 30, colW - 2, 22);
      ctx.fillStyle = '#111827';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText(digits[c] ?? '0', cx, gy + 41);

      for (let d = 0; d <= 9; d++) {
        const cy = gy + 68 + d * 25;
        const filled = digits[c] === String(d);
        ctx.beginPath();
        ctx.arc(cx, cy, 8.2, 0, Math.PI * 2);
        if (filled) {
          ctx.fillStyle = '#111827';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.strokeStyle = PINK;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.fillStyle = PINK;
        }
        ctx.font = '700 9.5px "DM Sans", sans-serif';
        ctx.fillText(String(d), cx, cy + 0.5);
      }
    }
  };

  // 3. ÖĞRENCİ NO (8 Hane) + KURUM KODU (8 Hane) + KİTAPÇIK NO (6 Hane) Bubble Grids
  drawNumericGrid(72, 348, 'ÖĞRENCİ NO (8)', stuNum, 8);
  drawNumericGrid(252, 348, 'KURUM KODU (8)', instCode, 8);
  drawNumericGrid(432, 348, 'KİTAPÇIK NO (6)', bookletNoDigits, 6);

  // 4. Right Top: ADI SOYADI Alphabet Bubble Grid (24 columns so long names + surnames fit)
  const nameX = 574;
  const nameY = 104;
  const nameW = A4_W - 48 - nameX;
  const nameH = 564;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2;
  ctx.strokeRect(nameX, nameY, nameW, nameH);
  ctx.fillStyle = PINK_HEADER;
  ctx.fillRect(nameX, nameY, nameW, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ADI SOYADI (Ad ve soyad arasında bir boşluk bırakınız)', nameX + nameW / 2, nameY + 14);

  const alpha = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
  const colsCount = 24;
  const cellW = (nameW - 16) / colsCount;
  const cleanName = stuName.slice(0, colsCount);

  for (let c = 0; c < colsCount; c++) {
    const ch = cleanName[c] || '';
    const cx = nameX + 8 + c * cellW + cellW / 2;
    ctx.strokeStyle = PINK_LIGHT;
    ctx.strokeRect(nameX + 8 + c * cellW, nameY + 32, cellW - 2, 22);
    ctx.fillStyle = '#111827';
    ctx.font = '700 11.5px "DM Sans", sans-serif';
    ctx.fillText(ch, cx, nameY + 43);

    alpha.forEach((letter, li) => {
      const ly = nameY + 67 + li * 17;
      const isMatch = ch === letter;
      ctx.beginPath();
      ctx.arc(cx, ly, 6.2, 0, Math.PI * 2);
      if (isMatch) {
        ctx.fillStyle = '#111827';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.strokeStyle = PINK;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = PINK;
      }
      ctx.font = '700 7.8px "DM Sans", sans-serif';
      ctx.fillText(letter, cx, ly + 0.5);
    });
  }

  // 5. Bottom Answer Section: Subject-Grouped Columns
  const ansTop = 690;
  const ansBottom = A4_H - 96;
  const totalQ = opts.totalQuestions ?? opts.gradeProfile?.subjects.reduce((s, x) => s + x.questionCount, 0) ?? 120;
  const subjects = opts.gradeProfile?.subjects ?? [
    { id: 'turkce', name: 'TÜRKÇE', questionCount: 40, topics: [] },
    { id: 'sosyal', name: 'SOSYAL BİL.', questionCount: 20, topics: [] },
    { id: 'mat', name: 'MATEMATİK', questionCount: 40, topics: [] },
    { id: 'fen', name: 'FEN BİL.', questionCount: 20, topics: [] },
  ];

  // Build up to 4 visual columns cleanly distributing up to 120 questions (30-40 rows per column)
  const numCols = 4;
  const colGap = 14;
  const gridLeft = 72;
  const gridTotalW = A4_W - 48 - gridLeft;
  const colWidth = (gridTotalW - colGap * (numCols - 1)) / numCols;
  const rowsPerCol = Math.ceil(totalQ / numCols);
  const rowStep = Math.min(24, Math.floor((ansBottom - ansTop - 44) / Math.max(1, rowsPerCol)));

  let qCursor = 1;
  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    const cx = gridLeft + colIdx * (colWidth + colGap);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, ansTop, colWidth, ansBottom - ansTop);

    ctx.fillStyle = PINK_HEADER;
    ctx.fillRect(cx, ansTop, colWidth, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const subjLabel = subjects[colIdx]?.name.toUpperCase() || `BÖLÜM ${colIdx + 1}`;
    ctx.fillText(subjLabel.slice(0, 18), cx + colWidth / 2, ansTop + 15);

    for (let r = 0; r < rowsPerCol && qCursor <= totalQ; r++) {
      const ry = ansTop + 46 + r * rowStep;
      // Alternating subtle zebra row tint
      if (r % 2 === 1) {
        ctx.fillStyle = 'rgba(251, 207, 232, 0.22)';
        ctx.fillRect(cx + 2, ry - rowStep / 2 + 1, colWidth - 4, rowStep - 1);
      }

      ctx.fillStyle = '#831843';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(qCursor).padStart(2, '0'), cx + 34, ry);

      letters.forEach((opt, oi) => {
        const bx = cx + 58 + oi * (optionCount === 4 ? 42 : 34);
        ctx.strokeStyle = PINK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, ry, 8.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = PINK;
        ctx.font = '700 10px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(opt, bx, ry + 0.5);
      });
      qCursor++;
    }
  }

  // Bottom Optical Form Footer
  ctx.fillStyle = '#831843';
  ctx.font = '800 15px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    opts.cover.isSampleDemo
      ? `${instName.toUpperCase()} · KURUM KODU: ${instCode} · ${opts.cover.signatureName.toUpperCase()} İMZALI · ÇOĞALTILAMAZ · ÖRNEKTİR`
      : `${instName.toUpperCase()} · KURUM KODU: ${instCode} · ${opts.cover.signatureName.toUpperCase()} İMZALI · ÇOĞALTILAMAZ`,
    A4_W / 2,
    A4_H - 54
  );
}

export async function generateOpticalSheetPdf(
  cover: CoverConfig,
  totalQuestions = 120,
  optionCount: 4 | 5 = 5,
  extra?: Partial<OpticalSheetRenderOptions>
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  drawOpticalFormCanvas(canvas, {
    cover,
    totalQuestions,
    optionCount,
    ...extra,
  });

  const jpgBytes = await canvasToEncodedBytes(canvas, 'image/jpeg', 0.92);
  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(jpgBytes);
  const page = pdfDoc.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return pdfDoc.save();
}

export interface MultiOpticalEntry {
  bookletCode: BookletCode;
  bookletNumber?: string;
  studentName?: string;
  studentNumber8?: string;
  classroom?: string;
}

export async function generateMultiBookletOpticalPdf(params: {
  cover: CoverConfig;
  totalQuestions?: number;
  optionCount?: 4 | 5;
  gradeProfile?: GradeProfile;
  institutionCode8?: string;
  studentName?: string;
  studentNumber8?: string;
  classroom?: string;
  entries?: MultiOpticalEntry[];
}): Promise<Uint8Array> {
  const entries: MultiOpticalEntry[] =
    params.entries && params.entries.length > 0
      ? params.entries
      : BOOKLET_CODES.map((code, idx) => ({
          bookletCode: code,
          bookletNumber: params.cover.bookletNumber
            ? normalizeBookletNumber(params.cover.bookletNumber, idx + 1)
            : normalizeBookletNumber(undefined, idx + 1),
          studentName: params.studentName,
          studentNumber8: params.studentNumber8,
          classroom: params.classroom,
        }));

  const pdfDoc = await PDFDocument.create();
  const canvas = document.createElement('canvas');
  const totalQ = Math.max(params.totalQuestions ?? 120, 20);
  const optCount = params.optionCount ?? params.gradeProfile?.optionCount ?? 5;

  for (const entry of entries) {
    drawOpticalFormCanvas(canvas, {
      cover: {
        ...params.cover,
        bookletCode: entry.bookletCode,
        bookletNumber: entry.bookletNumber ?? params.cover.bookletNumber,
      },
      gradeProfile: params.gradeProfile,
      studentName: entry.studentName ?? params.studentName ?? '................................',
      studentNumber8: entry.studentNumber8 ?? params.studentNumber8 ?? '00000000',
      institutionCode8: params.institutionCode8 || params.cover.institutionCode8,
      classroom: entry.classroom ?? params.classroom,
      totalQuestions: totalQ,
      optionCount: optCount,
    });
    const jpgBytes = await canvasToEncodedBytes(canvas, 'image/jpeg', 0.9);
    const img = await pdfDoc.embedJpg(jpgBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    await yieldToMainThread();
  }

  return pdfDoc.save();
}

export async function generateAllOpticalFormsZip(params: {
  cover: CoverConfig;
  totalQuestions?: number;
  optionCount?: 4 | 5;
  gradeProfile?: GradeProfile;
  institutionCode8?: string;
  studentName?: string;
  studentNumber8?: string;
  classroom?: string;
  entries?: MultiOpticalEntry[];
}): Promise<Blob> {
  const zip = new JSZip();
  const totalQ = Math.max(params.totalQuestions ?? 120, 20);
  const optCount = params.optionCount ?? params.gradeProfile?.optionCount ?? 5;

  for (const code of BOOKLET_CODES) {
    const variantCover: CoverConfig = {
      ...params.cover,
      bookletCode: code,
    };
    const pdfBytes = await generateOpticalSheetPdf(variantCover, totalQ, optCount, {
      gradeProfile: params.gradeProfile,
      studentName: params.studentName,
      studentNumber8: params.studentNumber8,
      institutionCode8: params.institutionCode8 || params.cover.institutionCode8,
      classroom: params.classroom,
    });
    const fileName = buildOpticalPdfFilename(
      variantCover,
      code,
      variantCover.bookletNumber,
      params.studentNumber8
    );
    zip.file(fileName, pdfBytes);
    await yieldToMainThread();
  }

  const combinedPdf = await generateMultiBookletOpticalPdf(params);
  zip.file('00_Tum_ABCD_Optik_Formlari.pdf', combinedPdf);

  return zip.generateAsync({ type: 'blob' });
}

export function buildStandaloneHtmlReport(
  analysis: ExamAnalysisResult,
  cover: CoverConfig
): string {
  const subjectRows = analysis.subjectMetrics
    .map(
      (s) => `
      <tr>
        <td>${s.subject}</td>
        <td>${s.total}</td>
        <td>${s.correct}</td>
        <td>${s.wrong}</td>
        <td>${s.blank}</td>
        <td><strong>${s.net.toFixed(2)}</strong></td>
        <td>${s.classAvgNet.toFixed(2)}</td>
        <td>${s.academyAvgNet.toFixed(2)}</td>
        <td>%${s.accuracyPct}</td>
      </tr>`
    )
    .join('');

  const topicRows = analysis.topicGaps
    .map(
      (t) => `
      <tr>
        <td>${t.subject}</td>
        <td>${t.topic} (${t.gainCode})</td>
        <td>${t.total}</td>
        <td>${t.correct}</td>
        <td>${t.wrong}</td>
        <td>${t.blank}</td>
        <td>%${t.masteryPct}</td>
        <td><strong>${t.status}</strong></td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>${cover.academyName} — 5 Çeşit Analiz Karnesi (${analysis.studentName})</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px; }
  .sheet { max-width: 1020px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 32px; }
  h1, h2, h3 { color: #0f2747; margin-top: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0 28px; }
  .kpi { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; }
  .kpi small { color: #475569; display: block; margin-bottom: 4px; }
  .kpi strong { font-size: 24px; color: #0f2747; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
  th { background: #0f2747; color: #fff; }
  .footer { border-top: 2px solid #0f2747; padding-top: 16px; display: flex; justify-content: space-between; font-size: 13px; color: #475569; }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${cover.academyName} — Bütüncül Sınav Analiz Karnesi</h1>
    <p><strong>Kurum Kodu:</strong> ${cover.institutionCode8 || '48291045'} · <strong>Öğrenci:</strong> ${analysis.studentName} (${analysis.studentNumber}) · <strong>Sınıf:</strong> ${analysis.classroom} · <strong>Sınav:</strong> ${analysis.examTitle}</p>
    <div class="kpis">
      <div class="kpi"><small>Toplam Net</small><strong>${analysis.totalNet} / ${analysis.totalQuestions}</strong></div>
      <div class="kpi"><small>Tahmini Puan</small><strong>${analysis.estimatedScore}</strong></div>
      <div class="kpi"><small>Kurum Sıralaması</small><strong>${analysis.academyRank} / ${analysis.academySize}</strong></div>
      <div class="kpi"><small>Yüzdelik Dilim</small><strong>%${(100 - analysis.percentile).toFixed(1)}</strong></div>
    </div>

    <h2>1 & 2. Ders ve Sınıf Karşılaştırmalı Başarı Karnesi</h2>
    <table>
      <thead><tr><th>Ders</th><th>Soru</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th><th>Sınıf Ort.</th><th>Akademi Ort.</th><th>Başarı</th></tr></thead>
      <tbody>${subjectRows}</tbody>
    </table>

    <h2>3. Konu Bazlı Kazanım Matrisi (Tüm Konular)</h2>
    <table>
      <thead><tr><th>Ders</th><th>Konu & Kazanım</th><th>Soru</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Başarı</th><th>Durum</th></tr></thead>
      <tbody>${topicRows}</tbody>
    </table>

    <h2>4. AI Eğitim Koçu & Strateji Özeti</h2>
    <p>${analysis.aiCoachSummary ?? `Doğru: ${analysis.totalCorrect}, Yanlış: ${analysis.totalWrong}, Boş: ${analysis.totalBlank}. Son denemedeki net artışı devam ettiğinde tahmini puan projeksiyonu: ${analysis.projectedScore}.`}</p>

    <div class="footer">
      <span><strong>Onay:</strong> ${cover.signatureName} (${cover.signatureTitle})</span>
      <span>${cover.isSampleDemo ? `${cover.securityNotice} · ÖRNEKTİR` : cover.securityNotice}</span>
    </div>
  </div>
</body>
</html>`;
}

export function buildStandalonePrototypeHtml(
  analysis: ExamAnalysisResult,
  cover: CoverConfig,
  questions: ExamQuestion[]
): string {
  const themesJson = JSON.stringify(ACADEMY_THEMES);
  const analysisJson = JSON.stringify(analysis);
  const questionsJson = JSON.stringify(questions.slice(0, 120));

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cover.academyName} — Taşınabilir Akademi Sistemi</title>
  <style>
    :root { --bg: #f4f7fb; --card: #ffffff; --side: #0f2747; --text: #0f172a; --muted: #475569; --accent: #1d4ed8; --border: #dce4f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .layout { display: flex; min-height: 100vh; }
    aside { width: 250px; background: var(--side); color: #fff; padding: 24px; flex-shrink: 0; }
    main { flex: 1; padding: 28px; }
    .btn3d { background: var(--accent); color: #fff; border: 0; border-bottom: 4px solid rgba(0,0,0,0.3); padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; transition: transform .12s; }
    .btn3d:active { transform: translateY(2px); border-bottom-width: 2px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid var(--border); padding: 10px; text-align: left; }
    select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <h2 style="margin:0 0 6px">${cover.academyName}</h2>
      <p style="margin:0 0 24px;opacity:.75;font-size:13px">Kurum: ${cover.institutionCode8 || '48291045'} · ${cover.signatureName} İmzalı</p>
      <label style="font-size:12px;display:block;margin-bottom:6px">10 Akademi Teması</label>
      <select id="themeSelect" style="width:100%;margin-bottom:20px"></select>
      <div style="font-size:12px;opacity:.85;line-height:1.5">
        <strong>Sınav:</strong> ${cover.examTitle}<br/>
        <strong>Soru Sayısı:</strong> ${questions.length}<br/>
        <strong>Süre:</strong> ${cover.durationMinutes} dk
      </div>
    </aside>
    <main>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h1 style="margin:0">${analysis.examTitle}</h1>
        <button class="btn3d" onclick="window.print()">Karneleri Yazdır</button>
      </div>
      <div class="grid4">
        <div class="card"><small>Öğrenci (${analysis.studentNumber})</small><div style="font-size:20px;font-weight:700">${analysis.studentName}</div></div>
        <div class="card"><small>Toplam Net</small><div style="font-size:24px;font-weight:800">${analysis.totalNet}</div></div>
        <div class="card"><small>Tahmini Puan</small><div style="font-size:24px;font-weight:800">${analysis.estimatedScore}</div></div>
        <div class="card"><small>Akademi Sırası</small><div style="font-size:24px;font-weight:800">${analysis.academyRank} / ${analysis.academySize}</div></div>
      </div>
      <div class="card">
        <h3>Ders Bazlı Net ve Karşılaştırma</h3>
        <table id="subjTable"></table>
      </div>
      <div class="card">
        <h3>Konu Bazlı Kazanım Matrisi</h3>
        <table id="topicTable"></table>
      </div>
      <div class="card">
        <h3>Soru & Cevap Anahtarı Önizleme (${questions.length} Soru)</h3>
        <div id="qPreview" style="max-height:320px;overflow:auto;font-size:13px;line-height:1.6"></div>
      </div>
    </main>
  </div>
  <script>
    const themes = ${themesJson};
    const analysis = ${analysisJson};
    const questions = ${questionsJson};
    const sel = document.getElementById('themeSelect');
    themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => {
      const th = themes.find(x => x.id === e.target.value);
      if (!th) return;
      document.documentElement.style.setProperty('--bg', th.vars['--bg-canvas']);
      document.documentElement.style.setProperty('--card', th.vars['--bg-surface']);
      document.documentElement.style.setProperty('--side', th.vars['--bg-sidebar']);
      document.documentElement.style.setProperty('--text', th.vars['--text-primary']);
      document.documentElement.style.setProperty('--accent', th.vars['--accent-primary']);
      document.documentElement.style.setProperty('--border', th.vars['--border-subtle']);
    });
    const tbl = document.getElementById('subjTable');
    tbl.innerHTML = '<tr><th>Ders</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th><th>Sınıf Ort.</th></tr>' +
      analysis.subjectMetrics.map(s => '<tr><td>'+s.subject+'</td><td>'+s.correct+'</td><td>'+s.wrong+'</td><td>'+s.blank+'</td><td><strong>'+s.net+'</strong></td><td>'+s.classAvgNet+'</td></tr>').join('');
    const tTbl = document.getElementById('topicTable');
    tTbl.innerHTML = '<tr><th>Ders</th><th>Konu</th><th>Kazanım</th><th>Doğru/Soru</th><th>Başarı</th><th>Durum</th></tr>' +
      analysis.topicGaps.map(t => '<tr><td>'+t.subject+'</td><td>'+t.topic+'</td><td>'+t.gainCode+'</td><td>'+t.correct+'/'+t.total+'</td><td><strong>%'+t.masteryPct+'</strong></td><td>'+t.status+'</td></tr>').join('');
    document.getElementById('qPreview').innerHTML = questions.map(q => '<div><strong>'+q.number+'. ['+q.subject+']</strong> '+q.stem+' <em>(Cevap: '+q.correctOption+')</em></div>').join('');
  </script>
</body>
</html>`;
}

async function renderPosterSummaryPng(
  cover: CoverConfig,
  analysis: ExamAnalysisResult
): Promise<Uint8Array> {
  const preset = getLogoPreset(cover.logoStyleId);
  const W = 1200;
  const H = 1600;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, preset.secondaryColor);
  bgGrad.addColorStop(1, preset.primaryColor);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  drawAcademyCrestCanvas(ctx, 144, 146, 52, preset);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cover.academyName.toUpperCase(), 220, 130);
  ctx.fillStyle = '#fde68a';
  ctx.font = '600 22px "DM Sans", sans-serif';
  ctx.fillText(`KURUM KODU: ${cover.institutionCode8 || '48291045'} · ÖLÇME VE ANALİZ MERKEZİ`, 220, 170);

  ctx.font = '800 58px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapTextLines(ctx, cover.examTitle.toUpperCase(), W - 200).slice(0, 4);
  let y = 380;
  for (const line of titleLines) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(line, 98, y + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 92, y);
    y += 82;
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 28px "DM Sans", sans-serif';
  ctx.fillText(cover.subtitle.slice(0, 68), 92, y + 36);

  const cardY = 1020;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fillRect(92, cardY, W - 184, 240);
  ctx.strokeStyle = preset.goldColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(92, cardY, W - 184, 240);

  const specs = [
    { label: 'SORU SAYISI', val: `${cover.questionCount} Soru` },
    { label: 'SINAV SÜRESİ', val: `${cover.durationMinutes} Dakika` },
    { label: cover.isSampleDemo ? 'ÖRNEK NET / PUAN' : 'ÖĞRENCİ NET / PUAN', val: `${analysis.totalNet.toFixed(1)}n / ${analysis.estimatedScore.toFixed(0)}p` },
  ];
  specs.forEach((sp, i) => {
    const cx = 92 + ((W - 184) / 3) * (i + 0.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.font = '700 20px "DM Sans", sans-serif';
    ctx.fillText(sp.label, cx, cardY + 75);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(sp.val, cx, cardY + 145);
  });

  draw3DFurkanSignature(ctx, 100, 1380, '#ffffff', preset.goldColor);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${cover.signatureName} · ${cover.signatureTitle}`, 360, 1440);
  ctx.fillStyle = '#fda4af';
  ctx.font = '700 18px "DM Sans", sans-serif';
  ctx.fillText(
    cover.isSampleDemo
      ? `${cover.securityNotice.slice(0, 58)} · ÖRNEKTİR`
      : cover.securityNotice.slice(0, 68),
    360,
    1480
  );

  return canvasToEncodedBytes(canvas, 'image/png');
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return canvasToEncodedBytes(canvas, 'image/png');
}

async function drawQrBadgeOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  qrDataUrl?: string,
  caption = 'Dijital Karne QR'
): Promise<void> {
  if (!qrDataUrl) return;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    let settled = false;
    const finish = (val: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(val);
    };
    const timer = window.setTimeout(() => finish(null), 1500);
    const image = new Image();
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = qrDataUrl;
  });
  if (!img) return;

  const pad = 8;
  const labelH = 18;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size + pad * 2, size + pad * 2 + labelH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, size + pad * 2, size + pad * 2 + labelH);
  ctx.drawImage(img, x + pad, y + pad, size, size);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 10.5px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(caption, x + (size + pad * 2) / 2, y + size + pad * 2 + 12, size + pad * 2 - 6);
  ctx.restore();
}

export interface ReportPdfOptions {
  qrCodeDataUrl?: string;
  digitalKarneUrl?: string;
  previewOnly?: boolean;
}

/**
 * Profesyonel 2 Sayfalık Renkli 3D A4 PDF Öğrenci Karne Analizi (Önizleme dahil)
 */
export async function generateStudentReportCardPdfWithPreview(
  analysis: ExamAnalysisResult,
  cover: CoverConfig,
  gradeProfile: GradeProfile,
  options?: ReportPdfOptions
): Promise<{ bytes: Uint8Array; pageDataUrls: string[] }> {
  // Always resolve exact grade profile from analysis.gradeId so 5. Sınıf never displays TYT
  const effectiveProfile = getGradeProfile(analysis.gradeId ?? gradeProfile.id);
  const preset = getLogoPreset(cover.logoStyleId);
  const instCode = cover.institutionCode8 || '48291045';
  const showSampleStamp = Boolean(cover.isSampleDemo);
  const penaltyText =
    analysis.penaltyDivisor === 0
      ? 'Yanlış Doğruyu Götürmez (Net = Doğru)'
      : `${analysis.penaltyDivisor} Yanlış 1 Doğruyu Götürür`;

  // ---------- SAYFA 1: RENKLİ 3D KARNE, DERS NET TABLOSU, GRAFİK VE HATA ANALİZİ ----------
  const c1 = document.createElement('canvas');
  c1.width = A4_W;
  c1.height = A4_H;
  const ctx1 = c1.getContext('2d')!;

  ctx1.fillStyle = '#f8fafc';
  ctx1.fillRect(0, 0, A4_W, A4_H);
  ctx1.fillStyle = '#ffffff';
  ctx1.fillRect(24, 24, A4_W - 48, A4_H - 48);
  ctx1.strokeStyle = '#1e3a8a';
  ctx1.lineWidth = 4;
  ctx1.strokeRect(34, 34, A4_W - 68, A4_H - 68);

  // Vibrant Multi-Stop Header Band
  const hGrad1 = ctx1.createLinearGradient(34, 34, A4_W - 34, 178);
  hGrad1.addColorStop(0, '#0f172a');
  hGrad1.addColorStop(0.55, '#1d4ed8');
  hGrad1.addColorStop(1, '#0d9488');
  ctx1.fillStyle = hGrad1;
  ctx1.fillRect(34, 34, A4_W - 68, 144);
  ctx1.fillStyle = '#f59e0b';
  ctx1.fillRect(34, 178, A4_W - 68, 6);

  drawAcademyCrestCanvas(ctx1, 108, 106, 42, preset);

  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText(`${cover.academyName.toUpperCase()} — ÖĞRENCİ KARNE ANALİZİ`, 172, 92);
  ctx1.fillStyle = '#e0f2fe';
  ctx1.font = '700 18px "DM Sans", sans-serif';
  ctx1.fillText(
    `${effectiveProfile.label} · ${effectiveProfile.optionCount} Şıklı Değerlendirme (${penaltyText})`,
    172,
    126
  );
  ctx1.fillStyle = '#fde68a';
  ctx1.font = '700 16px "JetBrains Mono", monospace';
  ctx1.fillText(`KURUM KODU: ${instCode} · TARİH: ${cover.examDate}`, 172, 156);

  // 3D Student Identity Card
  ctx1.fillStyle = 'rgba(15, 23, 42, 0.1)';
  ctx1.fillRect(64, 212, A4_W - 116, 118);
  ctx1.fillStyle = '#eff6ff';
  ctx1.fillRect(58, 206, A4_W - 116, 118);
  ctx1.fillStyle = '#1d4ed8';
  ctx1.fillRect(58, 206, 10, 118);
  ctx1.strokeStyle = '#93c5fd';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(58, 206, A4_W - 116, 118);

  const summaryTextMaxW = options?.qrCodeDataUrl
    ? analysis.academyRank >= 1 && analysis.academyRank <= 3
      ? A4_W - 355
      : A4_W - 275
    : A4_W - 250;
  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText(analysis.studentName || 'Kayıtlı Öğrenci', 86, 248, summaryTextMaxW);
  ctx1.fillStyle = '#334155';
  ctx1.font = '600 18px "DM Sans", sans-serif';
  ctx1.fillText(
    `Öğrenci No: ${analysis.studentNumber || '—'}   ·   Sınıf/Şube: ${analysis.classroom}   ·   Düzey: ${effectiveProfile.shortLabel}`,
    86,
    282,
    summaryTextMaxW
  );
  ctx1.fillStyle = '#0369a1';
  ctx1.font = '700 16px "DM Sans", sans-serif';
  ctx1.fillText(`Sınav: ${analysis.examTitle}`, 86, 308, summaryTextMaxW);

  if (analysis.academyRank >= 1 && analysis.academyRank <= 3) {
    drawTop3MedalCanvas(
      ctx1,
      options?.qrCodeDataUrl ? A4_W - 210 : A4_W - 116,
      265,
      32,
      analysis.academyRank as 1 | 2 | 3
    );
  }
  await drawQrBadgeOnCanvas(ctx1, A4_W - 160, 211, 80, options?.qrCodeDataUrl, 'Dijital Karne');

  // Colorful 3D Extruded KPI Cards
  const kpiW = (A4_W - 116 - 48) / 4;
  const kpis = [
    {
      label: 'TOPLAM NET',
      value: `${analysis.totalNet.toFixed(2)}`,
      sub: `${analysis.totalCorrect}D · ${analysis.totalWrong}Y · ${analysis.totalBlank}B`,
      bg: '#eff6ff',
      accent: '#1d4ed8',
      shadow: '#bfdbfe',
    },
    {
      label: 'TAHMİNİ PUAN',
      value: `${analysis.estimatedScore.toFixed(1)}`,
      sub: `Maksimum ${analysis.maxScore} Puan`,
      bg: '#ecfdf5',
      accent: '#059669',
      shadow: '#a7f3d0',
    },
    {
      label: 'AKADEMİ SIRASI',
      value: `${analysis.academyRank} / ${analysis.academySize}`,
      sub: `Şube: ${analysis.classRank}. / ${analysis.classSize}`,
      bg: '#eef2ff',
      accent: '#4338ca',
      shadow: '#c7d2fe',
    },
    {
      label: 'YÜZDELİK DİLİM',
      value: `%${(100 - analysis.percentile).toFixed(1)}`,
      sub: `Hedef Net: ${analysis.projectedNet.toFixed(1)}`,
      bg: '#fffbeb',
      accent: '#d97706',
      shadow: '#fde68a',
    },
  ];
  kpis.forEach((k, idx) => {
    const kx = 58 + idx * (kpiW + 16);
    const ky = 346;
    ctx1.fillStyle = k.shadow;
    ctx1.fillRect(kx + 5, ky + 6, kpiW, 114);
    ctx1.fillStyle = k.bg;
    ctx1.fillRect(kx, ky, kpiW, 114);
    ctx1.fillStyle = k.accent;
    ctx1.fillRect(kx, ky, kpiW, 7);
    ctx1.strokeStyle = k.accent;
    ctx1.lineWidth = 2;
    ctx1.strokeRect(kx, ky, kpiW, 114);

    ctx1.fillStyle = '#334155';
    ctx1.font = '700 14px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(k.label, kx + 18, ky + 34);
    ctx1.fillStyle = k.accent;
    ctx1.font = '800 32px "Plus Jakarta Sans", sans-serif';
    ctx1.fillText(k.value, kx + 18, ky + 74);
    ctx1.fillStyle = '#475569';
    ctx1.font = '600 13.5px "DM Sans", sans-serif';
    ctx1.fillText(k.sub, kx + 18, ky + 100);
  });

  // Overall Exam Success Progress Bar + 5-Star Rating Banner
  const overallSuccessPct =
    analysis.totalQuestions > 0
      ? Math.max(0, Math.round((analysis.totalNet / analysis.totalQuestions) * 100))
      : 0;
  drawKarneSuccessBanner(ctx1, {
    x: 58,
    y: 476,
    w: A4_W - 116,
    h: 78,
    successPct: overallSuccessPct,
    hasExamData: analysis.totalQuestions > 0,
    title: 'SINAV BAŞARI İLERLEMESİ & YILDIZ PUANI',
  });

  // Subject Performance Table
  let y1 = 584;
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 21px "Plus Jakarta Sans", sans-serif';
  ctx1.textAlign = 'left';
  ctx1.fillText('1. DERS BAZLI NET, İLERLEME ÇUBUĞU VE YILDIZ DEĞERLENDİRMESİ', 58, y1);
  y1 += 14;

  const colOffsets = [58, 250, 312, 376, 440, 504, 582, 682, 796, 1182];
  const headers = [
    'Ders Adı',
    'Soru',
    'Doğru',
    'Yanlış',
    'Boş',
    'Net',
    'Sınıf Ort.',
    'Akademi Ort.',
    'İlerleme, Yıldız & Durum',
  ];

  const tblGrad = ctx1.createLinearGradient(58, y1, A4_W - 58, y1 + 38);
  tblGrad.addColorStop(0, '#1e3a8a');
  tblGrad.addColorStop(1, '#0f766e');
  ctx1.fillStyle = tblGrad;
  ctx1.fillRect(58, y1, A4_W - 116, 38);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '700 14px "DM Sans", sans-serif';
  headers.forEach((h, i) => {
    const isLeft = i === 0 || i === 8;
    ctx1.textAlign = isLeft ? 'left' : 'right';
    const tx = i === 0 ? colOffsets[0] + 14 : i === 8 ? colOffsets[8] + 12 : colOffsets[i + 1] - 10;
    ctx1.fillText(h, tx, y1 + 24);
  });
  y1 += 38;

  analysis.subjectMetrics.slice(0, 7).forEach((s, idx) => {
    const rowH = 44;
    ctx1.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx1.fillRect(58, y1, A4_W - 116, rowH);
    ctx1.strokeStyle = '#cbd5e1';
    ctx1.lineWidth = 1;
    ctx1.strokeRect(58, y1, A4_W - 116, rowH);

    ctx1.fillStyle = '#0f172a';
    ctx1.font = '700 14.5px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(s.subject.slice(0, 22), colOffsets[0] + 14, y1 + 27);

    const vals = [
      String(s.total),
      String(s.correct),
      String(s.wrong),
      String(s.blank),
      s.net.toFixed(2),
      s.classAvgNet.toFixed(2),
      s.academyAvgNet.toFixed(2),
    ];
    vals.forEach((v, vi) => {
      ctx1.textAlign = 'right';
      ctx1.fillStyle =
        vi === 4 ? '#1d4ed8' : vi === 1 ? '#059669' : vi === 2 ? '#e11d48' : '#334155';
      ctx1.font = vi === 4 ? '800 14.5px "JetBrains Mono", monospace' : '600 14px "JetBrains Mono", monospace';
      ctx1.fillText(v, colOffsets[vi + 2] - 10, y1 + 27);
    });

    const subjVisual = resolveSubjectProgressVisual(s.accuracyPct, s.total > 0);
    // Top-left inside visual cell: Graphical progress bar + %
    drawInlineProgressBar(ctx1, {
      x: colOffsets[8] + 12,
      y: y1 + 8,
      w: 118,
      h: 9,
      pct: s.accuracyPct,
      visual: subjVisual,
    });
    ctx1.textAlign = 'left';
    ctx1.fillStyle = subjVisual.accentColor;
    ctx1.font = '800 13px "JetBrains Mono", monospace';
    ctx1.fillText(`%${s.accuracyPct}`, colOffsets[8] + 138, y1 + 17);

    // Bottom-left inside visual cell: 5 Vector Stars + numeric score
    drawStarRatingRow(ctx1, {
      x: colOffsets[8] + 12,
      cy: y1 + 32,
      stars: subjVisual.stars,
      maxStars: 5,
      radius: 5.5,
      gap: 3,
      fillColor: subjVisual.starFillColor,
      emptyColor: subjVisual.starEmptyColor,
      label: `${subjVisual.stars}/5`,
      labelColor: '#475569',
      labelFont: '700 11.5px "JetBrains Mono", monospace',
    });

    // Right inside visual cell: Başarılı / Gelişmekte / Tekrar Pill Badge
    drawTierPillBadge(ctx1, {
      x: colOffsets[9] - 172,
      y: y1 + 11,
      w: 160,
      h: 22,
      visual: subjVisual,
      text: subjVisual.label.toUpperCase(),
      fontSize: 10.5,
    });

    y1 += rowH;
  });

  // Bar Chart Comparison: Öğrenci vs Akademi Ortalaması (Vibrant Multi-Color 3D Bars)
  y1 += 28;
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 21px "Plus Jakarta Sans", sans-serif';
  ctx1.textAlign = 'left';
  ctx1.fillText('2. ÖĞRENCİ NETİ VS AKADEMİ ORTALAMASI GRAFİĞİ', 58, y1);
  y1 += 16;

  const chartBoxH = Math.min(282, 42 + Math.min(6, analysis.subjectMetrics.length) * 39);
  ctx1.fillStyle = '#f8fafc';
  ctx1.fillRect(58, y1, A4_W - 116, chartBoxH);
  ctx1.strokeStyle = '#93c5fd';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(58, y1, A4_W - 116, chartBoxH);

  ctx1.fillStyle = '#1d4ed8';
  ctx1.fillRect(76, y1 + 12, 16, 12);
  ctx1.fillStyle = '#334155';
  ctx1.font = '600 13.5px "DM Sans", sans-serif';
  ctx1.fillText('Öğrenci Neti', 100, y1 + 23);

  ctx1.fillStyle = '#10b981';
  ctx1.fillRect(220, y1 + 12, 16, 12);
  ctx1.fillStyle = '#334155';
  ctx1.fillText('Akademi Ortalaması', 244, y1 + 23);

  const subjPalette = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#e11d48', '#0284c7'];
  const maxSubjQ = Math.max(1, ...analysis.subjectMetrics.map((s) => s.total));
  analysis.subjectMetrics.slice(0, 6).forEach((s, idx) => {
    const ry = y1 + 42 + idx * 39;
    const barColor = subjPalette[idx % subjPalette.length];
    ctx1.fillStyle = '#0f172a';
    ctx1.font = '700 13.5px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(s.subject.slice(0, 22), 76, ry + 16);

    const barStart = 290;
    const barMaxW = 720;
    const stuW = Math.max(8, (Math.max(0, s.net) / maxSubjQ) * barMaxW);
    const avgW = Math.max(8, (Math.max(0, s.academyAvgNet) / maxSubjQ) * barMaxW);

    ctx1.fillStyle = '#e2e8f0';
    ctx1.fillRect(barStart, ry + 2, barMaxW, 12);
    ctx1.fillStyle = 'rgba(15, 23, 42, 0.14)';
    ctx1.fillRect(barStart + 2, ry + 4, stuW, 12);
    ctx1.fillStyle = barColor;
    ctx1.fillRect(barStart, ry + 2, stuW, 12);

    ctx1.fillStyle = '#e2e8f0';
    ctx1.fillRect(barStart, ry + 18, barMaxW, 9);
    ctx1.fillStyle = '#10b981';
    ctx1.fillRect(barStart, ry + 18, avgW, 9);

    ctx1.textAlign = 'right';
    ctx1.fillStyle = '#0f172a';
    ctx1.font = '700 13px "JetBrains Mono", monospace';
    ctx1.fillText(`${s.net.toFixed(1)} / Ort: ${s.academyAvgNet.toFixed(1)}`, A4_W - 76, ry + 17);
  });

  // Difficulty & Error Type Colorful 3D Cards
  const bottomBlockY = Math.min(Math.max(y1 + chartBoxH + 22, 1290), A4_H - 90 - 262);
  const halfW = (A4_W - 116 - 20) / 2;

  ctx1.fillStyle = '#dbeafe';
  ctx1.fillRect(63, bottomBlockY + 5, halfW, 250);
  ctx1.fillStyle = '#eff6ff';
  ctx1.fillRect(58, bottomBlockY, halfW, 250);
  ctx1.strokeStyle = '#3b82f6';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(58, bottomBlockY, halfW, 250);
  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#1e3a8a';
  ctx1.font = '800 18px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText('3. ZORLUK DÜZEYİ BAŞARISI', 78, bottomBlockY + 34);

  const diffColors = ['#10b981', '#2563eb', '#f59e0b'];
  analysis.difficultyMetrics.forEach((d, idx) => {
    const dy = bottomBlockY + 68 + idx * 54;
    const dc = diffColors[idx % diffColors.length];
    ctx1.fillStyle = '#0f172a';
    ctx1.font = '700 15px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(`${d.difficulty} (${d.correct}D / ${d.total} Soru)`, 78, dy);
    ctx1.textAlign = 'right';
    ctx1.fillStyle = dc;
    ctx1.fillText(`%${d.successPct}`, 58 + halfW - 22, dy);

    ctx1.fillStyle = '#dbeafe';
    ctx1.fillRect(78, dy + 10, halfW - 44, 12);
    ctx1.fillStyle = dc;
    ctx1.fillRect(78, dy + 10, ((halfW - 44) * d.successPct) / 100, 12);
  });

  const rightX = 58 + halfW + 20;
  ctx1.fillStyle = '#fecdd3';
  ctx1.fillRect(rightX + 5, bottomBlockY + 5, halfW, 250);
  ctx1.fillStyle = '#fff1f2';
  ctx1.fillRect(rightX, bottomBlockY, halfW, 250);
  ctx1.strokeStyle = '#e11d48';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(rightX, bottomBlockY, halfW, 250);
  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#9f1239';
  ctx1.font = '800 18px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText('4. HATA TİPİ VE ÇELDİRİCİ DAĞILIMI', rightX + 20, bottomBlockY + 34);

  const errEntries = Object.entries(analysis.errorBreakdown);
  const errDenom = Math.max(1, analysis.totalWrong + analysis.totalBlank);
  errEntries.slice(0, 4).forEach(([label, count], idx) => {
    const dy = bottomBlockY + 68 + idx * 42;
    const pct = Math.round((count / errDenom) * 100);
    ctx1.fillStyle = '#0f172a';
    ctx1.font = '600 14.5px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(label, rightX + 20, dy);
    ctx1.textAlign = 'right';
    ctx1.fillStyle = '#be123c';
    ctx1.fillText(`${count} soru (%${pct})`, rightX + halfW - 22, dy);

    ctx1.fillStyle = '#ffe4e6';
    ctx1.fillRect(rightX + 20, dy + 8, halfW - 42, 10);
    ctx1.fillStyle = '#e11d48';
    ctx1.fillRect(rightX + 20, dy + 8, ((halfW - 42) * pct) / 100, 10);
  });

  // Footer Page 1 (NEVER prints ÖRNEKTİR for real/manual students)
  ctx1.fillStyle = '#0f172a';
  ctx1.fillRect(34, A4_H - 90, A4_W - 68, 56);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '700 16px "DM Sans", sans-serif';
  ctx1.textAlign = 'center';
  ctx1.fillText(
    showSampleStamp
      ? `${cover.academyName} · Kurum Kodu: ${instCode} · ÇOĞALTILAMAZ · ÖRNEKTİR · Sayfa 1 / 2`
      : `${cover.academyName} · Kurum Kodu: ${instCode} · ÇOĞALTILAMAZ · RESMİ KARNE · Sayfa 1 / 2`,
    A4_W / 2,
    A4_H - 56
  );

  // ---------- SAYFA 2: KONU BAZLI KAZANIM MATRİSİ, KOÇLUK PLANI & 3D İMZA ----------
  const c2 = document.createElement('canvas');
  c2.width = A4_W;
  c2.height = A4_H;
  const ctx2 = c2.getContext('2d')!;

  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, A4_W, A4_H);
  ctx2.strokeStyle = preset.secondaryColor;
  ctx2.lineWidth = 4;
  ctx2.strokeRect(34, 34, A4_W - 68, A4_H - 68);

  const hGrad2 = ctx2.createLinearGradient(34, 34, A4_W - 34, 120);
  hGrad2.addColorStop(0, '#0f172a');
  hGrad2.addColorStop(0.55, '#1d4ed8');
  hGrad2.addColorStop(1, '#0d9488');
  ctx2.fillStyle = hGrad2;
  ctx2.fillRect(34, 34, A4_W - 68, 86);
  drawAcademyCrestCanvas(ctx2, 88, 77, 28, preset);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(`${(analysis.studentName || 'ÖĞRENCİ').toUpperCase()} — KONU BAZLI KAZANIM MATRİSİ & REÇETE`, 134, 72);
  ctx2.fillStyle = '#fde68a';
  ctx2.font = '700 15px "JetBrains Mono", monospace';
  ctx2.fillText(
    `Öğrenci No: ${analysis.studentNumber || '—'} · ${effectiveProfile.shortLabel} · Kurum: ${instCode}`,
    134,
    100
  );

  let y2 = 160;
  ctx2.fillStyle = preset.secondaryColor;
  ctx2.font = '800 21px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('5. KONU BAZLI KAZANIM MATRİSİ (ÖNCELİKLİ SIRALAMA)', 58, y2);
  y2 += 16;

  const tCols = [58, 225, 535, 635, 690, 745, 800, 855, 1020, 1182];
  const tHeaders = ['Ders', 'Konu / Kazanım', 'Kod', 'Soru', 'D', 'Y', 'B', 'İlerleme %', 'Başarı Durumu'];
  ctx2.fillStyle = preset.secondaryColor;
  ctx2.fillRect(58, y2, A4_W - 116, 38);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '700 13.5px "DM Sans", sans-serif';
  tHeaders.forEach((h, idx) => {
    const alignRight = idx >= 3 && idx <= 6;
    ctx2.textAlign = alignRight ? 'right' : 'left';
    const tx = alignRight ? tCols[idx + 1] - 10 : idx === 7 || idx === 8 ? tCols[idx] + 10 : tCols[idx] + 10;
    ctx2.fillText(h, tx, y2 + 24);
  });
  y2 += 38;

  const sortedTopics = [...analysis.topicGaps]
    .sort((a, b) => a.masteryPct - b.masteryPct)
    .slice(0, 18);

  sortedTopics.forEach((t, idx) => {
    const rowH = 36;
    ctx2.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx2.fillRect(58, y2, A4_W - 116, rowH);
    ctx2.strokeStyle = '#e2e8f0';
    ctx2.lineWidth = 1;
    ctx2.strokeRect(58, y2, A4_W - 116, rowH);

    ctx2.textAlign = 'left';
    ctx2.fillStyle = '#0f172a';
    ctx2.font = '700 13px "DM Sans", sans-serif';
    ctx2.fillText(t.subject.slice(0, 18), tCols[0] + 10, y2 + 23);
    ctx2.font = '500 13px "DM Sans", sans-serif';
    ctx2.fillText(t.topic.slice(0, 38), tCols[1] + 10, y2 + 23);
    ctx2.fillStyle = '#64748b';
    ctx2.font = '600 12.5px "JetBrains Mono", monospace';
    ctx2.fillText(t.gainCode.slice(0, 12), tCols[2] + 10, y2 + 23);

    const nums = [String(t.total), String(t.correct), String(t.wrong), String(t.blank)];
    nums.forEach((nv, ni) => {
      ctx2.textAlign = 'right';
      ctx2.fillStyle = ni === 1 ? '#047857' : ni === 2 ? '#be123c' : '#0f172a';
      ctx2.font = '700 13px "JetBrains Mono", monospace';
      ctx2.fillText(nv, tCols[ni + 4] - 10, y2 + 23);
    });

    const topicVisual = resolveTopicProgressVisual(t.masteryPct);
    drawInlineProgressBar(ctx2, {
      x: tCols[7] + 10,
      y: y2 + 13,
      w: 92,
      h: 9,
      pct: t.masteryPct,
      visual: topicVisual,
    });
    ctx2.textAlign = 'right';
    ctx2.fillStyle = topicVisual.accentColor;
    ctx2.font = '800 13px "JetBrains Mono", monospace';
    ctx2.fillText(`%${t.masteryPct}`, tCols[8] - 10, y2 + 22);

    drawTierPillBadge(ctx2, {
      x: tCols[8] + 10,
      y: y2 + 7,
      w: 142,
      h: 22,
      visual: topicVisual,
      text: topicVisual.label.toUpperCase(),
      fontSize: 9.8,
    });

    y2 += rowH;
  });

  // AI / Academic Coach Evaluation & Action Plan
  const coachY = Math.max(y2 + 30, 910);
  ctx2.fillStyle = '#f8fafc';
  ctx2.fillRect(58, coachY, A4_W - 116, 370);
  ctx2.strokeStyle = preset.primaryColor;
  ctx2.lineWidth = 2.5;
  ctx2.strokeRect(58, coachY, A4_W - 116, 370);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = preset.secondaryColor;
  ctx2.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('6. PROFESYONEL AKADEMİK DEĞERLENDİRME & 14 GÜNLÜK ÇALIŞMA PLANI', 82, coachY + 42);

  const strongest = [...analysis.subjectMetrics].sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
  const weakest = [...analysis.subjectMetrics].sort((a, b) => a.accuracyPct - b.accuracyPct)[0];
  const criticalList = analysis.topicGaps.filter((t) => t.status === 'Kritik Eksik').slice(0, 3);
  const coachBody =
    analysis.aiCoachSummary ||
    `${analysis.studentName || 'Öğrencimiz'}, ${effectiveProfile.label} sınavında ${analysis.totalQuestions} soruda ${analysis.totalCorrect} doğru, ${analysis.totalWrong} yanlış, ${analysis.totalBlank} boş ile ${analysis.totalNet.toFixed(2)} net ve ${analysis.estimatedScore.toFixed(1)} puan elde etti. En yüksek başarı %${strongest?.accuracyPct ?? 0} ile ${strongest?.subject ?? 'Türkçe'} dersinde görülürken; ${weakest?.subject ?? 'Matematik'} (%${weakest?.accuracyPct ?? 0}) alanında öncelikli tekrar planı önerilmektedir. Kritik konular: ${criticalList.map((t) => t.topic).join(', ') || 'Temel kazanım tekrarları'}. Önümüzdeki 14 günde günde 25 dk konu + 20 yeni nesil soru rutiniyle tahmini ${analysis.projectedNet.toFixed(1)} net (${analysis.projectedScore.toFixed(1)} puan) hedefine ulaşılması beklenmektedir.`;

  ctx2.fillStyle = '#1e293b';
  ctx2.font = '500 17px "DM Sans", sans-serif';
  let cy = coachY + 82;
  const paragraphs = coachBody.split(/\n+/);
  for (const para of paragraphs) {
    const lines = wrapTextLines(ctx2, para, A4_W - 168);
    for (const ln of lines) {
      if (cy < coachY + 345) {
        ctx2.fillText(ln, 82, cy);
        cy += 27;
      }
    }
    cy += 8;
  }

  // Bottom 3D Furkan Signature + Stamp (NEVER prints ÖRNEKTİR for real/manual students)
  const sigY = 1365;
  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#1d4ed8';
  ctx2.font = '800 22px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(
    showSampleStamp ? 'RESMİ ÖLÇME DEĞERLENDİRME BELGESİ · ÖRNEKTİR' : 'RESMİ ÖLÇME DEĞERLENDİRME BELGESİ',
    68,
    sigY + 46
  );
  ctx2.fillStyle = '#475569';
  ctx2.font = '600 16px "DM Sans", sans-serif';
  ctx2.fillText(`${cover.securityNotice}`, 68, sigY + 78);

  await drawQrBadgeOnCanvas(
    ctx2,
    A4_W - 510,
    sigY - 4,
    88,
    options?.qrCodeDataUrl,
    'Dijital Karne QR'
  );

  draw3DFurkanSignature(ctx2, A4_W - 360, sigY, '#0f172a', '#f59e0b');
  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#0f172a';
  ctx2.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(`${cover.signatureName} (${cover.signatureTitle})`, A4_W - 240, sigY + 118);

  ctx2.fillStyle = '#0f172a';
  ctx2.fillRect(34, A4_H - 90, A4_W - 68, 56);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '700 16px "DM Sans", sans-serif';
  ctx2.fillText(
    showSampleStamp
      ? `${cover.academyName} · Kurum Kodu: ${instCode} · ÇOĞALTILAMAZ · ÖRNEKTİR · Sayfa 2 / 2`
      : `${cover.academyName} · Kurum Kodu: ${instCode} · ÇOĞALTILAMAZ · RESMİ KARNE · Sayfa 2 / 2`,
    A4_W / 2,
    A4_H - 56
  );

  if (options?.previewOnly) {
    return {
      bytes: new Uint8Array(0),
      pageDataUrls: [c1.toDataURL('image/jpeg', 0.92), c2.toDataURL('image/jpeg', 0.92)],
    };
  }
  const pageDataUrls = [c1.toDataURL('image/png'), c2.toDataURL('image/png')];
  const pdfDoc = await PDFDocument.create();
  for (const dataUrl of pageDataUrls) {
    const pngBytes = dataUrlToUint8Array(dataUrl);
    const img = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return { bytes: await pdfDoc.save(), pageDataUrls };
}

/**
 * Profesyonel 2 Sayfalık Renkli 3D A4 PDF Öğrenci Karne Analizi
 */
export async function generateStudentReportCardPdf(
  analysis: ExamAnalysisResult,
  cover: CoverConfig,
  gradeProfile: GradeProfile,
  options?: ReportPdfOptions
): Promise<Uint8Array> {
  const { bytes } = await generateStudentReportCardPdfWithPreview(
    analysis,
    cover,
    gradeProfile,
    options
  );
  return bytes;
}

/**
 * Kurum Listesi Profesyonel A4 PDF Çıktısı
 */
export async function generateInstitutionsListPdf(
  institutions: Institution[],
  students: StudentRecord[],
  cover: CoverConfig
): Promise<Uint8Array> {
  const preset = getLogoPreset(cover.logoStyleId);
  const perPage = 24;
  const totalPages = Math.max(1, Math.ceil(institutions.length / perPage));
  const pdfDoc = await PDFDocument.create();

  for (let p = 0; p < totalPages; p++) {
    const slice = institutions.slice(p * perPage, (p + 1) * perPage);
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);
    ctx.strokeStyle = preset.secondaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, A4_W - 72, A4_H - 72);

    const hGrad = ctx.createLinearGradient(36, 36, A4_W - 36, 152);
    hGrad.addColorStop(0, preset.secondaryColor);
    hGrad.addColorStop(1, preset.primaryColor);
    ctx.fillStyle = hGrad;
    ctx.fillRect(36, 36, A4_W - 72, 116);
    drawAcademyCrestCanvas(ctx, 102, 94, 34, preset);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${cover.academyName.toUpperCase()} — KAYITLI KURUMLAR LİSTESİ`, 156, 86);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.fillText(
      `Toplam ${institutions.length} Kurum · 8 Haneli Lisans & Giriş Kodları · Sayfa ${p + 1}/${totalPages}`,
      156,
      122
    );

    let y = 188;
    const cols = [58, 120, 320, 770, 940, 1070, 1182];
    const heads = ['#', 'Kurum Kodu (8H)', 'Kurum Adı', 'Şehir', 'Öğrenci', 'Kayıt Tarihi'];
    ctx.fillStyle = preset.secondaryColor;
    ctx.fillRect(58, y, A4_W - 116, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px "DM Sans", sans-serif';
    heads.forEach((h, i) => {
      ctx.textAlign = i === 4 ? 'right' : 'left';
      ctx.fillText(h, i === 4 ? cols[5] - 12 : cols[i] + 10, y + 26);
    });
    y += 42;

    slice.forEach((inst, idx) => {
      const rowH = 52;
      const stuCount = students.filter((s) => s.institutionId === inst.id).length;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(58, y, A4_W - 116, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(58, y, A4_W - 116, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(String(p * perPage + idx + 1), cols[0] + 12, y + 32);

      ctx.fillStyle = preset.primaryColor;
      ctx.font = '800 16px "JetBrains Mono", monospace';
      ctx.fillText(inst.code8, cols[1] + 10, y + 32);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 16px "DM Sans", sans-serif';
      ctx.fillText(inst.name.slice(0, 34), cols[2] + 10, y + 32);

      ctx.fillStyle = '#334155';
      ctx.font = '600 15px "DM Sans", sans-serif';
      ctx.fillText(inst.city.slice(0, 14), cols[3] + 10, y + 32);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(String(stuCount), cols[5] - 12, y + 32);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '600 14px "DM Sans", sans-serif';
      ctx.fillText(inst.createdAt, cols[5] + 12, y + 32);
      y += rowH;
    });

    draw3DFurkanSignature(ctx, A4_W - 330, A4_H - 210, preset.secondaryColor, preset.goldColor);
    ctx.fillStyle = preset.secondaryColor;
    ctx.fillRect(36, A4_H - 92, A4_W - 72, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      cover.isSampleDemo
        ? `${cover.academyName} · ${cover.signatureName} 3D İmzalı · ÇOĞALTILAMAZ · ÖRNEKTİR`
        : `${cover.academyName} · ${cover.signatureName} 3D İmzalı · ÇOĞALTILAMAZ · RESMİ KURUM LİSTESİ`,
      A4_W / 2,
      A4_H - 58
    );

    const img = await pdfDoc.embedPng(await canvasToPngBytes(canvas));
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return pdfDoc.save();
}

/**
 * Öğrenci Listesi Profesyonel A4 PDF Çıktısı
 */
export async function generateStudentsListPdf(
  students: StudentRecord[],
  activeInstitution: Institution,
  cover: CoverConfig
): Promise<Uint8Array> {
  const preset = getLogoPreset(cover.logoStyleId);
  const perPage = 24;
  const totalPages = Math.max(1, Math.ceil(students.length / perPage));
  const pdfDoc = await PDFDocument.create();

  for (let p = 0; p < totalPages; p++) {
    const slice = students.slice(p * perPage, (p + 1) * perPage);
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);
    ctx.strokeStyle = preset.secondaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, A4_W - 72, A4_H - 72);

    const hGrad = ctx.createLinearGradient(36, 36, A4_W - 36, 152);
    hGrad.addColorStop(0, preset.secondaryColor);
    hGrad.addColorStop(1, preset.primaryColor);
    ctx.fillStyle = hGrad;
    ctx.fillRect(36, 36, A4_W - 72, 116);
    drawAcademyCrestCanvas(ctx, 102, 94, 34, preset);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${activeInstitution.name.toUpperCase()} — ÖĞRENCİ KÜTÜĞÜ`, 156, 86);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.fillText(
      `Kurum Kodu: ${activeInstitution.code8} · Toplam ${students.length} Öğrenci · Sayfa ${p + 1}/${totalPages}`,
      156,
      122
    );

    let y = 188;
    const cols = [58, 116, 290, 620, 860, 1055, 1182];
    const heads = ['#', 'Öğrenci No (8H)', 'Adı Soyadı', 'Sınıf / Sınav Düzeyi', 'Şube', 'Kayıt Tarihi'];
    ctx.fillStyle = preset.secondaryColor;
    ctx.fillRect(58, y, A4_W - 116, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px "DM Sans", sans-serif';
    heads.forEach((h, i) => {
      ctx.textAlign = 'left';
      ctx.fillText(h, cols[i] + 10, y + 26);
    });
    y += 42;

    slice.forEach((stu, idx) => {
      const rowH = 52;
      const gradeLabel = getGradeProfile(stu.gradeId).shortLabel;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(58, y, A4_W - 116, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(58, y, A4_W - 116, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(String(p * perPage + idx + 1), cols[0] + 10, y + 32);

      ctx.fillStyle = preset.primaryColor;
      ctx.font = '800 16px "JetBrains Mono", monospace';
      ctx.fillText(stu.studentNumber8, cols[1] + 10, y + 32);

      ctx.fillStyle = '#0f172a';
      drawFittedSingleLineText(
        ctx,
        stu.fullName,
        cols[2] + 10,
        y + 32,
        cols[3] - cols[2] - 18,
        '700',
        '"DM Sans", sans-serif',
        16,
        11
      );

      ctx.fillStyle = '#047857';
      ctx.font = '700 15px "DM Sans", sans-serif';
      ctx.fillText(gradeLabel, cols[3] + 10, y + 32);

      ctx.fillStyle = '#334155';
      ctx.font = '600 15px "DM Sans", sans-serif';
      ctx.fillText(stu.classroom.slice(0, 16), cols[4] + 10, y + 32);

      ctx.fillStyle = '#64748b';
      ctx.font = '600 14px "DM Sans", sans-serif';
      ctx.fillText(stu.createdAt, cols[5] + 10, y + 32);
      y += rowH;
    });

    draw3DFurkanSignature(ctx, A4_W - 330, A4_H - 210, preset.secondaryColor, preset.goldColor);
    ctx.fillStyle = preset.secondaryColor;
    ctx.fillRect(36, A4_H - 92, A4_W - 72, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      cover.isSampleDemo
        ? `${activeInstitution.name} (${activeInstitution.code8}) · ${cover.signatureName} 3D İmzalı · ÇOĞALTILAMAZ · ÖRNEKTİR`
        : `${activeInstitution.name} (${activeInstitution.code8}) · ${cover.signatureName} 3D İmzalı · ÇOĞALTILAMAZ · RESMİ LİSTE`,
      A4_W / 2,
      A4_H - 58
    );

    const img = await pdfDoc.embedPng(await canvasToPngBytes(canvas));
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return pdfDoc.save();
}

export async function generateCompleteSystemZip(params: {
  cover: CoverConfig;
  questions: ExamQuestion[];
  baseQuestions?: ExamQuestion[];
  orderSeed?: number;
  analysis: ExamAnalysisResult;
  uploadedPdfBytes?: Uint8Array | null;
  pdfStripOptions?: PdfUploadStripOptions;
  optionCount: 4 | 5;
  gradeProfile?: GradeProfile;
  studentName?: string;
  studentNumber8?: string;
  classroom?: string;
}): Promise<Blob> {
  const zip = new JSZip();
  const sourceBase = params.baseQuestions && params.baseQuestions.length > 0 ? params.baseQuestions : params.questions;
  const orderSeed = params.orderSeed ?? 0;

  const bookletPdf = await generateBookletPdf(
    params.cover,
    params.questions,
    params.uploadedPdfBytes,
    params.pdfStripOptions
  );
  const opticalPdf = await generateOpticalSheetPdf(
    params.cover,
    Math.max(params.questions.length, 120),
    params.optionCount,
    {
      gradeProfile: params.gradeProfile,
      studentName: params.studentName || params.analysis.studentName,
      studentNumber8: params.studentNumber8 || params.analysis.studentNumber,
      institutionCode8: params.cover.institutionCode8,
      classroom: params.classroom || params.analysis.classroom,
    }
  );
  const posterPng = await renderPosterSummaryPng(params.cover, params.analysis);
  const activeProfile = params.gradeProfile ?? getGradeProfile(params.analysis.gradeId);
  const reportCardPdf = await generateStudentReportCardPdf(
    params.analysis,
    params.cover,
    activeProfile
  );

  const csvRows = [
    'SoruNo,Ders,Konu,KazanimKodu,Zorluk,DogruCevap,Kaynak',
    ...params.questions.map(
      (q) =>
        `${q.number},"${q.subject}","${q.topic}","${q.gainCode}","${q.difficulty}","${q.correctOption}","${q.source}"`
    ),
  ].join('\n');

  const topicMatrixCsv = [
    'Ders,Konu,KazanimKodu,SoruSayisi,Dogru,Yanlis,Bos,BasariYuzdesi,Durum',
    ...params.analysis.topicGaps.map(
      (t) =>
        `"${t.subject}","${t.topic}","${t.gainCode}",${t.total},${t.correct},${t.wrong},${t.blank},${t.masteryPct},"${t.status}"`
    ),
  ].join('\n');

  zip.file('01_Dogruluk_Akademi_Panel.html', buildStandalonePrototypeHtml(params.analysis, params.cover, params.questions));
  zip.file('02_Deneme_Kitapcigi_Furkan_Imzali.pdf', bookletPdf);
  for (const code of BOOKLET_CODES) {
    if (code === params.cover.bookletCode) {
      zip.file(`Kitapciklar/${code}_Kitapcigi.pdf`, bookletPdf);
    } else {
      const varQ = buildBookletVariantQuestions(sourceBase, code, orderSeed);
      const varPdf = await generateBookletPdf(
        {
          ...params.cover,
          bookletCode: code,
          questionCount: varQ.length || params.cover.questionCount,
        },
        varQ,
        params.uploadedPdfBytes,
        params.pdfStripOptions,
        0.84
      );
      zip.file(`Kitapciklar/${code}_Kitapcigi.pdf`, varPdf);
    }
    await yieldToMainThread();
  }
  zip.file('03_Optik_Form_Sablonu.pdf', opticalPdf);
  for (const code of BOOKLET_CODES) {
    if (code === params.cover.bookletCode) {
      zip.file(`Optik_Formlar/Optik_${code}.pdf`, opticalPdf);
    } else {
      const optPdf = await generateOpticalSheetPdf(
        { ...params.cover, bookletCode: code },
        Math.max(params.questions.length, 120),
        params.optionCount,
        {
          gradeProfile: params.gradeProfile,
          studentName: params.studentName || params.analysis.studentName,
          studentNumber8: params.studentNumber8 || params.analysis.studentNumber,
          institutionCode8: params.cover.institutionCode8,
          classroom: params.classroom || params.analysis.classroom,
        }
      );
      zip.file(`Optik_Formlar/Optik_${code}.pdf`, optPdf);
    }
    await yieldToMainThread();
  }
  zip.file(
    '04_Cevap_Anahtari_ve_Sorular.json',
    JSON.stringify({ cover: params.cover, questions: params.questions, analysis: params.analysis }, null, 2)
  );
  zip.file('05_Cevap_Anahtari.csv', '\uFEFF' + csvRows);
  zip.file('05b_ABCD_Cevap_Anahtarlari.csv', buildAllBookletsAnswerKeyCsv(sourceBase, orderSeed));
  zip.file('06_5_Cesit_Analiz_Karnesi.html', buildStandaloneHtmlReport(params.analysis, params.cover));
  zip.file('07_Konu_Kazanim_Matrisi.csv', '\uFEFF' + topicMatrixCsv);
  zip.file('08_Dogruluk_Akademi_3D_Afis.png', posterPng);
  zip.file('09_Ogrenci_Karne_Analizi.pdf', reportCardPdf);
  zip.file(
    'OKU_BENI.txt',
    `DOĞRULUK AKADEMİ — TAM SINAV VE ANALİZ PAKETİ
====================================================
Kurum: ${params.cover.academyName} (Kurum Kodu: ${params.cover.institutionCode8 || '48291045'})
Sınav: ${params.cover.examTitle}
Onay & İmza: ${params.cover.signatureName} (${params.cover.signatureTitle})
Güvenlik: ${params.cover.isSampleDemo ? `${params.cover.securityNotice} · ÖRNEKTİR` : params.cover.securityNotice}

Paket İçeriği:
1. 01_Dogruluk_Akademi_Panel.html : 10 temalı taşınabilir HTML yönetim paneli
2. 02_Deneme_Kitapcigi_Furkan_Imzali.pdf + Kitapciklar/{A,B,C,D}_Kitapcigi.pdf : Tüm A-B-C-D kitapçık PDF'leri
3. 03_Optik_Form_Sablonu.pdf : Kurum kodu & 8 haneli öğrenci no kodlamalı pembe/magenta OMR optik form
4. 04_Cevap_Anahtari_ve_Sorular.json : Yapılandırılmış soru bankası ve analiz verisi
5. 05_Cevap_Anahtari.csv & 05b_ABCD_Cevap_Anahtarlari.csv : Excel uyumlu A-B-C-D cevap anahtarı tabloları
6. 06_5_Cesit_Analiz_Karnesi.html : Yazdırılabilir 5 çeşit karne ve Konu Kazanım Matrisi
7. 07_Konu_Kazanim_Matrisi.csv : Konu bazlı kazanım başarı yüzdeleri tablosu (Excel uyumlu)
8. 08_Dogruluk_Akademi_3D_Afis.png : Yüksek çözünürlüklü kurumsal duyuru afişi
9. 09_Ogrenci_Karne_Analizi.pdf : 2 sayfalık profesyonel A4 öğrenci karne analizi PDF dosyası
`
  );

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Panoya Asmalık Renkli 3D Sıralı Haftalık Karşılaştırma Listesi (KTS-1 vs KTS-2) PDF
 */
export async function generateWeeklyRankingPdf(params: {
  rows: WeeklyComparisonRow[];
  academyName: string;
  institutionCode8: string;
  kts1Name: string;
  kts2Name: string;
  kts1QuestionCount: number;
  kts2QuestionCount: number;
  gradeProfile: GradeProfile;
  cover: CoverConfig;
}): Promise<Uint8Array> {
  const preset = getLogoPreset(params.cover.logoStyleId);
  const perPage = 16;
  const totalPages = Math.max(1, Math.ceil(params.rows.length / perPage));
  const pdfDoc = await PDFDocument.create();

  for (let p = 0; p < totalPages; p++) {
    const slice = params.rows.slice(p * perPage, (p + 1) * perPage);
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 4;
    ctx.strokeRect(34, 34, A4_W - 68, A4_H - 68);

    // Vibrant 3D Header
    const hGrad = ctx.createLinearGradient(34, 34, A4_W - 34, 178);
    hGrad.addColorStop(0, '#0f172a');
    hGrad.addColorStop(0.5, '#1d4ed8');
    hGrad.addColorStop(1, '#0d9488');
    ctx.fillStyle = hGrad;
    ctx.fillRect(34, 34, A4_W - 68, 142);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(34, 176, A4_W - 68, 6);

    drawAcademyCrestCanvas(ctx, 108, 105, 40, preset);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${params.academyName.toUpperCase()} — HAFTALIK DENEME SIRALAMASI`, 170, 90);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '700 18px "DM Sans", sans-serif';
    ctx.fillText(
      `${params.gradeProfile.shortLabel} · ${params.kts1Name} (${params.kts1QuestionCount} Soru) vs ${params.kts2Name} (${params.kts2QuestionCount} Soru)`,
      170,
      124
    );
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillText(
      `KURUM KODU: ${params.institutionCode8} · TOPLAM ${params.rows.length} ÖĞRENCİ · SAYFA ${p + 1}/${totalPages}`,
      170,
      154
    );

    // Top 3 Podium Strip on Page 1
    let y = 204;
    if (p === 0 && params.rows.length > 0) {
      const top3 = params.rows.slice(0, 3);
      const cardW = (A4_W - 116 - 32) / 3;
      top3.forEach((row, idx) => {
        const cx = 58 + idx * (cardW + 16);
        const bgColors = ['#fffbeb', '#f8fafc', '#fff7ed'];
        const borderColors = ['#f59e0b', '#94a3b8', '#ea580c'];
        ctx.fillStyle = 'rgba(15,23,42,0.1)';
        ctx.fillRect(cx + 4, y + 4, cardW, 110);
        ctx.fillStyle = bgColors[idx];
        ctx.fillRect(cx, y, cardW, 110);
        ctx.strokeStyle = borderColors[idx];
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx, y, cardW, 110);

        drawTop3MedalCanvas(ctx, cx + 44, y + 55, 26, (idx + 1) as 1 | 2 | 3);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        drawFittedSingleLineText(
          ctx,
          row.studentName,
          cx + 84,
          y + 42,
          cardW - 96,
          '800',
          '"Plus Jakarta Sans", sans-serif',
          19,
          12
        );
        ctx.fillStyle = '#475569';
        ctx.font = '600 14px "DM Sans", sans-serif';
        ctx.fillText(`${row.classroom} · No: ${row.studentNumber8}`, cx + 84, y + 66);
        ctx.fillStyle = borderColors[idx];
        ctx.font = '800 16px "JetBrains Mono", monospace';
        ctx.fillText(
          `${row.kts2Score.toFixed(1)} Puan · ${row.kts2Net.toFixed(1)} Net (%${row.successPct})`,
          cx + 84,
          y + 92
        );
      });
      y += 134;
    }

    // Table Header
    const cols = [58, 126, 405, 535, 665, 790, 910, 1020, 1182];
    const heads = ['Sıra', 'Öğrenci Adı (8H No)', 'KTS-1', 'KTS-2', 'Fark', 'Başarı', 'Durum', 'Öneri'];

    const tblGrad = ctx.createLinearGradient(58, y, A4_W - 58, y + 44);
    tblGrad.addColorStop(0, '#1e3a8a');
    tblGrad.addColorStop(1, '#0f766e');
    ctx.fillStyle = tblGrad;
    ctx.fillRect(58, y, A4_W - 116, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14.5px "DM Sans", sans-serif';
    heads.forEach((h, i) => {
      const rightAlign = i >= 2 && i <= 5;
      ctx.textAlign = rightAlign ? 'right' : 'left';
      ctx.fillText(h, rightAlign ? cols[i + 1] - 10 : cols[i] + 10, y + 27);
    });
    y += 44;

    slice.forEach((row, idx) => {
      const rowH = 66;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(58, y, A4_W - 116, rowH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(58, y, A4_W - 116, rowH);

      if (row.top3Badge) {
        drawTop3MedalCanvas(ctx, cols[0] + 34, y + rowH / 2, 18, row.top3Badge);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = '800 16px "JetBrains Mono", monospace';
        ctx.fillText(`${row.rank}.`, cols[0] + 34, y + rowH / 2 + 1);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      drawFittedSingleLineText(
        ctx,
        row.studentName,
        cols[1] + 10,
        y + 26,
        cols[2] - cols[1] - 18,
        '800',
        '"Plus Jakarta Sans", sans-serif',
        16,
        11
      );
      ctx.fillStyle = '#64748b';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillText(`${row.studentNumber8} · ${row.classroom}`, cols[1] + 10, y + 48);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#334155';
      ctx.font = '700 14.5px "JetBrains Mono", monospace';
      ctx.fillText(`${row.kts1Score.toFixed(0)}p (${row.kts1Net.toFixed(1)}n)`, cols[3] - 10, y + 38);

      ctx.fillStyle = '#1d4ed8';
      ctx.font = '800 15px "JetBrains Mono", monospace';
      ctx.fillText(`${row.kts2Score.toFixed(0)}p (${row.kts2Net.toFixed(1)}n)`, cols[4] - 10, y + 38);

      const sign = row.scoreDelta >= 0 ? '+' : '';
      ctx.fillStyle = row.scoreDelta >= 0 ? '#059669' : '#e11d48';
      ctx.fillText(`${sign}${row.scoreDelta.toFixed(1)}p`, cols[5] - 10, y + 38);

      ctx.fillStyle = '#0f172a';
      ctx.fillText(`%${row.successPct}`, cols[6] - 10, y + 38);

      ctx.textAlign = 'left';
      ctx.fillStyle =
        row.status === 'Üstün Başarı'
          ? '#059669'
          : row.status === 'İyi Gelişim'
            ? '#2563eb'
            : row.status === 'Destek Gerekiyor'
              ? '#d97706'
              : '#be123c';
      ctx.font = '800 13.5px "DM Sans", sans-serif';
      ctx.fillText(row.status, cols[6] + 10, y + 38);

      ctx.fillStyle = '#475569';
      ctx.font = '500 12.5px "DM Sans", sans-serif';
      ctx.fillText((row.weakTopicNote || row.focusAdvice).slice(0, 26), cols[7] + 10, y + 38);

      y += rowH;
    });

    // Bottom 3D Signature
    draw3DFurkanSignature(ctx, A4_W - 330, A4_H - 210, '#0f172a', '#f59e0b');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.font = '700 15px "DM Sans", sans-serif';
    ctx.fillText(
      `PANO ASMA VE VELİ BİLGİLENDİRME RESMİ SIRALAMASI · ${params.cover.signatureName} (${params.cover.signatureTitle})`,
      58,
      A4_H - 135
    );

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(34, A4_H - 90, A4_W - 68, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${params.academyName} · Kurum Kodu: ${params.institutionCode8} · ÇOĞALTILAMAZ · Sayfa ${p + 1}/${totalPages}`,
      A4_W / 2,
      A4_H - 56
    );

    const img = await pdfDoc.embedPng(await canvasToPngBytes(canvas));
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return pdfDoc.save();
}

/**
 * Bilgisayarda Herhangi Bir Tarayıcıda Açılabilen İnteraktif Haftalık Karşılaştırma & Veli Karnesi HTML Dosyası
 */
export function buildWeeklyPcStandaloneHtml(params: {
  rows: WeeklyComparisonRow[];
  academyName: string;
  institutionCode8: string;
  kts1Name: string;
  kts2Name: string;
  kts1QuestionCount: number;
  kts2QuestionCount: number;
  gradeLabel: string;
  signatureName: string;
}): string {
  const rowsJson = JSON.stringify(params.rows);
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.academyName} — Haftalık Liste Analizi (${params.kts1Name} vs ${params.kts2Name})</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 28px; background: #f1f5f9; color: #0f172a; }
    .wrap { max-width: 1180px; margin: 0 auto; background: #fff; border-radius: 16px; border: 1px solid #cbd5e1; padding: 28px; box-shadow: 0 12px 28px rgba(15,23,42,.08); }
    .hero { background: linear-gradient(135deg,#0f172a,#1d4ed8,#0d9488); color:#fff; padding:24px; border-radius:12px; margin-bottom:22px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
    .podium { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-bottom:22px; }
    .pod-card { border-radius:12px; padding:16px; border:2px solid #cbd5e1; background:#f8fafc; display:flex; align-items:center; gap:12px; }
    .medal { width:44px; height:44px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; flex-shrink:0; }
    .m1 { background:linear-gradient(135deg,#fef08a,#f59e0b); color:#78350f; border:2px solid #d97706; }
    .m2 { background:linear-gradient(135deg,#f8fafc,#cbd5e1); color:#1e293b; border:2px solid #64748b; }
    .m3 { background:linear-gradient(135deg,#fed7aa,#ea580c); color:#431407; border:2px solid #9a3412; }
    .toolbar { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
    input { padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; min-width:260px; font-size:14px; }
    button { background:#1d4ed8; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:700; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:13.5px; }
    th, td { border-bottom:1px solid #e2e8f0; padding:10px 12px; text-align:left; }
    th { background:#0f172a; color:#fff; }
    .pos { color:#059669; font-weight:700; }
    .neg { color:#e11d48; font-weight:700; }
    .foot { margin-top:24px; padding-top:14px; border-top:1px solid #cbd5e1; display:flex; justify-content:space-between; font-size:12.5px; color:#475569; }
    @media print { .toolbar button, input { display:none; } body { padding:0; background:#fff; } .wrap { box-shadow:none; border:none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1 style="margin:0 0 6px;font-size:24px">${params.academyName} — Haftalık Sıralı Liste Analizi</h1>
        <div style="opacity:.9;font-size:14px">${params.gradeLabel} · ${params.kts1Name} (${params.kts1QuestionCount} Soru) vs ${params.kts2Name} (${params.kts2QuestionCount} Soru) · Kurum: ${params.institutionCode8}</div>
      </div>
      <div style="font-weight:700">Onay: ${params.signatureName}</div>
    </div>
    <div id="podium" class="podium"></div>
    <div class="toolbar">
      <input id="searchBox" type="text" placeholder="Öğrenci adı, no veya durum ara..." />
      <button onclick="window.print()">Pano İçin Yazdır / PDF Yap</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Sıra</th><th>Öğrenci</th><th>Şube</th><th>${params.kts1Name}</th><th>${params.kts2Name}</th><th>Fark</th><th>Başarı %</th><th>Durum & Tavsiye</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div class="foot">
      <span>Doğruluk Akademi Bilgisayar Uyumlu Rapor</span>
      <span>ÇOĞALTILAMAZ · ${params.academyName} (${params.institutionCode8})</span>
    </div>
  </div>
  <script>
    const rows = ${rowsJson};
    const podium = document.getElementById('podium');
    podium.innerHTML = rows.slice(0,3).map((r,i) =>
      '<div class="pod-card"><div class="medal m'+(i+1)+'">'+(i+1)+'</div><div><strong>'+r.studentName+'</strong><div style="font-size:12px;color:#475569">'+r.classroom+' · '+r.kts2Score.toFixed(1)+' Puan · '+r.kts2Net.toFixed(1)+' Net</div></div></div>'
    ).join('');
    function render(filter) {
      const q = (filter || '').toLowerCase();
      const filtered = rows.filter(r => !q || r.studentName.toLowerCase().includes(q) || r.studentNumber8.includes(q) || r.status.toLowerCase().includes(q));
      document.getElementById('tbody').innerHTML = filtered.map(r => {
        const badge = r.top3Badge ? '<span class="medal m'+r.top3Badge+'" style="width:28px;height:28px;font-size:13px">'+r.top3Badge+'</span>' : '<strong>'+r.rank+'.</strong>';
        const dCls = r.scoreDelta >= 0 ? 'pos' : 'neg';
        const sign = r.scoreDelta >= 0 ? '+' : '';
        return '<tr><td>'+badge+'</td><td><strong>'+r.studentName+'</strong><br><small>'+r.studentNumber8+'</small></td><td>'+r.classroom+'</td><td>'+r.kts1Score.toFixed(1)+'p ('+r.kts1Net.toFixed(1)+'n)</td><td><strong>'+r.kts2Score.toFixed(1)+'p ('+r.kts2Net.toFixed(1)+'n)</strong></td><td class="'+dCls+'">'+sign+r.scoreDelta.toFixed(1)+'p</td><td><strong>%'+r.successPct+'</strong></td><td><strong>'+r.status+'</strong><br><small>'+r.focusAdvice+'</small></td></tr>';
      }).join('');
    }
    render('');
    document.getElementById('searchBox').addEventListener('input', e => render(e.target.value));
  </script>
</body>
</html>`;
}

/**
 * Bilgisayarda Açılabilir Tam Haftalık Paket ZIP (Pano PDF + Excel + PC HTML + Veli Mesajları)
 */
export async function generateWeeklyFullPcZip(params: {
  rows: WeeklyComparisonRow[];
  academyName: string;
  institutionCode8: string;
  kts1Name: string;
  kts2Name: string;
  kts1QuestionCount: number;
  kts2QuestionCount: number;
  gradeProfile: GradeProfile;
  cover: CoverConfig;
  parentMessagesText: string;
}): Promise<Blob> {
  const zip = new JSZip();
  const rankingPdf = await generateWeeklyRankingPdf(params);
  const excelBlob = buildWeeklyComparisonWorkbookBlob({
    rows: params.rows,
    academyName: params.academyName,
    kts1Name: params.kts1Name,
    kts2Name: params.kts2Name,
    gradeLabel: params.gradeProfile.shortLabel,
  });
  const htmlStr = buildWeeklyPcStandaloneHtml({
    rows: params.rows,
    academyName: params.academyName,
    institutionCode8: params.institutionCode8,
    kts1Name: params.kts1Name,
    kts2Name: params.kts2Name,
    kts1QuestionCount: params.kts1QuestionCount,
    kts2QuestionCount: params.kts2QuestionCount,
    gradeLabel: params.gradeProfile.shortLabel,
    signatureName: params.cover.signatureName,
  });

  zip.file('01_Haftalik_Liste_Bilgisayarda_Ac.html', htmlStr);
  zip.file('02_Pano_Asma_Sirali_Liste.pdf', rankingPdf);
  zip.file('03_Haftalik_Karsilastirma_Excel.xlsx', excelBlob);
  zip.file('04_Toplu_Veli_Mesajlari.txt', '\uFEFF' + params.parentMessagesText);

  return zip.generateAsync({ type: 'blob' });
}

/**
 * 3D Başarı Rozeti & Onur Kartı PNG Oluşturucu (Velilere Paylaşım & Pano İçin)
 */
export async function generateAchievementBadgePng(params: {
  row: WeeklyComparisonRow;
  academyName: string;
  institutionCode8: string;
  kts1Name: string;
  kts2Name: string;
  gradeLabel: string;
  cover: CoverConfig;
  isRisingStar?: boolean;
}): Promise<Blob> {
  const { row, academyName, institutionCode8, kts1Name, kts2Name, gradeLabel, cover, isRisingStar } = params;
  const preset = getLogoPreset(cover.logoStyleId);
  const W = 1200;
  const H = 760;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Rich ceremonial gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.55, preset.secondaryColor);
  bg.addColorStop(1, preset.primaryColor);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Ornamental gold border
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 6;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, W - 84, H - 84);

  // Left circular medal or star emblem
  drawAcademyCrestCanvas(ctx, 130, 118, 42, preset);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(academyName.toUpperCase(), 196, 108);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText(`${gradeLabel} · KURUM KODU: ${institutionCode8}`, 196, 142);

  // Right Top Ribbon Tag
  const badgeTitle = row.top3Badge
    ? `${row.top3Badge}. DERECE BAŞARI ROZETİ`
    : isRisingStar
      ? 'HAFTANIN YÜKSELİŞ YILDIZI'
      : 'ÜSTÜN GAYRET & GELİŞİM ROZETİ';

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(W - 430, 80, 360, 56);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(badgeTitle, W - 250, 115);

  // Center Medal Circle + Student Name
  const medalRank = row.top3Badge ?? 1;
  if (row.top3Badge) {
    drawTop3MedalCanvas(ctx, 185, 360, 86, medalRank);
  } else {
    ctx.beginPath();
    ctx.arc(185, 360, 82, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${row.rank}.`, 185, 374);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 20px "DM Sans", sans-serif';
  ctx.fillText('BAŞARI VE ONUR BELGESİ SAHİBİ', 310, 275);

  ctx.fillStyle = '#ffffff';
  drawFittedSingleLineText(
    ctx,
    row.studentName.toLocaleUpperCase('tr-TR'),
    310,
    336,
    820,
    '800',
    '"Plus Jakarta Sans", sans-serif',
    50,
    24
  );

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText(`Öğrenci No: ${row.studentNumber8} · Şube: ${row.classroom}`, 310, 378);

  // Metrics Box
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(310, 415, 815, 130);
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(310, 415, 815, 130);

  const deltaSign = row.scoreDelta >= 0 ? '+' : '';
  const stats = [
    { k: kts1Name.slice(0, 16), v: `${row.kts1Score.toFixed(1)} Puan (${row.kts1Net.toFixed(1)}n)` },
    { k: kts2Name.slice(0, 16), v: `${row.kts2Score.toFixed(1)} Puan (${row.kts2Net.toFixed(1)}n)` },
    { k: 'GELİŞİM & BAŞARI', v: `${deltaSign}${row.scoreDelta.toFixed(1)}p · %${row.successPct}` },
  ];
  stats.forEach((st, i) => {
    const sx = 338 + i * 268;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#93c5fd';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.fillText(st.k.toUpperCase(), sx, 456);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 26px "JetBrains Mono", monospace';
    ctx.fillText(st.v, sx, 505);
  });

  // Bottom signature & security note
  draw3DFurkanSignature(ctx, 880, 580, '#ffffff', '#fbbf24');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 18px "DM Sans", sans-serif';
  ctx.fillText(`Durum: ${row.status} · ${row.focusAdvice.slice(0, 62)}`, 74, 640);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 16px "DM Sans", sans-serif';
  ctx.fillText(`${cover.signatureName} (${cover.signatureTitle}) · ${academyName}`, 74, 684);

  return canvasToBlobSafe(canvas, 'image/png');
}

export async function generateOpenEndedExamPdf(params: {
  cover: CoverConfig;
  gradeProfile: GradeProfile;
  questions: OpenEndedQuestion[];
  includeSolutionKey?: boolean;
}): Promise<Uint8Array> {
  const { cover, gradeProfile, questions, includeSolutionKey = true } = params;
  const preset = getLogoPreset(cover.logoStyleId);
  const pdfDoc = await PDFDocument.create();

  const renderPage = async (chunk: OpenEndedQuestion[], pageNum: number, isKeyPage: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Header bar
    ctx.fillStyle = preset.primaryColor;
    ctx.fillRect(0, 0, A4_W, 118);
    drawAcademyCrestCanvas(ctx, 74, 59, 32, preset);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `${cover.academyName} — ${gradeProfile.shortLabel} ${isKeyPage ? 'Açık Uçlu Çözüm & Rubrik Anahtarı' : '10 Soruluk Açık Uçlu Yazılı'}`,
      128,
      54
    );
    ctx.fillStyle = '#dbeafe';
    ctx.font = '600 17px "DM Sans", sans-serif';
    ctx.fillText(
      `Ad Soyad: ........................................   Öğrenci No: ....................   Kurum Kodu: ${cover.institutionCode8 || '--------'}`,
      128,
      92
    );

    let y = 160;
    chunk.forEach((q) => {
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      const boxH = isKeyPage ? 210 : 275;
      ctx.beginPath();
      ctx.roundRect(60, y, A4_W - 120, boxH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = preset.primaryColor;
      ctx.font = '800 19px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`Soru ${q.number} (${q.subject} · ${q.maxPoints} Puan)`, 84, y + 34);

      ctx.fillStyle = '#0f172a';
      ctx.font = '500 18px "DM Sans", sans-serif';
      const stemLines = wrapTextLines(ctx, q.prompt, A4_W - 168).slice(0, 4);
      stemLines.forEach((line, li) => {
        ctx.fillText(line, 84, y + 66 + li * 25);
      });

      if (isKeyPage) {
        ctx.fillStyle = '#065f46';
        ctx.font = '700 16px "DM Sans", sans-serif';
        ctx.fillText('Örnek Çözüm / Puanlama Rubriği:', 84, y + 148);
        ctx.fillStyle = '#047857';
        ctx.font = '500 16px "DM Sans", sans-serif';
        const ansLines = wrapTextLines(ctx, q.modelAnswer, A4_W - 168).slice(0, 2);
        ansLines.forEach((line, li) => {
          ctx.fillText(line, 84, y + 174 + li * 22);
        });
      } else {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        for (let lineIdx = 0; lineIdx < 3; lineIdx++) {
          const ly = y + 175 + lineIdx * 32;
          ctx.beginPath();
          ctx.moveTo(84, ly);
          ctx.lineTo(A4_W - 84, ly);
          ctx.stroke();
        }
      }

      y += boxH + 22;
    });

    // Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px "DM Sans", sans-serif';
    ctx.fillText(
      `${cover.signatureName} (${cover.signatureTitle}) · ${cover.securityNotice} · Sayfa ${pageNum}`,
      60,
      A4_H - 42
    );

    drawCanvasWatermark(ctx, A4_W, A4_H, cover.watermark, {
      colorHex: preset.secondaryColor,
      isSampleDemo: Boolean(cover.isSampleDemo),
      isCoverOrBack: false,
      headerY: 138,
      footerY: A4_H - 18,
    });

    const pngBytes = await canvasToEncodedBytes(canvas, 'image/png');
    const img = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    await yieldToMainThread();
  };

  let pNum = 1;
  for (let i = 0; i < questions.length; i += 5) {
    await renderPage(questions.slice(i, i + 5), pNum++, false);
  }
  if (includeSolutionKey) {
    for (let i = 0; i < questions.length; i += 6) {
      await renderPage(questions.slice(i, i + 6), pNum++, true);
    }
  }

  return await pdfDoc.save();
}

export interface ParentInformationReportPdfInput {
  analysis: ExamAnalysisResult;
  cover: CoverConfig;
  gradeProfile: GradeProfile;
  hasLiveAnalysis?: boolean;
  institutionName?: string;
  institutionCode8?: string;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  nextStudyEvent?: NextStudySessionSummary | null;
  parentMessage?: string;
  qrCodeDataUrl?: string;
  digitalKarneUrl?: string;
  previewOnly?: boolean;
}

/**
 * Kapsamlı 2 Sayfalık A4 Veli Bilgilendirme Raporu (PDF)
 */
export async function generateParentInformationReportPdf(
  input: ParentInformationReportPdfInput
): Promise<{
  bytes: Uint8Array;
  filename: string;
  report: ParentReportData;
  pageDataUrls: string[];
}> {
  const {
    analysis,
    cover,
    gradeProfile,
    hasLiveAnalysis = true,
    institutionName,
    institutionCode8,
    openEndedAnalysis = null,
    nextStudyEvent = null,
    parentMessage,
    qrCodeDataUrl,
  } = input;

  const effectiveInstitution = (institutionName || cover.academyName || 'Doğruluk Akademi').trim();
  const effectiveCode8 = (institutionCode8 || cover.institutionCode8 || '48291045').trim();
  const preset = getLogoPreset(cover.logoStyleId);
  const showSampleStamp = Boolean(cover.isSampleDemo);

  const report = buildParentInformationReportData({
    analysis,
    gradeProfile,
    institutionName: effectiveInstitution,
    institutionCode8: effectiveCode8,
    examDate: cover.examDate,
    hasLiveAnalysis,
    openEndedAnalysis,
    nextStudyEvent,
    parentMessage,
  });

  // ==================== SAYFA 1: VELİ ÖZETİ, DERS PERFORMANSI & GELİŞİM GRAFİĞİ ====================
  const c1 = document.createElement('canvas');
  c1.width = A4_W;
  c1.height = A4_H;
  const ctx1 = c1.getContext('2d')!;

  ctx1.fillStyle = '#f8fafc';
  ctx1.fillRect(0, 0, A4_W, A4_H);
  ctx1.fillStyle = '#ffffff';
  ctx1.fillRect(24, 24, A4_W - 48, A4_H - 48);
  ctx1.strokeStyle = preset.secondaryColor;
  ctx1.lineWidth = 4;
  ctx1.strokeRect(34, 34, A4_W - 68, A4_H - 68);

  // Header band
  const hGrad1 = ctx1.createLinearGradient(34, 34, A4_W - 34, 178);
  hGrad1.addColorStop(0, '#0f172a');
  hGrad1.addColorStop(0.55, preset.secondaryColor);
  hGrad1.addColorStop(1, '#047857');
  ctx1.fillStyle = hGrad1;
  ctx1.fillRect(34, 34, A4_W - 68, 144);
  ctx1.fillStyle = preset.goldColor;
  ctx1.fillRect(34, 178, A4_W - 68, 6);

  drawAcademyCrestCanvas(ctx1, 108, 106, 42, preset);

  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '800 30px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText(`${report.institutionName.toUpperCase()} — VELİ BİLGİLENDİRME RAPORU`, 172, 90, A4_W - 230);
  ctx1.fillStyle = '#d1fae5';
  ctx1.font = '700 17.5px "DM Sans", sans-serif';
  ctx1.fillText(
    `${report.gradeLabel} · ${report.penaltyRuleText}`,
    172,
    124,
    A4_W - 230
  );
  ctx1.fillStyle = '#fde68a';
  ctx1.font = '700 15.5px "JetBrains Mono", monospace';
  ctx1.fillText(
    `KURUM KODU: ${report.institutionCode8} · RAPOR TARİHİ: ${report.examDate} · ${report.dataModeLabel.toUpperCase()}`,
    172,
    154,
    A4_W - 230
  );

  // Parent greeting & student summary box
  ctx1.fillStyle = 'rgba(15, 23, 42, 0.08)';
  ctx1.fillRect(64, 210, A4_W - 116, 130);
  ctx1.fillStyle = '#f0fdf4';
  ctx1.fillRect(58, 204, A4_W - 116, 130);
  ctx1.fillStyle = '#059669';
  ctx1.fillRect(58, 204, 10, 130);
  ctx1.strokeStyle = '#86efac';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(58, 204, A4_W - 116, 130);

  const parentSummaryMaxW = qrCodeDataUrl
    ? report.metrics.academyRank >= 1 && report.metrics.academyRank <= 3 && hasLiveAnalysis
      ? A4_W - 360
      : A4_W - 280
    : A4_W - 260;

  ctx1.textAlign = 'left';
  ctx1.fillStyle = '#065f46';
  ctx1.font = '700 15px "DM Sans", sans-serif';
  ctx1.fillText('SAYIN VELİMİZ, ÖĞRENCİMİZİN GÜNCEL AKADEMİK GELİŞİM ÖZETİ', 86, 234, parentSummaryMaxW);

  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx1.fillText(report.studentName, 86, 270, parentSummaryMaxW);

  ctx1.fillStyle = '#334155';
  ctx1.font = '600 17px "DM Sans", sans-serif';
  ctx1.fillText(
    `Öğrenci No: ${report.studentNumber}   ·   Sınıf/Şube: ${report.classroom}   ·   Düzey: ${report.gradeShortLabel}   ·   Durum: ${report.developmentStatus}`,
    86,
    300,
    parentSummaryMaxW
  );
  ctx1.fillStyle = '#047857';
  ctx1.font = '700 15.5px "DM Sans", sans-serif';
  ctx1.fillText(`Değerlendirilen Sınav: ${report.examTitle}`, 86, 324, parentSummaryMaxW);

  if (report.metrics.academyRank >= 1 && report.metrics.academyRank <= 3 && hasLiveAnalysis) {
    drawTop3MedalCanvas(
      ctx1,
      qrCodeDataUrl ? A4_W - 216 : A4_W - 116,
      269,
      32,
      report.metrics.academyRank as 1 | 2 | 3
    );
  }
  await drawQrBadgeOnCanvas(ctx1, A4_W - 164, 211, 86, qrCodeDataUrl, 'Dijital Karne QR');

  // 4 Key KPI Cards
  const kpiW = (A4_W - 116 - 48) / 4;
  const netSign = report.metrics.netDelta >= 0 ? '+' : '';
  const scoreSign = report.metrics.scoreDelta >= 0 ? '+' : '';
  const kpis = [
    {
      label: 'TOPLAM NET',
      value: report.metrics.totalNet.toFixed(2),
      sub: `${report.metrics.totalCorrect}D · ${report.metrics.totalWrong}Y · ${report.metrics.totalBlank}B (${netSign}${report.metrics.netDelta.toFixed(2)})`,
      bg: '#eff6ff',
      accent: '#1d4ed8',
      shadow: '#bfdbfe',
    },
    {
      label: 'TAHMİNİ PUAN',
      value: `${report.metrics.estimatedScore.toFixed(1)}`,
      sub: `Azami ${report.metrics.maxScore} Puan (${scoreSign}${report.metrics.scoreDelta.toFixed(1)}p)`,
      bg: '#ecfdf5',
      accent: '#059669',
      shadow: '#a7f3d0',
    },
    {
      label: 'BAŞARI & SIRALAMA',
      value: `%${report.metrics.successPct}`,
      sub:
        report.metrics.academySize > 0
          ? `Kurum: ${report.metrics.academyRank}/${report.metrics.academySize} · Şube: ${report.metrics.classRank}/${report.metrics.classSize}`
          : 'Kurum: Deneme bekleniyor',
      bg: '#eef2ff',
      accent: '#4338ca',
      shadow: '#c7d2fe',
    },
    {
      label: 'SONRAKİ HEDEF',
      value: `${report.metrics.targetNet.toFixed(1)} Net`,
      sub:
        report.metrics.academySize > 0
          ? `Hedef Puan: ${report.metrics.targetScore.toFixed(1)} · Üst %${Math.max(1, 100 - report.metrics.percentile).toFixed(0)}`
          : `Hedef Puan: ${report.metrics.targetScore.toFixed(1)}`,
      bg: '#fffbeb',
      accent: '#d97706',
      shadow: '#fde68a',
    },
  ];

  kpis.forEach((k, idx) => {
    const kx = 58 + idx * (kpiW + 16);
    const ky = 356;
    ctx1.fillStyle = k.shadow;
    ctx1.fillRect(kx + 4, ky + 5, kpiW, 114);
    ctx1.fillStyle = k.bg;
    ctx1.fillRect(kx, ky, kpiW, 114);
    ctx1.fillStyle = k.accent;
    ctx1.fillRect(kx, ky, kpiW, 7);
    ctx1.strokeStyle = k.accent;
    ctx1.lineWidth = 2;
    ctx1.strokeRect(kx, ky, kpiW, 114);

    ctx1.fillStyle = '#334155';
    ctx1.font = '700 13.5px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(k.label, kx + 16, ky + 32);
    ctx1.fillStyle = k.accent;
    ctx1.font = '800 30px "Plus Jakarta Sans", sans-serif';
    ctx1.fillText(k.value, kx + 16, ky + 72);
    ctx1.fillStyle = '#475569';
    ctx1.font = '600 12.5px "DM Sans", sans-serif';
    ctx1.fillText(k.sub.slice(0, 34), kx + 16, ky + 99);
  });

  // Overall Exam Success Progress Bar + 5-Star Rating Banner
  const hasAnyEvaluatedData = hasLiveAnalysis || Boolean(!hasLiveAnalysis && openEndedAnalysis);
  drawKarneSuccessBanner(ctx1, {
    x: 58,
    y: 482,
    w: A4_W - 116,
    h: 78,
    successPct: report.metrics.successPct,
    hasExamData: hasAnyEvaluatedData,
    title: 'SINAV BAŞARI İLERLEMESİ & YILDIZ PUANI',
  });

  // 1. Ders Bazlı Başarı Tablosu
  let y1 = 590;
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx1.textAlign = 'left';
  ctx1.fillText('1. DERS BAZLI BAŞARI, İLERLEME ÇUBUĞU VE YILDIZ DEĞERLENDİRMESİ', 58, y1);
  y1 += 14;

  const colOffsets = [58, 252, 314, 378, 442, 506, 586, 690, 862, 1182];
  const headers = [
    'Ders Adı',
    'Soru',
    'Doğru',
    'Yanlış',
    'Boş',
    'Net',
    'Kurum Ort.',
    'Başarı & İlerleme',
    'Yıldız & Durum',
  ];
  const tblGrad = ctx1.createLinearGradient(58, y1, A4_W - 58, y1 + 38);
  tblGrad.addColorStop(0, '#0f172a');
  tblGrad.addColorStop(1, '#047857');
  ctx1.fillStyle = tblGrad;
  ctx1.fillRect(58, y1, A4_W - 116, 38);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '700 13.5px "DM Sans", sans-serif';
  headers.forEach((h, i) => {
    const isTextCol = i === 0 || i === 7 || i === 8;
    ctx1.textAlign = isTextCol ? 'left' : 'right';
    const tx = i === 0 ? colOffsets[0] + 12 : i === 7 || i === 8 ? colOffsets[i] + 12 : colOffsets[i + 1] - 10;
    ctx1.fillText(h, tx, y1 + 24);
  });
  y1 += 38;

  report.subjectRows.slice(0, 8).forEach((s, idx) => {
    const rowH = 38;
    ctx1.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx1.fillRect(58, y1, A4_W - 116, rowH);
    ctx1.strokeStyle = '#cbd5e1';
    ctx1.lineWidth = 1;
    ctx1.strokeRect(58, y1, A4_W - 116, rowH);

    ctx1.fillStyle = '#0f172a';
    ctx1.font = '700 14px "DM Sans", sans-serif';
    ctx1.textAlign = 'left';
    ctx1.fillText(s.subject.slice(0, 21), colOffsets[0] + 12, y1 + 24);

    const vals = [
      String(s.total),
      String(s.correct),
      String(s.wrong),
      String(s.blank),
      s.net.toFixed(2),
      s.academyAvgNet.toFixed(2),
    ];
    vals.forEach((v, vi) => {
      ctx1.textAlign = 'right';
      ctx1.fillStyle =
        vi === 4 ? '#1d4ed8' : vi === 1 ? '#059669' : vi === 2 ? '#e11d48' : '#334155';
      ctx1.font = vi === 4 ? '800 14px "JetBrains Mono", monospace' : '600 14px "JetBrains Mono", monospace';
      ctx1.fillText(v, colOffsets[vi + 2] - 10, y1 + 24);
    });

    const subjVisual = resolveSubjectProgressVisual(s.accuracyPct, hasAnyEvaluatedData);

    // Col 7: Inline Graphical Progress Bar + Percentage
    drawInlineProgressBar(ctx1, {
      x: colOffsets[7] + 12,
      y: y1 + 14,
      w: 98,
      h: 10,
      pct: s.accuracyPct,
      visual: subjVisual,
    });
    ctx1.textAlign = 'right';
    ctx1.fillStyle = subjVisual.accentColor;
    ctx1.font = '800 13.5px "JetBrains Mono", monospace';
    ctx1.fillText(`%${s.accuracyPct}`, colOffsets[8] - 10, y1 + 24);

    // Col 8: 5 Vector Stars + Tier Pill (Başarılı / Gelişmekte / Tekrar)
    drawStarRatingRow(ctx1, {
      x: colOffsets[8] + 12,
      cy: y1 + 19,
      stars: subjVisual.stars,
      maxStars: 5,
      radius: 5.5,
      gap: 3,
      fillColor: subjVisual.starFillColor,
      emptyColor: subjVisual.starEmptyColor,
      label: `${subjVisual.stars}/5`,
      labelColor: '#475569',
      labelFont: '700 11.5px "JetBrains Mono", monospace',
    });

    drawTierPillBadge(ctx1, {
      x: colOffsets[9] - 166,
      y: y1 + 8,
      w: 154,
      h: 22,
      visual: subjVisual,
      text: subjVisual.label.toUpperCase(),
      fontSize: 10,
    });

    y1 += rowH;
  });

  // 2. Dönemsel Net Gelişim Çizelgesi (Canvas Chart)
  y1 += 32;
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx1.textAlign = 'left';
  ctx1.fillText('2. DÖNEMSEL NET GELİŞİM ÇİZELGESİ VE HEDEF PROJEKSİYONU', 58, y1);
  y1 += 14;

  const chartBoxY = y1;
  const chartBoxH = Math.max(260, A4_H - 115 - chartBoxY);
  ctx1.fillStyle = '#f8fafc';
  ctx1.fillRect(58, chartBoxY, A4_W - 116, chartBoxH);
  ctx1.strokeStyle = '#cbd5e1';
  ctx1.lineWidth = 2;
  ctx1.strokeRect(58, chartBoxY, A4_W - 116, chartBoxH);

  // Legend
  ctx1.fillStyle = '#1d4ed8';
  ctx1.fillRect(82, chartBoxY + 18, 18, 12);
  ctx1.fillStyle = '#0f172a';
  ctx1.font = '700 14px "DM Sans", sans-serif';
  ctx1.fillText('Öğrenci Neti', 108, chartBoxY + 29);

  ctx1.fillStyle = '#10b981';
  ctx1.fillRect(240, chartBoxY + 18, 18, 12);
  ctx1.fillStyle = '#0f172a';
  ctx1.fillText('Kurum Ortalaması', 266, chartBoxY + 29);

  ctx1.strokeStyle = '#d97706';
  ctx1.lineWidth = 3;
  ctx1.setLineDash([8, 6]);
  ctx1.beginPath();
  ctx1.moveTo(435, chartBoxY + 24);
  ctx1.lineTo(468, chartBoxY + 24);
  ctx1.stroke();
  ctx1.setLineDash([]);
  ctx1.fillStyle = '#92400e';
  ctx1.fillText(`Hedef Net (${report.metrics.targetNet.toFixed(1)})`, 476, chartBoxY + 29);

  const plotX = 128;
  const plotY = chartBoxY + 56;
  const plotW = A4_W - 116 - 112;
  const plotH = chartBoxH - 112;
  const maxChartNet = Math.max(
    10,
    report.metrics.totalQuestions,
    ...report.trendSeries.map((t) => Math.max(t.studentNet, t.academyAvgNet, t.targetNet))
  );

  // Gridlines
  for (let gi = 0; gi <= 4; gi++) {
    const val = (maxChartNet * gi) / 4;
    const gy = plotY + plotH - (gi / 4) * plotH;
    ctx1.strokeStyle = '#e2e8f0';
    ctx1.lineWidth = 1;
    ctx1.beginPath();
    ctx1.moveTo(plotX, gy);
    ctx1.lineTo(plotX + plotW, gy);
    ctx1.stroke();

    ctx1.fillStyle = '#64748b';
    ctx1.font = '600 12.5px "JetBrains Mono", monospace';
    ctx1.textAlign = 'right';
    ctx1.fillText(val.toFixed(0), plotX - 12, gy + 4);
  }

  // Target dashed line
  const targetY = plotY + plotH - (report.metrics.targetNet / maxChartNet) * plotH;
  ctx1.strokeStyle = '#d97706';
  ctx1.lineWidth = 2;
  ctx1.setLineDash([8, 6]);
  ctx1.beginPath();
  ctx1.moveTo(plotX, targetY);
  ctx1.lineTo(plotX + plotW, targetY);
  ctx1.stroke();
  ctx1.setLineDash([]);

  const count = Math.max(1, report.trendSeries.length);
  const slotW = plotW / count;
  const barW = Math.min(44, slotW * 0.28);

  report.trendSeries.forEach((pt, idx) => {
    const cx = plotX + idx * slotW + slotW / 2;
    const stuH = Math.max(4, (pt.studentNet / maxChartNet) * plotH);
    const avgH = Math.max(4, (pt.academyAvgNet / maxChartNet) * plotH);

    // Student bar
    ctx1.fillStyle = pt.isProjected ? '#60a5fa' : pt.isCurrent ? '#0f172a' : '#1d4ed8';
    ctx1.fillRect(cx - barW - 3, plotY + plotH - stuH, barW, stuH);

    // Academy bar
    ctx1.fillStyle = '#10b981';
    ctx1.fillRect(cx + 3, plotY + plotH - avgH, barW, avgH);

    // Value label above student bar
    ctx1.fillStyle = '#0f172a';
    ctx1.font = '800 13px "JetBrains Mono", monospace';
    ctx1.textAlign = 'center';
    ctx1.fillText(pt.studentNet.toFixed(1), cx - barW / 2 - 3, plotY + plotH - stuH - 8);

    // X label
    ctx1.fillStyle = pt.isCurrent ? '#0f172a' : '#475569';
    ctx1.font = pt.isCurrent ? '800 13.5px "DM Sans", sans-serif' : '600 13px "DM Sans", sans-serif';
    ctx1.fillText(pt.label, cx, plotY + plotH + 24);
  });

  // Footer Page 1
  ctx1.fillStyle = '#0f172a';
  ctx1.fillRect(34, A4_H - 90, A4_W - 68, 56);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = '700 15.5px "DM Sans", sans-serif';
  ctx1.textAlign = 'center';
  ctx1.fillText(
    showSampleStamp
      ? `${report.institutionName} · Kurum Kodu: ${report.institutionCode8} · VELİ BİLGİLENDİRME RAPORU · ÖRNEKTİR · Sayfa 1 / 2`
      : `${report.institutionName} · Kurum Kodu: ${report.institutionCode8} · RESMİ VELİ BİLGİLENDİRME RAPORU · Sayfa 1 / 2`,
    A4_W / 2,
    A4_H - 56
  );

  // ==================== SAYFA 2: KONU EKSİKLERİ, ETÜT TAKVİMİ & EVDE ÇALIŞMA PLANI ====================
  const c2 = document.createElement('canvas');
  c2.width = A4_W;
  c2.height = A4_H;
  const ctx2 = c2.getContext('2d')!;

  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, A4_W, A4_H);
  ctx2.strokeStyle = preset.secondaryColor;
  ctx2.lineWidth = 4;
  ctx2.strokeRect(34, 34, A4_W - 68, A4_H - 68);

  const hGrad2 = ctx2.createLinearGradient(34, 34, A4_W - 34, 120);
  hGrad2.addColorStop(0, '#0f172a');
  hGrad2.addColorStop(0.55, preset.secondaryColor);
  hGrad2.addColorStop(1, '#047857');
  ctx2.fillStyle = hGrad2;
  ctx2.fillRect(34, 34, A4_W - 68, 86);
  drawAcademyCrestCanvas(ctx2, 88, 77, 28, preset);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '800 23px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(
    `${report.studentName.toUpperCase()} — KONU EKSİKLERİ, ETÜT VE VELİ REHBERİ`,
    134,
    72,
    A4_W - 190
  );
  ctx2.fillStyle = '#fde68a';
  ctx2.font = '700 14.5px "JetBrains Mono", monospace';
  ctx2.fillText(
    `Öğrenci No: ${report.studentNumber} · ${report.gradeShortLabel} · ${report.classroom} · Kurum: ${report.institutionCode8}`,
    134,
    100,
    A4_W - 190
  );

  // 3. Konu Eksikleri ve Kazanım Analizi Tablosu
  let y2 = 158;
  ctx2.fillStyle = '#0f172a';
  ctx2.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('3. ÖNCELİKLİ KONU EKSİKLERİ VE KAZANIM ANALİZİ', 58, y2);
  y2 += 14;

  const tCols = [58, 225, 535, 645, 705, 765, 825, 1005, 1182];
  const tHeaders = ['Ders', 'Konu / Kazanım Başlığı', 'Kod', 'D', 'Y', 'B', 'İlerleme %', 'Başarı Durumu'];
  ctx2.fillStyle = '#0f172a';
  ctx2.fillRect(58, y2, A4_W - 116, 36);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '700 13.5px "DM Sans", sans-serif';
  tHeaders.forEach((h, idx) => {
    const isNum = idx >= 3 && idx <= 5;
    ctx2.textAlign = isNum ? 'right' : 'left';
    const tx = isNum ? tCols[idx + 1] - 10 : idx === 6 || idx === 7 ? tCols[idx] + 10 : tCols[idx] + 10;
    ctx2.fillText(h, tx, y2 + 23);
  });
  y2 += 36;

  if (report.prioritizedTopics.length === 0) {
    const emptyRowH = 44;
    ctx2.fillStyle = '#f8fafc';
    ctx2.fillRect(58, y2, A4_W - 116, emptyRowH);
    ctx2.strokeStyle = '#e2e8f0';
    ctx2.lineWidth = 1;
    ctx2.strokeRect(58, y2, A4_W - 116, emptyRowH);
    ctx2.textAlign = 'center';
    ctx2.fillStyle = '#475569';
    ctx2.font = '600 14px "DM Sans", sans-serif';
    ctx2.fillText(
      'Henüz değerlendirilen deneme sınavı olmadığı için öncelikli konu eksiği kaydı bulunmamaktadır.',
      A4_W / 2,
      y2 + 27
    );
    y2 += emptyRowH;
  } else {
    report.prioritizedTopics.slice(0, 8).forEach((t, idx) => {
      const rowH = 38;
      ctx2.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx2.fillRect(58, y2, A4_W - 116, rowH);
      ctx2.strokeStyle = '#e2e8f0';
      ctx2.lineWidth = 1;
      ctx2.strokeRect(58, y2, A4_W - 116, rowH);

      ctx2.textAlign = 'left';
      ctx2.fillStyle = '#0f172a';
      ctx2.font = '700 13.5px "DM Sans", sans-serif';
      ctx2.fillText(t.subject.slice(0, 18), tCols[0] + 10, y2 + 24);
      ctx2.font = '500 13.5px "DM Sans", sans-serif';
      ctx2.fillText(t.topic.slice(0, 38), tCols[1] + 10, y2 + 24);
      ctx2.fillStyle = '#64748b';
      ctx2.font = '600 12.5px "JetBrains Mono", monospace';
      ctx2.fillText(t.gainCode.slice(0, 13), tCols[2] + 10, y2 + 24);

      const nums = [String(t.correct), String(t.wrong), String(t.blank)];
      nums.forEach((nv, ni) => {
        ctx2.textAlign = 'right';
        ctx2.fillStyle = ni === 0 ? '#047857' : ni === 1 ? '#be123c' : '#0f172a';
        ctx2.font = '700 13.5px "JetBrains Mono", monospace';
        ctx2.fillText(nv, tCols[ni + 4] - 10, y2 + 24);
      });

      const topicVisual = resolveTopicProgressVisual(t.masteryPct);
      drawInlineProgressBar(ctx2, {
        x: tCols[6] + 10,
        y: y2 + 14,
        w: 102,
        h: 10,
        pct: t.masteryPct,
        visual: topicVisual,
      });
      ctx2.textAlign = 'right';
      ctx2.fillStyle = topicVisual.accentColor;
      ctx2.font = '800 13.5px "JetBrains Mono", monospace';
      ctx2.fillText(`%${t.masteryPct}`, tCols[7] - 10, y2 + 24);

      drawTierPillBadge(ctx2, {
        x: tCols[7] + 12,
        y: y2 + 8,
        w: 152,
        h: 22,
        visual: topicVisual,
        text: topicVisual.label.toUpperCase(),
        fontSize: 10,
      });

      y2 += rowH;
    });
  }

  // 4 & 5 Side-by-side: Zorluk/Hata Profili + Etüt Takvimi & Evde Çalışma Planı
  const midY = Math.max(y2 + 28, 540);
  const colW = (A4_W - 116 - 24) / 2;
  const midH = 390;

  // Left card: Zorluk & Hata Profili
  ctx2.fillStyle = '#eff6ff';
  ctx2.fillRect(58, midY, colW, midH);
  ctx2.strokeStyle = '#3b82f6';
  ctx2.lineWidth = 2;
  ctx2.strokeRect(58, midY, colW, midH);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#1e3a8a';
  ctx2.font = '800 18px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('4. ZORLUK DÜZEYİ VE HATA PROFİLİ', 78, midY + 34);

  const diffColors = ['#10b981', '#2563eb', '#f59e0b'];
  report.difficultyMetrics.slice(0, 3).forEach((d, idx) => {
    const dy = midY + 68 + idx * 46;
    const dc = diffColors[idx % diffColors.length];
    ctx2.fillStyle = '#0f172a';
    ctx2.font = '700 14px "DM Sans", sans-serif';
    ctx2.textAlign = 'left';
    ctx2.fillText(`${d.difficulty} Sorular (${d.correct}/${d.total} Doğru)`, 78, dy);
    ctx2.textAlign = 'right';
    ctx2.fillStyle = dc;
    ctx2.fillText(`%${d.successPct}`, 58 + colW - 22, dy);

    ctx2.fillStyle = '#dbeafe';
    ctx2.fillRect(78, dy + 8, colW - 44, 10);
    ctx2.fillStyle = dc;
    ctx2.fillRect(78, dy + 8, ((colW - 44) * d.successPct) / 100, 10);
  });

  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#9f1239';
  ctx2.font = '800 16px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('Hata Nedenleri Özeti:', 78, midY + 225);

  report.errorDistribution.slice(0, 4).forEach((er, idx) => {
    const ey = midY + 255 + idx * 31;
    ctx2.fillStyle = '#334155';
    ctx2.font = '600 14px "DM Sans", sans-serif';
    ctx2.textAlign = 'left';
    ctx2.fillText(`• ${er.label}`, 80, ey);
    ctx2.textAlign = 'right';
    ctx2.fillStyle = '#be123c';
    ctx2.font = '700 14px "JetBrains Mono", monospace';
    ctx2.fillText(`${er.count} soru (%${er.pct})`, 58 + colW - 22, ey);
  });

  // Right card: Bir Sonraki Etüt Tarihi & Evde Destek Planı
  const rightCardX = 58 + colW + 24;
  ctx2.fillStyle = '#ecfdf5';
  ctx2.fillRect(rightCardX, midY, colW, midH);
  ctx2.strokeStyle = '#059669';
  ctx2.lineWidth = 2;
  ctx2.strokeRect(rightCardX, midY, colW, midH);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = '#065f46';
  ctx2.font = '800 18px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('5. ETÜT TAKVİMİ VE EVDE DESTEK PLANI', rightCardX + 20, midY + 34);

  // Highlighted next study box
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(rightCardX + 18, midY + 50, colW - 36, 76);
  ctx2.strokeStyle = '#10b981';
  ctx2.lineWidth = 1.5;
  ctx2.strokeRect(rightCardX + 18, midY + 50, colW - 36, 76);

  ctx2.fillStyle = '#047857';
  ctx2.font = '800 13.5px "DM Sans", sans-serif';
  ctx2.fillText('BİR SONRAKİ ETÜT / TELAFİ RANDEVUSU:', rightCardX + 32, midY + 74);
  ctx2.fillStyle = '#0f172a';
  ctx2.font = '700 14px "DM Sans", sans-serif';
  const etutLines = wrapTextLines(ctx2, report.nextStudySession.summaryLine, colW - 64).slice(0, 2);
  etutLines.forEach((el, idx) => {
    ctx2.fillText(el, rightCardX + 32, midY + 98 + idx * 18);
  });

  ctx2.fillStyle = '#065f46';
  ctx2.font = '800 15px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('Velimiz İçin 4 Adımlık Destek Rehberi:', rightCardX + 20, midY + 154);

  let py = midY + 180;
  report.homeActionPlan.forEach((step, idx) => {
    ctx2.fillStyle = '#1e293b';
    ctx2.font = '500 13.5px "DM Sans", sans-serif';
    const lines = wrapTextLines(ctx2, `${idx + 1}. ${step}`, colW - 44).slice(0, 3);
    lines.forEach((ln) => {
      if (py < midY + midH - 14) {
        ctx2.fillText(ln, rightCardX + 20, py);
        py += 19;
      }
    });
    py += 6;
  });

  // 6. Veliye Özel Akademik Değerlendirme Notu
  const noteY = midY + midH + 26;
  const noteH = 380;
  ctx2.fillStyle = '#f8fafc';
  ctx2.fillRect(58, noteY, A4_W - 116, noteH);
  ctx2.strokeStyle = preset.primaryColor;
  ctx2.lineWidth = 2.5;
  ctx2.strokeRect(58, noteY, A4_W - 116, noteH);

  ctx2.textAlign = 'left';
  ctx2.fillStyle = preset.secondaryColor;
  ctx2.font = '800 19px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText('6. VELİYE ÖZEL AKADEMİK DEĞERLENDİRME VE BİLGİLENDİRME NOTU', 80, noteY + 38);

  ctx2.fillStyle = '#1e293b';
  ctx2.font = '500 16px "DM Sans", sans-serif';
  let ny = noteY + 76;
  const noteParagraphs = report.parentNote.split(/\n+/);
  for (const para of noteParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lines = wrapTextLines(ctx2, trimmed, A4_W - 164);
    for (const ln of lines) {
      if (ny < noteY + noteH - 22) {
        ctx2.fillText(ln, 80, ny);
        ny += 25;
      }
    }
    ny += 6;
  }

  // Bottom 3D Signature & Institutional Footer
  const sigY = 1390;
  ctx2.textAlign = 'left';
  ctx2.fillStyle = preset.secondaryColor;
  ctx2.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(
    showSampleStamp ? 'VELİ BİLGİLENDİRME BELGESİ · ÖRNEKTİR' : 'RESMİ VELİ BİLGİLENDİRME BELGESİ',
    64,
    sigY + 42
  );
  ctx2.fillStyle = '#475569';
  ctx2.font = '600 15.5px "DM Sans", sans-serif';
  ctx2.fillText(
    `${report.institutionName} · Kurum Kodu: ${report.institutionCode8} · ${cover.securityNotice}`,
    64,
    sigY + 72
  );

  await drawQrBadgeOnCanvas(ctx2, A4_W - 510, sigY - 8, 90, qrCodeDataUrl, 'Dijital Karne');

  draw3DFurkanSignature(ctx2, A4_W - 360, sigY - 8, '#0f172a', '#f59e0b');
  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#0f172a';
  ctx2.font = '800 19px "Plus Jakarta Sans", sans-serif';
  ctx2.fillText(`${cover.signatureName} (${cover.signatureTitle})`, A4_W - 240, sigY + 108);

  ctx2.fillStyle = '#0f172a';
  ctx2.fillRect(34, A4_H - 90, A4_W - 68, 56);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '700 15.5px "DM Sans", sans-serif';
  ctx2.fillText(
    showSampleStamp
      ? `${report.institutionName} · Kurum Kodu: ${report.institutionCode8} · VELİ BİLGİLENDİRME RAPORU · ÖRNEKTİR · Sayfa 2 / 2`
      : `${report.institutionName} · Kurum Kodu: ${report.institutionCode8} · RESMİ VELİ BİLGİLENDİRME RAPORU · Sayfa 2 / 2`,
    A4_W / 2,
    A4_H - 56
  );

  if (input.previewOnly) {
    return {
      bytes: new Uint8Array(0),
      filename: report.safeFilename,
      report,
      pageDataUrls: [c1.toDataURL('image/jpeg', 0.92), c2.toDataURL('image/jpeg', 0.92)],
    };
  }

  const pageDataUrls = [c1.toDataURL('image/png'), c2.toDataURL('image/png')];
  const pdfDoc = await PDFDocument.create();
  for (const dataUrl of pageDataUrls) {
    const pngBytes = dataUrlToUint8Array(dataUrl);
    const img = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return {
    bytes: await pdfDoc.save(),
    filename: report.safeFilename,
    report,
    pageDataUrls,
  };
}


