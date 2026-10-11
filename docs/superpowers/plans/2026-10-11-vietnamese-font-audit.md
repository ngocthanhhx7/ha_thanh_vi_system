# Rà soát font tiếng Việt và kế hoạch sửa an toàn

Ngày kiểm tra: 11/10/2026. Mã nguồn nền: `7db2a13`.

## Trạng thái thực hiện

- Đã thay đúng 27 khai báo family trong 6 file CSS sang `var(--font-display)`; giữ nguyên các thuộc tính còn lại, không thay TSX, backend, dữ liệu hoặc luồng xử lý.
- Đã xác nhận lại bằng CDP: tiêu đề thành phần thực tế và probe báo cáo/chi tiết đơn đều chỉ dùng Noto Serif, không còn Georgia/Times New Roman. Đã xem ảnh chụp tiêu đề thành phần sau sửa.
- Đã bổ sung kiểm tra font trên desktop/mobile: truy cập trực tiếp/điều hướng, account/cart/game, dấu NFC/NFD và form vẫn dùng được khi font bị chặn. Test Trang chủ dùng fixture nội dung cố định để tránh request API chưa cấu hình làm thay đổi DOM giữa lúc kiểm tra.
- Email giữ nguyên: chưa có bằng chứng tái hiện trên mail client thật, không thay template hoặc luồng gửi chỉ vì website gặp fallback. Không báo rằng đã kiểm tra Gmail/Outlook/Safari/thiết bị thật.
- Không thêm font/package frontend, request preload hoặc thay fallback Trang chủ; chỉ triển khai web container khi kiểm tra và CI đạt.

## 1. Kết luận và bằng chứng

Nguyên nhân đã xác nhận là một số vùng giao diện khai báo `Georgia` trực tiếp, bỏ qua font tiêu đề chung `--font-display: 'Noto Serif', serif`. Trên Chromium/Windows kiểm tra, chữ và dấu trong cùng tiêu đề được dựng bằng hai font hệ thống khác nhau. Đây là lỗi fallback theo ký tự, không phải lỗi khoảng trắng trong chuỗi nguồn.

| Mẫu                                           | Cách kiểm tra                                                                           | Font thực tế                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Danh mục thành phần                           | Trang `/admin?tab=ingredients` trên website, API giả lập trong trình duyệt              | Georgia: 19 glyph; Times New Roman: 1 glyph      |
| Đơn hàng và tiền đã thu                       | Probe DOM dùng CSS báo cáo hiện có                                                      | Georgia: 23 glyph; Times New Roman: 1 glyph      |
| Đơn HTV-899409088                             | Probe DOM đúng cấu trúc `.order-queue-detail .staff-order-heading h2`, dùng CSS hiện có | Georgia: 16 glyph; Times New Roman: 1 glyph      |
| Danh mục thành phần — Đơn hàng và tiền đã thu | Cùng nội dung, dùng `var(--font-display)`                                               | Noto Serif: 45 glyph, duy nhất một font đóng gói |

Kiểm tra qua Chrome DevTools Protocol `CSS.getPlatformFontsForNode`, sau `document.fonts.ready`; không chỉ đọc `getComputedStyle().fontFamily`, vì giá trị đó không cho biết font được chọn cho từng ký tự. Probe là phần tử kiểm tra được thêm trong phiên trình duyệt; không chỉnh mã hay dữ liệu website. Phiên admin dùng API giả lập, không đăng nhập hoặc thao tác tài khoản thật.

### Phạm vi đã rà soát

