# Hà Thành Vị

Website thương hiệu và thương mại điện tử của Công ty TNHH Hà Thành Vị. Phát triển bởi **Ngọc Thành**, một người phụ trách dự án.

## Chạy dự án

Yêu cầu Node.js 22.12 trở lên, npm và MongoDB. Frontend React + TypeScript + Vite; backend Node.js + Express + Mongoose.

```sh
npm ci
npm run dev
```

Website: http://127.0.0.1:5173. API: http://127.0.0.1:4000. Chưa cấu hình MongoDB, website vẫn giới thiệu sản phẩm nhưng không nhận đơn, đăng ký hoặc lưu dữ liệu.

Để thử đầy đủ với MongoDB phát triển cục bộ, không cần cài MongoDB riêng:

```sh
npm run dev:demo
```

Lần đầu tải MongoDB binary. Dữ liệu phát triển và thông tin đăng nhập admin nằm trong `.local/`, được bỏ qua bởi Git. Tài khoản xem thử: `.local/preview-credentials.txt`; OTP thử tại `.local/preview-mailbox/*.txt` (không gửi email thật). Dùng `/tai-khoan` để đăng nhập, `/quan-tri` để điều hành, `/admin` để quản lý sản phẩm, ảnh, thống kê và nội dung. Có thể tạo nhân viên ở mục Nhân sự.

## Chức năng

- Khách: Trang chủ, Câu chuyện, Sản phẩm, Tin tức, Về chúng tôi, Liên hệ; tìm kiếm, chi tiết sản phẩm, mascot, giỏ hàng và đặt hàng COD/payOS. Trang Tin tức có 20 bài tuyển chọn, bộ lọc chủ đề và liên kết nguồn báo gốc.
- Khách hàng đăng nhập: sổ địa chỉ và số điện thoại, đơn mua theo trạng thái, thông tin giao hàng, ví voucher, đánh giá đơn đã nhận và hỗ trợ/đổi trả.
- Staff: xử lý đơn, mã vận đơn/hành trình và phản hồi chăm sóc khách hàng.
- Admin/manager: chức năng staff, quản lý nhân viên, phát hành voucher, thêm/sửa/xóa/xem sản phẩm, tải ảnh và bảng thành phần, thống kê và chỉnh nội dung/giá.
- Xác thực: nhập lại mật khẩu đăng ký, OTP email sau đăng ký và trên thiết bị mới, tin cậy thiết bị 30 ngày, quên/đặt lại mật khẩu và thu hồi phiên cũ. Mật khẩu chỉ lưu bằng trình quản lý mật khẩu của trình duyệt.
- Vị Ơi: tư vấn từ catalog và tri thức thương hiệu công khai, Markdown/emoji, từ chối câu hỏi ngoài phạm vi và chuyển liên hệ shop khi không thể trả lời.

Giá trong bản đầu là **giá tạm được chủ dự án cho phép**, chưa phải bảng giá chính thức. Hình bánh được tạo để minh họa ý tưởng; logo, nhân vật, font và hoa văn lấy từ tài nguyên thương hiệu. Xem [nguồn và quy tắc sử dụng](docs/brand/README.md).

## Cấu hình thật

Bản chuẩn bị AWS cho `hathanhvi.vn`: [EC2, Docker, HTTPS, DNS Tino và webhook payOS](deploy/aws/README.md). Frontend và backend dùng cùng tên miền; cấu hình nằm trong `compose.production.yml`, `Dockerfile` và `deploy/aws/`. GitHub Actions kiểm tra mã, test và build container trước khi triển khai.

Sao chép `backend/.env.example` thành `backend/.env`, điền MongoDB và các biến cần thiết. Admin, staff và customer cùng lưu trong collection `users`, phân biệt bằng trường `role`; hệ thống không có token quản trị riêng trong `.env`. Tạo admin lần đầu bằng bước khởi tạo tài khoản, xem [vận hành](docs/operations.md). Khi triển khai dùng HTTPS và một origin cố định.

payOS/VietQR cần merchant credentials và webhook công khai; mặc định tắt. Không tự đánh dấu thanh toán từ đường dẫn chuyển về. Giao vận hiện hỗ trợ thông tin thực tế nhập bởi staff; xem [nghiên cứu vận chuyển](docs/shipping.md) trước khi nối API nhà vận chuyển.

Email sử dụng SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, MAIL_FROM. Vị Ơi dùng GEMINI_API_KEY; GEMINI_MODEL mặc định gemini-3.8-flash. Không có khóa/email thật thì trả trạng thái chưa khả dụng, không giả vờ gửi thành công. AUTH_TOKEN_SECRET tùy chọn, tối thiểu32 ký tự; nếu không có, các khóa xác thực được dẫn xuất theo mục đích từ ORDER_TOKEN_SECRET. Google login là hướng mở rộng, chưa tích hợp trong bản này. Xem [xác thực](docs/authentication.md), [chatbot](docs/chatbot.md) và [quản lý sản phẩm](docs/product-management.md).

## Cấu trúc

```text
frontend/src/  app, assets, components, constants, contexts, hooks,
               layouts, pages, routes, services, styles, utils
backend/src/   config, constants, controllers, jobs, middlewares,
               models, routes, services, utils, validators
backend/uploads/ ảnh admin tải lên, không commit ảnh phát sinh
content/       dữ liệu thương hiệu và catalog khởi tạo
docs/          kiến trúc, API, vận hành, thương hiệu và luồng nghiệp vụ
scripts/       công cụ phát triển/kiểm tra dự án
tests/e2e/     kiểm tra luồng khách hàng trên trình duyệt
assets/originals/ tài nguyên thiết kế gốc tải từ Drive, không đưa lên Git
.local/        dữ liệu phát triển, tài khoản thử, báo cáo CLI, không đưa lên Git
```

## Kiểm tra và commit

```sh
npm run verify
npm run format:check
npm run test:e2e
```

Kết quả bản đầu: [báo cáo kiểm tra](docs/verification.md).

Commit theo Conventional Commits: `feat: mô tả`, `fix: mô tả`, `docs: mô tả`, `refactor: mô tả`, `test: mô tả`, `chore: mô tả`. Hook commit và CI kiểm tra định dạng. Tác giả Git cục bộ: Ngọc Thành.

Tài liệu: [Kiến trúc](docs/architecture.md), [Mô hình nghiệp vụ/database](docs/business-data-model.md), [API](docs/api.md), [CMS](docs/cms.md), [Tài khoản và ưu đãi](docs/customer-workflows.md), [Thanh toán](docs/payments.md), [PayOS webhook](docs/payos-webhook.md), [Giao vận](docs/shipping.md), [Phát triển/Git](docs/development.md), [Vận hành](docs/operations.md).
