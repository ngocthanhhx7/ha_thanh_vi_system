import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import './home-reviews.css';

const reviews = [
  {
    id: 'traditional',
    name: 'Mai Anh',
    product: 'Bánh chả truyền thống',
    rating: 5,
    quote:
      'Bánh ăn khá giòn, thơm mùi lá chanh. Vị ngọt vừa với mình, không bị gắt. Mình hay ăn cùng trà nóng, thấy hợp phết.',
  },
  {
    id: 'chocolate',
    name: 'Minh Khang',
    product: 'Bánh chả socola trứng muối',
    rating: 5,
    quote:
      'Lúc đầu nghe bánh chả vị socola trứng muối cũng hơi lạ nên mua thử. Không ngờ ăn khá cuốn, có vị socola nhưng vẫn cảm nhận được vị bánh chả. Ai thích thử vị mới thì nên mua.',
  },
  {
    id: 'matcha',
    name: 'Khánh Linh',
    product: 'Bánh chả matcha trứng muối',
    rating: 4,
    quote:
      'Mình thích matcha nên đặt thử vị này. Bánh giòn, thơm nhẹ mùi trà xanh. Cá nhân mình thấy vị matcha hơi nhẹ, nhưng tổng thể vẫn ngon, không bị quá ngọt.',
  },
  {
    id: 'standard',
    name: 'Thu Hà',
    product: 'Bộ quà Nhã Sắc Hà Thành',
    rating: 5,
    quote:
      'Mua set này để tặng cô giáo. Hộp bên ngoài đẹp hơn mình nghĩ, màu đỏ nhìn khá sang. Bên trong có bánh với trà nên cũng dễ tặng, không phải mua thêm gì.',
  },
  {
    id: 'premium',
    name: 'Tuấn Minh',
    product: 'Bộ quà Nhã Vị Kinh Kỳ',
    rating: 5,
    quote:
      'Mình đặt hộp này để biếu đối tác. Ấn tượng nhất là phần hộp mở ra có hình Hà Nội xưa, nhìn khá độc đáo. Có thêm đĩa sứ nên cảm giác món quà được đầu tư, chỉ hơi lo lúc vận chuyển vì có đồ dễ vỡ.',
  },
  {
    id: 'shopping',
    name: 'Phương Thảo',
    product: 'Trải nghiệm mua hàng',
    rating: 4,
    quote:
      'Bánh đóng hũ nhìn xinh, dễ bảo quản. Mình mua cả ba vị để ăn thử, mỗi vị có cái hay riêng. Nếu có thêm lựa chọn hũ nhỏ hơn để thử nhiều vị thì tốt.',
  },
];

export function HomeReviews() {
  const track = useRef<HTMLUListElement>(null);
  const [activePage, setActivePage] = useState(0);
  const pageCount = Math.ceil(reviews.length / 2);

  function syncPage(list: HTMLUListElement) {
    const maxOffset = list.scrollWidth - list.clientWidth;
    if (maxOffset > 0) {
      setActivePage(Math.round((list.scrollLeft / maxOffset) * (pageCount - 1)));
    }
  }

  function goToPage(page: number) {
    const list = track.current;
    if (list)
      list.scrollTo({ left: ((list.scrollWidth - list.clientWidth) * page) / (pageCount - 1) });
  }

  return (
    <section className="home-reviews" aria-labelledby="home-reviews-title">
      <header className="home-reviews-header">
        <h2 id="home-reviews-title">
          Khách hàng nói gì về <em>Hà Thành Vị?</em>
        </h2>
      </header>
      <ul
        id="home-reviews-list"
        className="home-reviews-list"
        role="list"
        aria-label="Sáu đánh giá"
        tabIndex={0}
        ref={track}
        onScroll={(event) => syncPage(event.currentTarget)}
      >
        {reviews.map((review) => (
          <li className="home-review" key={review.id}>
            <div
              className="home-review-stars"
              role="img"
              aria-label={`${review.rating} trên 5 sao`}
            >
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  size={17}
                  fill={index < review.rating ? 'currentColor' : 'none'}
                  aria-hidden="true"
                />
              ))}
            </div>
            <blockquote>“{review.quote}”</blockquote>
            <div className="home-review-byline">
              <img
                src={`/brand/reviews/${review.id}.webp`}
                width="48"
                height="48"
                alt=""
                loading="lazy"
                decoding="async"
              />
              <div>
                <strong>
                  {review.name} <small>(minh họa)</small>
                </strong>
                <span>{review.product}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="home-reviews-pagination" role="group" aria-label="Chuyển nhóm đánh giá">
        {Array.from({ length: pageCount }, (_, page) => (
          <button
            key={page}
            type="button"
            aria-label={`Nhóm đánh giá ${page + 1} trên ${pageCount}`}
            aria-controls="home-reviews-list"
            aria-current={activePage === page ? 'true' : undefined}
            onClick={() => goToPage(page)}
          />
        ))}
      </div>
    </section>
  );
}
