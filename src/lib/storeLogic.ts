import type {
  CartItem,
  OrderRecord,
  PrescriptionPayload,
  Product,
  ProductCategory,
  ProductVariant,
} from '../types';

export interface CartTotals {
  frameSubtotal: number;
  lensSubtotal: number;
  total: number;
  itemCount: number;
  hasPrescriptionOpticalItem: boolean;
  hasPreorderItem: boolean;
}

export function requiresLensStep(category: ProductCategory): boolean {
  return category === 'prescription';
}

export function getSelectedVariant(
  product: Product,
  selectedVariantId: number | null,
): ProductVariant | null {
  if (!product.variants.length) return null;
  if (selectedVariantId !== null) {
    const found = product.variants.find((v) => v.id === selectedVariantId);
    if (found) return found;
  }
  return product.variants[0];
}

export function getVariantImagesOnly(
  product: Product,
  selectedVariantId: number | null,
): string[] {
  const variant = getSelectedVariant(product, selectedVariantId);
  if (!variant) return [];
  return variant.images.filter((img) => typeof img === 'string' && img.trim().length > 0);
}

export function isPreorderAvailable(
  product: Pick<Product, 'allowPreorder'>,
  variant: Pick<ProductVariant, 'stock'> | null,
): boolean {
  if (!variant) return false;
  return variant.stock <= 0 && Boolean(product.allowPreorder);
}

export function canOrderVariant(
  product: Pick<Product, 'allowPreorder'>,
  variant: Pick<ProductVariant, 'stock'> | null,
): boolean {
  if (!variant) return false;
  return variant.stock > 0 || Boolean(product.allowPreorder);
}

export function calculateItemUnitTotal(item: Pick<CartItem, 'framePrice' | 'lensPrice'>): number {
  const frame = Number.isFinite(item.framePrice) ? Math.max(0, item.framePrice) : 0;
  const lens = Number.isFinite(item.lensPrice) ? Math.max(0, item.lensPrice) : 0;
  return Math.round((frame + lens) * 100) / 100;
}

export function calculateCartTotals(items: CartItem[]): CartTotals {
  let frameSubtotal = 0;
  let lensSubtotal = 0;
  let itemCount = 0;
  let hasPrescriptionOpticalItem = false;
  let hasPreorderItem = false;

  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.quantity || 1));
    const frame = Math.max(0, Number(item.framePrice) || 0);
    const lens = Math.max(0, Number(item.lensPrice) || 0);
    frameSubtotal += frame * qty;
    lensSubtotal += lens * qty;
    itemCount += qty;
    if (item.category === 'prescription') {
      hasPrescriptionOpticalItem = true;
    }
    if (item.orderType === 'preorder') {
      hasPreorderItem = true;
    }
  }

  return {
    frameSubtotal: Math.round(frameSubtotal * 100) / 100,
    lensSubtotal: Math.round(lensSubtotal * 100) / 100,
    total: Math.round((frameSubtotal + lensSubtotal) * 100) / 100,
    itemCount,
    hasPrescriptionOpticalItem,
    hasPreorderItem,
  };
}

export function validateAxisValue(axis: string): boolean {
  const trimmed = axis.trim();
  if (!trimmed) return true;
  const num = Number(trimmed);
  return Number.isInteger(num) && num >= 0 && num <= 180;
}

export function validateDiopterValue(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return true;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= -20 && num <= 20;
}

export function validateIpdValue(ipd: string): boolean {
  const trimmed = ipd.trim();
  if (!trimmed) return true;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 35 && num <= 85;
}

export function validatePrescription(
  prescription: PrescriptionPayload | null,
  required: boolean,
): { valid: boolean; error?: string } {
  if (!required) return { valid: true };
  if (!prescription) {
    return {
      valid: false,
      error: 'يرجى إدخال مقاس كشف النظر (SPH / CYL / AXIS / ADD) أو رفع صورة الكشف.',
    };
  }

  const hasPhoto = Boolean(prescription.imageUrl && prescription.imageUrl.trim().length > 0);
  const hasManual = Boolean(
    prescription.od.sph.trim() ||
      prescription.os.sph.trim() ||
      prescription.od.cyl.trim() ||
      prescription.os.cyl.trim() ||
      prescription.od.add.trim() ||
      prescription.os.add.trim(),
  );

  if (!hasPhoto && !hasManual) {
    return {
      valid: false,
      error: 'يرجى إدخال مقاسات العين (SPH على الأقل) أو رفع صورة روشتة الكشف.',
    };
  }

  if (hasManual) {
    const checks = [
      validateDiopterValue(prescription.od.sph),
      validateDiopterValue(prescription.od.cyl),
      validateDiopterValue(prescription.od.add),
      validateDiopterValue(prescription.os.sph),
      validateDiopterValue(prescription.os.cyl),
      validateDiopterValue(prescription.os.add),
    ];
    if (checks.some((ok) => !ok)) {
      return {
        valid: false,
        error: 'قيم SPH و CYL و ADD يجب أن تكون أرقاماً صالحة بين -20 و +20.',
      };
    }

    if (
      !validateAxisValue(prescription.od.axis) ||
      !validateAxisValue(prescription.os.axis)
    ) {
      return {
        valid: false,
        error: 'قيمة AXIS يجب أن تكون رقماً صحيحاً بين 0 و 180.',
      };
    }

    if (!validateIpdValue(prescription.ipd)) {
      return {
        valid: false,
        error: 'قيمة IPD يجب أن تكون بالملليمتر بين 35 و 85 (مثال: 63).',
      };
    }
  }

  return { valid: true };
}

export function formatCurrencyEGP(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ج.م`;
}

export interface InvoiceLine {
  title: string;
  subtitle: string;
  imageUrl: string;
  colorHex: string;
  framePrice: number;
  lensPrice: number;
  quantity: number;
  lineTotal: number;
}

export function buildInvoiceLines(order: Pick<OrderRecord, 'items'>): InvoiceLine[] {
  return order.items.map((item) => {
    const unit = calculateItemUnitTotal(item);
    return {
      title: `${item.productName} (${item.colorName})`,
      subtitle: item.lensName ? `عدسات: ${item.lensName}` : 'بدون عدسات طبية',
      imageUrl: item.imageUrl || item.frameImageUrl || '',
      colorHex: item.colorHex || '#141413',
      framePrice: item.framePrice,
      lensPrice: item.lensPrice,
      quantity: item.quantity,
      lineTotal: Math.round(unit * item.quantity * 100) / 100,
    };
  });
}
