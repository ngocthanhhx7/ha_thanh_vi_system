# Hoàn tất cấu hình VPS và DNS Tino

Máy được kiểm tra ngày 05/10/2026: EC2 `i-019706f27db770a41`, public IPv4 hiện tại `54.167.40.190`, Amazon Linux 2023 ARM64, người dùng `ec2-user`. Mã nguồn nằm tại `/home/ec2-user/ha_thanh_vi_system`. Docker, Compose và Buildx đã được cài; thêm 2 GiB swap để hỗ trợ build trên máy RAM 1 GiB. Khóa SSH giữ trên máy của chủ dự án, không gửi lên GitHub hoặc VPS.

## Thêm biến môi trường

Mở PowerShell trên Windows:

```powershell
ssh -i "E:\key\hathanhvi.pem" ec2-user@54.167.40.190
```

Trên VPS:

```sh
cd /home/ec2-user/ha_thanh_vi_system
nano deploy/aws/.env.production
```

File đã được tạo sẵn, quyền `600`. Hai khóa `ORDER_TOKEN_SECRET` và `AUTH_TOKEN_SECRET` đã được tạo ngẫu nhiên trên VPS; giữ nguyên, không chép đè template lên file hiện có. Điền:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/ha_thanh_vi
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-mail@example.com
SMTP_PASS=YOUR_APP_PASSWORD
MAIL_FROM=Hà Thành Vị <your-mail@example.com>
GEMINI_API_KEY=YOUR_GEMINI_KEY
PAYOS_CLIENT_ID=YOUR_CLIENT_ID
PAYOS_API_KEY=YOUR_API_KEY
PAYOS_CHECKSUM_KEY=YOUR_CHECKSUM_KEY
PAYOS_WEBHOOK_URL=https://hathanhvi.vn/api/payments/payos/webhook
PAYMENTS_ENABLED=false
```

Đây là giá trị mẫu, phải thay bằng cấu hình thật. Mật khẩu trong MongoDB URI cần URL encode nếu chứa ký tự đặc biệt. Allowlist IP VPS tại MongoDB; dùng tài khoản chỉ có quyền cần thiết. SMTP Gmail dùng App Password, không dùng mật khẩu đăng nhập thông thường. Gemini và payOS có thể để trống nếu chưa bật. MongoDB và SMTP cần hoạt động để tài khoản/OTP/đơn hàng dùng được.

Nano: `Ctrl+O`, Enter để lưu, `Ctrl+X` để thoát. Không gửi nội dung file `.env` trong chat, commit hoặc ảnh chụp. Backend nhận file này qua Compose, không cần tạo thêm `backend/.env` trên VPS.

## DNS đúng với màn hình Tino hiện tại

Trong **hathanhvi.vn → Quản lý DNS**:

1. Tại dòng tên `hathanhvi.vn.`, loại `ALIAS`, giá trị `dns.tino.page.`, đổi loại sang `A`, giá trị sang `54.167.40.190`, giữ TTL `1 giờ`, nhấn **Chỉnh sửa**. Nếu giao diện không cho đổi loại, xóa riêng dòng ALIAS đó và thêm bản ghi A cùng tên.
2. Giữ dòng `www.hathanhvi.vn.` loại `CNAME` trỏ `hathanhvi.vn.`.
3. Không thay NS hoặc thêm bản ghi A khác trùng tên. Nếu có AAAA cũ nhưng VPS chưa có IPv6, xử lý bản ghi đó để tránh truy cập nhầm máy.
4. Dòng MX trong ảnh đang trỏ về chính `hathanhvi.vn.` và webmail cũng trỏ theo domain chính. Nếu đang dùng email trên domain này, cần đặt lại theo máy chủ email thật trước khi chuyển website; VPS này không cài mail server. Xem [cấu hình TinoMail](https://tino.vn/blog/docs/cau-hinh-dns-tinomail/).

`54.167.40.190` là IP hiện tại. Nếu chưa gắn Elastic IP, stop/start EC2 có thể làm IP thay đổi; nên gắn Elastic IP rồi dùng IP được gắn trong bản ghi A và allowlist MongoDB. Không tự tạo Elastic IP trong lần chuẩn bị này.

Hướng dẫn của nhà cung cấp: [quản lý DNS Tino](https://tino.vn/blog/docs/cach-quan-ly-dns-tren-ten-mien-tai-tino/), [IP ổn định trên EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-networking.html).

## Cổng truy cập AWS

Vào EC2 → máy Hà Thành Vị → Security → Security Group `sg-0361a1a6310c89483` → Edit inbound rules. Thêm HTTP TCP 80 và HTTPS TCP 443 từ `0.0.0.0/0`. SSH TCP 22 chỉ từ IP của bạn. Không mở port 4000 hay MongoDB. Có thể mở UDP 443 nếu muốn HTTP/3, không bắt buộc để website chạy.

## Khởi động và kiểm tra

Sau khi điền `.env`, mở cổng và DNS đã trỏ đúng:

```sh
cd /home/ec2-user/ha_thanh_vi_system
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
curl -f https://hathanhvi.vn/api/health
```

Kiểm tra health báo database thật; frontend/API không tự bật bán hàng nếu MongoDB chưa cấu hình. Nếu API không healthy:

```sh
docker compose -f compose.production.yml logs --tail=60 api
```

Kiểm tra DNS trong PowerShell:

```powershell
Resolve-DnsName hathanhvi.vn -Type A
```

Kết quả phải là IP VPS/Elastic IP mới. DNS có thể cần đợi theo cache/TTL. Caddy cấp HTTPS tự động sau khi domain và các cổng truy cập sẵn sàng.

## payOS

Điền webhook `https://hathanhvi.vn/api/payments/payos/webhook` trong payOS. Chỉ xác thực được khi domain/HTTPS/backend đã chạy.

```sh
docker compose -f compose.production.yml exec api node backend/dist/confirmPayOsWebhook.js
```

Sau khi xác nhận webhook và kiểm chứng giao dịch, đổi `PAYMENTS_ENABLED=true` trong file env rồi:

```sh
docker compose -f compose.production.yml up -d --force-recreate api
```

Tài khoản admin production cần khởi tạo riêng, không dùng tài khoản demo. Xem [hướng dẫn triển khai và vận hành](README.md).
