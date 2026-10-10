import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Plus, Search, Star, X } from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { priceLabel } from '../utils/format';
import { ProductArt, ProductCard } from '../components/ProductCard';
import { ProductIngredients } from '../components/ProductIngredients';
import { customerApi, type ProductReview } from '../services/customerApi';
import { NotFound } from './Editorial';
import './products-public.css';

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
    <div className="public-products-page">
      <section className="public-collection-hero" aria-labelledby="collection-title">
        <div className="public-collection-copy">
          <p className="eyebrow public-collection-eyebrow">BỘ SƯU TẬP THỨC QUÀ</p>
          <h1 id="collection-title">
            Một chút Hà{' '}Nội,
            <br />
            <em>gửi đến bạn.</em>
          </h1>
          <p className="public-collection-intro">
            Từ túi bánh thân quen đến hộp quà ý nhị. Chọn hương vị cho mình, chọn niềm vui cho người
            thương.
          </p>
          <div className="public-collection-footer">
            <a className="button public-collection-cta" href="#danh-sach-san-pham">
              Khám phá thức quà <ArrowDown size={17} aria-hidden="true" />
            </a>
            <span className="public-collection-signature">
              <img src="/brand/ornament.webp" alt="" />
              <span>
                <strong>Hà Thành Vị</strong>
                <small>Chọn một thức quà vừa ý</small>
              </span>
            </span>
          </div>
        </div>
        <div className="public-collection-visual" role="group" aria-label="Gợi ý từ bộ sưu tập">
          {products[0] ? (
            <Link
              className="public-collection-feature"
              to={'/san-pham/' + products[0].slug}
              aria-label={'Khám phá ' + products[0].name}
            >
              <ProductArt product={products[0]} />
              <span className="public-collection-stamp" aria-hidden="true">
                <img src="/brand/ornament.webp" alt="" />
                <small>HÀ NỘI</small>
              </span>
              <span className="public-collection-caption">
                <span className="eyebrow">GỢI Ý TỪ BỘ SƯU TẬP</span>
                <strong>{products[0].name}</strong>
                <span className="public-collection-price">
                  {priceLabel(products[0].price)} <ArrowRight size={16} aria-hidden="true" />
                </span>
              </span>
            </Link>
          ) : (
            <img className="public-collection-ornament" src="/brand/ornament.webp" alt="" />
          )}
          <span className="public-collection-orbit" aria-hidden="true" />
        </div>
      </section>

      <section
        className="section products-section public-catalog"
        id="danh-sach-san-pham"
        aria-labelledby="public-catalog-title"
      >
        <header className="public-catalog-heading">
          <div>
            <p className="eyebrow">THỨC QUÀ TỪ HÀ NỘI</p>
            <h2 id="public-catalog-title">
              Chọn món quà <em>vừa ý.</em>
            </h2>
          </div>
          <p>Tìm một hương vị cho mình, hay một món quà gửi người thương.</p>
        </header>

        <div className="catalog-toolbar public-catalog-toolbar">
          <div
            className="filters public-filter-list"
            role="group"
            aria-label="Lọc sản phẩm theo nhóm"
          >
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
          <label className="catalog-search public-catalog-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Tìm trong bộ sưu tập"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm thức quà của bạn"
            />
            {query && (
              <button
                className="public-search-clear"
                type="button"
                aria-label="Xóa nội dung tìm kiếm"
                onClick={() => setQuery('')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>
        <div className="public-results-line">
          <p className="result-count" aria-live="polite">
            {filtered.length} thức quà dành cho bạn
          </p>
          <span>{products.length} sản phẩm trong bộ sưu tập</span>
        </div>
        <div
          className="product-grid public-product-grid"
          role="region"
          aria-label="Danh sách sản phẩm"
        >
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {!filtered.length && (
          <div className="empty-state public-empty-state" role="status">
            <span className="eyebrow">THỬ MỘT LỰA CHỌN KHÁC</span>
            <h2>Chưa tìm thấy thức quà phù hợp</h2>
            <p>Thử một tên khác hoặc xem lại toàn bộ bộ sưu tập nhé.</p>
            <button
              className="button public-reset-button"
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
    </div>
  );
}

export function ProductDetail() {
  const { slug } = useParams();
  const {
    content: { products, site, ingredients = [] },
    cart,
    add,
  } = useShop();
  const product = products.find((p) => p.slug === slug);
  if (!product) return <NotFound />;
  const quantity = cart.find((item) => item.productId === product.id)?.quantity || 0;
  return (
    <div className="section detail-section public-product-detail">
      <nav className="breadcrumbs" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/san-pham">Sản phẩm</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>
      <div className="detail-grid public-detail-hero">
        <ProductArt product={product} priority />
        <div className="detail-copy">
          <p className="eyebrow">
            {product.category === 'qua-tang'
              ? 'MÓN QUÀ MANG HƠI THỞ HÀ NỘI'
              : 'THỨC QUÀ CHO MỖI NGÀY'}
          </p>
          <h1>{product.name}</h1>
          {product.tagline && <p className="product-tagline">{product.tagline}</p>}
          <p className="detail-price">{priceLabel(product.price)}</p>
          <p>{product.description}</p>
          <dl>
            <div>
              <dt>Khối lượng</dt>
              <dd>{product.weight}</dd>
            </div>
            <div>
              <dt>Đóng gói</dt>
              <dd>{product.packaging || 'Đang cập nhật quy cách đóng gói'}</dd>
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
            Thành phần, thông tin dị ứng, bảo quản, hạn sử dụng và giá bán sẽ được xác nhận khi tư
            vấn.
          </p>
        </div>
      </div>
      <ProductIngredients product={product} ingredients={ingredients} />
      <VerifiedReviews productId={product.id} />
      <div className="section-heading related-heading public-related-heading">
        <h2>
          Có thể bạn cũng <em>thích.</em>
        </h2>
      </div>
      <div className="product-grid public-related-grid">
        {products
          .filter((p) => p.id !== product.id)
          .slice(0, 3)
          .map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
      </div>
    </div>
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
    <section className="product-reviews public-product-reviews">
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
