# Backend API — Hà Thành Vị

Base `/api`. JSON errors `{message}`; successful writes require MongoDB. Browser cookies use `credentials: same-origin`. Mutating requests using a session and all login/registration requests require `X-Requested-With: XMLHttpRequest`; a supplied Origin must match FRONTEND_ORIGIN (localhost/127.0.0.1 are also allowed in development). Secrets and password hashes are never returned.

## Sessions and roles

All roles belong to documents in MongoDB collection **users**: `role = admin | staff | customer`. A session loads the current database role on every request. Admin is an ordinary user. There is no special admin bearer or ADMIN_TOKEN authentication.

| Endpoint                      | Contract                                                                                                                                                                                     | Access              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| POST /auth/register           | `{name,email,password,confirmPassword,phone}` → 201 `{verificationRequired,email,message}`; no session                                                                                       | Public, CSRF header |
| POST /auth/login              | `{email,password,rememberDevice?}` → `{otpRequired,challengeId,email,message}` on new devices; `{user}` on trusted device after valid password; pending email verification returns403 marker | Public, CSRF header |
| POST /auth/logout             | Revokes current session, clears cookie, 204                                                                                                                                                  | Session             |
| GET /auth/me                  | `{user:{id,name,email,phone,role}}`                                                                                                                                                          | Session             |
| PATCH /account/profile        | `{name,phone}` → `{user}`                                                                                                                                                                    | Session             |
| GET /account/addresses        | `{addresses:[{id,label,name,phone,address,isDefault}]}`                                                                                                                                      | Owner               |
| POST /account/addresses       | Address fields except id → 201 `{address}`                                                                                                                                                   | Owner               |
| PATCH /account/addresses/:id  | Full address fields except id → `{address}`                                                                                                                                                  | Owner               |
| DELETE /account/addresses/:id | 204; promotes remaining default if needed                                                                                                                                                    | Owner               |

Session cookie `htv_session` is a browser cookie backed by a24-hour server session when not remembered; remembered sessions and owner-bound trusted-device cookies last30days. Cookies are HttpOnly, SameSite=Lax, Secure in production. Only hashes are stored; Mongo TTL removes expired records and expiry/version is checked immediately during authorization. Passwords use salted scrypt, 10–128 characters. Address book has at most10 entries and exactly one default when nonempty. Checkout snapshots entered address/contact details; editing the address book cannot change past orders.

POST /auth/verify-email `{email,code,rememberDevice?}` and /auth/verify-login `{challengeId,code}` return `{user}` and cookies after valid OTP. POST /auth/resend-verification `{email}`, /auth/resend-login-otp `{challengeId}` and /auth/forgot-password `{email}` return generic202 acknowledgments. POST /auth/reset-password `{token,password,confirmPassword}` consumes a20-minute one-use link and revokes authentication. OTPs expire10minutes, with5 attempts and60-second resend cooldown. See [authentication](authentication.md) for delivery and migration semantics.

GET /chat/config and POST /chat `{message,history?}` return safe chat configuration/replies. Chat reply `{reply,products,handoff,sources,available}` also accompanies503/429 service fallback. See [chatbot](chatbot.md). Product CRUD, image upload and statistics contracts are in [product management](product-management.md).

## Public content and checkout

- GET /health → `{status,storage}`.
- GET /content → `{site,products}`; GET /products → products array; GET /products/:slug → matching product. Price is integer VND or null; null-priced products cannot be purchased.
- POST /contact uses `{name,email,phone,message,consent:true}` and returns 201 only after persistence.
- GET /commerce/config → `{enabled,payments:{cod,payos},shippingFee,freeShippingThreshold,pricingNotice}`.
- POST /orders requires `Idempotency-Key: <cryptographically random UUID>`. Body:

```json
{
  "items": [{ "productId": "banh-cha-truyen-thong", "quantity": 2 }],
  "customer": {
    "name": "Ngọc Thành",
    "email": "customer@example.com",
    "phone": "0912345678",
    "address": "Hà Nội"
  },
  "paymentMethod": "cod",
  "note": "",
  "consent": true,
  "voucherCode": "HATHANHVI10"
}
```

