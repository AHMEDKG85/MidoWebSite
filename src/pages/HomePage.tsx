import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { GlassesHero3D } from '../components/GlassesHero3D';
import { SmartImage } from '../components/SmartImage';
import type { HomeDepartment, Product, StoreSettings, StoryBeat } from '../types';
import type { AppRoute } from '../components/Navbar';
import { formatCurrencyEGP } from '../lib/storeLogic';

interface HomePageProps {
  store: StoreSettings;
  featuredProducts: Product[];
  onNavigate: (route: AppRoute) => void;
}

const FALLBACK_STORY_BEATS: StoryBeat[] = [
  {
    title: 'لمحة عن ميدو للبصريات',
    subtitle: 'تعرف على المحل',
    body: 'أضف نبذة المحل وتفاصيله من لوحة التحكم.',
  },
  {
    title: 'خدمات المحل',
    subtitle: 'أضف الخدمات التي تقدمها',
    body: 'اكتب تفاصيل الخدمات والعدسات المتاحة من لوحة التحكم.',
  },
  {
    title: 'التواصل والزيارة',
    subtitle: 'كيف يصل إليك العميل؟',
    body: 'أضف عنوان الفرع وأرقام التواصل وساعات العمل من لوحة التحكم.',
  },
];

const DEPARTMENTS: HomeDepartment[] = [
  {
    id: 'optical',
    title: 'النظارات الطبية',
    subtitle: 'اختيار الإطار، تجربة الكاميرا، وتحديد نوع العدسة وكشف النظر.',
    page: 'optical',
    imageUrl: '/src/assets/images/optical_tortoise_gold_1795761229680.jpg',
  },
  {
    id: 'sunglasses',
    title: 'النظارات الشمسية',
    subtitle: 'حماية UV400 وعدسات بولارايزد مع شراء مباشر عند الاستلام.',
    page: 'sunglasses',
    imageUrl: '/src/assets/images/sun_havana_amber_1795761231607.jpg',
  },
  {
    id: 'contacts',
    title: 'العدسات اللاصقة',
    subtitle: 'عدسات يومية وشهرية طبية وتجميلية مريحة طوال اليوم.',
    page: 'contacts',
    imageUrl: '/src/assets/images/contact_lenses_pack_1795761232288.jpg',
  },
  {
    id: 'accessories',
    title: 'الإكسسوارات',
    subtitle: 'جرابات جلدية فاخرة، بخاخات تنظيف، ومناديل مايكروفايبر.',
    page: 'accessories',
    imageUrl: '/src/assets/images/eyewear_accessories_kit_1795761232213.jpg',
  },
];

