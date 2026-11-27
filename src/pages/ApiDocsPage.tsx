import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  Webhook,
} from 'lucide-react';
import type { AppRoute } from '../components/Navbar';
import type { StoreSettings } from '../types';

interface ApiDocsPageProps {
  store: StoreSettings;
  onNavigate: (route: AppRoute) => void;
}

interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  sampleBody?: string;
}

const ENDPOINTS: EndpointSpec[] = [
  {
    method: 'GET',
    path: '/api/external/store',
    summary: 'جلب بيانات المحل الحالية (الاسم، لمحة عن المحل، أرقام الهاتف، العنوان، رابط Vercel).',
  },
  {
    method: 'PUT',
    path: '/api/external/store',
    summary: 'تحديث بيانات المحل، أرقام التواصل، ساعات العمل، ولمحات العرض 3D.',
    sampleBody: `{
  "storeName": "ميدو للبصريات | MIDO OPTICS",
  "tagline": "حرفية بصرية تجمع بين دقة القياس وأناقة الإطار",
  "aboutText": "نص لمحة عن المحل...",
  "address": "القاهرة — المهندسين",
  "mapLink": "https://maps.google.com",
  "phones": ["01012345678", "01198765432"],
  "whatsapp": "201012345678",
  "workingHours": "يومياً من 11 صباحاً حتى 11 مساءً",
  "externalAdminUrl": "https://mido-optics-servies.vercel.app"
}`,
  },
  {
    method: 'GET',
    path: '/api/external/products',
    summary: 'عرض جميع المنتجات (النظارات الطبية، الشمسية، العدسات اللاصقة، الإكسسوارات) مع الألوان والمخزون.',
  },
  {
    method: 'POST',
    path: '/api/external/products',
    summary: 'إضافة منتج جديد مع ألوانه وصوره وخيار الحجز المسبق.',
    sampleBody: `{
  "name": "إطار تيتانيوم كلاسيك",
  "category": "prescription",
  "price": 1950,
  "shortDesc": "إطار خفيف مناسب للعدسات الطبية",
  "fullDesc": "وصف تفصيلي للإطار...",
  "frameShape": "round",
  "material": "تيتانيوم",
  "dimensions": "50 - 20 - 145 مم",
  "published": true,
  "allowPreorder": true,
  "preorderNote": "حجز مسبق خلال 5 أيام",
  "variants": [
    { "colorName": "أسود", "colorHex": "#141413", "stock": 4, "images": ["https://..."] }
  ]
}`,
  },
  {
    method: 'PUT',
    path: '/api/external/products/:id',
    summary: 'تعديل منتج موجود (السعر، الصور، المخزون، أو تفعيل/إيقاف الحجز المسبق).',
  },
  {
    method: 'DELETE',
    path: '/api/external/products/:id',
    summary: 'حذف منتج من المتجر نهائياً.',
  },
  {
    method: 'GET',
    path: '/api/external/lenses',
    summary: 'عرض كل أنواع العدسات الطبية وأسعارها ومعامل الانكسار.',
  },
  {
    method: 'POST',
    path: '/api/external/lenses',
    summary: 'إضافة نوع عدسة طبية جديد مع صورته وتفاصيله وسعره.',
    sampleBody: `{
  "name": "عدسة مضغوطة 1.67 بلو كات",
  "subtitle": "رقيقة جداً للمقاسات العالية مع حماية الشاشات",
  "price": 1150,
  "imageUrl": "https://...",
  "details": ["حماية من الضوء الأزرق", "مقاومة للخدش"],
  "fullDescription": "وصف كامل للعدسة...",
  "refractiveIndex": "1.67",
  "published": true
}`,
  },
  {
    method: 'PUT',
    path: '/api/external/lenses/:id',
    summary: 'تحديث سعر أو وصف أو صورة عدسة طبية موجودة.',
  },
  {
    method: 'DELETE',
    path: '/api/external/lenses/:id',
    summary: 'حذف نوع عدسة طبية.',
  },
  {
    method: 'GET',
    path: '/api/external/orders',
    summary: 'جلب كافة الطلبات والفواتير (الإطار + العدسة + OD/OS SPH/CYL/AXIS/ADD و IPD + صورة الكشف).',
  },
  {
    method: 'PATCH',
    path: '/api/external/orders/:id/status',
    summary: 'تحديث حالة الطلب من لوحة التحكم الخارجية.',
    sampleBody: `{ "status": "confirmed" }`,
  },
];

const METHOD_BADGE: Record<EndpointSpec['method'], string> = {
  GET: 'bg-[#256D4A]/12 text-[#256D4A] border-[#256D4A]/25',
  POST: 'bg-[#9A7B4F]/15 text-[#7A5E36] border-[#9A7B4F]/30',
  PUT: 'bg-[#141413]/10 text-[#141413] border-[#141413]/20',
  PATCH: 'bg-[#141413]/10 text-[#141413] border-[#141413]/20',
  DELETE: 'bg-red-700/10 text-red-700 border-red-700/25',
};

