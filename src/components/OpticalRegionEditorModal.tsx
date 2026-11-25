import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Camera,
  Contrast,
  Crop,
  Download,
  Loader2,
  Maximize2,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { BookletCode } from '../types/academy';
import { triggerDownload } from '../utils/downloadHelpers';
import {
  applyCropHandleDrag,
  clampCropRect,
  computePixelCropRect,
  computeRotatedDimensions,
  createCropRectFromPoints,
  CropDragHandle,
  DEFAULT_CROP_RECT,
  formatCropRegionSummary,
  FULL_CROP_RECT,
  ImageRotationDeg,
  NormalizedCropRect,
  normalizeRotationDeg,
} from '../utils/opticalRegionEditor';

export interface UploadedKeyImageAsset {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

interface OpticalRegionEditorModalProps {
  open: boolean;
  initialImage: UploadedKeyImageAsset | null;
  targetBooklet: BookletCode;
  visibleBooklets: BookletCode[];
  expectedCount: number;
  optionCount: 4 | 5;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onChangeImage?: (img: UploadedKeyImageAsset) => void;
  onScanCroppedRegion: (params: {
    base64: string;
    mimeType: string;
    fileName: string;
    targetBooklet: BookletCode;
    regionSummary: string;
  }) => Promise<void>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Görsel dosyası okunamadı.'));
    reader.readAsDataURL(file);
  });
}