- Quét toàn bộ CSS frontend: có **27 khai báo ưu tiên Georgia trong 6 file**, danh sách ở cuối tài liệu. Đây là 27 khai báo, không phải 27 trang hay 27 lỗi đã tái hiện.
- Kiểm tra khai báo font trong TS/TSX, CSS shorthand, font kế thừa, cấu hình toàn cục, preload trong HTML và font fallback riêng Trang chủ.
- Kiểm tra bảng ký tự của **18 file Archivo** thường/nghiêng và **2 file Noto Serif** thường/nghiêng: đủ các ký tự Việt Latin Extended Additional U+1EA0–U+1EF9, các chữ Ă/Đ/Ĩ/Ũ/Ơ/Ư và chữ thường, dấu kết hợp cần thiết, ký hiệu đồng U+20AB.
- Quét TS/TSX/JSON trong `frontend/src`, `backend/src`, `content`: không thấy U+FFFD hoặc chuỗi khác chuẩn NFC. Ba tiêu đề trong ảnh có nội dung nguồn đúng. Việc này không chứng minh mọi bản ghi nhập từ database đều sạch; chưa đọc hoặc sửa dữ liệu khách hàng.
- Kiểm tra font test hiện có: `tests/e2e/typography.spec.ts` mới kiểm tra 3 tiêu đề ở Trang chủ và số face Archivo; chưa bao phủ workspace, tài khoản, checkout, game hoặc các điều kiện tải font lỗi.
- Phát hiện tiêu đề email xác nhận đơn hàng dùng Georgia tại `backend/src/services/orderConfirmationEmail.ts`. Email là môi trường riêng, nhiều client không tải webfont; cần kiểm tra riêng, không áp dụng máy móc CSS của website.

### Giới hạn của lần rà soát

Đã kiểm kê toàn bộ cấu hình nguồn và kiểm tra bảng ký tự toàn bộ font. Đã tái hiện font pha trộn trên Chromium/Windows ở mẫu nêu trên. Chưa kiểm tra trực quan mọi trạng thái trong từng trang, chưa xác nhận trên Edge/Firefox/Safari/iOS/Android thật. Không kết luận mỗi vùng Georgia đều đang lỗi trên mọi hệ điều hành. Các phần đó nằm trong ma trận nghiệm thu bên dưới.

## 2. Nguyên tắc giữ nguyên sản phẩm

1. Giữ font UI Archivo và phong cách tiêu đề serif hiện có. Dùng Noto Serif đã có sẵn cho các vùng serif của website; không thêm font mới hoặc đổi toàn bộ hệ chữ.
2. Sửa từng selector hiện có. Không dùng `*`, `!important`, hoặc override toàn bộ `h1`–`h6` để che lỗi. Không xóa gộp các khối CSS trùng trong cùng đợt sửa.
3. Giữ nguyên font-size, line-height, letter-spacing, màu, padding, margin, grid/flex, breakpoint, kích thước ảnh và nội dung. Đổi font có thể đổi độ rộng ký tự, nên không thể hứa hình học tuyệt đối giống cũ; kiểm tra xuống dòng và chỉ điều chỉnh cục bộ nếu thực sự có tràn/cắt chữ.
4. Không đổi component tree, tên class, nhãn truy cập, route, API, schema, phân quyền, session, validation, state hoặc handler. Không đổi luật game, thời gian, điểm, voucher, Socket.IO hay điều hướng đăng nhập/đăng xuất.
5. Giữ monospace cho OTP/mã cần căn cột khi đó là chủ ý; không xem mọi font khác Archivo/Noto là lỗi. Không thay chữ trong ảnh/logo/video bằng CSS.
6. Không chạy chuẩn hóa dữ liệu hàng loạt hoặc sửa database chỉ để chữa dấu chữ. Nếu sau này có bản ghi lỗi encoding thực sự, xử lý như một thay đổi riêng với bản sao lưu và bằng chứng.

## 3. Các bước thực hiện

### Bước A — Lưu mốc trước khi sửa

