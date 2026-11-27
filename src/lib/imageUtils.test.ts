import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickOrderItemImage,
  pickPrescriptionImage,
  resolvePortableImageUrl,
} from './imageUtils';

test('resolvePortableImageUrl preserves data URIs and resolves relative paths cleanly', () => {
  const dataUri = 'data:image/jpeg;base64,/9j/4AAQ';
  assert.equal(resolvePortableImageUrl(dataUri, 'https://mido-web-site.vercel.app'), dataUri);
  assert.equal(
    resolvePortableImageUrl('/uploads/prescriptions/rx.jpg', 'https://mido-web-site.vercel.app'),
    'https://mido-web-site.vercel.app/uploads/prescriptions/rx.jpg',
  );
  assert.equal(
    resolvePortableImageUrl('https://cdn.example.com/frame.jpg', 'https://mido-web-site.vercel.app'),
    'https://cdn.example.com/frame.jpg',
  );
});

test('pickOrderItemImage extracts frame photo from any external or cloud alias', () => {
  assert.equal(
    pickOrderItemImage(
      { imageUrl: '', frameImageUrl: '', photoUrl: '/src/assets/images/test.jpg' },
      'https://mido-web-site.vercel.app',
    ),
    'https://mido-web-site.vercel.app/src/assets/images/test.jpg',
  );
  assert.equal(
    pickOrderItemImage({ image: 'data:image/png;base64,AAA' }),
    'data:image/png;base64,AAA',
  );
});

test('pickPrescriptionImage resolves prescription image URL or top-level fallback', () => {
  assert.equal(
    pickPrescriptionImage(
      { mode: 'upload', imageUrl: 'data:image/jpeg;base64,RXDATA' },
      '',
      'https://mido-web-site.vercel.app',
    ),
    'data:image/jpeg;base64,RXDATA',
  );
  assert.equal(
    pickPrescriptionImage(null, '/uploads/prescriptions/1.jpg', 'https://mido-web-site.vercel.app'),
    'https://mido-web-site.vercel.app/uploads/prescriptions/1.jpg',
  );
});
