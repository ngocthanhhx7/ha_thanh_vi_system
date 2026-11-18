import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
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
  const [edges, setEdges] = useState({ start: true, end: false });

  function updateEdges(list: HTMLUListElement) {
    const start = list.scrollLeft <= 1;
    const end = list.scrollWidth - list.clientWidth - list.scrollLeft <= 1;
    setEdges((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  }

  function move(direction: -1 | 1) {
    const list = track.current;
    if (!list) return;
    const [first, second] = Array.from(list.children);
    const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    list.scrollBy({ left: direction * step });
  }

  return (
    <section className="home-reviews" aria-labelledby="home-reviews-title">
      <header className="home-reviews-header">
        <h2 id="home-reviews-title">
          Khách hàng nói gì về <em>Hà Thành Vị?</em>
        </h2>
        <div className="home-reviews-controls">
          <button
            type="button"
            aria-label="Đánh giá trước"
            aria-controls="home-reviews-list"
            aria-disabled={edges.start}
            onClick={() => !edges.start && move(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Đánh giá tiếp theo"
            aria-controls="home-reviews-list"
            aria-disabled={edges.end}
            onClick={() => !edges.end && move(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <ul
        id="home-reviews-list"
        className="home-reviews-list"
        role="list"
        aria-label="Sáu đánh giá"
        tabIndex={0}
        ref={track}
        onScroll={(event) => updateEdges(event.currentTarget)}
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
                <strong>{review.name}</strong>
                <span>{review.product}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="home-reviews-note">Tên và ảnh đại diện dùng để minh họa.</p>
    </section>
  );
}
