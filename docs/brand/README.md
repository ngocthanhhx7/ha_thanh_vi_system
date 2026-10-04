# Nhận diện và tài nguyên

Nguồn được chủ dự án cung cấp:

- Drive: https://drive.google.com/drive/folders/1uPRVOt7uSRY9OSQVgUf2zypnIdYicYFE
- Thông tin công ty/catalog/liên hệ: https://docs.google.com/document/d/1P_XV9_wKb2BTIAObrNHIxtgZv-nsLcUq4r_thieKWA0/edit
- Hình tham chiếu giao diện khách hàng do chủ dự án gửi trong cuộc trò chuyện.

Đã tải 83 file hữu ích, không lấy `.DS_Store`. Danh sách và kích thước nguồn ở `asset-manifest.json`. `assets/originals` giữ nguyên font TTF, logo PNG, ảnh social, elements và Illustrator AI; thư mục này không được đưa lên Git. URL trong manifest là URL Drive nguồn, không chứa link tải có chữ ký tạm thời.

Tài nguyên web ở `frontend/public/brand`: logo và logo sáng, bộ font WOFF2, bốn nhân vật thợ bánh, hoa văn, ornament, cloud, social banner và ảnh concept bánh. Ảnh lớn được đổi WebP và giảm kích thước phù hợp; logo/font được phục vụ từ cùng origin.

`pastry.webp` là ảnh tạo bằng AI dùng để trình bày concept, không phải ảnh chụp bánh thực tế của Hà Thành Vị. Các ảnh set quà là phối cảnh CSS từ artwork nhận diện, không xác nhận bao bì thương mại cuối cùng. Giao diện ghi chú ảnh minh họa. Khi nhận ảnh sản phẩm thật, thay tài nguyên và đường dẫn ảnh trong CMS.

Bảng màu: kem `#fbf5e9`, đỏ trầm `#791f2a`, nâu `#461f21`, vàng `#c38a36`. Tiêu đề serif để theo hình tham chiếu; font Archivo Expanded dùng cho các dòng nhận diện và nhãn. Minh họa được tái sử dụng cho câu chuyện và mascot; hiệu ứng giảm khi người dùng bật giảm chuyển động.

Không coi nội dung/suy đoán của CLI nghiên cứu là dữ kiện thương hiệu. Không bổ sung chứng nhận, thành phần, hạn sử dụng, lịch sử doanh nghiệp hay cam kết sản phẩm nếu chưa được công ty xác nhận. Font và artwork tuân thủ quyền sử dụng của bộ nhận diện; không tự cấp lại license công cộng.

## Font trên website

Toàn bộ 18 biến thể Archivo Expanded trong tài nguyên gốc được chuyển sang WOFF2, ánh xạ đúng 9 mức độ đậm (100–900) và kiểu thường/nghiêng tại `frontend/src/styles/fonts.css`. Archivo dùng cho nội dung và thành phần giao diện: Regular cho nội dung, Medium cho điều hướng/nhãn, SemiBold cho nút, Bold cho thông tin nhấn mạnh, Light cho chữ phụ. Trình duyệt chỉ tải biến thể thực sự dùng; không tải đồng thời 18 file.

Tiêu đề theo phong cách serif của hình tham chiếu dùng Noto Serif thường/nghiêng có đầy đủ tiếng Việt, thay Georgia hệ thống thiếu một số glyph dẫn đến ghép dấu và lệch khoảng cách. Noto Serif là font bổ sung, không nằm trong bộ Drive. Nguồn chính thức: [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Serif), bản nguồn [google/fonts](https://github.com/google/fonts/tree/main/ofl/notoserif). Website phục vụ font từ cùng origin, không gọi Google Fonts khi khách mở trang. Bản WOFF2 Noto được rút gọn còn Latin/tiếng Việt/ký hiệu thông dụng.

Giấy phép font được lưu cùng tài nguyên tại `frontend/public/brand/fonts/OFL-Archivo.txt` và `OFL-NotoSerif.txt`. Hai TTF Regular/Bold dùng ở bản đầu đã được thay bằng bộ WOFF2; font TTF gốc vẫn đủ trong `assets/originals/typeface`.
