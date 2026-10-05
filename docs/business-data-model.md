# Phân tích nghiệp vụ và thiết kế dữ liệu

**Trạng thái:** tài liệu thiết kế và đối chiếu mã nguồn; không phải migration, không tự ý thay đổi dữ liệu MongoDB.
**Rà soát mã nguồn:** 2026-10-04.

## 1. Phạm vi và nguyên tắc

Hệ thống phục vụ bán bánh/set quà Hà Thành Vị, tư vấn bằng Vị Ơi, nhận và xử lý đơn, thanh toán, giao hàng, hỗ trợ khách và quản trị nội dung. Guest được mua không cần tài khoản; customer có hồ sơ/lịch sử; staff vận hành đơn/hỗ trợ; admin quản lý nhân sự, voucher, nội dung và báo cáo.

- Backend là nguồn sự thật cho giá, giảm giá, quyền và trạng thái; đơn giữ snapshot để lịch sử không đổi khi catalog được sửa.
- Chỉ nhúng dữ liệu nhỏ, có giới hạn và thường đọc/cập nhật cùng aggregate cha. Tách dữ liệu tăng trưởng không giới hạn hoặc cần truy vấn độc lập.
- Mọi thao tác lặp từ trình duyệt, PayOS hay job phải idempotent; trạng thái chỉ đổi bằng conditional update hợp lệ.
- Chỉ lưu token/OTP dạng hash; không lưu mật khẩu thiết bị, secret thanh toán, cookie hay mã tra cứu nguyên bản trong log.
- Ảnh nằm trong object/file storage; MongoDB giữ metadata và storage key.
- Thêm collection/index bằng migration có phiên bản, backup và kiểm tra duplicate trước; `autoIndex` không thay kế hoạch migration production.

## 2. Luồng nghiệp vụ

### Mua hàng guest/customer

1. Đọc catalog công khai; giỏ hàng hiện lưu ở trình duyệt, không phải MongoDB.
2. Checkout gửi product ID, số lượng, thông tin nhận hàng, phương thức thanh toán, voucher. Backend tải giá hiện hành và tự tính subtotal, phí ship, discount, total.
3. Lưu order với dòng hàng/giá/tên và người nhận dạng snapshot. Customer order gắn `userId`; guest order không có user và chỉ tra cứu/hủy theo khóa ngẫu nhiên, server chỉ lưu hash.
4. Idempotency key ngăn double-submit/retry tạo hai đơn. PayOS chỉ tạo payment link sau khi lưu đơn; COD không gọi cổng thanh toán.
5. Customer chỉ xem đơn của mình; guest phải cung cấp order ID/code và access token. Không đưa token lên URL, analytics hoặc log.

### Thanh toán, vận hành và trả hàng

- Trạng thái đơn và thanh toán là hai state machine riêng. Luồng thường: `pending → confirmed → shipping → delivered`; hủy theo điều kiện thanh toán. Customer có thể yêu cầu `return_requested`; nhân viên xử lý và admin ghi nhận kết quả/hoàn tiền theo quyền.
- PayOS chỉ được đánh dấu đã trả khi webhook có chữ ký hợp lệ và đúng mã đơn, số tiền, tiền tệ/liên kết thanh toán. Redirect return/cancel không chứng minh thanh toán.
- COD được đối soát theo quy trình giao hàng; trạng thái giao thành công không tự chứng minh tiền COD đã về shop.
- Thanh toán đến sau khi đơn bị hủy cần exception/đối soát thủ công; không hồi sinh đơn hoặc tự chuyển tiền hoàn.
- Staff cập nhật tracking/carrier/sự kiện; mỗi chuyển trạng thái nên phát event có actor, thời điểm, lý do và correlation ID.

### Danh tính, voucher và chăm sóc

