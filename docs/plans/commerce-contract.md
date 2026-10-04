# Phạm vi mở rộng theo yêu cầu ngày 04/10/2026

Yêu cầu mới thay thế các giới hạn chỉ giới thiệu/không thanh toán trong initial-release.md. Có giỏ hàng, giá tạm, mua hàng guest, COD, payOS/VietQR, tra cứu/hủy đơn, quản trị đơn. Chưa kích hoạt thu tiền thật vì chưa có merchant credentials. Không tự đánh dấu đã trả tiền từ redirect trình duyệt. Giao vận thủ công bằng mã vận đơn ở CMS, chưa tích hợp nhà vận chuyển.

## Cấu trúc bắt buộc

frontend/src: app, assets, components, constants, contexts, hooks, layouts, pages, routes, services, styles, utils.
backend/src: config, constants, controllers, jobs, middlewares, models, routes, services, utils, validators.
Mỗi thư mục có file đảm nhiệm chức năng thực tế. Backend server.ts và app.ts ở src root.

## Hợp đồng API giữa frontend/backend

- GET /api/content: {site,products}, product schema hiện tại giữ nguyên; price integer VND hoặc null.
- GET /api/commerce/config: {enabled:boolean,payments:{cod:boolean,payos:boolean},shippingFee:number,freeShippingThreshold:number,pricingNotice:string}.
- POST /api/orders, header Idempotency-Key UUID: {items:[{productId,quantity}],customer:{name,email,phone,address},paymentMethod:'cod'|'payos',note:string,consent:true}. Backend tính giá từ catalog, quantity integer1..99, max20 dòng, shippingFee=30000, freeShippingThreshold=499000 mặc định env có thể chỉnh. Không nhận giá từ client.
- Thành công 201: {order:{id,code,items:[{productId,name,quantity,unitPrice}],subtotal,shippingFee,total,status,paymentStatus,paymentMethod,createdAt,customer,note,trackingNumber?},accessToken:string,paymentUrl:string|null}. Có thể 200 khi replay. id/code công khai không đủ để truy cập; accessToken guest được dẫn xuất HMAC từ khóa đặt đơn UUID bí mật và trả nhất quán khi retry; chỉ lưu hash ở DB. Đơn đăng nhập trả token rỗng và yêu cầu phiên chủ tài khoản. Lặp cùng idempotency key an toàn; key khác payload409.
- GET /api/orders/:id header X-Order-Token: trả trực tiếp order như trên. Query parameters không chứa token.
- POST /api/orders/:id/cancel header X-Order-Token: chỉ cho đơn COD pending chưa paid; các đơn online cần quản trị xử lý để tránh race thanh toán.
- POST /api/orders/:id/payment header X-Order-Token: tạo/lấy lại paymentUrl cho đơn online unpaid chưa hủy. Trả {paymentUrl}.
- POST /api/payments/payos/webhook: xác minh signature + order code + amount + currency + trạng thái + paymentLinkId nếu có. Duplicate callback idempotent. Không thay status đơn shipped/delivered. Callback sau cancel ghi nhận payment exception để xử lý thủ công, không tự hồi đơn.
- GET /api/admin/orders cookie phiên user có role staff/admin: {orders:[order],total:number}; danh sách phân trang ?page=1&limit=20.
- PATCH /api/admin/orders/:id cookie phiên user có role staff/admin: {status?,trackingNumber?,paymentStatus?}. Status pending->confirmed->shipping->delivered; pending/confirmed->cancelled nếu chưa trả online; COD được staff/admin xác nhận đã thu khi delivered. Không cho gán paid cho payOS bằng thao tác này.
- POST /api/contact theo hiện tại; CMS GET/PUT /api/admin/content theo hiện tại.
- Lỗi: {message:string}, status400/401/404/409/503, không thông tin bí mật.

## Luồng giao diện

Giỏ hàng localStorage {productId,quantity}; nút + trên card thêm hàng; giỏ có tăng giảm/xóa/tổng; checkout nhập địa chỉ và phương thức, rà đơn trước submit; nút thanh toán payOS tắt với giải thích khi chưa cấu hình. Giữ cart khi request thất bại. Chỉ xóa cart sau tạo đơn thành công. accessToken giữ sessionStorage, không URL; trang /don-hang/:id hiển thị đơn, trạng thái và mã vận đơn; /tra-cuu-don-hang nhập mã/id và khóa tra cứu nhận khi đặt hàng. /thanh-toan/ket-qua chỉ hiển thị pending + tra lại backend. CMS quản trị nội dung và đơn. Tài khoản và các role đã nằm trong phạm vi bản đầu; xem customer-workflows.md. Guest vẫn mua và tra cứu bằng khóa riêng.

## Kiểm tra

Giá giả từ client không ảnh hưởng total; số lượng sai bị từ chối; không lưu khi DB chưa sẵn sàng; chống đặt trùng; không xem/hủy đơn người khác; callback giả/sai tiền không được paid; callback lặp không gây cập nhật sai; admin không nhảy trạng thái; không báo thành công khi thanh toán chưa xác nhận. E2E desktop/mobile giỏ->checkout->order và thất bại giữ giỏ.
