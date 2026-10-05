# Kế hoạch thiết kế và tích hợp họa tiết hai đầu Header Hà Thành Vị

## 1. Kiểm chứng nghiên cứu tư liệu mỹ thuật truyền thống Thăng Long - Hà Nội

Quá trình nâng cấp họa tiết được đối chiếu trực tiếp với các tài liệu hiện vật và chuyên khảo đang phát hành trực tuyến từ các cơ quan bảo tồn di sản, bảo tàng quốc gia. Nhằm đảm bảo tính chính xác, phần này tách bạch rõ ràng giữa **dữ kiện lịch sử được nguồn xác nhận** và **quyết định tạo hình hiện đại** dành riêng cho bộ nhận diện Hà Thành Vị:

### Nguồn 1: Bảo tàng Mỹ thuật Việt Nam (Vietnam National Fine Arts Museum - VNFAM)

- **Tiêu đề trang**: _Art from the 11th to the 19 Century AD._
- **Đơn vị phát hành**: Bảo tàng Mỹ thuật Việt Nam
- **Địa chỉ URL**: https://vnfam.vn/en/displays/5ab4ad3f833508001d4c5bf0
- **Dữ kiện lịch sử nguồn xác nhận**:
  - Phần mô tả của trang đặt mỹ thuật Đại Việt trong bối cảnh Phật giáo và việc xây dựng kinh đô Thăng Long; đây là tư liệu bối cảnh lịch sử, không được dùng làm căn cứ cho một kiểu hoa văn cụ thể.
- **Quyết định tạo hình hiện đại cho Hà Thành Vị**:
  - Mảng burgundy (`#461F21`), cánh sen đỏ cam (`#7D1D27` đến `#E2654F`), viền vàng (`#C38A36`) và gân kem (`#FBF5E9`) là lựa chọn đồ họa hiện đại để theo nhận diện hiện có; không phải bản tái dựng hiện vật được trang này mô tả.

---

### Nguồn 2: Bảo tàng Lịch sử Quốc gia (Vietnam National Museum of History - BTLSQG)

- **Tiêu đề trang**: _Bảo vật Quốc gia : Bình gốm hoa lam vẽ thiên nga_
- **Đơn vị phát hành**: Bảo tàng Lịch sử Quốc gia
- **Địa chỉ URL**: https://baotanglichsu.vn/vi/Articles/1001/28550/bao-vat-quoc-gia-binh-gom-hoa-lam-ve-thien-nga.html
- **Dữ kiện lịch sử nguồn xác nhận**:
  - Trang mô tả chiếc bình thiên nga là hiện vật thuộc bộ sưu tập độc bản tìm thấy trong tàu cổ Cù Lao Chàm. Bình có dáng búp sen; bảy băng hoa văn gồm cánh sen kép có xoắn ốc, vân mây dải hình khánh, cây hoa lá, sóng nước, lá đề và hình thiên nga.
  - Bài viết cho biết hàng hóa gốm từ con tàu có nguồn gốc sản xuất ở Hải Dương và Thăng Long; các nhà nghiên cứu Việt Nam định niên đại con tàu khoảng giữa đến cuối thế kỷ 15, thời Lê sơ.
  - Ở phần bàn về gốm hoa lam thế kỷ 15 nói chung, bài viết nêu hai lối thể hiện: _"vẽ chi tiết, nét mảnh"_ (người sưu tầm gọi là "pake") và _"vẽ thoáng với nét đậm"_. Bài cũng mô tả vàng kim, mây và sóng nước trên một số hiện vật khác trong tư liệu Cù Lao Chàm; các chi tiết đó không được gán riêng cho bình thiên nga.
- **Quyết định tạo hình hiện đại cho Hà Thành Vị**:
  - Dùng nét viền đậm cùng gân và highlight mảnh để giữ các lớp cánh hoa, lá và mây tách bạch khi thu nhỏ; đây là ứng dụng đồ họa của hai lối nét được bài viết nhắc đến, không phải sao chép kỹ thuật vẽ trên gốm.
  - Dùng vàng ấm cho đường viền và điểm nhấn theo bảng màu thương hiệu. Các khoang mây dùng gradient kem/tan với `stop-opacity` 0.72–0.94 để tạo chiều sâu; cấu trúc mây là diễn giải trang trí đương đại.

