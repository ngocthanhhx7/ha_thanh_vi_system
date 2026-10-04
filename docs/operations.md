# Vận hành

## Phát triển và demo

`npm ci` cài dependencies đã khóa phiên bản. `npm run dev:demo` chạy React, API và MongoDB phát triển; lần đầu tải MongoDB binary. MongoDB demo giữ dữ liệu trong `.local/mongodb`, bind localhost; không dùng bản này làm dịch vụ production.

Tài khoản admin ngẫu nhiên lưu tại `.local/preview-credentials.txt`; mật khẩu và khóa tra cứu đơn được tạo một lần, không commit. Trình demo khởi tạo admin vào MongoDB trước khi chạy API. Admin có thể tạo staff tại `/quan-tri`. Cả ba vai trò đều là tài khoản trong collection `users` với trường `role`; đăng ký bình thường luôn tạo customer, không được tự chọn vai trò cao hơn. API đọc role từ database, không xác thực admin bằng token riêng trong env.

Nếu đã có MongoDB, dùng `backend/.env` rồi `npm run dev`. Có thể chạy MongoDB cục bộ bằng `docker compose up -d mongo`; điền URI `mongodb://127.0.0.1:27017/ha_thanh_vi` trong env. Dịch vụ compose chỉ phục vụ phát triển.

## Triển khai

1. Chạy `npm ci`, `npm run verify`, `npm run format:check` và `npm run test:e2e`.
2. Phục vụ `frontend/dist` qua HTTPS; đường dẫn SPA không phải file cần trả về `index.html`. Reverse proxy `/api` sang Node API trên mạng nội bộ. Không phục vụ thư mục repository, `.env`, `.local` hoặc assets gốc.
3. Chạy `node backend/dist/server.js` từ root repository; giữ `content/site.json` để seed nếu cần. Khi triển khai env lấy từ secret manager hoặc biến môi trường của host. Nếu dùng file env, backend đọc theo thư mục làm việc, cần kiểm tra cấu hình host.
4. Cấu hình `NODE_ENV=production`, `MONGODB_URI`, `FRONTEND_ORIGIN`, `PUBLIC_WEB_URL`, `ORDER_TOKEN_SECRET`. Dùng origin HTTPS thực tế. MongoDB cần tài khoản riêng, hạn chế mạng, backup và thử khôi phục.
5. Tạo tài khoản admin một lần trong `users` bằng công cụ khởi tạo, truyền thông tin ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME chỉ vào tiến trình khởi tạo. Đây là dữ liệu đầu vào để tạo user có `role=admin`, không phải cơ chế phân quyền trong env và không được đưa vào cấu hình API chạy thường xuyên. Không dùng mật khẩu demo cho production. Lệnh `seed:demo` có thêm voucher demo, chỉ dùng ở môi trường phát triển.
6. Muốn nhận VietQR qua payOS, làm theo [thanh toán](payments.md), cấu hình credentials và webhook HTTPS, kiểm chứng bằng giao dịch được merchant cho phép. Đổi `PAYMENTS_ENABLED` sau khi kiểm tra. Không có credentials thì chỉ COD hoạt động.
7. Kiểm tra đăng ký, đăng nhập, địa chỉ, đặt COD, quyền staff/admin, hành trình, voucher và đổi trả trên host thật. Không dùng số liệu demo để quảng cáo doanh số/đánh giá.

## Dữ liệu và phục hồi

Các collection MongoDB lưu nội dung, đơn, tài khoản, phiên, địa chỉ, voucher, đánh giá và hỗ trợ. Sao lưu MongoDB theo lịch của host và kiểm tra khôi phục vào database riêng. Xóa dữ liệu demo bằng công cụ quản trị sau khi xác minh URI, không chạy lệnh xóa trên database production.

Log không được ghi mật khẩu, session cookie, khóa tra cứu đơn, payOS secrets hoặc toàn bộ địa chỉ. Theo dõi lỗi 5xx, MongoDB, callback thanh toán và các đơn cần đối soát. Giữ nhật ký nghiệp vụ khi cập nhật trạng thái vận chuyển và xử lý hỗ trợ.

Đăng nhập, mã tra cứu đơn và dữ liệu khách chỉ chia sẻ với người có quyền. Giao diện không cung cấp mật khẩu staff đã tạo; quản lý cần chuyển mật khẩu ban đầu riêng và yêu cầu đổi theo quy trình vận hành. Tính năng email khôi phục mật khẩu, OTP, thông báo tự động, quản lý tồn kho theo lô/HSD và tích hợp hãng vận chuyển chưa có trong bản đầu.
