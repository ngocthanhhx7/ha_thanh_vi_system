# Hai trò chơi Hà Thành Vị

Luật sưu tập: [thiết kế ban đầu](superpowers/specs/2026-10-08-loyalty-games-design.md). Luật lật thẻ mới thay phần nhiệm vụ/thưởng cố định: [lật thẻ tích điểm 10/10](superpowers/specs/2026-10-10-memory-points-design.md).

## Lật thẻ tích điểm (10/10/2026)

- Không còn nhiệm vụ cấp lượt và mã thưởng cố định 30.000đ. Mỗi ngày GMT+7 có 3 ván, mỗi ván 60 giây từ lúc Bắt đầu; chọn cặp không giới hạn. Hết giờ không nhận điểm. Tải lại/ẩn trang không dừng hoặc gia hạn đồng hồ.
- Ván thắng đầu tiên suốt chương trình của tài khoản thiết lập kỷ lục, không có điểm. Các ván thắng tiếp theo cộng 200, thêm 50 khi phá kỷ lục; tổng cấp trong ngày không quá 600, kể cả thưởng thêm. Ván cuối có thể nhận phần còn lại của giới hạn (ví dụ 100).
- 1 điểm = 1đ, mỗi đợt điểm hết hạn sau 90 ngày. Đủ 3.000 điểm còn hạn có thể đổi toàn bộ số dư thành voucher cá nhân dùng một lần, mọi mặt hàng, đơn từ 0đ, hiệu lực 30 ngày.
- Mức giảm thực tế không vượt 10% giá trị hàng trong đơn: voucher 3.200đ trên đơn 20.000đ giảm 2.000đ. Phần 1.200đ còn dư mất sau khi sử dụng, không trả về điểm. Ví và checkout giải thích trước khi đặt đơn.
- Máy chủ xác nhận ván thắng và cấp điểm trong giao dịch của cặp cuối. Đổi thưởng trừ điểm/tạo voucher/ví/thông báo/receipt trong cùng transaction. Start và flip gắn round, mọi mutation mới dùng UUID chống retry trùng.
- Nâng cấp tài khoản cũ bằng `memoryProgress.version=1` khi ghi trạng thái; không chuyển lượt cũ thành điểm, không tính các ván cũ vào kỷ lục mới. Giữ voucher đã phát, tồn kho thẻ sưu tập, cờ đổi thưởng và tổng kho Bánh chả. Không chạy reset dữ liệu.

## Tích hợp và vận hành

- Route giao diện: `/tro-choi`; biểu tượng bộ thẻ nằm bên trái các trang công khai, ẩn trong checkout và ngay trang game.
- Chỉ customer đang đăng nhập và đủ điều kiện session mới được chơi. Dùng auth/CSRF hiện có.
- API `/api/games` (GET) chỉ đọc. `/enter` (POST) cấp lượt rút sưu tập khi vào game. `/memory/start`, `/memory/flip`, `/memory/redeem`, `/products-presence`, `/collection/draw`, `/collection/redeem` là các POST có xác thực. `/visit` cũ không cấp lượt; `/memory/reward` cũ từ chối cấp mã thưởng cố định.
- Mutation `flip` và `draw` dùng UUID requestId để retry không trừ lượt lặp. Nhận thưởng theo ván hoặc mốc có khóa riêng.
- Ba collection MongoDB: `gamestates`, `gamestocks`, `gamereceipts`. Các thao tác nhận thưởng cần MongoDB replica set hỗ trợ transaction, như cơ chế voucher hiện tại.
- `gamestocks` record `_id=banh-cha` ghi tổng đã phát (`issued`). Không xóa/seed lại record này khi cập nhật hoặc khi đổi thưởng: tổng phát giới hạn 10 suốt chương trình. `rareEver` giữ lại sau khi tiêu hao thẻ.
- Voucher và ví dùng `CustomerVoucher`/`CustomerWallet`; mỗi mã đích danh dùng một lần. Thông báo bền vững được ghi trong cùng transaction; giao diện hiển thị kết quả trả về.
- Mọi ngày tính GMT+7; voucher hết hạn chính xác 30×24 giờ từ lúc nhận. Ván lật chưa bắt đầu không cộng dồn; lượt rút sưu tập hết hạn khi đổi ngày. Chỉ ngày thực sự vào game mới được cấp lượt rút daily.
- API nhiệm vụ kiểm tra pathname Referer, CSRF, token và khoảng heartbeat máy chủ; frontend chỉ gửi khi trang sản phẩm hiện. Fetch game dùng `referrerPolicy: same-origin` riêng vì ứng dụng mặc định không gửi Referer. Referer và tín hiệu hiển thị không thể chứng minh chú ý của con người; client có chủ ý vẫn có thể mô phỏng. Không tuyên bố chống mọi bot.
- Không có quản trị game hoặc chức năng tự bổ sung kho; lật thẻ chỉ áp dụng giới hạn điểm theo ngày đã duyệt.

