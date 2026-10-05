# Ảnh tải lên

Server lưu ảnh sản phẩm và nhãn thành phần đã kiểm tra, tối ưu thành WebP tại đây. Chỉ các tệp UUID.webp được phục vụ qua /uploads; tài liệu và tệp ẩn không được phục vụ. Ảnh phát sinh không đưa lên Git.

Khi triển khai cần volume lưu trữ bền vững, quyền ghi cho backend, sao lưu cùng dữ liệu sản phẩm; reverse proxy chuyển /uploads sang backend. Không dùng thư mục này để lưu giấy tờ khách hàng hoặc tài liệu riêng. Không tự xóa ảnh cũ khi đổi ảnh sản phẩm vì có thể còn được nội dung khác sử dụng. Khi mở rộng nhiều máy chủ, chuyển sang object storage và quản lý tham chiếu tài sản.
