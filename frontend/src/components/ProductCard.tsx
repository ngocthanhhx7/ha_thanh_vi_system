import { priceLabel } from '../utils/format';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type Product } from '../constants/catalog';
import { useShop } from '../hooks/useShop';
export function ProductArt({ product }: { product: Product }) {
  return (
    <div className={'product-art ' + (product.category === 'qua-tang' ? 'gift-art' : 'pastry-art')}>
      <img
        src={product.image}
        alt={
          product.category === 'qua-tang'
            ? 'Minh họa nhận diện cho ' + product.name
            : 'Ảnh bánh minh họa ý tưởng, không phải ảnh sản phẩm thực tế'
        }
        loading="lazy"
        width="700"
        height="700"
      />
      {product.category === 'qua-tang' && <span className="gift-ribbon" aria-hidden="true" />}
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const { cart, add } = useShop();
  const active = cart.some((item) => item.productId === product.id);
  return (
    <article className="product-card">
      <Link
        to={'/san-pham/' + product.slug}
        className="product-image-link"
        aria-label={'Xem ' + product.name}
      >
        <ProductArt product={product} />
        <span className="product-tag">
          {product.category === 'qua-tang' ? 'TRAO GỬI YÊU THƯƠNG' : product.flavor.toUpperCase()}
        </span>
      </Link>
      <div className="product-info">
        <span className="eyebrow">{product.weight}</span>
        <h3>
          <Link to={'/san-pham/' + product.slug}>{product.name}</Link>
        </h3>
        <div className="product-bottom">
          <span>{priceLabel(product.price)}</span>
          <button
            className={'round-button ' + (active ? 'selected' : '')}
            aria-label={'Thêm vào giỏ ' + product.name}
            disabled={product.price === null}
            onClick={() => add(product.id)}
          >
            <Plus size={19} />
          </button>
        </div>
      </div>
    </article>
  );
}
export function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={19} />
    </Link>
  );
}
