# Quản lý sản phẩm, ảnh và thống kê

Chỉ user có role admin được sử dụng các API quản trị sản phẩm, tải ảnh và xem thống kê. Staff tiếp tục vận hành đơn và chăm sóc khách hàng theo quyền hiện có.

- GET /api/admin/products: danh sách {products}; GET /api/admin/products/:id: thông tin sản phẩm.
- POST /api/admin/products: tạo sản phẩm với ID và slug duy nhất; PATCH /api/admin/products/:id: cập nhật, không đổi ID.
- DELETE /api/admin/products/:id: gỡ khỏi danh mục. Tên, giá và số lượng trong đơn đã mua được giữ nguyên; sản phẩm trong giỏ cũ phải được kiểm tra lại khi đặt hàng.
- Các trường tagline, packaging, packageContents, ingredients, ingredientImage, allergens, storage bổ sung thông tin trang chi tiết. PATCH gửi null để bỏ trường tùy chọn; POST bỏ qua các trường chưa có.
- POST /api/admin/uploads: gửi nội dung tệp ảnh trực tiếp với Content-Type image/jpeg, image/png hoặc image/webp và X-Requested-With: XMLHttpRequest. Trả {url,width,height}. Tối đa5 MB,20 triệu điểm ảnh; backend thực sự giải mã rồi xuất WebP tối đa1600px, bỏ metadata và dùng tên UUID. Không nhận SVG, HTML hoặc chỉ dựa vào đuôi tên tệp.
- GET /api/admin/statistics?from=YYYY-MM-DD&to=YYYY-MM-DD: số đơn, trạng thái, số đã giao/chờ xác nhận, tiền đã thu và sản phẩm bán nhiều. Ngày theo giờ Việt Nam; bao gồm trọn ngày kết thúc.

Tiền đã thu là tổng giá trị đơn paymentStatus=paid, loại đơn cancelled/returned; gồm vận chuyển và sau giảm giá. Không phải lợi nhuận hay doanh thu kế toán. Giá trị sản phẩm bán nhiều tính số lượng × giá tại lúc mua, trước phân bổ voucher/vận chuyển. Số khách hàng đã xác thực và số sản phẩm là số hiện tại, không giới hạn theo bộ lọc ngày.

Thay đổi sản phẩm dùng so sánh phiên bản nội dung MongoDB trước khi ghi; xung đột trả409 để tải lại. CMS nội dung thương hiệu vẫn thay thế toàn bộ nội dung: tải bản mới nhất trước khi lưu. Ảnh được lưu tại backend/uploads, không commit ảnh tải lên. Cấu hình reverse proxy /api và /uploads cùng domain website; backup thư mục này và MongoDB, dùng volume bền vững khi chạy container. Không xóa ảnh cũ tự động, tránh ảnh đang được nhiều sản phẩm sử dụng bị mất.

Ảnh mockup AI được gắn nhãn minh họa. Không dùng ảnh AI để dựng thành phần hoặc thông tin dinh dưỡng chưa được thương hiệu xác nhận.
