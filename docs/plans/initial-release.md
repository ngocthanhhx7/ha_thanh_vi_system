# Hà Thành Vị — phạm vi bản đầu

## Phạm vi được cập nhật

Một repository do Ngọc Thành phát triển; React + TypeScript, Node.js + Express và MongoDB. Cấu trúc frontend/src và backend/src theo các thư mục người phát triển cung cấp. Năm trang thương hiệu hoàn chỉnh theo tài nguyên nhận diện và mẫu khách hàng: Trang chủ, Câu chuyện, Sản phẩm, Về chúng tôi, Liên hệ; responsive, header/footer, tìm kiếm, mascot và tài nguyên thương hiệu thật.

Theo yêu cầu bổ sung, bản đầu có giỏ hàng, đặt hàng COD và phần tích hợp payOS/VietQR, đăng ký/đăng nhập, sổ địa chỉ, lịch sử đơn, theo dõi vận chuyển, đánh giá, voucher và hỗ trợ/đổi trả. Giá tạm được chủ dự án cho phép. Vai trò admin (kiêm manager), staff và customer cùng nằm trong collection users, phân biệt bằng role. CMS sử dụng tài khoản admin đã đăng nhập.

## Các quyết định

- npm workspaces frontend/backend; một người phát triển, Conventional Commits và tác giả Ngọc Thành.
- Giá và quyền do backend quyết định; giỏ lưu local, tài khoản dùng cookie HttpOnly.
- COD hoạt động với MongoDB; payOS chỉ bật sau khi có merchant credentials và webhook.
- Theo dõi vận chuyển hiện nhập thực tế bởi staff; nghiên cứu GHN ghi trong docs/shipping.md, chưa gửi vận đơn thật.
- Review từ đơn đã giao; voucher thưởng không phụ thuộc số sao, tối đa một lần mỗi đơn.
- Agent/skill, khóa bí mật, dữ liệu phát triển, bản thiết kế gốc và output build không đưa lên Git.

## Kiểm chứng

Chạy npm run verify, npm run format:check, npm run test:e2e trước khi push. API test kiểm tra quyền, snapshot/giá, chuyển trạng thái, chống trùng, chữ ký và dữ liệu MongoDB. UI test kiểm tra desktop/mobile, giỏ, checkout, địa chỉ/voucher và lỗi giữ dữ liệu. Rà soát hiển thị tablet và dữ liệu thực tế khi preview.

## Nguồn và giới hạn

Thông tin liên hệ từ tài liệu thương hiệu: 0973607163, hathanhvi05@gmail.com, Thạch Thất, Hà Nội. Giá hiện là giá tạm; hình bánh AI được đánh dấu minh họa. Không công bố chứng nhận, số liệu đánh giá, doanh số hay cam kết vận chuyển chưa được cung cấp. Hình logo, nhân vật, font và hoa văn lấy từ bộ tài nguyên Drive. Luồng thanh toán, giao vận và tài khoản có tài liệu riêng; không gọi trạng thái demo là giao dịch đã xác minh ngoài hệ thống.
