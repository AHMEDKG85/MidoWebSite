import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  OpticalLens,
  OrderRecord,
  OrderStatus,
  Product,
  ProductCategory,
  ProductVariant,
  StoreSettings,
  StoryBeat,
} from '../types';
import { auth, db, ensureFirestoreNetwork, handleFirestoreError, OperationType } from './firebase';
import { pickOrderItemImage, pickPrescriptionImage, resolvePortableImageUrl } from './imageUtils';

function safeSlugId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (cleaned.length >= 2) return cleaned;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `${fallbackPrefix}-${hash.toString(36) || 'item'}`;
}

function stableNumericId(docId: string, prefix: string): number {
  const stripped = docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
  const parsed = Number(stripped);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  let hash = 0;
  for (let i = 0; i < docId.length; i += 1) {
    hash = (hash * 33 + docId.charCodeAt(i)) % 900000;
  }
  return 100000 + Math.abs(hash);
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

export function resolveOrderImageUrl(rawUrl?: string): string {
  return resolvePortableImageUrl(rawUrl);
}

export async function fetchFirestoreStoreSettings(): Promise<StoreSettings | null> {
  if (!db) return null;
  const path = 'store_settings/main';
  try {
    const snap = await getDoc(doc(db, 'store_settings', 'main'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      storeName: String(data.storeName || ''),
      tagline: String(data.tagline || ''),
      aboutText: String(data.aboutText || ''),
      storyBeats: Array.isArray(data.storyBeats) ? (data.storyBeats as StoryBeat[]) : [],
      heroModelUrl: String(data.heroModelUrl || ''),
      address: String(data.address || ''),
      mapLink: String(data.mapLink || ''),
      phones: Array.isArray(data.phones) ? data.phones.map(String) : [],
      whatsapp: String(data.whatsapp || ''),
      workingHours: String(data.workingHours || ''),
      externalAdminUrl: String(data.externalAdminUrl || 'https://mido-optics-servies.vercel.app'),
    };
  } catch (err) {
    console.warn('[firestore] Unable to read store_settings/main:', err);
    return null;
  }
}

export async function fetchFirestorePublishedProducts(): Promise<Product[] | null> {
  if (!db) return null;
  try {
    const q = query(collection(db, 'products'), where('published', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs.map((d) => mapFirestoreProduct(d.id, d.data()));
  } catch (err) {
    console.warn('[firestore] Unable to list published products:', err);
    return null;
  }
}

export async function fetchFirestoreAllProducts(): Promise<Product[]> {
  if (!db) return [];
  await ensureFirestoreNetwork();
  try {
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map((d) => mapFirestoreProduct(d.id, d.data()));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
  }
}

export async function fetchFirestorePublishedLenses(): Promise<OpticalLens[] | null> {
  if (!db) return null;
  try {
    const q = query(collection(db, 'lenses'), where('published', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const list = snap.docs.map((d) => mapFirestoreLens(d.id, d.data()));
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  } catch (err) {
    console.warn('[firestore] Unable to list published lenses:', err);
    return null;
  }
}

export async function fetchFirestoreAllLenses(): Promise<OpticalLens[]> {
  if (!db) return [];
  await ensureFirestoreNetwork();
  try {
    const snap = await getDocs(collection(db, 'lenses'));
    const list = snap.docs.map((d) => mapFirestoreLens(d.id, d.data()));
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'lenses');
  }
}

function mapFirestoreProduct(docId: string, data: Record<string, unknown>): Product {
  const numId = stableNumericId(docId, 'prod-');
  const rawVariants = Array.isArray(data.variants) ? data.variants : [];
  const variants: ProductVariant[] = rawVariants.map((v, idx) => {
    const item = v as Record<string, unknown>;
    return {
      id: Number(item.id) || numId * 100 + idx + 1,
      productId: numId,
      colorName: String(item.colorName || 'أساسي'),
      colorHex: String(item.colorHex || '#141413'),
      stock: Number(item.stock ?? 0),
      images: Array.isArray(item.images) ? item.images.map(String) : [],
      sortOrder: Number(item.sortOrder ?? idx),
    };
  });

  return {
    id: numId,
    slug: String(data.slug || docId),
    name: String(data.name || ''),
    category: (data.category as ProductCategory) || 'prescription',
    price: Number(data.price || 0),
    shortDesc: String(data.shortDesc || ''),
    fullDesc: String(data.fullDesc || ''),
    frameShape: String(data.frameShape || 'round'),
    material: String(data.material || ''),
    dimensions: String(data.dimensions || ''),
    published: Boolean(data.published),
    allowPreorder: Boolean(data.allowPreorder),
    preorderNote: String(data.preorderNote || ''),
    variants,
  };
}

function mapFirestoreLens(docId: string, data: Record<string, unknown>): OpticalLens {
  return {
    id: stableNumericId(docId, 'lens-'),
    name: String(data.name || ''),
    subtitle: String(data.subtitle || ''),
    price: Number(data.price || 0),
    imageUrl: String(data.imageUrl || ''),
    details: Array.isArray(data.details) ? data.details.map(String) : [],
    fullDescription: String(data.fullDescription || ''),
    refractiveIndex: String(data.refractiveIndex || '1.56'),
    published: Boolean(data.published),
    sortOrder: Number(data.sortOrder || 0),
  };
}

export async function createFirestoreOrder(
  order: OrderRecord,
  options?: { throwOnError?: boolean },
): Promise<void> {
  if (!db) {
    if (options?.throwOnError) {
      throw new Error('خدمة الطلبات غير متاحة حالياً. تأكد من الاتصال بالإنترنت.');
    }
    return;
  }
  await ensureFirestoreNetwork();
  const safeOrderCode = order.orderCode.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40) || 'MDO-ORDER';
  const orderId = `ord-${safeSlugId(safeOrderCode, 'ord')}`;
  const path = `orders/${orderId}`;
  try {
    const normalizedItems = order.items.slice(0, 20).map((item) => {
      const resolvedImg = resolveOrderImageUrl(
        item.frameImageUrl || item.absoluteImageUrl || item.imageUrl || item.image || item.photoUrl || item.productImage,
      );
      return {
        id: item.id,
        productId: item.productId,
        productSlug: item.productSlug,
        productName: item.productName,
        category: item.category,
        variantId: item.variantId,
        colorName: item.colorName,
        colorHex: item.colorHex,
        imageUrl: resolvedImg || item.imageUrl,
        frameImageUrl: resolvedImg,
        absoluteImageUrl: resolvedImg,
        image: resolvedImg,
        photoUrl: resolvedImg,
        productImage: resolvedImg,
        frameShape: item.frameShape || '',
        framePrice: Number(item.framePrice) || 0,
        lensId: item.lensId,
        lensName: item.lensName,
        lensPrice: Number(item.lensPrice) || 0,
        quantity: Number(item.quantity) || 1,
        orderType: item.orderType || order.orderType,
      };
    });
    const firstItem = normalizedItems[0];
    const rxImg = pickPrescriptionImage(
      order.prescription as unknown as Record<string, unknown> | null,
      order.prescriptionImageUrl,
    );
    const normalizedRx = order.prescription
      ? {
          ...order.prescription,
          imageUrl: rxImg || order.prescription.imageUrl || '',
          absoluteImageUrl: rxImg || order.prescription.imageUrl || '',
          photoUrl: rxImg || order.prescription.imageUrl || '',
        }
      : null;

    const payload = {
      orderCode: safeOrderCode,
      invoiceNumber: (order.invoiceNumber || `INV-${safeOrderCode}`).slice(0, 40),
      orderType: order.orderType === 'preorder' ? ('preorder' as const) : ('standard' as const),
      userId: auth?.currentUser?.uid ?? null,
      customerName: order.customerName.trim().slice(0, 120),
      customerPhone: order.customerPhone.trim().slice(0, 30),
      customerAddress: order.customerAddress.trim().slice(0, 400),
      paymentMethod: 'cash_on_delivery' as const,
      notes: (order.notes || '').trim().slice(0, 600),
      items: normalizedItems,
      prescription: normalizedRx,
      frameImageUrl: (firstItem?.frameImageUrl || firstItem?.imageUrl || '').slice(0, 450000),
      selectedFrameName: firstItem ? `${firstItem.productName}`.slice(0, 240) : '',
      selectedFrameColor: firstItem ? `${firstItem.colorName}`.slice(0, 120) : '',
      prescriptionImageUrl: rxImg.slice(0, 450000),
      frameSubtotal: Number(order.frameSubtotal) || 0,
      lensSubtotal: Number(order.lensSubtotal) || 0,
      total: Number(order.total) || 0,
      status: 'pending' as const,
      externalSyncStatus: order.externalSyncStatus || 'not_configured',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const writePromise = setDoc(doc(db, 'orders', orderId), payload);
    if (options?.throwOnError) {
      await Promise.race([
        writePromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('انتهت مهلة الاتصال بقاعدة البيانات. تحقق من الإنترنت وحاول مرة أخرى.')),
            12000,
          ),
        ),
      ]);
    } else {
      await Promise.race([
        writePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
  } catch (err) {
    if (options?.throwOnError) {
      if (err instanceof Error && err.message.includes('انتهت مهلة الاتصال')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.CREATE, path);
    }
    console.warn('[firestore] Cloud order backup skipped:', err);
  }
}

export async function saveFirestoreStoreSettings(settings: StoreSettings): Promise<void> {
  if (!db) throw new Error('Firebase غير مهيأ.');
  await ensureFirestoreNetwork();
  const path = 'store_settings/main';
  try {
    const beats =
      settings.storyBeats.length > 0
        ? settings.storyBeats.slice(0, 6)
        : [
            {
              title: 'لمحة عن ميدو للبصريات',
              subtitle: 'خبرة بصرية متكاملة',
              body: settings.aboutText.slice(0, 300),
            },
          ];
    const phones = settings.phones.length > 0 ? settings.phones.slice(0, 6) : ['01012345678'];
    await setDoc(doc(db, 'store_settings', 'main'), {
      storeName: settings.storeName.slice(0, 140),
      tagline: settings.tagline.slice(0, 240),
      aboutText: settings.aboutText.slice(0, 2000),
      storyBeats: beats,
      heroModelUrl: (settings.heroModelUrl || '').slice(0, 500),
      address: settings.address.slice(0, 300),
      mapLink: (settings.mapLink || '').slice(0, 400),
      phones,
      whatsapp: (settings.whatsapp || '').slice(0, 30),
      workingHours: settings.workingHours.slice(0, 200),
      externalAdminUrl: (settings.externalAdminUrl || '').slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveFirestoreProduct(product: Product): Promise<void> {
  if (!db) throw new Error('Firebase غير مهيأ.');
  await ensureFirestoreNetwork();
  const slugId = safeSlugId(product.slug || `prod-${product.id}`, 'prod');
  const path = `products/${slugId}`;
  try {
    await setDoc(doc(db, 'products', slugId), {
      slug: slugId,
      name: product.name.slice(0, 140),
      category: product.category,
      price: Number(product.price) || 0,
      shortDesc: (product.shortDesc || product.name).slice(0, 320),
      fullDesc: (product.fullDesc || product.shortDesc || product.name).slice(0, 2000),
      frameShape: (product.frameShape || 'round').slice(0, 60),
      material: (product.material || '').slice(0, 120),
      dimensions: (product.dimensions || '').slice(0, 120),
      published: Boolean(product.published),
      allowPreorder: Boolean(product.allowPreorder),
      preorderNote: (product.preorderNote || '').slice(0, 200),
      variants: product.variants.slice(0, 15).map((v, idx) => ({
        id: v.id,
        colorName: v.colorName,
        colorHex: v.colorHex,
        stock: Math.max(0, Number(v.stock) || 0),
        images: v.images,
        sortOrder: v.sortOrder ?? idx,
      })),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreProduct(product: Product): Promise<void> {
  if (!db) return;
  await ensureFirestoreNetwork();
  const slugId = safeSlugId(product.slug || `prod-${product.id}`, 'prod');
  const path = `products/${slugId}`;
  try {
    await deleteDoc(doc(db, 'products', slugId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFirestoreLens(lens: OpticalLens): Promise<void> {
  if (!db) throw new Error('Firebase غير مهيأ.');
  await ensureFirestoreNetwork();
  const lensId = `lens-${lens.id}`;
  const path = `lenses/${lensId}`;
  try {
    const details = lens.details.length > 0 ? lens.details.slice(0, 10) : ['عدسة طبية معتمدة'];
    await setDoc(doc(db, 'lenses', lensId), {
      name: lens.name.slice(0, 140),
      subtitle: (lens.subtitle || lens.name).slice(0, 240),
      price: Number(lens.price) || 0,
      imageUrl: (lens.imageUrl || '/src/assets/images/optical_lens_crystal_1795761233547.jpg').slice(0, 450000),
      details,
      fullDescription: (lens.fullDescription || lens.subtitle || lens.name).slice(0, 1500),
      refractiveIndex: (lens.refractiveIndex || '1.56').slice(0, 60),
      published: Boolean(lens.published),
      sortOrder: Math.max(0, Math.min(1000, Number(lens.sortOrder) || 0)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreLens(lensIdNum: number): Promise<void> {
  if (!db) return;
  await ensureFirestoreNetwork();
  const lensId = `lens-${lensIdNum}`;
  const path = `lenses/${lensId}`;
  try {
    await deleteDoc(doc(db, 'lenses', lensId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchFirestoreAdminOrders(): Promise<OrderRecord[]> {
  if (!db) return [];
  await ensureFirestoreNetwork();
  const path = 'orders';
  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d, idx) => {
      const data = d.data();
      const frameSubtotal = Number(data.frameSubtotal || 0);
      const lensSubtotal = Number(data.lensSubtotal || 0);
      const total = Number(data.total || 0);
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const items = rawItems.map((raw) => {
        const it = raw as Record<string, unknown>;
        const bestImg = pickOrderItemImage(it) || resolveOrderImageUrl(String(data.frameImageUrl || ''));
        return {
          ...it,
          imageUrl: bestImg,
          frameImageUrl: bestImg,
          absoluteImageUrl: bestImg,
          image: bestImg,
          photoUrl: bestImg,
          productImage: bestImg,
        };
      }) as OrderRecord['items'];

      const rawRx = (data.prescription as Record<string, unknown> | null) || null;
      const rxImg = pickPrescriptionImage(rawRx, String(data.prescriptionImageUrl || ''));
      const normalizedRx = rawRx
        ? ({
            ...rawRx,
            imageUrl: rxImg,
            absoluteImageUrl: rxImg,
            photoUrl: rxImg,
          } as OrderRecord['prescription'])
        : null;

      return {
        id: idx + 1,
        orderCode: String(data.orderCode || d.id),
        invoiceNumber: String(data.invoiceNumber || `INV-${data.orderCode || d.id}`),
        orderType: data.orderType === 'preorder' ? 'preorder' : 'standard',
        customerName: String(data.customerName || ''),
        customerPhone: String(data.customerPhone || ''),
        customerAddress: String(data.customerAddress || ''),
        paymentMethod: 'cash_on_delivery',
        notes: String(data.notes || ''),
        items,
        prescription: normalizedRx,
        frameImageUrl: String(data.frameImageUrl || items[0]?.frameImageUrl || ''),
        selectedFrameName: String(data.selectedFrameName || items[0]?.productName || ''),
        selectedFrameColor: String(data.selectedFrameColor || items[0]?.colorName || ''),
        prescriptionImageUrl: rxImg,
        frameSubtotal,
        lensSubtotal,
        subtotal: frameSubtotal + lensSubtotal || total,
        total,
        status: (data.status as OrderStatus) || 'pending',
        externalSyncStatus: data.externalSyncStatus || 'not_configured',
        createdAt: timestampToIso(data.createdAt),
        firestoreDocId: d.id,
        source: 'cloud',
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateFirestoreOrderStatus(
  orderCode: string,
  status: OrderStatus,
  firestoreDocId?: string,
): Promise<void> {
  if (!db) return;
  await ensureFirestoreNetwork();
  const orderId = firestoreDocId || `ord-${safeSlugId(orderCode, 'ord')}`;
  const path = `orders/${orderId}`;
  try {
    const snap = await getDoc(doc(db, 'orders', orderId));
    if (!snap.exists()) return;
    await updateDoc(doc(db, 'orders', orderId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreOrder(
  orderCode: string,
  firestoreDocId?: string,
): Promise<void> {
  if (!db) return;
  await ensureFirestoreNetwork();
  const docIds = new Set<string>();
  if (firestoreDocId) docIds.add(firestoreDocId);
  if (orderCode) {
    docIds.add(`ord-${safeSlugId(orderCode, 'ord')}`);
    docIds.add(orderCode);
    try {
      const q = query(collection(db, 'orders'), where('orderCode', '==', orderCode));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        docIds.add(d.id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `orders/${orderCode}`);
    }
  }
  for (const docId of docIds) {
    const path = `orders/${docId}`;
    try {
      await deleteDoc(doc(db, 'orders', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function deleteAllFirestoreOrders(): Promise<number> {
  if (!db) return 0;
  await ensureFirestoreNetwork();
  const path = 'orders';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    let deleted = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'orders', d.id));
      deleted += 1;
    }
    return deleted;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncCatalogToFirestore(payload: {
  store: StoreSettings;
  products: Product[];
  lenses: OpticalLens[];
  deletedOrderCodes?: string[];
}): Promise<{ syncedProducts: number; syncedLenses: number; cleanedOrders: number }> {
  await saveFirestoreStoreSettings(payload.store);
  for (const product of payload.products) {
    await saveFirestoreProduct(product);
  }
  for (const lens of payload.lenses) {
    await saveFirestoreLens(lens);
  }
  let cleanedOrders = 0;
  if (payload.deletedOrderCodes && payload.deletedOrderCodes.length > 0) {
    for (const code of payload.deletedOrderCodes) {
      await deleteFirestoreOrder(code);
      cleanedOrders += 1;
    }
  }
  return {
    syncedProducts: payload.products.length,
    syncedLenses: payload.lenses.length,
    cleanedOrders,
  };
}