---

### Nguồn 3: Trung tâm Bảo tồn Di sản Thăng Long - Hà Nội

- **Tiêu đề trang**: _Gạch hình vuông trang trí hoa sen và cá sấu trong sóng nước - Hoàng thành Thăng Long_
- **Đơn vị phát hành**: Trung tâm Bảo tồn Di sản Thăng Long - Hà Nội
- **Địa chỉ URL**: https://hoangthanhthanglong.vn/gach-hinh-vuong-trang-tri-hoa-sen-va-ca-sau-trong-song-nuoc/
- **Dữ kiện lịch sử nguồn xác nhận**:
  - Trang giới thiệu viên gạch vuông bằng đất nung thời Đại La (thế kỷ VII–IX), trang trí cá sấu giữa sóng nước cùng họa tiết hoa sen.
  - Đây là tư liệu về một hiện vật cụ thể; nội dung này hỗ trợ lựa chọn nhịp cong lấy cảm hứng từ sóng nước và hoa sen, nhưng không xác nhận hình mây trong SVG là bản sao của hoa văn cổ.
- **Quyết định tạo hình hiện đại cho Hà Thành Vị**:
  - Chuyển hóa đường lượn mềm mại của sóng nước thành đường cong hữu cơ bên trong của panel góc trái (`organic curved inner edge`), ôm trọn đóa sen mà không sử dụng đường cắt góc vuông cơ học.
  - Đóa sen đỏ cam được bố trí ngậm góc nghiêng tự nhiên, tạo điểm neo thị giác đầm ấm, thể hiện tinh thần trang nhã của thương hiệu ẩm thực quà tặng Hà Nội.

---

### Giới hạn xác minh

- URL cũ có tiêu đề _"Sen trên cổ vật"_ (`https://baotanglichsu.vn/vi/Articles/3097/16912/sen-tren-co-vat.html`) hiện hiển thị một bài viết khác về Đại tướng Lê Trọng Tấn, nên đã loại khỏi danh sách nguồn.
- Trang VNFAM được dùng làm bối cảnh Đại Việt/Thăng Long và Phật giáo; phần mô tả không được dùng để khẳng định chi tiết hoa văn cụ thể.
- Họa tiết mây cuộn trong SVG là cách diễn giải đồ họa mới, không được khẳng định là phục dựng chính xác một mẫu mây hay phong cách triều đại cụ thể.

---

## 2. Đặc tả tài nguyên vector hoàn thiện

Hai tài sản đồ họa vector độc lập dùng hệ màu tham chiếu hiện có của thương hiệu Hà Thành Vị (đỏ trầm `#791f2a`, nâu `#461f21`, vàng `#c38a36`, kem `#fbf5e9`):

- `frontend/public/brand/decor/header-left-lotus.svg` (viewBox 112 × 112):
  - **Mảng góc**: Panel màu burgundy sẫm (`#461F21`) xuất phát từ góc đỉnh `(0, 0)` lượn sóng hữu cơ vào trong, viền đường chỉ vàng kim (`#C38A36`) cùng nét đứt thanh mảnh tạo cảm giác viền lụa truyền thống.
  - **Đóa sen nở rộ**: Đóa hoa sen lớn nhiều tầng cánh đan xen (từ đỏ sẫm `#7D1D27` ở lớp sau đến san hô ấm `#B74737` và đỏ cam `#E2654F` ở lớp trước), có đường viền vàng kim sắc nét (`stroke-width: 1.35–1.45px`) và hệ thống gân kem (`#FBF5E9`, `opacity: 0.9`) vẽ tỉ mỉ để giữ độ rõ nét ở kích thước nhỏ.
  - **Tâm hoa, cuống & lá**: Tâm hoa vàng (`#E2B25E`) chấm nhị hổ phách (`#8C5E1E`), cuống hoa vàng uốn cong tự nhiên có gai nhọn, nâng đỡ bởi 4 phiến lá ô liu trầm (`#586746` đến `#64754F`) viền vàng có gân lá.
  - **Điểm xuyết**: Ngôi sao vàng 4 cánh lấp lánh nổi bật trên nền burgundy.