- Chụp ba vùng user phản ánh cùng kích thước viewport; thêm trạng thái danh sách, chi tiết, modal, dropdown, form lỗi và loading ở các nhóm bên dưới.
- Dùng fixture/API giả lập cố định cho admin/staff/khách. Không gửi email, tạo đơn/voucher thật hoặc sửa bản ghi production để kiểm tra.
- Ghi computed family/weight/style/size/line-height, font thực tế CDP, số dòng, bounding box, scrollWidth/clientWidth. Chụp khi font tải xong và khi cold-cache; ghi lỗi request font nếu có.
- Chụp từng route bằng truy cập trực tiếp và bằng điều hướng nội bộ: CSS lazy-load có thể làm kết quả khác theo thứ tự mở trang.

### Bước B — Sửa workspace trước

- `admin.css`: tiêu đề catalog/thành phần, toolbar thống kê, tiêu đề biểu đồ/bảng và số liệu KPI.
- `staff.css`: tiêu đề dashboard, quản lý tài khoản, form tạo/sửa, danh sách đơn và chi tiết đơn.
- `workspace.css`: thương hiệu sidebar, tiêu đề section và nhật ký.
- Thay **family** Georgia ưu tiên đầu bằng `var(--font-display)` tại các khai báo trong danh mục, giữ nguyên các thuộc tính còn lại. Các selector đã dùng token thì không cần thay chỉ vì còn Georgia trong fallback.
- Kiểm tra cả khai báo lặp `.admin-account-form-heading h3` ở hai vị trí, sửa đúng cascade hiện tại; không tiện tay tái cấu trúc CSS.
- Noto Serif hiện chỉ có weight 400 thường/nghiêng. CSS yêu cầu 500/600 được chọn face gần nhất khi `font-synthesis: none`; đây là điểm cần kiểm tra độ nhấn, chưa phải bằng chứng gây lỗi dấu. Đợt đầu giữ weight cũ; không mở font-synthesis toàn cục. Chỉ bổ sung weight thật trong thay đổi riêng nếu nghiệm thu cho thấy cần và có nguồn/license hợp lệ.

### Bước C — Sửa giao diện khách và game

- `account-public.css`: tiêu đề tài khoản, đăng nhập/đăng ký, đặt lại mật khẩu, khiếu nại và các panel.
- `commerce-public.css`: giỏ/checkout, legend biểu mẫu, tổng kết đơn, tra cứu/chi tiết đơn, timeline và kết quả thanh toán.
- `games.css`: tên game, heading, điểm/lượt, giá trị thưởng, kết quả lật thẻ/sưu tập. Giữ kích thước bàn 10 thẻ, toàn màn hình, thời gian giữ cặp và toàn bộ luật hiện tại.
- Trang chủ, sản phẩm, Câu chuyện, Về chúng tôi, tin tức, liên hệ, widget chatbot/game và thông báo: kiểm tra hồi quy; chỉ sửa nếu phát hiện bằng chứng lỗi. Không thay fallback font nhúng trong `home-critical-fonts.css` hoặc script sinh nó khi chưa có vấn đề thực tế.
- Giữ cơ chế preload hiện có. Không preload tất cả 20 file, không thêm package font/CDN, không mở thêm request API để chữa font.

### Bước D — Email riêng

- Preview HTML email bằng dữ liệu giả, kiểm tra tiêu đề tiếng Việt trên các client hỗ trợ được: Gmail web, Outlook và mobile.
- Nếu Georgia tái hiện lỗi, ưu tiên stack system sans đã dùng cho nội dung email, giữ template/order interpolation/escapeHtml/địa chỉ gửi/luồng gửi nguyên trạng. Không giả định Noto webfont sẽ được email client tải.
- Không gửi thư thật trong quá trình rà soát; thay đổi email tách khỏi patch CSS website để có thể kiểm tra/rollback riêng.

### Bước E — Test và kiểm soát phạm vi

