# AWS + hathanhvi.vn

Cấu hình chuẩn bị ngày 05/10/2026: một EC2 chạy Docker Compose, Caddy phục vụ frontend và reverse proxy API, MongoDB production bên ngoài (ví dụ MongoDB Atlas). Cùng origin `https://hathanhvi.vn` giữ cookie đăng nhập, API, ảnh tải lên và callback thanh toán nhất quán. Chưa tạo EC2, đổi DNS hoặc triển khai thật.

## 1. Chuẩn bị AWS

- Tạo EC2 Linux x86_64 hoặc ARM64, gắn Elastic IP, cài Docker Engine và Compose plugin theo tài liệu chính thức. Build cả hai ứng dụng trên EC2 cần đủ RAM/đĩa; điều chỉnh cấu hình theo tải thực tế.
- Security Group cho phép TCP 80/443 từ Internet; UDP 443 tùy chọn cho HTTP/3. SSH TCP 22 chỉ từ IP quản trị, hoặc dùng Systems Manager Session Manager. Không mở 4000 hay 27017 ra Internet.
- MongoDB production cần tài khoản riêng và allowlist IP của EC2. Không dùng MongoDB demo, tài khoản demo hay dữ liệu `.local`.
- IAM role chỉ cấp quyền cần dùng; không lưu AWS access keys trong repository. Lập backup MongoDB, volume ảnh và dữ liệu TLS; thử phục hồi.

Tài liệu: [Elastic IP](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-networking.html), [Security Group](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html), [cài Docker trên Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 2. DNS tại Tino

Giữ DNS tại Tino. Sau khi biết Elastic IP, cấu hình:

| Loại  | Tên | Giá trị            |
| ----- | --- | ------------------ |
| A     | @   | Elastic IP của EC2 |
| CNAME | www | hathanhvi.vn       |

Kiểm tra các bản ghi A/AAAA cũ có xung đột trước khi chuyển. Không đổi các bản ghi MX/TXT của email. Nếu có CAA, đảm bảo cho phép CA cấp chứng chỉ mà Caddy sử dụng. TTL có thể đặt 300 khi chuyển, rồi tăng sau khi ổn định. `www` được chuyển về tên miền chính.

## 3. Cấu hình production

Clone repository vào EC2 và chạy từ root repository:

```sh
cp deploy/aws/.env.production.example deploy/aws/.env.production
chmod 600 deploy/aws/.env.production
```

Điền giá trị thật trên máy chủ: `MONGODB_URI`, `ORDER_TOKEN_SECRET` (tối thiểu 32 ký tự ngẫu nhiên), `AUTH_TOKEN_SECRET` (khóa khác, tối thiểu 32 ký tự), SMTP và `MAIL_FROM` để nhận OTP. Gemini tùy chọn. Không gửi file này lên GitHub. Compose cố định `NODE_ENV=production`, origin, port và `TRUST_PROXY_HOPS=1` cho duy nhất Caddy; API chỉ mở trong mạng Docker.

```sh
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
curl -f https://hathanhvi.vn/api/health
```

API health phải báo storage MongoDB, không phải `demo-read-only`. Caddy chỉ khởi động sau khi API healthy; DNS và cổng 80/443 phải sẵn sàng để cấp HTTPS. Caddy lưu chứng chỉ vào volume; không xóa volume khi cập nhật.

Tạo admin bằng `docker compose -f compose.production.yml exec api node backend/dist/initAdmin.js`, với `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` cung cấp riêng cho tiến trình qua môi trường. Không đặt mật khẩu vào dòng lệnh, lịch sử shell hoặc env API chạy thường xuyên. Xem [khởi tạo tài khoản](../../docs/operations.md).

## 4. payOS

Webhook cần điền trên payOS:

```text
https://hathanhvi.vn/api/payments/payos/webhook
```

Giữ `PAYMENTS_ENABLED=false` cho đến khi HTTPS, database, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` và webhook được cấu hình/kiểm tra. Webhook được xác minh chữ ký phía backend; không đánh dấu thanh toán từ URL trả về.

Sau khi host thật chạy, có thể xác nhận webhook bằng công cụ đã có trong container:

```sh
docker compose -f compose.production.yml exec api node backend/dist/confirmPayOsWebhook.js
```

Sau khi kiểm tra giao dịch thật được phép, đổi `PAYMENTS_ENABLED=true` và tạo lại API container. Xem [hướng dẫn payOS](../../docs/payos-webhook.md).

## 5. Kiểm tra trước khi mở bán

- HTTPS cả domain chính và www; mở trực tiếp `/tin-tuc`, `/san-pham`, `/tai-khoan` không 404.
- API health, OTP/email, đăng ký/đăng nhập/đăng xuất, COD, phân quyền quản trị và ảnh upload sau khi restart.
- Kiểm thử giao dịch payOS và đối soát; backup và khôi phục database/ảnh.
- Hoàn thiện canonical/OG/sitemap/robots, kiểm tra khả năng crawl nội dung SPA theo [checklist SEO/GEO](../../docs/news-editorial.md). Bản chuẩn bị này chưa tuyên bố SEO production hoàn tất.

## 6. Cập nhật và quay lại phiên bản trước

```sh
git pull --ff-only origin main
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
```

Ghi lại commit đang chạy và backup trước cập nhật. Quay lại commit đã kiểm chứng trong checkout triển khai rồi build lại; dữ liệu MongoDB và volume ảnh vẫn cần tương thích với phiên bản đó. Không dùng `down -v` vì sẽ xóa ảnh và chứng chỉ. Một máy chủ là cấu hình khởi đầu, chưa có high availability; khi mở rộng nhiều máy cần chuyển ảnh sang object storage và cấu hình load balancer/proxy tương ứng.

Ngày 05/10/2026 đã build cả hai container trực tiếp trên EC2 Amazon Linux ARM64, xác nhận Caddyfile hợp lệ, API khởi động được, Sharp hoạt động và thư mục upload có quyền ghi. Smoke test API dùng chế độ chỉ đọc để không cần thông tin MongoDB thật; chưa kiểm chứng database, email, thanh toán hoặc HTTPS trên domain production. GitHub Actions kiểm tra thêm container trên Linux x86_64. Không có tự động deploy hay quyền AWS trong workflow. Hướng dẫn riêng cho VPS đã chuẩn bị: [thêm env và chuyển DNS Tino](HATHANHVI-SETUP.md).
