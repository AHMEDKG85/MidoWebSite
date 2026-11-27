export function resolvePortableImageUrl(rawUrl?: string, originOverride?: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (
    clean.startsWith('data:') ||
    clean.startsWith('https://') ||
    clean.startsWith('http://')
  ) {
    return clean;
  }
  const base =
    (originOverride || '').trim().replace(/\/+$/, '') ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  if (!base) return clean;
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

export function pickOrderItemImage(
  item: Record<string, unknown> | null | undefined,
  originOverride?: string,
): string {
  if (!item) return '';
  const candidate = String(
    item.frameImageUrl ||
      item.absoluteImageUrl ||
      item.imageUrl ||
      item.image ||
      item.photoUrl ||
      item.productImage ||
      '',
  ).trim();
  return resolvePortableImageUrl(candidate, originOverride);
}

export function pickPrescriptionImage(
  rx: Record<string, unknown> | null | undefined,
  topLevelUrl?: string,
  originOverride?: string,
): string {
  const candidate = String(
    rx?.absoluteImageUrl ||
      rx?.photoUrl ||
      rx?.imageUrl ||
      topLevelUrl ||
      '',
  ).trim();
  return resolvePortableImageUrl(candidate, originOverride);
}

export async function compressImageFileToDataUrl(
  file: File,
  maxWidth = 960,
  quality = 0.72,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxWidth / Math.max(1, img.width));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر معالجة الصورة');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