- Mở rộng `typography.spec.ts` sang route/role/state trong ma trận; dùng text mẫu có dấu và mã HTV thật dạng fixture. Với Chromium kiểm tra font actual bằng CDP: vùng serif mong đợi Noto Serif, không xuất hiện fallback hệ thống sau khi font sẵn sàng; Archivo UI kiểm tra tương tự.
- Thêm kiểm tra nội dung Việt NFC và NFD trên fixture chuyên biệt để thấy dấu kết hợp có bị cắt/đặt lệch. Không sửa dữ liệu đầu vào để test vượt qua.
- Test font chậm/lỗi: nội dung vẫn đọc được, nút vẫn dùng được, không chặn route/loading vô hạn. Trạng thái này được phép fallback; không ép assertion Noto khi request đã bị chặn có chủ ý.
- Kiểm tra SVG label/tooltip của biểu đồ, tiền tệ, field nhập/placeholder, dropdown, toast, modal, focus, zoom 200%, reduced motion; tránh chỉ test headings.
- Chạy `typecheck`, `lint`, build, format của file đổi; các bộ E2E admin/staff/account/account-management/auth/auth-navigation/commerce/ingredients-admin/points-vouchers/games/chat/notifications/story-video và typography. Full CI là điều kiện release.
- Review diff: chỉ CSS/font test và tài liệu; nếu cần sửa TSX/layout/backend, phải có lỗi cụ thể và scope riêng. Không sửa tiện tay chức năng.

## 4. Ma trận nghiệm thu

| Nhóm      | Các vùng/trạng thái cần kiểm tra                                                       | Luồng phải giữ nguyên                                   |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Admin     | Dashboard/biểu đồ/KPI; sản phẩm/thành phần; tài khoản/voucher; nhật ký; modal/form lỗi | Lọc ngày, chuyển tab, CRUD fixture, quyền admin         |
| Staff     | Dashboard; hàng đợi đơn; chi tiết đơn; hỗ trợ; quản lý tài khoản trong quyền           | Lọc đơn, cập nhật trạng thái fixture, chat, quyền staff |
| Khách     | Header/dropdown; đăng nhập; tài khoản; ưu đãi; địa chỉ; đơn/đánh giá/hỗ trợ            | Điều hướng đúng role, logout về Home, form/validation   |
| Commerce  | Giỏ; checkout; mã/giá/tổng tiền; tra cứu; timeline; kết quả thanh toán                 | Tính tiền, voucher, thanh toán fixture, tra cứu         |
| Game      | Heading/đếm giờ/điểm; cặp đúng/sai; modal thưởng; mobile/fullscreen                    | 10 thẻ/5 cặp random, 120 giây, điểm/đổi thưởng          |
| Công khai | Home; sản phẩm/detail; thành phần/modal; story/video; about/news/contact/errors        | Carousel, video/ended→home, liên kết, widget            |
| Widget    | Chatbot/chat nhân viên; thông báo; launcher game; toast/loading                        | Mở/đóng, focus, realtime, nhận/đọc fixture              |

Viewport đại diện: 320×568, 360×640, 390×844, 430×932, 768×1024, 1366×768, 1440×900; thêm mobile ngang và desktop zoom 200%. Chạy Chromium desktop/mobile trong CI; Edge/Firefox và Safari iOS/Android thật kiểm tra thủ công nếu có thiết bị. Giả lập mobile Chromium không được báo là đã kiểm tra Safari thật.

Điều kiện đạt: dấu đủ và cùng phong cách; không tràn ngang/cắt dấu/chồng chữ; nút và nội dung quan trọng không bị che; số dòng/chiều cao thay đổi được ghi lại và đánh giá; không có lỗi font HTTP; không tăng số request/tổng dung lượng do sửa font nếu không có lý do đã duyệt; các luồng ở trên đạt. Không đặt ngưỡng pixel giống tuyệt đối cho glyph vì đang thay font để chữa lỗi.

## 5. Release và rollback

Chia thành patch website theo nhóm workspace → account/commerce → games, mỗi nhóm kèm kiểm tra; email tách riêng. Review tổng thể sau cùng để không tạo font pha trộn giữa các route.

