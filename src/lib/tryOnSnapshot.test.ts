import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshotFilename,
  buildWhatsAppShareUrl,
  computeTryOnOverlayGeometry,
} from './tryOnSnapshot';

test('buildSnapshotFilename creates clean jpg filename from Arabic and Latin product/color names', () => {
  const filename = buildSnapshotFilename('ألبيرتو بانتو', 'سلحفاة ذهبي');
  assert.ok(filename.startsWith('mido-optics-'));
  assert.ok(filename.endsWith('.jpg'));
  assert.ok(!filename.includes(' '));
});

test('buildWhatsAppShareUrl encodes share message and handles optional store number', () => {
  const generalUrl = buildWhatsAppShareUrl({
    productName: 'ألبيرتو بانتو',
    colorName: 'سلحفاة',
    pageUrl: 'https://example.com/product',
  });
  assert.ok(generalUrl.startsWith('https://wa.me/?text='));
  assert.ok(decodeURIComponent(generalUrl).includes('ألبيرتو بانتو'));
  assert.ok(decodeURIComponent(generalUrl).includes('https://example.com/product'));

  const directUrl = buildWhatsAppShareUrl({
    productName: 'سولار أفياتور',
    colorName: 'أسود',
    storePhone: '+20 101-234-5678',
  });
  assert.ok(directUrl.startsWith('https://wa.me/201012345678?text='));
});

test('computeTryOnOverlayGeometry scales frame width and offset proportionally to canvas dimensions', () => {
  const geo = computeTryOnOverlayGeometry(960, 720, 640, {
    scale: 1.2,
    offsetY: 20,
    tilt: 10,
  });
  assert.equal(geo.centerX, 480);
  assert.equal(geo.centerY, 360 + 20 * 1.5);
  assert.ok(Math.abs(geo.frameWidth - 270 * 1.5 * 1.2) < 0.01);
  assert.ok(Math.abs(geo.tiltRad - (10 * Math.PI) / 180) < 0.0001);
});