export function ApiDocsPage({ store, onNavigate }: ApiDocsPageProps) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors in restricted browsers
    }
  };

  const handleTestHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthResult(`HTTP ${res.status} — ${JSON.stringify(data)}`);
    } catch {
      setHealthResult('تعذر الاتصال بنقطة /api/health');
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#141413]/10 pb-6">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'home' })}
            className="text-xs font-medium text-[#6E6B64] hover:text-[#141413] inline-flex items-center gap-1"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة للرئيسية</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#141413]">
            صفحة الـ API والربط مع لوحة التحكم الخارجية
          </h1>
          <p className="text-xs sm:text-sm text-[#4A4843]">
            نقاط الاتصال الحية للتحكم الكامل في المتجر واستقبال الطلبات والفواتير ومقاسات النظر على موقعك الخارجي.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTestHealth}
            disabled={healthLoading}
            className="px-4 py-2.5 rounded-xl bg-white border border-[#141413]/15 text-xs font-bold text-[#141413] hover:bg-[#F4F1EA] inline-flex items-center gap-1.5"
          >
            <Activity className="w-4 h-4 text-[#256D4A]" />
            <span>{healthLoading ? 'جاري الفحص...' : 'اختبار الخادم (/api/health)'}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ page: 'admin' })}
            className="px-4 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2B2B29] inline-flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>فتح لوحة التحكم</span>
          </button>
        </div>
      </div>

      {healthResult && (
        <div
          dir="ltr"
          className="p-3.5 rounded-xl bg-[#256D4A]/10 border border-[#256D4A]/25 font-mono text-xs text-[#256D4A]"
        >
          {healthResult}
        </div>
      )}

      {/* Base URL & Authentication Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#141413] inline-flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#9A7B4F]" />
              <span>عنوان الخادم الأساسي (Base URL) والمصادقة</span>
            </h2>
            {store.externalAdminUrl && (
              <a
                href={store.externalAdminUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#9A7B4F] inline-flex items-center gap-1 underline"
              >
                <span>لوحة Vercel</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-[#6E6B64]">الرابط الأساسي للاتصال بهذه النسخة:</div>
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#F7F6F2] border border-[#141413]/10">
              <code dir="ltr" className="font-mono text-xs text-[#141413] break-all">
                {baseUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy('base-url', baseUrl)}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#141413]/15 text-[11px] font-medium shrink-0 inline-flex items-center gap-1"
              >
                {copiedKey === 'base-url' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#256D4A]" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div
            dir="ltr"
            className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 font-mono text-[11px] text-[#141413] space-y-1.5"
          >
            <div className="font-bold text-[#9A7B4F]">Required Auth Header:</div>
            <div>x-mido-sync-secret: &lt;EXTERNAL_ADMIN_SYNC_SECRET&gt;</div>
            <div className="text-[#6E6B64]">OR: Authorization: Bearer &lt;EXTERNAL_ADMIN_SYNC_SECRET&gt;</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4">
          <h2 className="text-base font-bold text-[#141413] inline-flex items-center gap-2">
            <Webhook className="w-4 h-4 text-[#9A7B4F]" />
            <span>إعداد Webhook إرسال الطلبات التلقائي</span>
          </h2>
          <p className="text-xs text-[#4A4843] leading-relaxed">
            عند إتمام أي عميل لطلب جديد (مع الدفع عند الاستلام)، يرسل الخادم طلباً فورياً بنظام POST إلى الرابط المضبوط في متغير البيئة{' '}
            <code dir="ltr" className="font-mono bg-[#F7F6F2] px-1.5 py-0.5 rounded">
              EXTERNAL_ADMIN_WEBHOOK_URL
            </code>{' '}
            مع توقيع أمان في الهيدر{' '}
            <code dir="ltr" className="font-mono bg-[#F7F6F2] px-1.5 py-0.5 rounded">
              X-Mido-Signature
            </code>.
          </p>
          <pre
            dir="ltr"
            className="p-3.5 rounded-xl bg-[#141413] text-[#F7F6F2] font-mono text-[11px] overflow-x-auto leading-relaxed"
          >{`{
  "event": "order.created",
  "order": {
    "orderCode": "MDO-...",
    "invoiceNumber": "INV-...",
    "orderType": "standard | preorder",
    "items": [{ "productName": "...", "lensName": "...", "framePrice": 1800, "lensPrice": 650 }],
    "prescription": {
      "odSph": "-1.25", "odCyl": "-0.50", "odAxis": "90", "odAdd": "+1.50",
      "osSph": "-1.00", "osCyl": "-0.25", "osAxis": "85", "osAdd": "+1.50",
      "ipd": "63", "imageUrl": "/uploads/..."
    },
    "total": 2450
  }
}`}</pre>
        </div>
      </div>

      {/* All External API Endpoints */}
      <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#141413]">
          جميع نقاط الواجهة البرمجية المتاحة (External Control API)
        </h2>

        <div className="divide-y divide-[#141413]/10">
          {ENDPOINTS.map((ep) => {
            const fullUrl = `${baseUrl}${ep.path}`;
            const key = `${ep.method}-${ep.path}`;
            return (
              <div key={key} className="py-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div dir="ltr" className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-md border font-mono text-[11px] font-bold ${METHOD_BADGE[ep.method]}`}
                    >
                      {ep.method}
                    </span>
                    <code className="font-mono text-xs sm:text-sm font-bold text-[#141413]">
                      {ep.path}
                    </code>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(key, fullUrl)}
                    className="px-3 py-1.5 rounded-lg bg-[#F7F6F2] border border-[#141413]/12 text-[11px] font-medium hover:bg-[#EAE5DC] inline-flex items-center gap-1"
                  >
                    {copiedKey === key ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#256D4A]" />
                        <span>تم نسخ الرابط</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الرابط الكامل</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-[#4A4843]">{ep.summary}</p>

                {ep.sampleBody && (
                  <pre
                    dir="ltr"
                    className="p-3 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 font-mono text-[11px] text-[#141413] overflow-x-auto"
                  >
                    {ep.sampleBody}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