- Đăng ký tạo customer chưa xác thực; OTP email xác nhận. Thiết bị mới cần mật khẩu + OTP; thiết bị tin cậy có token riêng, không lưu password. Đổi/reset password tăng `authVersion` để thu hồi phiên.
- Voucher được kiểm tra, giữ quota khi đặt đơn, chốt khi thanh toán/đủ điều kiện, giải phóng khi đơn lỗi/hủy. Reward voucher từ review tối đa một lần/đơn.
- Ticket support/return thuộc customer và order; staff/admin trả lời, cập nhật trạng thái. Ticket không tự thay trạng thái đơn.
- Vị Ơi dùng tri thức/catalog hiện hành. Chưa có collection hội thoại/quota 5/50 lượt; limiter HTTP theo IP không tương đương quota nghiệp vụ.
- Notification inbox, audit log đầy đủ, user deactivation/avatar và report export có người yêu cầu chưa được lưu thành aggregate riêng.

### State transitions đang được code enforce

| Aggregate | Chuyển trạng thái                                                                                                                                                         | Điều kiện quan trọng                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order     | `pending → confirmed/cancelled`; `confirmed → shipping/cancelled`; `shipping → delivered/return_requested`; `delivered → return_requested`; `return_requested → returned` | `cancelled` và `returned` là cuối. Customer tự hủy chỉ COD `pending` + `unpaid`. Sang `shipping` phải có carrier hoặc tracking number. PayOS chỉ fulfillment khi `paid` và không còn payment exception. |
| Payment   | `unpaid → paid/failed`; `failed → paid`; `paid → refund_pending`; `refund_pending → refunded`                                                                             | PayOS `paid` chỉ qua webhook đã xác minh; COD chỉ ghi `paid` khi đơn `delivered`. Refund cần trạng thái return/cancel phù hợp và thực hiện chuyển tiền ngoài hệ thống trước khi admin ghi nhận.         |

Job PayOS quá hạn chỉ đặt cờ review/exception sau 24 giờ; không tự kết luận `failed`. Callback PayOS hợp lệ đến muộn có thể phục hồi `failed` thành `paid`; nếu đơn đã hủy, giữ `cancelled` và yêu cầu đối soát/hoàn tiền thủ công.

### Mức độ triển khai nghiệp vụ

| Nghiệp vụ                                                                         | Mức độ                  | Tình trạng                                                                                                        |
| --------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Guest checkout/tra cứu đơn, COD, khóa truy cập dạng hash, idempotency             | `[IMPLEMENTED]`         | Không cần account; lưu snapshot và tính giá phía server.                                                          |
| Auth email OTP, OTP thiết bị mới, thiết bị tin cậy 30 ngày, quên/đặt lại mật khẩu | `[IMPLEMENTED]`         | Google login chưa có; danh sách thiết bị để customer tự thu hồi chưa có.                                          |
| PayOS tạo payment link, ký payload, xác minh webhook, lệnh đăng ký URL            | `[IMPLEMENTED - LOCAL]` | DNS/HTTPS công khai và xác minh merchant production chưa hoàn tất; không có bằng chứng live callback.             |
| Staff xử lý order/ticket, staff/admin vận hành sản phẩm và voucher                | `[PARTIAL]`             | Có quy trình cốt lõi; thiếu assignment/priority/SLA và audit actor xuyên suốt.                                    |
| Admin user management và báo cáo                                                  | `[PARTIAL]`             | Có list user/tạo staff và dashboard aggregate; chưa có status/role edit đầy đủ, export có người lập và audit log. |
| Chat Vị Ơi                                                                        | `[PARTIAL]`             | Có giới hạn IP 20 request/10 phút trong memory; quota 5 guest/50 account theo kỳ chưa có; không lưu conversation. |
| Inbox notification, append-only audit log, report run/export, chat quota Mongo    | `[PROPOSED]`            | Chưa có model/collection hoặc luồng API tương ứng.                                                                |

## 3. MongoDB hiện tại

