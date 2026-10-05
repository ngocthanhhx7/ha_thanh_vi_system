# Nguồn ảnh sản phẩm minh họa

Thực hiện04/10/2026 theo yêu cầu người dùng tạo ảnh bằng **agy**. CLI đã gọi `/teamwork-preview` với model điều phối `gemini-3.8-flash-high`, effort `high`. Native subagent `image-generator` thực thi công cụ `generate_image`; mô hình sinh ảnh bên dưới không được báo cáo, nên không gán tên model cụ thể.

Ảnh là **mockup bao bì minh họa tạm thời**, không phải ảnh chụp bao bì đã sản xuất hoặc tài liệu thành phần sản phẩm. Chưa có dữ liệu chính thức để công bố ruột set, bảng dinh dưỡng, dị ứng hay hạn dùng.

| Sản phẩm                       | Nguồn JPG đã kiểm tra                                           | Kết quả                                  |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------------------- |
| Bánh chả truyền thống350g      | `.local/product-images/pouch-traditional-lime-leaf-350g-v2.jpg` | Đúng tên BÁNH CHẢ/TRUYỀN THỐNG/350g      |
| Bánh chả socola trứng muối350g | `.local/product-images/pouch-chocolate-salted-egg-350g-v2.jpg`  | Đúng tên BÁNH CHẢ/SOCOLA TRỨNG MUỐI/350g |
| Bánh chả matcha trứng muối350g | `.local/product-images/pouch-matcha-salted-egg-350g-v2.jpg`     | Đúng tên BÁNH CHẢ/MATCHA TRỨNG MUỐI/350g |
| Nhã Sắc Hà Thành               | `.local/product-images/gift-box-standard-nha-sac-ha-thanh.jpg`  | Đúng tên và tagline được cung cấp        |
| Nhã Vị Kinh Kỳ                 | `.local/product-images/gift-box-premium-nha-vi-kinh-ky.jpg`     | Đúng tên và tagline được cung cấp        |

Vòng đầu tạo5ảnh thực tế. Hai hộp quà đạt yêu cầu;3túi bị loại do nhãn sai sản phẩm/khối lượng. AGY đã tạo lại3túi ở vòng sửa, kiểm tra bằng cách mở từng ảnh trước khi tích hợp. Mẫu túi/hộp thể hiện phương án thiết kế; chữ nhỏ hoặc chi tiết trang trí chưa phải nhãn hàng được thương hiệu phê duyệt.

Conversation native image-generator vòng đầu: `6194772a-b50b-4230-af8e-3a50bd28a7ce`; vòng sửa: `2e6377b2-f5d0-48d3-9f12-d6cb63cbb0e9`. Nguồn JPG và brief được giữ cục bộ trong `.local/`; bản tối ưu để website dùng ở `frontend/public/brand/`.

Không đọc real.env, không gọi backend GeminiAPI bằng khóa thật và không tự xuất bản/upload nội dung ngoài tác vụ. Công cụ ảnh native được người dùng yêu cầu; báo cáo này không khẳng định công cụ ảnh chạy offline.
