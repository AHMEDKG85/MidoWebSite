import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceLines,
  calculateCartTotals,
  canOrderVariant,
  getVariantImagesOnly,
  isPreorderAvailable,
  requiresLensStep,
  validatePrescription,
} from './storeLogic';
import type { CartItem, Product } from '../types';

const sampleProduct: Product = {
  id: 1,
  slug: 'sample-frame',
  name: 'ألبيرتو بانتو',
  category: 'prescription',
  price: 1850,
  shortDesc: 'وصف مختصر',
  fullDesc: 'وصف كامل',
  frameShape: 'round',
  material: 'أسيتات',
  dimensions: '49-21-145',
  published: true,
  allowPreorder: true,
  preorderNote: 'يصل خلال 5 أيام عمل',
  variants: [
    {
      id: 10,
      productId: 1,
      colorName: 'سلحفاة',
      colorHex: '#7A4E2D',
      stock: 5,
      images: ['/img/tortoise-1.jpg', '/img/tortoise-2.jpg'],
      sortOrder: 0,
    },
    {
      id: 11,
      productId: 1,
      colorName: 'أسود',
      colorHex: '#1D1D1B',
      stock: 0,
      images: ['/img/black-1.jpg'],
      sortOrder: 1,
    },
  ],
};

test('requiresLensStep routes optical frames through lens step and sunglasses directly to checkout', () => {
  assert.equal(requiresLensStep('prescription'), true);
  assert.equal(requiresLensStep('sunglasses'), false);
  assert.equal(requiresLensStep('contact_lenses'), false);
  assert.equal(requiresLensStep('accessories'), false);
});

test('getVariantImagesOnly returns exclusively images of the selected color and hides other colors', () => {
  assert.deepEqual(getVariantImagesOnly(sampleProduct, 10), [
    '/img/tortoise-1.jpg',
    '/img/tortoise-2.jpg',
  ]);
  assert.deepEqual(getVariantImagesOnly(sampleProduct, 11), ['/img/black-1.jpg']);
});

test('pre-order helpers enable ordering when stock is zero if allowPreorder is true', () => {
  assert.equal(isPreorderAvailable(sampleProduct, sampleProduct.variants[0]), false);
  assert.equal(isPreorderAvailable(sampleProduct, sampleProduct.variants[1]), true);
  assert.equal(canOrderVariant(sampleProduct, sampleProduct.variants[1]), true);
  assert.equal(canOrderVariant({ allowPreorder: false }, sampleProduct.variants[1]), false);
});

test('calculateCartTotals sums frame price, lens price, and extra items accurately', () => {
  const items: CartItem[] = [
    {
      id: '1-10-2',
      productId: 1,
      productSlug: 'sample-frame',
      productName: 'ألبيرتو بانتو',
      category: 'prescription',
      variantId: 10,
      colorName: 'سلحفاة',
      colorHex: '#7A4E2D',
      imageUrl: '/img/tortoise-1.jpg',
      framePrice: 1850,
      lensId: 2,
      lensName: 'عدسات بلو كات',
      lensPrice: 750,
      quantity: 1,
      orderType: 'preorder',
    },
    {
      id: '8-80-none',
      productId: 8,
      productSlug: 'care-kit',
      productName: 'طقم العناية',
      category: 'accessories',
      variantId: 80,
      colorName: 'اسبريسو',
      colorHex: '#3B2820',
      imageUrl: '/img/kit.jpg',
      framePrice: 420,
      lensId: null,
      lensName: null,
      lensPrice: 0,
      quantity: 2,
    },
  ];

  const totals = calculateCartTotals(items);
  assert.equal(totals.frameSubtotal, 2690);
  assert.equal(totals.lensSubtotal, 750);
  assert.equal(totals.total, 3440);
  assert.equal(totals.itemCount, 3);
  assert.equal(totals.hasPrescriptionOpticalItem, true);
  assert.equal(totals.hasPreorderItem, true);

  const lines = buildInvoiceLines({ items });
  assert.equal(lines[0].lineTotal, 2600);
  assert.equal(lines[1].lineTotal, 840);
});

test('validatePrescription validates OD/OS SPH/CYL/AXIS/ADD and IPD or uploaded photo', () => {
  assert.equal(validatePrescription(null, false).valid, true);
  assert.equal(validatePrescription(null, true).valid, false);

  assert.equal(
    validatePrescription(
      {
        mode: 'manual',
        od: { sph: '-1.50', cyl: '-0.75', axis: '180', add: '+1.50' },
        os: { sph: '-1.25', cyl: '-0.50', axis: '90', add: '+1.50' },
        ipd: '63',
        imageUrl: '',
      },
      true,
    ).valid,
    true,
  );

  assert.equal(
    validatePrescription(
      {
        mode: 'manual',
        od: { sph: '-1.50', cyl: '-0.75', axis: '180', add: '+1.50' },
        os: { sph: '-1.25', cyl: '-0.50', axis: '90', add: '+1.50' },
        ipd: '120',
        imageUrl: '',
      },
      true,
    ).valid,
    false,
  );

  assert.equal(
    validatePrescription(
      {
        mode: 'upload',
        od: { sph: '', cyl: '', axis: '', add: '' },
        os: { sph: '', cyl: '', axis: '', add: '' },
        ipd: '',
        imageUrl: '/uploads/prescriptions/rx.jpg',
      },
      true,
    ).valid,
    true,
  );
});