| Model/dữ liệu                                                          | Đã lưu                                                                                                                      | Index/ràng buộc hiện có                                                                       | Khoảng trống                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerUser` (`users`)                                               | Tên, email, password hash, role, phone, addresses nhúng, email verification, `authVersion`, reset/login lease               | Email unique; password/reset fields `select: false`                                           | Validator lowercase email lúc đăng ký/đăng nhập nhưng không có field normalized riêng. Thiếu active/disabled, avatar, audit history; API có list users/tạo staff nhưng chưa đủ đổi role/trạng thái. |
| `CustomerSession` (`customersessions`)                                 | Hash session, user, expiry, auth version                                                                                    | Hash unique; TTL `expiresAt`                                                                  | TTL cleanup bất đồng bộ; API vẫn cần kiểm expiry.                                                                                                                                                   |
| `AuthChallenge` (`authchallenges`), `TrustedDevice` (`trusteddevices`) | Hash code/token, user, kind, attempts/lease, expiry/version                                                                 | Hash unique; TTL; index user                                                                  | Tách riêng hợp lý; chưa có tên thiết bị/IP/UA để user quản lý thiết bị; TTL không thay kiểm expiry tại request.                                                                                     |
| `Order` (`orders`)                                                     | Item/giá snapshot, totals, customer snapshot, guest token hash, idempotency, PayOS refs/exceptions, status, tracking/events | `code`, `orderCode`, `idempotencyKey` unique; index trạng thái/thanh toán/thời gian; `userId` | Shipping events nhúng giới hạn 200 gần nhất; chưa có timeline/audit actor riêng và thiếu index `{userId, createdAt}`.                                                                               |
| `CustomerVoucher` (`customervouchers`)                                 | Rule và mảng `reservations` nhúng                                                                                           | Code unique; index multikey reservation order ID                                              | Quota atomic trên một document nhưng mảng tăng không giới hạn; nguy cơ vượt BSON 16 MB, `$size/$filter` tốn kém, contention voucher hot.                                                            |
| `CustomerWallet` (`customerwallets`)                                   | Liên kết user–voucher và reward order                                                                                       | Unique `(userId, voucherId)`; partial unique `rewardOrderId`                                  | Một entry/user/voucher; phát hành lặp cần grant ID riêng.                                                                                                                                           |
| `CustomerReview` (`customerreviews`)                                   | Review user/order/product                                                                                                   | Unique `(userId, orderId, productId)`; index product                                          | Chống review trùng; chưa có moderation status, ảnh hoặc seller reply; reward cần idempotent.                                                                                                        |
| `CustomerTicket` (`customertickets`)                                   | Ticket và replies nhúng                                                                                                     | Index user; unique ticket return theo `(userId, orderId, kind)`                               | Replies không giới hạn; thiếu assignment, priority/SLA, attachment khiếu nại và audit actor.                                                                                                        |
| `SiteContent` (`sitecontents`)                                         | Một `key=site` chứa content + catalog/products kiểu `Mixed`                                                                 | `key` unique; compare-and-set                                                                 | Chưa là catalog chuẩn hóa cho tồn kho, variants, giá history, phân quyền từng trường.                                                                                                               |
| `Contact` (`contacts`)                                                 | Form liên hệ                                                                                                                | Chưa có index nghiệp vụ                                                                       | Chưa có trạng thái xử lý/assignee/SLA, không thay thế support ticket.                                                                                                                               |
| Uploads                                                                | File WebP trong `backend/uploads`, product giữ path                                                                         | UUID filename phía filesystem                                                                 | Chưa lưu metadata/uploader/hash/lifecycle/storage ngoài server trong DB.                                                                                                                            |

Các collection trong ngoặc là tên kỳ vọng theo Mongoose pluralization; trước migration vẫn phải kiểm tra Atlas và đối chiếu `Model.collection.collectionName`. Server hiện chạy `initializeCustomerIndexes()` khi khởi động: backfill `authVersion`, sau đó gọi `model.init()` để tạo/đảm bảo index các model customer. Đây chưa phải migration runner có version; dữ liệu duplicate có thể làm unique index thất bại. Không rename, drop hoặc seed Atlas production dựa vào tên đoán.

## 4. Mô hình đích đề xuất

Thiết kế theo giai đoạn, **không khẳng định đã triển khai**. Giữ model hiện tại tương thích trong rollout đầu; không cần tách mọi collection ngay.

| Aggregate đích                                    | Nội dung/quan hệ                                                                                                   | Lý do                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `users`                                           | `emailNormalized`, password hash, role, `status`, verification, `authVersion`, `profile.avatarAssetId`             | Một danh tính cho ba role; disable phải được kiểm tra ở mọi authorization.                        |
| `addresses` (chỉ nếu vượt giới hạn)               | `userId`, label, recipient snapshot, default, timestamps                                                           | Tối đa 10 address hiện tại có thể nhúng; tách nếu cần audit/history/query độc lập.                |
| `sessions`, `authChallenges`, `trustedDevices`    | Hash token/code, `userId`, expiry, version, attempts                                                               | Lifecycle/revoke riêng; không dùng device fingerprint làm yếu tố xác thực duy nhất.               |
| `products` / `productVariants`                    | Stable ID, slug/SKU, draft/published/archived, nội dung, giá VND, asset refs, thuộc tính đã xác minh, variant/pack | Tách khi cần truy vấn/tồn kho/report độc lập; giữ ID/slug, không tạo ingredient/allergen bằng AI. |
| `assets`                                          | Storage key, MIME, bytes, hash, dimensions, uploader, purpose, lifecycle                                           | Mongo giữ metadata; binary có backup ở file/object storage.                                       |
| `orders`                                          | Owner tùy chọn, customer/item snapshots, monetary breakdown, payment/fulfillment state, idempotency scope/hash     | Không đọc giá hiện tại cho đơn cũ; snapshot còn nguyên khi product archive.                       |
| `orderEvents`                                     | `orderId`, from/to, event, actor/role, reason, time, request ID                                                    | Timeline append-only; giữ vài shipping event gần nhất trong order nếu cần cache.                  |
| `paymentAttempts` / `paymentEvents`               | Order/provider/link, amount/currency/status, provider event ref nếu có, payload hash, received/processed time      | Retry/dedupe/đối soát; không lưu raw data nhạy cảm.                                               |
| `vouchers`, `voucherGrants`, `voucherRedemptions` | Campaign rule; grant user; reservation/consumption order                                                           | Thay reservations array không giới hạn bằng ledger truy vấn/audit được.                           |
| `reviews`                                         | User/order/product, rating, content, moderation, verified purchase                                                 | Một review/order/product; reward idempotent.                                                      |
| `supportTickets` + `ticketMessages`               | Ticket owner/order/kind/status/priority/assignee/SLA; message riêng                                                | Tránh document phình, hỗ trợ queue và audit từng phản hồi.                                        |
| `notifications`                                   | Owner, channel/type, payload tối thiểu, read/delivered time, source, dedupe key                                    | Inbox/unread/retry; email outbox có thể riêng.                                                    |
| `auditEvents`                                     | Actor/role, action, entity, safe diff, reason, request ID, risk metadata theo policy                               | Append-only cho thao tác nhạy cảm; không lưu password/token/OTP/keys.                             |
| `reportRuns`                                      | Người yêu cầu, report/filter/timezone, status, storage key, created/finished time                                  | Chỉ khi report phải xuất/lưu; dashboard aggregate không phải report có lịch sử.                   |
| `chatQuotas`                                      | Subject type/hash, period, count, expiry                                                                           | Counter atomic; guest cần token opaque. Không lưu transcript mặc định.                            |
| `inventory` / `stockMovements` (tùy chọn)         | SKU/lot, on-hand/reserved, expiry/batch, movement ledger                                                           | Chỉ làm sau khi shop xác nhận quản lý tồn/lô/HSD/giữ hàng.                                        |

Quan hệ: User–Orders (guest order không có user); User–Sessions/Devices/Notifications/Tickets/Reviews; Order–Events/PaymentAttempts/Tickets/Reviews/Redemptions; Product–Variants/Reviews/order snapshots; Voucher–Grants/Redemptions; Asset–avatar/product/content. Order line giữ product ID tham chiếu cùng tên/variant/giá/số lượng snapshot. Không cascade-delete order khi user/product bị xóa; archive/anonymize theo retention policy.

## 5. Index đích

Các index này chỉ là mục tiêu sau khi xác nhận truy vấn và kiểm tra dữ liệu. Xác minh selectivity/execution plan trên staging; không tạo toàn bộ một lượt trên production.

| Collection                   | Index đề xuất                                                                                                       | Mục đích                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users`                      | Unique `{emailNormalized: 1}`; `{role: 1, status: 1, createdAt: -1}`                                                | Một email sau normalize; list/filter admin. Resolve duplicate trước khi tạo.                           |
| `sessions`, `trustedDevices` | Unique `{tokenHash: 1}`; TTL `{expiresAt: 1}` với `expireAfterSeconds: 0`                                           | Lookup hash và cleanup; API vẫn kiểm expiry/authVersion.                                               |
| `authChallenges`             | Unique `{idHash: 1}`; `{userId: 1, kind: 1, createdAt: -1}`; TTL `{expiresAt: 1}`                                   | Lookup/rate limiting theo user và cleanup.                                                             |
| `products`                   | Unique `{slug: 1}`, `{sku: 1}` nếu SKU được chốt; `{status: 1, category: 1, sortOrder: 1}`                          | Catalog/admin list; unique partial khi draft có thể thiếu slug/SKU.                                    |
| `orders`                     | Unique `{code: 1}`, `{orderCode: 1}`; unique idempotency `{idempotencyScope: 1, idempotencyKeyHash: 1}`             | Public reference, PayOS lookup, retry safety. Không thay index hiện tại trước backfill/collision test. |
| `orders`                     | `{userId: 1, createdAt: -1}`                                                                                        | Lịch sử account theo ngày.                                                                             |
| `orders`                     | `{status: 1, priority: -1, createdAt: 1}` nếu có priority/SLA; nếu chưa thì `{status: 1, createdAt: 1}`             | Queue staff theo thứ tự xử lý.                                                                         |
| `orders`                     | `{paymentMethod: 1, paymentStatus: 1, createdAt: 1}`                                                                | Đối soát thanh toán pending/expired.                                                                   |
| `orderEvents`                | `{orderId: 1, occurredAt: -1}`; `{actorId: 1, occurredAt: -1}`                                                      | Timeline đơn và nhân viên.                                                                             |
| `paymentAttempts`            | `{orderId: 1, createdAt: -1}`; unique `{provider: 1, providerEventId: 1}` khi provider có stable ID                 | Retry/dedupe. Nếu thiếu stable event ID thì dùng conditional transition, không giả định key.           |
| `vouchers`                   | Unique `{codeNormalized: 1}`; `{active: 1, startsAt: 1, expiresAt: 1}`                                              | Tra mã và campaign hiệu lực.                                                                           |
| `voucherGrants`              | Unique `{userId: 1, voucherId: 1}` nếu chỉ grant một lần; `{userId: 1, status: 1, expiresAt: 1}`                    | Ví voucher và claim idempotent.                                                                        |
| `voucherRedemptions`         | Unique `{orderId: 1}`; `{voucherId: 1, userId: 1, status: 1}`                                                       | Một lần giữ/dùng mỗi order; đếm quota.                                                                 |
| `reviews`                    | Unique `{userId: 1, orderId: 1, productId: 1}`; `{productId: 1, status: 1, createdAt: -1}`                          | Chống review trùng; lấy review public đã duyệt.                                                        |
| `supportTickets`             | `{status: 1, priority: -1, updatedAt: 1}`; `{assigneeId: 1, status: 1, updatedAt: 1}`; `{userId: 1, createdAt: -1}` | Queue nhân viên và lịch sử customer; unique partial cho return nếu chỉ cho một case/order.             |
| `ticketMessages`             | `{ticketId: 1, createdAt: 1}`                                                                                       | Phân trang message theo ticket.                                                                        |
| `notifications`              | `{userId: 1, createdAt: -1}`; `{userId: 1, readAt: 1, createdAt: -1}`; unique partial `{dedupeKey: 1}`              | Inbox/unread/retry idempotent. Chỉ thêm TTL sau khi chốt retention.                                    |
| `auditEvents`                | `{entityType: 1, entityId: 1, occurredAt: -1}`; `{actorId: 1, occurredAt: -1}`; `{occurredAt: -1}`                  | Điều tra theo entity, actor, thời gian. Không TTL trước retention/legal review.                        |
| `reportRuns`                 | `{requestedBy: 1, createdAt: -1}`; `{status: 1, createdAt: 1}`                                                      | Lịch sử report và worker queue.                                                                        |
| `chatQuotas`                 | Unique `{subjectHash: 1, periodStart: 1}`; TTL `{expiresAt: 1}`                                                     | Một counter/subject/kỳ, cleanup kỳ cũ; tăng bằng atomic update.                                        |

