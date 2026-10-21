# Ảnh sản phẩm trên banner Home

Banner sử dụng bốn thiết kế vuông 1080×1080 do chủ dự án cung cấp trong `frontend/public/brand/product`: truyền thống, matcha, socola và mix. Ảnh được hiển thị đầy đủ bằng `object-fit: contain` trong khung tỉ lệ 1:1; không cắt hình vòm hoặc phóng ảnh làm mất chữ/góc trang trí.

Các bản WebP 640/1080 được xuất từ JPG gốc bằng Sharp với quality 84, tự xoay theo metadata và không phóng lớn. Giữ JPG gốc để có thể tạo lại. Ảnh đầu có preload dành riêng đường dẫn Home, cùng srcset/sizes với component; các ảnh sau dùng lazy loading và ưu tiên thấp.

`HomeProductCarousel` chuyển ảnh bằng opacity GSAP trong 650 ms, mỗi ảnh khoảng 2 giây. Chỉ đổi sau khi ảnh tiếp theo decode xong. Theo yêu cầu giao diện, không hiển thị hàng chấm, tên vị hoặc nút điều khiển; dừng tự động khi hover, banner ngoài màn hình hoặc tab ẩn. Chế độ giảm chuyển động giữ một ảnh tĩnh. Ảnh lỗi bị bỏ qua, không dùng ảnh lỗi thay khung đang xem; nếu ảnh đầu lỗi thì thử một ảnh khác.

Phần chữ, CTA và các section Home vẫn dùng nội dung hiện có. Bỏ dấu tròn nằm đè ảnh vì ảnh mới đã có nhận diện; đặt ghi chú người thợ dưới các CTA trong cột nội dung, thay phần chữ ký trang trí, để không che ảnh hoặc tạo một khối rời bên dưới ảnh. Không đổi ảnh sản phẩm trong catalog, thông tin giá, giỏ hàng, API hoặc CMS.

Kiểm tra trình duyệt bao gồm: khung vuông desktop/mobile, chu kỳ 2 giây, không còn hàng điều khiển, vị trí ghi chú, hover tạm dừng, reduced motion, ảnh lỗi, preload không chạy trên route khác, font tải chậm và không tràn ngang. Các ảnh chụp được lưu cùng kết quả Playwright.
