import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

test('Firestore rules enforce default deny, Eight Pillars helpers, and PII isolation', () => {
  assert.ok(rulesSource.includes("rules_version = '2';"));
  assert.ok(rulesSource.includes('match /{document=**} {\n      allow read, write: if false;'));
  assert.ok(rulesSource.includes('isValidId('));
  assert.ok(rulesSource.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesSource.includes("'a3972098@gmail.com'"));
  assert.ok(rulesSource.includes("'ah429034@gmail.com'"));
  assert.ok(rulesSource.includes("'ahmeddres66@gmail.com'"));
  assert.ok(rulesSource.includes("'m64152228@gmail.com'"));
  assert.ok(rulesSource.includes("incoming().status == 'pending'"));
  assert.ok(rulesSource.includes("data.paymentMethod == 'cash_on_delivery'"));
  assert.ok(rulesSource.includes('resource.data.published == true || isAdmin()'));
  assert.ok(rulesSource.includes('affectedKeys().hasOnly('));
  assert.ok(rulesSource.includes("'frameImageUrl'"));
  assert.ok(rulesSource.includes("'selectedFrameName'"));
  assert.ok(rulesSource.includes("'prescriptionImageUrl'"));
});
