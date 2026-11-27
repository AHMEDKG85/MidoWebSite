import { useCallback, useEffect, useState } from 'react';
import { Footer } from './components/Footer';
import { Navbar, type AppRoute } from './components/Navbar';
import { testConnection } from './lib/firebase';
import {
  fetchFirestorePublishedLenses,
  fetchFirestorePublishedProducts,
  fetchFirestoreStoreSettings,
} from './lib/firestoreStore';
import { readJsonSafe } from './lib/safeFetch';
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
  aboutText: 'أضف نبذة المحل من لوحة التحكم لتظهر هنا.',
  storyBeats: [
    {
      title: 'لمحة عن ميدو للبصريات',
      subtitle: 'تعرف على المحل',
      body: 'اكتب نبذة المحل وتفاصيله من لوحة التحكم.',
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
  ],
  heroModelUrl: '',
  address: '',
  mapLink: '',
  phones: [],
  whatsapp: '',
  workingHours: '',
  externalAdminUrl: '',
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
    let hasServerCatalog = false;
    try {
      const [storeRes, prodRes, lensRes] = await Promise.all([
        fetch('/api/store'),
        fetch('/api/products'),
        fetch('/api/lenses'),
      ]);

      const [storeParsed, prodParsed, lensParsed] = await Promise.all([
        readJsonSafe<StoreSettings>(storeRes),
        readJsonSafe<Product[]>(prodRes),
        readJsonSafe<OpticalLens[]>(lensRes),
      ]);

      const nextStore: StoreSettings | null =
        storeParsed.ok && storeParsed.isJson ? storeParsed.data : null;
      const nextProducts: Product[] =
        prodParsed.ok && prodParsed.isJson && Array.isArray(prodParsed.data) ? prodParsed.data : [];
      const nextLenses: OpticalLens[] =
        lensParsed.ok && lensParsed.isJson && Array.isArray(lensParsed.data) ? lensParsed.data : [];
      hasServerCatalog =
        storeParsed.ok &&
        storeParsed.isJson &&
        prodParsed.ok &&
        prodParsed.isJson &&
        lensParsed.ok &&
        lensParsed.isJson;
      baseStore = nextStore;

      if (nextStore) setStore(nextStore);
      if (hasServerCatalog) {
        setProducts(nextProducts);
        setLenses(nextLenses);
      }
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

      if (!hasServerCatalog && cloudStore && cloudStore.storeName) {
        setStore({
          ...(baseStore || DEFAULT_STORE),
          ...cloudStore,
          storyBeats:
            cloudStore.storyBeats && cloudStore.storyBeats.length > 0
              ? cloudStore.storyBeats
              : baseStore?.storyBeats || DEFAULT_STORE.storyBeats,
        });
      }
      if (!hasServerCatalog && cloudProducts && cloudProducts.length > 0) {
        setProducts(cloudProducts);
      }
      if (!hasServerCatalog && cloudLenses && cloudLenses.length > 0) {
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
