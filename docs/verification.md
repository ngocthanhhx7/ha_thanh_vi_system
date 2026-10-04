# Kiểm tra bản đầu — 04/10/2026

Đã kiểm tra bản chạy cục bộ và bản build; chưa xác minh giao dịch ngân hàng hoặc hãng vận chuyển thật.

| Nhóm                            | Kết quả                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript frontend/backend     | Đạt                                                                                                                                                    |
| ESLint                          | Đạt                                                                                                                                                    |
| Backend                         | 34/34 bài đạt; gồm MongoDB cô lập thật và kiểm tra dịch vụ/chữ ký                                                                                      |
| Trình duyệt                     | 36/36 bài đạt, desktop và mobile                                                                                                                       |
| Build frontend/backend          | Đạt; API production khởi động và đọc đủ 5 sản phẩm                                                                                                     |
| Định dạng                       | Prettier đạt                                                                                                                                           |
| Dependencies production         | npm audit không báo lỗ hổng                                                                                                                            |
| Responsive thực tế              | 7 trang ở 390px, 768px, 1440px: không tràn ngang, không ảnh lỗi hoặc lỗi JavaScript                                                                    |
| Luồng nối giao diện với MongoDB | Đăng ký, địa chỉ mặc định, voucher + COD, quản trị từ users.role, chuyển trạng thái, vận đơn, lịch sử chủ tài khoản và thu hồi truy cập khi logout đạt |

Luồng thử thật dùng dữ liệu kiểm tra riêng và được dọn sau kiểm tra. Không tạo vận đơn, thanh toán hoặc đánh giá quảng cáo giả.

Backend tập trung chống sửa giá từ client, đặt đơn trùng, phiên/cookie/CSRF, role, truy cập đơn người khác, quota voucher đồng thời, voucher thưởng, yêu cầu trả hàng, chữ ký payOS và phục hồi thao tác sau lỗi. Trình duyệt kiểm tra lỗi giữ giỏ/thông tin, địa chỉ/voucher checkout, quản trị và từ chối quyền. Regression font kiểm tra glyph tiếng Việt thực sự dùng cùng Noto Serif, bao gồm chữ nghiêng, và đủ 18 face Archivo được khai báo.

Frontend build có JavaScript khoảng 362kB, gzip khoảng 110kB. Ảnh WebP và font WOFF2 phục vụ cùng origin; trình duyệt chỉ tải font đang dùng. Đây là kích thước build cục bộ, không phải kết quả đo tốc độ mạng hoặc cam kết điểm Lighthouse.

Trước mở bán cần điền merchant payOS, webhook HTTPS, cấu hình host/MongoDB thật, giá chính thức, ảnh sản phẩm, chính sách giao/đổi trả và thông tin hàng hóa. Theo dõi vận chuyển hiện do staff nhập; cổng hoàn tiền không tự chuyển tiền. Không dùng dữ liệu hoặc bí mật `.local` khi triển khai.
