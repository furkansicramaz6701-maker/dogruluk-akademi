export function normalizeTurkishSlug(value: string, fallback = 'dosya'): string {
  const raw = (value || '').trim();
  if (!raw) return fallback;

  const transliterated = raw
    .replace(/[Çç]/g, 'c')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[İIı]/g, 'i')
    .replace(/[Öö]/g, 'o')
    .replace(/[Şş]/g, 's')
    .replace(/[Üü]/g, 'u')
    .toLowerCase();

  const cleaned = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  return cleaned || fallback;
}

export function sanitizeDownloadFilename(
  filename: string,
  fallbackName = 'dosya'
): string {
  const trimmed = (filename || '').trim();
  if (!trimmed) return fallbackName;

  const lastDot = trimmed.lastIndexOf('.');
  const hasExt = lastDot >= 0 && lastDot < trimmed.length - 1;
  const rawBase = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt = hasExt ? trimmed.slice(lastDot + 1) : '';

  const cleanBase = rawBase
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120)
    .replace(/^[.-]+|[.-]+$/g, '');

  const cleanExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const base = cleanBase || fallbackName;
  return cleanExt ? `${base}.${cleanExt}` : base;
}

export function buildStudentReportPdfFilename(
  studentName: string,
  studentNumber?: string,
  prefix = 'Karne-Analizi'
): string {
  const nameSlug = normalizeTurkishSlug(studentName, 'ogrenci');
  const numSlug = (studentNumber || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const raw = numSlug
    ? `${prefix}-${nameSlug}-${numSlug}.pdf`
    : `${prefix}-${nameSlug}.pdf`;
  return sanitizeDownloadFilename(raw, 'Karne-Analizi-ogrenci.pdf');
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBlob(bytes: Uint8Array, mimeType: string): Blob {
  // Copy into a tight, zero-offset Uint8Array so subarray views never leak surrounding bytes
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType });
}

export function uint8ArrayToPdfBlob(bytes: Uint8Array): Blob {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('Oluşturulan PDF dosyası boş.');
  }
  return uint8ArrayToBlob(bytes, 'application/pdf');
}

export function yieldToMainThread(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function canvasToBlobSafe(
  canvas: HTMLCanvasElement,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.92
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mimeType, quality)
  );
  if (blob && blob.size > 0) {
    return blob;
  }
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const bytes = dataUrlToUint8Array(dataUrl);
  if (bytes.byteLength === 0) {
    throw new Error('Görsel çıktısı oluşturulamadı.');
  }
  return uint8ArrayToBlob(bytes, mimeType);
}

export function triggerDownload(blob: Blob, filename: string): void {
  if (!blob || blob.size === 0) {
    throw new Error('İndirilecek dosya içeriği boş.');
  }
  const safeName = sanitizeDownloadFilename(filename, 'indirme');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }, 300);
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function triggerStaggeredDownloads(
  items: Array<{ blob: Blob; fileName: string }>,
  delayMs = 260
): Promise<number> {
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.blob || item.blob.size === 0) continue;
    triggerDownload(item.blob, item.fileName);
    count += 1;
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  return count;
}
