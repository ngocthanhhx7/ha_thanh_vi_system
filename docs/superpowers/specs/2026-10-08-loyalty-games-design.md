# Thiết kế game Hà Thành Vị — đã duyệt 08/10/2026

Người dùng đã duyệt phương án và yêu cầu tiếp tục triển khai. Không đọc .env; không dùng dữ liệu thật để kiểm thử. Agy Gemini 3.8 Flash High và Claude CLI model custom chatgpt effort max đã tư vấn; đề xuất của công cụ không thay thế quyết định người dùng.

## Hai trò chơi và luật cố định

### Lật thẻ làm bánh

- 20 lá gồm 10 cặp của 10 loại thẻ; máy chủ xáo riêng từng tài khoản và từng ván. Giữ vị trí suốt ván, qua tải lại trang.
- Một lượt là chọn một cặp, đúng hoặc sai đều tốn 1 lượt. Cặp đúng biến mất; cặp sai úp lại. Lưu lượt chọn đầu và trừ lượt trước khi tiết lộ để tải lại trang không cho xem miễn phí.
- Vào game lần đầu +3 lượt, mỗi ngày vào game +1 lượt (ngày đầu được cộng cả hai). Vào Sản phẩm +1 và Về chúng tôi +1, mỗi nhiệm vụ chỉ một lần trong suốt tài khoản.
- Phân nhóm nhiệm vụ hằng ngày/một lần. Lượt dư giữ qua ngày và ván, ngày tính GMT+7.
- Ghép hết 10 cặp mở nhiệm vụ nhận thưởng 30.000đ. Bấm nhận: máy chủ cấp voucher vào ví, hiện thông báo, bắt đầu ván mới. Không cấp lại các nhiệm vụ một lần. Không tự thêm giới hạn thưởng theo tháng.

### Sưu tập thẻ

- Mỗi ngày có 1 lượt rút khi vào game; xem trang Sản phẩm đủ 30 giây đang hiển thị nhận thêm 1 lượt/ngày. Lượt rút chưa dùng hết hạn lúc 00:00 GMT+7. Thẻ giữ đến khi đổi.
- 10 loại: dầu ăn/oil, đường/sugar, matcha/matcha, bánh chả/banh-cha, bột mì/flour, lá chanh/lime-leaf, cacao/cacao, bột nếp/sticky-rice, trứng muối/salted-egg, mỡ lợn/lard.
- Bánh chả xác suất 5% khi còn điều kiện; 9 nguyên liệu chia đều 95% còn lại. Tổng phát Bánh chả tối đa 10 toàn hệ thống suốt chương trình, không bổ sung kể cả khi tiêu hao. Mỗi tài khoản được phát tối đa 1 Bánh chả suốt chương trình.
- Hết kho hoặc tài khoản từng được phát Bánh chả: công khai điều kiện và phân phối đều 9 nguyên liệu. Không tuyên bố xác suất 5% khi tài khoản không đủ điều kiện.
- Đổi 9 nguyên liệu (không Bánh chả): trừ 1 bản mỗi loại, thưởng 30.000đ; tối đa một lần/tài khoản.
- Đổi đủ 10 loại: trừ 1 bản mỗi loại, thưởng 50% tối đa 100.000đ; tối đa một lần/tài khoản. Hai mốc độc lập, có thể đổi theo bất kỳ thứ tự khi đủ tồn kho.
- Sau đổi thẻ, cập nhật số lượng. Muốn đổi cả hai mốc cần tích lũy đủ số bản tương ứng, không dùng lại thẻ đã tiêu hao.

### Voucher

- Mã đích danh, mỗi mã dùng một lần; mọi mặt hàng, đơn từ 0đ, hiệu lực 30 ngày kể từ nhận. Giảm không vượt tiền hàng và dùng quy tắc checkout hiện tại.
- Tạo voucher, thêm ví, trừ thẻ/ghi nhận hoàn thành thưởng trong cùng MongoDB transaction; khóa duy nhất ngăn retry phát hai lần. Thông báo có event key chống trùng, phản hồi trực tiếp trên màn hình.

## Giao diện

- Launcher thẻ nổi bên trái, khác Vị Ơi; nhấn đến /tro-choi. Tránh thanh điều hướng mobile và nội dung quan trọng.
- Hai tab Lật thẻ làm bánh/Sưu tập thẻ. Game1 bàn + nhiệm vụ. Game2 bộ thẻ + Nhiệm vụ/Đổi thưởng; số lượng dưới từng thẻ; xác nhận tiêu hao trước khi đổi.
- Thẻ chưa sở hữu có nguyên liệu đơn sắc nhưng giữ nền màu. Thẻ đã có đầy đủ màu. Hỗ trợ responsive, keyboard, reduced-motion, trạng thái chờ/mất mạng.
- Khách chưa đăng nhập xem luật/hình và CTA đăng nhập; server yêu cầu customer session cho mọi mutation.
- Card back đã tạo: frontend/public/brand/game/card-back-v1.png. Dẫn xuất WebP dùng để tải nhẹ; không thay bản gốc.

## Phạm vi kỹ thuật

- Module backend riêng (model/service/controller/routes/tests), tích hợp auth/CSRF hiện có. Không gửi vị trí mặt úp xuống trình duyệt.
- RNG máy chủ, bộ đếm toàn cục cập nhật có điều kiện trong transaction; kết quả có thể retry mà không vượt kho.
- Token nhiệm vụ + thời gian máy chủ và trạng thái hiển thị; nhiều tab không cộng thời gian/lượt đôi. Đây là kiểm soát tối thiểu, không phải bảo đảm loại bỏ mọi bot.
- Frontend route lazy, module API riêng, nhiệm vụ theo đường dẫn tập trung; ưu tiên không sửa các file trang đang có thay đổi người dùng.
- Giữ nguyên sửa đổi chưa commit của người dùng. Chưa tự deploy trong giai đoạn triển khai/kiểm thử.

## Tiêu chí nghiệm thu

- Kiểm thử ngày GMT+7, quà lần đầu, lượt dư/reset, chọn sai/reload, điều kiện nhận thưởng.
- Đồng thời rút thẻ cuối không vượt10, cùng user không vượt1, nhận thưởng đồng thời không trùng, đổi thiếu thẻ không trừ hay tạo voucher.
- Voucher đúng giá trị/hiệu lực/ví chủ tài khoản; ảnh/tồn kho/UI phản ánh kết quả máy chủ.
- Typecheck, lint, tests backend và UI desktop/mobile, build; hồi quy tài khoản/giỏ hàng/checkout.
