# Vị Ơi live-support workflow

## Customer flow

1. The public chat remains usable when the AI provider is disabled or unavailable. AI requests can fail honestly without disabling the composer.
2. The customer can choose **Gặp nhân viên** at any time. The latest 12 user/assistant messages are offered as context; if that transcript contains a phone number, email, order identifier, password, OTP, or payment detail, the transfer is rejected instead of persisting it.
3. The handoff is stored only after the customer opts in. A guest receives a 256-bit, URL-safe capability token; only its SHA-256 hash is stored in MongoDB. The token is used once to create the handoff, then placed in an `HttpOnly; SameSite=Strict` cookie scoped to that handoff path (and `Secure` outside development). The response body never returns it; browser storage keeps only the handoff ID. The 7-day cookie and server-side expiry are refreshed for active guest sessions. Reusing the same pending token makes a retried create request idempotent.
4. Signed-in customers are bound to their account ID and have at most one active request. The unique partial index on `activeOwnerUserId` prevents duplicate active handoffs; resolving one releases the key.
5. After handoff, customer and staff messages use the same persisted thread. Contact/order details can be shared with staff, but passwords, OTPs, card data, and bank-account details remain blocked.

## Workflow and ownership

`waiting → assigned → resolved`

- Staff/admin can list active conversations; waiting items are sorted first and oldest-first. The inbox omits transcript bodies until an operator opens a conversation.
- Claiming is an atomic conditional update. Only one staff member can claim an unassigned request; the assignee can reply and resolve it. Admin can oversee/reply to any request.
- Staff replies increment `customerUnreadCount`; customer replies increment `staffUnreadCount`. Reading a thread clears the corresponding unread count.
- Resolved conversations are read-only. The customer starts a new request for follow-up.
- Existing order-linked `CustomerTicket` support/return workflows remain separate and unchanged.

## MongoDB aggregate

Collection: `chat_handoffs` (`ChatHandoff` model).

- One document stores ownership, state, assignment, timestamps, message previews, unread counters, a bounded embedded transcript, and an `auditTrail` for creation/claim/reply/resolve actions. Embedding keeps each state/message update atomic and avoids orphaned message documents.
- Transcript is capped at 250 messages, each at 2,000 characters; incoming customer/staff messages are limited to 1,500 characters. Initial AI context is capped at 12 messages.
- Indexes cover unique token hashes, active queue ordering, staff unread summaries and assignment/state, account owner/state, and a unique partial active-account key.
- `initializeCustomerIndexes()` creates the model indexes during the existing MongoDB startup initialization. No Atlas schema/data write was performed by this change.

## Staff alerts and operations

- The staff dashboard polls unread/waiting summary every 20 seconds and the open queue every 15 seconds. It shows an in-app count/notice; a browser notification is emitted only when the operator has already granted browser permission. No permission prompt is forced.
- Customer chat checks for staff replies every 7 seconds while open. No WebSocket, email, SMS, or push delivery is implemented; a closed guest tab cannot receive an out-of-browser alert.
- Guest access depends on the session-scoped capability token. Closing the browser session or clearing site storage removes that guest's access credential.
- No TTL/retention policy is configured yet. Before production, set an approved retention period and process for deleting or exporting resolved support transcripts, which may include details the customer intentionally shares with staff.

## HTTP endpoints

- `POST /api/chat/handoffs`, `GET /api/chat/handoffs/:id`, `POST /api/chat/handoffs/:id/messages` — customer/guest create, read, and reply.
- `GET /api/staff/chat-handoffs/summary`, `GET /api/staff/chat-handoffs`, `GET /api/staff/chat-handoffs/:id` — staff inbox and notifications.
- `PATCH /api/staff/chat-handoffs/:id/claim`, `POST /api/staff/chat-handoffs/:id/messages`, `PATCH /api/staff/chat-handoffs/:id/resolve` — staff lifecycle actions.

The customer write limiter is 20 requests per 10 minutes per IP; read/poll endpoints allow 180 per 10 minutes. Staff APIs require an authenticated `staff` or `admin` session and retain the app's same-origin CSRF checks for writes.
