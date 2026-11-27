import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { SmartImage } from '../components/SmartImage';
import { formatCurrencyEGP } from '../lib/storeLogic';
import type { OpticalLens, Product, ProductVariant } from '../types';
import type { AppRoute } from '../components/Navbar';

interface LensSelectionPageProps {
  selectedFrame: { product: Product; variant: ProductVariant } | null;
  lenses: OpticalLens[];
  loading: boolean;
  onNavigate: (route: AppRoute) => void;
  onConfirmFrameWithLens: (lens: OpticalLens) => void;
}

export function LensSelectionPage({
  selectedFrame,
  lenses,
  loading,
  onNavigate,
  onConfirmFrameWithLens,
}: LensSelectionPageProps) {
  const [selectedLensId, setSelectedLensId] = useState<number | null>(null);

  if (!selectedFrame) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#141413]">يرجى اختيار إطار طبي أولاً</h1>
        <p className="text-sm text-[#4A4843]">
          ابدأ باختيار شكل النظارة الطبية ولونها، ثم انتقل هنا لاختيار نوع العدسات المناسبة.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ page: 'optical' })}
          className="px-6 py-3 rounded-xl bg-[#141413] text-white text-sm font-medium"
        >
          تصفح النظارات الطبية
        </button>
      </div>
    );
  }

  const chosenLens = lenses.find((l) => l.id === selectedLensId) || null;
  const combinedPrice = selectedFrame.product.price + (chosenLens ? chosenLens.price : 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header & Frame Context */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() =>
            onNavigate({ page: 'product', slug: selectedFrame.product.slug })
          }
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A4843] hover:text-[#141413]"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لتعديل الإطار</span>
        </button>

        <div className="bg-white rounded-2xl border border-[#141413]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-16 rounded-xl overflow-hidden bg-[#ECEAE3] shrink-0">
              <SmartImage
                src={selectedFrame.variant.images[0] || ''}
                alt={selectedFrame.product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="text-xs text-[#6E6B64]">الإطار المختار</div>
              <h1 className="text-lg font-bold text-[#141413]">{selectedFrame.product.name}</h1>
              <div className="text-xs text-[#4A4843]">
                اللون: {selectedFrame.variant.colorName}
                <span className="mx-1.5">·</span>
                <span className="font-mono tabular-nums font-bold">
                  {formatCurrencyEGP(selectedFrame.product.price)}
                </span>
              </div>
            </div>
          </div>

          <div className="text-sm text-[#4A4843]">
            اضغط على أي عدسة لإدخالها في الإطار وعرض تفاصيلها الكاملة
          </div>
        </div>
      </div>

      {/* Lens Grid: Signature Pop-Out -> Click to Settle Inside White Square & Reveal Details */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#141413] mb-14">
          اختر نوع العدسات الطبية
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-72 rounded-2xl bg-white border border-[#141413]/10 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-14 pt-4">
            {lenses.map((lens) => {
              const isSelected = selectedLensId === lens.id;

              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => setSelectedLensId(lens.id)}
                  aria-pressed={isSelected}
                  data-testid={`lens-card-${lens.id}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  className={`group relative text-right rounded-2xl bg-white transition-all duration-300 p-5 flex flex-col items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-[#141413] ${
                    isSelected
                      ? 'border-2 border-[#141413] shadow-md'
                      : 'border border-[#141413]/12 hover:border-[#141413]/40'
                  }`}
                >
                  {/* White Square Image Well — Unselected lens pops OUTSIDE above the white box; Selected settles INSIDE */}
                  <div
                    className={`w-32 h-32 rounded-full overflow-hidden border-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] bg-[#F7F6F2] shrink-0 ${
                      isSelected
                        ? 'translate-y-0 scale-95 border-[#9A7B4F] shadow-inner'
                        : '-translate-y-12 scale-110 border-white shadow-[0_14px_28px_rgba(20,20,19,0.16)] group-hover:-translate-y-14'
                    }`}
                  >
                    <SmartImage
                      src={lens.imageUrl}
                      alt={lens.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Card Header */}
                  <div
                    className={`w-full text-center transition-all duration-300 ${
                      isSelected ? 'mt-4' : '-mt-4'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-[#9A7B4F] mb-1">
                      معامل الانكسار {lens.refractiveIndex}
                    </div>
                    <h3 className="text-base font-bold text-[#141413] leading-snug">
                      {lens.name}
                    </h3>
                    <p className="text-xs text-[#6E6B64] mt-1">{lens.subtitle}</p>
                    <div className="mt-3 text-lg font-bold font-mono tabular-nums text-[#141413]">
                      + {formatCurrencyEGP(lens.price)}
                    </div>
                  </div>

                  {/* Expanded Lens Details Revealed Inside the White Square When Selected */}
                  {isSelected && (
                    <div className="w-full mt-4 pt-4 border-t border-[#141413]/10 text-right space-y-3">
                      <p className="text-xs text-[#4A4843] leading-relaxed">
                        {lens.fullDescription}
                      </p>
                      <ul className="space-y-1.5">
                        {lens.details.map((bullet, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-[#141413]"
                          >
                            <Check className="w-3.5 h-3.5 text-[#256D4A] shrink-0 mt-0.5" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="pt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#256D4A]">
                        <ShieldCheck className="w-4 h-4" />
                        <span>تم تحديد هذه العدسة</span>
                      </div>
                    </div>
                  )}

                  {!isSelected && (
                    <div className="mt-4 text-xs font-medium text-[#9A7B4F]">
                      اضغط لاختيار العدسة وعرض التفاصيل
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Summary & Proceed CTA */}
      <div className="bg-white rounded-2xl border border-[#141413]/12 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-right">
          <div className="text-xs text-[#6E6B64]">ملخص التكلفة المبدئي</div>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-sm text-[#141413]">
            <span>
              الإطار:{' '}
              <strong className="font-mono tabular-nums">
                {formatCurrencyEGP(selectedFrame.product.price)}
              </strong>
            </span>
            <span>+</span>
            <span>
              العدسة:{' '}
              <strong className="font-mono tabular-nums">
                {chosenLens ? formatCurrencyEGP(chosenLens.price) : 'لم تُختر بعد'}
              </strong>
            </span>
            <span>=</span>
            <span className="text-lg font-bold font-mono tabular-nums text-[#9A7B4F]">
              {formatCurrencyEGP(combinedPrice)}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={!chosenLens}
          onClick={() => {
            if (chosenLens) onConfirmFrameWithLens(chosenLens);
          }}
          className={`px-7 py-3.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
            chosenLens
              ? 'bg-[#141413] text-white hover:bg-[#2B2B29]'
              : 'bg-[#E5E1D8] text-[#8E8A82] cursor-not-allowed'
          }`}
        >
          <span>المتابعة لصفحة الشراء وكشف النظر</span>
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
