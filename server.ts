import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';
import {
  db,
  getProductBySlug,
  getStoreSettings,
  initDatabase,
  listLenses,
  listOrders,
  listProducts,
  seedDatabaseIfEmpty,
} from './server/db';
import type { CartItem, OrderStatus, ProductCategory } from './src/types';

initDatabase();
seedDatabaseIfEmpty();

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
const CATALOG_UPLOAD_DIR = path.resolve(UPLOAD_ROOT, 'catalog');
const RX_UPLOAD_DIR = path.resolve(UPLOAD_ROOT, 'prescriptions');

fs.mkdirSync(CATALOG_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RX_UPLOAD_DIR, { recursive: true });

// Ephemeral HMAC key if ADMIN_SESSION_SECRET is not provided in env
const SESSION_SIGNING_SECRET =
  process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.trim().length >= 16
    ? process.env.ADMIN_SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

function getConfiguredEnvToken(): string {
  return (process.env.ADMIN_TOKEN || '').trim();
}

function getClaimedAdminHash(): string | null {
  const row = db.prepare('SELECT password_hash FROM admin_auth WHERE id = 1').get() as
    | { password_hash: string }
    | undefined;
  return row ? row.password_hash : null;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hexHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSignedAdminSession(): string {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySignedAdminSession(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(payload)
    .digest('base64url');
  if (!timingSafeStringEqual(sig, expectedSig)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === 'admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const authHeader = req.header('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerToken = (req.header('x-admin-token') || '').trim();

  const envToken = getConfiguredEnvToken();
  if (envToken && headerToken && timingSafeStringEqual(headerToken, envToken)) {
    next();
    return;
  }
  if (bearer && verifySignedAdminSession(bearer)) {
    next();
    return;
  }
  res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول للوحة التحكم.' });
}

const ALLOWED_IMAGE_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function makeMulterUploader(targetDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, targetDir);
      },
      filename: (_req, file, cb) => {
        const ext = ALLOWED_IMAGE_MIME.get(file.mimetype) || '.jpg';
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('يُسمح فقط برفع صور بصيغة JPG أو PNG أو WEBP'));
      }
    },
  });
}

const MODEL_UPLOAD_DIR = path.resolve(UPLOAD_ROOT, 'models');
fs.mkdirSync(MODEL_UPLOAD_DIR, { recursive: true });

const uploadCatalog = makeMulterUploader(CATALOG_UPLOAD_DIR);
const uploadRx = makeMulterUploader(RX_UPLOAD_DIR);

const uploadModel = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, MODEL_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = file.originalname.toLowerCase().endsWith('.gltf') ? '.gltf' : '.glb';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const lower = file.originalname.toLowerCase();
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح فقط برفع ملفات ثلاثية الأبعاد بصيغة GLB أو GLTF'));
    }
  },
});

const categorySchema = z.enum(['prescription', 'sunglasses', 'contact_lenses', 'accessories']);

const variantInputSchema = z.object({
  colorName: z.string().trim().min(1).max(80),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{3,8}$/),
  stock: z.number().int().min(0).max(10000),
  images: z.array(z.string().trim().min(1)).min(1),
});

const productInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().min(2).max(140).optional(),
  category: categorySchema,
  price: z.number().min(0).max(500000),
  shortDesc: z.string().trim().min(2).max(320),
  fullDesc: z.string().trim().min(2).max(2000),
  frameShape: z.string().trim().min(1).max(60).default('round'),
  material: z.string().trim().max(120).default(''),
  dimensions: z.string().trim().max(120).default(''),
  published: z.boolean().default(true),
  allowPreorder: z.boolean().default(false),
  preorderNote: z.string().trim().max(200).optional().default(''),
  variants: z.array(variantInputSchema).min(1),
});

const lensInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  subtitle: z.string().trim().min(2).max(240),
  price: z.number().min(0).max(100000),
  imageUrl: z.string().trim().min(1),
  details: z.array(z.string().trim().min(1)).min(1),
  fullDescription: z.string().trim().min(2).max(1500),
  refractiveIndex: z.string().trim().min(1).max(60).default('1.56'),
  published: z.boolean().default(true),
});

