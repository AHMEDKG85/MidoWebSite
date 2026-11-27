export type ProductCategory =
  | 'prescription'
  | 'sunglasses'
  | 'contact_lenses'
  | 'accessories';

export interface StoryBeat {
  title: string;
  subtitle: string;
  body: string;
}

export interface ProductVariant {
  id: number;
  productId: number;
  colorName: string;
  colorHex: string;
  stock: number;
  images: string[];
  sortOrder: number;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  category: ProductCategory;
  price: number;
  shortDesc: string;
  fullDesc: string;
  frameShape: string;
  material: string;
  dimensions: string;
  published: boolean;
  allowPreorder: boolean;
  preorderNote: string;
  variants: ProductVariant[];
}

export interface OpticalLens {
  id: number;
  name: string;
  subtitle: string;
  price: number;
  imageUrl: string;
  details: string[];
  fullDescription: string;
  refractiveIndex: string;
  published: boolean;
  sortOrder: number;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  aboutText: string;
  storyBeats: StoryBeat[];
  heroModelUrl: string;
  address: string;
  mapLink: string;
  phones: string[];
  whatsapp: string;
  workingHours: string;
  externalAdminUrl: string;
}

export type OrderType = 'standard' | 'preorder';

export interface CartItem {
  id: string;
  productId: number;
  productSlug: string;
  productName: string;
  category: ProductCategory;
  variantId: number;
  colorName: string;
  colorHex: string;
  imageUrl: string;
  frameImageUrl?: string;
  absoluteImageUrl?: string;
  framePrice: number;
  lensId: number | null;
  lensName: string | null;
  lensPrice: number;
  quantity: number;
  frameShape?: string;
  orderType?: OrderType;
}

export interface EyePrescriptionValues {
  sph: string;
  cyl: string;
  axis: string;
  add: string;
}

export interface PrescriptionPayload {
  mode: 'manual' | 'upload' | 'both';
  od: EyePrescriptionValues;
  os: EyePrescriptionValues;
  ipd: string;
  imageUrl: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type ExternalSyncStatus = 'pending' | 'synced' | 'failed' | 'not_configured';

export interface OrderRecord {
  id: number;
  orderCode: string;
  invoiceNumber: string;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethod: 'cash_on_delivery';
  notes: string;
  items: CartItem[];
  prescription: PrescriptionPayload | null;
  frameSubtotal: number;
  lensSubtotal: number;
  subtotal: number;
  total: number;
  status: OrderStatus;
  externalSyncStatus: ExternalSyncStatus;
  createdAt: string;
  firestoreDocId?: string;
  source?: 'local' | 'cloud' | 'both';
}
