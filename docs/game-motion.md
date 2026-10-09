# Chuyển động và độ trễ game

## Thay đổi 09/10/2026

- Cài GSAP 3.15.0, @gsap/react 2.1.2 vào frontend; chỉ trang game tải component MemoryCard dùng GSAP. Không đổi hiệu ứng toàn website.
- Cài bộ 8 skill chính thức từ https://github.com/greensock/gsap-skills vào `.agents/skills` của dự án. Thư mục skill được Git ignore theo cấu hình hiện có; `skills-lock.json` ghi nguồn và hash để cài lại. Lệnh: `npx skills add https://github.com/greensock/gsap-skills --agent codex --skill '*' -y`.
- Phản hồi nhấn kéo dài 0,2 giây, nghiêng tối đa 8 độ rồi trở về mặt úp. Không giữ thẻ ở 80 độ trong thời gian chờ máy chủ.
- Kết quả máy chủ điều khiển mở/úp: GSAP xoay trong 0,24 giây. Cặp đúng mở, nhấn nhẹ rồi mờ đi. Dọn animation khi rời trang; tôn trọng prefers-reduced-motion.
- Người chơi có thể chọn sẵn đúng một thẻ thứ hai trong khi yêu cầu đầu đang chạy. Frontend gửi tuần tự sau xác nhận thẻ đầu; không mở thẻ thứ ba, không đoán nguyên liệu, không tự cấp/trừ lượt. Lỗi thẻ đầu hủy hàng chờ; retry giữ UUID để chống tính lượt trùng.
- Mặt thẻ được tải trước. Sau phản hồi máy chủ, cả hai ảnh phải giải mã xong và xoay mở hoàn tất; từ đó giao diện giữ cặp đúng hoặc sai trong 1,6 giây rồi mới mờ/úp. Không dùng thời hạn tuyệt đối trên máy chủ để rút ngắn thời gian nhìn thấy thẻ: transaction, mạng và lệch đồng hồ có thể đã tiêu hết thời hạn đó. Không thêm GET sau mỗi cặp; máy chủ vẫn quyết định lượt, kết quả và quyền nhận thưởng.
- Backend bỏ hai thao tác khởi tạo dư thừa: 7 xuống 5 thao tác model cho một lần lật bình thường. Transaction, khóa theo tài khoản và receipt được giữ. Giảm số truy vấn không phải cam kết giảm tương ứng phần trăm độ trễ production.

## Kiểm tra

Kiểm thử mạng chậm giữ phản hồi đầu, xác nhận thẻ không kẹt nghiêng đứng, cho chọn sẵn thẻ thứ hai, chỉ gửi đúng hai yêu cầu tuần tự và úp lại không chờ GET. Kiểm thử lỗi xác nhận hàng chờ hủy, UUID retry không đổi. Backend kiểm thử số truy vấn và các yêu cầu đồng thời. Không đọc `.env` hoặc dùng dữ liệu khách thật để chạy test.

Hồi quy thời gian nhìn thấy: gửi hạn úp đã quá 4 giây, kiểm tra mặt thẻ thứ hai thực sự xoay đủ 180 độ và vẫn hiển thị sau 900 ms; cặp đúng giữ độ mờ 1 trước khi biến mất. Ván được tải lại với một thẻ đã mở vẫn dùng đúng mặt nguyên liệu cho cặp khớp. Đổi phiên xóa hàng chờ, mặt thẻ ghi nhớ và chặn phản hồi cũ.

0,24 giây là thời lượng chuyển động, **không phải tổng thời gian nhấn đến khi thấy thẻ**. API xác nhận trước khi mở nội dung chưa biết. Chi phí truy vấn/mạng được ghi riêng trong `docs/performance-backend.md`; vị trí VPS/DB hiện tại vẫn ảnh hưởng thời gian chờ thực tế.
