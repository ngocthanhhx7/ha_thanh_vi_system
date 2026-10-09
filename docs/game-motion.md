# Chuyển động và độ trễ game

## Thay đổi 09/10/2026

- Cài GSAP 3.15.0, @gsap/react 2.1.2 vào frontend; chỉ trang game tải component MemoryCard dùng GSAP. Không đổi hiệu ứng toàn website.
- Cài bộ 8 skill chính thức từ https://github.com/greensock/gsap-skills vào `.agents/skills` của dự án. Thư mục skill được Git ignore theo cấu hình hiện có; `skills-lock.json` ghi nguồn và hash để cài lại. Lệnh: `npx skills add https://github.com/greensock/gsap-skills --agent codex --skill '*' -y`.
- Phản hồi nhấn kéo dài 0,2 giây, nghiêng tối đa 8 độ rồi trở về mặt úp. Không giữ thẻ ở 80 độ trong thời gian chờ máy chủ.
- Kết quả máy chủ điều khiển mở/úp: GSAP xoay trong 0,24 giây. Cặp đúng mở, nhấn nhẹ rồi mờ đi. Dọn animation khi rời trang; tôn trọng prefers-reduced-motion.
- Người chơi có thể chọn sẵn đúng một thẻ thứ hai trong khi yêu cầu đầu đang chạy. Frontend gửi tuần tự sau xác nhận thẻ đầu; không mở thẻ thứ ba, không đoán nguyên liệu, không tự cấp/trừ lượt. Lỗi thẻ đầu hủy hàng chờ; retry giữ UUID để chống tính lượt trùng.
- Mặt thẻ được tải trước; cặp sai úp bằng đồng hồ trình duyệt theo hạn máy chủ, không thêm vòng GET chờ mạng. Thời gian ghi nhớ 1,6 giây được giữ nguyên.
- Backend bỏ hai thao tác khởi tạo dư thừa: 7 xuống 5 thao tác model cho một lần lật bình thường. Transaction, khóa theo tài khoản và receipt được giữ. Giảm số truy vấn không phải cam kết giảm tương ứng phần trăm độ trễ production.

## Kiểm tra

Kiểm thử mạng chậm giữ phản hồi đầu, xác nhận thẻ không kẹt nghiêng đứng, cho chọn sẵn thẻ thứ hai, chỉ gửi đúng hai yêu cầu tuần tự và úp lại không chờ GET. Kiểm thử lỗi xác nhận hàng chờ hủy, UUID retry không đổi. Backend kiểm thử số truy vấn và các yêu cầu đồng thời. Không đọc `.env` hoặc dùng dữ liệu khách thật để chạy test.
