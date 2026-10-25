# Rà soát nhập văn bản — 25/10/2026

## Kế hoạch

1. Tái hiện bằng từng phím Space và Enter ở mục “Trong pack có gì?”, cả tạo và sửa sản phẩm. Không chỉ dùng `fill()`: điền cả chuỗi sẽ bỏ qua lỗi xảy ra giữa các lần gõ.
2. Tìm trong toàn bộ `frontend/src` các handler nhập liệu, phép `trim`, `split`, `filter`, `replace`, giá trị điều khiển và sự kiện bàn phím. Theo dõi xem dữ liệu chuẩn hóa có được gán ngược vào ô nhập hay không.
3. Kiểm tra các nhóm tương tự: sản phẩm, thành phần, CMS, tài khoản/địa chỉ, checkout, tìm kiếm, phản hồi hỗ trợ, ưu đãi và chat. Chỉ sửa nơi có bằng chứng lỗi.
4. Kiểm tra gõ tiếng Việt, khoảng trắng, dòng trống, dán nhiều dòng, lưu lỗi/thử lại, mở lại và xóa toàn bộ danh sách. Chạy trên Chromium với viewport desktop/mobile, sau đó typecheck, lint, backend tests, build và kiểm tra format/diff.

## Nguyên nhân và sửa chữa

`ProductEditor` trước đây chuyển textarea thành mảng sau mỗi `onChange`, cắt khoảng trắng từng dòng và bỏ dòng trống, rồi `join('\n')` lại để hiển thị. Space cuối chuỗi và Enter tạo dòng mới bị xóa ngay. Kiểm thử trước sửa nhận `"1"` thay vì `"1 "` ở cả tạo mới và chỉnh sửa.

Giữ bản nháp textarea dưới dạng chuỗi riêng trong vòng đời editor. Chỉ tách dòng, trim từng món và bỏ dòng trống khi submit. Lưu thất bại giữ nguyên chuỗi đang soạn. Mở lại lấy danh sách đã lưu; danh sách rỗng gửi `[]` để xóa. Backend tiếp tục kiểm tra tối đa 20 món, 300 ký tự/món; không thay đổi schema/API.

CI toàn bộ phát hiện thêm lỗi ô tìm kiếm Tin tức: `value` đọc trực tiếp từ URL, trong khi React Router cập nhật URL bất đồng bộ. Ký tự nhập nhanh sau đó có thể ghi đè chuỗi bằng giá trị cũ. Giữ query nhập liệu bằng state cập nhật ngay trong `onChange`; URL tiếp tục đồng bộ, nhưng các chuyển tiếp cũ không ghi ngược đè bản nháp. Điều hướng Back/Forward vẫn khôi phục từ URL, bộ lọc chủ đề giữ query mới nhất và các nút xóa đặt lại cả ô nhập lẫn URL.

## Kết quả rà soát mã

| Nhóm                                                               | Cách xử lý văn bản                                      | Kết luận trong phạm vi lỗi này    |
| ------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------- |
| Sản phẩm: “Trong pack có gì?”                                      | Chuẩn hóa và dựng lại value sau từng phím               | Đã sửa                            |
| Các ô mô tả sản phẩm, thành phần và CMS                            | Lưu trực tiếp `event.target.value`                      | Không thấy cùng lỗi               |
| Tài khoản, sổ địa chỉ, đánh giá, yêu cầu hỗ trợ                    | State giữ nguyên văn bản hoặc đọc FormData khi gửi      | Không thấy cùng lỗi               |
| Checkout, lời nhắn, mã ưu đãi                                      | Giữ raw state; chuẩn hóa mã khi kiểm tra/gửi            | Không thấy cùng lỗi               |
| Tìm kiếm Tin tức                                                   | Value lấy từ URL cập nhật bất đồng bộ                   | Đã sửa lỗi mất ký tự khi gõ nhanh |
| Tìm kiếm sản phẩm, tài khoản, nhật ký, đơn hàng, người nhận ưu đãi | Query thô giữ riêng; chuẩn hóa khi lọc/gọi API          | Không thấy cùng lỗi               |
| Phản hồi hỗ trợ/đơn hàng và form ưu đãi của staff                  | Raw state hoặc FormData khi gửi                         | Không thấy cùng lỗi               |
| Chat Vị Ơi và chat staff                                           | Raw draft, trim khi gửi; Shift+Enter xuống dòng ở Vị Ơi | Không thấy cùng lỗi               |

## Kiểm thử hồi quy

- `tests/e2e/admin.spec.ts`: gõ từng phím, Enter/dòng trống, tiếng Việt, thay ô khác không mất bản nháp, lỗi lưu và thử lại, payload đã chuẩn hóa, mở lại, dán CRLF và xóa danh sách; cả POST và PATCH.
- `tests/e2e/text-inputs.spec.ts`: nhập Space, nhiều từ và dòng trống tại các ô sản phẩm/thành phần/CMS, tên người nhận/địa chỉ/lời nhắn checkout, tìm kiếm catalog/tin tức và Shift+Enter trong chat.
- Các bộ E2E nghiệp vụ hiện có kiểm tra các luồng sản phẩm, thành phần, tài khoản, quản lý tài khoản, thanh toán, chat và staff.

Các test trình duyệt dùng API giả lập, không chứng minh việc ghi dữ liệu thật trên production. Viewport mobile chạy bằng Chromium, không phải kiểm tra Safari/iPhone thật. Không thay dữ liệu production hoặc thư mục `sourceCodeDuAN/` trong đợt sửa này.
