# Tải trang và nhịp chơi — 09/10/2026

## Các nguyên nhân đã xác định

- Error boundary dùng `key` của mỗi navigation, khiến khung public bị dựng lại. Đổi sang `resetKey` để chỉ phục hồi lỗi; đặt Suspense cho nội dung bên trong khung, giữ header/footer khi tải route mới.
- Chat đang đóng vẫn tải Markdown và Socket.IO. Chuyển các thư viện này thành chunk tải theo nhu cầu. Main gzip giảm từ 180,02 kB xuống khoảng 118,16 kB; tổng tính năng chat vẫn được giữ.
- Những thành phần kiểm tra tài khoản cùng lúc gọi `/auth/me` riêng. Gộp promise đang chạy; không cache dữ liệu hoàn tất. Thay đổi phiên hủy hiệu lực phản hồi cũ.
- Không có Cache-Control cho tài nguyên. Caddy cache một năm cho build assets có hash, một tuần cho ảnh/font brand có tên cố định, HTML phải xác minh lại. Các đường dẫn API/uploads vẫn đi qua proxy riêng.
- Launcher hiển thị thẻ 48×72 nhưng tải ảnh 480×720. Thêm ảnh 96×144: 65.214 → 5.208 byte. Pattern 267.134 → 70.834 byte với đường dẫn mới; giữ bản gốc. Hero có các kích thước responsive, tải ưu tiên cao, preload chỉ khi vào trang chủ.
- Font tải chậm làm tiêu đề đổi dòng rồi đẩy hero-photo xuống. Preload font sử dụng; font dự phòng dùng bản rút gọn chính font thương hiệu được nhúng trong CSS, giữ nguyên metric và không phụ thuộc font có sẵn trên hệ điều hành. Trang chủ giải mã các font nhúng trước lần render đầu tiên, không chờ tải font qua HTTP.
- Game tính thời gian xem từ mốc máy chủ trước transaction/mạng; cặp đúng bị fade ngay sau xoay. Đổi đồng hồ trình bày sang 1,6 giây sau khi cả hai ảnh giải mã và xoay mở hoàn tất. Giữ máy chủ quyết định kết quả/lượt/phần thưởng.

## Phạm vi và đo lường

Ảnh Lighthouse người dùng cung cấp: performance 81, FCP 2,1 giây, LCP 3,9 giây, TBT 20 ms, CLS 0,118. Đây là mẫu đo khác với máy kiểm tra hiện tại.

Mốc trước sửa đo từ workstation bằng Lighthouse 13.5.0 mobile, cold navigation vào HTTPS production: performance 63, FCP 2.065 ms, LCP 6.640 ms, TBT 128 ms, CLS 0,1471, Speed Index 5.685 ms. Báo cáo đầy đủ lưu trong `.local/game-design/lighthouse-before.report.{html,json}` (không commit). Một mẫu đơn lẻ không phải bảo đảm điểm số của mọi người dùng; vị trí, mạng, cache, CPU và server có thể thay đổi kết quả.

Độ trễ API/DB đọc riêng và giới hạn của phép đo được ghi tại [performance-backend.md](performance-backend.md). Không đo luồng game bằng cách phát thưởng/thay đổi tài khoản thật.

Phép thử Chrome mobile tại máy, giữ font trễ 2 giây, cho CLS giảm từ 0,12312 xuống 0,00028444 với font dự phòng nhúng. Cách dùng font hệ điều hành ban đầu đạt tại Windows nhưng không đạt Linux CI, nên đã được thay thế. Chi phí là thêm khoảng 45,5 kB gzip CSS dùng chung; chi tiết và script tái tạo ở [public-assets-performance.md](public-assets-performance.md). Đây là phép thử kiểm soát, không phải điểm Lighthouse production. Tải trang đầu không có fade; hiệu ứng opacity 220 ms chỉ chạy khi điều hướng và tắt theo lựa chọn giảm chuyển động của người dùng.

Kiểm chứng trước triển khai: 120/120 test backend, bộ 114/114 test giao diện desktop/mobile và 18/18 kiểm tra game sau rà soát cuối, typecheck, lint và build đạt. Các kiểm tra game đo trạng thái xoay thực tế và độ hiển thị của cả hai thẻ, bao gồm phản hồi chậm, deadline máy chủ đã qua, ảnh tải lỗi có tên nguyên liệu thay thế, ván tiếp tục sau tải lại, chuyển tab, đổi phiên và retry khi lỗi mạng.

Nguồn chính thức: [tối ưu LCP](https://web.dev/articles/optimize-lcp), [Caddy response headers](https://caddyserver.com/docs/caddyfile/directives/header).
