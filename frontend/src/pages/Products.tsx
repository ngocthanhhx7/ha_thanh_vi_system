import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus, Search, Star } from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { priceLabel } from '../utils/format';
import { ProductArt, ProductCard } from '../components/ProductCard';
import { customerApi, type ProductReview } from '../services/customerApi';
import { NotFound } from './Editorial';
export function Products() {
  const {
    content: { products },
  } = useShop();
  const [params, setParams] = useSearchParams();
  const category = params.get('nhom') || 'all';
  const [query, setQuery] = useState('');
  const filtered = products.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (p.name + ' ' + p.flavor).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')),
  );
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">BỘ SƯU TẬP THỨC QUÀ</p>
        <h1>Một chút Hà Nội, gửi đến bạn.</h1>
        <p>
          Từ túi bánh thân quen đến hộp quà ý nhị.
          <br />
          Chọn hương vị cho mình, chọn niềm vui cho người thương.
        </p>
        <img src="/brand/ornament.webp" alt="" />
      </div>
      <section className="section products-section">
        <div className="catalog-toolbar">
          <div className="filters" aria-label="Lọc sản phẩm">
            {[
              ['all', 'Tất cả'],
              ['banh-cha', 'Bánh chả'],
              ['qua-tang', 'Quà tặng'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={category === key ? 'active' : ''}
                aria-pressed={category === key}
                onClick={() => setParams(key === 'all' ? {} : { nhom: key })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="catalog-search">
            <Search size={18} />
            <input
              aria-label="Tìm trong bộ sưu tập"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm thức quà của bạn"
            />
          </label>
        </div>
        <p className="result-count" aria-live="polite">
          {filtered.length} thức quà dành cho bạn
        </p>
        <div className="product-grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <h2>Chưa tìm thấy thức quà phù hợp</h2>
            <p>Thử một tên khác hoặc xem lại toàn bộ bộ sưu tập nhé.</p>
            <button
              className="button"
              onClick={() => {
                setQuery('');
                setParams({});
              }}
            >
              Xem tất cả
            </button>
          </div>
        )}
        <p className="fine-print">
          Giá tạm cho bản giới thiệu, sẽ được cập nhật trước khi mở bán chính thức. Hình ảnh minh
          họa ý tưởng.
        </p>
      </section>
    </>
  );
}
export function ProductDetail() {
  const { slug } = useParams();
  const {
    content: { products, site },
    cart,
    add,
  } = useShop();
  const product = products.find((p) => p.slug === slug);
  if (!product) return <NotFound />;
  const quantity = cart.find((item) => item.productId === product.id)?.quantity || 0;
  return (
    <section className="section detail-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/san-pham">Sản phẩm</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <div className="detail-grid">
        <ProductArt product={product} />
        <div className="detail-copy">
          <p className="eyebrow">
            {product.category === 'qua-tang'
              ? 'MÓN QUÀ MANG HƠI THỞ HÀ NỘI'
              : 'THỨC QUÀ CHO MỖI NGÀY'}
          </p>
          <h1>{product.name}</h1>
          <p className="detail-price">{priceLabel(product.price)}</p>
          <p>{product.description}</p>
          <dl>
            <div>
              <dt>Quy cách</dt>
              <dd>{product.weight}</dd>
            </div>
            <div>
              <dt>Hương vị</dt>
              <dd>{product.flavor}</dd>
            </div>
          </dl>
          <div className="detail-actions">
            <a className="button" href={site.zalo} target="_blank" rel="noreferrer">
              Tư vấn sản phẩm
              <ArrowRight size={18} />
            </a>
            <button
              className="button button-outline"
              disabled={product.price === null}
              onClick={() => add(product.id)}
            >
              <Plus size={18} /> Thêm vào giỏ{quantity > 0 ? ` (${quantity})` : null}
            </button>
          </div>
          <p className="fine-print">
            Hình minh họa. Thành phần, thông tin dị ứng, bảo quản, hạn sử dụng và giá bán sẽ được
            xác nhận khi tư vấn.
          </p>
        </div>
      </div>
      <VerifiedReviews productId={product.id} />
      <div className="section-heading related-heading">
        <h2>
          Có thể bạn cũng <em>thích.</em>
        </h2>
      </div>
      <div className="product-grid">
        {products
          .filter((p) => p.id !== product.id)
          .slice(0, 3)
          .map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
      </div>
    </section>
  );
}

function VerifiedReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReviews([]);
    customerApi
      .productReviews(productId)
      .then((result) => {
        if (active) setReviews(result.reviews);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Chưa tải được đánh giá.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId, revision]);
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  return (
    <section className="product-reviews">
      <div className="section-heading related-heading">
        <h2>
          Cảm nhận từ <em>người thương.</em>
        </h2>
      </div>
      <p>
        Đánh giá từ khách hàng có đơn đã giao.{' '}
        <Link to="/tai-khoan">Mở tài khoản để chia sẻ cảm nhận</Link>.
      </p>
      {loading ? (
        <p role="status">Đang tải đánh giá…</p>
      ) : error ? (
        <div role="alert" className="notice">
          <p>{error}</p>
          <button className="text-link" onClick={() => setRevision((value) => value + 1)}>
            Tải lại đánh giá
          </button>
        </div>
      ) : reviews.length ? (
        <>
          <p className="review-average">
            <Star size={20} fill="currentColor" /> {average.toFixed(1)}/5 · {reviews.length} đánh
            giá
          </p>
          <div className="review-grid">
            {reviews.map((review) => (
              <article className="review-card" key={review.id}>
                <header>
                  <strong>{review.authorName}</strong>
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                  </time>
                </header>
                <p className="review-stars" aria-label={review.rating + ' trên 5 sao'}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      size={16}
                      fill={value <= review.rating ? 'currentColor' : 'none'}
                    />
                  ))}
                </p>
                <span className="fine-print">Đã mua hàng</span>
                <p className="review-comment">{review.comment}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="notice">
          Sản phẩm chưa có đánh giá. Cảm nhận đầu tiên của bạn sẽ giúp người mua sau chọn quà.
        </p>
      )}
    </section>
  );
}