- `frontend/public/brand/decor/header-right-cloud.svg` (viewBox 120 × 112):
  - **Bố cục mây cuộn**: Cụm đường xoắn trang trí xếp lớp bất đối xứng theo phương đứng, crop phẳng tại mép phải `x=120`. Đây là họa tiết đương đại lấy cảm hứng từ nhịp mây/nước trong tư liệu gốm được dẫn ở trên, không phải bản phục dựng một mẫu cổ cụ thể.
  - **Đường nét & mảng hình**: Đường viền vàng ấm dứt khoát (`stroke-width: 1.5–1.8px`) định hình các thùy mây cuộn tròn đầy đặn (loại bỏ hoàn toàn các vòng lặp chữ C đơn điệu).
  - **Độ sâu thị giác**: Các khoang mây dùng gradient kem/tan bán trong suốt (các `stop-opacity` từ `0.72` đến `0.94`) tạo lớp màu mềm; tâm xoáy điểm xuyết đỏ burgundy (`#791F2A`), có viền sáng màu kem và các hạt vàng rải rác.

---

## 3. Quy chuẩn bố cục, vùng an toàn và khả năng tiếp cận

### Bố cục & Vùng an toàn (Responsive Safe Area)

- **Desktop (chiều cao 112px, màn hình từ 1280px)**:
  - Họa tiết bám sát hai mép và vừa chiều cao bên trong header, trừ 1px cho đường viền. `background-size: auto 100%` giữ đúng tỉ lệ riêng của hai SVG; vùng hoa sen rộng 112px và vùng mây rộng 120px.
  - Khoảng đệm trái tối thiểu 132px, phải tối thiểu 140px bảo đảm vùng trang trí cách logo và cụm nút ít nhất 20px. Menu giữ nguyên nội dung và vùng chạm.
  - Từ 1600px, giữ vùng nội dung giữa rộng tối đa 1300px theo bố cục header hiện có.
- **Màn hình dưới 1280px**:
  - Ẩn cả hai họa tiết. Header hiện chuyển breakpoint menu ở 850px và giảm chiều cao còn 86px ở 640px; giữ khoảng trống cho logo, menu mobile và cụm nút mà không đổi kích thước vùng chạm.
  - Đã kiểm tra bố cục trên trang chạy tại các độ rộng 390, 850, 1100, 1279, 1280 và 1920px; không có tràn ngang. Nếu sau này thay breakpoint, đo lại khoảng cách tối thiểu 20px giữa họa tiết, logo và nút trước khi bật trang trí.

### Tính dễ đọc & Xếp tầng (Layering & Readability)

- **Tầng hiển thị (`z-index`)**: Họa tiết dùng pseudo-element CSS ở lớp nền (`z-index: 0`); logo, menu và cụm nút là flex item ở lớp trên (`z-index: 1`). Dropdown giữ lớp hiển thị hiện có.
- **Màu sắc & Tương phản**: Nền mây bán trong suốt và đường nét vàng trầm hòa quyện cùng nền kem `#fbf5e9ed`, không gây nhiễu thị giác khi cuộn trang sticky.

### Khả năng tiếp cận & Chống phân tâm (Accessibility & No Motion)

- **Thuộc tính trang trí**: Bắt buộc gắn `aria-hidden="true"` (nếu nhúng inline SVG) hoặc `alt=""` (nếu dùng thẻ `<img>`).
- **Tương tác chuột/chạm**: Thiết lập `pointer-events: none` trên toàn bộ vùng trang trí để không cản trở sự kiện click/touch.
- **Tĩnh tuyệt đối (No Motion)**: File SVG không chứa mã animation, CSS keyframe hay kịch bản tương tác; tĩnh hoàn toàn, tuân thủ nguyên tắc giảm chuyển động cho người dùng (`prefers-reduced-motion`).

---

_Tích hợp và căn chỉnh nằm trong `frontend/src/layouts/public-shell.css`. Hai SVG, JSX, các luồng điều hướng, tài khoản, giỏ hàng và backend được giữ nguyên trong lần căn chỉnh này._
