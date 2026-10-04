# Luồng khách hàng và 3 vai trò

## Quyền

| Vai trò trong users.role | Chức năng                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| admin                    | Kiêm manager; nội dung/sản phẩm/giá, nhân viên, voucher, mọi đơn và hỗ trợ; ghi nhận hoàn tiền thủ công        |
| staff                    | Đơn hàng, nhập giao vận, tiếp nhận và trả lời hỗ trợ/khiếu nại; không sửa nội dung, user hoặc campaign voucher |
| customer                 | Hồ sơ, địa chỉ, đơn của mình, đánh giá, ví voucher và yêu cầu hỗ trợ                                           |

Role không được nhận từ biểu mẫu đăng ký. Các vai trò dùng cùng cơ chế tài khoản và session. Guest vẫn được mua/tra cứu bằng khóa riêng nhưng cần tài khoản để lưu địa chỉ, xem lịch sử tập trung, nhận và dùng voucher.

## Đặt hàng

1. Xem sản phẩm, thêm giỏ; chọn số lượng.
2. Khách đã đăng nhập chọn địa chỉ mặc định hoặc địa chỉ khác từ sổ tối đa10 địa chỉ. Tên người nhận/số điện thoại riêng theo mỗi địa chỉ được lưu vào checkout. Khách guest tự nhập.
3. Chọn COD hoặc payOS/VietQR nếu đã cấu hình. Nhập voucher hoặc chọn từ ví khi đăng nhập, xem báo giá. Báo giá chưa giữ quota; backend kiểm tra lại khi đặt hàng.
4. Xác nhận thông tin và đồng ý trước đặt. Backend snapshot sản phẩm/giá/địa chỉ/phí giao hàng/voucher; tính total=subtotal+shippingFee-discount. Giỏ chỉ xóa sau khi tạo đơn thành công; lỗi mạng thử lại cùng idempotency key.
5. COD vào pending. payOS mở liên kết thanh toán chính thức; trang quay về chỉ tra cứu backend, không tự xác nhận đã thanh toán. Đơn được giữ khi tạo link lỗi để thử lại.
6. Account tra đơn bằng session của chính mình, không nhận khóa guest. Guest nhận khóa tra cứu bí mật giữ ngoài URL. Thông tin liên hệ hoặc sửa địa chỉ sau đó không thay đơn cũ.

## Lịch sử đơn và giao vận

| Tab khách     | Trạng thái                  |
| ------------- | --------------------------- |
| Tất cả        | Mọi đơn của tài khoản       |
| Chờ xác nhận  | pending                     |
| Chờ lấy hàng  | confirmed                   |
| Chờ giao hàng | shipping                    |
| Đã giao       | delivered                   |
| Trả hàng      | return_requested / returned |
| Đã hủy        | cancelled                   |

Trạng thái thanh toán riêng unpaid/paid/failed/refund_pending/refunded. Cửa hàng xác nhận và đóng gói, nhập đơn vị vận chuyển/mã vận đơn, bàn giao và cập nhật đã giao. Timeline chỉ ghi sự kiện có người vận hành nhập; phí demo được cấu hình, chưa gọi API tạo vận đơn/báo phí thật. Quy trình đề xuất dùng địa chỉ hành chính chuẩn của nhà vận chuyển, đóng gói khối lượng/kích thước và xác thực callback khi mở tích hợp live; xem [giao vận](shipping.md).

Khách tự hủy pending unpaid COD. Với online/đơn đã xử lý, gửi ticket hỗ trợ để cửa hàng đối soát. Cửa hàng không xuất hàng payOS trước paid. Khi báo giao thành công COD, staff/admin xác nhận tiền đã thu.

## Đánh giá và voucher

- Chỉ chủ tài khoản đơn delivered đánh giá sản phẩm đã mua, 1–5 sao và bình luận plain text; mỗi user/order/product duy nhất. Retry không nhân bản review.
- Một voucher cảm ơn cho mỗi đơn được đánh giá lần đầu: giảm20.000đ, subtotal tối thiểu149.000đ, hạn30 ngày, một lượt. Voucher cá nhân không thể được tài khoản khác claim/sử dụng.
- Campaign automatic tự xuất hiện trong ví; code có thể claim vào ví hoặc nhập ở checkout. Một voucher/đơn, giảm fixed hoặc percent có trần, hạn hiệu lực và điều kiện minOrder.
- Backend giữ lượt bằng cập nhật Mongo atomic gồm quota tổng và từng user; không tin số giảm từ frontend. Lượt giữ được tính đã dùng trong ví để tránh sử dụng lặp. Đơn hủy/chuyển failed giải phóng reservation; delivered hoặc webhook paid chốt used. Voucher used không được hoàn lại tự động khi trả hàng.
- Có thể xem coupon chưa đến ngày bắt đầu trong ví, nhưng quote/checkout sẽ từ chối đến khi có hiệu lực. Chiến dịch phải đủ quota tại thời điểm đặt, dù đã claim trước đó.

## Hỗ trợ và trả hàng

Khách tạo support ticket cho đơn của mình hoặc yêu cầu return sau delivered. Return đổi đơn sang return_requested và tạo một ticket duy nhất theo user/order; retry phục hồi ticket nếu bước lưu trước bị lỗi. Staff/admin cập nhật open → in_progress → resolved và thêm lịch sử trả lời. Cửa hàng xác nhận nhận hàng trả, đổi returned, admin đối soát và thực hiện hoàn tiền thực tế bên ngoài rồi ghi nhận trạng thái theo quy trình. Web chưa tự gọi API hoàn tiền ngân hàng.

Đây là quy trình được chọn cho cửa hàng Hà Thành Vị, lấy trải nghiệm tab đơn/ví voucher quen thuộc làm tham khảo; không khẳng định sao chép mọi chính sách hoặc thời hạn Shopee. Chính sách đổi trả, thời gian phản hồi, hạn dùng thực phẩm và điều kiện giao hàng cần cửa hàng ban hành trước khi vận hành thật.
