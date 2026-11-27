import type { StoreSettings } from '../types';
import type { AppRoute } from './Navbar';

interface FooterProps {
  store: StoreSettings;
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ store, onNavigate }: FooterProps) {
  return (
    <footer className="no-print border-t border-[#141413]/10 bg-[#EFECE5] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-lg font-bold text-[#141413] mb-2">{store.storeName}</h3>
          <p className="text-sm text-[#4A4843] leading-relaxed">{store.tagline}</p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-[#141413] mb-3">أقسام المتجر</h4>
          <ul className="space-y-2 text-sm text-[#4A4843]">
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'optical' })}
                className="hover:text-[#141413] transition-colors"
              >
                النظارات الطبية
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'sunglasses' })}
                className="hover:text-[#141413] transition-colors"
              >
                النظارات الشمسية
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'contacts' })}
                className="hover:text-[#141413] transition-colors"
              >
                العدسات اللاصقة
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'accessories' })}
                className="hover:text-[#141413] transition-colors"
              >
                الإكسسوارات
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-[#141413] mb-3">التواصل والفرع</h4>
          {store.address && <p className="text-sm text-[#4A4843] mb-2">{store.address}</p>}
          <div className="flex flex-wrap gap-3 text-sm font-mono tabular-nums text-[#141413] mb-2">
            {store.phones.map((phone) => (
              <a
                key={phone}
                href={`tel:${phone}`}
                dir="ltr"
                className="hover:text-[#9A7B4F] transition-colors"
              >
                {phone}
              </a>
            ))}
          </div>
          {store.workingHours && <p className="text-xs text-[#6E6B64]">{store.workingHours}</p>}
        </div>
      </div>

      <div className="border-t border-[#141413]/10 py-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E6B64]">
        <span>© {new Date().getFullYear()} {store.storeName} · الدفع نقداً عند الاستلام</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate({ page: 'api' })}
            className="font-medium text-[#4A4843] hover:text-[#141413] underline underline-offset-4"
          >
            صفحة الـ API والربط
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'admin' })}
            className="font-medium text-[#4A4843] hover:text-[#141413] underline underline-offset-4"
          >
            لوحة التحكم
          </button>
        </div>
      </div>
    </footer>
  );
}
