# COD và payOS/VietQR

COD hoạt động khi MongoDB khả dụng. payOS mặc định tắt; để bật cần PAYMENTS_ENABLED=true, PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY và PUBLIC_WEB_URL. Không commit credentials. Khi chưa bật, checkout online bị từ chối trước khi ghi đơn.

Theo [tài liệu môi trường thử chính thức](https://payos.vn/docs/moi-truong-test/), payOS không có sandbox/staging riêng; giao dịch thử sử dụng môi trường thật. Bản demo của dự án dùng COD và các bài kiểm tra mock có chữ ký, không gọi thu tiền thật. Khi mở live, chủ cửa hàng đăng ký/xác thực tài khoản, liên kết ngân hàng và kênh thanh toán rồi tự kiểm tra giao dịch nhỏ. Nội dung này đã kiểm chứng ngày04/10/2026.

## Tạo và xác nhận thanh toán

Backend gọi [API chính thức](https://payos.vn/docs/api/) tạo link, với amount do server tính và HMAC-SHA256 trên các trường alphabetically sorted theo hợp đồng payOS. Mô tả tối đa9 ký tự để tương thích ngân hàng chưa liên kết. Backend kiểm tra orderCode, amount, VND, chữ ký phản hồi và HTTPS host chính xác pay.payos.vn trước khi trả checkoutURL.

Webhook `/api/payments/payos/webhook` kiểm tra chữ ký, code/success, mã đơn, số tiền đã lưu và paymentLinkId nếu có. Browser return/cancel URL không đủ chứng minh thanh toán. Khóa guest không đặt trong URL. Callback đúng nhiều lần là idempotent và phục hồi bước chốt voucher nếu lần trước lỗi. Link tạo lỗi vẫn giữ đơn để retry; không tạo thêm đơn cho cùng lần checkout.

Chỉ webhook xác nhận payOS paid. Staff/admin không thể ép đơn online thành paid. Đơn payOS unpaid hoặc có exception chưa xử lý bị chặn confirmed/shipping/delivered. Nếu callback hợp lệ đến sau khi đơn đã hủy, giữ cancelled, ghi refund_pending và exception để quản trị xử lý; không hồi sinh đơn hoặc tự hoàn tiền.

## Đối soát và hoàn tiền

Job hàng giờ đánh dấu đơn online unpaid quá24 giờ để kiểm tra, không tự kết luận failed hoặc đã thu tiền. Một callback hợp lệ sau đó xóa đúng cờ quá hạn và xác nhận paid; exception khác được giữ để điều tra. Danh sách quản trị hiển thị paymentReviewAt và payOsException.

COD chỉ ghi paid khi delivered. Trả hàng đi return_requested → returned; admin ghi nhận paid → refund_pending → refunded sau khi đã kiểm tra và thực hiện hoàn tiền thực tế bên ngoài hệ thống. Staff không có quyền ghi refund. payOS cũng cho admin ghi trạng thái hoàn tiền thủ công, không dùng endpoint này để gán paid. refunded yêu cầu returned (hoặc cancelled với thanh toán muộn cần hoàn). Mọi thao tác chỉ ghi nhận trạng thái, chưa tích hợp API payout/refund. Không hiển thị "đã hoàn" trước khi chủ cửa hàng xác nhận khoản tiền thực sự được hoàn.

Voucher được tính trước chữ ký, nên amount gửi payOS bằng total đã trừ voucher. Quota giữ khi tạo đơn, chốt khi paid/delivered, giải phóng khi hủy/failed. Các tổng tiền/phí là số nguyên VND; client không được gửi price/discount.

## Mở live

Dùng HTTPS, reverse proxy cùng origin `/api`, cấu hình webhook công khai, lưu secrets ở host, sao lưu MongoDB và giữ ORDER_TOKEN_SECRET ổn định. Cookie Secure yêu cầu HTTPS. Thử thanh toán/duplicate callback/sai số tiền/đơn hủy/đối soát và hoàn tiền vận hành trước khi nhận đơn online từ khách thật. Xem [API](api.md) và [CMS](cms.md).
