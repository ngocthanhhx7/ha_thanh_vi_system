# Tài khoản an toàn và Vị Ơi — 04/10/2026

## Yêu cầu đã chốt

Không đọc `backend/.env` hoặc sử dụng bí mật của chủ dự án trong công cụ kiểm tra. Cấu hình giả lập riêng dùng để kiểm thử. Giữ nguyên thay đổi môi trường do chủ dự án đang thực hiện; không đưa env thật lên Git.

Đăng ký có nhập lại mật khẩu và xác nhận email bằng OTP trước khi cấp phiên. Đăng nhập trên thiết bị mới cần email/mật khẩu đúng và OTP. Người dùng có thể tin cậy thiết bị trong 30 ngày; ghi nhớ bằng token ngẫu nhiên HttpOnly đã băm phía server. Mật khẩu thô không lưu trong cookie/localStorage; trình quản lý mật khẩu trình duyệt có thể tự lưu qua trường autocomplete.

Quên mật khẩu gửi link ngẫu nhiên một lần có hạn dùng. Phản hồi không tiết lộ email đã đăng ký hay chưa. Đổi mật khẩu thành công thu hồi phiên, thiết bị tin cậy và challenge cũ. Xác thực giữ nguyên collection `users.role`; không có tài khoản admin riêng trong env.

Vị Ơi thân thiện, trẻ trung, tinh tế và lịch sự. Phạm vi: Hà Thành Vị, catalog/set quà, văn hóa ẩm thực Hà Nội liên quan, liên hệ và hướng dẫn chăm sóc khách. Nguồn là catalog/nội dung hiện tại cùng bộ kiến thức công khai được chọn lọc; không đọc tùy ý repository, chỉ dẫn agent, bí mật hoặc đơn riêng của khách.

## Luồng và hợp đồng

- Register → verificationRequired, chưa đăng nhập. Verify-email(email,code,rememberDevice) → phiên.
- Login(email,password,rememberDevice) → phiên nếu thiết bị hợp lệ hoặc otpRequired/challengeId. Verify-login(challengeId,code) → phiên; resend theo cooldown.
- Forgot-password(email) → phản hồi chung. Reset-password(token,password,confirmPassword) → thông báo và yêu cầu đăng nhập lại.
- Chat config trả trạng thái sẵn sàng và gợi ý. Chat(message,history giới hạn) trả Markdown, sản phẩm đã xác minh từ catalog, nguồn cho phép và hướng bàn giao cho người thật.

OTP 6 chữ số, hạn 10 phút, tối đa 5 lần thử, gửi lại cách ít nhất 60 giây. Token reset có entropy 256 bit, hạn 20 phút và tiêu thụ một lần atomic. Token thiết bị gắn đúng user, có hạn 30 ngày, không thay thế kiểm tra mật khẩu khi đăng nhập lại. Mật khẩu reset thu hồi mọi thiết bị.

Markdown được render bằng trình phân tích an toàn, không cho HTML hoặc ảnh từ AI. Link được giới hạn; Unicode, emoji, chữ đậm/nghiêng và danh sách được hiển thị rõ. Câu hỏi ngoài phạm vi được từ chối nhẹ nhàng. Không tự mua hàng, đổi trạng thái đơn hay hoàn tiền từ hội thoại.

Không bịa thành phần/dị ứng/HSD/chứng nhận hoặc chính sách chưa ban hành. Giá tạm được nói rõ. Không biến sản phẩm của đối thủ hoặc giá suy đoán thành dữ liệu đã xác minh. Khi dịch vụ AI chưa cấu hình/lỗi, giao diện báo thật và đưa liên hệ hỗ trợ.

## Triển khai và kiểm chứng

Claude CLI dùng model custom hiện tại, effort max; agy dùng /teamwork-preview với Gemini 3.8 Flash High hoặc Opus được cho phép. CLI làm việc trên snapshot sạch không có env thật; chỉ hợp nhất file thuộc phạm vi. Root tích hợp config/app và dependencies, rà quyền và chạy toàn bộ kiểm tra.

Kiểm thử SMTP và Gemini bằng transport/provider giả lập. Kiểm tra OTP sai/hết hạn/thử lại, resend, thiết bị mới/tin cậy, reset một lần/thu hồi phiên, Unicode/Markdown/XSS, dữ liệu catalog thay đổi, ngoài phạm vi, prompt injection và lỗi provider. Tiếp tục kiểm tra các luồng thương mại hiện có. Không tuyên bố đã gửi email hoặc gọi AI thật khi chưa kiểm chứng.

Đăng nhập Google để giai đoạn tiếp theo: tài khoản liên kết theo provider subject, không ghép tài khoản chỉ dựa email chưa xác minh; không đưa nút đăng nhập giả vào giao diện.
