# Lật thẻ tích điểm

Luật người dùng chốt ngày 10/10/2026, thay luật nhiệm vụ và thưởng cố định của game lật thẻ. Game sưu tập giữ nguyên.

- Mỗi tài khoản được bắt đầu 3 ván mỗi ngày GMT+7. Một ván kéo dài 60 giây, bắt đầu khi bấm Bắt đầu; số lần chọn cặp trong ván không giới hạn. Tải lại hoặc đổi ngày không gia hạn ván đang chạy. Không tạm dừng đồng hồ khi ẩn trang.
- Bàn 20 thẻ, 10 cặp; máy chủ giữ vị trí và quyết định kết quả. Cặp sai úp lại, cặp đúng biến mất sau khi người chơi được xem cả hai thẻ. Hết giờ trước khi ghép đủ thì thua, không có điểm; bắt đầu ván khác vẫn tính một lượt trong ngày.
- Ván thắng đầu tiên suốt tài khoản không có điểm và thiết lập kỷ lục. Từ ván thắng thứ hai: 200 điểm, thêm 50 nếu nhanh hơn kỷ lục cá nhân. Tổng điểm cấp trong ngày tối đa 600, bao gồm thưởng kỷ lục; ván cuối có thể nhận ít hơn 200 khi chạm trần. Kỷ lục vẫn cập nhật khi hết ngân sách điểm ngày.
- 1 điểm = 1đ. Mỗi đợt điểm hết hạn sau 90×24 giờ từ lúc nhận; kiểm tra hạn trước mỗi thao tác và khi hiển thị. Điểm không rút tiền mặt, chuyển tài khoản hoặc dùng trực tiếp.
- Từ 3.000 điểm còn hạn: đổi toàn bộ số dư thành một voucher riêng cho tài khoản, trừ điểm ngay khi đổi. Voucher dùng một lần, mọi mặt hàng, đơn từ 0đ, hiệu lực 30×24 giờ. Giảm thực tế bằng min(giá trị voucher, floor(10% giá trị hàng trong đơn)). Phần giá trị không dùng hết mất sau khi dùng voucher; không hoàn lại thành điểm. Chính sách xử lý đơn hủy và hoàn hàng hiện hành tiếp tục áp dụng.
- Điểm, voucher, ví, thông báo và biên nhận được ghi trong cùng transaction. UUID chống trừ lượt/đổi điểm lặp khi retry. Máy chủ tự cấp điểm ngay khi xác nhận cặp cuối, không cần nhiệm vụ nhận thưởng.
- Tài khoản cũ bắt đầu chương trình tính điểm với 0 điểm/0 chiến thắng mới và đủ 3 ván cho ngày chuyển đổi; không chuyển lượt lật cũ thành điểm. Ván theo luật cũ được thay bằng bàn mới khi bắt đầu. Giữ nguyên voucher đã phát, thẻ sưu tập, số lần đổi bộ thẻ và kho Bánh chả.

## Giao diện và dữ liệu

Thay bảng nhiệm vụ bằng số điểm còn hạn, số điểm nhận hôm nay, ngày hết hạn gần nhất, nút đổi thưởng và giải thích giới hạn 10%/mất phần dư. Bàn có Bắt đầu ván, đồng hồ, số ván còn lại, kỷ lục và kết quả. Nút đổi có xác nhận giá trị và điều kiện trước khi trừ toàn bộ điểm. Giữ GSAP và thời gian quan sát cặp thẻ.

GameState giữ tiến độ, các đợt điểm và bộ đếm chương trình có version để nâng cấp dữ liệu cũ khi đọc/ghi, không reset collection. Các API mới: POST /memory/start (round, requestId), POST /memory/redeem (requestId); /memory/flip bổ sung round. Endpoint thưởng 30.000đ cũ bị vô hiệu hóa, kể cả client cũ. Voucher thêm orderPercentCap tùy chọn; voucher cũ không có trường này giữ cách tính hiện tại.