TTL cleanup chạy bất đồng bộ; API/job phải tự kiểm `expiresAt`. Unique index không sửa dữ liệu trùng sẵn; migration phải audit trước.

## 6. Atomicity và đối soát

- Hiện voucher `findOneAndUpdate` kiểm quota và push reservation trên cùng document nên tránh race ở một voucher; array vẫn tăng không giới hạn và voucher hot gây contention.
- Order và voucher là hai document: service reserve quota rồi tạo order, giải phóng reservation khi lỗi. Đây là compensation/saga, không phải transaction xuyên collection; cần job phát hiện reservation mồ côi và đối soát.
- Unique idempotency key bảo vệ checkout. Retry phải so `payloadHash` cùng owner/scope; trùng key nhưng payload khác phải conflict, không trả nhầm đơn.
- Webhook có thể lặp/đến sai thứ tự. Kiểm chữ ký, amount, code, payment link; conditional update theo trạng thái cũ, ghi exception và cho retry phục hồi settle voucher. Không giữ DB transaction khi gọi PayOS/SMTP/Gemini.
- Nếu order, event và outbox cần commit cùng nhau, dùng transaction Mongo ngắn khi Atlas topology hỗ trợ; gọi dịch vụ ngoài sau commit qua outbox/retry. Nếu transaction không khả dụng, dùng pending state + idempotent worker/reconciliation, không giả định multi-document atomicity.
- Index unique quan trọng cần được tạo trước khi bật traffic mới; kiểm duplicate, collation, partial filter, backup/restore và rollback plan.
- Audit diff phải redact email/phone/address khi không cần; tuyệt đối không ghi password, OTP, token, API key hay checksum key.