const eyeRxSchema = z.object({
  sph: z.string().trim().max(12),
  cyl: z.string().trim().max(12),
  axis: z.string().trim().max(12),
  add: z.string().trim().max(12).optional().default(''),
});

const orderInputSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(30),
  customerAddress: z.string().trim().min(4).max(400),
  notes: z.string().trim().max(600).optional().default(''),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive(),
        lensId: z.number().int().positive().nullable().optional(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
  prescription: z
    .object({
      mode: z.enum(['manual', 'upload', 'both']),
      od: eyeRxSchema,
      os: eyeRxSchema,
      ipd: z.string().trim().max(12).optional().default(''),
      imageUrl: z.string().trim().max(500).optional().default(''),
    })
    .nullable()
    .optional(),
});

const storyBeatSchema = z.object({
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(160).default(''),
  body: z.string().trim().min(4).max(600),
});

const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2).max(140),
  tagline: z.string().trim().min(2).max(240),
  aboutText: z.string().trim().min(5).max(2000),
  storyBeats: z.array(storyBeatSchema).min(1).max(6).optional(),
  heroModelUrl: z.string().trim().max(500).optional().default(''),
  address: z.string().trim().min(3).max(300),
  mapLink: z.string().trim().max(400),
  phones: z.array(z.string().trim().min(5).max(30)).min(1),
  whatsapp: z.string().trim().max(30),
  workingHours: z.string().trim().min(3).max(200),
  externalAdminUrl: z.string().trim().max(300).optional().default('https://mido-optics-servies.vercel.app'),
});

function slugifyAscii(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${ascii || 'mido-item'}-${suffix}`;
}

function isSafeWebhookUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildAbsoluteAssetUrl(relOrAbs: string, reqHost?: string): string {
  if (!relOrAbs) return '';
  if (
    relOrAbs.startsWith('data:') ||
    relOrAbs.startsWith('https://') ||
    relOrAbs.startsWith('http://')
  ) {
    return relOrAbs;
  }
  const base =
    (process.env.APP_URL || '').trim().replace(/\/+$/, '') ||
    (reqHost ? `https://${reqHost}` : '');
  return base ? `${base}${relOrAbs.startsWith('/') ? '' : '/'}${relOrAbs}` : relOrAbs;
}

