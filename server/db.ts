import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  OpticalLens,
  OrderRecord,
  OrderStatus,
  Product,
  ProductCategory,
  ProductVariant,
  StoreSettings,
} from '../src/types';

const DEFAULT_DB_PATH = process.env.DATABASE_PATH || './data/mido.sqlite';
const resolvedDbPath = path.resolve(process.cwd(), DEFAULT_DB_PATH);
fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

export const db = new Database(resolvedDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      about_text TEXT NOT NULL,
      story_beats_json TEXT NOT NULL DEFAULT '[]',
      hero_model_url TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      map_link TEXT NOT NULL,
      phones_json TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      working_hours TEXT NOT NULL,
      external_admin_url TEXT NOT NULL DEFAULT 'https://mido-optics-servies.vercel.app',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('prescription', 'sunglasses', 'contact_lenses', 'accessories')),
      price REAL NOT NULL CHECK (price >= 0),
      short_desc TEXT NOT NULL,
      full_desc TEXT NOT NULL,
      frame_shape TEXT NOT NULL DEFAULT 'round',
      material TEXT NOT NULL DEFAULT '',
      dimensions TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      allow_preorder INTEGER NOT NULL DEFAULT 0,
      preorder_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      color_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      images_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      image_url TEXT NOT NULL,
      details_json TEXT NOT NULL,
      full_description TEXT NOT NULL,
      refractive_index TEXT NOT NULL DEFAULT '1.56',
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL DEFAULT '',
      order_type TEXT NOT NULL DEFAULT 'standard',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
      notes TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      prescription_json TEXT,
      frame_subtotal REAL NOT NULL DEFAULT 0,
      lens_subtotal REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      total REAL NOT NULL CHECK (total >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
      external_sync_status TEXT NOT NULL DEFAULT 'not_configured',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureColumn('store_settings', 'story_beats_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('store_settings', 'hero_model_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    'store_settings',
    'external_admin_url',
    "TEXT NOT NULL DEFAULT 'https://mido-optics-servies.vercel.app'",
  );
  ensureColumn('products', 'allow_preorder', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'preorder_note', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('orders', 'invoice_number', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('orders', 'order_type', "TEXT NOT NULL DEFAULT 'standard'");
  ensureColumn('orders', 'frame_subtotal', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('orders', 'lens_subtotal', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('orders', 'external_sync_status', "TEXT NOT NULL DEFAULT 'not_configured'");
}

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const DEFAULT_STORY_BEATS = [
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
    title: 'معاينة فورية وخدمة حجز مسبق مرنة',
    subtitle: 'جرب الإطار بالكاميرا وادفع عند الاستلام',
    body: 'سواء اخترت من التشكيلة الجاهزة أو عبر نظام الحجز المسبق للإصدارات الخاصة، نوصلك طلبك مع فاتورة مفصلة والدفع نقداً عند الاستلام.',
  },
];

export function seedDatabaseIfEmpty(): void {
  const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM store_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    db.prepare(`
      INSERT INTO store_settings (
        id, store_name, tagline, about_text, story_beats_json, hero_model_url,
        address, map_link, phones_json, whatsapp, working_hours, external_admin_url
      )
      VALUES (1, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
    `).run(
      'ميدو للبصريات | MIDO OPTICS',
      'حرفية بصرية تجمع بين دقة القياس وأناقة الإطار',
      'في ميدو للبصريات نؤمن بأن النظارة ليست مجرد أداة لتصحيح النظر، بل قطعة يومية تعبر عن ذوقك وتمنح عينيك راحة كاملة. نختار إطاراتنا بعناية، ونجهزها بعدسات طبية دقيقة الفحص مع إمكانية معاينة الإطار على وجهك عبر الكاميرا قبل الطلب.',
      JSON.stringify(DEFAULT_STORY_BEATS),
      'القاهرة — المهندسين، 42 شارع جامعة الدول العربية، بجوار محطة المترو',
      'https://maps.google.com/?q=30.0566,31.2001',
      JSON.stringify(['01012345678', '01198765432', '0233456789']),
      '201012345678',
      'يومياً من 11:00 صباحاً حتى 11:00 مساءً',
      'https://mido-optics-servies.vercel.app',
    );
  }

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number };
  if (productCount.count === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (slug, name, category, price, short_desc, full_desc, frame_shape, material, dimensions, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertVariant = db.prepare(`
      INSERT INTO product_variants (product_id, color_name, color_hex, stock, images_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const seedProducts: Array<{
      slug: string;
      name: string;
      category: ProductCategory;
      price: number;
      shortDesc: string;
      fullDesc: string;
      frameShape: string;
      material: string;
      dimensions: string;
      variants: Array<{ colorName: string; colorHex: string; stock: number; images: string[] }>;
    }> = [
      {
        slug: 'alberto-panto-optical',
        name: 'ألبيرتو بانتو كلاسيك',
        category: 'prescription',
        price: 1850,
        shortDesc: 'إطار دائري من الأسيتات الإيطالي مع أذرع معدن مصقول.',
        fullDesc:
          'تصميم دائري متوازن يناسب الوجوه البيضاوية والمربعة، مزود بوسادات أنف قابلة للتعديل ومفاصل معدنية متينة للاستخدام اليومي الطويل.',
        frameShape: 'round',
        material: 'أسيتات إيطالي + تيتانيوم',
        dimensions: '49 - 21 - 145 مم',
        variants: [
          {
            colorName: 'سلحفاة ذهبي',
            colorHex: '#7A4E2D',
            stock: 8,
            images: ['/src/assets/images/optical_tortoise_gold_1795761229680.jpg'],
          },
          {
            colorName: 'زمردي شفاف',
            colorHex: '#355E3B',
            stock: 5,
            images: ['/src/assets/images/optical_emerald_clear_1795761231136.jpg'],
          },
          {
            colorName: 'أسود مطفي',
            colorHex: '#1D1D1B',
            stock: 6,
            images: ['/src/assets/images/optical_matte_black_1795761230467.jpg'],
          },
        ],
      },
      {
        slug: 'architect-titanium-bridge',
        name: 'أركيتكت تيتانيوم بريدج',
        category: 'prescription',
        price: 2250,
        shortDesc: 'إطار هندسي فائق الخفة بجسر مزدوج من التيتانيوم.',
        fullDesc:
          'مصنوع من التيتانيوم المقاوم للصدأ بوزن لا يتجاوز 14 جرام، يمنحك ثباتاً مثالياً طوال ساعات العمل مع مظهر عصري حاد.',
        frameShape: 'geometric',
        material: 'تيتانيوم ياباني خالص',
        dimensions: '52 - 19 - 148 مم',
        variants: [
          {
            colorName: 'أسود وفضي',
            colorHex: '#1F2429',
            stock: 7,
            images: ['/src/assets/images/optical_matte_black_1795761230467.jpg'],
          },
          {
            colorName: 'سلحفاة كلاسيك',
            colorHex: '#6F4E37',
            stock: 4,
            images: ['/src/assets/images/optical_tortoise_gold_1795761229680.jpg'],
          },
        ],
      },
      {
        slug: 'verona-olive-crystal',
        name: 'فيرونا كريستال زيتوني',
        category: 'prescription',
        price: 1690,
        shortDesc: 'أسيتات شفاف بلون زيتوني دافئ ونواة ذراع محفورة.',
        fullDesc:
          'إطار أنيق يجمع بين خفة الأسيتات الشفاف وتفاصيل الأسلاك الداخلية المنقوشة يدوياً، مثالي للعدسات الطبية المتوسطة والعالية.',
        frameShape: 'round',
        material: 'أسيتات طبيعي مصقول',
        dimensions: '48 - 22 - 145 مم',
        variants: [
          {
            colorName: 'زيتوني شفاف',
            colorHex: '#436846',
            stock: 9,
            images: ['/src/assets/images/optical_emerald_clear_1795761231136.jpg'],
          },
          {
            colorName: 'عسلي سلحفاة',
            colorHex: '#8C5832',
            stock: 6,
            images: ['/src/assets/images/optical_tortoise_gold_1795761229680.jpg'],
          },
        ],
      },
      {
        slug: 'solaris-havana-amber',
        name: 'سولاريس هافانا شمسية',
        category: 'sunglasses',
        price: 2100,
        shortDesc: 'نظارة شمسية هافانا بعدسات متدرجة وحماية UV400 كاملة.',
        fullDesc:
          'عدسات مريحة للعين في القيادة والنهار مع تدرج كهرماني يمنح وضوحاً ممتازاً للتفاصيل وحماية 100% من الأشعة فوق البنفسجية.',
        frameShape: 'square',
        material: 'أسيتات هافانا + عدسات CR-39',
        dimensions: '53 - 20 - 145 مم',
        variants: [
          {
            colorName: 'هافانا كهرماني',
            colorHex: '#6B3E26',
            stock: 10,
            images: ['/src/assets/images/sun_havana_amber_1795761231607.jpg'],
          },
          {
            colorName: 'أوبسيديان ذهبي',
            colorHex: '#181818',
            stock: 5,
            images: ['/src/assets/images/sun_obsidian_gold_1795761231014.jpg'],
          },
        ],
      },
      {
        slug: 'obsidian-navigator-polarized',
        name: 'أوبسيديان نافيجيتور بولارايزد',
        category: 'sunglasses',
        price: 2450,
        shortDesc: 'عدسات مستقطبة مانعة للتوهج مع جسر ذهبي مطفي.',
        fullDesc:
          'تصميم هندسي جريء مزود بعدسات Polarized تلغي انعكاسات الطرق والماء، مثالية للقيادة الطويلة والسفر.',
        frameShape: 'aviator',
        material: 'ستانلس ستيل + أسيتات مطفي',
        dimensions: '54 - 18 - 146 مم',
        variants: [
          {
            colorName: 'أسود وذهبي',
            colorHex: '#1E1E1E',
            stock: 6,
            images: ['/src/assets/images/sun_obsidian_gold_1795761231014.jpg'],
          },
          {
            colorName: 'هافانا دافئ',
            colorHex: '#7B4B2A',
            stock: 4,
            images: ['/src/assets/images/sun_havana_amber_1795761231607.jpg'],
          },
        ],
      },
      {
        slug: 'aura-daily-hydration-lenses',
        name: 'أورا ديلي هيدرا — عبوة 30 عدسة',
        category: 'contact_lenses',
        price: 780,
        shortDesc: 'عدسات لاصقة يومية مرطبة بحمض الهيالورونيك لراحة 14 ساعة.',
        fullDesc:
          'عدسات سيليكون هيدروجيل عالية النفاذية للأكسجين تقلل جفاف العين أمام الشاشات وفي الأجواء المكيفة. متوفرة بدرجات تجميلية وشفافة.',
        frameShape: 'contact',
        material: 'سيليكون هيدروجيل 58% ماء',
        dimensions: 'BC 8.5 · DIA 14.2 مم',
        variants: [
          {
            colorName: 'شفاف طبيعي',
            colorHex: '#C5D8D1',
            stock: 20,
            images: ['/src/assets/images/contact_lenses_pack_1795761232288.jpg'],
          },
          {
            colorName: 'رمادي ساج هادئ',
            colorHex: '#8EA29B',
            stock: 12,
            images: ['/src/assets/images/contact_lenses_pack_1795761232288.jpg'],
          },
        ],
      },
      {
        slug: 'aura-monthly-hazel',
        name: 'أورا الشهرية — هازل ناتشورال',
        category: 'contact_lenses',
        price: 540,
        shortDesc: 'عدسات شهرية ناعمة بدرجة عسلي طبيعي تمنح العين إشراقة هادئة.',
        fullDesc:
          'مصممة بحواف رفيعة للغاية لا تسبب احتكاكاً مع الجفن، مناسبة للاستخدام اليومي حتى 30 يوماً مع المحلول المخصص.',
        frameShape: 'contact',
        material: 'هيدروجيل عالي الترطيب',
        dimensions: 'BC 8.6 · DIA 14.0 مم',
        variants: [
          {
            colorName: 'عسلي ناعم',
            colorHex: '#A67B5B',
            stock: 15,
            images: ['/src/assets/images/contact_lenses_pack_1795761232288.jpg'],
          },
        ],
      },
      {
        slug: 'mido-leather-care-kit',
        name: 'طقم العناية الفاخر + جراب جلد طبيعي',
        category: 'accessories',
        price: 420,
        shortDesc: 'جراب جلد اسبريسو + بخاخ تنظيف آمن للعدسات + منديل مايكروفايبر.',
        fullDesc:
          'حماية متكاملة لنظارتك الطبية أو الشمسية: جراب جلدي مبطن بالمخمل من الداخل، وبخاخ خالٍ من الكحول يحافظ على طبقات الحماية.',
        frameShape: 'accessory',
        material: 'جلد طبيعي + سائل بصري آمن',
        dimensions: '165 × 65 × 40 مم',
        variants: [
          {
            colorName: 'بني اسبريسو',
            colorHex: '#3B2820',
            stock: 25,
            images: ['/src/assets/images/eyewear_accessories_kit_1795761232213.jpg'],
          },
        ],
      },
      {
        slug: 'optical-spray-microfiber-duo',
        name: 'بخاخ تنظيف العدسات + منديل مزدوج',
        category: 'accessories',
        price: 180,
        shortDesc: 'تركيبة مضادة للضباب وبصمات الأصابع آمنة على جميع طبقات الانتي ريفلكشن.',
        fullDesc:
          'عبوة 60 مل عملية للشنطة أو المكتب مع منديل مايكروفايبر عالي الكثافة يزيل الأتربة والدهون دون خدش سطح العدسة.',
        frameShape: 'accessory',
        material: 'مايكروفايبر + محلول متعادل',
        dimensions: '60 مل',
        variants: [
          {
            colorName: 'كريمي أبيض',
            colorHex: '#EAE5DC',
            stock: 30,
            images: ['/src/assets/images/eyewear_accessories_kit_1795761232213.jpg'],
          },
        ],
      },
    ];

    const runSeed = db.transaction(() => {
      for (const p of seedProducts) {
        const res = insertProduct.run(
          p.slug,
          p.name,
          p.category,
          p.price,
          p.shortDesc,
          p.fullDesc,
          p.frameShape,
          p.material,
          p.dimensions,
        );
        const productId = Number(res.lastInsertRowid);
        p.variants.forEach((v, idx) => {
          insertVariant.run(
            productId,
            v.colorName,
            v.colorHex,
            v.stock,
            JSON.stringify(v.images),
            idx,
          );
        });
      }
    });
    runSeed();
  }

  const lensCount = db.prepare('SELECT COUNT(*) AS count FROM lenses').get() as { count: number };
  if (lensCount.count === 0) {
    const insertLens = db.prepare(`
      INSERT INTO lenses (name, subtitle, price, image_url, details_json, full_description, refractive_index, published, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const seedLenses = [
      {
        name: 'عدسات انتي ريفلكشن قياسية',
        subtitle: 'وضوح يومي ومقاومة للخدش',
        price: 450,
        imageUrl: '/src/assets/images/optical_lens_crystal_1795761233547.jpg',
        details: [
          'طبقة مانعة للانعكاس الضوئي HMC',
          'مقاومة للخدش والأتربة وسهلة التنظيف',
          'مناسبة للمقاسات الخفيفة والمتوسطة',
        ],
        fullDescription:
          'اختيار عملي للاستخدام اليومي يمنحك رؤية صافية ويقلل توهج الإضاءة الصناعية والمصابيح الليلية.',
        refractiveIndex: '1.56',
      },
      {
        name: 'عدسات بلو كات لحماية العين من الشاشات',
        subtitle: 'فلتر الضوء الأزرق + UV400',
        price: 750,
        imageUrl: '/src/assets/images/optical_lens_crystal_1795761233547.jpg',
        details: [
          'حجب فعال للضوء الأزرق الضار الصادر من الهواتف والشاشات',
          'طبقة فائقة النعومة طاردة لبخار الماء وبصمات الأصابع',
          'تخفف إجهاد العين والصداع أثناء العمل الطويل',
        ],
        fullDescription:
          'مصممة لمن يقضون أكثر من 4 ساعات يومياً أمام الشاشات، مع شفافية عالية تحافظ على طبيعة الألوان.',
        refractiveIndex: '1.60 مضغوطة',
      },
      {
        name: 'عدسات فائقة النحافة مضغوطة 1.67',
        subtitle: 'للمقاسات المتوسطة والعالية بدون سُمك',
        price: 1250,
        imageUrl: '/src/assets/images/optical_lens_crystal_1795761233547.jpg',
        details: [
          'سُمك أقل بنسبة 40% مقارنة بالعدسات التقليدية',
          'حماية كاملة من الأشعة فوق البنفسجية والضوء الأزرق',
          'وزن خفيف جداً يمنح مظهراً جمالياً داخل الإطارات الرفيعة',
        ],
        fullDescription:
          'أعلى جودة بصرية للمقاسات المرتفعة تمنع تكبير أو تصغير شكل العين وتضمن راحة مثالية على الأنف.',
        refractiveIndex: '1.67 عالية الضغط',
      },
      {
        name: 'عدسات فوتوكروميك متغيرة اللون',
        subtitle: 'تتحول لنظارة شمسية في ضوء الشمس',
        price: 1450,
        imageUrl: '/src/assets/images/optical_lens_crystal_1795761233547.jpg',
        details: [
          'تغمق تلقائياً خلال ثوانٍ عند التعرض لأشعة الشمس',
          'شفافة تماماً داخل المنزل والمكتب مع حماية بلو كات',
          'حماية 100% من أشعة UVA و UVB',
        ],
        fullDescription:
          'تجمع بين النظارة الطبية والنظارة الشمسية في عدسة واحدة ذكية تتكيف مع شدة الإضاءة المحيطة.',
        refractiveIndex: '1.60 ترانزيشن',
      },
    ];

    seedLenses.forEach((l, idx) => {
      insertLens.run(
        l.name,
        l.subtitle,
        l.price,
        l.imageUrl,
        JSON.stringify(l.details),
        l.fullDescription,
        l.refractiveIndex,
        idx,
      );
    });
  }
}

export function getStoreSettings(): StoreSettings {
  const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as
    | {
        store_name: string;
        tagline: string;
        about_text: string;
        story_beats_json?: string;
        hero_model_url?: string;
        address: string;
        map_link: string;
        phones_json: string;
        whatsapp: string;
        working_hours: string;
        external_admin_url?: string;
      }
    | undefined;

  if (!row) {
    return {
      storeName: 'ميدو للبصريات | MIDO OPTICS',
      tagline: 'رؤية مختلفة',
      aboutText: 'متجر متخصص في النظارات الطبية والشمسية والعدسات اللاصقة.',
      storyBeats: DEFAULT_STORY_BEATS,
      heroModelUrl: '',
      address: 'القاهرة — المهندسين',
      mapLink: 'https://maps.google.com',
      phones: ['01012345678'],
      whatsapp: '201012345678',
      workingHours: 'يومياً 11 صباحاً - 11 مساءً',
      externalAdminUrl: 'https://mido-optics-servies.vercel.app',
    };
  }

  let parsedBeats = DEFAULT_STORY_BEATS;
  try {
    const raw = JSON.parse(row.story_beats_json || '[]');
    if (Array.isArray(raw) && raw.length > 0) {
      parsedBeats = raw;
    }
  } catch {
    parsedBeats = DEFAULT_STORY_BEATS;
  }

  return {
    storeName: row.store_name,
    tagline: row.tagline,
    aboutText: row.about_text,
    storyBeats: parsedBeats,
    heroModelUrl: row.hero_model_url || '',
    address: row.address,
    mapLink: row.map_link,
    phones: safeParseJsonArray(row.phones_json),
    whatsapp: row.whatsapp,
    workingHours: row.working_hours,
    externalAdminUrl: row.external_admin_url || 'https://mido-optics-servies.vercel.app',
  };
}

function safeParseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapVariantRow(row: {
  id: number;
  product_id: number;
  color_name: string;
  color_hex: string;
  stock: number;
  images_json: string;
  sort_order: number;
}): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    colorName: row.color_name,
    colorHex: row.color_hex,
    stock: row.stock,
    images: safeParseJsonArray(row.images_json),
    sortOrder: row.sort_order,
  };
}

export function listProducts(options?: {
  category?: ProductCategory;
  includeUnpublished?: boolean;
}): Product[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }
  if (!options?.includeUnpublished) {
    conditions.push('published = 1');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const productRows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY id DESC`)
    .all(...params) as Array<{
    id: number;
    slug: string;
    name: string;
    category: ProductCategory;
    price: number;
    short_desc: string;
    full_desc: string;
    frame_shape: string;
    material: string;
    dimensions: string;
    published: number;
    allow_preorder?: number;
    preorder_note?: string;
  }>;

  const variantRows = db
    .prepare('SELECT * FROM product_variants ORDER BY sort_order ASC, id ASC')
    .all() as Array<{
    id: number;
    product_id: number;
    color_name: string;
    color_hex: string;
    stock: number;
    images_json: string;
    sort_order: number;
  }>;

  const variantsByProduct = new Map<number, ProductVariant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.product_id) || [];
    list.push(mapVariantRow(v));
    variantsByProduct.set(v.product_id, list);
  }

  return productRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    price: p.price,
    shortDesc: p.short_desc,
    fullDesc: p.full_desc,
    frameShape: p.frame_shape,
    material: p.material,
    dimensions: p.dimensions,
    published: p.published === 1,
    allowPreorder: p.allow_preorder === 1,
    preorderNote: p.preorder_note || '',
    variants: variantsByProduct.get(p.id) || [],
  }));
}

export function getProductBySlug(slug: string, includeUnpublished = false): Product | null {
  const query = includeUnpublished
    ? 'SELECT * FROM products WHERE slug = ?'
    : 'SELECT * FROM products WHERE slug = ? AND published = 1';
  const row = db.prepare(query).get(slug) as
    | {
        id: number;
        slug: string;
        name: string;
        category: ProductCategory;
        price: number;
        short_desc: string;
        full_desc: string;
        frame_shape: string;
        material: string;
        dimensions: string;
        published: number;
        allow_preorder?: number;
        preorder_note?: string;
      }
    | undefined;
  if (!row) return null;

  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, id ASC')
    .all(row.id) as Array<{
    id: number;
    product_id: number;
    color_name: string;
    color_hex: string;
    stock: number;
    images_json: string;
    sort_order: number;
  }>;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    price: row.price,
    shortDesc: row.short_desc,
    fullDesc: row.full_desc,
    frameShape: row.frame_shape,
    material: row.material,
    dimensions: row.dimensions,
    published: row.published === 1,
    allowPreorder: row.allow_preorder === 1,
    preorderNote: row.preorder_note || '',
    variants: variants.map(mapVariantRow),
  };
}

export function listLenses(includeUnpublished = false): OpticalLens[] {
  const query = includeUnpublished
    ? 'SELECT * FROM lenses ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM lenses WHERE published = 1 ORDER BY sort_order ASC, id ASC';
  const rows = db.prepare(query).all() as Array<{
    id: number;
    name: string;
    subtitle: string;
    price: number;
    image_url: string;
    details_json: string;
    full_description: string;
    refractive_index: string;
    published: number;
    sort_order: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
    price: r.price,
    imageUrl: r.image_url,
    details: safeParseJsonArray(r.details_json),
    fullDescription: r.full_description,
    refractiveIndex: r.refractive_index,
    published: r.published === 1,
    sortOrder: r.sort_order,
  }));
}

export function listOrders(): OrderRecord[] {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as Array<{
    id: number;
    order_code: string;
    invoice_number?: string;
    order_type?: 'standard' | 'preorder';
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    payment_method: 'cash_on_delivery';
    notes: string;
    items_json: string;
    prescription_json: string | null;
    frame_subtotal?: number;
    lens_subtotal?: number;
    subtotal: number;
    total: number;
    status: OrderStatus;
    external_sync_status?: 'pending' | 'synced' | 'failed' | 'not_configured';
    created_at: string;
  }>;

  return rows.map((r) => {
    const items = JSON.parse(r.items_json);
    const frameSub =
      r.frame_subtotal ||
      items.reduce(
        (acc: number, i: { framePrice?: number; quantity?: number }) =>
          acc + (i.framePrice || 0) * (i.quantity || 1),
        0,
      );
    const lensSub =
      r.lens_subtotal ||
      items.reduce(
        (acc: number, i: { lensPrice?: number; quantity?: number }) =>
          acc + (i.lensPrice || 0) * (i.quantity || 1),
        0,
      );

    return {
      id: r.id,
      orderCode: r.order_code,
      invoiceNumber: r.invoice_number || `INV-${r.order_code}`,
      orderType: r.order_type === 'preorder' ? 'preorder' : 'standard',
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerAddress: r.customer_address,
      paymentMethod: r.payment_method,
      notes: r.notes,
      items,
      prescription: r.prescription_json ? JSON.parse(r.prescription_json) : null,
      frameSubtotal: frameSub,
      lensSubtotal: lensSub,
      subtotal: r.subtotal,
      total: r.total,
      status: r.status,
      externalSyncStatus: r.external_sync_status || 'not_configured',
      createdAt: r.created_at,
    };
  });
}