## 7. Quyền và audit

| Actor    | Cho phép                                                                               | Không được phép                                                                       |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Guest    | Public content, local cart, checkout, order riêng qua secret token, chatbot theo quota | Hồ sơ/đơn người khác, thao tác staff/admin                                            |
| Customer | Hồ sơ/địa chỉ/order/voucher/review/ticket của mình; yêu cầu đổi/trả theo điều kiện     | Đổi role/status, xem dữ liệu người khác, tự xác nhận thanh toán                       |
| Staff    | Xử lý order/giao vận, queue hỗ trợ, trả lời ticket                                     | Quản lý user/role, sửa catalog, phát voucher nếu chưa được cấp quyền, xác nhận refund |
| Admin    | Quyền staff, catalog, user/staff, voucher, report theo policy                          | Ghi nhận PayOS paid ngoài webhook; xem credential/token; xóa audit để che thao tác    |

Audit tối thiểu: login/OTP lock đáng ngờ; tạo/disable/role-change user; reset/revoke session; sửa giá/publish/ảnh; tạo/sửa voucher; thay order/payment/fulfillment/refund; trả lời/đóng ticket; export report; đổi cấu hình payment/webhook. Ghi actor ID/role snapshot, action, target, kết quả, reason, request ID, thời gian; IP/risk chỉ theo privacy/retention policy. Role check phải ở API, không chỉ ẩn UI.

