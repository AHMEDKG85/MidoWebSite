import test from 'node:test';
import assert from 'node:assert/strict';
import { generateClientOrderIdentifiers, readJsonSafe } from './safeFetch';

test('readJsonSafe handles Vercel plain-text 404 without throwing SyntaxError', async () => {
  const res = new Response('The page could not be found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
  const parsed = await readJsonSafe<{ error?: string }>(res);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 404);
  assert.equal(parsed.isJson, false);
  assert.equal(parsed.data, null);
});

test('readJsonSafe parses valid JSON responses cleanly', async () => {
  const res = new Response(JSON.stringify({ ok: true, id: 42 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const parsed = await readJsonSafe<{ ok: boolean; id: number }>(res);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.isJson, true);
  assert.deepEqual(parsed.data, { ok: true, id: 42 });
});

test('generateClientOrderIdentifiers matches Firestore orderCode regex ^[A-Z0-9-]+$', () => {
  const { orderCode, invoiceNumber } = generateClientOrderIdentifiers();
  assert.match(orderCode, /^[A-Z0-9-]+$/);
  assert.ok(orderCode.length >= 4 && orderCode.length <= 40);
  assert.ok(invoiceNumber.length >= 4 && invoiceNumber.length <= 40);
});
