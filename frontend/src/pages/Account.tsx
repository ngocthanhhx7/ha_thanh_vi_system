import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  Gift,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Star,
  UserRound,
} from 'lucide-react';
import {
  customerApi,
  CustomerApiError,
  type Address,
  type CustomerUser,
  type SupportTicket,
  type VoucherWalletItem,
} from '../services/customerApi';
import { orderStatuses, paymentStatuses, type Order } from '../constants/commerce';
import { priceLabel } from '../utils/format';
import './account.css';
import './account-public.css';
import { AuthForm } from '../components/AuthForm';
import { WorkspaceNotifications } from '../components/Workspace';

type Section =
  'profile' | 'orders' | 'addresses' | 'vouchers' | 'reviews' | 'support' | 'notifications';
const sections = [
  { id: 'orders', label: 'Đơn hàng của tôi', icon: Package },
  { id: 'profile', label: 'Thông tin tài khoản', icon: UserRound },
  { id: 'addresses', label: 'Sổ địa chỉ', icon: MapPin },
  { id: 'vouchers', label: 'Ví ưu đãi', icon: Gift },
  { id: 'reviews', label: 'Đánh giá sản phẩm', icon: Star },
  { id: 'support', label: 'Hỗ trợ & đổi trả', icon: MessageCircle },
  { id: 'notifications', label: 'Thông báo', icon: Bell },
] as const;
const isAccountSection = (value: string | null): value is Section =>
  sections.some((section) => section.id === value);
