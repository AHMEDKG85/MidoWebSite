import { useCallback, useEffect, useState } from 'react';
import { Footer } from './components/Footer';
import { Navbar, type AppRoute } from './components/Navbar';
import { testConnection } from './lib/firebase';
import {
  fetchFirestorePublishedLenses,
  fetchFirestorePublishedProducts,
  fetchFirestoreStoreSettings,
} from './lib/firestoreStore';
import { calculateCartTotals, isPreorderAvailable } from './lib/storeLogic';
import { AdminPage } from './pages/AdminPage';
import { ApiDocsPage } from './pages/ApiDocsPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { LensSelectionPage } from './pages/LensSelectionPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import type {
  CartItem,
  OpticalLens,
  OrderType,
  Product,
  ProductVariant,
  StoreSettings,
} from './types';

const DEFAULT_STORE: StoreSettings = {
  storeName: 'ميدو للبصريات | MIDO OPTICS',
  tagline: 'حرفية بصرية تجمع بين دقة القياس وأناقة الإطار',
  aboutText:
    'في ميدو للبصريات نؤمن بأن النظارة قطعة يومية تعبر عن ذوقك وتمنح عينيك راحة كاملة.',
  storyBeats: [
    {
      title: 'لمحة عن ميدو للبصريات',
      subtitle: 'خبرة تمتد لسنوات في العناية بالنظر',
      body: 'بدأنا في قلب المهندسين برؤية واضحة: أن يحصل كل عميل على فحص بصري دقيق وإطار يليق بملامحه دون تعقيد، مع متابعة شخصية قبل الطلب وبعد الاستلام.',
    },
    {
      title: 'تجهيز عدسات بمعايير طبية دقيقة',
      subtitle: 'معمل بصري مجهز بأحدث أجهزة القص والسنترة',
      body: 'ننفذ مقاسات النظر الطبية بدقة متناهية شاملة مقاس القراءة ADD والمسافة بين الحدقتين IPD، مع خيارات العدسات المضغوطة وحماية الشاشات.',
    },
    {
      title: 'معاينة فورية وحجز مسبق مرن',
      subtitle: 'جرب الإطار بالكاميرا وادفع عند الاستلام',
      body: 'سواء اخترت من التشكيلة الجاهزة أو عبر نظام الحجز المسبق للإصدارات الخاصة، يصلك طلبك مع فاتورة مفصلة والدفع نقداً عند الاستلام.',
    },
  ],
  heroModelUrl: '',
  address: 'القاهرة — المهندسين، 42 شارع جامعة الدول العربية',
  mapLink: 'https://maps.google.com',
  phones: ['01012345678', '01198765432'],
  whatsapp: '201012345678',
  workingHours: 'يومياً من 11:00 صباحاً حتى 11:00 مساءً',
  externalAdminUrl: 'https://mido-optics-servies.vercel.app',
};

function resolveInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return { page: 'home' };
  const hash = window.location.hash.replace('#', '').toLowerCase();
  const pageParam = new URLSearchParams(window.location.search).get('page')?.toLowerCase();
  const target = pageParam || hash;
  if (target === 'api') return { page: 'api' };
  if (target === 'admin') return { page: 'admin' };
  if (target === 'optical') return { page: 'optical' };
  if (target === 'sunglasses') return { page: 'sunglasses' };
  if (target === 'contacts') return { page: 'contacts' };
  if (target === 'accessories') return { page: 'accessories' };
  if (target === 'checkout') return { page: 'checkout' };
  return { page: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(resolveInitialRoute);
  const [store, setStore] = useState<StoreSettings>(DEFAULT_STORE);
  const [products, setProducts] = useState<Product[]>([]);
  const [lenses, setLenses] = useState<OpticalLens[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingOpticalFrame, setPendingOpticalFrame] = useState<{
    product: Product;
    variant: ProductVariant;
    orderType: OrderType;
  } | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('mido_cart_v1');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('mido_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  const fetchCatalogData = useCallback(async () => {
    setLoading(true);
    let baseStore: StoreSettings | null = null;
    try {
      const [storeRes, prodRes, lensRes] = await Promise.all([
        fetch('/api/store'),
        fetch('/api/products'),
        fetch('/api/lenses'),
      ]);

      const nextStore: StoreSettings | null = storeRes.ok ? await storeRes.json() : null;
      const nextProducts: Product[] = prodRes.ok ? await prodRes.json() : [];
      const nextLenses: OpticalLens[] = lensRes.ok ? await lensRes.json() : [];
      baseStore = nextStore;

      if (nextStore) setStore(nextStore);
      setProducts(nextProducts);
      setLenses(nextLenses);
    } finally {
      setLoading(false);
    }

    // Verify Cloud Firestore connectivity first, then overlay cloud edits asynchronously
    try {
      const cloudAvailable = await testConnection();
      if (!cloudAvailable) return;

      const [cloudStore, cloudProducts, cloudLenses] = await Promise.all([
        fetchFirestoreStoreSettings(),
        fetchFirestorePublishedProducts(),
        fetchFirestorePublishedLenses(),
      ]);

      if (cloudStore && cloudStore.storeName) {
        setStore({
          ...(baseStore || DEFAULT_STORE),
          ...cloudStore,
          storyBeats:
            cloudStore.storyBeats && cloudStore.storyBeats.length > 0
              ? cloudStore.storyBeats
              : baseStore?.storyBeats || DEFAULT_STORE.storyBeats,
        });
      }
      if (cloudProducts && cloudProducts.length > 0) {
        setProducts(cloudProducts);
      }
      if (cloudLenses && cloudLenses.length > 0) {
        setLenses(cloudLenses);
      }
    } catch {
      // Cloud overlay is optional when offline or unseeded
    }
  }, []);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  const navigate = (nextRoute: AppRoute) => {
    setRoute(nextRoute);
    if (typeof window !== 'undefined') {
      const nextHash =
        nextRoute.page === 'product' ? `#product-${nextRoute.slug}` : `#${nextRoute.page}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectOpticalFrameForLens = (product: Product, variant: ProductVariant) => {
    const orderType: OrderType = isPreorderAvailable(product, variant) ? 'preorder' : 'standard';
    setPendingOpticalFrame({ product, variant, orderType });
    navigate({ page: 'lenses' });
  };

  const handleConfirmFrameWithLens = (lens: OpticalLens) => {
    if (!pendingOpticalFrame) return;
    const { product, variant, orderType } = pendingOpticalFrame;
    const itemId = `${product.id}-${variant.id}-${lens.id}-${orderType}`;

    setCart((prev) => {
      const existing = prev.find((i) => i.id === itemId);
      if (existing) {
        return prev.map((i) =>
          i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          category: product.category,
          variantId: variant.id,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          imageUrl: variant.images[0] || '',
          framePrice: product.price,
          lensId: lens.id,
          lensName: lens.name,
          lensPrice: lens.price,
          quantity: 1,
          frameShape: product.frameShape,
          orderType,
        },
      ];
    });
    setPendingOpticalFrame(null);
    navigate({ page: 'checkout' });
  };

  const handleAddDirectItemToCart = (
    product: Product,
    variant: ProductVariant,
    goToCheckout: boolean,
  ) => {
    const orderType: OrderType = isPreorderAvailable(product, variant) ? 'preorder' : 'standard';
    const itemId = `${product.id}-${variant.id}-none-${orderType}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === itemId);
      if (existing) {
        return prev.map((i) =>
          i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          category: product.category,
          variantId: variant.id,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          imageUrl: variant.images[0] || '',
          framePrice: product.price,
          lensId: null,
          lensName: null,
          lensPrice: 0,
          quantity: 1,
          frameShape: product.frameShape,
          orderType,
        },
      ];
    });
    if (goToCheckout) {
      navigate({ page: 'checkout' });
    }
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const totals = calculateCartTotals(cart);
  const currentProduct =
    route.page === 'product'
      ? products.find((p) => p.slug === route.slug) || null
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#141413]">
      <Navbar route={route} onNavigate={navigate} cartCount={totals.itemCount} />

      <main className="flex-1">
        {route.page === 'home' && (
          <HomePage
            store={store}
            featuredProducts={products.filter(
              (p) => p.category === 'prescription' || p.category === 'sunglasses',
            )}
            onNavigate={navigate}
          />
        )}

        {route.page === 'optical' && (
          <CatalogPage
            category="prescription"
            products={products}
            loading={loading}
            onNavigate={navigate}
          />
        )}

        {route.page === 'sunglasses' && (
          <CatalogPage
            category="sunglasses"
            products={products}
            loading={loading}
            onNavigate={navigate}
          />
        )}

        {route.page === 'contacts' && (
          <CatalogPage
            category="contact_lenses"
            products={products}
            loading={loading}
            onNavigate={navigate}
          />
        )}

        {route.page === 'accessories' && (
          <CatalogPage
            category="accessories"
            products={products}
            loading={loading}
            onNavigate={navigate}
          />
        )}

        {route.page === 'product' && (
          <ProductDetailPage
            product={currentProduct}
            loading={loading}
            onNavigate={navigate}
            onSelectOpticalFrameForLens={handleSelectOpticalFrameForLens}
            onAddDirectItemToCart={handleAddDirectItemToCart}
          />
        )}

        {route.page === 'lenses' && (
          <LensSelectionPage
            selectedFrame={pendingOpticalFrame}
            lenses={lenses}
            loading={loading}
            onNavigate={navigate}
            onConfirmFrameWithLens={handleConfirmFrameWithLens}
          />
        )}

        {route.page === 'checkout' && (
          <CheckoutPage
            cart={cart}
            store={store}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={() => setCart([])}
            onNavigate={navigate}
          />
        )}

        {route.page === 'admin' && <AdminPage onDataUpdated={fetchCatalogData} />}

        {route.page === 'api' && <ApiDocsPage store={store} onNavigate={navigate} />}
      </main>

      <Footer store={store} onNavigate={navigate} />
    </div>
  );
}
