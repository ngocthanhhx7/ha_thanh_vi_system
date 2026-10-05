# Tin tức Hà Thành Vị

Trang `/tin-tuc` là tuyển tập tóm tắt báo chí và cổng thông tin chính thức về bánh chả, thức quà và văn hóa ẩm thực Hà Nội. Không có chức năng đăng bài trong admin. Nội dung được quản lý tại `frontend/src/constants/news.json`; cấu trúc TypeScript nằm trong `news.ts`.

## Quy tắc nội dung và nguồn

- Mỗi mục có `id` riêng, tiêu đề biên tập `title`, tiêu đề nguồn `originalTitle`, nhà xuất bản `source`, URL chính xác `sourceUrl`, ngày xuất bản `publishedAt`, chủ đề `category` và tóm tắt `summary`.
- Tóm tắt do Hà Thành Vị biên tập bằng lời riêng, dẫn người đọc đến bài đầy đủ. Không sao chép nguyên bài hoặc tuyên bố báo chí đưa tin về thương hiệu khi nguồn không nói điều đó.
- Chỉ ghi ngày đăng đã xác minh; ngày chưa xác minh để `null`. Ngày tuyển chọn và kiểm tra không thay thế ngày đăng của nhà xuất bản.
- Bốn chủ đề: `banh-qua`, `tra-com`, `am-thuc`, `van-hoa`. Khi bổ sung bài, chọn nhóm phù hợp với nội dung thực tế, không gán để đủ số lượng.
- Liên kết nguồn phải là URL HTTPS trực tiếp đến bài viết. Không dùng trang tìm kiếm, trang chủ, trang nhãn chủ đề hoặc URL tự suy đoán.
- Kiểm tra lại nguồn khi bảo trì nội dung: URL truy cập được, tiêu đề/nhà xuất bản/ngày đúng, tóm tắt phản ánh bài gốc. Nếu bài gốc bị gỡ, thay nguồn và tóm tắt tương ứng.

## Ảnh

Ảnh chủ đề được tạo bằng công cụ image-generator thông qua agy Gemini 3.8 High, ngày 05/10/2026. Đây là ảnh minh họa, không phải ảnh chụp báo chí. Không sử dụng lại ảnh của nhà xuất bản chỉ vì đã dẫn nguồn bài viết.

Prompt chung: minh họa màu nước dạng ngang, giấy màu kem, vàng ấm, đỏ burgundy và xanh lá; không chữ, logo hay watermark. Bốn cảnh: bánh chả nhỏ với trà và khay quà; trà sen cùng cốm xanh trên lá sen; phở, bánh cuốn và bún chả; phố cổ Hà Nội với quán trà vỉa hè. Bản WebP tối ưu phục vụ trang nằm tại `frontend/public/news/`; các bản PNG gốc lưu cùng thư mục.

## Từ khóa SEO/GEO

Claude CLI đã đọc và áp dụng `seo-keyword-strategist` và `geo-fundamentals`, giữ nguyên model được cấu hình, reasoning effort `max`.

- Chủ đề chính: tin tức ẩm thực Hà Nội, văn hóa ẩm thực Hà Nội.
- Bánh/quà: bánh chả Hà Nội, thức quà Hà Nội, đặc sản làm quà; dùng tự nhiên khi nguồn liên quan.
- Trà/cốm: trà sen Tây Hồ, văn hóa thưởng trà, cốm làng Vòng, cốm Mễ Trì, mùa thu Hà Nội.
- Món ăn: món ngon Hà Nội, phở Hà Nội, bánh cuốn, bún chả, ẩm thực phố cổ.
- Văn hóa: di sản ẩm thực Hà Nội, làng nghề truyền thống, du lịch ẩm thực Hà Nội.

Đây là nhóm từ khóa theo chủ đề và ý định khám phá văn hóa, không phải số liệu lượng tìm kiếm. Không nhồi mật độ từ khóa hay tạo đánh giá, tác giả/chuyên môn, trích dẫn hoặc số liệu giả.

Trang dùng `CollectionPage` và `ItemList` liên kết nguồn ngoài; không nhận là tác giả của các `NewsArticle`. Metadata của trang được khôi phục khi người dùng rời Tin tức để không ảnh hưởng các trang khác. Những bài có ngày cũ là tài liệu văn hóa, không được gắn nhãn tin mới nhất.

## Kiểm tra SEO/GEO khi đưa lên Internet

1. Chốt tên miền HTTPS chính thức. Đặt canonical `/tin-tuc`, `og:url`, ảnh chia sẻ và sitemap theo cùng tên miền; không xuất bản domain mẫu.
2. Kiểm tra `/tin-tuc` tải trực tiếp và tải lại không trả 404; cấu hình máy chủ hỗ trợ route SPA.
3. Website hiện dùng React SPA. Để tối ưu khả năng lập chỉ mục, đánh giá prerender/SSR cho trang công khai; kiểm tra HTML ban đầu và bản render để bot đọc được H1, 20 mục, nguồn và metadata.
4. Đưa URL chuẩn vào sitemap XML, khai báo sitemap trong robots.txt và cho crawler truy cập các tài nguyên cần thiết. Chính sách AI crawler là một quyết định riêng khi triển khai.
5. Hoàn thiện Open Graph/Twitter với ảnh minh họa được phép dùng, URL tuyệt đối, tiêu đề và mô tả riêng cho trang.
6. Kiểm tra JSON-LD bằng trình xác thực, không khai báo thuộc tính tác giả/ngày đăng của bài gốc dưới tên thương hiệu. Đảm bảo danh sách có cùng số bài với nội dung hiển thị.
7. Kiểm tra hiệu năng ảnh, Core Web Vitals, điều hướng bàn phím, tương phản chữ, mobile và link nguồn. Gửi sitemap và dùng URL Inspection trên Search Console sau triển khai.
8. Có thể dùng lại Claude CLI với model hiện tại ở `max` để rà soát site hoàn chỉnh sau khi đã biết tên miền và cấu hình triển khai. Chưa triển khai hoặc xác nhận thứ hạng trong công việc này.