## Tài nguyên

- PNG gốc người dùng được giữ nguyên; mặt sau mới `frontend/public/brand/game/card-back-v1.png`.
- Giao diện tải WebP 480×720 tại `/brand/game/cards/`: oil, sugar, matcha, banh-cha, flour, lime-leaf, cacao, sticky-rice, salted-egg, lard, card-back. Tổng 761.970 byte, khoảng 744 KiB.
- Thẻ chưa sở hữu dùng lớp CSS grayscale có hình cắt theo nguyên liệu để giữ nền/khung màu. Ảnh gốc phẳng nên đường cắt là xấp xỉ, không phải tài nguyên phân lớp. Nhãn và số lượng bên dưới luôn đọc được.
- Game tải thành chunk riêng; main bundle lớn hơn500KB là cảnh báo hiện có.

## Kiểm chứng

- Cập nhật 10/10/2026: `npm run verify` đạt, 134/134 kiểm thử backend; Playwright toàn website đạt 130/130 trên desktop/mobile. Có kiểm thử thời gian xử lý transaction bị trễ qua hạn điểm, quota ngày không lùi khi đồng hồ lùi, điểm/bonus/trần 600, đổi đồng thời và rollback; giao diện kiểm tra đồng hồ, mất điểm hết hạn khi đang mở trang, giữ đủ thời gian nhìn cặp cuối và thông báo voucher 10% ở checkout khi ví không tải được.

- `backend/tests/game.test.ts`: ngày GMT+7, dự trữ lượt, giữ bàn/lật lại, 30giây, trừ bộ thẻ, kho hiếm đồng thời, thưởng/retry/rollback, auth/CSRF/ngữ cảnh trang và GET chỉ đọc.
- `tests/e2e/games.spec.ts`: launcher/guest,20thẻ, trừ một lượt cho một cặp, nhận thưởng theo dữ liệu máy chủ, đổi/trừ tồn kho, retry lỗi và heartbeat dừng khi nhận bonus; chạy cả desktop/mobile.
- Kiểm thử MongoDB dùng replica set tạm trên máy, không sử dụng dữ liệu thật. Khi chạy build/test có thư mục env rỗng hoặc DOTENV_CONFIG_PATH riêng, không đọc .env dự án.

## Kết quả nghiệm thu 08/10/2026

- `npm run verify`: typecheck, lint, 112/112 backend tests và build hai workspace đạt.
- Playwright: 98/98 desktop/mobile đạt, bao gồm 10 trường hợp game (5 mỗi viewport).
- Rà soát ngoài bằng Claude custom chatgpt/max; đã xử lý ngữ cảnh nhiệm vụ bằng kiểm tra Referer riêng và fetch same-origin. Agy gemini-3.8-flash-high đã rà soát luật trước triển khai.
- Render đã kiểm tra không tràn ngang, không pageerror ở hai viewport. Ảnh xem trước và log nằm trong `.local/game-design`.
- Sửa bộ test audit dùng ngày tương đối thay vì mốc cố định 04–06/10; fixture test auth không phụ thuộc đơn hàng của API chạy nền.
- Cảnh báo main bundle >500KB còn hiện; game tải riêng. Chưa commit/push/deploy trong nhiệm vụ này; thay đổi người dùng có trước vẫn giữ nguyên.
