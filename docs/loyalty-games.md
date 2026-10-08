# Hai trò chơi Hà Thành Vị

Luật được người dùng duyệt: [thiết kế](superpowers/specs/2026-10-08-loyalty-games-design.md).

## Tích hợp và vận hành

- Route giao diện: `/tro-choi`; biểu tượng bộ thẻ nằm bên trái các trang công khai, ẩn trong checkout và ngay trang game.
- Chỉ customer đang đăng nhập và đủ điều kiện session mới được chơi. Dùng auth/CSRF hiện có.
- API `/api/games` (GET) chỉ đọc. `/enter` (POST) cấp lượt khi vào game. `/visit`, `/products-presence`, `/memory/flip`, `/memory/reward`, `/collection/draw`, `/collection/redeem` là các POST có xác thực.
- Mutation `flip` và `draw` dùng UUID requestId để retry không trừ lượt lặp. Nhận thưởng theo ván hoặc mốc có khóa riêng.
- Ba collection MongoDB: `gamestates`, `gamestocks`, `gamereceipts`. Các thao tác nhận thưởng cần MongoDB replica set hỗ trợ transaction, như cơ chế voucher hiện tại.
- `gamestocks` record `_id=banh-cha` ghi tổng đã phát (`issued`). Không xóa/seed lại record này khi cập nhật hoặc khi đổi thưởng: tổng phát giới hạn 10 suốt chương trình. `rareEver` giữ lại sau khi tiêu hao thẻ.
- Voucher và ví dùng `CustomerVoucher`/`CustomerWallet`; mỗi mã đích danh dùng một lần. Thông báo bền vững được ghi trong cùng transaction; giao diện hiển thị kết quả trả về.
- Mọi ngày nhiệm vụ tính GMT+7; voucher hết hạn chính xác 30×24 giờ từ lúc nhận. Lượt lật giữ lại, lượt rút hết hạn khi đổi ngày. Chỉ ngày thực sự vào game mới được cấp daily.
- API nhiệm vụ kiểm tra pathname Referer, CSRF, token và khoảng heartbeat máy chủ; frontend chỉ gửi khi trang sản phẩm hiện. Fetch game dùng `referrerPolicy: same-origin` riêng vì ứng dụng mặc định không gửi Referer. Referer và tín hiệu hiển thị không thể chứng minh chú ý của con người; client có chủ ý vẫn có thể mô phỏng. Không tuyên bố chống mọi bot.
- Không có quản trị game hoặc chức năng tự bổ sung kho; không thêm giới hạn thưởng game1 theo tháng trái luật đã duyệt.

## Tài nguyên

- PNG gốc người dùng được giữ nguyên; mặt sau mới `frontend/public/brand/game/card-back-v1.png`.
- Giao diện tải WebP 480×720 tại `/brand/game/cards/`: oil, sugar, matcha, banh-cha, flour, lime-leaf, cacao, sticky-rice, salted-egg, lard, card-back. Tổng 761.970 byte, khoảng 744 KiB.
- Thẻ chưa sở hữu dùng lớp CSS grayscale có hình cắt theo nguyên liệu để giữ nền/khung màu. Ảnh gốc phẳng nên đường cắt là xấp xỉ, không phải tài nguyên phân lớp. Nhãn và số lượng bên dưới luôn đọc được.
- Game tải thành chunk riêng; main bundle lớn hơn500KB là cảnh báo hiện có.

## Kiểm chứng

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
