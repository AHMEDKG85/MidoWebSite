import { useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import { SmartImage } from './SmartImage';
import { buildInvoiceLines, formatCurrencyEGP } from '../lib/storeLogic';
import type { OrderRecord, StoreSettings } from '../types';

interface InvoiceCardProps {
  order: OrderRecord;
  store?: Partial<StoreSettings>;
  showPrintButton?: boolean;
}

export function InvoiceCard({
  order,
  store,
  showPrintButton = true,
}: InvoiceCardProps) {
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const lines = buildInvoiceLines(order);
  const storeName = store?.storeName || 'ميدو للبصريات | MIDO OPTICS';
  const storeAddress = store?.address || 'القاهرة — المهندسين، 42 شارع جامعة الدول العربية';
  const storePhones = store?.phones?.length ? store.phones.join(' / ') : '01012345678';
  const rx = order.prescription;
  const hasManualRx = Boolean(
    rx &&
      (rx.od.sph ||
        rx.od.cyl ||
        rx.od.axis ||
        rx.od.add ||
        rx.os.sph ||
        rx.os.cyl ||
        rx.os.axis ||
        rx.os.add ||
        rx.ipd),
  );

  return (
    <div
      data-testid="invoice-card"
      className="print-invoice bg-white rounded-2xl border border-[#141413]/15 p-6 sm:p-8 space-y-6 text-right"
    >
      {/* Invoice Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#141413]/12 pb-5">
        <div className="space-y-1">
          <div className="text-lg font-bold text-[#141413]">{storeName}</div>
          <div className="text-xs text-[#4A4843]">{storeAddress}</div>
          <div className="text-xs font-mono tabular-nums text-[#6E6B64]" dir="ltr">
            {storePhones}
          </div>
        </div>

        <div className="text-left space-y-1">
          <div className="inline-block px-3 py-1 rounded-lg bg-[#141413] text-white text-xs font-bold">
            {order.orderType === 'preorder' ? 'فاتورة حجز مسبق' : 'فاتورة طلب'}
          </div>
          <div className="text-xs text-[#4A4843]">
            رقم الفاتورة:{' '}
            <strong className="font-mono tabular-nums text-[#141413]" dir="ltr">
              {order.invoiceNumber || `INV-${order.orderCode}`}
            </strong>
          </div>
          <div className="text-xs text-[#4A4843]">
            كود الطلب:{' '}
            <strong className="font-mono tabular-nums text-[#141413]" dir="ltr">
              {order.orderCode}
            </strong>
          </div>
          <div className="text-[11px] text-[#6E6B64]">
            {new Date(order.createdAt).toLocaleString('ar-EG')}
          </div>
        </div>
      </div>

      {/* Customer & Payment Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#F7F6F2] rounded-xl p-4 border border-[#141413]/8 text-xs">
        <div className="space-y-1">
          <div className="text-[#6E6B64]">بيانات العميل</div>
          <div className="font-bold text-sm text-[#141413]">{order.customerName}</div>
          <div className="font-mono tabular-nums text-[#4A4843]" dir="ltr">
            {order.customerPhone}
          </div>
          <div className="text-[#4A4843]">{order.customerAddress}</div>
        </div>
        <div className="space-y-1 sm:text-left">
          <div className="text-[#6E6B64]">تفاصيل الدفع والاستلام</div>
          <div className="font-bold text-[#141413]">الدفع نقداً عند الاستلام</div>
          <div className="text-[#4A4843]">
            نوع الطلب: {order.orderType === 'preorder' ? 'حجز مسبق' : 'طلب فوري'}
          </div>
          {order.notes && <div className="text-[#6E6B64]">ملاحظات: {order.notes}</div>}
        </div>
      </div>

      {/* Itemized Frame + Lens Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#141413]/15 text-[#6E6B64]">
              <th className="py-2.5 text-right font-medium">البند (الإطار / المنتج والعدسة)</th>
              <th className="py-2.5 text-center font-medium">الإطار</th>
              <th className="py-2.5 text-center font-medium">العدسات</th>
              <th className="py-2.5 text-center font-medium">الكمية</th>
              <th className="py-2.5 text-left font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141413]/8">
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    {line.imageUrl && (
                      <div className="w-14 h-11 rounded-lg overflow-hidden bg-[#ECEAE3] border border-[#141413]/10 shrink-0">
                        <SmartImage
                          src={line.imageUrl}
                          alt={line.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-[#141413] flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-[#141413]/20 shrink-0"
                          style={{ backgroundColor: line.colorHex }}
                        />
                        <span>{line.title}</span>
                      </div>
                      <div className="text-[#6E6B64]">{line.subtitle}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-center font-mono tabular-nums">
                  {formatCurrencyEGP(line.framePrice)}
                </td>
                <td className="py-3 text-center font-mono tabular-nums text-[#9A7B4F]">
                  {line.lensPrice > 0 ? formatCurrencyEGP(line.lensPrice) : '—'}
                </td>
                <td className="py-3 text-center font-mono tabular-nums">{line.quantity}</td>
                <td className="py-3 text-left font-mono tabular-nums font-bold text-[#141413]">
                  {formatCurrencyEGP(line.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Eye Prescription Details (OD / OS / ADD / IPD / Photo) */}
      {rx && (
        <div className="bg-[#F7F6F2] rounded-xl p-4 border border-[#141413]/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#141413]">مقاسات كشف النظر المرفقة</h3>
            {rx.ipd && (
              <span className="text-xs font-mono tabular-nums font-bold text-[#141413]" dir="ltr">
                IPD: {rx.ipd} mm
              </span>
            )}
          </div>

          {hasManualRx && (
            <div className="overflow-x-auto" dir="ltr">
              <table className="w-full text-xs font-mono border-collapse text-center bg-white rounded-lg overflow-hidden border border-[#141413]/10">
                <thead className="bg-[#EFECE5] text-[#4A4843]">
                  <tr>
                    <th className="py-1.5 px-2 text-left">Eye</th>
                    <th className="py-1.5 px-2">SPH</th>
                    <th className="py-1.5 px-2">CYL</th>
                    <th className="py-1.5 px-2">AXIS</th>
                    <th className="py-1.5 px-2">ADD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141413]/10">
                  <tr>
                    <td className="py-2 px-2 text-left font-bold">OD (Right)</td>
                    <td className="py-2 px-2">{rx.od.sph || '—'}</td>
                    <td className="py-2 px-2">{rx.od.cyl || '—'}</td>
                    <td className="py-2 px-2">{rx.od.axis || '—'}</td>
                    <td className="py-2 px-2">{rx.od.add || '—'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2 text-left font-bold">OS (Left)</td>
                    <td className="py-2 px-2">{rx.os.sph || '—'}</td>
                    <td className="py-2 px-2">{rx.os.cyl || '—'}</td>
                    <td className="py-2 px-2">{rx.os.axis || '—'}</td>
                    <td className="py-2 px-2">{rx.os.add || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {rx.imageUrl && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <img
                src={rx.imageUrl}
                alt="صورة روشتة كشف النظر"
                className="h-20 w-auto rounded-lg border border-[#141413]/15 object-cover cursor-pointer"
                onClick={() =>
                  setPreviewImage({ src: rx.imageUrl, title: `صورة كشف النظر — ${order.orderCode}` })
                }
              />
              <button
                type="button"
                onClick={() =>
                  setPreviewImage({ src: rx.imageUrl, title: `صورة كشف النظر — ${order.orderCode}` })
                }
                className="no-print text-xs font-medium text-[#9A7B4F] underline"
              >
                عرض صورة الكشف بالحجم الكامل
              </button>
            </div>
          )}
        </div>
      )}

      {/* Totals Breakdown */}
      <div className="border-t border-[#141413]/12 pt-4 space-y-2 text-sm">
        <div className="flex justify-between text-[#4A4843]">
          <span>مجموع الإطارات والمنتجات</span>
          <span className="font-mono tabular-nums">{formatCurrencyEGP(order.frameSubtotal)}</span>
        </div>
        {order.lensSubtotal > 0 && (
          <div className="flex justify-between text-[#4A4843]">
            <span>مجموع العدسات الطبية</span>
            <span className="font-mono tabular-nums">{formatCurrencyEGP(order.lensSubtotal)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-[#141413]/10 text-base font-bold text-[#141413]">
          <span>الإجمالي المطلوب عند الاستلام</span>
          <span className="font-mono tabular-nums text-xl text-[#9A7B4F]">
            {formatCurrencyEGP(order.total)}
          </span>
        </div>
      </div>

      {showPrintButton && (
        <div className="no-print pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-[#F4F1EA] border border-[#141413]/15 text-xs font-bold text-[#141413] hover:bg-[#EAE5DC] inline-flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة / حفظ الفاتورة PDF</span>
          </button>
        </div>
      )}
      {previewImage && (
        <div
          className="no-print fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewImage.title}
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#141413]/10 pb-2.5">
              <h4 className="text-sm font-bold text-[#141413]">{previewImage.title}</h4>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.src}
                  download={`${order.orderCode || 'mido'}-image.jpg`}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F1EA] text-xs font-bold text-[#141413] inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>حفظ</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  aria-label="إغلاق المعاينة"
                  className="p-1.5 rounded-lg bg-[#141413]/8 text-[#141413]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={previewImage.src}
              alt={previewImage.title}
              className="w-full max-h-[75vh] object-contain rounded-xl bg-[#F7F6F2]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