Voucher code is optional and requires login. There must be 1–20 distinct product lines, quantities 1–99. Server derives product prices from the catalog, computes subtotal, shipping, discount, and total. Client price/discount fields are rejected. Same logical checkout and key replay return 200; first creation returns 201; a different payload or owner for an existing key returns 409. Keep the key private and retain it for network retries. A disabled payOS method returns 503 before creating an order.

Response `{order,accessToken,paymentUrl}`. Order fields: `id,code,items,subtotal,shippingFee,discount,total,status,paymentStatus,paymentMethod,createdAt,customer,note,shippingEvents` and optional `voucherCode,carrier,trackingNumber,paymentUrl`. Every shipping event has `status,description,message,occurredAt,createdAt` and optional location; message/description and the two date fields support existing clients.

- GET /orders/:id → order directly.
- POST /orders/:id/cancel → order, pending unpaid COD only; replay of that cancellation is safe.
- POST /orders/:id/payment → `{paymentUrl}` for eligible online unpaid order; provider errors preserve the existing order for retry.

Account orders require the owner's cookie session; checkout returns an empty accessToken for them. Guest orders require `X-Order-Token`; token is returned at checkout and stored hashed, never in URLs. Owning a session does not grant access to someone else's guest order. Wrong/missing ownership returns 404. GET /account/orders → `{orders}` filtered by session user, never by userId from client.

## Vouchers, reviews and support

| Endpoint                         | Contract                                                                                                               | Access                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET /account/vouchers            | `{vouchers:[{id,code,name,type,value,minOrder,maxDiscount,startsAt,expiresAt,status}]}`; status available/used/expired | Owner                                                                |
| POST /account/vouchers/claim     | `{code}` → wallet                                                                                                      | Owner                                                                |
| POST /account/vouchers/quote     | `{code,items:[{productId,quantity}]}` → `{code,discount,subtotal}`; quote does not reserve quota                       | Owner                                                                |
| GET /products/:productId/reviews | `{reviews:[{id,rating,comment,authorName,createdAt}]}`; most recent 100                                                | Public                                                               |
| POST /account/reviews            | `{orderId,productId,rating,comment}` → 201 `{review,reward}`                                                           | Owner of delivered order containing product                          |
| GET /account/tickets             | `{tickets}`                                                                                                            | Owner                                                                |
| POST /account/tickets            | `{orderId,kind,message}` → 201 `{ticket}`; kind is support or return                                                   | Owner; return after delivered; retry recovery while return_requested |
| GET /staff/tickets               | `{tickets}`                                                                                                            | Staff/admin                                                          |
| PATCH /staff/tickets/:id         | `{status,reply}` → `{ticket}`; status is open, in_progress or resolved                                                 | Staff/admin                                                          |

One review per user/order/product. Retried review submissions recover the same review and reward. First review of an order creates one personal voucher: fixed 20,000 VND, minimum subtotal 149,000 VND, expires after 30 days. Another user cannot claim or redeem it. Comments are plain text and must be escaped by clients.

## Administration

Admin cookie: GET/PUT /admin/content reads/replaces the full validated `{site,products}` document. GET /admin/users returns `{users}` without passwords; POST /admin/staff uses registration fields and forces role staff. GET/POST /admin/vouchers returns `{vouchers}` / 201 `{voucher}`. Campaign fields: `code,name,type:fixed|percent,value,minOrder,maxDiscount,startsAt,expiresAt,distribution:automatic|code,totalLimit,perUserLimit,active`. REVIEW_ prefix is reserved. Percentage cannot exceed 100; date range and positive quota are validated.

Staff/admin cookies: GET /admin/orders?page=1&limit=20 → `{orders,total}` (max100 per page); administrative order view also includes paymentReviewAt/payOsException if present. PATCH /admin/orders/:id accepts a nonempty subset of `{status,trackingNumber,carrier,paymentStatus,shippingEvent:{status,description,location?,occurredAt?}}`. The server enforces transition and optimistic concurrency, appends events only from an actual operator action, and rejects future event dates. Fulfillment of payOS orders requires paid and no unresolved payment exception. Staff cannot record refunds. Admin may record manual refunds along the guarded refund path; no bank transfer is executed by this endpoint.