Chỉ commit/push/deploy sửa giao diện sau khi thực hiện và nghiệm thu; tài liệu này là kế hoạch, chưa sửa CSS hay triển khai. Khi release website chỉ cần web container nếu backend/email không đổi. Giữ image/commit trước đó để rollback; không chạy migration hay reset dữ liệu. Sau release kiểm tra cold-cache và truy cập trực tiếp ba vùng user báo, rồi kiểm tra mẫu mỗi nhóm. Nếu lỗi mới ảnh hưởng thao tác, rollback patch tương ứng thay vì override toàn cục.

## 6. Danh mục selector cần xử lý

Danh mục được trích từ mã nguồn ở mốc kiểm tra; số dòng là dòng mở khối, có thể thay đổi khi sửa.

| File: dòng                                 | Selector                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frontend/src/pages/account-public.css:57   | .account-welcome h1, .account-heading h1, .auth-reset h1, .account-appeal-card h1                                                                         |
| frontend/src/pages/account-public.css:95   | .account-auth h2, .account-content > h2                                                                                                                   |
| frontend/src/pages/account-public.css:223  | .account-panel h3                                                                                                                                         |
| frontend/src/pages/admin.css:359           | .admin-catalog-heading h2, .admin-analytics-toolbar h2                                                                                                    |
| frontend/src/pages/admin.css:583           | .admin-stat-cards strong                                                                                                                                  |
| frontend/src/pages/admin.css:612           | .admin-chart-heading h3, .admin-report-tables h3                                                                                                          |
| frontend/src/pages/commerce-public.css:52  | .htv-commerce-public .commerce-intro h1                                                                                                                   |
| frontend/src/pages/commerce-public.css:169 | .htv-commerce-public :where(.checkout-form, .checkout-summary) legend                                                                                     |
| frontend/src/pages/commerce-public.css:284 | .htv-commerce-public .checkout-summary h2, .htv-commerce-public .retrieval-key h2                                                                         |
| frontend/src/pages/commerce-public.css:440 | .htv-order-page .order-summary-panel > h3                                                                                                                 |
| frontend/src/pages/commerce-public.css:458 | .htv-order-page .shipping-timeline h3                                                                                                                     |
| frontend/src/pages/commerce-public.css:576 | .htv-payment-result .payment-result-status                                                                                                                |
| frontend/src/pages/games.css:75            | .games-intro h1                                                                                                                                           |
| frontend/src/pages/games.css:186           | .games-page h2                                                                                                                                            |
| frontend/src/pages/games.css:206           | .games-counter strong                                                                                                                                     |
| frontend/src/pages/games.css:431           | .games-prize > strong                                                                                                                                     |
| frontend/src/pages/games.css:557           | .games-prize-soft h3                                                                                                                                      |
| frontend/src/pages/games.css:643           | .games-reveal h3                                                                                                                                          |
| frontend/src/pages/staff.css:34            | .staff-overview-kpis strong                                                                                                                               |
| frontend/src/pages/staff.css:56            | .staff-overview-chart h2, .staff-overview-shortcuts h2                                                                                                    |
| frontend/src/pages/staff.css:966           | .admin-account-page-heading h2, .admin-account-list-heading h3, .admin-appeal-overview h3, .admin-staff-create-heading h3, .admin-account-form-heading h3 |
| frontend/src/pages/staff.css:1399          | .admin-account-form-heading h3                                                                                                                            |
| frontend/src/pages/staff.css:1655          | .order-queue-heading h2                                                                                                                                   |
| frontend/src/pages/staff.css:1864          | .order-queue-detail .staff-order-heading h2                                                                                                               |
| frontend/src/pages/workspace.css:29        | .workspace-brand strong                                                                                                                                   |
| frontend/src/pages/workspace.css:194       | .workspace-section-heading h2                                                                                                                             |
| frontend/src/pages/workspace.css:373       | .workspace-log-heading h2                                                                                                                                 |
