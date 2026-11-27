import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Check, ShoppingBag, Sparkles } from 'lucide-react';
import { SmartImage } from '../components/SmartImage';
import { VirtualTryOnModal } from '../components/VirtualTryOnModal';
import {
  canOrderVariant,
  formatCurrencyEGP,
  getSelectedVariant,
  getVariantImagesOnly,
  isPreorderAvailable,
  requiresLensStep,
} from '../lib/storeLogic';
import type { Product, ProductVariant } from '../types';
import type { AppRoute } from '../components/Navbar';

interface ProductDetailPageProps {
  product: Product | null;
  loading: boolean;
  onNavigate: (route: AppRoute) => void;
  onSelectOpticalFrameForLens: (product: Product, variant: ProductVariant) => void;
  onAddDirectItemToCart: (product: Product, variant: ProductVariant, goToCheckout: boolean) => void;
}

export function ProductDetailPage({
  product,
  loading,
  onNavigate,
  onSelectOpticalFrameForLens,
  onAddDirectItemToCart,
}: ProductDetailPageProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [addedToast, setAddedToast] = useState(false);

  useEffect(() => {
    if (product && product.variants.length > 0) {
      setSelectedVariantId(product.variants[0].id);
      setActiveImageIdx(0);
    } else {
      setSelectedVariantId(null);
      setActiveImageIdx(0);
    }
  }, [product?.id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-96 rounded-2xl bg-white border border-[#141413]/10 animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#141413]">المنتج غير متوفر حالياً</h1>
        <button
          type="button"
          onClick={() => onNavigate({ page: 'home' })}
          className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-medium"
        >
          العودة للرئيسية
        </button>
      </div>
    );
  }

  const activeVariant = getSelectedVariant(product, selectedVariantId);
  const activeImages = getVariantImagesOnly(product, selectedVariantId);
  const mainImage = activeImages[activeImageIdx] || activeImages[0] || '';
  const isOptical = requiresLensStep(product.category);
  const supportsTryOn = product.category === 'prescription' || product.category === 'sunglasses';
  const variantIsPreorder = isPreorderAvailable(product, activeVariant);
  const variantOrderable = canOrderVariant(product, activeVariant);

  const handleSelectColor = (variantId: number) => {
    setSelectedVariantId(variantId);
    setActiveImageIdx(0);
  };

  const backPage: AppRoute['page'] =
    product.category === 'prescription'
      ? 'optical'
      : product.category === 'sunglasses'
        ? 'sunglasses'
        : product.category === 'contact_lenses'
          ? 'contacts'
          : 'accessories';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <button
        type="button"
        onClick={() => onNavigate({ page: backPage } as AppRoute)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A4843] hover:text-[#141413] transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>العودة للقسم</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left / Top Column: Color-Exclusive Image Gallery + Swatches Directly Below */}
        <div className="lg:col-span-7 space-y-4">
          <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#ECEAE3] border border-[#141413]/10">
            <SmartImage
              src={mainImage}
              alt={`${product.name} - ${activeVariant?.colorName || ''}`}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Thumbnail strip ONLY for the active color */}
          {activeImages.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {activeImages.map((imgUrl, idx) => (
                <button
                  key={`${activeVariant?.id}-${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-20 h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                    activeImageIdx === idx
                      ? 'border-[#141413]'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <SmartImage
                    src={imgUrl}
                    alt={`${product.name} صورة ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Color Swatches Directly Under Photos */}
          <div className="bg-white rounded-2xl border border-[#141413]/10 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#141413]">
                الألوان المتوفرة: {activeVariant?.colorName}
              </span>
              <span className="text-xs text-[#6E6B64]">
                اختر اللون لعرض صوره فقط
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {product.variants.map((variant) => {
                const isSelected = activeVariant?.id === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleSelectColor(variant.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-[#141413] bg-[#141413] text-white'
                        : 'border-[#141413]/15 bg-[#F7F6F2] text-[#141413] hover:bg-[#EAE5DC]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                      style={{ backgroundColor: variant.colorHex }}
                    />
                    <span>{variant.colorName}</span>
                    {variant.stock <= 0 && (
                      <span className="opacity-75">
                        {product.allowPreorder ? '(حجز مسبق)' : '(نفذ)'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right / Bottom Column: Price, Details, Virtual Try-On, and Purchase Flow */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#141413]/10 p-6 sm:p-8 space-y-6 lg:sticky lg:top-24">
          <div className="space-y-2 border-b border-[#141413]/10 pb-5">
            <div className="text-xs text-[#6E6B64]">
              <span>
                {product.category === 'prescription'
                  ? 'نظارة طبية'
                  : product.category === 'sunglasses'
                    ? 'نظارة شمسية'
                    : product.category === 'contact_lenses'
                      ? 'عدسات لاصقة'
                      : 'إكسسوارات'}
              </span>
              {product.material && (
                <>
                  <span className="mx-1.5">·</span>
                  <span>{product.material}</span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#141413]">{product.name}</h1>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#141413]">
                {formatCurrencyEGP(product.price)}
              </span>
              <span className="text-xs font-medium text-[#4A4843]">
                {activeVariant && activeVariant.stock > 0
                  ? `متوفر (${activeVariant.stock} قطعة)`
                  : variantIsPreorder
                    ? product.preorderNote || 'متاح للحجز المسبق'
                    : 'غير متوفر حالياً'}
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm text-[#4A4843] leading-relaxed">
            <p>{product.fullDesc}</p>
            {product.dimensions && (
              <div className="flex items-center justify-between pt-2 text-xs border-t border-[#141413]/8">
                <span className="text-[#6E6B64]">المقاسات / الأبعاد</span>
                <span className="font-mono tabular-nums text-[#141413]" dir="ltr">
                  {product.dimensions}
                </span>
              </div>
            )}
          </div>

          {/* Virtual Camera Try-On */}
          {supportsTryOn && activeVariant && (
            <button
              type="button"
              onClick={() => setTryOnOpen(true)}
              className="w-full py-3 px-4 rounded-xl bg-[#F4F1EA] border border-[#141413]/15 text-[#141413] text-sm font-medium hover:bg-[#EAE5DC] transition-colors flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4 text-[#9A7B4F]" />
              <span>تجربة شكل النظارة بالكاميرا الأمامية</span>
            </button>
          )}

          {/* Primary Next Step CTA */}
          {activeVariant && variantOrderable ? (
            <div className="space-y-3 pt-1">
              {variantIsPreorder && (
                <div className="p-3 rounded-xl bg-[#F4F1EA] border border-[#9A7B4F]/35 text-xs text-[#141413]">
                  <strong>حجز مسبق:</strong>{' '}
                  {product.preorderNote ||
                    'سيتم تجهيز هذا الإصدار خصيصاً لك والتواصل لتأكيد موعد التسليم.'}
                </div>
              )}

              {isOptical ? (
                <button
                  type="button"
                  onClick={() => onSelectOpticalFrameForLens(product, activeVariant)}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29] transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-[#E5C996]" />
                  <span>
                    {variantIsPreorder
                      ? 'حجز مسبق — الانتقال لاختيار العدسات'
                      : 'اخترت الشكل — الانتقال لاختيار العدسات'}
                  </span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onAddDirectItemToCart(product, activeVariant, true)}
                    className="w-full py-3.5 px-5 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29] transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#E5C996]" />
                    <span>
                      {variantIsPreorder
                        ? 'حجز مسبق الآن — الدفع عند الاستلام'
                        : 'شراء الآن — الدفع عند الاستلام'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onAddDirectItemToCart(product, activeVariant, false);
                      setAddedToast(true);
                      setTimeout(() => setAddedToast(false), 2500);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-white border border-[#141413]/15 text-[#141413] text-sm font-medium hover:bg-[#F4F1EA] transition-colors flex items-center justify-center gap-2"
                  >
                    {addedToast ? (
                      <>
                        <Check className="w-4 h-4 text-[#256D4A]" />
                        <span>تمت الإضافة إلى السلة</span>
                      </>
                    ) : (
                      <span>إضافة إلى السلة ومتابعة التسوق</span>
                    )}
                  </button>
                </>
              )}
              <p className="text-[11px] text-center text-[#6E6B64]">
                الدفع نقداً عند الاستلام فقط · فحص ومراجعة قبل الاستلام
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#F4F1EA] text-center text-xs text-[#6E6B64]">
              هذا اللون غير متاح حالياً، يرجى اختيار لون آخر متوفر.
            </div>
          )}
        </div>
      </div>

      {activeVariant && (
        <VirtualTryOnModal
          open={tryOnOpen}
          onClose={() => setTryOnOpen(false)}
          productName={product.name}
          colorName={activeVariant.colorName}
          colorHex={activeVariant.colorHex}
          frameShape={product.frameShape}
          category={product.category}
        />
      )}
    </div>
  );
}