async function dispatchOrderToExternalAdmin(
  order: ReturnType<typeof listOrders>[number],
  reqHost?: string,
): Promise<'synced' | 'failed' | 'not_configured'> {
  const rawWebhook = (process.env.EXTERNAL_ADMIN_WEBHOOK_URL || '').trim();
  if (!rawWebhook) return 'not_configured';

  const safeUrl = isSafeWebhookUrl(rawWebhook);
  if (!safeUrl) return 'failed';

  const secret = (process.env.EXTERNAL_SYNC_SECRET || '').trim();
  const payload = {
    event: 'mido.order.created',
    source: 'mido-optics-storefront',
    orderCode: order.orderCode,
    invoiceNumber: order.invoiceNumber,
    orderType: order.orderType,
    paymentMethod: order.paymentMethod,
    status: order.status,
    createdAt: order.createdAt,
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
      address: order.customerAddress,
      notes: order.notes,
    },
    items: order.items.map((item) => {
      const absFrameImg = buildAbsoluteAssetUrl(item.imageUrl || item.frameImageUrl || '', reqHost);
      return {
        productId: item.productId,
        productSlug: item.productSlug,
        productName: item.productName,
        category: item.category,
        colorName: item.colorName,
        colorHex: item.colorHex,
        frameShape: item.frameShape || '',
        imageUrl: item.imageUrl || absFrameImg,
        frameImageUrl: absFrameImg,
        absoluteImageUrl: absFrameImg,
        quantity: item.quantity,
        framePrice: item.framePrice,
        lensName: item.lensName,
        lensPrice: item.lensPrice,
        unitTotal: item.framePrice + item.lensPrice,
        lineTotal: (item.framePrice + item.lensPrice) * item.quantity,
        orderType: item.orderType || order.orderType,
      };
    }),
    prescription: order.prescription
      ? {
          mode: order.prescription.mode,
          rightEye_OD: order.prescription.od,
          leftEye_OS: order.prescription.os,
          ipd: order.prescription.ipd,
          imageUrl: order.prescription.imageUrl,
          absoluteImageUrl: buildAbsoluteAssetUrl(order.prescription.imageUrl, reqHost),
        }
      : null,
    invoice: {
      invoiceNumber: order.invoiceNumber,
      currency: 'EGP',
      frameSubtotal: order.frameSubtotal,
      lensSubtotal: order.lensSubtotal,
      total: order.total,
      paymentMethod: 'cash_on_delivery',
      issuedAt: order.createdAt,
    },
  };

  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret) {
    headers['X-Mido-Signature'] = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(safeUrl.toString(), {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return resp.ok ? 'synced' : 'failed';
  } catch {
    return 'failed';
  }
}

function requireExternalSyncAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const syncSecret = (process.env.EXTERNAL_SYNC_SECRET || '').trim();
  const adminToken = getConfiguredEnvToken();
  const provided =
    (req.header('x-mido-sync-secret') || '').trim() ||
    (req.header('x-sync-secret') || '').trim() ||
    (req.header('x-admin-token') || '').trim() ||
    ((req.header('authorization') || '').startsWith('Bearer ')
      ? (req.header('authorization') || '').slice(7).trim()
      : '');

  if (syncSecret && provided && timingSafeStringEqual(provided, syncSecret)) {
    next();
    return;
  }
  if (adminToken && provided && timingSafeStringEqual(provided, adminToken)) {
    next();
    return;
  }
  res.status(401).json({ error: 'مطلوب مفتاح المزامنة الخارجي (X-Sync-Secret)' });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Allow strictly allowlisted origins (e.g. https://mido-optics-servies.vercel.app) for /api/external/*
  app.use('/api/external', (req, res, next) => {
    const origin = (req.header('origin') || '').trim();
    const configuredUrl = (getStoreSettings().externalAdminUrl || 'https://mido-optics-servies.vercel.app').replace(/\/+$/, '');
    const allowedOrigins = new Set([
      'https://mido-optics-servies.vercel.app',
      configuredUrl,
    ]);
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Secret, X-Admin-Token');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Serve uploaded assets safely with nosniff
  app.use('/uploads', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/uploads', express.static(UPLOAD_ROOT));

  // Public health & store routes
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/store', (_req, res) => {
    res.json(getStoreSettings());
  });

  app.get('/api/products', (req, res) => {
    const rawCategory = req.query.category;
    let category: ProductCategory | undefined;
    if (typeof rawCategory === 'string' && rawCategory.length > 0) {
      const parsed = categorySchema.safeParse(rawCategory);
      if (!parsed.success) {
        res.status(400).json({ error: 'فئة غير صالحة' });
        return;
      }
      category = parsed.data;
    }
    res.json(listProducts({ category, includeUnpublished: false }));
  });

  app.get('/api/products/:slug', (req, res) => {
    const product = getProductBySlug(req.params.slug, false);
    if (!product) {
      res.status(404).json({ error: 'المنتج غير موجود' });
      return;
    }
    res.json(product);
  });

  app.get('/api/lenses', (_req, res) => {
    res.json(listLenses(false));
  });

  // Public prescription photo upload
  app.post('/api/upload-prescription', (req, res) => {
    uploadRx.single('image')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'فشل رفع صورة الكشف' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'لم يتم إرفاق صورة' });
        return;
      }
      res.status(201).json({ url: `/uploads/prescriptions/${req.file.filename}` });
    });
  });

  // Server-authoritative Order & Pre-Order Checkout (Cash on Delivery)
  app.post('/api/orders', async (req, res) => {
    const parsed = orderInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'بيانات الطلب غير مكتملة أو غير صالحة' });
      return;
    }
    const payload = parsed.data;
    const reqHost = req.header('host');

    try {
      const createdOrder = db.transaction(() => {
        const resolvedItems: CartItem[] = [];
        let frameSubtotal = 0;
        let lensSubtotal = 0;
        let hasOpticalRx = false;
        let isPreorder = false;

        for (const item of payload.items) {
          const productRow = db
            .prepare('SELECT * FROM products WHERE id = ? AND published = 1')
            .get(item.productId) as
            | {
                id: number;
                slug: string;
                name: string;
                category: ProductCategory;
                price: number;
                frame_shape: string;
                allow_preorder?: number;
              }
            | undefined;
          if (!productRow) {
            throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
          }

          const variantRow = db
            .prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?')
            .get(item.variantId, item.productId) as
            | {
                id: number;
                color_name: string;
                color_hex: string;
                stock: number;
                images_json: string;
              }
            | undefined;
          if (!variantRow) {
            throw new Error(`VARIANT_NOT_FOUND:${item.variantId}`);
          }

          let itemOrderType: 'standard' | 'preorder' = 'standard';
          if (variantRow.stock < item.quantity) {
            if (productRow.allow_preorder === 1) {
              itemOrderType = 'preorder';
              isPreorder = true;
            } else {
              throw new Error(`OUT_OF_STOCK:${productRow.name} (${variantRow.color_name})`);
            }
          }

          let lensId: number | null = null;
          let lensName: string | null = null;
          let lensPrice = 0;

          if (productRow.category === 'prescription') {
            hasOpticalRx = true;
            if (!item.lensId) {
              throw new Error(`LENS_REQUIRED:${productRow.name}`);
            }
            const lensRow = db
              .prepare('SELECT id, name, price FROM lenses WHERE id = ? AND published = 1')
              .get(item.lensId) as { id: number; name: string; price: number } | undefined;
            if (!lensRow) {
              throw new Error(`LENS_NOT_FOUND:${item.lensId}`);
            }
            lensId = lensRow.id;
            lensName = lensRow.name;
            lensPrice = lensRow.price;
          }

          // Decrement variant stock atomically when fulfilling from existing stock
          if (itemOrderType === 'standard') {
            db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ?').run(
              item.quantity,
              variantRow.id,
            );
          }

          const images = JSON.parse(variantRow.images_json) as string[];
          const frameImg = images[0] || '';
          frameSubtotal += productRow.price * item.quantity;
          lensSubtotal += lensPrice * item.quantity;

          resolvedItems.push({
            id: `${productRow.id}-${variantRow.id}-${lensId || 'none'}`,
            productId: productRow.id,
            productSlug: productRow.slug,
            productName: productRow.name,
            category: productRow.category,
            variantId: variantRow.id,
            colorName: variantRow.color_name,
            colorHex: variantRow.color_hex,
            imageUrl: frameImg,
            frameImageUrl: frameImg,
            absoluteImageUrl: buildAbsoluteAssetUrl(frameImg, reqHost),
            framePrice: productRow.price,
            lensId,
            lensName,
            lensPrice,
            quantity: item.quantity,
            frameShape: productRow.frame_shape,
            orderType: itemOrderType,
          });
        }

        if (hasOpticalRx) {
          const rx = payload.prescription;
          const hasPhoto = Boolean(rx?.imageUrl && rx.imageUrl.trim().length > 0);
          const hasManual = Boolean(
            rx &&
              (rx.od.sph.trim() ||
                rx.os.sph.trim() ||
                rx.od.cyl.trim() ||
                rx.os.cyl.trim() ||
                rx.od.add.trim() ||
                rx.os.add.trim()),
          );
          if (!hasPhoto && !hasManual) {
            throw new Error('PRESCRIPTION_REQUIRED');
          }
        }

        const frameSubRounded = Math.round(frameSubtotal * 100) / 100;
        const lensSubRounded = Math.round(lensSubtotal * 100) / 100;
        const total = Math.round((frameSubRounded + lensSubRounded) * 100) / 100;
        const orderCode = `MDO-${Date.now().toString().slice(-5)}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`;
        const invoiceNumber = `INV-${orderCode}`;
        const orderType = isPreorder ? 'preorder' : 'standard';

        const info = db
          .prepare(`
            INSERT INTO orders (
              order_code, invoice_number, order_type, customer_name, customer_phone, customer_address,
              payment_method, notes, items_json, prescription_json,
              frame_subtotal, lens_subtotal, subtotal, total, status, external_sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, 'cash_on_delivery', ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
          `)
          .run(
            orderCode,
            invoiceNumber,
            orderType,
            payload.customerName,
            payload.customerPhone,
            payload.customerAddress,
            payload.notes || '',
            JSON.stringify(resolvedItems),
            payload.prescription ? JSON.stringify(payload.prescription) : null,
            frameSubRounded,
            lensSubRounded,
            total,
            total,
          );

        return {
          id: Number(info.lastInsertRowid),
          orderCode,
          invoiceNumber,
          orderType: orderType as 'standard' | 'preorder',
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerAddress: payload.customerAddress,
          paymentMethod: 'cash_on_delivery' as const,
          notes: payload.notes || '',
          items: resolvedItems,
          prescription: payload.prescription || null,
          frameSubtotal: frameSubRounded,
          lensSubtotal: lensSubRounded,
          subtotal: total,
          total,
          status: 'pending' as const,
          externalSyncStatus: 'pending' as const,
          createdAt: new Date().toISOString(),
        };
      })();

      const syncResult = await dispatchOrderToExternalAdmin(createdOrder, req.header('host'));
      db.prepare('UPDATE orders SET external_sync_status = ? WHERE id = ?').run(
        syncResult,
        createdOrder.id,
      );

      res.status(201).json({ ...createdOrder, externalSyncStatus: syncResult });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.startsWith('PRODUCT_NOT_FOUND:') ||
        msg.startsWith('VARIANT_NOT_FOUND:') ||
        msg.startsWith('LENS_NOT_FOUND:')
      ) {
        res.status(404).json({
          code: 'CLOUD_CATALOG_FALLBACK',
          error: 'المنتج مرتبط بالكتالوج السحابي، جاري التحويل للحفظ السحابي.',
        });
        return;
      }
      if (msg.startsWith('OUT_OF_STOCK:')) {
        res.status(409).json({ error: `الكمية غير متوفرة حالياً للمنتج: ${msg.split(':')[1]}` });
        return;
      }
      if (msg === 'PRESCRIPTION_REQUIRED') {
        res.status(400).json({ error: 'يرجى كتابة كشف النظر أو رفع صورة الكشف للنظارة الطبية.' });
        return;
      }
      if (msg.startsWith('LENS_REQUIRED:')) {
        res.status(400).json({ error: 'يرجى اختيار نوع العدسات للنظارة الطبية.' });
        return;
      }
      res.status(400).json({ error: 'تعذر إتمام الطلب، يرجى مراجعة البيانات.' });
    }
  });

  // Admin auth status & login / first-run bootstrap
  app.get('/api/admin/auth-status', (_req, res) => {
    const envToken = getConfiguredEnvToken();
    if (envToken) {
      res.json({ mode: 'env' });
      return;
    }
    const hash = getClaimedAdminHash();
    res.json({ mode: hash ? 'claimed' : 'unclaimed' });
  });

  app.post('/api/admin/bootstrap', (req, res) => {
    if (getConfiguredEnvToken()) {
      res.status(403).json({ error: 'تم إعداد رمز الإدارة عبر البيئة بالفعل.' });
      return;
    }
    if (getClaimedAdminHash()) {
      res.status(409).json({ error: 'تم تعيين كلمة مرور الإدارة مسبقاً.' });
      return;
    }
    const schema = z.object({ password: z.string().min(6).max(100) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
      return;
    }
    const hash = hashPassword(parsed.data.password);
    db.prepare('INSERT INTO admin_auth (id, password_hash) VALUES (1, ?)').run(hash);
    const token = createSignedAdminSession();
    res.status(201).json({ token });
  });

  app.post('/api/admin/login', (req, res) => {
    const schema = z.object({ password: z.string().min(1).max(200) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'يرجى إدخال رمز الدخول.' });
      return;
    }
    const secretInput = parsed.data.password.trim();
    const envToken = getConfiguredEnvToken();
    if (envToken) {
      if (!timingSafeStringEqual(secretInput, envToken)) {
        res.status(401).json({ error: 'رمز الإدارة غير صحيح.' });
        return;
      }
      res.json({ token: createSignedAdminSession() });
      return;
    }

    const storedHash = getClaimedAdminHash();
    if (!storedHash) {
      res.status(409).json({ error: 'يرجى إنشاء كلمة مرور الإدارة أولاً.' });
      return;
    }
    if (!verifyPasswordHash(secretInput, storedHash)) {
      res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
      return;
    }
    res.json({ token: createSignedAdminSession() });
  });

  // Admin Protected Routes
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    uploadCatalog.single('image')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'فشل رفع الصورة' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'لم يتم اختيار ملف صورة' });
        return;
      }
      res.status(201).json({ url: `/uploads/catalog/${req.file.filename}` });
    });
  });

  app.post('/api/admin/upload-model', requireAdmin, (req, res) => {
    uploadModel.single('model')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'فشل رفع الموديل ثلاثي الأبعاد' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'لم يتم اختيار ملف GLB أو GLTF' });
        return;
      }
      res.status(201).json({ url: `/uploads/models/${req.file.filename}` });
    });
  });

  app.get('/api/admin/products', requireAdmin, (_req, res) => {
    res.json(listProducts({ includeUnpublished: true }));
  });

  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'يرجى التحقق من جميع حقول المنتج والألوان والصور' });
      return;
    }
    const p = parsed.data;
    const slug = p.slug ? slugifyAscii(p.slug) : slugifyAscii(p.name);

    const productId = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO products (
            slug, name, category, price, short_desc, full_desc, frame_shape,
            material, dimensions, published, allow_preorder, preorder_note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          slug,
          p.name,
          p.category,
          p.price,
          p.shortDesc,
          p.fullDesc,
          p.frameShape,
          p.material,
          p.dimensions,
          p.published ? 1 : 0,
          p.allowPreorder ? 1 : 0,
          p.preorderNote || '',
        );
      const id = Number(result.lastInsertRowid);
      const insertVar = db.prepare(`
        INSERT INTO product_variants (product_id, color_name, color_hex, stock, images_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      p.variants.forEach((v, idx) => {
        insertVar.run(id, v.colorName, v.colorHex, v.stock, JSON.stringify(v.images), idx);
      });
      return id;
    })();

    res.status(201).json({ id: productId, slug });
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'معرف المنتج غير صالح' });
      return;
    }
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'بيانات التعديل غير صالحة' });
      return;
    }
    const p = parsed.data;
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'المنتج غير موجود' });
      return;
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE products
        SET name = ?, category = ?, price = ?, short_desc = ?, full_desc = ?,
            frame_shape = ?, material = ?, dimensions = ?, published = ?,
            allow_preorder = ?, preorder_note = ?
        WHERE id = ?
      `).run(
        p.name,
        p.category,
        p.price,
        p.shortDesc,
        p.fullDesc,
        p.frameShape,
        p.material,
        p.dimensions,
        p.published ? 1 : 0,
        p.allowPreorder ? 1 : 0,
        p.preorderNote || '',
        id,
      );
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id);
      const insertVar = db.prepare(`
        INSERT INTO product_variants (product_id, color_name, color_hex, stock, images_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      p.variants.forEach((v, idx) => {
        insertVar.run(id, v.colorName, v.colorHex, v.stock, JSON.stringify(v.images), idx);
      });
    })();

    res.json({ ok: true });
  });

  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'معرف غير صالح' });
      return;
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/admin/lenses', requireAdmin, (_req, res) => {
    res.json(listLenses(true));
  });

  app.post('/api/admin/lenses', requireAdmin, (req, res) => {
    const parsed = lensInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'يرجى التحقق من جميع بيانات العدسة' });
      return;
    }
    const l = parsed.data;
    const result = db
      .prepare(`
        INSERT INTO lenses (name, subtitle, price, image_url, details_json, full_description, refractive_index, published, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `)
      .run(
        l.name,
        l.subtitle,
        l.price,
        l.imageUrl,
        JSON.stringify(l.details),
        l.fullDescription,
        l.refractiveIndex,
        l.published ? 1 : 0,
      );
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/admin/lenses/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const parsed = lensInputSchema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      res.status(400).json({ error: 'بيانات العدسة غير صالحة' });
      return;
    }
    const l = parsed.data;
    db.prepare(`
      UPDATE lenses
      SET name = ?, subtitle = ?, price = ?, image_url = ?, details_json = ?,
          full_description = ?, refractive_index = ?, published = ?
      WHERE id = ?
    `).run(
      l.name,
      l.subtitle,
      l.price,
      l.imageUrl,
      JSON.stringify(l.details),
      l.fullDescription,
      l.refractiveIndex,
      l.published ? 1 : 0,
      id,
    );
    res.json({ ok: true });
  });

  app.delete('/api/admin/lenses/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'معرف غير صالح' });
      return;
    }
    db.prepare('DELETE FROM lenses WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    res.json(listOrders());
  });

  app.patch('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      res.status(400).json({ error: 'بيانات تحديث الحالة غير صالحة' });
      return;
    }
    const status: OrderStatus = parsed.data.status;
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    res.json({ ok: true });
  });

  app.post('/api/admin/orders/:id/sync', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const found = listOrders().find((o) => o.id === id);
    if (!found) {
      res.status(404).json({ error: 'الطلب غير موجود' });
      return;
    }
    const syncResult = await dispatchOrderToExternalAdmin(found, req.header('host'));
    db.prepare('UPDATE orders SET external_sync_status = ? WHERE id = ?').run(syncResult, id);
    res.json({ status: syncResult, externalSyncStatus: syncResult });
  });

  app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'معرف الطلب غير صالح' });
      return;
    }
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/orders', requireAdmin, (_req, res) => {
    const info = db.prepare('DELETE FROM orders').run();
    res.json({ ok: true, deletedCount: info.changes });
  });

  app.put('/api/admin/store', requireAdmin, (req, res) => {
    const parsed = storeSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'يرجى التحقق من بيانات المتجر' });
      return;
    }
    const s = parsed.data;
    const current = getStoreSettings();
    db.prepare(`
      UPDATE store_settings
      SET store_name = ?, tagline = ?, about_text = ?, story_beats_json = ?,
          hero_model_url = ?, address = ?, map_link = ?, phones_json = ?,
          whatsapp = ?, working_hours = ?, external_admin_url = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      s.storeName,
      s.tagline,
      s.aboutText,
      JSON.stringify(s.storyBeats || current.storyBeats),
      s.heroModelUrl || '',
      s.address,
      s.mapLink,
      JSON.stringify(s.phones),
      s.whatsapp,
      s.workingHours,
      s.externalAdminUrl || 'https://mido-optics-servies.vercel.app',
    );
    res.json(getStoreSettings());
  });

  // --- External Dashboard Remote Control API (https://mido-optics-servies.vercel.app/) ---
  app.get('/api/external/store', requireExternalSyncAuth, (_req, res) => {
    res.json(getStoreSettings());
  });

  app.put('/api/external/store', requireExternalSyncAuth, (req, res) => {
    const parsed = storeSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid store payload' });
      return;
    }
    const s = parsed.data;
    const current = getStoreSettings();
    db.prepare(`
      UPDATE store_settings
      SET store_name = ?, tagline = ?, about_text = ?, story_beats_json = ?,
          hero_model_url = ?, address = ?, map_link = ?, phones_json = ?,
          whatsapp = ?, working_hours = ?, external_admin_url = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      s.storeName,
      s.tagline,
      s.aboutText,
      JSON.stringify(s.storyBeats || current.storyBeats),
      s.heroModelUrl || '',
      s.address,
      s.mapLink,
      JSON.stringify(s.phones),
      s.whatsapp,
      s.workingHours,
      s.externalAdminUrl || 'https://mido-optics-servies.vercel.app',
    );
    res.json(getStoreSettings());
  });

  app.get('/api/external/products', requireExternalSyncAuth, (_req, res) => {
    res.json(listProducts({ includeUnpublished: true }));
  });

  app.post('/api/external/products', requireExternalSyncAuth, (req, res) => {
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product payload' });
      return;
    }
    const p = parsed.data;
    const slug = p.slug ? slugifyAscii(p.slug) : slugifyAscii(p.name);
    const productId = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO products (
            slug, name, category, price, short_desc, full_desc, frame_shape,
            material, dimensions, published, allow_preorder, preorder_note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          slug,
          p.name,
          p.category,
          p.price,
          p.shortDesc,
          p.fullDesc,
          p.frameShape,
          p.material,
          p.dimensions,
          p.published ? 1 : 0,
          p.allowPreorder ? 1 : 0,
          p.preorderNote || '',
        );
      const id = Number(result.lastInsertRowid);
      const insertVar = db.prepare(`
        INSERT INTO product_variants (product_id, color_name, color_hex, stock, images_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      p.variants.forEach((v, idx) => {
        insertVar.run(id, v.colorName, v.colorHex, v.stock, JSON.stringify(v.images), idx);
      });
      return id;
    })();
    res.status(201).json({ id: productId, slug });
  });

  app.put('/api/external/products/:id', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid product id' });
      return;
    }
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product payload' });
      return;
    }
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const p = parsed.data;
    db.transaction(() => {
      db.prepare(`
        UPDATE products
        SET name = ?, category = ?, price = ?, short_desc = ?, full_desc = ?,
            frame_shape = ?, material = ?, dimensions = ?, published = ?,
            allow_preorder = ?, preorder_note = ?
        WHERE id = ?
      `).run(
        p.name,
        p.category,
        p.price,
        p.shortDesc,
        p.fullDesc,
        p.frameShape,
        p.material,
        p.dimensions,
        p.published ? 1 : 0,
        p.allowPreorder ? 1 : 0,
        p.preorderNote || '',
        id,
      );
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id);
      const insertVar = db.prepare(`
        INSERT INTO product_variants (product_id, color_name, color_hex, stock, images_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      p.variants.forEach((v, idx) => {
        insertVar.run(id, v.colorName, v.colorHex, v.stock, JSON.stringify(v.images), idx);
      });
    })();
    res.json({ ok: true });
  });

  app.delete('/api/external/products/:id', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid product id' });
      return;
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/external/lenses', requireExternalSyncAuth, (_req, res) => {
    res.json(listLenses(true));
  });

  app.post('/api/external/lenses', requireExternalSyncAuth, (req, res) => {
    const parsed = lensInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid lens payload' });
      return;
    }
    const l = parsed.data;
    const result = db
      .prepare(`
        INSERT INTO lenses (name, subtitle, price, image_url, details_json, full_description, refractive_index, published, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `)
      .run(
        l.name,
        l.subtitle,
        l.price,
        l.imageUrl,
        JSON.stringify(l.details),
        l.fullDescription,
        l.refractiveIndex,
        l.published ? 1 : 0,
      );
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/external/lenses/:id', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    const parsed = lensInputSchema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      res.status(400).json({ error: 'Invalid lens payload' });
      return;
    }
    const l = parsed.data;
    db.prepare(`
      UPDATE lenses
      SET name = ?, subtitle = ?, price = ?, image_url = ?, details_json = ?,
          full_description = ?, refractive_index = ?, published = ?
      WHERE id = ?
    `).run(
      l.name,
      l.subtitle,
      l.price,
      l.imageUrl,
      JSON.stringify(l.details),
      l.fullDescription,
      l.refractiveIndex,
      l.published ? 1 : 0,
      id,
    );
    res.json({ ok: true });
  });

  app.delete('/api/external/lenses/:id', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid lens id' });
      return;
    }
    db.prepare('DELETE FROM lenses WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/external/orders', requireExternalSyncAuth, (_req, res) => {
    res.json(listOrders());
  });

  app.patch('/api/external/orders/:id/status', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      res.status(400).json({ error: 'Invalid status update' });
      return;
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(parsed.data.status, id);
    res.json({ ok: true });
  });

  app.delete('/api/external/orders/:id', requireExternalSyncAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.delete('/api/external/orders', requireExternalSyncAuth, (_req, res) => {
    const info = db.prepare('DELETE FROM orders').run();
    res.json({ ok: true, deletedCount: info.changes });
  });

  // Vite middleware in development or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIDO OPTICS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
