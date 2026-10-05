# Vòng đời voucher và ưu đãi

## Quy tắc nghiệp vụ

- `CustomerVoucher` là cấu hình chiến dịch và các điều kiện áp dụng; `CustomerWallet` là quyền nhận riêng của một khách. Một khách chỉ có một bản ghi ví cho mỗi voucher nhờ khóa duy nhất `(userId, voucherId)`.
- Mã công khai (`code`) có thể nhập thẳng ở thanh toán; khách cũng có thể lưu mã vào ví trước. Việc claim lặp lại là idempotent.
- Ưu đãi tự động (`automatic`) dành cho khách hàng đang hoạt động. Ví đồng bộ quyền nhận khi khách mở ví; khách mới cũng nhận được ở lần mở ví đầu tiên. Hệ thống gửi thông báo khi chiến dịch được tạo.
- Cấp đích danh (`targeted`) chỉ cấp cho các tài khoản khách admin đã chọn. Tạo chiến dịch và bản ghi ví chạy trong cùng transaction; người khác không thể claim, báo giá hoặc dùng mã đó. Khách được thông báo sau khi cấp thành công.
- Mỗi quyền nhận ghi nguồn cấp (`automatic`, `claim`, `admin`, `reward`, `checkout`) và người admin cấp nếu có. Admin xem số lượt đã đồng bộ/cấp và có thể tạm ngưng hoặc kích hoạt lại chiến dịch.

## Trạng thái và thời gian

- Thời gian nhập/hiển thị dùng múi giờ `Asia/Ho_Chi_Minh` (GMT+7); dữ liệu lưu thành thời điểm UTC.
- `startsAt` có hiệu lực tại đúng thời điểm bắt đầu; `expiresAt` không còn hiệu lực tại đúng thời điểm kết thúc (`startsAt <= now < expiresAt`). Không thể phát hành voucher đã hết hạn.
- Khách có thể lưu mã công khai trước ngày bắt đầu. Ví hiển thị `scheduled`; báo giá và thanh toán chỉ chấp nhận voucher đang trong thời hạn.
- Trạng thái trong ví: `scheduled`, `available`, `reserved`, `used`, `exhausted`, `expired`, `inactive`. Tạm ngưng không bị nhầm với hết hạn.

## Luồng sử dụng

1. Admin tạo mã, mức giảm, giá trị đơn tối thiểu, giới hạn tổng/mỗi khách, thời gian hiệu lực và phương thức phát hành.
2. Khách nhận mã công khai qua claim hoặc nhập tại thanh toán; voucher tự động đồng bộ vào ví; voucher đích danh ghi quyền nhận cho đúng khách trong transaction.
3. Báo giá kiểm tra trạng thái, thời gian, quyền nhận, giá trị giỏ và hạn mức nhưng chưa giữ lượt.
4. Khi tạo đơn, backend giữ lượt nguyên tử và tính lại số tiền từ giá sản phẩm ở server. Hủy đơn giải phóng lượt; thanh toán thành công chốt lượt dùng.

## API chính

- Admin: `GET /api/admin/vouchers`, `POST /api/admin/vouchers`, `PATCH /api/admin/vouchers/:id`.
- Khách: `GET /api/account/vouchers`, `POST /api/account/vouchers/claim`, `POST /api/account/vouchers/quote`; checkout dùng `POST /api/orders`.
- Mã sai định dạng trả `400`; mã không tồn tại hoặc không thuộc khách trả `404`; voucher chưa bắt đầu, hết hạn, tạm ngưng hoặc hết lượt trả `409` với thông báo riêng.

## Cơ sở nghiên cứu

- Shopify mô tả giới hạn tổng lượt và lượt mỗi khách, điều kiện áp dụng, cùng việc xác định mốc hiệu lực theo múi giờ cửa hàng: [Amount off discounts](https://help.shopify.com/en/manual/discounts/discount-types/percentage-fixed-amount).
- Shopify Admin API biểu diễn riêng ngày bắt đầu/kết thúc, giới hạn sử dụng, điều kiện đơn hàng và nhóm khách được phép dùng: [DiscountCodeBasicInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/DiscountCodeBasicInput).

Các quy tắc này được áp dụng cho nghiệp vụ hiện tại; không có lần kiểm thử nào ghi vào MongoDB Atlas.
