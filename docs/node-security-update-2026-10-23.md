# Cập nhật bảo mật Node.js ngày 23/10/2026

Kiểm tra VPS trước cập nhật: API chạy Node.js `v22.23.3` trong Docker. Máy chủ không cài Node.js ngoài container. Web phục vụ bằng Caddy.

Theo [thông báo bảo mật tháng 10/2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) và [ghi chú phát hành 22.23.4](https://nodejs.org/en/blog/release/v22.23.4), bản vá 22.23.4 LTS phát hành ngày 21/10/2026 sửa các lỗi DNS/TLS, Brotli, HTTP, crypto và permission cùng các dependency đi kèm. Giữ nhánh 22.x, không nâng major trong đợt vá này.

Hai stage Node của Dockerfile và GitHub Actions dùng chính xác `22.23.4`; CI kiểm tra phiên bản thực của image API sau khi build. Image chính thức `node:22.23.4-bookworm-slim` đã được tải trên VPS và xác nhận `node --version` là `v22.23.4`.

Triển khai: lưu image API/web cũ, build lại cả hai từ base mới; chỉ kích hoạt sau khi CI đạt. Xác nhận version Node trong container API đang phục vụ, health check với MongoDB, HTTP/HTTPS, xác thực, catalog và Socket.IO. Không đổi cấu hình bí mật, database, volume hay nghiệp vụ.

Giới hạn: đây là bản vá runtime Node.js và thư viện được tích hợp trong bản phát hành; không phải cam kết mọi dependency npm hoặc toàn bộ hệ điều hành đều hết lỗ hổng. Các image rollback cũ chỉ dùng khôi phục khẩn cấp và chứa runtime cũ.
