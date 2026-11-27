import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Box,
  Check,
  Cloud,
  ExternalLink,
  FileText,
  ImagePlus,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { InvoiceCard } from '../components/InvoiceCard';
import { SmartImage } from '../components/SmartImage';
import {
  auth,
  signInWithGoogleAdmin,
  signOutFirebase,
} from '../lib/firebase';
import {
  deleteAllFirestoreOrders,
  deleteFirestoreLens,
  deleteFirestoreOrder,
  deleteFirestoreProduct,
  fetchFirestoreAdminOrders,
  fetchFirestoreAllLenses,
  fetchFirestoreAllProducts,
  fetchFirestoreStoreSettings,
  saveFirestoreLens,
  saveFirestoreProduct,
  saveFirestoreStoreSettings,
  syncCatalogToFirestore,
  updateFirestoreOrderStatus,
} from '../lib/firestoreStore';
import { readJsonSafe } from '../lib/safeFetch';
import { formatCurrencyEGP } from '../lib/storeLogic';
import type {
  OpticalLens,
  OrderRecord,
  OrderStatus,
  Product,
  ProductCategory,
  StoreSettings,
  StoryBeat,
} from '../types';

interface AdminPageProps {
  onDataUpdated: () => void;
}

type AdminTab = 'products' | 'lenses' | 'orders' | 'store' | 'cloud';