export function HomePage({ store, featuredProducts, onNavigate }: HomePageProps) {
  const scrollyRef = useRef<HTMLElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [manualBeatIdx, setManualBeatIdx] = useState<number | null>(null);

  const storyBeats =
    store.storyBeats && store.storyBeats.length > 0
      ? store.storyBeats
      : FALLBACK_STORY_BEATS;
  const departments = store.homeDepartments ?? DEPARTMENTS;

  useEffect(() => {
    const updateScroll = () => {
      const el = scrollyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 120) {
        const mobileP = Math.min(1, Math.max(0, window.scrollY / 520));
        setScrollProgress(mobileP);
        return;
      }
      const passed = -rect.top;
      const p = Math.min(1, Math.max(0, passed / scrollable));
      setScrollProgress(p);
      setManualBeatIdx(null);
    };

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    return () => {
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, []);

  const computedBeatIdx = Math.min(
    storyBeats.length - 1,
    Math.floor(scrollProgress * storyBeats.length),
  );
  const activeBeatIdx = manualBeatIdx !== null ? manualBeatIdx : computedBeatIdx;
  const activeBeat = storyBeats[activeBeatIdx] || storyBeats[0];
  const effectiveProgress =
    manualBeatIdx !== null
      ? storyBeats.length > 1
        ? manualBeatIdx / (storyBeats.length - 1)
        : 0
      : scrollProgress;

  const jumpToBeat = (idx: number) => {
    setManualBeatIdx(idx);
    const el = scrollyRef.current;
    if (!el) return;
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable > 120 && storyBeats.length > 1) {
      const targetTop = el.offsetTop + (idx / (storyBeats.length - 1)) * scrollable;
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  };

  return (
    <div className="mido-home space-y-24 sm:space-y-28">
      {/* Section 1: Apple-Style Scroll-Driven 3D Eyewear + Editable Store Story Beats */}
      <section
        ref={scrollyRef}
        className={`mido-hero max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 ${store.heroImageUrl ? '' : 'lg:min-h-[235vh]'}`}
      >
        <div className={`mido-hero-grid grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start ${store.heroImageUrl ? '' : 'lg:sticky lg:top-20'}`}>
          {/* Store Intro + Dynamic Story Beat Column */}
          <div className="lg:col-span-5 space-y-6 lg:pt-4">
            <div className="space-y-3">
              <p className="mido-eyebrow text-xs font-bold text-[#84603A]">
                {store.storeName} <span aria-hidden="true">·</span> بصريات بتفاصيل أدق
              </p>
              <h1 className="mido-hero-title text-4xl sm:text-5xl lg:text-7xl font-bold text-[#18251F] leading-[1.1] text-balance">
                {store.heroTitle || 'رؤية واضحة بتصميم يليق بملامحك'}
              </h1>
              <p className="max-w-xl text-base sm:text-lg text-[#4A4843] leading-relaxed">
                {store.tagline}
              </p>
            </div>

            {/* Active Story Beat Card (Driven by Scroll or Clickable Step) */}
            <div
              data-testid="active-story-beat"
              className="mido-story-card bg-white/85 rounded-2xl border border-[#B7A27E]/35 p-5 sm:p-6 space-y-3 transition-all duration-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono tabular-nums text-[#9A7B4F] font-bold">
                  0{activeBeatIdx + 1} / 0{storyBeats.length}
                </span>
                <div className="flex items-center gap-1.5" role="tablist" aria-label="محطات لمحة عن المحل">
                  {storyBeats.map((beat, idx) => (
                    <button
                      key={idx}
                      type="button"
                      role="tab"
                      aria-selected={idx === activeBeatIdx}
                      aria-label={beat.title}
                      onClick={() => jumpToBeat(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === activeBeatIdx
                          ? 'w-7 bg-[#141413]'
                          : 'w-2 bg-[#141413]/20 hover:bg-[#141413]/45'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div key={activeBeatIdx} className="mido-story-enter space-y-1.5">
                <div className="text-xs font-bold text-[#84603A]">{activeBeat.subtitle}</div>
                <h2 className="text-lg sm:text-xl font-bold text-[#18251F]">
                  {activeBeat.title}
                </h2>
                <p className="text-sm text-[#4A4843] leading-relaxed">{activeBeat.body}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate({ page: 'optical' })}
                className="mido-primary-button px-6 py-3 rounded-xl bg-[#18251F] text-white text-sm font-bold hover:bg-[#26382F] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span>تصفح النظارات الطبية</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'sunglasses' })}
                className="px-5 py-3 rounded-xl bg-white/80 border border-[#18251F]/15 text-[#18251F] text-sm font-bold hover:bg-white transition-colors whitespace-nowrap"
              >
                النظارات الشمسية
              </button>
            </div>
          </div>

          {/* Sticky 3D Stage */}
          <div className="mido-stage-wrap lg:col-span-7">
            {store.heroImageUrl ? (
              <div className="aspect-[4/3] overflow-hidden rounded-[2rem] border border-[#141413]/10 bg-[#ECEAE3] shadow-xl">
                <SmartImage
                  src={store.heroImageUrl}
                  alt={store.storeName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <GlassesHero3D
                scrollProgress={effectiveProgress}
                heroModelUrl={store.heroModelUrl}
              />
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Store Overview + 4 Departments */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-[#141413]/10 pt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
          <div className="lg:col-span-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#141413]">
              {store.aboutTitle || 'عن المحل ورؤيتنا'}
            </h2>
          </div>
          <div className="lg:col-span-8 space-y-5">
            <p className="text-base sm:text-lg text-[#4A4843] leading-relaxed max-w-3xl">
              {store.aboutText}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {storyBeats.map((beat, idx) => (
                <div
                  key={idx}
                  className="mido-beat-card bg-white rounded-xl border border-[#141413]/10 p-4 space-y-1.5"
                >
                  <div className="text-[11px] font-mono tabular-nums text-[#9A7B4F]">
                    0{idx + 1}
                  </div>
                  <h3 className="text-sm font-bold text-[#141413]">{beat.title}</h3>
                  <p className="text-xs text-[#6E6B64] leading-relaxed">{beat.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {departments.map((dept) => (
            <button
              key={dept.id}
              type="button"
              onClick={() => onNavigate({ page: dept.page })}
              className="home-category-card group text-right bg-white rounded-2xl border border-[#141413]/10 overflow-hidden transition-transform duration-200 hover:-translate-y-1 flex flex-col"
            >
              {dept.imageUrl && (
                <div className="aspect-[4/3] w-full overflow-hidden bg-[#ECEAE3]">
                  <SmartImage
                    src={dept.imageUrl}
                    alt={dept.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#141413] mb-1.5">{dept.title}</h3>
                  <p className="text-xs text-[#6E6B64] leading-relaxed">{dept.subtitle}</p>
                </div>
                <span className="text-xs font-medium text-[#9A7B4F] inline-flex items-center gap-1">
                  <span>عرض القسم</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Section 3: Featured Selection */}
      {featuredProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#141413]">
                {store.featuredTitle || 'إصدارات مختارة'}
              </h2>
              <p className="text-sm text-[#6E6B64] mt-1">
                {store.featuredSubtitle || 'تشكيلة منتقاة من أحدث الإطارات الطبية والشمسية'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'optical' })}
              className="text-sm font-medium text-[#141413] hover:text-[#9A7B4F] underline underline-offset-4 whitespace-nowrap"
            >
              مشاهدة الكل
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredProducts.slice(0, 3).map((product) => {
              const firstVar = product.variants[0];
              const thumb = firstVar?.images[0] || '';
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onNavigate({ page: 'product', slug: product.slug })}
                  className="home-product-card group text-right bg-white rounded-2xl border border-[#141413]/10 overflow-hidden transition-transform duration-200 hover:-translate-y-1 flex flex-col"
                >
                  <div className="aspect-[4/3] w-full bg-[#ECEAE3] overflow-hidden">
                    <SmartImage
                      src={thumb}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5 space-y-2 w-full">
                    <div className="text-xs text-[#6E6B64]">
                      <span>
                        {product.category === 'prescription' ? 'نظارات طبية' : 'نظارات شمسية'}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span>{product.variants.length} ألوان</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-base font-bold text-[#141413]">{product.name}</h3>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#141413] shrink-0">
                        {formatCurrencyEGP(product.price)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      {product.variants.map((v) => (
                        <span
                          key={v.id}
                          title={v.colorName}
                          className="w-3.5 h-3.5 rounded-full border border-black/15"
                          style={{ backgroundColor: v.colorHex }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: Store Location, Phone Numbers & Hours */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#141413]">
              {store.locationTitle || 'موقع المحل وأرقام التواصل'}
            </h2>
            <p className="text-sm text-[#4A4843] leading-relaxed">
              {store.locationText ||
                'نرحب بكم في فرعنا لفحص النظر وتجربة الإطارات على الطبيعة، أو اطلب عبر الموقع ليصلك الطلب مع الدفع عند الاستلام.'}
            </p>

            <div className="space-y-3 pt-2">
              {store.address && <div className="flex items-start gap-3 text-sm text-[#141413]">
                <MapPin className="w-5 h-5 text-[#9A7B4F] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">العنوان</div>
                  <div className="text-[#4A4843]">{store.address}</div>
                </div>
              </div>}

              {store.phones.length > 0 && <div className="flex items-start gap-3 text-sm text-[#141413]">
                <Phone className="w-5 h-5 text-[#9A7B4F] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">أرقام الهاتف</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-[#4A4843]">
                    {store.phones.map((phone) => (
                      <a
                        key={phone}
                        href={`tel:${phone}`}
                        dir="ltr"
                        className="hover:text-[#141413] underline underline-offset-4"
                      >
                        {phone}
                      </a>
                    ))}
                  </div>
                </div>
              </div>}

              {store.workingHours && <div className="flex items-start gap-3 text-sm text-[#141413]">
                <Clock className="w-5 h-5 text-[#9A7B4F] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">ساعات العمل</div>
                  <div className="text-[#4A4843]">{store.workingHours}</div>
                </div>
              </div>}
              {!store.address && store.phones.length === 0 && !store.workingHours && (
                <p className="text-sm text-[#6E6B64]">أكمل بيانات الفرع من لوحة التحكم لتظهر هنا.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#F4F1EA] rounded-xl p-6 sm:p-8 space-y-5 border border-[#141413]/10">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-[#141413]">تواصل سريع وزيارة الفرع</h3>
              <p className="text-xs text-[#6E6B64]">
                يمكنك فتح موقع المتجر على خرائط جوجل أو مراسلتنا مباشرة عبر واتساب.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {store.mapLink && (
                <a
                  href={store.mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-medium hover:bg-[#2B2B29] transition-colors inline-flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  <span>عرض الموقع على الخريطة</span>
                </a>
              )}
              {store.whatsapp && (
                <a
                  href={`https://wa.me/${store.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-white border border-[#141413]/15 text-[#141413] text-sm font-medium hover:bg-[#EAE5DC] transition-colors inline-flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-[#256D4A]" />
                  <span>تواصل عبر واتساب</span>
                </a>
              )}
              {!store.mapLink && !store.whatsapp && (
                <p className="text-xs text-[#6E6B64]">أضف رابط الخريطة وواتساب من لوحة التحكم.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
