# CMS và vận hành cửa hàng

Các tài khoản admin, staff, customer cùng nằm trong collection `users`, phân biệt bằng `role`. Mọi lần gọi API tải lại role từ cơ sở dữ liệu. Admin đăng nhập bằng email/mật khẩu như các tài khoản khác. Không dùng ADMIN_TOKEN hoặc tài khoản quản trị lấy trực tiếp từ môi trường chạy server.

## Khởi tạo

1. Cấu hình MONGODB_URI, ORDER_TOKEN_SECRET dài tối thiểu32 ký tự, FRONTEND_ORIGIN; production phải dùng HTTPS.
2. Cấp ADMIN_EMAIL, ADMIN_PASSWORD (10–128 ký tự), ADMIN_NAME, ADMIN_PHONE tạm thời cho **lệnh khởi tạo một lần** `npm run init:admin -w backend`. Nếu chỉ có bản build, dùng `npm run init:admin:prod -w backend`.
3. Sau lệnh, bỏ các biến khởi tạo khỏi môi trường server. Lệnh tạo một document users.role=admin nếu chưa có; không nâng quyền tài khoản trùng email và không đổi mật khẩu đã có. Server không đọc các biến này để xác thực.
4. Đăng nhập tại `/tai-khoan`, vào `/quan-tri`. Admin quản lý nội dung, nhân viên, voucher, đơn, khiếu nại; staff xử lý đơn/giao vận/hỗ trợ, không sửa nội dung, voucher hoặc người dùng.

`npm run seed:demo -w backend` tạo admin nếu được cấp thông tin khởi tạo và hai campaign HATHANHVI10/QUAHANOI20. Lệnh này từ chối NODE_ENV=production. Campaign demo không được tự tạo khi serverproduction khởi động.

## Nội dung và giá

GET/PUT `/api/admin/content` dùng cookie admin, trả/thay thế toàn bộ site/products sau khi kiểm tra schema. Giá dùng số nguyên VND; `null` vẫn hiển thị sản phẩm nhưng không cho mua. Chỉ sử dụng ảnh `/brand/...` hợp lệ hoặc URL HTTP(S) được kiểm tra. Khi sửa, đọc bản mới nhất trước khi lưu. Nội dung trong MongoDB có ưu tiên so với file seed; seed chỉ khởi tạo khi chưa có tài liệu.

## Đơn, vận chuyển và hỗ trợ

Đơn đi theo pending → confirmed → shipping → delivered; khiếu nại trả hàng chuyển return_requested → returned. Có thể hủy đơn pending/confirmed khi điều kiện thanh toán cho phép. COD chỉ xác nhận đã thu ở delivered. Đơn payOS chưa được webhook xác nhận paid không được xuất/giao hàng. Chỉ admin ghi nhận refund_pending/refunded sau đối soát và hoàn tiền thực tế; thao tác trên web chỉ ghi nhận trạng thái, không chuyển tiền.

Nhân viên nhập đơn vị giao hàng, mã vận đơn và ghi chú sự kiện thực. Chuyển shipping cần ít nhất đơn vị hoặc mã vận đơn. Lịch sử không giả lập GPS/ETA. PATCH yêu cầu trạng thái còn đúng so với bản đã đọc, khi xung đột API trả409 để tải lại. Admin và staff có thể đọc và trả lời ticket; customer chỉ thấy ticket của mình.

Không cấu hình MongoDB: nội dung seed vẫn đọc được; tài khoản/đơn/liên hệ/CMS không báo ghi thành công. Cần sao lưu users, đơn, vouchers, ví, reviews, tickets và nội dung trước khi đổi môi trường. Xem [API](api.md), [luồng khách hàng](customer-workflows.md), [thanh toán](payments.md) và [giao vận](shipping.md).