## 8. Triển khai/migration an toàn

1. **Inventory/backup:** xác nhận cluster/collection vật lý, export schema/index/count, thử restore trên DB riêng. Không seed/drop/rename/migrate trước khi xác nhận môi trường.
2. **Harden hiện trạng:** chuẩn hóa email/code, đo duplicate/document growth; thêm index sau explain-plan; tạo migration runner có version và kiểm soát index production.
3. **Account/audit:** thêm status, avatar asset, audit actor. Backfill status=`active`, giữ role/_id; kiểm session revoke và rollback.
4. **Notification/outbox:** thêm collection không phá luồng cũ; phát event sau action, retry có dedupe; chốt channel/preference trước khi gửi.
5. **Voucher ledger:** dual read/write có flag, backfill reservation, so campaign/counter, resolve lệch rồi cutover; chỉ bỏ array sau đối soát và backup.
6. **Catalog/assets:** chuyển product từ singleton content sang collection stable ID qua adapter; so ID/slug/price/images; migrate binary có backup và giữ order snapshot.
7. **Operations/report/chat:** thêm event timeline, assignment/SLA, report run, quota counter sau khi chốt nghiệp vụ; load-test/index trước rollout.
8. **Go-live:** unit/integration/e2e, role matrix, webhook valid/invalid/duplicate/wrong amount, restore drill, alerts/runbook. Chỉ bật PayOS sau DNS+HTTPS, merchant verification, đối soát và đầu mối hoàn tiền.

