import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  FileImage,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import { InvoiceCard } from '../components/InvoiceCard';
import { SmartImage } from '../components/SmartImage';
import { createFirestoreOrder } from '../lib/firestoreStore';
import { generateClientOrderIdentifiers, readJsonSafe } from '../lib/safeFetch';
import {
  calculateCartTotals,
  calculateItemUnitTotal,
  formatCurrencyEGP,
  validatePrescription,
} from '../lib/storeLogic';
import type {
  CartItem,
  OrderRecord,
  PrescriptionPayload,
  StoreSettings,
} from '../types';
import type { AppRoute } from '../components/Navbar';

interface CheckoutPageProps {
  cart: CartItem[];
  store: StoreSettings;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onNavigate: (route: AppRoute) => void;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      el.src = objectUrl;
    });
    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر معالجة الصورة');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CheckoutPage({
  cart,
  store,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onNavigate,
}: CheckoutPageProps) {
  const totals = calculateCartTotals(cart);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [rxMode, setRxMode] = useState<'manual' | 'upload'>('manual');
  const [odSph, setOdSph] = useState('');
  const [odCyl, setOdCyl] = useState('');
  const [odAxis, setOdAxis] = useState('');
  const [odAdd, setOdAdd] = useState('');
  const [osSph, setOsSph] = useState('');
  const [osCyl, setOsCyl] = useState('');
  const [osAxis, setOsAxis] = useState('');
  const [osAdd, setOsAdd] = useState('');
  const [ipd, setIpd] = useState('');
  const [rxImageUrl, setRxImageUrl] = useState('');
  const [uploadingRx, setUploadingRx] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  const handleRxImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingRx(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/upload-prescription', {
        method: 'POST',
        body: form,
      });
      const parsed = await readJsonSafe<{ url?: string; error?: string }>(res);
      if (parsed.isJson) {
        if (!parsed.ok || !parsed.data?.url) {
          throw new Error(parsed.data?.error || 'فشل رفع صورة كشف النظر');
        }
        setRxImageUrl(parsed.data.url);
      } else {
        // Static hosting fallback (e.g., Vercel frontend): compress image for direct Firestore storage
        const compressedUrl = await compressImageFileToDataUrl(file);
        setRxImageUrl(compressedUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الصورة');
    } finally {
      setUploadingRx(false);
    }
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (cart.length === 0) {
      setError('السلة فارغة حالياً.');
      return;
    }

    if (customerName.trim().length < 2) {
      setError('يرجى كتابة الاسم الكامل.');
      return;
    }
    if (customerPhone.trim().length < 7) {
      setError('يرجى إدخال رقم هاتف صحيح للتواصل عند التسليم.');
      return;
    }
    if (customerAddress.trim().length < 4) {
      setError('يرجى إدخال عنوان التوصيل أو اختيار الاستلام من الفرع.');
      return;
    }

    const hasManualInput = Boolean(
      odSph.trim() ||
        odCyl.trim() ||
        odAdd.trim() ||
        osSph.trim() ||
        osCyl.trim() ||
        osAdd.trim(),
    );

    const prescriptionPayload: PrescriptionPayload | null = totals.hasPrescriptionOpticalItem
      ? {
          mode: rxImageUrl && hasManualInput ? 'both' : rxImageUrl ? 'upload' : 'manual',
          od: {
            sph: odSph.trim(),
            cyl: odCyl.trim(),
            axis: odAxis.trim(),
            add: odAdd.trim(),
          },
          os: {
            sph: osSph.trim(),
            cyl: osCyl.trim(),
            axis: osAxis.trim(),
            add: osAdd.trim(),
          },
          ipd: ipd.trim(),
          imageUrl: rxImageUrl,
        }
      : null;

    const rxCheck = validatePrescription(
      prescriptionPayload,
      totals.hasPrescriptionOpticalItem,
    );
    if (!rxCheck.valid) {
      setError(rxCheck.error || 'يرجى التحقق من كشف النظر.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          notes: notes.trim(),
          orderType: totals.hasPreorderItem ? 'preorder' : 'standard',
          items: cart.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            lensId: item.lensId,
            quantity: item.quantity,
            orderType: item.orderType || 'standard',
          })),
          prescription: prescriptionPayload,
        }),
      });
      const parsed = await readJsonSafe<OrderRecord & { error?: string }>(res);
      let finalOrder: OrderRecord;

      if (parsed.isJson) {
        if (!parsed.ok || !parsed.data) {
          throw new Error(parsed.data?.error || 'حدث خطأ أثناء تسجيل الطلب.');
        }
        finalOrder = parsed.data;
        // Backup to Cloud Firestore so admin sees orders across devices
        await createFirestoreOrder(finalOrder);
      } else {
        // Static hosting fallback (e.g., Vercel frontend without Express API): submit directly to Cloud Firestore
        const { orderCode, invoiceNumber } = generateClientOrderIdentifiers();
        finalOrder = {
          id: Date.now(),
          orderCode,
          invoiceNumber,
          orderType: totals.hasPreorderItem ? 'preorder' : 'standard',
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          paymentMethod: 'cash_on_delivery',
          notes: notes.trim(),
          items: cart,
          prescription: prescriptionPayload,
          frameSubtotal: totals.frameSubtotal,
          lensSubtotal: totals.lensSubtotal,
          subtotal: totals.total,
          total: totals.total,
          status: 'pending',
          externalSyncStatus: 'not_configured',
          createdAt: new Date().toISOString(),
        };
        await createFirestoreOrder(finalOrder, { throwOnError: true });
      }

      setConfirmedOrder(finalOrder);
      onClearCart();
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الطلب، حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="no-print bg-white rounded-2xl border border-[#141413]/12 p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#256D4A]/10 text-[#256D4A] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-[#141413]">
            {confirmedOrder.orderType === 'preorder'
              ? 'تم تسجيل طلب الحجز المسبق بنجاح'
              : 'تم استلام طلبك بنجاح'}
          </h1>
          <p className="text-xs sm:text-sm text-[#4A4843]">
            الفاتورة الرسمية للطلب رقم{' '}
            <strong className="font-mono tabular-nums text-[#141413]" dir="ltr">
              {confirmedOrder.orderCode}
            </strong>
          </p>
        </div>

        <InvoiceCard order={confirmedOrder} store={store} showPrintButton />

        <div className="no-print text-center">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'home' })}
            className="px-6 py-3 rounded-xl bg-[#141413] text-white text-sm font-medium hover:bg-[#2B2B29]"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <ShoppingBag className="w-12 h-12 text-[#8E8A82] mx-auto" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold text-[#141413]">سلة المشتريات فارغة</h1>
        <p className="text-sm text-[#6E6B64]">
          ابدأ باختيار نظارة طبية أو شمسية أو عدسات لاصقة لإتمام الطلب.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'optical' })}
            className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-medium"
          >
            النظارات الطبية
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'sunglasses' })}
            className="px-5 py-2.5 rounded-xl bg-white border border-[#141413]/15 text-[#141413] text-sm font-medium"
          >
            النظارات الشمسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-[#141413]/10 pb-5">
        <h1 className="text-3xl font-bold text-[#141413]">إتمام الشراء ومراجعة الطلب</h1>
        <p className="text-sm text-[#4A4843] mt-1">
          مراجعة تفصيلية للأسعار، إدخال مقاسات العين (SPH / CYL / AXIS / ADD / IPD)، وإصدار الفاتورة مع الدفع عند الاستلام.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Right Column: Items + Prescription */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-[#141413]/10 p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#141413]">المنتجات المختارة</h2>

            <div className="divide-y divide-[#141413]/10">
              {cart.map((item) => {
                const unitTotal = calculateItemUnitTotal(item);
                return (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex gap-4">
                    <div className="w-24 h-20 rounded-xl overflow-hidden bg-[#ECEAE3] shrink-0">
                      <SmartImage
                        src={item.imageUrl}
                        alt={item.productName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-[#141413]">{item.productName}</h3>
                            {item.orderType === 'preorder' && (
                              <span className="px-2 py-0.5 rounded bg-[#F4F1EA] border border-[#9A7B4F]/40 text-[10px] font-bold text-[#9A7B4F]">
                                حجز مسبق
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6E6B64]">اللون: {item.colorName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          aria-label={`حذف ${item.productName}`}
                          className="p-1.5 text-[#8E8A82] hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-xs text-[#4A4843] space-y-0.5">
                        <div>
                          سعر {item.category === 'prescription' ? 'الإطار' : 'المنتج'}:{' '}
                          <span className="font-mono tabular-nums font-medium">
                            {formatCurrencyEGP(item.framePrice)}
                          </span>
                        </div>
                        {item.lensName && (
                          <div>
                            العدسة ({item.lensName}):{' '}
                            <span className="font-mono tabular-nums font-medium text-[#9A7B4F]">
                              + {formatCurrencyEGP(item.lensPrice)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="inline-flex items-center gap-2 border border-[#141413]/15 rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            aria-label="تقليل الكمية"
                            className="p-1 text-[#141413] hover:bg-[#F4F1EA] rounded"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-mono tabular-nums w-5 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            aria-label="زيادة الكمية"
                            className="p-1 text-[#141413] hover:bg-[#F4F1EA] rounded"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-sm font-bold font-mono tabular-nums text-[#141413]">
                          {formatCurrencyEGP(unitTotal * item.quantity)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Eye Prescription Section */}
          {totals.hasPrescriptionOpticalItem && (
            <div className="bg-white rounded-2xl border border-[#141413]/10 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#141413]">بيانات كشف النظر (للعينين)</h2>
                  <p className="text-xs text-[#6E6B64]">
                    أدخل مقاسات العين اليمنى واليسرى (SPH / CYL / AXIS / ADD و IPD) أو صور الكشف.
                  </p>
                </div>

                <div className="inline-flex p-1 bg-[#F4F1EA] rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setRxMode('manual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      rxMode === 'manual' ? 'bg-white text-[#141413] shadow-sm' : 'text-[#6E6B64]'
                    }`}
                  >
                    كتابة الكشف يدوياً
                  </button>
                  <button
                    type="button"
                    onClick={() => setRxMode('upload')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      rxMode === 'upload' ? 'bg-white text-[#141413] shadow-sm' : 'text-[#6E6B64]'
                    }`}
                  >
                    تصوير / رفع الكشف
                  </button>
                </div>
              </div>

              {rxMode === 'manual' ? (
                <div className="space-y-4">
                  {/* Right Eye (OD) */}
                  <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 space-y-3">
                    <div className="text-xs font-bold text-[#141413]">
                      العين اليمنى (Right Eye — OD)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="ltr">
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">SPH</span>
                        <input
                          type="text"
                          value={odSph}
                          onChange={(e) => setOdSph(e.target.value)}
                          placeholder="-1.50"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">CYL</span>
                        <input
                          type="text"
                          value={odCyl}
                          onChange={(e) => setOdCyl(e.target.value)}
                          placeholder="-0.75"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">AXIS</span>
                        <input
                          type="text"
                          value={odAxis}
                          onChange={(e) => setOdAxis(e.target.value)}
                          placeholder="180"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">ADD</span>
                        <input
                          type="text"
                          value={odAdd}
                          onChange={(e) => setOdAdd(e.target.value)}
                          placeholder="+1.50"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Left Eye (OS) */}
                  <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 space-y-3">
                    <div className="text-xs font-bold text-[#141413]">
                      العين اليسرى (Left Eye — OS)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="ltr">
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">SPH</span>
                        <input
                          type="text"
                          value={osSph}
                          onChange={(e) => setOsSph(e.target.value)}
                          placeholder="-1.25"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">CYL</span>
                        <input
                          type="text"
                          value={osCyl}
                          onChange={(e) => setOsCyl(e.target.value)}
                          placeholder="-0.50"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">AXIS</span>
                        <input
                          type="text"
                          value={osAxis}
                          onChange={(e) => setOsAxis(e.target.value)}
                          placeholder="90"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="block text-[#6E6B64] mb-1 font-mono">ADD</span>
                        <input
                          type="text"
                          value={osAdd}
                          onChange={(e) => setOsAdd(e.target.value)}
                          placeholder="+1.50"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-sm"
                        />
                      </label>
                    </div>
                  </div>

                  <label className="block text-xs">
                    <span className="block text-[#4A4843] mb-1">
                      المسافة بين حدقتي العين (IPD بالملليمتر - اختياري)
                    </span>
                    <input
                      type="text"
                      value={ipd}
                      onChange={(e) => setIpd(e.target.value)}
                      placeholder="63"
                      dir="ltr"
                      className="w-40 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm"
                    />
                  </label>
                </div>
              ) : (
                <div className="p-5 rounded-xl border border-dashed border-[#141413]/25 bg-[#F7F6F2] text-center space-y-4">
                  <div className="flex flex-col items-center gap-2">
                    <FileImage className="w-8 h-8 text-[#9A7B4F]" />
                    <p className="text-sm font-medium text-[#141413]">
                      ارفع صورة روشتة كشف النظر أو التقطها بالكاميرا
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-medium cursor-pointer hover:bg-[#2B2B29]">
                    <Camera className="w-4 h-4" />
                    <span>{uploadingRx ? 'جاري الرفع...' : 'اختيار صورة / تصوير الكشف'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={handleRxImageUpload}
                      className="hidden"
                    />
                  </label>

                  {rxImageUrl && (
                    <div className="pt-2 space-y-2">
                      <img
                        src={rxImageUrl}
                        alt="صورة كشف النظر المرفوعة"
                        className="max-h-52 mx-auto rounded-xl border border-[#141413]/15"
                      />
                      <p className="text-xs text-[#256D4A] font-medium">
                        تم رفع صورة الكشف بنجاح
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Left Column: Totals + Customer Info + Cash on Delivery */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#141413]/10 p-5 sm:p-6 space-y-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#141413]">تفاصيل الفاتورة والاستلام</h2>
            {totals.hasPreorderItem && (
              <span className="px-2.5 py-1 rounded-lg bg-[#F4F1EA] border border-[#9A7B4F]/40 text-xs font-bold text-[#9A7B4F]">
                يشمل حجز مسبق
              </span>
            )}
          </div>

          <div className="bg-[#F7F6F2] rounded-xl p-4 space-y-2.5 text-sm border border-[#141413]/10">
            <div className="flex justify-between text-[#4A4843]">
              <span>إجمالي الإطارات والمنتجات</span>
              <span className="font-mono tabular-nums font-medium text-[#141413]">
                {formatCurrencyEGP(totals.frameSubtotal)}
              </span>
            </div>
            {totals.lensSubtotal > 0 && (
              <div className="flex justify-between text-[#4A4843]">
                <span>إجمالي العدسات الطبية</span>
                <span className="font-mono tabular-nums font-medium text-[#141413]">
                  {formatCurrencyEGP(totals.lensSubtotal)}
                </span>
              </div>
            )}
            <div className="border-t border-[#141413]/10 pt-2.5 flex justify-between text-base font-bold text-[#141413]">
              <span>الإجمالي النهائي</span>
              <span className="font-mono tabular-nums text-lg text-[#9A7B4F]">
                {formatCurrencyEGP(totals.total)}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#9A7B4F]/30 flex items-center gap-3">
            <Truck className="w-5 h-5 text-[#9A7B4F] shrink-0" />
            <div>
              <div className="text-xs font-bold text-[#141413]">
                طريقة الدفع: الدفع عند الاستلام فقط
              </div>
              <div className="text-[11px] text-[#6E6B64]">
                ادفع نقداً للمندوب أو داخل المتجر بعد معاينة طلبك.
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-medium text-[#141413]">
              <span>الاسم الكامل *</span>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-[#141413]">
              <span>رقم الهاتف / واتساب *</span>
              <input
                type="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm text-right"
              />
            </label>

            <label className="block text-xs font-medium text-[#141413]">
              <span>العنوان بالتفصيل (أو اكتب: استلام من الفرع) *</span>
              <textarea
                rows={2}
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="المحافظة، المنطقة، اسم الشارع، رقم العقار..."
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-[#141413]">
              <span>ملاحظات إضافية (اختياري)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مواعيد التوصيل المفضلة أو أي ملاحظة..."
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-5 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29] transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'جاري تأكيد الطلب...'
              : totals.hasPreorderItem
                ? `تأكيد الحجز المسبق (${formatCurrencyEGP(totals.total)} — عند الاستلام)`
                : `تأكيد الطلب (${formatCurrencyEGP(totals.total)} — دفع عند الاستلام)`}
          </button>
        </div>
      </form>
    </div>
  );
}
