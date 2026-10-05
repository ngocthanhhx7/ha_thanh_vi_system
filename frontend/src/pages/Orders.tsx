import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { orderStatuses, paymentStatuses, type Order } from '../constants/commerce';
import { priceLabel } from '../utils/format';
import { lastOrderId, orderToken, paymentDestination, rememberOrder } from '../utils/orderSession';
import './commerce-public.css';

export function OrderSummary({ order }: { order: Order }) {
  return (
    <>
      <div className="order-badges">
        <span>{orderStatuses[order.status] || order.status}</span>
        <span>{paymentStatuses[order.paymentStatus] || order.paymentStatus}</span>
      </div>
      <div className="order-lines">
        {order.items.map((item) => (
          <div className="order-line" key={item.productId}>
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.quantity} × {priceLabel(item.unitPrice)}
              </small>
            </div>
            <strong>{priceLabel(item.unitPrice * item.quantity)}</strong>
          </div>
        ))}
      </div>
      <dl className="order-totals">
        <div>
          <dt>Tạm tính</dt>
          <dd>{priceLabel(order.subtotal)}</dd>
        </div>
        <div>
          <dt>Giao hàng</dt>
          <dd>{priceLabel(order.shippingFee)}</dd>
        </div>
        {Boolean(order.discount) && (
          <div>
            <dt>Ưu đãi {order.voucherCode}</dt>
            <dd>−{priceLabel(order.discount || 0)}</dd>
          </div>
        )}
        <div className="grand-total">
          <dt>Tổng cộng</dt>
          <dd>{priceLabel(order.total)}</dd>
        </div>
      </dl>
      <h3>Thông tin nhận hàng</h3>
      <p>
        {order.customer.name} · {order.customer.phone}
        <br />
        {order.customer.address}
      </p>
      <p>
        {order.paymentMethod === 'cod'
          ? 'Thanh toán khi nhận hàng (COD)'
          : 'Chuyển khoản VietQR qua payOS'}
      </p>
      {order.paymentStatus === 'refund_pending' && (
        <p className="notice">
          Cửa hàng đang đối soát hoàn tiền. Liên hệ cửa hàng để xác nhận số tiền và thời gian xử lý.
        </p>
      )}
      {order.paymentStatus === 'refunded' && (
        <p className="notice">Cửa hàng đã ghi nhận hoàn tiền sau khi đối soát giao dịch thực tế.</p>
      )}
      {order.note && <p>Lời nhắn: {order.note}</p>}
      {order.carrier && (
        <p>
          <strong>Đơn vị vận chuyển:</strong> {order.carrier}
        </p>
      )}
      {order.trackingNumber && (
        <p>
          <strong>Mã vận đơn:</strong> {order.trackingNumber}
        </p>
      )}
      {order.shippingEvents && order.shippingEvents.length > 0 && (
        <section className="shipping-timeline">
          <h3>Hành trình giao hàng</h3>
          <ol>
            {order.shippingEvents.map((event, index) => (
              <li key={event.occurredAt + index}>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString('vi-VN')}
                </time>
                <strong>{orderStatuses[event.status] || event.status}</strong>
                <p>
                  {event.description}
                  {event.location ? ` · ${event.location}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
export function OrderPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fragmentToken = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const emailToken = /^[a-f\d]{64}$/i.test(fragmentToken) ? fragmentToken : '';
  const token = emailToken || orderToken(id);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (!emailToken) return;
    rememberOrder(id, emailToken);
    navigate(location.pathname + location.search, { replace: true });
  }, [emailToken, id, location.pathname, location.search, navigate]);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setOrder(await api.order(id, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể tải đơn.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setOrder(null);
    setError('');
    setBusy(true);
    api
      .order(id, token)
      .then((result) => {
        if (active) setOrder(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Chưa thể tải đơn.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, token]);
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await api.cancel(id, token);
      setOrder(await api.order(id, token));
      setConfirmCancel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể hủy đơn.');
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError('');
    try {
      const result = await api.payment(id, token);
      window.location.assign(paymentDestination(result.paymentUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể mở trang thanh toán.');
      setBusy(false);
    }
  }
  return (
    <section className="section commerce-page order-page htv-commerce-public htv-order-page">
      <header className="commerce-intro">
        <p className="eyebrow">THỨC QUÀ ĐANG ĐƯỢC CHĂM CHÚT</p>
        <h1>{order ? 'Đơn hàng ' + order.code : 'Thông tin đơn hàng'}</h1>
        {order && (
          <p className="commerce-lead">
            Đơn đã được ghi nhận. Trạng thái thanh toán bên dưới được xác nhận từ hệ thống cửa hàng.
          </p>
        )}
      </header>
      {busy && !order && (
        <p className="commerce-loading" role="status">
          Đang tải đơn hàng…
        </p>
      )}
      {error && (
        <div className="form-status commerce-error" role="alert">
          <p>{error}</p>
          {!token && (
            <p>
              <Link to="/tai-khoan">Đăng nhập tài khoản sở hữu đơn</Link> hoặc{' '}
              <Link to="/tra-cuu-don-hang">nhập khóa tra cứu đơn mua</Link>.
            </p>
          )}
        </div>
      )}
      {order && (
        <div className="order-layout">
          <article className="commerce-panel order-summary-panel">
            <OrderSummary order={order} />
          </article>
          <aside className="order-side-column">
            {token && (
              <section className="commerce-panel retrieval-key">
                <p className="eyebrow">LƯU LẠI ĐỂ TRA CỨU</p>
                <h2>Khóa riêng của đơn hàng</h2>
                <p>
                  Lưu mã đơn và khóa riêng để tra cứu sau khi đóng trình duyệt. Không chia sẻ khóa
                  này công khai.
                </p>
                <label className="field">
                  Mã đơn / ID
                  <input readOnly value={order.id} onFocus={(e) => e.target.select()} />
                </label>
                <label className="field">
                  Khóa tra cứu
                  <input
                    readOnly
                    type={showKey ? 'text' : 'password'}
                    value={token}
                    autoComplete="off"
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button type="button" className="text-link" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Ẩn khóa' : 'Hiện khóa để lưu lại'}
                </button>
              </section>
            )}
            {order.paymentMethod === 'payos' &&
              order.paymentStatus === 'unpaid' &&
              !['cancelled', 'delivered', 'returned', 'return_requested'].includes(
                order.status,
              ) && (
                <section className="notice order-payment-panel">
                  <p>
                    Đơn này chưa được xác nhận thanh toán.{' '}
                    {token
                      ? 'Hãy giữ khóa tra cứu trước khi chuyển sang payOS.'
                      : 'Bạn có thể xem lại trạng thái trong tài khoản sau khi thanh toán.'}
                  </p>
                  <button className="button" disabled={busy} onClick={() => void pay()}>
                    Thanh toán VietQR qua payOS
                  </button>
                </section>
              )}
            <section className="commerce-panel order-action-panel">
              <div className="order-actions">
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  Cập nhật trạng thái
                </button>
                {order.paymentMethod === 'cod' &&
                  order.status === 'pending' &&
                  order.paymentStatus === 'unpaid' && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Hủy đơn hàng
                    </button>
                  )}
              </div>
              {confirmCancel && (
                <div className="notice order-cancel-confirmation">
                  <p>Bạn muốn hủy đơn hàng này? Đơn đã hủy sẽ không được giao.</p>
                  <button className="button" disabled={busy} onClick={() => void cancel()}>
                    Xác nhận hủy đơn
                  </button>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Giữ đơn hàng
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
      {!order && !busy && (
        <button className="button" onClick={() => void refresh()}>
          Thử tải lại
        </button>
      )}
    </section>
  );
}
export function OrderLookup() {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const order = await api.order(id.trim(), token.trim());
      rememberOrder(order.id, token.trim());
      navigate('/don-hang/' + encodeURIComponent(order.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể tra cứu. Kiểm tra mã đơn và khóa riêng.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section commerce-page lookup-page htv-commerce-public htv-lookup-page">
      <header className="commerce-intro">
        <p className="eyebrow">DÕI THEO THỨC QUÀ</p>
        <h1>Tra cứu đơn hàng</h1>
        <p className="commerce-lead">Nhập mã đơn và khóa riêng nhận được sau khi đặt hàng.</p>
      </header>
      <form className="commerce-panel order-lookup-form" onSubmit={submit}>
        <label className="field">
          Mã đơn / ID
          <input required value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          Khóa tra cứu
          <input
            type="password"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? 'Đang tra cứu…' : 'Xem đơn hàng'}
        </button>
        {error && (
          <p className="form-status" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="fine-print lookup-help">
        Nếu quên khóa, vui lòng liên hệ cửa hàng để xác minh thông tin người nhận.
      </p>
    </section>
  );
}
export function PaymentResult() {
  const id = lastOrderId();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const token = orderToken(id);
    if (id)
      api
        .order(id, token)
        .then((result) => {
          if (active) setOrder(result);
        })
        .catch(() => {
          if (active) setError('Chưa lấy được xác nhận từ cửa hàng. Hãy tra cứu lại đơn hàng.');
        });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <section className="section commerce-page htv-commerce-public htv-payment-result">
      <header className="commerce-intro">
        <p className="eyebrow">THÔNG TIN THANH TOÁN</p>
        <h1>
          {order?.paymentStatus === 'paid'
            ? 'Đã xác nhận thanh toán'
            : 'Kiểm tra trạng thái thanh toán'}
        </h1>
      </header>
      <div
        className={`commerce-panel payment-result-card ${order?.paymentStatus === 'paid' ? 'is-paid' : 'is-pending'}`}
      >
        <p className="payment-result-status" role="status">
          {order
            ? `Đơn ${order.code}: ${paymentStatuses[order.paymentStatus] || order.paymentStatus}.`
            : 'Chưa có xác nhận thanh toán từ hệ thống.'}
        </p>
        <p>
          Nếu bạn vừa chuyển khoản, trạng thái có thể cần một lúc để cập nhật. Việc quay về trang
          này không thay thế xác nhận từ cửa hàng.
        </p>
        {error && (
          <p className="commerce-error" role="alert">
            {error}
          </p>
        )}
        <Link
          className="button"
          to={id ? '/don-hang/' + encodeURIComponent(id) : '/tra-cuu-don-hang'}
        >
          Xem và cập nhật đơn hàng
        </Link>
      </div>
    </section>
  );
}
