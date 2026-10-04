# Giao hàng và đối soát COD

## Luồng đang có

Khách lưu nhiều địa chỉ với tên người nhận và số điện thoại; địa chỉ mặc định được chọn khi đặt hàng. Đơn hàng giữ bản sao thông tin nhận hàng, nên sửa sổ địa chỉ không làm thay đổi đơn đã đặt. Luồng kiểm tra địa chỉ, phương thức thanh toán và voucher được tham khảo từ [hướng dẫn mua hàng Shopee](https://help.shopee.vn/portal/4/article/79180).

| Trạng thái đơn     | Hiển thị cho khách | Thao tác cửa hàng                             |
| ------------------ | ------------------ | --------------------------------------------- |
| `pending`          | Chờ xác nhận       | Xác minh sản phẩm, người nhận và thanh toán   |
| `confirmed`        | Chờ lấy hàng       | Chuẩn bị hàng, đăng ký vận đơn với đối tác    |
| `shipping`         | Chờ giao hàng      | Bàn giao hàng, nhập đơn vị và mã vận đơn      |
| `delivered`        | Đã giao            | Xác nhận giao hàng, đối soát tiền riêng       |
| `return_requested` | Trả hàng           | Tiếp nhận yêu cầu, trao đổi với khách         |
| `returned`         | Đã trả hàng        | Xác nhận nhận lại hàng, xử lý hoàn tiền riêng |
| `cancelled`        | Đã hủy             | Dừng đơn theo quyền và trạng thái cho phép    |

Staff nhập đơn vị vận chuyển, mã vận đơn và sự kiện thực tế trong `/quan-tri`; khách xem hành trình trong chi tiết đơn. Đây là cập nhật thủ công, chưa gọi API tạo vận đơn, chưa có tự động tính cước theo tuyến hoặc đồng bộ tracking của hãng. Phí hiện tại là cấu hình của shop, không phải báo giá trực tiếp của hãng.

Trạng thái giao hàng và thanh toán tách biệt. Giao thành công chưa chứng minh tiền COD đã về shop. Nhân viên chỉ xác nhận COD đã thu/đối soát sau khi kiểm tra thực tế; hoàn tiền cần quyền và xác nhận riêng. Không đánh dấu payOS đã trả tiền từ trạng thái vận chuyển.

## Thiết kế bước tích hợp nhà vận chuyển

[GHN Developer](https://developer.ghn.vn/en) cung cấp tạo vận đơn, phí, thời gian dự kiến, dữ liệu địa chỉ, tracking và COD. Đây là đối tác để nghiên cứu tích hợp tiếp theo; dự án chưa đăng ký hay gửi đơn thật đến GHN.

1. Nhận tài khoản merchant, token và ShopId; thử trên staging trước khi dùng production.
2. Lưu địa chỉ có cấu trúc và mã địa giới đúng phiên bản API của hãng; giữ chuỗi địa chỉ cho người dùng đọc. Không suy ra mã huyện/phường từ tên tự do. Catalog hãng có cả địa chỉ cũ và mới, cần chọn đúng API với tài khoản.
3. Thêm trọng lượng và kích thước kiện hàng, nơi lấy hàng, dịch vụ và người trả phí; xin báo giá ở checkout. Khóa giá đã được khách xác nhận trên đơn.
4. Tạo vận đơn với mã tham chiếu đơn nội bộ, lưu mã hãng và thông tin dự kiến. Khi retry phải kiểm tra vận đơn đã tồn tại để tránh tạo hai kiện.
5. Nhận callback, xác minh nguồn bằng cơ chế hãng hỗ trợ, kiểm tra ShopId/mã đơn và xử lý idempotent. Lưu sự kiện gốc, từ chối sự kiện sai đơn, tránh để callback đến muộn lùi trạng thái.
6. Đối soát trạng thái qua API khi mất callback; đối soát COD độc lập với giao hàng. Không hoàn tiền tự động vì một callback trả hàng.

[Tài liệu callback GHN ở staging](https://developer.ghn.dev/en/docs/webhook/callback-order-status) mô tả callback POST, retry và chống trùng bằng OrderCode + Type + Time. Khi triển khai cần kiểm tra tài liệu production và cấu hình thật của merchant.

## Chính sách cần chốt trước khi mở bán

Shop cần cung cấp vùng phục vụ, thời gian chuẩn bị, mức phí, miễn phí giao hàng, điều kiện và thời hạn đổi trả thực phẩm, bằng chứng hư hỏng, cách hoàn tiền. Bản demo không tự công bố các cam kết chưa được Hà Thành Vị xác nhận. Khi khách yêu cầu trả hàng, hệ thống tạo yêu cầu để staff xử lý; không tự coi đơn đã được chấp nhận hoàn tiền.
