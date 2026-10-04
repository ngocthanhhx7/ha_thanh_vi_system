import { Link } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { priceLabel } from '../utils/format';
import { pricingNotice } from '../constants/commerce';
import { brandAssets } from '../assets/brand';
export function CartContents({ checkoutLink = true }: { checkoutLink?: boolean }) {
  const {
    cart,
    content: { products },
    setQuantity,
  } = useShop();
  const subtotal = cart.reduce(
    (total, item) =>
      total + (products.find((p) => p.id === item.productId)?.price || 0) * item.quantity,
    0,
  );
  if (!cart.length)
    return (
      <div className="empty-cart">
        <img src={brandAssets.artisan} alt="" />
        <h3>Chưa có thức quà nào</h3>
        <p>Chọn một món ngon để gửi thương yêu.</p>
        <Link className="button" to="/san-pham">
          Khám phá sản phẩm
        </Link>
      </div>
    );
  return (
    <>
      <div className="cart-lines">
        {cart.map((item) => {
          const p = products.find((product) => product.id === item.productId);
          return (
            <div className="saved-row cart-line" key={item.productId}>
              {p && <img src={p.image} alt="" width="64" height="64" />}
              <div className="cart-line-info">
                <strong>{p?.name || 'Sản phẩm không còn trong danh mục'}</strong>
                <small>{p ? priceLabel(p.price) : 'Vui lòng xóa để tiếp tục'}</small>
                <div className="quantity-control">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={'Giảm số lượng ' + (p?.name || item.productId)}
                    disabled={item.quantity <= 1}
                    onClick={() => setQuantity(item.productId, item.quantity - 1)}
                  >
                    <Minus size={16} />
                  </button>
                  <output aria-label={'Số lượng ' + (p?.name || item.productId)}>
                    {item.quantity}
                  </output>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={'Tăng số lượng ' + (p?.name || item.productId)}
                    disabled={item.quantity >= 99}
                    onClick={() => setQuantity(item.productId, item.quantity + 1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <strong>
                {p ? priceLabel(p.price === null ? null : p.price * item.quantity) : '—'}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label={'Xóa ' + (p?.name || item.productId)}
                onClick={() => setQuantity(item.productId, 0)}
              >
                <X size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="cart-subtotal">
        <span>Tạm tính</span>
        <strong>{priceLabel(subtotal)}</strong>
      </p>
      <p className="fine-print">{pricingNotice} Phí giao hàng được tính tại bước thanh toán.</p>
      {checkoutLink && (
        <Link className="button full" to="/thanh-toan">
          Tiến hành đặt hàng
        </Link>
      )}
    </>
  );
}
