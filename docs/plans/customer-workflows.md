# Mở rộng tài khoản, giao vận và chăm sóc khách hàng

Yêu cầu người dùng ngày 04/10/2026 có hiệu lực cao hơn giới hạn tài khoản giai đoạn sau trong các kế hoạch trước.

## Vai trò

- admin: kiêm manager; quản lý nội dung, sản phẩm/giá, nhân viên, tất cả đơn, voucher và xử lý khiếu nại.
- staff: đọc/xử lý đơn, thêm mã vận đơn, trả lời và cập nhật khiếu nại; không quản lý tài khoản/quyền, nội dung hoặc chiến dịch voucher.
- customer: đăng ký/đăng nhập/đăng xuất; địa chỉ riêng, lịch sử đơn của mình, đánh giá đơn đã giao, ví voucher và yêu cầu hỗ trợ/đổi trả.

## Tài khoản

Phiên cookie HttpOnly SameSite Lax, Secure production; mật khẩu băm scrypt với salt, không trả hash. Session ngẫu nhiên lưu hash trong MongoDB, TTL30 ngày. CSRF: kiểm tra Origin và X-Requested-With cho thao tác thay đổi dùng session. Đăng ký không nhận role từ client. Cả ba role lưu trong collection users. Tạo admin một lần bằng init:admin; không có xác thực admin riêng qua môi trường server. Admin tạo staff. Mật khẩu từ10 ký tự, giới hạn128. Rate-limit đăng nhập/đăng ký, lỗi đăng nhập chung.

## Hợp đồng customer API

- POST /api/auth/register {name,email,password,phone}; POST /api/auth/login {email,password}; POST /api/auth/logout. Trả {user:{id,name,email,phone,role}} trừ logout204.
- GET /api/auth/me -> {user:...},401 nếu chưa đăng nhập.
- GET /api/account/addresses -> {addresses:[{id,label,name,phone,address,isDefault}]}; POST cùng fields trừid; PATCH /:id; DELETE /:id. Tối đa10 địa chỉ, chỉ một default; chọn địa chỉ mặc định ở checkout, snapshot thông tin vào đơn để sửa sổ địa chỉ không đổi đơn cũ.
- GET /api/account/orders -> {orders:[Order]}; xác định owner bằng session userId, tuyệt đối không nhận owner từ body.
- GET /api/account/vouchers -> {vouchers:[VoucherWalletItem]}; POST /api/account/vouchers/claim {code}. Voucher wallet fields id,code,name,type:'fixed'|'percent',value,minOrder,maxDiscount,startsAt,expiresAt,status:'available'|'used'|'expired'.
- GET /api/products/:productId/reviews -> {reviews:[{id,rating,comment,authorName,createdAt}]}; POST /api/account/reviews {orderId,productId,rating,comment}; chỉ owner đơn delivered chứa product, unique user/order/product, rating1..5, plain text. Một voucher thưởng mỗi đơn được đánh giá lần đầu, không cho spam nhiều dòng sản phẩm nhận nhiều thưởng.
- GET /api/account/tickets -> {tickets:[...]}; POST /api/account/tickets {orderId,kind:'support'|'return',message}; only own order, return only delivered. Staff/admin GET /api/staff/tickets; PATCH /api/staff/tickets/:id {status:'open'|'in_progress'|'resolved',reply:string}. Tickets lưu lịch sử phản hồi.
- GET /api/admin/users; POST /api/admin/staff {name,email,password,phone}; admin only.
- GET/POST /api/admin/vouchers; voucher campaign {code,name,type,value,minOrder,maxDiscount,startsAt,expiresAt,distribution:'automatic'|'code',totalLimit,perUserLimit,active}. Không cho giá trị âm, percent>100; một mã/đơn, backend kiểm tra và tính; giới hạn usage atomic, release reservation khi cancel/fail; không chấp nhận discount từ client.

## Đơn và giao vận

Tab khách: tất cả, chờ xác nhận(pending), chờ lấy hàng(confirmed), chờ giao hàng(shipping), đã giao(delivered), trả hàng(return_requested/returned), đã hủy(cancelled). Trạng thái thanh toán riêng (unpaid/paid/failed/refund_pending/refunded); hoàn tiền trực tuyến cần đối soát, không giả báo đã hoàn. Order snapshot userId khi authenticated. Khách xem đơn bằng own session hoặc accessToken của guest. Admin và staff xử lý đơn. Giao vận thủ công có carrier/trackingNumber/events trước, adapter GHN không gọi live khi thiếu credentials. Chỉ hiển thị sự kiện thật được nhập, không bịa GPS/ETA. Cần thêm địa chỉ IDs và cấu hình provider để báo phí live; phí cấu hình dùng cho demo.

## Tích hợp dự kiến

Customer middleware gắn req.user, route modules độc lập. Tài khoản không hoạt động khi MongoDB chưa cấu hình:503 rõ ràng. Preview UI có thể thử với MongoDB phát triển cục bộ. Kiểm tra authorization/IDOR, state transitions, uniqueness reviews, voucher expiry/cap/quota và session cookie.
