import { useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';

export type AppRoute =
  | { page: 'home' }
  | { page: 'optical' }
  | { page: 'sunglasses' }
  | { page: 'contacts' }
  | { page: 'accessories' }
  | { page: 'product'; slug: string }
  | { page: 'lenses' }
  | { page: 'checkout' }
  | { page: 'admin' }
  | { page: 'api' };

interface NavbarProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  cartCount: number;
}

const NAV_ITEMS: Array<{ label: string; page: AppRoute['page'] }> = [
  { label: 'الرئيسية', page: 'home' },
  { label: 'نظارات طبية', page: 'optical' },
  { label: 'نظارات شمسية', page: 'sunglasses' },
  { label: 'عدسات لاصقة', page: 'contacts' },
  { label: 'إكسسوارات', page: 'accessories' },
];

export function Navbar({ route, onNavigate, cartCount }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (page: AppRoute['page']) => {
    setMobileOpen(false);
    onNavigate({ page } as AppRoute);
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-[#F7F6F2]/95 border-b border-[#141413]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            handleNav('home');
          }}
          className="text-lg sm:text-xl font-bold tracking-tight text-[#141413] whitespace-nowrap shrink-0"
        >
          MIDO OPTICS
        </a>

        {/* Zone 2: 5 Clean Single-Line Nav Links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4A4843]"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = route.page === item.page;
            return (
              <a
                key={item.page}
                href={`#${item.page}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.page);
                }}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-[#141413] text-[#141413] font-bold'
                    : 'border-transparent hover:text-[#141413] hover:border-[#141413]/30'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action (Cart / Checkout) + Mobile Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('checkout')}
            aria-label={`سلة المشتريات (${cartCount})`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#141413] text-white text-xs sm:text-sm font-medium hover:bg-[#2B2B29] transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>السلة</span>
            <span className="font-mono tabular-nums text-[#E5C996]">({cartCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={mobileOpen}
            className="md:hidden p-2 rounded-lg text-[#141413] hover:bg-[#EAE5DC] transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <nav
          aria-label="قائمة الجوال"
          className="md:hidden border-t border-[#141413]/10 bg-[#F7F6F2] px-4 py-3 flex flex-col gap-1"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = route.page === item.page;
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => handleNav(item.page)}
                className={`w-full text-right px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#141413] text-white'
                    : 'text-[#141413] hover:bg-[#EAE5DC]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
