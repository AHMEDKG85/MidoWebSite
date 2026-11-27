import type { ProductCategory } from '../types';

export interface OverlayTransform {
  scale: number;
  offsetY: number;
  tilt: number;
}

export function buildSnapshotFilename(productName: string, colorName: string): string {
  const clean = `${productName}-${colorName}`
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `mido-optics-${clean || 'tryon'}.jpg`;
}

export function buildWhatsAppShareUrl(params: {
  productName: string;
  colorName: string;
  pageUrl?: string;
  storePhone?: string;
}): string {
  const baseText = `شاهد تجربتي لنظارة "${params.productName}" (لون: ${params.colorName}) من ميدو للبصريات | MIDO OPTICS`;
  const fullText = params.pageUrl ? `${baseText}\n${params.pageUrl}` : baseText;
  const encoded = encodeURIComponent(fullText);
  const digits = (params.storePhone || '').replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    return `https://wa.me/${digits}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function computeTryOnOverlayGeometry(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  transform: OverlayTransform,
) {
  const safeViewportW = Math.max(280, viewportWidth || 640);
  const ratio = canvasWidth / safeViewportW;
  const baseCssFrameWidth = safeViewportW >= 640 ? 270 : 240;
  const frameWidth = baseCssFrameWidth * ratio * transform.scale;
  const frameHeight = frameWidth * (120 / 320);

  return {
    centerX: canvasWidth / 2,
    centerY: canvasHeight / 2 + transform.offsetY * ratio,
    frameWidth,
    frameHeight,
    tiltRad: (transform.tilt * Math.PI) / 180,
  };
}

export function drawFallbackFaceOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#ECEAE3');
  grad.addColorStop(1, '#DDD8CE');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Proportional studio face silhouette matching the fallback SVG
  const cx = width / 2;
  const cy = height / 2;
  const scale = height / 340;

  ctx.save();
  ctx.translate(cx - 110 * scale, cy - 130 * scale);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(197, 191, 180, 0.55)';
  ctx.beginPath();
  ctx.moveTo(110, 20);
  ctx.bezierCurveTo(60, 20, 34, 62, 34, 118);
  ctx.bezierCurveTo(34, 184, 68, 236, 110, 236);
  ctx.bezierCurveTo(152, 236, 186, 184, 186, 118);
  ctx.bezierCurveTo(186, 62, 160, 20, 110, 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(125, 120, 110, 0.5)';
  ctx.beginPath();
  ctx.arc(76, 126, 5, 0, Math.PI * 2);
  ctx.arc(144, 126, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawEyewearFrameOnCanvas(
  ctx: CanvasRenderingContext2D,
  params: {
    canvasWidth: number;
    canvasHeight: number;
    viewportWidth: number;
    transform: OverlayTransform;
    frameShape: string;
    colorHex: string;
    category: ProductCategory;
  },
): void {
  const geo = computeTryOnOverlayGeometry(
    params.canvasWidth,
    params.canvasHeight,
    params.viewportWidth,
    params.transform,
  );
  const unitScale = geo.frameWidth / 320;
  const isSunglass = params.category === 'sunglasses';
  const lensFill = isSunglass ? 'rgba(20, 20, 19, 0.72)' : 'rgba(210, 235, 250, 0.24)';

  ctx.save();
  ctx.translate(geo.centerX, geo.centerY);
  ctx.rotate(geo.tiltRad);
  ctx.scale(unitScale, unitScale);
  ctx.translate(-160, -60);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;

  ctx.strokeStyle = params.colorHex || '#141413';
  ctx.fillStyle = lensFill;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const isBoxed =
    params.frameShape === 'square' ||
    params.frameShape === 'geometric' ||
    params.frameShape === 'aviator';

  if (isBoxed) {
    const rx = params.frameShape === 'aviator' ? 26 : 14;
    ctx.lineWidth = 9;
    drawRoundedRectPath(ctx, 24, 22, 112, 76, rx);
    ctx.fill();
    ctx.stroke();

    drawRoundedRectPath(ctx, 184, 22, 112, 76, rx);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(136, 44);
    ctx.quadraticCurveTo(160, 34, 184, 44);
    ctx.stroke();

    if (params.frameShape === 'aviator') {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(128, 26);
      ctx.lineTo(192, 26);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(82, 60, 56, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(238, 60, 56, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(138, 50);
    ctx.quadraticCurveTo(160, 36, 182, 50);
    ctx.stroke();
  }

  // Temple hinges
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(12, 45);
  ctx.lineTo(26, 45);
  ctx.moveTo(294, 45);
  ctx.lineTo(308, 45);
  ctx.stroke();

  // Subtle lens reflection highlight
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(46, 38);
  ctx.lineTo(70, 38);
  ctx.lineTo(46, 66);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(202, 38);
  ctx.lineTo(226, 38);
  ctx.lineTo(202, 66);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
