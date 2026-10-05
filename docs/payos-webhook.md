# Đăng ký webhook PayOS

## Endpoint của Hà Thành Vị

Endpoint backend: `POST /api/payments/payos/webhook`.

URL production dự kiến: `https://hathanhvi.vn/api/payments/payos/webhook`.

Tên miền đã mua chưa đủ để PayOS gọi được endpoint. Trước khi xác minh, domain phải trỏ DNS tới host đang chạy app, có HTTPS hợp lệ, và reverse proxy chuyển tiếp POST/JSON tới backend. Không dùng localhost, IP private, URL frontend giả hoặc endpoint chỉ truy cập qua VPN.

## Cấu hình trên host

Đặt các biến trong secret manager của host; không commit giá trị vào Git và không gửi qua chat:

```dotenv
PUBLIC_WEB_URL=https://hathanhvi.vn
PAYOS_WEBHOOK_URL=https://hathanhvi.vn/api/payments/payos/webhook
PAYOS_CLIENT_ID=<Client ID từ PayOS>
PAYOS_API_KEY=<API Key từ PayOS>
PAYOS_CHECKSUM_KEY=<Checksum Key từ PayOS>
PAYMENTS_ENABLED=false
```

Giữ `PAYMENTS_ENABLED=false` trong lúc cấu hình DNS, HTTPS, callback và quy trình vận hành. Không cần bật online checkout để đăng ký callback, nhưng endpoint phải có `PAYOS_CHECKSUM_KEY` để xác minh chữ ký.

## Đăng ký và xác minh callback

Chỉ chạy sau khi app production công khai qua HTTPS và endpoint POST có thể truy cập:

```sh
npm run payos:confirm-webhook -w backend
```

Lệnh gửi `Client ID` và `API Key` trong header tới API đăng ký webhook PayOS, cùng URL đã cấu hình trong request body. PayOS có thể gọi endpoint để xác minh URL; đăng ký webhook không tạo payment link hay giao dịch.

PayOS hiện không cung cấp sandbox/staging tách biệt: giao dịch kiểm thử chạy trên môi trường thật. Vì vậy không tạo payment link hoặc giao dịch thật trong lúc phát triển; test hiện tại dùng mock và chữ ký giả lập.

Backend miễn CSRF **chỉ** cho POST đúng đường dẫn webhook. Chữ ký HMAC-SHA256 vẫn phải hợp lệ. Payload xác minh mẫu (`orderCode=123`, `amount=3000`, `description=VQRIO123`) được xác nhận rồi bỏ qua, không tìm/ghi đơn và không đánh dấu thanh toán. GET hoặc POST tới đường dẫn khác không được miễn CSRF.

Nếu URL chưa public hoặc TLS/proxy chưa sẵn sàng, PayOS không thể xác minh. Không chạy lệnh local với URL localhost và không bật checkout online để “thử”. Lệnh chỉ báo thành công khi API PayOS trả code thành công.

## Sau khi xác minh

1. Giữ thanh toán tắt cho tới khi kiểm tra callback hợp lệ, chữ ký sai, số tiền sai, callback lặp, mã đơn không khớp và MongoDB không sẵn sàng.
2. Kiểm tra dashboard PayOS lưu đúng URL `https://hathanhvi.vn/api/payments/payos/webhook` và host nhận POST tới backend.
3. Return/cancel URL chỉ hiển thị trạng thái chờ; webhook hợp lệ mới chuyển PayOS thành `paid`.
4. Kiểm tra quyền staff/admin, đối soát COD/PayOS, đầu mối theo dõi payment exception và quy trình hoàn tiền thủ công.
5. Chỉ bật `PAYMENTS_ENABLED=true` sau khi hoàn tất checklist go-live và chủ shop sẵn sàng nhận/đối soát/hoàn tiền giao dịch.

Không sửa trạng thái thanh toán trực tiếp trong MongoDB để làm callback “chạy lại”. Dùng payment exception và quy trình đối soát. Không ghi payload nhạy cảm, token, API key hay checksum key vào log.

## Việc còn chờ triển khai

Code route webhook và lệnh đăng ký đã có; xác minh với PayOS thật còn phụ thuộc DNS `hathanhvi.vn`, host production chạy backend, HTTPS công khai và merchant credentials. Hiện chưa có bằng chứng endpoint production đã được PayOS xác nhận; chưa tạo payment link/giao dịch thật và không nên bật checkout online.

Tham khảo [PayOS API](https://payos.vn/docs/api/), [môi trường test PayOS](https://payos.vn/docs/moi-truong-test/), [thanh toán trong repo](payments.md) và [mô hình nghiệp vụ/database](business-data-model.md).
