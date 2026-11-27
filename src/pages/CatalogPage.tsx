import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SmartImage } from '../components/SmartImage';
import { formatCurrencyEGP } from '../lib/storeLogic';
import type { Product, ProductCategory } from '../types';
import type { AppRoute } from '../components/Navbar';

interface CatalogPageProps {
  category: ProductCategory;
  products: Product[];
  loading: boolean;
  onNavigate: (route: AppRoute) => void;
}

const CATEGORY_META: Record<
  ProductCategory,
  { title: string; subtitle: string; showShapeFilter: boolean }
> = {
  prescription: {
    title: 'النظارات الطبية',
    subtitle:
      'اختر الإطار المناسب، بدّل الألوان لمعاينة كل لون، جربه بالكاميرا الأمامية، ثم اختر نوع العدسات.',
    showShapeFilter: true,
  },
  sunglasses: {
    title: 'النظارات الشمسية',
    subtitle:
      'استعرض النظارات الشمسية بألوانها المتوفرة وجربها بالكاميرا الأمامية مع شراء مباشر والدفع عند الاستلام.',
    showShapeFilter: true,
  },
  contact_lenses: {
    title: 'العدسات اللاصقة',
    subtitle: 'عدسات لاصقة يومية وشهرية عالية الترطيب لراحة عينيك طوال اليوم.',
    showShapeFilter: false,
  },
  accessories: {
    title: 'الإكسسوارات والعناية',
    subtitle: 'جرابات جلدية وبخاخات تنظيف ومناديل مايكروفايبر للحفاظ على نظارتك.',
    showShapeFilter: false,
  },
};

const SHAPE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'round', label: 'دائري' },
  { key: 'square', label: 'مربع' },
  { key: 'geometric', label: 'هندسي' },
  { key: 'aviator', label: 'أفياتور' },
];

export function CatalogPage({
  category,
  products,
  loading,
  onNavigate,
}: CatalogPageProps) {
  const [search, setSearch] = useState('');
  const [shapeFilter, setShapeFilter] = useState('all');

  const meta = CATEGORY_META[category];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (p.category !== category) return false;
      if (meta.showShapeFilter && shapeFilter !== 'all' && p.frameShape !== shapeFilter) {
        return false;
      }
      if (q) {
        const hay = `${p.name} ${p.shortDesc} ${p.material}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, category, shapeFilter, search, meta.showShapeFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-[#141413]/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#141413]">{meta.title}</h1>
          <p className="text-sm sm:text-base text-[#4A4843] max-w-2xl">{meta.subtitle}</p>
        </div>
        <div className="text-xs font-mono tabular-nums text-[#6E6B64]">
          {filtered.length} منتج متاح
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-[#6E6B64] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الخامة..."
            aria-label="ابحث في القسم"
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-white border border-[#141413]/12 text-sm text-[#141413] placeholder:text-[#8E8A82] focus:outline-none focus:border-[#141413]"
          />
        </div>

        {meta.showShapeFilter && (
          <div className="flex items-center gap-1.5 p-1 bg-[#EFECE5] rounded-xl overflow-x-auto">
            {SHAPE_LABELS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setShapeFilter(s.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  shapeFilter === s.key
                    ? 'bg-white text-[#141413] shadow-sm'
                    : 'text-[#4A4843] hover:text-[#141413]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl border border-[#141413]/10 h-80 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#141413]/10 p-12 text-center space-y-2">
          <p className="text-base font-bold text-[#141413]">لا توجد منتجات مطابقة للبحث حالياً</p>
          <p className="text-sm text-[#6E6B64]">
            يمكنك مسح البحث أو إضافة منتجات جديدة لهذا القسم من لوحة التحكم.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((product) => {
            const firstVariant = product.variants[0];
            const previewImg = firstVariant?.images[0] || '';
            const totalStock = product.variants.reduce((acc, v) => acc + v.stock, 0);

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onNavigate({ page: 'product', slug: product.slug })}
                className="group text-right bg-white rounded-2xl border border-[#141413]/10 overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 flex flex-col"
              >
                <div className="aspect-[4/3] w-full bg-[#ECEAE3] overflow-hidden">
                  <SmartImage
                    src={previewImg}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                <div className="p-5 flex-1 w-full flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-[#6E6B64]">
                      <span>{product.material || meta.title}</span>
                      <span className="mx-1.5">·</span>
                      <span
                        className={
                          totalStock > 0
                            ? 'text-[#256D4A] font-medium'
                            : product.allowPreorder
                              ? 'text-[#9A7B4F] font-bold'
                              : ''
                        }
                      >
                        {totalStock > 0
                          ? 'متوفر'
                          : product.allowPreorder
                            ? 'حجز مسبق متاح'
                            : 'نفذت الكمية'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-base font-bold text-[#141413]">{product.name}</h2>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#141413] shrink-0">
                        {formatCurrencyEGP(product.price)}
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6B64] line-clamp-2 leading-relaxed">
                      {product.shortDesc}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#141413]/8">
                    <div className="flex items-center gap-1.5">
                      {product.variants.map((v) => (
                        <span
                          key={v.id}
                          title={v.colorName}
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: v.colorHex }}
                        />
                      ))}
                      <span className="text-[11px] text-[#6E6B64] mr-1">
                        {product.variants.length} {product.variants.length === 1 ? 'لون' : 'ألوان'}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#9A7B4F]">عرض التفاصيل</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