interface VariantDraft {
  colorName: string;
  colorHex: string;
  stock: number;
  images: string[];
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'جديد',
  confirmed: 'تم التأكيد',
  preparing: 'قيد التجهيز',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

const DEFAULT_BEAT: StoryBeat = {
  title: 'لمحة جديدة عن المحل',
  subtitle: 'تفاصيل الخدمة',
  body: 'اكتب هنا قصة المحل أو الميزة التي تظهر أثناء حركة النظارة ثلاثية الأبعاد.',
};

export function AdminPage({ onDataUpdated }: AdminPageProps) {
  const [authMode, setAuthMode] = useState<'loading' | 'unclaimed' | 'claimed' | 'env'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [lenses, setLenses] = useState<OpticalLens[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [storeForm, setStoreForm] = useState<StoreSettings | null>(null);
  const [phonesText, setPhonesText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState<OrderRecord | null>(null);
  const [confirmClearOrders, setConfirmClearOrders] = useState(false);
  const [deletingOrders, setDeletingOrders] = useState(false);

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState<ProductCategory>('prescription');
  const [pPrice, setPPrice] = useState('1800');
  const [pShape, setPShape] = useState('round');
  const [pMaterial, setPMaterial] = useState('أسيتات إيطالي');
  const [pDimensions, setPDimensions] = useState('50 - 20 - 145 مم');
  const [pShortDesc, setPShortDesc] = useState('');
  const [pFullDesc, setPFullDesc] = useState('');
  const [pPublished, setPPublished] = useState(true);
  const [pAllowPreorder, setPAllowPreorder] = useState(false);
  const [pPreorderNote, setPPreorderNote] = useState('حجز مسبق — التسليم خلال 5 أيام عمل');
  const [pVariants, setPVariants] = useState<VariantDraft[]>([
    {
      colorName: 'أسود مطفي',
      colorHex: '#1D1D1B',
      stock: 5,
      images: ['/src/assets/images/optical_matte_black_1795761230467.jpg'],
    },
  ]);

  // Lens Form State
  const [editingLensId, setEditingLensId] = useState<number | null>(null);
  const [lName, setLName] = useState('');
  const [lSubtitle, setLSubtitle] = useState('');
  const [lPrice, setLPrice] = useState('650');
  const [lIndex, setLIndex] = useState('1.60');
  const [lImageUrl, setLImageUrl] = useState('/src/assets/images/optical_lens_crystal_1795761233547.jpg');
  const [lDetailsText, setLDetailsText] = useState('حماية من الضوء الأزرق\nمقاومة للخدش');
  const [lFullDesc, setLFullDesc] = useState('');
  const [lPublished, setLPublished] = useState(true);

  useEffect(() => {
    fetch('/api/admin/auth-status')
      .then((r) => readJsonSafe<{ mode: 'unclaimed' | 'claimed' | 'env' }>(r))
      .then((parsed) => {
        if (parsed.ok && parsed.isJson && parsed.data?.mode) {
          setAuthMode(parsed.data.mode);
        } else {
          setAuthMode('claimed');
        }
      })
      .catch(() => setAuthMode('claimed'));
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    return unsub;
  }, []);

  const authHeaders = (t: string) => ({
    Authorization: `Bearer ${t}`,
  });

  const mergeOrders = (localList: OrderRecord[], cloudList: OrderRecord[]): OrderRecord[] => {
    const byCode = new Map<string, OrderRecord>();
    for (const o of cloudList) {
      byCode.set(o.orderCode, { ...o, source: 'cloud' });
    }
    for (const o of localList) {
      const existingCloud = byCode.get(o.orderCode);
      if (existingCloud) {
        byCode.set(o.orderCode, {
          ...o,
          firestoreDocId: existingCloud.firestoreDocId,
          source: 'both',
        });
      } else {
        byCode.set(o.orderCode, { ...o, source: 'local' });
      }
    }
    return Array.from(byCode.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  };

  const loadCloudData = async (localOrdersSnapshot?: OrderRecord[]) => {
    try {
      const [cloudOrders, cloudProducts, cloudLenses, cloudStore] = await Promise.all([
        fetchFirestoreAdminOrders(),
        fetchFirestoreAllProducts(),
        fetchFirestoreAllLenses(),
        fetchFirestoreStoreSettings(),
      ]);
      setOrders((prev) => mergeOrders(localOrdersSnapshot ?? prev.filter((o) => o.source !== 'cloud'), cloudOrders));
      if (!token) {
        if (cloudProducts.length > 0) setProducts(cloudProducts);
        if (cloudLenses.length > 0) setLenses(cloudLenses);
        if (cloudStore && cloudStore.storeName) {
          setStoreForm({
            ...cloudStore,
            storyBeats:
              cloudStore.storyBeats && cloudStore.storyBeats.length > 0
                ? cloudStore.storyBeats
                : [DEFAULT_BEAT],
            heroModelUrl: cloudStore.heroModelUrl || '',
            externalAdminUrl:
              cloudStore.externalAdminUrl || 'https://mido-optics-servies.vercel.app',
          });
          setPhonesText((cloudStore.phones || []).join('، '));
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'تعذر تحميل البيانات السحابية من Firebase.',
      );
    }
  };

  useEffect(() => {
    if (!firebaseUser) return;
    void loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  const loadAdminData = async (activeToken: string | null) => {
    let localOrders: OrderRecord[] = [];
    if (activeToken) {
      try {
        const [prodRes, lensRes, ordRes, storeRes] = await Promise.all([
          fetch('/api/admin/products', { headers: authHeaders(activeToken) }),
          fetch('/api/admin/lenses', { headers: authHeaders(activeToken) }),
          fetch('/api/admin/orders', { headers: authHeaders(activeToken) }),
          fetch('/api/store'),
        ]);
        if (prodRes.status === 401) {
          setToken(null);
          return;
        }
        const [prodParsed, lensParsed, ordParsed, storeParsed] = await Promise.all([
          readJsonSafe<Product[]>(prodRes),
          readJsonSafe<OpticalLens[]>(lensRes),
          readJsonSafe<OrderRecord[]>(ordRes),
          readJsonSafe<StoreSettings>(storeRes),
        ]);
        if (
          !prodParsed.isJson ||
          !lensParsed.isJson ||
          !ordParsed.isJson ||
          !storeParsed.isJson ||
          !storeParsed.data
        ) {
          setErrorMessage('تعذر تحميل بيانات لوحة التحكم من الخادم.');
          return;
        }
        const storeData = storeParsed.data;
        localOrders = Array.isArray(ordParsed.data) ? ordParsed.data : [];
        setProducts(Array.isArray(prodParsed.data) ? prodParsed.data : []);
        setLenses(Array.isArray(lensParsed.data) ? lensParsed.data : []);
        setOrders(localOrders.map((o) => ({ ...o, source: 'local' as const })));
        setStoreForm({
          ...storeData,
          storyBeats:
            Array.isArray(storeData.storyBeats) && storeData.storyBeats.length > 0
              ? storeData.storyBeats
              : [DEFAULT_BEAT],
          heroModelUrl: storeData.heroModelUrl || '',
          externalAdminUrl:
            storeData.externalAdminUrl || 'https://mido-optics-servies.vercel.app',
        });
        setPhonesText((storeData.phones || []).join('، '));
      } catch {
        setErrorMessage('تعذر تحميل بيانات لوحة التحكم.');
      }
    }

    if (firebaseUser) {
      await loadCloudData(localOrders);
    }
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'unclaimed' ? '/api/admin/bootstrap' : '/api/admin/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const parsed = await readJsonSafe<{ token?: string; error?: string }>(res);
      if (!parsed.isJson) {
        setAuthError(
          'خادم الإدارة (/api) غير متاح على هذه الاستضافة الثابتة. سجل الدخول بحساب Google بالأسفل لإدارة الطلبات والمنتجات عبر السحابة.',
        );
        return;
      }
      if (!parsed.ok || !parsed.data?.token) {
        setAuthError(parsed.data?.error || 'فشل تسجيل الدخول');
        return;
      }
      setToken(parsed.data.token);
      setPasswordInput('');
      await loadAdminData(parsed.data.token);
    } catch {
      setAuthError('حدث خطأ أثناء الاتصال بالخادم.');
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setAuthError('');
    setStatusMessage('');
    try {
      const user = await signInWithGoogleAdmin();
      setStatusMessage(`تم ربط حساب Firebase بنجاح (${user.email}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google';
      setErrorMessage(msg);
      setAuthError(msg);
    }
  };

  const handleFullCloudSync = async () => {
    if (!storeForm) return;
    setErrorMessage('');
    setStatusMessage('');
    setCloudBusy(true);
    try {
      const phones = phonesText
        .split(/[،,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const summary = await syncCatalogToFirestore({
        store: { ...storeForm, phones },
        products,
        lenses,
        orders,
      });
      setStatusMessage(
        `تمت المزامنة إلى Firebase: ${summary.syncedProducts} منتج، ${summary.syncedLenses} عدسة، ${summary.syncedOrders} طلب جديد.`,
      );
      onDataUpdated();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'تأكد من تسجيل الدخول بحساب الإدارة المعتمد على Google.',
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const uploadAdminImage = async (file: File): Promise<string | null> => {
    if (!token) return null;
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: authHeaders(token),
      body: form,
    });
    const parsed = await readJsonSafe<{ url?: string; error?: string }>(res);
    if (!parsed.isJson || !parsed.ok || !parsed.data?.url) {
      setErrorMessage(parsed.data?.error || 'فشل رفع الصورة');
      return null;
    }
    return parsed.data.url;
  };

  const handleUpload3DModel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !storeForm) return;
    setErrorMessage('');
    const form = new FormData();
    form.append('model', file);
    const res = await fetch('/api/admin/upload-model', {
      method: 'POST',
      headers: authHeaders(token),
      body: form,
    });
    const parsed = await readJsonSafe<{ url?: string; error?: string }>(res);
    if (!parsed.isJson || !parsed.ok || !parsed.data?.url) {
      setErrorMessage(parsed.data?.error || 'فشل رفع ملف 3D');
      return;
    }
    setStoreForm({ ...storeForm, heroModelUrl: parsed.data.url });
    setStatusMessage('تم رفع نموذج النظارة 3D بنجاح، اضغط حفظ بيانات المحل لتثبيته.');
  };

  const handleVariantFileUpload = async (
    variantIdx: number,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMessage('');
    const uploadedUrls: string[] = [];
    for (const file of Array.from(files)) {
      const url = await uploadAdminImage(file);
      if (url) uploadedUrls.push(url);
    }
    if (uploadedUrls.length > 0) {
      setPVariants((prev) =>
        prev.map((v, idx) =>
          idx === variantIdx
            ? { ...v, images: [...v.images.filter(Boolean), ...uploadedUrls] }
            : v,
        ),
      );
      setStatusMessage('تم رفع صور اللون بنجاح.');
    }
  };

  const handleLensFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadAdminImage(file);
    if (url) {
      setLImageUrl(url);
      setStatusMessage('تم رفع صورة العدسة بنجاح.');
    }
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setPName('');
    setPCategory('prescription');
    setPPrice('1800');
    setPShape('round');
    setPMaterial('أسيتات إيطالي');
    setPDimensions('50 - 20 - 145 مم');
    setPShortDesc('');
    setPFullDesc('');
    setPPublished(true);
    setPAllowPreorder(false);
    setPPreorderNote('حجز مسبق — التسليم خلال 5 أيام عمل');
    setPVariants([
      {
        colorName: 'أسود مطفي',
        colorHex: '#1D1D1B',
        stock: 5,
        images: ['/src/assets/images/optical_matte_black_1795761230467.jpg'],
      },
    ]);
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setPName(p.name);
    setPCategory(p.category);
    setPPrice(String(p.price));
    setPShape(p.frameShape);
    setPMaterial(p.material);
    setPDimensions(p.dimensions);
    setPShortDesc(p.shortDesc);
    setPFullDesc(p.fullDesc);
    setPPublished(p.published);
    setPAllowPreorder(Boolean(p.allowPreorder));
    setPPreorderNote(p.preorderNote || 'حجز مسبق — التسليم خلال 5 أيام عمل');
    setPVariants(
      p.variants.map((v) => ({
        colorName: v.colorName,
        colorHex: v.colorHex,
        stock: v.stock,
        images: v.images,
      })),
    );
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!token && !firebaseUser) return;
    setErrorMessage('');
    setStatusMessage('');

    const payload = {
      name: pName.trim(),
      category: pCategory,
      price: Number(pPrice) || 0,
      shortDesc: pShortDesc.trim(),
      fullDesc: pFullDesc.trim(),
      frameShape: pShape,
      material: pMaterial.trim(),
      dimensions: pDimensions.trim(),
      published: pPublished,
      allowPreorder: pAllowPreorder,
      preorderNote: pPreorderNote.trim(),
      variants: pVariants.map((v, idx) => ({
        id: idx + 1,
        productId: editingProductId || Date.now(),
        colorName: v.colorName.trim(),
        colorHex: v.colorHex,
        stock: Math.max(0, Number(v.stock) || 0),
        images: v.images.filter((img) => img.trim().length > 0),
        sortOrder: idx,
      })),
    };

    let savedId = editingProductId || Date.now();
    let savedSlug = `prod-${savedId}`;

    if (token) {
      const url = editingProductId
        ? `/api/admin/products/${editingProductId}`
        : '/api/admin/products';
      const method = editingProductId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await readJsonSafe<{ id?: number; slug?: string; error?: string }>(res);
      if (!parsed.isJson || !parsed.ok || !parsed.data) {
        setErrorMessage(parsed.data?.error || 'تعذر حفظ المنتج');
        return;
      }
      if (parsed.data.id) savedId = parsed.data.id;
      if (parsed.data.slug) savedSlug = parsed.data.slug;
    } else if (editingProductId) {
      const existing = products.find((item) => item.id === editingProductId);
      if (existing?.slug) savedSlug = existing.slug;
    }

    if (firebaseUser) {
      try {
        await saveFirestoreProduct({
          id: savedId,
          slug: savedSlug,
          ...payload,
        });
      } catch (err) {
        if (!token) {
          setErrorMessage(err instanceof Error ? err.message : 'تعذر حفظ المنتج في السحابة');
          return;
        }
      }
    }

    setStatusMessage(editingProductId ? 'تم تحديث المنتج بنجاح.' : 'تمت إضافة المنتج بنجاح.');
    resetProductForm();
    await loadAdminData(token);
    onDataUpdated();
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!token && !firebaseUser) return;
    if (token) {
      await fetch(`/api/admin/products/${product.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
    }
    if (firebaseUser) {
      try {
        await deleteFirestoreProduct(product);
      } catch {
        // ignore if not authorized on Firebase
      }
    }
    await loadAdminData(token);
    onDataUpdated();
  };

  const resetLensForm = () => {
    setEditingLensId(null);
    setLName('');
    setLSubtitle('');
    setLPrice('650');
    setLIndex('1.60');
    setLImageUrl('/src/assets/images/optical_lens_crystal_1795761233547.jpg');
    setLDetailsText('حماية من الضوء الأزرق\nمقاومة للخدش');
    setLFullDesc('');
    setLPublished(true);
  };

  const startEditLens = (l: OpticalLens) => {
    setEditingLensId(l.id);
    setLName(l.name);
    setLSubtitle(l.subtitle);
    setLPrice(String(l.price));
    setLIndex(l.refractiveIndex);
    setLImageUrl(l.imageUrl);
    setLDetailsText(l.details.join('\n'));
    setLFullDesc(l.fullDescription);
    setLPublished(l.published);
  };

  const handleSaveLens = async (e: FormEvent) => {
    e.preventDefault();
    if (!token && !firebaseUser) return;
    setErrorMessage('');
    setStatusMessage('');

    const payload = {
      name: lName.trim(),
      subtitle: lSubtitle.trim(),
      price: Number(lPrice) || 0,
      imageUrl: lImageUrl.trim(),
      details: lDetailsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      fullDescription: lFullDesc.trim(),
      refractiveIndex: lIndex.trim(),
      published: lPublished,
    };

    let savedId = editingLensId || Date.now();
    if (token) {
      const url = editingLensId ? `/api/admin/lenses/${editingLensId}` : '/api/admin/lenses';
      const method = editingLensId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await readJsonSafe<{ id?: number; error?: string }>(res);
      if (!parsed.isJson || !parsed.ok || !parsed.data) {
        setErrorMessage(parsed.data?.error || 'تعذر حفظ العدسة');
        return;
      }
      if (parsed.data.id) savedId = parsed.data.id;
    }

    if (firebaseUser) {
      try {
        await saveFirestoreLens({
          id: savedId,
          ...payload,
          sortOrder: 0,
        });
      } catch (err) {
        if (!token) {
          setErrorMessage(err instanceof Error ? err.message : 'تعذر حفظ العدسة في السحابة');
          return;
        }
      }
    }

    setStatusMessage(editingLensId ? 'تم تحديث العدسة بنجاح.' : 'تمت إضافة العدسة بنجاح.');
    resetLensForm();
    await loadAdminData(token);
    onDataUpdated();
  };

  const handleDeleteLens = async (id: number) => {
    if (!token && !firebaseUser) return;
    if (token) {
      await fetch(`/api/admin/lenses/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
    }
    if (firebaseUser) {
      try {
        await deleteFirestoreLens(id);
      } catch {
        // ignore
      }
    }
    await loadAdminData(token);
    onDataUpdated();
  };

  const handleUpdateOrderStatus = async (order: OrderRecord, status: OrderStatus) => {
    if (!token && !firebaseUser) return;
    if (token && order.source !== 'cloud') {
      await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    }
    if (firebaseUser) {
      try {
        await updateFirestoreOrderStatus(order.orderCode, status, order.firestoreDocId);
      } catch {
        // ignore
      }
    }
    await loadAdminData(token);
  };

  const handleDeleteOrder = async (order: OrderRecord) => {
    if (!token && !firebaseUser) return;
    setErrorMessage('');
    setStatusMessage('');
    setDeletingOrders(true);
    try {
      if (token && order.source !== 'cloud') {
        await fetch(`/api/admin/orders/${order.id}`, {
          method: 'DELETE',
          headers: authHeaders(token),
        });
      }
      if (firebaseUser) {
        await deleteFirestoreOrder(order.orderCode, order.firestoreDocId);
      }
      if (invoiceOrder?.orderCode === order.orderCode) {
        setInvoiceOrder(null);
      }
      setStatusMessage(`تم حذف الطلب ${order.orderCode} نهائياً.`);
      await loadAdminData(token);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر حذف الطلب.');
    } finally {
      setDeletingOrders(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (!token && !firebaseUser) return;
    setErrorMessage('');
    setStatusMessage('');
    setDeletingOrders(true);
    try {
      if (token) {
        await fetch('/api/admin/orders', {
          method: 'DELETE',
          headers: authHeaders(token),
        });
      }
      if (firebaseUser) {
        await deleteAllFirestoreOrders();
      }
      setInvoiceOrder(null);
      setConfirmClearOrders(false);
      setOrders([]);
      setStatusMessage('تم مسح جميع الطلبات بنجاح ويمكنك البدء الآن على نظافة.');
      await loadAdminData(token);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر مسح جميع الطلبات.');
    } finally {
      setDeletingOrders(false);
    }
  };

  const handleRetryExternalSync = async (orderId: number) => {
    if (!token) return;
    setErrorMessage('');
    const res = await fetch(`/api/admin/orders/${orderId}/sync`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    const parsed = await readJsonSafe<{
      status?: string;
      externalSyncStatus?: string;
      error?: string;
    }>(res);
    if (!parsed.isJson || !parsed.ok || !parsed.data) {
      setErrorMessage(parsed.data?.error || 'تعذر مزامنة الطلب');
      return;
    }
    const syncState = parsed.data.externalSyncStatus || parsed.data.status;
    setStatusMessage(
      syncState === 'synced'
        ? 'تم إرسال الطلب بنجاح إلى لوحة التحكم الخارجية.'
        : 'تمت المحاولة؛ تحقق من إعداد EXTERNAL_ADMIN_WEBHOOK_URL في الخادم.',
    );
    await loadAdminData(token);
  };

  const handleSaveStore = async (e: FormEvent) => {
    e.preventDefault();
    if ((!token && !firebaseUser) || !storeForm) return;
    setErrorMessage('');
    setStatusMessage('');
    const phones = phonesText
      .split(/[،,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const updatedStore: StoreSettings = { ...storeForm, phones };
    if (token) {
      const res = await fetch('/api/admin/store', {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStore),
      });
      if (!res.ok) {
        setErrorMessage('تعذر تحديث بيانات المتجر');
        return;
      }
    }
    if (firebaseUser) {
      try {
        await saveFirestoreStoreSettings(updatedStore);
      } catch (err) {
        if (!token) {
          setErrorMessage(err instanceof Error ? err.message : 'تعذر حفظ بيانات المتجر في السحابة');
          return;
        }
      }
    }
    setStatusMessage('تم حفظ بيانات المحل ولمحات القصة بنجاح.');
    onDataUpdated();
  };

  if (!token && !firebaseUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-[#141413]/12 p-6 sm:p-8 space-y-5">
          <form onSubmit={handleAuthSubmit} className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] flex items-center justify-center text-[#141413]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#141413]">لوحة تحكم المتجر</h1>
                <p className="text-xs text-[#6E6B64]">
                  {authMode === 'unclaimed'
                    ? 'إعداد كلمة مرور الإدارة لأول مرة'
                    : authMode === 'env'
                      ? 'أدخل رمز الإدارة (ADMIN_TOKEN)'
                      : 'أدخل كلمة مرور الإدارة للمتابعة'}
                </p>
              </div>
            </div>

            <label className="block text-xs font-medium text-[#141413]">
              <span>{authMode === 'unclaimed' ? 'إنشاء كلمة مرور (6 أحرف فأكثر)' : 'كلمة المرور'}</span>
              <input
                type="password"
                required
                minLength={authMode === 'unclaimed' ? 6 : 1}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authMode === 'loading'}
              className="w-full py-3 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29]"
            >
              {authMode === 'unclaimed' ? 'تعيين كلمة المرور والدخول' : 'دخول للوحة التحكم'}
            </button>
          </form>

          <div className="border-t border-[#141413]/10 pt-4 space-y-2.5">
            <p className="text-[11px] text-[#6E6B64] text-center">
              أو افتح لوحة التحكم السحابية مباشرة بحساب الإدارة المعتمد (مناسب للاستضافة الثابتة):
            </p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-xl bg-[#F4F1EA] border border-[#141413]/15 text-xs font-bold text-[#141413] hover:bg-[#EAE5DC] inline-flex items-center justify-center gap-2"
            >
              <Cloud className="w-4 h-4 text-[#9A7B4F]" />
              <span>تسجيل الدخول بحساب Google (Firebase)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#141413]/10 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#141413]">
            لوحة تحكم المتجر — MIDO OPTICS
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6B64] mt-1">
            إدارة المنتجات والحجز المسبق، أسعار العدسات، الفواتير وكشوف النظر (ADD / IPD)، والمزامنة السحابية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {firebaseUser ? (
            <button
              type="button"
              onClick={() => signOutFirebase()}
              className="px-3.5 py-2 rounded-xl bg-[#F4F1EA] border border-[#141413]/12 text-xs font-medium text-[#141413] inline-flex items-center gap-1.5"
            >
              <Cloud className="w-4 h-4 text-[#256D4A]" />
              <span>{firebaseUser.email}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="px-3.5 py-2 rounded-xl bg-white border border-[#141413]/15 text-xs font-medium text-[#141413] hover:bg-[#F4F1EA] inline-flex items-center gap-1.5"
            >
              <Cloud className="w-4 h-4 text-[#9A7B4F]" />
              <span>ربط حساب Firebase (Google)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setToken(null);
              if (!token && firebaseUser) {
                void signOutFirebase();
              }
            }}
            className="px-4 py-2 rounded-xl bg-white border border-[#141413]/15 text-xs font-medium text-[#141413] hover:bg-[#F4F1EA] inline-flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-print flex items-center gap-2 p-1.5 bg-[#EFECE5] rounded-xl w-fit overflow-x-auto max-w-full">
        {(
          [
            { key: 'products', label: `المنتجات والحجز المسبق (${products.length})` },
            { key: 'lenses', label: `العدسات الطبية (${lenses.length})` },
            { key: 'orders', label: `الطلبات والفواتير (${orders.length})` },
            { key: 'store', label: 'بيانات المحل ولمحات 3D' },
            { key: 'cloud', label: 'الربط السحابي و Vercel' },
          ] as Array<{ key: AdminTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm whitespace-nowrap shrink-0 ${
              activeTab === tab.key
                ? 'bg-white text-[#141413] font-bold border border-[#141413]/15 shadow-sm'
                : 'font-medium text-[#4A4843] hover:text-[#141413] border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="no-print p-3.5 rounded-xl bg-[#256D4A]/10 border border-[#256D4A]/25 text-xs font-medium text-[#256D4A] flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="no-print p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          {errorMessage}
        </div>
      )}

      {/* Tab 1: Products & Pre-Order Controls */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleSaveProduct}
            className="lg:col-span-6 bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#141413]">
                {editingProductId ? 'تعديل منتج' : 'إضافة منتج / نظارة جديدة'}
              </h2>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="text-xs text-[#6E6B64] underline"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium">
                <span>اسم المنتج *</span>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                />
              </label>

              <label className="block text-xs font-medium">
                <span>القسم *</span>
                <select
                  value={pCategory}
                  onChange={(e) => setPCategory(e.target.value as ProductCategory)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                >
                  <option value="prescription">نظارات طبية</option>
                  <option value="sunglasses">نظارات شمسية</option>
                  <option value="contact_lenses">عدسات لاصقة</option>
                  <option value="accessories">إكسسوارات</option>
                </select>
              </label>

              <label className="block text-xs font-medium">
                <span>السعر (ج.م) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  value={pPrice}
                  onChange={(e) => setPPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm"
                />
              </label>

              <label className="block text-xs font-medium">
                <span>شكل الإطار</span>
                <select
                  value={pShape}
                  onChange={(e) => setPShape(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                >
                  <option value="round">دائري</option>
                  <option value="square">مربع</option>
                  <option value="geometric">هندسي</option>
                  <option value="aviator">أفياتور</option>
                  <option value="contact">عدسات لاصقة</option>
                  <option value="accessory">إكسسوار</option>
                </select>
              </label>

              <label className="block text-xs font-medium">
                <span>الخامة</span>
                <input
                  type="text"
                  value={pMaterial}
                  onChange={(e) => setPMaterial(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                />
              </label>

              <label className="block text-xs font-medium">
                <span>المقاسات / الأبعاد</span>
                <input
                  type="text"
                  value={pDimensions}
                  onChange={(e) => setPDimensions(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                />
              </label>
            </div>

            <label className="block text-xs font-medium">
              <span>وصف مختصر *</span>
              <input
                type="text"
                required
                value={pShortDesc}
                onChange={(e) => setPShortDesc(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium">
              <span>التفاصيل الكاملة *</span>
              <textarea
                rows={2}
                required
                value={pFullDesc}
                onChange={(e) => setPFullDesc(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            {/* Color Variants & Separate Images per Color */}
            <div className="space-y-3 pt-2 border-t border-[#141413]/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#141413]">
                  الألوان المتوفرة وصور كل لون
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPVariants((prev) => [
                      ...prev,
                      {
                        colorName: 'بني هافانا',
                        colorHex: '#6F4E37',
                        stock: 5,
                        images: ['/src/assets/images/optical_tortoise_gold_1795761229680.jpg'],
                      },
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#F4F1EA] text-xs font-medium text-[#141413] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة لون آخر</span>
                </button>
              </div>

              {pVariants.map((variant, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 space-y-3"
                >
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <label className="block text-[11px]">
                      <span>اسم اللون</span>
                      <input
                        type="text"
                        required
                        value={variant.colorName}
                        onChange={(e) =>
                          setPVariants((prev) =>
                            prev.map((v, i) =>
                              i === idx ? { ...v, colorName: e.target.value } : v,
                            ),
                          )
                        }
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#141413]/15 text-xs"
                      />
                    </label>
                    <label className="block text-[11px]">
                      <span>كود اللون</span>
                      <input
                        type="color"
                        value={variant.colorHex}
                        onChange={(e) =>
                          setPVariants((prev) =>
                            prev.map((v, i) =>
                              i === idx ? { ...v, colorHex: e.target.value } : v,
                            ),
                          )
                        }
                        className="w-full h-8 mt-1 rounded-lg bg-white border border-[#141413]/15 cursor-pointer"
                      />
                    </label>
                    <label className="block text-[11px]">
                      <span>المخزون</span>
                      <input
                        type="number"
                        min="0"
                        value={variant.stock}
                        onChange={(e) =>
                          setPVariants((prev) =>
                            prev.map((v, i) =>
                              i === idx ? { ...v, stock: Number(e.target.value) } : v,
                            ),
                          )
                        }
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#141413]/15 font-mono text-xs"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {variant.images.map((img, imgIdx) => (
                        <div key={imgIdx} className="relative w-14 h-12 rounded-lg overflow-hidden border border-black/10">
                          <SmartImage src={img} alt={variant.colorName} className="w-full h-full object-cover" />
                          {variant.images.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPVariants((prev) =>
                                  prev.map((v, i) =>
                                    i === idx
                                      ? {
                                          ...v,
                                          images: v.images.filter((_, j) => j !== imgIdx),
                                        }
                                      : v,
                                  ),
                                )
                              }
                              className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      <label className="px-3 py-2 rounded-lg bg-white border border-dashed border-[#141413]/30 text-[11px] font-medium cursor-pointer inline-flex items-center gap-1 hover:bg-[#EFECE5]">
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>رفع صور لهذا اللون</span>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleVariantFileUpload(idx, e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <input
                      type="text"
                      value={variant.images.join(', ')}
                      onChange={(e) =>
                        setPVariants((prev) =>
                          prev.map((v, i) =>
                            i === idx
                              ? {
                                  ...v,
                                  images: e.target.value.split(',').map((s) => s.trim()),
                                }
                              : v,
                          ),
                        )
                      }
                      dir="ltr"
                      placeholder="أو ضع روابط الصور مفصولة بفاصلة..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#141413]/15 font-mono text-[11px]"
                    />
                  </div>

                  {pVariants.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPVariants((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-[11px] text-red-700 underline"
                    >
                      حذف هذا اللون
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Pre-Order & Publishing */}
            <div className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#141413]/10 space-y-2.5">
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={pPublished}
                    onChange={(e) => setPPublished(e.target.checked)}
                    className="accent-[#141413]"
                  />
                  <span>منشور في المتجر</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-[#9A7B4F]">
                  <input
                    type="checkbox"
                    checked={pAllowPreorder}
                    onChange={(e) => setPAllowPreorder(e.target.checked)}
                    className="accent-[#141413]"
                  />
                  <span>إتاحة الحجز المسبق عند نفاد المخزون (stock = 0)</span>
                </label>
              </div>

              {pAllowPreorder && (
                <label className="block text-xs font-medium">
                  <span>رسالة الحجز المسبق للعميل</span>
                  <input
                    type="text"
                    value={pPreorderNote}
                    onChange={(e) => setPPreorderNote(e.target.value)}
                    placeholder="مثال: حجز مسبق — التسليم خلال 5 أيام عمل"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-white border border-[#141413]/15 text-xs"
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29]"
            >
              {editingProductId ? 'حفظ التعديلات' : 'إضافة المنتج للمتجر'}
            </button>
          </form>

          {/* Existing Products List */}
          <div className="lg:col-span-6 space-y-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-[#141413]/10 p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 h-14 rounded-xl overflow-hidden bg-[#ECEAE3] shrink-0">
                    <SmartImage
                      src={p.variants[0]?.images[0] || ''}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-[#141413]">{p.name}</h3>
                      {p.allowPreorder && (
                        <span className="px-2 py-0.5 rounded bg-[#F4F1EA] text-[10px] font-bold text-[#9A7B4F]">
                          حجز مسبق
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#6E6B64]">
                      <span>{p.category}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono tabular-nums">{formatCurrencyEGP(p.price)}</span>
                      <span className="mx-1.5">·</span>
                      <span>{p.variants.length} ألوان</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditProduct(p)}
                    className="px-3 py-1.5 rounded-lg bg-[#F4F1EA] text-xs font-medium text-[#141413]"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(p)}
                    aria-label={`حذف ${p.name}`}
                    className="p-1.5 text-[#8E8A82] hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Optical Lenses */}
      {activeTab === 'lenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleSaveLens}
            className="lg:col-span-5 bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#141413]">
                {editingLensId ? 'تعديل عدسة' : 'إضافة نوع عدسة جديد'}
              </h2>
              {editingLensId && (
                <button
                  type="button"
                  onClick={resetLensForm}
                  className="text-xs text-[#6E6B64] underline"
                >
                  إلغاء
                </button>
              )}
            </div>

            <label className="block text-xs font-medium">
              <span>اسم العدسة *</span>
              <input
                type="text"
                required
                value={lName}
                onChange={(e) => setLName(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium">
              <span>وصف مختصر *</span>
              <input
                type="text"
                required
                value={lSubtitle}
                onChange={(e) => setLSubtitle(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium">
                <span>السعر الإضافي (ج.م) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  value={lPrice}
                  onChange={(e) => setLPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                <span>معامل الانكسار</span>
                <input
                  type="text"
                  value={lIndex}
                  onChange={(e) => setLIndex(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium">صورة العدسة *</span>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-[#141413]/15 shrink-0">
                  <SmartImage src={lImageUrl} alt={lName || 'عدسة'} className="w-full h-full object-cover" />
                </div>
                <label className="px-3.5 py-2 rounded-lg bg-[#F4F1EA] text-xs font-medium cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع صورة العدسة</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLensFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <input
                type="text"
                required
                dir="ltr"
                value={lImageUrl}
                onChange={(e) => setLImageUrl(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-xs"
              />
            </div>

            <label className="block text-xs font-medium">
              <span>مميزات العدسة (سطر لكل ميزة) *</span>
              <textarea
                rows={3}
                required
                value={lDetailsText}
                onChange={(e) => setLDetailsText(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium">
              <span>الشرح التفصيلي *</span>
              <textarea
                rows={2}
                required
                value={lFullDesc}
                onChange={(e) => setLFullDesc(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={lPublished}
                onChange={(e) => setLPublished(e.target.checked)}
                className="accent-[#141413]"
              />
              <span>متاحة للعملاء</span>
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29]"
            >
              {editingLensId ? 'حفظ تعديلات العدسة' : 'إضافة العدسة'}
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {lenses.map((lens) => (
              <div
                key={lens.id}
                className="bg-white rounded-2xl border border-[#141413]/10 p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-[#ECEAE3] shrink-0">
                    <SmartImage
                      src={lens.imageUrl}
                      alt={lens.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#141413]">{lens.name}</h3>
                    <div className="text-xs text-[#6E6B64]">
                      <span>{lens.subtitle}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono tabular-nums">{formatCurrencyEGP(lens.price)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditLens(lens)}
                    className="px-3 py-1.5 rounded-lg bg-[#F4F1EA] text-xs font-medium text-[#141413]"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLens(lens.id)}
                    aria-label={`حذف ${lens.name}`}
                    className="p-1.5 text-[#8E8A82] hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Orders, Prescriptions (OD/OS ADD + IPD) & Invoices */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-[#141413]/10 p-4">
            <div>
              <div className="text-sm font-bold text-[#141413]">
                الطلبات الواردة ({orders.length})
              </div>
              <div className="text-[11px] text-[#6E6B64]">
                تظهر هنا جميع الطلبات مع صورة الشمبر المختارة، كشف النظر، والفاتورة.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAdminData(token)}
                className="px-3.5 py-2 rounded-xl bg-[#F4F1EA] border border-[#141413]/15 text-xs font-medium text-[#141413] hover:bg-[#EAE5DC] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث الطلبات</span>
              </button>

              {orders.length > 0 && !confirmClearOrders && (
                <button
                  type="button"
                  onClick={() => setConfirmClearOrders(true)}
                  disabled={deletingOrders}
                  className="px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 hover:bg-red-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح جميع الطلبات (بدء على نظافة)</span>
                </button>
              )}
            </div>
          </div>

          {confirmClearOrders && (
            <div className="no-print p-4 rounded-2xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-bold text-red-900">
                هل أنت متأكد من حذف جميع الطلبات ({orders.length}) نهائياً من الموقع ومن سحابة Firebase؟
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deletingOrders}
                  onClick={handleClearAllOrders}
                  className="px-4 py-2 rounded-xl bg-red-700 text-white font-bold hover:bg-red-800 disabled:opacity-50"
                >
                  {deletingOrders ? 'جاري المسح...' : 'نعم، احذف جميع الطلبات'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearOrders(false)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#141413]/15 text-[#141413] font-medium"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {invoiceOrder && (
            <div className="space-y-3">
              <div className="no-print flex items-center justify-between">
                <span className="text-sm font-bold text-[#141413]">
                  معاينة الفاتورة الرسمية ({invoiceOrder.invoiceNumber || invoiceOrder.orderCode})
                </span>
                <button
                  type="button"
                  onClick={() => setInvoiceOrder(null)}
                  className="text-xs text-[#6E6B64] underline"
                >
                  إغلاق الفاتورة
                </button>
              </div>
              <InvoiceCard order={invoiceOrder} store={storeForm || undefined} showPrintButton />
            </div>
          )}

          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#141413]/10 p-10 text-center text-sm text-[#6E6B64]">
              لا توجد طلبات واردة حتى الآن.
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={`${order.orderCode}-${order.firestoreDocId || order.id}`}
                className="no-print bg-white rounded-2xl border border-[#141413]/10 p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#141413]/10 pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono tabular-nums font-bold text-sm text-[#141413]">
                        {order.orderCode}
                      </span>
                      <span className="text-xs font-mono text-[#6E6B64]">
                        ({order.invoiceNumber || `INV-${order.orderCode}`})
                      </span>
                      {order.source === 'cloud' && (
                        <span className="px-2 py-0.5 rounded bg-[#EBF3EE] border border-[#256D4A]/30 text-[10px] font-bold text-[#256D4A]">
                          طلب سحابي (Firebase)
                        </span>
                      )}
                      {order.orderType === 'preorder' && (
                        <span className="px-2 py-0.5 rounded bg-[#F4F1EA] border border-[#9A7B4F]/40 text-[10px] font-bold text-[#9A7B4F]">
                          حجز مسبق
                        </span>
                      )}
                      <span className="text-xs text-[#6E6B64]">
                        {new Date(order.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#141413] mt-1">
                      {order.customerName} —{' '}
                      <span className="font-mono tabular-nums" dir="ltr">
                        {order.customerPhone}
                      </span>
                    </div>
                    <div className="text-xs text-[#6E6B64]">{order.customerAddress}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-base font-bold font-mono tabular-nums text-[#9A7B4F]">
                      {formatCurrencyEGP(order.total)}
                    </span>

                    <button
                      type="button"
                      onClick={() => setInvoiceOrder(order)}
                      className="px-3 py-1.5 rounded-lg bg-[#F4F1EA] border border-[#141413]/15 text-xs font-medium text-[#141413] inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>الفاتورة</span>
                    </button>

                    {token && order.source !== 'cloud' && (
                      <button
                        type="button"
                        onClick={() => handleRetryExternalSync(order.id)}
                        title="إرسال / إعادة إرسال إلى موقع الإدارة الخارجي"
                        className="px-3 py-1.5 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-xs font-medium text-[#4A4843] hover:text-[#141413] inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>
                          {order.externalSyncStatus === 'synced'
                            ? 'مُرسل لـ Vercel'
                            : order.externalSyncStatus === 'failed'
                              ? 'إعادة إرسال'
                              : 'مزامنة خارجية'}
                        </span>
                      </button>
                    )}

                    <select
                      value={order.status}
                      onChange={(e) =>
                        handleUpdateOrderStatus(order, e.target.value as OrderStatus)
                      }
                      aria-label={`تحديث حالة الطلب ${order.orderCode}`}
                      className="px-3 py-1.5 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-xs font-medium"
                    >
                      {Object.entries(ORDER_STATUS_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={deletingOrders}
                      onClick={() => void handleDeleteOrder(order)}
                      aria-label={`حذف الطلب ${order.orderCode}`}
                      title="حذف هذا الطلب نهائياً"
                      className="p-2 rounded-lg text-red-700 hover:bg-red-50 border border-red-200/70 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Items with Frame Photo (صورة الشمبر) */}
                <div className="space-y-2.5 text-xs text-[#4A4843]">
                  {order.items.map((item) => {
                    const frameImg = item.imageUrl || item.frameImageUrl || '';
                    return (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F7F6F2]/70 border border-[#141413]/8"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {frameImg && (
                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-[#ECEAE3] border border-[#141413]/12 shrink-0">
                              <SmartImage
                                src={frameImg}
                                alt={item.productName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-[#141413] flex items-center gap-1.5 flex-wrap">
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-[#141413]/20 shrink-0"
                                style={{ backgroundColor: item.colorHex || '#141413' }}
                              />
                              <span>
                                {item.productName} ({item.colorName})
                              </span>
                              <span className="font-mono text-[#6E6B64]">× {item.quantity}</span>
                            </div>
                            {item.lensName && (
                              <div className="text-[#9A7B4F] font-medium">
                                عدسة: {item.lensName}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {frameImg && (
                            <a
                              href={frameImg}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-medium text-[#9A7B4F] underline whitespace-nowrap"
                            >
                              عرض صورة الشمبر
                            </a>
                          )}
                          <span className="font-mono tabular-nums font-bold text-[#141413]">
                            {formatCurrencyEGP((item.framePrice + item.lensPrice) * item.quantity)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Prescription Info */}
                {order.prescription && (
                  <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#141413]">كشف النظر المرفق:</span>
                      {order.prescription.ipd && (
                        <span className="font-mono font-bold text-[#141413]" dir="ltr">
                          IPD: {order.prescription.ipd} mm
                        </span>
                      )}
                    </div>
                    {(order.prescription.od.sph ||
                      order.prescription.os.sph ||
                      order.prescription.od.add ||
                      order.prescription.os.add) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono" dir="ltr">
                        <div>
                          OD (Right): SPH {order.prescription.od.sph || '-'} | CYL{' '}
                          {order.prescription.od.cyl || '-'} | AXIS{' '}
                          {order.prescription.od.axis || '-'} | ADD{' '}
                          {order.prescription.od.add || '-'}
                        </div>
                        <div>
                          OS (Left): SPH {order.prescription.os.sph || '-'} | CYL{' '}
                          {order.prescription.os.cyl || '-'} | AXIS{' '}
                          {order.prescription.os.axis || '-'} | ADD{' '}
                          {order.prescription.os.add || '-'}
                        </div>
                      </div>
                    )}
                    {order.prescription.imageUrl && (
                      <a
                        href={order.prescription.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[#9A7B4F] underline font-medium"
                      >
                        فتح صورة روشتة كشف النظر
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Store Settings, Editable Story Beats & 3D .GLB Model */}
      {activeTab === 'store' && storeForm && (
        <form
          onSubmit={handleSaveStore}
          className="bg-white rounded-2xl border border-[#141413]/10 p-6 max-w-3xl space-y-5"
        >
          <h2 className="text-lg font-bold text-[#141413]">
            تحديث معلومات المحل، لمحة التمرير 3D، والنموذج
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium">
              <span>اسم المتجر *</span>
              <input
                type="text"
                required
                value={storeForm.storeName}
                onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>

            <label className="block text-xs font-medium">
              <span>الشعار النصي *</span>
              <input
                type="text"
                required
                value={storeForm.tagline}
                onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs font-medium">
            <span>نبذة وفكرة المحل العامة *</span>
            <textarea
              rows={3}
              required
              value={storeForm.aboutText}
              onChange={(e) => setStoreForm({ ...storeForm, aboutText: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
            />
          </label>

          {/* Editable Story Beats Shown Alongside the Scroll-Animated 3D Glasses */}
          <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#141413]">
                  محطات &quot;لمحة عن المحل&quot; أثناء التمرير (مثل عرض أبل)
                </h3>
                <p className="text-[11px] text-[#6E6B64]">
                  تتبدل هذه النصوص تلقائياً أثناء حركة الكاميرا حول النظارة 3D في الصفحة الرئيسية.
                </p>
              </div>
              {storeForm.storyBeats.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    setStoreForm({
                      ...storeForm,
                      storyBeats: [...storeForm.storyBeats, { ...DEFAULT_BEAT }],
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#141413]/15 text-xs font-medium inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة محطة</span>
                </button>
              )}
            </div>

            {storeForm.storyBeats.map((beat, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white border border-[#141413]/10 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-[#9A7B4F]">
                  <span>المحطة 0{idx + 1}</span>
                  {storeForm.storyBeats.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setStoreForm({
                          ...storeForm,
                          storyBeats: storeForm.storyBeats.filter((_, j) => j !== idx),
                        })
                      }
                      className="text-red-700 underline font-normal"
                    >
                      حذف
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={beat.title}
                    onChange={(e) =>
                      setStoreForm({
                        ...storeForm,
                        storyBeats: storeForm.storyBeats.map((b, j) =>
                          j === idx ? { ...b, title: e.target.value } : b,
                        ),
                      })
                    }
                    placeholder="عنوان المحطة"
                    className="px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={beat.subtitle}
                    onChange={(e) =>
                      setStoreForm({
                        ...storeForm,
                        storyBeats: storeForm.storyBeats.map((b, j) =>
                          j === idx ? { ...b, subtitle: e.target.value } : b,
                        ),
                      })
                    }
                    placeholder="العنوان الفرعي"
                    className="px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-xs"
                  />
                </div>
                <textarea
                  rows={2}
                  required
                  value={beat.body}
                  onChange={(e) =>
                    setStoreForm({
                      ...storeForm,
                      storyBeats: storeForm.storyBeats.map((b, j) =>
                        j === idx ? { ...b, body: e.target.value } : b,
                      ),
                    })
                  }
                  placeholder="نص لمحة المحل..."
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Real 3D Eyewear Model (.glb / .gltf) Upload or URL */}
          <div className="p-4 rounded-xl bg-[#F4F1EA] border border-[#141413]/12 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#141413]">
                <Box className="w-4 h-4 text-[#9A7B4F]" />
                <span>نموذج النظارة ثلاثي الأبعاد الحقيقي (.GLB / .GLTF)</span>
              </div>
              <label className="px-3.5 py-1.5 rounded-lg bg-white border border-[#141413]/15 text-xs font-medium cursor-pointer inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>رفع ملف .glb</span>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleUpload3DModel}
                  className="hidden"
                />
              </label>
            </div>
            <input
              type="text"
              dir="ltr"
              value={storeForm.heroModelUrl}
              onChange={(e) => setStoreForm({ ...storeForm, heroModelUrl: e.target.value })}
              placeholder="اتركه فارغاً لاستخدام النموذج المدمج أو ضع رابط /uploads/models/....glb"
              className="w-full px-3 py-2 rounded-lg bg-white border border-[#141413]/15 font-mono text-xs"
            />
          </div>

          <label className="block text-xs font-medium">
            <span>العنوان التفصيلي *</span>
            <input
              type="text"
              required
              value={storeForm.address}
              onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
            />
          </label>

          <label className="block text-xs font-medium">
            <span>أرقام الهاتف (مفصولة بفاصلة) *</span>
            <input
              type="text"
              required
              dir="ltr"
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm text-right"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium">
              <span>رقم واتساب</span>
              <input
                type="text"
                dir="ltr"
                value={storeForm.whatsapp}
                onChange={(e) => setStoreForm({ ...storeForm, whatsapp: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              <span>ساعات العمل</span>
              <input
                type="text"
                required
                value={storeForm.workingHours}
                onChange={(e) => setStoreForm({ ...storeForm, workingHours: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium">
              <span>رابط الخريطة (Google Maps)</span>
              <input
                type="url"
                dir="ltr"
                value={storeForm.mapLink}
                onChange={(e) => setStoreForm({ ...storeForm, mapLink: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-xs"
              />
            </label>
            <label className="block text-xs font-medium">
              <span>رابط لوحة التحكم الخارجية (Vercel)</span>
              <input
                type="url"
                dir="ltr"
                value={storeForm.externalAdminUrl}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, externalAdminUrl: e.target.value })
                }
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#F7F6F2] border border-[#141413]/15 font-mono text-xs"
              />
            </label>
          </div>

          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-[#141413] text-white text-sm font-bold hover:bg-[#2B2B29]"
          >
            حفظ بيانات المحل ولمحات التمرير
          </button>
        </form>
      )}

      {/* Tab 5: Firebase Cloud Sync & External Vercel Integration */}
      {activeTab === 'cloud' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Cloud className="w-5 h-5 text-[#9A7B4F]" />
              <h2 className="text-lg font-bold text-[#141413]">
                المزامنة السحابية عبر Firebase (كل الأجهزة)
              </h2>
            </div>
            <p className="text-xs text-[#4A4843] leading-relaxed">
              سجل الدخول بحساب الإدارة المعتمد على Google لدفع وتحديث بيانات المحل والمنتجات والعدسات على سحابة Firebase Firestore بحيث تفتح المتجر من أي جهاز بنفس التعديلات الفورية.
            </p>

            <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 text-xs space-y-1.5">
              <div>
                حالة الحساب:{' '}
                <strong className="text-[#141413]">
                  {firebaseUser ? `متصل (${firebaseUser.email})` : 'غير مسجل الدخول في Firebase'}
                </strong>
              </div>
              <div className="text-[#6E6B64]">
                كل طلب جديد من العملاء يُحفظ تلقائياً في قاعدة البيانات وفي Firebase مع الفاتورة وكشف النظر.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!firebaseUser && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2B2B29]"
                >
                  تسجيل الدخول بحساب Google للإدارة
                </button>
              )}
              <button
                type="button"
                disabled={cloudBusy || !firebaseUser}
                onClick={handleFullCloudSync}
                className="px-5 py-2.5 rounded-xl bg-[#F4F1EA] border border-[#141413]/15 text-xs font-bold text-[#141413] hover:bg-[#EAE5DC] disabled:opacity-50"
              >
                {cloudBusy ? 'جاري المزامنة...' : 'مزامنة المتجر والمنتجات والعدسات الآن'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#141413]/10 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[#141413]">
                ربط لوحة التحكم الخارجية (Vercel)
              </h2>
              <a
                href={storeForm?.externalAdminUrl || 'https://mido-optics-servies.vercel.app'}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#9A7B4F] inline-flex items-center gap-1 underline"
              >
                <span>فتح الموقع الثاني</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-xs text-[#4A4843] leading-relaxed">
              أي طلب جديد (خاصة طلبات النظارات الطبية مع العدسة المختارة ومقاسات OD/OS SPH-CYL-AXIS-ADD و IPD وصورة الكشف والفاتورة والحجز المسبق) يتم إرساله تلقائياً عبر Webhook إلى موقعك الثاني، كما توفر الواجهات التالية تحكماً كاملاً من لوحتك على Vercel:
            </p>

            <div
              dir="ltr"
              className="p-4 rounded-xl bg-[#F7F6F2] border border-[#141413]/10 font-mono text-[11px] text-[#141413] space-y-1.5 overflow-x-auto"
            >
              <div>PUT  /api/external/store</div>
              <div>GET  /api/external/products | POST | PUT /:id | DELETE /:id</div>
              <div>GET  /api/external/lenses   | POST | PUT /:id | DELETE /:id</div>
              <div>GET  /api/external/orders   | PATCH /api/external/orders/:id/status</div>
              <div className="pt-2 text-[#6E6B64]">
                Header: x-mido-sync-secret (or Authorization: Bearer ...)
              </div>
              <div className="text-[#6E6B64]">
                Webhook Target (Server Env): EXTERNAL_ADMIN_WEBHOOK_URL
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