const orderTabs = [
  ['all', 'Tất cả'],
  ['pending', 'Chờ xác nhận'],
  ['confirmed', 'Chờ lấy hàng'],
  ['shipping', 'Chờ giao hàng'],
  ['delivered', 'Đã giao'],
  ['returns', 'Trả hàng'],
  ['cancelled', 'Đã hủy'],
];
const labels: Record<string, string> = {
  ...orderStatuses,
  confirmed: 'Chờ lấy hàng',
  return_requested: 'Yêu cầu trả hàng',
  returned: 'Đã trả hàng',
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const voucherDateLabel = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Chưa thể hoàn tất. Vui lòng thử lại.';
const emptyAddress = (): Omit<Address, 'id'> => ({
  label: 'Nhà riêng',
  name: '',
  phone: '',
  address: '',
  isDefault: false,
});

export function Account() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [section, setSection] = useState<Section>(() =>
    isAccountSection(searchParams.get('section'))
      ? (searchParams.get('section') as Section)
      : 'orders',
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [vouchers, setVouchers] = useState<VoucherWalletItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [orderTab, setOrderTab] = useState('all');
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>(emptyAddress);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [deleteAddress, setDeleteAddress] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [ticketKind, setTicketKind] = useState<'support' | 'return'>('support');
  const [reviewOrder, setReviewOrder] = useState('');
  const [rating, setRating] = useState(5);

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    if (isAccountSection(requestedSection)) setSection(requestedSection);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    customerApi
      .me()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((reason) => {
        if (active && !(reason instanceof CustomerApiError && reason.status === 401))
          setError(messageOf(reason));
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError('');
    async function load() {
      if (section === 'orders' || section === 'reviews' || section === 'support') {
        const result = await customerApi.orders();
        if (active) setOrders(result.orders);
      }
      if (section === 'addresses') {
        const result = await customerApi.addresses();
        if (active) setAddresses(result.addresses);
      }
      if (section === 'vouchers') {
        const result = await customerApi.vouchers();
        if (active) setVouchers(result.vouchers);
      }
      if (section === 'support') {
        const result = await customerApi.tickets();
        if (active) setTickets(result.tickets);
      }
    }
    load()
      .catch((reason) => {
        if (!active) return;
        setError(messageOf(reason));
        if (reason instanceof CustomerApiError && reason.status === 401) {
          setUser(null);
          clearPrivateData();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, section, revision]);

  function clearPrivateData() {
    setOrders([]);
    setAddresses([]);
    setVouchers([]);
    setTickets([]);
    setSelectedOrder('');
    setReviewOrder('');
    setShowAddressForm(false);
    setEditingAddress(null);
    setDeleteAddress(null);
    setAddressForm(emptyAddress());
  }
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(messageOf(reason));
      if (reason instanceof CustomerApiError && reason.status === 401) {
        setUser(null);
        clearPrivateData();
      }
    } finally {
      setBusy(false);
    }
  }
  const selectedReviewOrder = orders.find(
    (order) => order.id === reviewOrder && order.status === 'delivered',
  );
  const deliveredOrders = orders.filter((order) => order.status === 'delivered');
  const eligibleSupportOrders = orders.filter(
    (order) => ticketKind === 'support' || order.status === 'delivered',
  );

  if (initializing)
    return (
      <section className="section account-page">
        <p role="status">Đang mở tài khoản của bạn…</p>
      </section>
    );

  if (!user)
    return (
      <section className="section account-page account-auth">
        <div className="account-welcome">
          <p className="eyebrow">MỘT CHÚT THÂN QUEN</p>
          <h1>
            Chào bạn,
            <br />
            người thương vị Hà Nội.
          </h1>
          <p>
            Giữ lại những thức quà yêu thích, dõi theo đơn hàng và nhận những ưu đãi dành riêng cho
            bạn.
          </p>
          <Link className="text-link" to="/san-pham">
            Khám phá thức quà <ArrowUpRight size={16} />
          </Link>
        </div>
        <AuthForm
          initialError={error}
          onAccountAppeal={(appealToken) =>
            navigate('/khieu-nai-tai-khoan', { state: { appealToken } })
          }
          onAuthenticated={(verifiedUser) => {
            clearPrivateData();
            setUser(verifiedUser);
            setSection('orders');
            setSearchParams({ section: 'orders' });
          }}
        />
      </section>
    );

  return (
    <section className="section account-page">
      <div className="account-heading">
        <div>
          <p className="eyebrow">GÓC NHỎ CỦA BẠN</p>
          <h1>Xin chào, {user.name}.</h1>
          <p>Những thức quà, những chuyến đi và một chút ưu ái riêng.</p>
        </div>
        <Link className="button button-outline" to="/san-pham">
          Chọn thêm thức quà <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="account-layout">
        <aside className="account-nav">
          <nav aria-label="Quản lý tài khoản">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? 'page' : undefined}
                disabled={busy}
                onClick={() => {
                  setSection(id);
                  setSearchParams({ section: id });
                  setError('');
                  setNotice('');
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
          {user.role !== 'customer' && (
            <Link className="account-admin-link" to="/quan-tri">
              Trang quản trị <ArrowUpRight size={15} />
            </Link>
          )}
          {user.role === 'admin' && (
            <Link className="account-admin-link" to="/admin">
              Quản trị nội dung <ArrowUpRight size={15} />
            </Link>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await customerApi.logout();
                setUser(null);
                clearPrivateData();
                window.dispatchEvent(new Event('customer-session-changed'));
              }, 'Bạn đã đăng xuất.')
            }
          >
            <LogOut size={18} />
            Đăng xuất
          </button>
        </aside>
        <div className="account-content" aria-busy={loading || busy}>
          <h2>{sections.find((item) => item.id === section)?.label}</h2>
          {error && (
            <div className="account-error" role="alert">
              <p>{error}</p>
              <button
                className="text-link"
                disabled={busy || loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                Tải lại dữ liệu
              </button>
            </div>
          )}
          {notice && (
            <p className="account-notice" role="status">
              {notice}
            </p>
          )}
          {loading ? (
            <p role="status">Đang tải thông tin…</p>
          ) : (
            <>
              {section === 'profile' && (
                <div className="account-panel">
                  <ProfileForm
                    user={user}
                    busy={busy}
                    onSave={(name, phone) =>
                      void act(async () => {
                        const result = await customerApi.profile({ name, phone });
                        setUser(result.user);
                        window.dispatchEvent(new Event('customer-session-changed'));
                      }, 'Đã cập nhật thông tin tài khoản.')
                    }
                  />
                  <dl className="account-profile">
                    <div>
                      <dt>Họ và tên</dt>
                      <dd>{user.name}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{user.email}</dd>
                    </div>
                    <div>
                      <dt>Số điện thoại</dt>
                      <dd>{user.phone || 'Chưa cung cấp'}</dd>
                    </div>
                  </dl>
                  <p className="fine-print">
                    Email đăng nhập được giữ cố định để bảo vệ tài khoản.
                  </p>
                </div>
              )}
              {section === 'orders' && (
                <>
                  <div className="account-order-tabs" aria-label="Lọc trạng thái đơn hàng">
                    {orderTabs.map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={id === orderTab}
                        onClick={() => setOrderTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {orders
                    .filter(
                      (order) =>
                        orderTab === 'all' ||
                        (orderTab === 'returns'
                          ? ['return_requested', 'returned'].includes(order.status)
                          : order.status === orderTab),
                    )
                    .map((order) => (
                      <article className="account-panel account-order" key={order.id}>
                        <header>
                          <div>
                            <strong>{order.code}</strong>
                            <small>{dateLabel(order.createdAt)}</small>
                          </div>
                          <span className="account-badge">
                            {labels[order.status] || order.status}
                          </span>
                        </header>
                        <ul>
                          {order.items.map((item) => (
                            <li key={item.productId}>
                              <span>
                                {item.name} <small>× {item.quantity}</small>
                              </span>
                              <strong>{priceLabel(item.quantity * item.unitPrice)}</strong>
                            </li>
                          ))}
                        </ul>
                        <footer>
                          <div>
                            <small>
                              {paymentStatuses[order.paymentStatus] || order.paymentStatus}
                            </small>
                            <strong>{priceLabel(order.total)}</strong>
                          </div>
                          <Link
                            className="text-link"
                            to={'/don-hang/' + encodeURIComponent(order.id)}
                          >
                            Chi tiết đơn <ArrowUpRight size={16} />
                          </Link>
                        </footer>
                      </article>
                    ))}
                  {!orders.some(
                    (order) =>
                      orderTab === 'all' ||
                      (orderTab === 'returns'
                        ? ['return_requested', 'returned'].includes(order.status)
                        : order.status === orderTab),
                  ) &&
                    !error && <Empty text="Chưa có đơn hàng trong mục này." />}
                </>
              )}
              {section === 'addresses' && (
                <>
                  <div className="account-section-intro">
                    <p>Lưu tối đa 10 địa chỉ. Địa chỉ mặc định sẽ được gợi ý khi thanh toán.</p>
                    <button
                      className="button button-outline"
                      disabled={busy || addresses.length >= 10}
                      onClick={() => {
                        setEditingAddress(null);
                        setAddressForm({
                          ...emptyAddress(),
                          name: user.name,
                          phone: user.phone,
                          isDefault: addresses.length === 0,
                        });
                        setShowAddressForm(true);
                      }}
                    >
                      Thêm địa chỉ
                    </button>
                  </div>
                  {showAddressForm && (
                    <form
                      className="account-panel"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act(async () => {
                          await customerApi.saveAddress(addressForm, editingAddress || undefined);
                          setShowAddressForm(false);
                        }, 'Đã lưu địa chỉ nhận hàng.');
                      }}
                    >
                      <h3>{editingAddress ? 'Sửa địa chỉ' : 'Địa chỉ mới'}</h3>
                      <label className="field">
                        Tên gợi nhớ
                        <input
                          required
                          maxLength={50}
                          value={addressForm.label}
                          onChange={(e) =>
                            setAddressForm({ ...addressForm, label: e.target.value })
                          }
                        />
                      </label>
                      <div className="account-form-grid">
                        <label className="field">
                          Người nhận
                          <input
                            required
                            autoComplete="name"
                            maxLength={100}
                            value={addressForm.name}
                            onChange={(e) =>
                              setAddressForm({ ...addressForm, name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          Số điện thoại
                          <input
                            type="tel"
                            required
                            autoComplete="tel"
                            maxLength={20}
                            value={addressForm.phone}
                            onChange={(e) =>
                              setAddressForm({ ...addressForm, phone: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        Địa chỉ đầy đủ
                        <textarea
                          required
                          rows={3}
                          maxLength={500}
                          autoComplete="street-address"
                          value={addressForm.address}
                          onChange={(e) =>
                            setAddressForm({ ...addressForm, address: e.target.value })
                          }
                        />
                      </label>
                      <label className="account-check">
                        <input
                          type="checkbox"
                          checked={addressForm.isDefault}
                          onChange={(e) =>
                            setAddressForm({ ...addressForm, isDefault: e.target.checked })
                          }
                        />
                        Đặt làm địa chỉ mặc định
                      </label>
                      <div className="account-actions">
                        <button className="button" disabled={busy}>
                          Lưu địa chỉ
                        </button>
                        <button
                          type="button"
                          className="text-link"
                          disabled={busy}
                          onClick={() => setShowAddressForm(false)}
                        >
                          Đóng
                        </button>
                      </div>
                    </form>
                  )}
                  {addresses.map((address) => (
                    <article className="account-panel" key={address.id}>
                      <header className="account-card-heading">
                        <h3>{address.label}</h3>
                        {address.isDefault && <span className="account-badge">Mặc định</span>}
                      </header>
                      <p>
                        <strong>{address.name}</strong> · {address.phone}
                      </p>
                      <p>{address.address}</p>
                      <div className="account-actions">
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => {
                            setEditingAddress(address.id);
                            setAddressForm({
                              label: address.label,
                              name: address.name,
                              phone: address.phone,
                              address: address.address,
                              isDefault: address.isDefault,
                            });
                            setShowAddressForm(true);
                          }}
                        >
                          Sửa địa chỉ
                        </button>
                        {!address.isDefault && (
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  customerApi.saveAddress(
                                    {
                                      label: address.label,
                                      name: address.name,
                                      phone: address.phone,
                                      address: address.address,
                                      isDefault: true,
                                    },
                                    address.id,
                                  ),
                                'Đã đổi địa chỉ mặc định.',
                              )
                            }
                          >
                            Đặt mặc định
                          </button>
                        )}
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => setDeleteAddress(address.id)}
                        >
                          Xóa
                        </button>
                      </div>
                      {deleteAddress === address.id && (
                        <div className="account-confirm">
                          <p>
                            Xóa địa chỉ này khỏi sổ địa chỉ? Thông tin các đơn cũ được giữ nguyên.
                          </p>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await customerApi.deleteAddress(address.id);
                                setDeleteAddress(null);
                              }, 'Đã xóa địa chỉ.')
                            }
                          >
                            Xác nhận xóa
                          </button>
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() => setDeleteAddress(null)}
                          >
                            Giữ lại
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {!addresses.length && !showAddressForm && !error && (
                    <Empty text="Sổ địa chỉ đang chờ điểm đến đầu tiên của bạn." />
                  )}
                </>
              )}
              {section === 'vouchers' && (
                <>
                  <form
                    className="account-claim"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const code = String(new FormData(form).get('code')).trim();
                      void act(async () => {
                        await customerApi.claimVoucher(code);
                        form.reset();
                      }, 'Đã thêm ưu đãi vào ví của bạn.');
                    }}
                  >
                    <label className="field">
                      Bạn có mã ưu đãi?
                      <input
                        name="code"
                        required
                        maxLength={50}
                        autoComplete="off"
                        placeholder="Nhập mã ưu đãi"
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Lưu vào ví
                    </button>
                  </form>
                  <div className="account-vouchers">
                    {vouchers.map((voucher) => (
                      <article
                        className={
                          'account-voucher ' + (voucher.status !== 'available' ? 'is-inactive' : '')
                        }
                        key={voucher.id}
                      >
                        <Gift size={24} />
                        <div>
                          <h3>{voucher.name}</h3>
                          <strong>
                            Giảm{' '}
                            {voucher.type === 'percent'
                              ? `${voucher.value}%`
                              : priceLabel(voucher.value)}
                          </strong>
                          <p>
                            Đơn từ {priceLabel(voucher.minOrder)}
                            {voucher.maxDiscount
                              ? ' · Tối đa ' + priceLabel(voucher.maxDiscount)
                              : ''}
                          </p>
                          <p className="account-voucher-code">{voucher.code}</p>
                          <small>
                            {voucherDateLabel(voucher.startsAt)} –{' '}
                            {voucherDateLabel(voucher.expiresAt)} (GMT+7)
                          </small>
                          <p className="account-badge">
                            {
                              {
                                available: 'Có thể sử dụng',
                                scheduled: 'Sắp áp dụng',
                                reserved: 'Đang giữ cho đơn hàng',
                                used: 'Đã sử dụng',
                                exhausted: 'Đã hết lượt',
                                expired: 'Hết hạn',
                                inactive: 'Đang tạm ngưng',
                              }[voucher.status]
                            }
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!vouchers.length && !error && (
                    <Empty text="Chưa có ưu đãi trong ví. Nhập mã bạn nhận được để lưu tại đây." />
                  )}
                  <p className="fine-print">
                    Mỗi đơn áp dụng một mã. Hệ thống kiểm tra điều kiện và số lượt còn lại khi đặt
                    hàng.
                  </p>
                </>
              )}
              {section === 'reviews' && (
                <>
                  <p>
                    Chia sẻ cảm nhận về sản phẩm trong đơn đã giao. Mỗi sản phẩm được đánh giá một
                    lần trong mỗi đơn; ưu đãi cảm ơn được cấp theo đơn khi đủ điều kiện.
                  </p>
                  {deliveredOrders.length ? (
                    <form
                      className="account-panel"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const data = new FormData(form);
                        void act(async () => {
                          await customerApi.review({
                            orderId: reviewOrder,
                            productId: String(data.get('productId')),
                            rating,
                            comment: String(data.get('comment')).trim(),
                          });
                          form.reset();
                          setReviewOrder('');
                          setRating(5);
                        }, 'Đã gửi đánh giá. Bạn có thể xem ưu đãi đủ điều kiện trong ví.');
                      }}
                    >
                      <label className="field">
                        Đơn hàng đã giao
                        <select
                          required
                          value={reviewOrder}
                          onChange={(e) => setReviewOrder(e.target.value)}
                        >
                          <option value="">Chọn đơn hàng</option>
                          {deliveredOrders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.code} · {dateLabel(order.createdAt)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Sản phẩm
                        <select
                          name="productId"
                          required
                          key={reviewOrder}
                          disabled={!selectedReviewOrder}
                        >
                          <option value="">Chọn sản phẩm</option>
                          {selectedReviewOrder?.items.map((item) => (
                            <option key={item.productId} value={item.productId}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="account-rating">
                        <legend>Cảm nhận của bạn</legend>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name="rating"
                              value={value}
                              checked={rating === value}
                              onChange={() => setRating(value)}
                            />
                            <Star size={21} fill={value <= rating ? 'currentColor' : 'none'} />
                            <span>{value} sao</span>
                          </label>
                        ))}
                      </fieldset>
                      <label className="field">
                        Lời nhận xét
                        <textarea
                          name="comment"
                          required
                          minLength={3}
                          maxLength={2000}
                          rows={4}
                          placeholder="Hương vị, đóng gói hoặc điều bạn yêu thích…"
                        />
                      </label>
                      <button className="button" disabled={busy || !selectedReviewOrder}>
                        Gửi đánh giá
                      </button>
                    </form>
                  ) : (
                    !error && (
                      <Empty text="Khi đơn hàng được giao, bạn có thể gửi đánh giá tại đây." />
                    )
                  )}
                </>
              )}
              {section === 'support' && (
                <>
                  <p>
                    Mỗi yêu cầu được gắn với đơn của bạn để cửa hàng tiếp nhận và phản hồi đúng
                    thông tin. Yêu cầu đổi trả áp dụng cho đơn đã giao.
                  </p>
                  {orders.length > 0 && (
                    <form
                      className="account-panel"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const message = String(new FormData(form).get('message')).trim();
                        void act(async () => {
                          await customerApi.createTicket({
                            orderId: selectedOrder,
                            kind: ticketKind,
                            message,
                          });
                          form.reset();
                          setSelectedOrder('');
                        }, 'Đã gửi yêu cầu. Phản hồi của cửa hàng sẽ xuất hiện tại đây.');
                      }}
                    >
                      <label className="field">
                        Bạn cần hỗ trợ về
                        <select
                          value={ticketKind}
                          onChange={(e) => {
                            setTicketKind(e.target.value as 'support' | 'return');
                            setSelectedOrder('');
                          }}
                        >
                          <option value="support">Đơn hàng / giao hàng / thanh toán</option>
                          <option value="return">Đổi trả sản phẩm</option>
                        </select>
                      </label>
                      <label className="field">
                        Đơn hàng
                        <select
                          value={selectedOrder}
                          required
                          onChange={(e) => setSelectedOrder(e.target.value)}
                        >
                          <option value="">Chọn đơn hàng</option>
                          {eligibleSupportOrders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.code} · {labels[order.status] || order.status}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!eligibleSupportOrders.length && (
                        <p>Chưa có đơn đã giao để yêu cầu đổi trả.</p>
                      )}
                      <label className="field">
                        Nội dung cần hỗ trợ
                        <textarea
                          required
                          name="message"
                          minLength={10}
                          maxLength={3000}
                          rows={4}
                          placeholder="Mô tả vấn đề và mong muốn của bạn (tối thiểu 10 ký tự)."
                        />
                      </label>
                      <button className="button" disabled={busy || !selectedOrder}>
                        Gửi yêu cầu
                      </button>
                    </form>
                  )}
                  {tickets.map((ticket) => (
                    <article className="account-panel account-ticket" key={ticket.id}>
                      <header className="account-card-heading">
                        <h3>{ticket.kind === 'return' ? 'Yêu cầu đổi trả' : 'Yêu cầu hỗ trợ'}</h3>
                        <span className="account-badge">
                          {{
                            open: 'Đã tiếp nhận',
                            in_progress: 'Đang xử lý',
                            resolved: 'Đã giải quyết',
                          }[ticket.status] || ticket.status}
                        </span>
                      </header>
                      <small>
                        {dateLabel(ticket.createdAt)} ·{' '}
                        <Link to={'/don-hang/' + encodeURIComponent(ticket.orderId)}>
                          {orders.find((order) => order.id === ticket.orderId)?.code ||
                            'Xem đơn hàng'}
                        </Link>
                      </small>
                      <p className="account-message">{ticket.message}</p>
                      {ticket.replies?.map((reply, index) => (
                        <div className="account-reply" key={index}>
                          <strong>Hà Thành Vị phản hồi</strong>
                          <small>{dateLabel(reply.createdAt)}</small>
                          <p className="account-message">{reply.message || reply.reply}</p>
                        </div>
                      ))}
                    </article>
                  ))}
                  {!tickets.length && !error && <Empty text="Bạn chưa có yêu cầu hỗ trợ nào." />}
                  <p className="fine-print">
                    Cần trao đổi trước khi đặt hàng?{' '}
                    <Link to="/lien-he">Liên hệ trực tiếp với cửa hàng</Link>.
                  </p>
                </>
              )}
              {section === 'notifications' && <WorkspaceNotifications />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="account-empty">
      <Package size={30} />
      <p>{text}</p>
      <Link className="text-link" to="/san-pham">
        Ghé gian hàng <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}

function ProfileForm({
  user,
  busy,
  onSave,
}: {
  user: CustomerUser;
  busy: boolean;
  onSave: (name: string, phone: string) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSave(String(data.get('name')).trim(), String(data.get('phone')).trim());
      }}
    >
      <label className="field">
        Họ và tên
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={user.name}
          autoComplete="name"
        />
      </label>
      <label className="field">
        Số điện thoại
        <input
          name="phone"
          type="tel"
          required
          maxLength={20}
          defaultValue={user.phone}
          autoComplete="tel"
        />
      </label>
      <button className="button" disabled={busy}>
        Lưu thông tin
      </button>
    </form>
  );
}
