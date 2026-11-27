# Security Specification — MIDO OPTICS Firestore Rules

## 1. Data Invariants
1. **Catalog & Store Settings Integrity**: Only verified store administrators (`isAdmin()`) may create, update, or delete `/store_settings/{settingId}`, `/products/{productId}`, or `/lenses/{lensId}`.
2. **Draft Isolation on Public Queries**: Public visitors may only `get` or `list` products and lenses where `resource.data.published == true`. Unpublished items are strictly invisible to non-admins.
3. **PII & Prescription Isolation**: Customer orders (`/orders/{orderId}`) contain sensitive PII (`customerName`, `customerPhone`, `customerAddress`) and medical eye prescription measurements (`OD/OS SPH, CYL, AXIS, ADD, IPD`, prescription photo URL). Public `get` and `list` on `/orders` MUST always return `PERMISSION_DENIED`. Only verified admins (or the signed-in owner matching `resource.data.userId`) may read an order.
4. **Checkout State Enforcement**: Any newly created order MUST start with `status == 'pending'`, `paymentMethod == 'cash_on_delivery'`, `createdAt == request.time`, `updatedAt == request.time`, bounded string lengths, and bounded `items` array (`1..20`).
5. **Immutable Audit Fields & Terminal States**: `createdAt`, `orderCode`, `invoiceNumber`, and `userId` are immutable once an order is created. Non-admins cannot update or delete orders.
6. **Privilege Escalation Prevention**: Only the primary verified admin (`a3972098@gmail.com` with `email_verified == true`) can add or remove entries in `/admins/{userId}`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Ghost Field Injection on Order Create**: `{ ..., isVerified: true, discountOverride: 100 }` -> Rejected by `keys().hasOnly(...)`.
2. **Spoofed Status on Order Create**: `{ ..., status: "delivered" }` -> Rejected (`status == 'pending'` required).
3. **Spoofed Payment Method on Order Create**: `{ ..., paymentMethod: "free_override" }` -> Rejected (`paymentMethod == 'cash_on_delivery'` required).
4. **Unverified Admin Email Spoof**: Signed-in user with `email: "a3972098@gmail.com"` and `email_verified: false` attempting to update `/store_settings/main` -> Rejected (`email_verified == true` required).
5. **Public PII Scrape (`list` on `/orders`)**: Anonymous or non-admin user running `getDocs(collection(db, 'orders'))` -> Rejected (`isAdmin()` or matching `resource.data.userId` required).
6. **PII Single-Doc Read (`get` on `/orders/order-1`)**: Non-owner authenticated user reading another customer's order -> Rejected.
7. **Unpublished Product List Scrape**: Public user querying `/products` without `where('published', '==', true)` -> Rejected (`resource.data.published == true`).
8. **ID Poisoning / Oversized Path ID**: Creating `/orders/` with a 500-character document ID or invalid characters (`../admin`) -> Rejected by `isValidId(orderId)`.
9. **Array DoW Attack on Order Items**: Submitting an order with `items.size() == 250` -> Rejected (`items.size() >= 1 && items.size() <= 20`).
10. **Client-Spoofed Timestamp**: Submitting `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> Rejected (`createdAt == request.time`).
11. **Self-Assigned Admin Write**: Non-admin user creating `/admins/<their_uid>` with `{ role: "admin" }` -> Rejected (`isPrimaryAdmin()` required).
12. **Non-Admin Store Story Defacement**: Non-admin attempting to update `/store_settings/main` `aboutText` or `storyBeats` -> Rejected (`isAdmin()` required).