function createSampleAnswerKeySheetDataUrl(
  booklet: BookletCode,
  expectedCount: number,
  optionCount: 4 | 5
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Paper background with noisy header/footer clutter so cropping makes clear sense
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top publisher banner noise (outside answer key box)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(28, 24, 864, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('DOĞRULUK AKADEMİ · HARİCİ YAYIN DENEMESİ KAPAK SAYFASI', 48, 58);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Not: Alt kısımdaki kutulu cevap anahtarı alanını bölge editörü ile seçebilirsiniz.', 48, 82);

  // Left sidebar decorative instructions (noise)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(28, 118, 210, 480);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('SINAV YÖNERGESİ', 44, 150);
  ctx.font = '12px sans-serif';
  const notes = [
    '• Süre: 80 Dakika',
    '• Yanlış Doğruyu Götürür',
    '• Kitapçık İşaretleme',
    '• Kurumsal Optik Kod',
    '• Örnek Sayfa Bilgisi',
  ];
  notes.forEach((line, idx) => {
    ctx.fillText(line, 44, 184 + idx * 28);
  });

  // Main Answer Key Box (inside x: 265..892, y: 120..580)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 3;
  ctx.fillRect(265, 120, 627, 460);
  ctx.strokeRect(265, 120, 627, 460);

  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(265, 120, 627, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`${booklet} KİTAPÇIĞI RESMİ CEVAP ANAHTARI`, 286, 148);

  const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
  const totalShow = Math.min(20, Math.max(10, expectedCount));
  const cols = 4;
  const rowsPerCol = Math.ceil(totalShow / cols);
  ctx.font = 'bold 18px monospace';

  for (let i = 0; i < totalShow; i += 1) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const x = 290 + col * 148;
    const y = 205 + row * 68;
    const ans = letters[(i * 3 + (booklet.charCodeAt(0) - 65)) % letters.length];

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(x, y - 24, 128, 42);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y - 24, 128, 42);

    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${String(i + 1).padStart(2, '0')} - ${ans}`, x + 16, y + 3);
  }

  // Bottom watermark clutter
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Sayfa 1 / 12 · Çoğaltılamaz · Telif Hakkı Doğruluk Akademi', 28, 646);

  return canvas.toDataURL('image/png');
}

export function OpticalRegionEditorModal({
  open,
  initialImage,
  targetBooklet,
  visibleBooklets,
  expectedCount,
  optionCount,
  loading = false,
  errorMessage = null,
  onClose,
  onChangeImage,
  onScanCroppedRegion,
}: OpticalRegionEditorModalProps) {
  const [imageAsset, setImageAsset] = useState<UploadedKeyImageAsset | null>(initialImage);
  const [booklet, setBooklet] = useState<BookletCode>(targetBooklet);
  const [rotationDeg, setRotationDeg] = useState<ImageRotationDeg>(0);
  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(true);
  const [cropRect, setCropRect] = useState<NormalizedCropRect>(DEFAULT_CROP_RECT);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number }>({
    width: 920,
    height: 680,
  });
  const [rotatedDataUrl, setRotatedDataUrl] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotatedImageRef = useRef<HTMLImageElement | null>(null);

  const dragRef = useRef<{
    kind: 'draw' | CropDragHandle;
    startClientX: number;
    startClientY: number;
    startPctX: number;
    startPctY: number;
    initialRect: NormalizedCropRect;
  } | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setImageAsset(initialImage);
      setBooklet(targetBooklet);
      setRotationDeg(0);
      setCropRect(DEFAULT_CROP_RECT);
      setLocalError(null);
    }
  }, [open, initialImage, targetBooklet]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onClose]);

  // Load natural dimensions and produce rotated display URL
  useEffect(() => {
    if (!open || !imageAsset?.dataUrl) {
      setRotatedDataUrl('');
      rotatedImageRef.current = null;
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const natW = Math.max(1, img.naturalWidth || 920);
      const natH = Math.max(1, img.naturalHeight || 680);
      setNaturalDims({ width: natW, height: natH });

      const rotDims = computeRotatedDimensions(natW, natH, rotationDeg);
      const canvas = document.createElement('canvas');
      canvas.width = rotDims.width;
      canvas.height = rotDims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.translate(rotDims.width / 2, rotDims.height / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -natW / 2, -natH / 2, natW, natH);
      ctx.restore();

      const outUrl = canvas.toDataURL('image/png');
      const rotImg = new Image();
      rotImg.onload = () => {
        if (cancelled) return;
        rotatedImageRef.current = rotImg;
        setRotatedDataUrl(outUrl);
      };
      rotImg.src = outUrl;
    };
    img.onerror = () => {
      if (!cancelled) {
        setLocalError('Yüklenen görsel önizleme için açılamadı. Lütfen geçerli bir PNG/JPG görseli seçin.');
      }
    };
    img.src = imageAsset.dataUrl;

    return () => {
      cancelled = true;
    };
  }, [open, imageAsset?.dataUrl, rotationDeg]);

  const rotatedDims = useMemo(
    () => computeRotatedDimensions(naturalDims.width, naturalDims.height, rotationDeg),
    [naturalDims.width, naturalDims.height, rotationDeg]
  );

  const pixelSlice = useMemo(
    () => computePixelCropRect(rotatedDims.width, rotatedDims.height, cropRect),
    [rotatedDims.width, rotatedDims.height, cropRect]
  );

  const regionSummary = useMemo(
    () => formatCropRegionSummary(cropRect, pixelSlice, rotationDeg),
    [cropRect, pixelSlice, rotationDeg]
  );

  // Render live cropped preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const srcImg = rotatedImageRef.current;
    if (!canvas || !srcImg || !rotatedDataUrl) return;

    const maxPreviewW = 360;
    const maxPreviewH = 220;
    const scale = Math.min(maxPreviewW / Math.max(1, pixelSlice.sw), maxPreviewH / Math.max(1, pixelSlice.sh), 1);
    const drawW = Math.max(40, Math.round(pixelSlice.sw * scale));
    const drawH = Math.max(40, Math.round(pixelSlice.sh * scale));

    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, drawW, drawH);
    ctx.filter = enhanceContrast ? 'grayscale(100%) contrast(145%) brightness(106%)' : 'none';
    ctx.drawImage(
      srcImg,
      pixelSlice.sx,
      pixelSlice.sy,
      pixelSlice.sw,
      pixelSlice.sh,
      0,
      0,
      drawW,
      drawH
    );
    ctx.filter = 'none';
  }, [rotatedDataUrl, pixelSlice, enhanceContrast]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const getStagePercentCoords = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    return {
      x: ((clientX - rect.left) / w) * 100,
      y: ((clientY - rect.top) / h) * 100,
    };
  };

  const startStageDraw = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!rotatedDataUrl || loading) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pct = getStagePercentCoords(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'draw',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPctX: pct.x,
      startPctY: pct.y,
      initialRect: cropRect,
    };
  };

  const startHandleDrag = (handle: CropDragHandle, e: ReactPointerEvent<HTMLElement>) => {
    if (!rotatedDataUrl || loading) return;
    e.preventDefault();
    e.stopPropagation();
    const stageEl = stageRef.current;
    if (stageEl) {
      stageEl.setPointerCapture(e.pointerId);
    }
    const pct = getStagePercentCoords(e.clientX, e.clientY);
    dragRef.current = {
      kind: handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPctX: pct.x,
      startPctY: pct.y,
      initialRect: cropRect,
    };
  };

  const handleStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pct = getStagePercentCoords(e.clientX, e.clientY);
    if (drag.kind === 'draw') {
      setCropRect(
        createCropRectFromPoints(
          { x: drag.startPctX, y: drag.startPctY },
          { x: pct.x, y: pct.y }
        )
      );
      return;
    }
    const deltaX = pct.x - drag.startPctX;
    const deltaY = pct.y - drag.startPctY;
    setCropRect(applyCropHandleDrag(drag.initialRect, drag.kind, deltaX, deltaY));
  };

  const handleStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleImageFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLocalError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const nextAsset: UploadedKeyImageAsset = {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || 'image/png',
      };
      setImageAsset(nextAsset);
      setRotationDeg(0);
      setCropRect(DEFAULT_CROP_RECT);
      onChangeImage?.(nextAsset);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Görsel yüklenemedi.');
    }
  };

  const handleLoadSampleKeyImage = () => {
    setLocalError(null);
    const dataUrl = createSampleAnswerKeySheetDataUrl(booklet, expectedCount, optionCount);
    const nextAsset: UploadedKeyImageAsset = {
      dataUrl,
      fileName: `ornek-cevap-anahtari-${booklet}.png`,
      mimeType: 'image/png',
    };
    setImageAsset(nextAsset);
    setRotationDeg(0);
    // Pre-focus near the boxed answer key region while leaving room to fine-tune
    setCropRect({ xPct: 27, yPct: 16, widthPct: 70, heightPct: 71 });
    onChangeImage?.(nextAsset);
  };

  const exportCroppedCanvasDataUrl = (): string | null => {
    const srcImg = rotatedImageRef.current;
    if (!srcImg) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, pixelSlice.sw);
    canvas.height = Math.max(1, pixelSlice.sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.filter = enhanceContrast ? 'grayscale(100%) contrast(145%) brightness(106%)' : 'none';
    ctx.drawImage(
      srcImg,
      pixelSlice.sx,
      pixelSlice.sy,
      pixelSlice.sw,
      pixelSlice.sh,
      0,
      0,
      canvas.width,
      canvas.height
    );
    ctx.filter = 'none';
    return canvas.toDataURL('image/png');
  };

  const handleDownloadCroppedPng = () => {
    const dataUrl = exportCroppedCanvasDataUrl();
    if (!dataUrl) return;
    const base64 = dataUrl.split(',')[1] || '';
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      arr[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([arr], { type: 'image/png' });
    triggerDownload(blob, `kirpilmis-cevap-anahtari-${booklet}.png`);
  };

  const handleConfirmScan = async () => {
    setLocalError(null);
    const dataUrl = exportCroppedCanvasDataUrl();
    if (!dataUrl) {
      setLocalError('Taranacak görsel henüz hazır değil.');
      return;
    }
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) {
      setLocalError('Kırpılmış görsel verisi oluşturulamadı.');
      return;
    }
    await onScanCroppedRegion({
      base64,
      mimeType: 'image/png',
      fileName: imageAsset?.fileName || `kirpilmis-anahtar-${booklet}.png`,
      targetBooklet: booklet,
      regionSummary,
    });
  };

  const activeError = errorMessage || localError;

  const HANDLES: Array<{ id: CropDragHandle; label: string; posClass: string }> = [
    { id: 'nw', label: 'Sol üst köşeyi boyutlandır', posClass: '-top-1.5 -left-1.5 cursor-nwse-resize' },
    { id: 'n', label: 'Üst kenarı boyutlandır', posClass: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
    { id: 'ne', label: 'Sağ üst köşeyi boyutlandır', posClass: '-top-1.5 -right-1.5 cursor-nesw-resize' },
    { id: 'e', label: 'Sağ kenarı boyutlandır', posClass: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize' },
    { id: 'se', label: 'Sağ alt köşeyi boyutlandır', posClass: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
    { id: 's', label: 'Alt kenarı boyutlandır', posClass: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
    { id: 'sw', label: 'Sol alt köşeyi boyutlandır', posClass: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
    { id: 'w', label: 'Sol kenarı boyutlandır', posClass: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="optical-region-editor-title"
        data-testid="optical-region-editor-modal"
        onClick={(e) => e.stopPropagation()}
        className="surface-card w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-start justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Crop className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="optical-region-editor-title" className="text-base sm:text-lg font-extrabold leading-snug">
                Manuel Optik Bölge Editörü (Cevap Anahtarı Alan Seçimi)
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Otomatik okuma başarısız olduğunda görsel üzerinde yalnızca cevap anahtarı alanını sürükleyip kırparak doğrudan Gemini Vision ile yeniden tarayın.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="Manuel optik bölge editörünü kapat"
            className="p-2 rounded-lg surface-alt hover:opacity-80 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeError && (
            <div
              role="alert"
              data-testid="region-editor-error"
              className="rounded-xl p-3 text-xs font-semibold flex items-start gap-2 bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{activeError}</span>
            </div>
          )}

          {!imageAsset ? (
            <div
              data-testid="region-editor-empty-upload"
              className="surface-alt rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center space-y-4"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="mx-auto w-12 h-12 rounded-2xl surface-card flex items-center justify-center shadow-sm">
                <Camera className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <div className="text-sm font-extrabold">Cevap Anahtarı Görseli Seçin veya Çekin</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Karmaşık deneme kapakları, kitapçık sayfaları veya yan çekilmiş fotoğraflarda cevap anahtarı kutusunu elle çizip kırpabilirsiniz.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <label className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Görsel Seç (PNG / JPG)</span>
                  <input
                    type="file"
                    data-testid="region-editor-file-input"
                    accept="image/*"
                    onChange={(e) => void handleImageFileSelect(e)}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  data-testid="region-editor-load-sample-btn"
                  onClick={handleLoadSampleKeyImage}
                  className="btn-3d-secondary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Örnek Cevap Anahtarı Görseli Yükle</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left 8 cols: Interactive Image Crop Stage */}
              <div className="lg:col-span-8 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold truncate max-w-[260px] sm:max-w-sm">
                    Görsel: <span className="font-mono-num">{imageAsset.fileName}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                      <Upload className="w-3 h-3" aria-hidden="true" />
                      <span>Görseli Değiştir</span>
                      <input
                        type="file"
                        data-testid="region-editor-file-input"
                        accept="image/*"
                        onChange={(e) => void handleImageFileSelect(e)}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      data-testid="region-editor-rotate-left-btn"
                      onClick={() => setRotationDeg((r) => normalizeRotationDeg(r - 90))}
                      aria-label="Görseli 90 derece sola döndür"
                      className="btn-3d-secondary px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>-90°</span>
                    </button>
                    <button
                      type="button"
                      data-testid="region-editor-rotate-right-btn"
                      onClick={() => setRotationDeg((r) => normalizeRotationDeg(r + 90))}
                      aria-label="Görseli 90 derece sağa döndür"
                      className="btn-3d-secondary px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3" aria-hidden="true" />
                      <span>+90°</span>
                    </button>
                    <button
                      type="button"
                      data-testid="region-editor-select-all-btn"
                      onClick={() => setCropRect(FULL_CROP_RECT)}
                      className="btn-3d-secondary px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" aria-hidden="true" />
                      <span>Tamamı</span>
                    </button>
                  </div>
                </div>

                <div
                  className="surface-alt rounded-xl p-2 sm:p-3 border flex items-center justify-center min-h-[260px] max-h-[54vh] overflow-hidden"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {rotatedDataUrl ? (
                    <div
                      ref={stageRef}
                      data-testid="region-editor-stage"
                      onPointerDown={startStageDraw}
                      onPointerMove={handleStagePointerMove}
                      onPointerUp={handleStagePointerUp}
                      onPointerCancel={handleStagePointerUp}
                      className="relative inline-block select-none touch-none overflow-hidden rounded-lg border shadow-inner cursor-crosshair"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <img
                        src={rotatedDataUrl}
                        alt="Cevap anahtarı alan seçimi görseli"
                        draggable={false}
                        className="block max-w-full max-h-[48vh] w-auto h-auto pointer-events-none"
                      />

                      {/* Lightweight 4-strip dark mask outside crop region */}
                      <div
                        className="absolute inset-x-0 top-0 bg-slate-950/55 pointer-events-none"
                        style={{ height: `${cropRect.yPct}%` }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 bg-slate-950/55 pointer-events-none"
                        style={{ top: `${cropRect.yPct + cropRect.heightPct}%` }}
                      />
                      <div
                        className="absolute left-0 bg-slate-950/55 pointer-events-none"
                        style={{
                          top: `${cropRect.yPct}%`,
                          height: `${cropRect.heightPct}%`,
                          width: `${cropRect.xPct}%`,
                        }}
                      />
                      <div
                        className="absolute right-0 bg-slate-950/55 pointer-events-none"
                        style={{
                          top: `${cropRect.yPct}%`,
                          height: `${cropRect.heightPct}%`,
                          left: `${cropRect.xPct + cropRect.widthPct}%`,
                        }}
                      />

                      {/* Active Crop Rectangle Overlay */}
                      <div
                        data-testid="region-editor-crop-box"
                        onPointerDown={(e) => startHandleDrag('move', e)}
                        style={{
                          left: `${cropRect.xPct}%`,
                          top: `${cropRect.yPct}%`,
                          width: `${cropRect.widthPct}%`,
                          height: `${cropRect.heightPct}%`,
                        }}
                        className="absolute border-2 border-sky-400 cursor-move"
                      >
                        {/* Rule of thirds alignment guides */}
                        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                          {Array.from({ length: 9 }).map((_, idx) => (
                            <div key={idx} className="border border-sky-300/30" />
                          ))}
                        </div>

                        <div
                          className={`absolute left-1.5 px-1.5 py-0.5 rounded bg-sky-600 text-white text-[10px] font-mono-num font-bold whitespace-nowrap pointer-events-none shadow ${
                            cropRect.yPct < 18 || pixelSlice.sy < 28 ? 'top-1.5' : '-top-6'
                          }`}
                        >
                          {pixelSlice.sw}×{pixelSlice.sh} px
                        </div>

                        {HANDLES.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            aria-label={h.label}
                            data-testid={`region-handle-${h.id}`}
                            onPointerDown={(e) => startHandleDrag(h.id, e)}
                            className={`absolute w-3.5 h-3.5 rounded-sm bg-white border-2 border-sky-600 shadow ${h.posClass}`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Görsel hazırlanıyor...</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  İpucu: Görsel üzerinde yeni bir dikdörtgen çizebilir, kutunun içini sürükleyerek taşıyabilir veya köşe/kenar tutamaçlarıyla alanı daraltabilirsiniz.
                </p>
              </div>

              {/* Right 4 cols: Fine Controls & Live Cropped Preview */}
              <div className="lg:col-span-4 space-y-3">
                {/* Target Booklet Selector */}
                <div className="surface-alt rounded-xl p-3 border space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="text-xs font-extrabold">Hedef Kitapçık Türü</div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bölge editörü hedef kitapçık seçimi">
                    {visibleBooklets.map((code) => (
                      <button
                        key={code}
                        type="button"
                        data-testid={`region-editor-booklet-${code}`}
                        onClick={() => setBooklet(code)}
                        className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer ${
                          booklet === code ? 'btn-3d' : 'btn-3d-secondary'
                        }`}
                      >
                        {code} Kitapçığı
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Cropped Region Preview */}
                <div className="surface-alt rounded-xl p-3 border space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">Kırpılmış Alan Önizleme</span>
                    <span className="text-[10px] font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
                      {pixelSlice.sw}×{pixelSlice.sh}
                    </span>
                  </div>
                  <div
                    className="surface-card rounded-lg p-2 border flex items-center justify-center min-h-[120px]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <canvas
                      ref={previewCanvasRef}
                      data-testid="region-editor-preview-canvas"
                      className="max-w-full max-h-[180px] rounded border"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    />
                  </div>
                  <div
                    data-testid="region-editor-summary"
                    className="text-[10px] font-mono-num leading-snug"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {regionSummary}
                  </div>
                </div>

                {/* Coordinate Fine-Tuning & OMR Contrast */}
                <div className="surface-alt rounded-xl p-3 border space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="text-xs font-extrabold">Hassas Koordinatlar (%)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Sol (X %)</span>
                      <input
                        type="number"
                        min={0}
                        max={95}
                        step={1}
                        data-testid="region-input-x"
                        value={Math.round(cropRect.xPct)}
                        onChange={(e) =>
                          setCropRect((r) => clampCropRect({ ...r, xPct: Number(e.target.value) }))
                        }
                        className="mt-0.5 w-full rounded-lg px-2 py-1 text-xs font-mono-num font-bold surface-card"
                      />
                    </label>
                    <label className="text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Üst (Y %)</span>
                      <input
                        type="number"
                        min={0}
                        max={95}
                        step={1}
                        data-testid="region-input-y"
                        value={Math.round(cropRect.yPct)}
                        onChange={(e) =>
                          setCropRect((r) => clampCropRect({ ...r, yPct: Number(e.target.value) }))
                        }
                        className="mt-0.5 w-full rounded-lg px-2 py-1 text-xs font-mono-num font-bold surface-card"
                      />
                    </label>
                    <label className="text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Genişlik %</span>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        step={1}
                        data-testid="region-input-w"
                        value={Math.round(cropRect.widthPct)}
                        onChange={(e) =>
                          setCropRect((r) => clampCropRect({ ...r, widthPct: Number(e.target.value) }))
                        }
                        className="mt-0.5 w-full rounded-lg px-2 py-1 text-xs font-mono-num font-bold surface-card"
                      />
                    </label>
                    <label className="text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-secondary)' }}>Yükseklik %</span>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        step={1}
                        data-testid="region-input-h"
                        value={Math.round(cropRect.heightPct)}
                        onChange={(e) =>
                          setCropRect((r) => clampCropRect({ ...r, heightPct: Number(e.target.value) }))
                        }
                        className="mt-0.5 w-full rounded-lg px-2 py-1 text-xs font-mono-num font-bold surface-card"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="region-editor-contrast-toggle"
                      checked={enhanceContrast}
                      onChange={(e) => setEnhanceContrast(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <Contrast className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                    <span>Yüksek Kontrast (OMR Netleştirme)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 sm:px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-2.5 surface-alt"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {imageAsset && rotatedDataUrl && (
              <button
                type="button"
                data-testid="region-editor-download-crop-btn"
                onClick={handleDownloadCroppedPng}
                disabled={loading}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kırpılmış Görseli İndir (.png)</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              data-testid="region-editor-scan-btn"
              disabled={!imageAsset || !rotatedDataUrl || loading}
              onClick={() => void handleConfirmScan()}
              className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Seçili Alan Taranıyor...</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Seçili Alanı Tara ve Anahtarı Çıkar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