Migration phải additive-first, versioned, idempotent/resumable, batchable, dry-run/count, log an toàn, reconcile totals và có rollback/forward-fix. Không chạy migration production từ development script.

## 9. Cần chủ shop xác nhận

- Giá/SKU/variants chính thức; tồn kho, lô/HSD và quy trình giữ/nhả hàng; nguồn ingredient/allergen/ảnh chính thức.
- Ai xác nhận từng bước đơn, SLA/priority, assignment, giới hạn hủy/sửa địa chỉ, COD đối soát, đổi/trả và ai ghi nhận hoàn tiền.
- Voucher có stack không; eligibility, quota khi payment fail/expire/cancel, ngân sách reward review và expiry.
- Notification qua app/email/SMS nào, event/preference/retry/retention.
- Avatar formats/size, storage production, xóa ảnh đang được product/order tham chiếu.
- Quota chatbot 5 guest/50 login tính theo ngày/phiên/lifetime; guest identity/cookie; có lưu hội thoại/consent không.
- Report/export cần loại nào, timezone, định nghĩa doanh thu/đã thu/refund/COD, quyền tải file và retention.
- Thời hạn giữ contact/order/PII/ticket/audit; cách xử lý yêu cầu xóa hoặc anonymize tài khoản.

## 10. Tài liệu tham khảo

- MongoDB Manual — unique indexes: https://www.mongodb.com/docs/manual/core/index-unique/
- MongoDB Manual — TTL indexes: https://www.mongodb.com/docs/manual/core/index-ttl/
- MongoDB Manual — BSON document maximum size: https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-BSON-Document-Size
- MongoDB Manual — atomicity/transactions: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/ và https://www.mongodb.com/docs/manual/core/transactions/
- PayOS API: https://payos.vn/docs/api/
- Implementation: [API](api.md), [luồng tài khoản](customer-workflows.md), [thanh toán](payments.md), [vận hành](operations.md), `backend/src/models/`, `backend/src/services/`.
