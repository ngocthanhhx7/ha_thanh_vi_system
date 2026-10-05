import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CartContents } from '../components/CartContents';
import { useNotificationCenter } from '../components/NotificationCenter';
import { useShop } from '../hooks/useShop';
import { api } from '../services/api';
import { pricingNotice, type CommerceConfig, type Customer } from '../constants/commerce';
import { priceLabel } from '../utils/format';
import {
  customerApi,
  CustomerApiError,
  type Address,
  type CustomerUser,
  type VoucherWalletItem,
} from '../services/customerApi';
import { rememberOrder } from '../utils/orderSession';
import './commerce-public.css';

export function CartPage() {
  return (
    <section className="section commerce-page htv-commerce-public htv-commerce-cart">
      <header className="commerce-intro">
        <p className="eyebrow">THỨC QUÀ BẠN ĐÃ CHỌN</p>
        <h1>Giỏ hàng của bạn</h1>
        <p className="commerce-lead">Xem lại lựa chọn và điều chỉnh giỏ hàng trước khi đặt mua.</p>
        <ol className="commerce-steps" aria-label="Các bước đặt hàng">
          <li aria-current="step">
            <span>01</span>
            <span>Giỏ hàng</span>
          </li>
          <li>
            <span>02</span>
            <span>Thông tin nhận hàng</span>
          </li>
          <li>
            <span>03</span>
            <span>Theo dõi đơn hàng</span>
          </li>
        </ol>
      </header>
      <div className="commerce-panel commerce-cart-panel">
        <CartContents />
      </div>
    </section>
  );
}
export function Checkout() {
  const {
    cart,
    content: { products },
    clearCart,
  } = useShop();
  const navigate = useNavigate();
  const { notify } = useNotificationCenter();
  const [config, setConfig] = useState<CommerceConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [customer, setCustomer] = useState<Customer>({
    name: '',
    phone: '',
    email: '',
    address: '',
  });
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [vouchers, setVouchers] = useState<VoucherWalletItem[]>([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherQuote, setVoucherQuote] = useState<{
    code: string;
    discount: number;
    cart: string;
  } | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<'cod' | 'payos'>('cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let live = true;
    api
      .config()
      .then((value) => {
        if (live) {
          setConfig(value);
          if (!value.payments.cod && value.payments.payos) setMethod('payos');
        }
      })
      .catch(() => {
        if (live)
          setConfigError(
            'Đặt hàng hiện chưa sẵn sàng. Không thể tải cấu hình bán hàng; vui lòng thử lại sau hoặc liên hệ cửa hàng.',
          );
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    async function loadCustomer() {
      const { user: current } = await customerApi.me();
      if (!active) return;
      setUser(current);
      setCustomer((value) => ({
        ...value,
        name: current.name,
        phone: current.phone,
        email: current.email,
      }));
      const results = await Promise.allSettled([customerApi.addresses(), customerApi.vouchers()]);
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        const saved = results[0].value.addresses;
        setAddresses(saved);
        const selected = saved.find((item) => item.isDefault) || saved[0];
        if (selected) {
          setAddressId(selected.id);
          setCustomer({
            name: selected.name,
            phone: selected.phone,
            address: selected.address,
            email: current.email,
          });
        }
      } else
        setSessionError('Chưa tải được sổ địa chỉ. Bạn có thể nhập địa chỉ nhận hàng bên dưới.');
      if (results[1].status === 'fulfilled') setVouchers(results[1].value.vouchers);
      else setVoucherError('Chưa tải được ví ưu đãi. Bạn có thể thử mã ưu đãi trực tiếp.');
    }
    loadCustomer()
      .catch((reason) => {
        if (active && !(reason instanceof CustomerApiError && reason.status === 401))
          setSessionError(
            'Chưa xác minh được tài khoản. Vui lòng đăng nhập lại trước khi đặt đơn để lưu vào lịch sử.',
          );
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const cartSignature = JSON.stringify(cart);
  const appliedVoucher =
    voucherQuote?.cart === cartSignature && voucherQuote.code === voucherCode.trim().toUpperCase()
      ? voucherQuote
      : null;
  async function applyVoucher() {
    setVoucherBusy(true);
    setVoucherError('');
    setVoucherQuote(null);
    try {
      const result = await customerApi.quoteVoucher(voucherCode.trim(), cart);
      setVoucherQuote({ code: result.code, discount: result.discount, cart: cartSignature });
      setVoucherCode(result.code);
    } catch (reason) {
      setVoucherError(reason instanceof Error ? reason.message : 'Chưa thể áp dụng ưu đãi.');
    } finally {
      setVoucherBusy(false);
    }
  }
  const validCart =
    cart.length > 0 &&
    cart.every((item) => products.some((p) => p.id === item.productId && p.price !== null));
  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (products.find((p) => p.id === item.productId)?.price || 0) * item.quantity,
    0,
  );
  const shipping = config
    ? subtotal >= config.freeShippingThreshold
      ? 0
      : config.shippingFee
    : null;
  const canOrder = Boolean(
    config?.enabled && config.payments[method] && validCart && !sessionLoading && !voucherBusy,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canOrder) return;
    setBusy(true);
    setError('');
    const body = {
      items: cart,
      customer,
      note,
      consent,
      paymentMethod: method,
      ...(appliedVoucher ? { voucherCode: appliedVoucher.code } : {}),
    };
    const payload = JSON.stringify(body);
    if (!attempt.current || attempt.current.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await api.createOrder(body, attempt.current.key);
      if (!result.order?.id || (!result.accessToken && !user))
        throw new Error(
          'Phản hồi chưa đầy đủ. Vui lòng thử lại với thông tin giữ nguyên để tra lại đơn.',
        );
      rememberOrder(result.order.id, result.accessToken);
      clearCart();
      notify({
        title: 'Đặt hàng thành công',
        message: `Hà Thành Vị đã tiếp nhận đơn ${result.order.code}. Bạn có thể theo dõi trạng thái bất cứ lúc nào.`,
        href: '/don-hang/' + encodeURIComponent(result.order.id),
        actionLabel: 'Theo dõi đơn hàng',
        tone: 'success',
      });
      // Show the retrieval key before the guest chooses to leave for payOS.
      navigate('/don-hang/' + encodeURIComponent(result.order.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa tạo được đơn.');
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length) return <CartPage />;
  return (
    <section className="section commerce-page htv-commerce-public htv-checkout-page">
      <header className="commerce-intro">
        <p className="eyebrow">GỬI MỘT CHÚT HÀ NỘI ĐẾN BẠN</p>
        <h1>Thông tin đặt hàng</h1>
        <p className="commerce-lead">
          {user ? (
            `Đơn hàng sẽ được lưu trong tài khoản ${user.name}.`
          ) : (
            <>
              Mua hàng không cần tài khoản. Bạn sẽ nhận mã đơn và khóa tra cứu riêng.{' '}
              <Link to="/tai-khoan">Đăng nhập để lưu địa chỉ và đơn mua.</Link>
            </>
          )}
        </p>
        <ol className="commerce-steps" aria-label="Các bước đặt hàng">
          <li>
            <span>01</span>
            <span>Giỏ hàng</span>
          </li>
          <li aria-current="step">
            <span>02</span>
            <span>Thông tin nhận hàng</span>
          </li>
          <li>
            <span>03</span>
            <span>Theo dõi đơn hàng</span>
          </li>
        </ol>
      </header>
      <div className="commerce-feedback">
        {sessionLoading && <p role="status">Đang tải thông tin người nhận…</p>}
        {sessionError && (
          <p className="form-status" role="alert">
            {sessionError} <Link to="/tai-khoan">Mở tài khoản</Link>
          </p>
        )}
        <p className="notice">{config?.pricingNotice || pricingNotice}</p>
        {configError && (
          <p className="form-status" role="alert">
            {configError}
          </p>
        )}
        {config && !config.enabled && (
          <p className="form-status" role="alert">
            Cửa hàng đang chuẩn bị mở bán. Chưa thể tiếp nhận đơn hàng trực tuyến.
          </p>
        )}
      </div>
      <div className="checkout-grid">
        <form onSubmit={submit} className="checkout-form commerce-panel">
          <fieldset disabled={busy || sessionLoading}>
            <legend>1. Người nhận và địa chỉ</legend>
            {user && addresses.length > 0 && (
              <label className="field">
                Chọn địa chỉ đã lưu
                <select
                  value={addressId}
                  onChange={(event) => {
                    const selected = addresses.find((item) => item.id === event.target.value);
                    setAddressId(event.target.value);
                    if (selected)
                      setCustomer({
                        name: selected.name,
                        phone: selected.phone,
                        address: selected.address,
                        email: user.email,
                      });
                  }}
                >
                  <option value="">Nhập địa chỉ khác</option>
                  {addresses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.isDefault ? ' · Mặc định' : ''} · {item.name} · {item.phone}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {user && (
              <p className="fine-print">
                <Link to="/tai-khoan">Quản lý sổ địa chỉ</Link>. Chỉnh sửa thông tin bên dưới chỉ áp
                dụng cho đơn này.
              </p>
            )}
            {(['name', 'phone', 'email', 'address'] as const).map((key) => (
              <label key={key} className="field">
                {
                  {
                    name: 'Họ và tên người nhận',
                    phone: 'Số điện thoại nhận hàng',
                    email: 'Email nhận thông tin',
                    address: 'Địa chỉ giao hàng đầy đủ',
                  }[key]
                }
                <input
                  required
                  type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                  autoComplete={
                    { name: 'name', phone: 'tel', email: 'email', address: 'street-address' }[key]
                  }
                  minLength={key === 'address' ? 10 : key === 'name' ? 2 : undefined}
                  maxLength={key === 'address' ? 500 : key === 'phone' ? 20 : 254}
                  value={customer[key]}
                  onChange={(event) => {
                    setCustomer({ ...customer, [key]: event.target.value });
                    setAddressId('');
                  }}
                />
              </label>
            ))}
            <label className="field">
              Lời nhắn cho đơn hàng
              <textarea
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </fieldset>
          <fieldset disabled={busy || sessionLoading}>
            <legend>2. Phương thức thanh toán</legend>
            <label className="payment-option">
              <input
                type="radio"
                name="payment"
                checked={method === 'cod'}
                disabled={!config?.payments.cod}
                onChange={() => setMethod('cod')}
              />
              <span>
                <strong>Thanh toán khi nhận hàng (COD)</strong>
                <small>Thanh toán cho người giao hàng khi nhận sản phẩm.</small>
              </span>
            </label>
            <label className="payment-option">
              <input
                type="radio"
                name="payment"
                checked={method === 'payos'}
                disabled={!config?.payments.payos}
                onChange={() => setMethod('payos')}
              />
              <span>
                <strong>Chuyển khoản VietQR qua payOS</strong>
                <small>
                  {config?.payments.payos
                    ? 'Mở trang thanh toán bảo mật sau khi tạo đơn.'
                    : 'Chưa khả dụng. Cửa hàng chưa kích hoạt cổng thanh toán.'}
                </small>
              </span>
            </label>
          </fieldset>
          {user && (
            <fieldset disabled={busy || voucherBusy}>
              <legend>3. Ưu đãi của bạn</legend>
              {vouchers.some((item) => item.status === 'available') && (
                <label className="field">
                  Chọn từ ví ưu đãi
                  <select
                    value={vouchers.some((item) => item.code === voucherCode) ? voucherCode : ''}
                    onChange={(event) => {
                      setVoucherCode(event.target.value);
                      setVoucherQuote(null);
                      setVoucherError('');
                    }}
                  >
                    <option value="">Chọn ưu đãi</option>
                    {vouchers
                      .filter((item) => item.status === 'available')
                      .map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.name} · {item.code}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="field">
                Mã ưu đãi
                <input
                  value={voucherCode}
                  maxLength={50}
                  onChange={(event) => {
                    setVoucherCode(event.target.value);
                    setVoucherQuote(null);
                    setVoucherError('');
                  }}
                  placeholder="Nhập mã ưu đãi"
                />
              </label>
              <button
                type="button"
                className="button button-outline"
                disabled={!voucherCode.trim() || !validCart}
                onClick={() => void applyVoucher()}
              >
                {voucherBusy ? 'Đang kiểm tra…' : 'Áp dụng ưu đãi'}
              </button>
              {appliedVoucher && (
                <p role="status">
                  Đã áp dụng {appliedVoucher.code}: giảm {priceLabel(appliedVoucher.discount)}.
                </p>
              )}
              {voucherCode && !appliedVoucher && (
                <p className="fine-print">Bấm áp dụng để kiểm tra mã với giỏ hàng hiện tại.</p>
              )}
              {voucherError && (
                <p role="alert" className="form-status">
                  {voucherError}
                </p>
              )}
            </fieldset>
          )}
          <label className="consent">
            <input
              required
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Tôi đã kiểm tra đơn hàng và đồng ý để Hà Thành Vị sử dụng thông tin này để xử lý, giao
            hàng và liên hệ về đơn hàng.
          </label>
          <p className="fine-print">
            Bạn có thể hủy đơn COD khi đang chờ xác nhận. Với đơn chuyển khoản, liên hệ cửa hàng để
            được hỗ trợ thay đổi hoặc hoàn tiền.
          </p>
          {error && (
            <p className="form-status" role="alert">
              {error} Thông tin và giỏ hàng vẫn được giữ lại.
            </p>
          )}
          <button className="button full" disabled={busy || !canOrder}>
            {busy ? 'Đang tạo đơn…' : 'Xác nhận đặt hàng'}
          </button>
          {!config && !configError && <p role="status">Đang kiểm tra khả năng đặt hàng…</p>}
        </form>
        <aside className="checkout-summary commerce-panel">
          <h2>Kiểm tra thức quà</h2>
          <CartContents checkoutLink={false} />
          {!validCart && (
            <p role="alert">
              Có sản phẩm chưa có giá hoặc đã ngừng bán. Vui lòng xóa sản phẩm đó khỏi giỏ.
            </p>
          )}
          <dl className="order-totals">
            <div>
              <dt>Phí giao hàng</dt>
              <dd>
                {shipping === null
                  ? 'Đang xác nhận'
                  : shipping === 0
                    ? 'Miễn phí'
                    : priceLabel(shipping)}
              </dd>
            </div>
            {appliedVoucher && (
              <div>
                <dt>Ưu đãi {appliedVoucher.code}</dt>
                <dd>−{priceLabel(appliedVoucher.discount)}</dd>
              </div>
            )}
            <div className="grand-total">
              <dt>Tổng dự kiến</dt>
              <dd>
                {shipping === null
                  ? '—'
                  : priceLabel(subtotal + shipping - (appliedVoucher?.discount || 0))}
              </dd>
            </div>
          </dl>
          <p className="fine-print">
            {config ? `Miễn phí giao hàng từ ${priceLabel(config.freeShippingThreshold)}. ` : ''}Giá
            và phí cuối cùng được hệ thống xác nhận khi tạo đơn.
          </p>
          <Link className="text-link" to="/san-pham">
            ← Chọn thêm sản phẩm
          </Link>
        </aside>
      </div>
    </section>
  );
}
