import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Camera, Download, MessageCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  buildSnapshotFilename,
  buildWhatsAppShareUrl,
  drawEyewearFrameOnCanvas,
  drawFallbackFaceOnCanvas,
} from '../lib/tryOnSnapshot';
import type { ProductCategory } from '../types';

interface VirtualTryOnModalProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  colorName: string;
  colorHex: string;
  frameShape: string;
  category: ProductCategory;
}

export function VirtualTryOnModal({
  open,
  onClose,
  productName,
  colorName,
  colorHex,
  frameShape,
  category,
}: VirtualTryOnModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<'loading' | 'active' | 'fallback'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [scale, setScale] = useState(1);
  const [offsetY, setOffsetY] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setCameraState('loading');
    setErrorMessage('');
    setCapturedPhoto(null);
    setShareHint('');

    async function startFrontCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setCameraState('fallback');
          setErrorMessage('المتصفح الحالي لا يدعم الوصول المباشر للكاميرا، تم تفعيل وضع المعاينة التوضيحي.');
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraState('active');
      } catch {
        if (!cancelled) {
          setCameraState('fallback');
          setErrorMessage(
            'لم نتمكن من فتح الكاميرا الأمامية (يرجى السماح بصلاحية الكاميرا أو استخدام HTTPS). يمكنك معاينة شكل الإطار في وضع العرض التجريبي أدناه.',
          );
        }
      }
    }

    startFrontCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  if (!open) return null;

  const isSunglass = category === 'sunglasses';
  const lensFill = isSunglass ? 'rgba(20, 20, 19, 0.72)' : 'rgba(210, 235, 250, 0.22)';
  const snapshotFilename = buildSnapshotFilename(productName, colorName);
  const whatsappShareUrl = buildWhatsAppShareUrl({
    productName,
    colorName,
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
  });

  const handleCapture = () => {
    const video = videoRef.current;
    const viewportW = viewportRef.current?.clientWidth || 640;
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background layer (mirrored webcam or fallback studio face silhouette)
    if (cameraState === 'active' && video && video.videoWidth > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetAspect = canvas.width / canvas.height;
      const videoAspect = vw / vh;
      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;
      if (videoAspect > targetAspect) {
        sw = vh * targetAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / targetAspect;
        sy = (vh - sh) / 2;
      }
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      drawFallbackFaceOnCanvas(ctx, canvas.width, canvas.height);
    }

    // 2. Eyewear frame overlay matching exact user adjustments (scale, offsetY, tilt)
    drawEyewearFrameOnCanvas(ctx, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewportWidth: viewportW,
      transform: { scale, offsetY, tilt },
      frameShape,
      colorHex,
      category,
    });

    // 3. Subtle brand & frame badge at bottom
    ctx.fillStyle = 'rgba(20, 20, 19, 0.72)';
    ctx.fillRect(0, canvas.height - 46, canvas.width, 46);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Cairo, Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `MIDO OPTICS · ${productName} (${colorName})`,
      canvas.width / 2,
      canvas.height - 23,
    );

    setShareHint('');
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.92));
  };

  const triggerDownloadSnapshot = () => {
    if (!capturedPhoto) return;
    const link = document.createElement('a');
    link.href = capturedPhoto;
    link.download = snapshotFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleWhatsAppShare = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!capturedPhoto) return;

    // On mobile browsers supporting Web Share API with files, attach the JPEG image directly
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const res = await fetch(capturedPhoto);
        const blob = await res.blob();
        const file = new File([blob], snapshotFilename, { type: 'image/jpeg' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          e.preventDefault();
          await navigator.share({
            files: [file],
            title: `${productName} - MIDO OPTICS`,
            text: `تجربة نظارة "${productName}" (${colorName}) من ميدو للبصريات`,
          });
          setShareHint('تم فتح قائمة المشاركة لإرسال الصورة مباشرة.');
          return;
        }
      } catch {
        // Fall through to download + wa.me link
      }
    }

    // Desktop / fallback: save the composited image so user can drop it into WhatsApp chat
    triggerDownloadSnapshot();
    setShareHint('تم حفظ اللقطة على جهازك لتتمكن من إرفاقها مباشرة في محادثة واتساب.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tryon-modal-title"
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden border border-[#141413]/15 shadow-xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#141413]/10 flex items-center justify-between gap-4">
          <div>
            <h2 id="tryon-modal-title" className="text-lg font-bold text-[#141413]">
              تجربة النظارة بالكاميرا الأمامية
            </h2>
            <p className="text-xs text-[#6E6B64]">
              {productName} · اللون المختار: {colorName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة تجربة الكاميرا"
            className="p-2 rounded-lg text-[#4A4843] hover:text-[#141413] hover:bg-[#F4F1EA] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div
          ref={viewportRef}
          className="relative bg-[#141413] aspect-[4/3] w-full overflow-hidden flex items-center justify-center"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover -scale-x-100 ${
              cameraState === 'active' && !capturedPhoto ? 'block' : 'hidden'
            }`}
          />

          {capturedPhoto && (
            <img
              data-testid="captured-snapshot-img"
              src={capturedPhoto}
              alt="لقطة معاينة النظارة"
              className="w-full h-full object-cover"
            />
          )}

          {cameraState !== 'active' && !capturedPhoto && (
            <div className="w-full h-full bg-gradient-to-b from-[#ECEAE3] to-[#DDD8CE] flex flex-col items-center justify-center p-6 text-center">
              <svg
                viewBox="0 0 220 260"
                className="w-60 sm:w-64 h-68 text-[#C5BFB4]"
                aria-hidden="true"
              >
                <path
                  d="M110 20 C60 20 34 62 34 118 C34 184 68 236 110 236 C152 236 186 184 186 118 C186 62 160 20 110 20 Z"
                  fill="currentColor"
                  opacity="0.45"
                />
                <circle cx="76" cy="126" r="5" fill="#7D786E" opacity="0.5" />
                <circle cx="144" cy="126" r="5" fill="#7D786E" opacity="0.5" />
              </svg>
              {errorMessage && (
                <p className="mt-2 text-xs text-[#4A4843] max-w-md bg-white/85 px-3 py-2 rounded-lg">
                  {errorMessage}
                </p>
              )}
            </div>
          )}

          {/* Live Guides & Eyewear Frame Overlay (hidden when snapshot preview is shown) */}
          {!capturedPhoto && (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-72 rounded-[45%] border border-dashed border-white/40" />
              </div>

              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateY(${offsetY}px) scale(${scale}) rotate(${tilt}deg)`,
                  transition: 'transform 60ms linear',
                }}
              >
                <svg
                  viewBox="0 0 320 120"
                  className="w-[240px] sm:w-[270px] drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
                  aria-label={`إطار ${productName}`}
                >
                  {frameShape === 'square' || frameShape === 'geometric' || frameShape === 'aviator' ? (
                    <>
                      <rect
                        x="24"
                        y="22"
                        width="112"
                        height="76"
                        rx={frameShape === 'aviator' ? '26' : '14'}
                        fill={lensFill}
                        stroke={colorHex}
                        strokeWidth="9"
                      />
                      <rect
                        x="184"
                        y="22"
                        width="112"
                        height="76"
                        rx={frameShape === 'aviator' ? '26' : '14'}
                        fill={lensFill}
                        stroke={colorHex}
                        strokeWidth="9"
                      />
                      <path
                        d="M136 44 Q160 34 184 44"
                        fill="none"
                        stroke={colorHex}
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      {frameShape === 'aviator' && (
                        <line
                          x1="128"
                          y1="26"
                          x2="192"
                          y2="26"
                          stroke={colorHex}
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <ellipse
                        cx="82"
                        cy="60"
                        rx="56"
                        ry="46"
                        fill={lensFill}
                        stroke={colorHex}
                        strokeWidth="9"
                      />
                      <ellipse
                        cx="238"
                        cy="60"
                        rx="56"
                        ry="46"
                        fill={lensFill}
                        stroke={colorHex}
                        strokeWidth="9"
                      />
                      <path
                        d="M138 50 Q160 36 182 50"
                        fill="none"
                        stroke={colorHex}
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                  <line x1="12" y1="45" x2="26" y2="45" stroke={colorHex} strokeWidth="7" />
                  <line x1="294" y1="45" x2="308" y2="45" stroke={colorHex} strokeWidth="7" />
                  <path d="M46 38 L70 38 L46 66 Z" fill="rgba(255,255,255,0.28)" />
                  <path d="M202 38 L226 38 L202 66 Z" fill="rgba(255,255,255,0.28)" />
                </svg>
              </div>
            </>
          )}
        </div>

        {/* Adjustment Controls + Snapshot Save/Share Actions */}
        <div className="p-4 sm:p-5 bg-[#F7F6F2] border-t border-[#141413]/10 space-y-4 overflow-y-auto">
          {!capturedPhoto ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block text-xs font-medium text-[#141413]">
                <span>الحجم ({Math.round(scale * 100)}%)</span>
                <input
                  type="range"
                  min="0.7"
                  max="1.4"
                  step="0.02"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full mt-1.5 accent-[#141413]"
                />
              </label>
              <label className="block text-xs font-medium text-[#141413]">
                <span>الارتفاع الرأسي</span>
                <input
                  type="range"
                  min="-70"
                  max="70"
                  step="2"
                  value={offsetY}
                  onChange={(e) => setOffsetY(Number(e.target.value))}
                  className="w-full mt-1.5 accent-[#141413]"
                />
              </label>
              <label className="block text-xs font-medium text-[#141413]">
                <span>ميلان الإطار ({tilt}°)</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="1"
                  value={tilt}
                  onChange={(e) => setTilt(Number(e.target.value))}
                  className="w-full mt-1.5 accent-[#141413]"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-[#141413]/12 p-3.5">
              <div className="text-xs font-bold text-[#141413]">
                تم التقاط اللقطة مع النظارة — يمكنك حفظها أو مشاركتها الآن:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  data-testid="save-snapshot-link"
                  href={capturedPhoto}
                  download={snapshotFilename}
                  onClick={() => setShareHint('تم تنزيل الصورة على جهازك بنجاح.')}
                  className="px-4 py-2 rounded-lg bg-[#141413] text-white text-xs font-bold hover:bg-[#2B2B29] inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>حفظ الصورة</span>
                </a>

                <a
                  data-testid="share-whatsapp-link"
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleWhatsAppShare}
                  className="px-4 py-2 rounded-lg bg-[#256D4A] text-white text-xs font-bold hover:bg-[#1E593C] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>مشاركة على واتساب</span>
                </a>
              </div>
              {shareHint && (
                <p className="w-full text-[11px] text-[#256D4A] font-medium">{shareHint}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              {capturedPhoto ? (
                <button
                  type="button"
                  data-testid="retake-snapshot-btn"
                  onClick={() => {
                    setCapturedPhoto(null);
                    setShareHint('');
                  }}
                  className="px-4 py-2 rounded-lg bg-white border border-[#141413]/15 text-xs font-medium text-[#141413] hover:bg-[#ECEAE3] flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>إعادة التقاط / العودة للكاميرا</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="capture-snapshot-btn"
                    onClick={handleCapture}
                    className="px-4 py-2 rounded-lg bg-[#141413] text-white text-xs font-bold hover:bg-[#2B2B29] flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4 text-[#E5C996]" />
                    <span>التقاط صورة (Snapshot)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScale(1);
                      setOffsetY(0);
                      setTilt(0);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-[#4A4843] hover:text-[#141413] flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>إعادة الضبط</span>
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg bg-white border border-[#141413]/15 text-[#141413] text-sm font-medium hover:bg-[#ECEAE3] transition-colors"
            >
              اعتماد وإغلاق المعاينة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
