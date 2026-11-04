# Nội dung set quà và ảnh sản phẩm — 04/11/2026

- Đổi nhãn hiển thị “Set quà thường” thành “Set quà tiêu chuẩn”; giữ ID/slug cũ.
- Nhã Sắc Hà Thành: “Hộp mix vị 300g, 01 hộp trà sen”.
- Nhã Vị Kinh Kỳ: “Hộp mix vị 300g, 01 hộp trà sen (02 búp trà), đĩa sứ cao cấp”.
- Banner matcha dùng ảnh thật admin đã chọn: `/uploads/bd870374-0937-4d14-80d9-5abfa4400d82.webp`, có sẵn chữ “matcha trứng muối”. Bản 640/1080 được lưu dưới tên mới để tránh cache ảnh cũ; giữ nhịp chuyển 2 giây.
- Khu vực đăng nhập/đăng ký dùng ảnh truyền thống từ `/uploads/14b80adf-aab2-4b6e-90c2-449d89befff1.webp`, lưu bản tĩnh `auth-traditional-real.webp`.

## Dữ liệu production

Seed không ghi đè catalog đã lưu. `scripts/update-gift-copy.mjs` là migration chạy thủ công, không chạy lúc khởi động. Dùng validator và compare-and-swap của repository; từ chối nếu khối lượng đã đổi ngoài nội dung được duyệt. Không sửa giá, ảnh, ID, slug hay tồn kho.

Copy script vào `/app/scripts/update-gift-copy.mjs` trong API container. Chạy `node scripts/update-gift-copy.mjs` để kiểm tra, sau đó `node scripts/update-gift-copy.mjs --apply /tmp/gift-copy-before-20261104.json`. File backup phải chưa tồn tại, có quyền 0600. Sao lưu file này ra `.local` trên VPS trước khi thay container API.

Chỉ cập nhật service web sau CI thành công, lưu image web cũ để rollback. API không cần build hay restart. Kiểm tra lại API products, hai trang chi tiết, banner và cả hai tab đăng nhập/đăng ký. Bản backup chỉ chứa catalog, không gồm dữ liệu khách hàng.
