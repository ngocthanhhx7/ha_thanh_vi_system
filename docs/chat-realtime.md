# Tư vấn trực tiếp qua Socket.IO

Chat vẫn ghi dữ liệu qua REST với kiểm tra phiên, quyền, CSRF, giới hạn gửi và quyền tiếp nhận hiện có. Socket.IO chỉ gửi `chat:changed` với `{ id }` sau khi ghi thành công. Trình duyệt tải lại hội thoại qua REST; không gửi nội dung tin nhắn hoặc thông tin khách hàng trong sự kiện.

- Đường dẫn kết nối: `/api/realtime/socket.io`. Caddy dùng proxy `/api/*` hiện có; Vite bật `ws: true` cho proxy `/api`.
- Nhân viên/admin: xác thực bằng cookie phiên, kiểm tra lại quyền trước mỗi sự kiện và mỗi 30 giây. Phiên bị thu hồi hoặc tài khoản bị đình chỉ sẽ bị ngắt.
- Khách: `POST /api/chat/handoffs/:id/realtime-ticket` kiểm tra chủ hội thoại hoặc cookie khách đúng đường dẫn. Endpoint yêu cầu Origin được phép và `X-Requested-With: XMLHttpRequest`, trả ticket ngẫu nhiên dùng một lần, hạn 30 giây. Ticket chỉ dùng cho đúng hội thoại; phiên tài khoản và quyền khách tiếp tục được kiểm tra trước mỗi thông báo. Cookie HttpOnly của khách không cần mở rộng phạm vi hay đưa vào JavaScript.
- Không có lệnh socket ghi dữ liệu hay tự chọn phòng. Kết nối không có Origin hoặc có Origin ngoài danh sách bị từ chối ở handshake.
- Kết nối lại tải lại REST để bù các thông báo bị bỏ lỡ. Khi socket ngắt, giao diện dùng nhịp thăm dò dự phòng hiện có. Các màn hình nhân viên dùng chung một kết nối. Đóng chat/đổi màn hình gỡ listener; hội thoại đã kết thúc dừng theo dõi phía khách.
- Phản hồi REST cũ không ghi đè hội thoại mới: kiểm tra `updatedAt`, số tin nhắn và tiến trình trạng thái; đổi lựa chọn nhân viên có chặn phản hồi từ hội thoại trước.

Hạ tầng hiện tại chạy một tiến trình backend. Ticket lưu trong bộ nhớ, tối đa 2.000 ticket chưa dùng; sự kiện dùng bộ phát nội bộ. Khi tăng lên nhiều tiến trình/replica cần kho ticket dùng chung và bộ phân phối sự kiện dùng chung (ví dụ Redis adapter cùng kho ticket), cùng cấu hình định tuyến phù hợp với transport polling. Restart hiện tại làm mất ticket chưa dùng; trình duyệt lấy ticket mới khi kết nối lại.

Kiểm thử: `backend/tests/chat-realtime.test.ts` mở server Socket.IO thật, kiểm tra Origin, quyền nhân viên, tách hội thoại khách, ticket dùng một lần, reconnect và thu hồi quyền trước thông báo. `backend/tests/chat-handoff.test.ts` kiểm tra REST ticket, quyền cookie, CSRF và thông báo chỉ sau ghi thành công; đọc dữ liệu không tạo vòng lặp thông báo.

Tham chiếu: [Socket.IO middleware](https://socket.io/docs/v4/middlewares/), [server options](https://socket.io/docs/v4/server-options/), [CORS và allowRequest](https://socket.io/docs/v4/handling-cors/).
