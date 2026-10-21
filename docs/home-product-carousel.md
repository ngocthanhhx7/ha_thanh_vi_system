# Ảnh sản phẩm trên banner Home

Banner sử dụng bốn thiết kế vuông 1080×1080 do chủ dự án cung cấp trong `frontend/public/brand/product`: truyền thống, matcha, socola và mix. Ảnh được hiển thị đầy đủ bằng `object-fit: contain` trong khung tỉ lệ 1:1; không cắt hình vòm hoặc phóng ảnh làm mất chữ/góc trang trí.

Các bản WebP 640/1080 được xuất từ JPG gốc bằng Sharp với quality 84, tự xoay theo metadata và không phóng lớn. Giữ JPG gốc để có thể tạo lại. Ảnh đầu có preload dành riêng đường dẫn Home, cùng srcset/sizes với component; các ảnh sau dùng lazy loading và ưu tiên thấp.

`HomeProductCarousel` chuyển ảnh bằng opacity GSAP trong 650 ms, mỗi ảnh khoảng 5 giây. Chỉ đổi sau khi ảnh tiếp theo decode xong. Có nút chọn bốn ảnh và tạm dừng/tiếp tục; dừng tự động khi hover, focus, banner ngoài màn hình hoặc tab ẩn. Chế độ giảm chuyển động tắt tự chạy và đổi ảnh không animation; nút chọn vẫn dùng được. Ảnh lỗi bị bỏ qua, không dùng ảnh lỗi thay khung đang xem; nếu ảnh đầu lỗi thì thử một ảnh khác.

Phần chữ, CTA và các section Home vẫn dùng nội dung hiện có. Bỏ dấu tròn nằm đè ảnh vì ảnh mới đã có nhận diện; chuyển ghi chú người thợ xuống dưới ảnh để không che thiết kế. Không đổi ảnh sản phẩm trong catalog, thông tin giá, giỏ hàng, API hoặc CMS.

Kiểm tra trình duyệt bao gồm: khung vuông desktop/mobile, tự chạy/chọn tay/tạm dừng, bàn phím, reduced motion, ảnh lỗi, preload không chạy trên route khác, font tải chậm và không tràn ngang. Các ảnh chụp được lưu cùng kết quả Playwright.
