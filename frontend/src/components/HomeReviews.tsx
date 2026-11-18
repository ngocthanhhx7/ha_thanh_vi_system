import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Star } from 'lucide-react';
import './home-reviews.css';

const reviews = [
  {
    id: 'traditional',
    product: 'Bánh chả truyền thống',
    rating: 5,
    quote:
      'Bánh ăn khá giòn, thơm mùi lá chanh. Vị ngọt vừa với mình, không bị gắt. Mình hay ăn cùng trà nóng, thấy hợp phết.',
  },
  {
    id: 'chocolate',
    product: 'Bánh chả socola trứng muối',
    rating: 5,
    quote:
      'Lúc đầu nghe bánh chả vị socola trứng muối cũng hơi lạ nên mua thử. Không ngờ ăn khá cuốn, có vị socola nhưng vẫn cảm nhận được vị bánh chả. Ai thích thử vị mới thì nên mua.',
  },
  {
    id: 'matcha',
    product: 'Bánh chả matcha trứng muối',
    rating: 4,
    quote:
      'Mình thích matcha nên đặt thử vị này. Bánh giòn, thơm nhẹ mùi trà xanh. Cá nhân mình thấy vị matcha hơi nhẹ, nhưng tổng thể vẫn ngon, không bị quá ngọt.',
  },
  {
    id: 'standard',
    product: 'Bộ quà Nhã Sắc Hà Thành',
    rating: 5,
    quote:
      'Mua set này để tặng cô giáo. Hộp bên ngoài đẹp hơn mình nghĩ, màu đỏ nhìn khá sang. Bên trong có bánh với trà nên cũng dễ tặng, không phải mua thêm gì.',
  },
  {
    id: 'premium',
    product: 'Bộ quà Nhã Vị Kinh Kỳ',
    rating: 5,
    quote:
      'Mình đặt hộp này để biếu đối tác. Ấn tượng nhất là phần hộp mở ra có hình Hà Nội xưa, nhìn khá độc đáo. Có thêm đĩa sứ nên cảm giác món quà được đầu tư, chỉ hơi lo lúc vận chuyển vì có đồ dễ vỡ.',
  },
  {
    id: 'shopping',
    product: 'Trải nghiệm mua hàng',
    rating: 4,
    quote:
      'Bánh đóng hũ nhìn xinh, dễ bảo quản. Mình mua cả ba vị để ăn thử, mỗi vị có cái hay riêng. Nếu có thêm lựa chọn hũ nhỏ hơn để thử nhiều vị thì tốt.',
  },
];

export function HomeReviews() {
  const drag = useRef<{ pointer: number; x: number; scrollLeft: number } | null>(null);

  function startDrag(event: PointerEvent<HTMLUListElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const list = event.currentTarget;
    event.preventDefault();
    list.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, scrollLeft: list.scrollLeft };
    list.classList.add('is-dragging');
  }

  function moveDrag(event: PointerEvent<HTMLUListElement>) {
    const start = drag.current;
    if (start?.pointer !== event.pointerId) return;
    event.currentTarget.scrollLeft = start.scrollLeft + start.x - event.clientX;
  }

  function finishDrag(event: PointerEvent<HTMLUListElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.classList.remove('is-dragging');
  }

  function scrollWithKeyboard(event: KeyboardEvent<HTMLUListElement>) {
    const list = event.currentTarget;
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      list.scrollTo({ left: event.key === 'Home' ? 0 : list.scrollWidth });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const [first, second] = list.children;
      const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      list.scrollBy({ left: event.key === 'ArrowLeft' ? -step : step });
    }
  }

  return (
    <section className="home-reviews" aria-labelledby="home-reviews-title">
      <header className="home-reviews-header">
        <h2 id="home-reviews-title">
          Khách hàng nói gì về <em>Hà Thành Vị?</em>
        </h2>
      </header>
      <ul
        className="home-reviews-list"
        role="list"
        aria-label="Sáu đánh giá"
        tabIndex={0}
        onKeyDown={scrollWithKeyboard}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
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
                draggable={false}
              />
              <strong>{review.product}</strong>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
