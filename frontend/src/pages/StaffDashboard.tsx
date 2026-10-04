import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, type CustomerUser, type SupportTicket } from '../services/customerApi';
import { request } from '../services/api';
import { type Order, orderStatuses } from '../constants/commerce';
import { OrderSummary } from './Orders';
import './staff.css';

type Campaign = {
  id?: string;
  code: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  minOrder: number;
  maxDiscount: number;
  startsAt: string;
  expiresAt: string;
  distribution: 'automatic' | 'code';
  totalLimit: number;
  perUserLimit: number;
  active: boolean;
};
const nextStates: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered', 'return_requested'],
  delivered: ['return_requested'],
  return_requested: ['returned'],
  returned: [],
  cancelled: [],
};
const stateLabels: Record<string, string> = {
  ...orderStatuses,
  confirmed: 'Chờ lấy hàng',
  shipping: 'Chờ giao hàng',
  return_requested: 'Yêu cầu trả hàng',
  returned: 'Đã trả hàng',
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Chưa thể thực hiện. Vui lòng thử lại.';

function ManagedOrder({
  order,
  onSaved,
  isAdmin,
}: {
  order: Order;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState(order.status);
  const [carrier, setCarrier] = useState(order.carrier || '');
  const [tracking, setTracking] = useState(order.trackingNumber || '');
  const [description, setDescription] = useState('');
  const [paid, setPaid] = useState(false);
  const [refund, setRefund] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/admin/orders/' + encodeURIComponent(order.id), {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(tracking ? { trackingNumber: tracking } : {}),
          ...(carrier ? { carrier } : {}),
          ...(description ? { shippingEvent: { status, description } } : {}),
          ...(paid && order.paymentMethod === 'cod' ? { paymentStatus: 'paid' } : {}),
          ...(refund ? { paymentStatus: refund } : {}),
        }),
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="managed-order">
      <div className="staff-order-heading">
        <h2>Đơn {order.code}</h2>
        <small>{new Date(order.createdAt).toLocaleString('vi-VN')}</small>
      </div>
      <OrderSummary order={order} />
      {order.payOsException && (
        <p className="form-status" role="status">
          Cần đối soát: {order.payOsException}
        </p>
      )}
      {order.paymentMethod === 'payos' && order.paymentStatus !== 'paid' && (
        <p className="notice">
          Đơn VietQR cần xác nhận thanh toán trước khi chuẩn bị hoặc giao hàng.
        </p>
      )}
      <form onSubmit={save} className="staff-order-form">
        <label className="field">
          Bước xử lý
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={order.status}>{stateLabels[order.status]}</option>
            {(nextStates[order.status] || [])
              .filter(
                (s) =>
                  order.paymentMethod !== 'payos' ||
                  order.paymentStatus === 'paid' ||
                  !['confirmed', 'shipping', 'delivered'].includes(s),
              )
              .map((s) => (
                <option key={s} value={s}>
                  {stateLabels[s]}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Đơn vị vận chuyển
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            maxLength={80}
            placeholder="GHN, GHTK hoặc đối tác khác"
          />
        </label>
        <label className="field">
          Mã vận đơn
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            maxLength={100}
            placeholder="Mã do đối tác cấp"
          />
        </label>
        <label className="field">
          Cập nhật hành trình
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Thông tin thực tế gửi đến người mua"
          />
        </label>
        {order.paymentMethod === 'cod' &&
          status === 'delivered' &&
          order.paymentStatus !== 'paid' && (
            <label className="consent">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Đã đối soát và thu đủ tiền COD
            </label>
          )}
        {isAdmin &&
          (order.status === 'returned' ||
            status === 'returned' ||
            (order.status === 'cancelled' &&
              order.paymentMethod === 'payos' &&
              order.paymentStatus === 'refund_pending')) &&
          ['paid', 'refund_pending'].includes(order.paymentStatus) && (
            <label className="field">
              Đối soát hoàn tiền
              <select value={refund} onChange={(event) => setRefund(event.target.value)}>
                <option value="">Giữ trạng thái hiện tại</option>
                {order.paymentStatus === 'paid' && (
                  <option value="refund_pending">Ghi nhận cần hoàn tiền</option>
                )}
                {order.paymentStatus === 'refund_pending' && (
                  <option value="refunded">Đã chuyển tiền hoàn thực tế</option>
                )}
              </select>
              <small>
                Chỉ xác nhận sau khi kiểm tra thực tế; thao tác này không chuyển tiền tự động.
              </small>
            </label>
          )}
        <button className="button" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Cập nhật đơn'}
        </button>
        {error && (
          <p role="alert" className="form-status">
            {error}
          </p>
        )}
      </form>
    </article>
  );
}
function TicketEditor({ ticket, onSaved }: { ticket: SupportTicket; onSaved: () => void }) {
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/staff/tickets/' + encodeURIComponent(ticket.id), {
        method: 'PATCH',
        body: JSON.stringify({ status, reply }),
      });
      setReply('');
      onSaved();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="staff-ticket">
      <div className="staff-ticket-head">
        <strong>
          {ticket.kind === 'return' ? 'Trả hàng' : 'Hỗ trợ'} · {ticket.orderId}
        </strong>
        <span>{new Date(ticket.createdAt).toLocaleString('vi-VN')}</span>
      </div>
      <p>{ticket.message}</p>
      {ticket.replies?.map((r, i) => (
        <blockquote key={i}>
          {r.message || r.reply}
          <small>{new Date(r.createdAt).toLocaleString('vi-VN')}</small>
        </blockquote>
      ))}
      <form onSubmit={submit}>
        <label className="field">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SupportTicket['status'])}
          >
            <option value="open">Mới tiếp nhận</option>
            <option value="in_progress">Đang xử lý</option>
            <option value="resolved">Đã xử lý</option>
          </select>
        </label>
        <label className="field">
          Phản hồi khách hàng
          <textarea
            required
            minLength={2}
            maxLength={2000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
          />
        </label>
        <button className="button" disabled={busy}>
          Gửi phản hồi
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </article>
  );
}
export function StaffDashboard() {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'tickets' | 'vouchers' | 'users'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [vouchers, setVouchers] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    customerApi
      .me()
      .then((r) => {
        if (alive) setUser(r.user);
      })
      .catch(() => {
        if (alive) setError('Vui lòng đăng nhập bằng tài khoản quản trị hoặc nhân viên.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!user || user.role === 'customer') return;
    let alive = true;
    setBusy(true);
    setError('');
    (async () => {
      try {
        if (tab === 'orders') {
          const r = await request<{ orders: Order[]; total: number }>(
            `/admin/orders?page=${page}&limit=20`,
          );
          if (alive) {
            setOrders(r.orders);
            setTotal(r.total);
          }
        }
        if (tab === 'tickets') {
          const r = await request<{ tickets: SupportTicket[] }>('/staff/tickets');
          if (alive) setTickets(r.tickets);
        }
        if (tab === 'vouchers') {
          const r = await request<{ vouchers: Campaign[] }>('/admin/vouchers');
          if (alive) setVouchers(r.vouchers);
        }
        if (tab === 'users') {
          const r = await request<{ users: CustomerUser[] }>('/admin/users');
          if (alive) setUsers(r.users);
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, tab, page, version]);
  async function createStaff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await request('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(d)),
      });
      setNotice('Đã tạo tài khoản nhân viên.');
      f.reset();
      setVersion((v) => v + 1);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function createVoucher(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    const body = {
      code: d.get('code'),
      name: d.get('name'),
      type: d.get('type'),
      value: Number(d.get('value')),
      minOrder: Number(d.get('minOrder')),
      maxDiscount: Number(d.get('maxDiscount')),
      startsAt: new Date(String(d.get('startsAt'))).toISOString(),
      expiresAt: new Date(String(d.get('expiresAt'))).toISOString(),
      distribution: d.get('distribution'),
      totalLimit: Number(d.get('totalLimit')),
      perUserLimit: Number(d.get('perUserLimit')),
      active: true,
    };
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await request('/admin/vouchers', { method: 'POST', body: JSON.stringify(body) });
      setNotice('Đã phát hành voucher.');
      f.reset();
      setVersion((v) => v + 1);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="staff-page">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </section>
    );
  if (!user || user.role === 'customer')
    return (
      <section className="staff-page">
        <h1>Khu vực điều hành</h1>
        <p>{error || 'Tài khoản của bạn không có quyền truy cập khu vực này.'}</p>
        <Link className="button" to="/tai-khoan">
          Đăng nhập
        </Link>
        <Link className="text-link" to="/">
          Về website
        </Link>
      </section>
    );
  return (
    <section className="staff-page">
      <div className="staff-heading">
        <div>
          <p className="eyebrow">
            HÀ THÀNH VỊ · {user.role === 'admin' ? 'ADMIN / MANAGER' : 'NHÂN VIÊN'}
          </p>
          <h1>Điều hành cửa hàng</h1>
          <p>Xin chào {user.name}.</p>
        </div>
        <div>
          <Link className="text-link" to="/">
            Xem website
          </Link>
          {user.role === 'admin' && (
            <Link className="button button-outline" to="/admin">
              Chỉnh nội dung
            </Link>
          )}
        </div>
      </div>
      <nav className="staff-tabs" aria-label="Các mục quản trị">
        {[
          ['orders', 'Đơn hàng'],
          ['tickets', 'Chăm sóc khách hàng'],
          ...(user.role === 'admin'
            ? [
                ['vouchers', 'Voucher'],
                ['users', 'Nhân sự'],
              ]
            : []),
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id as typeof tab);
              setNotice('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {busy && <p role="status">Đang tải…</p>}
      {error && (
        <p role="alert" className="form-status">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-status">
          {notice}
        </p>
      )}
      {tab === 'orders' && (
        <>
          <p>
            {total} đơn hàng · Trang {page}
          </p>
          <div className="managed-order-grid">
            {orders.map((order) => (
              <ManagedOrder
                key={order.id + order.status + order.paymentStatus + (order.trackingNumber || '')}
                order={order}
                isAdmin={user.role === 'admin'}
                onSaved={() => setVersion((v) => v + 1)}
              />
            ))}
          </div>
          {!orders.length && !busy && <p>Chưa có đơn hàng.</p>}
          <div className="pagination">
            <button
              className="button button-outline"
              disabled={page <= 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Trang trước
            </button>
            <button
              className="button button-outline"
              disabled={page * 20 >= total || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
      {tab === 'tickets' && (
        <>
          <div className="staff-ticket-grid">
            {tickets.map((ticket) => (
              <TicketEditor
                key={ticket.id + ticket.status + (ticket.replies?.length || 0)}
                ticket={ticket}
                onSaved={() => setVersion((v) => v + 1)}
              />
            ))}
          </div>
          {!tickets.length && !busy && <p>Chưa có yêu cầu hỗ trợ.</p>}
        </>
      )}
      {tab === 'users' && (
        <section className="staff-admin-section">
          <div>
            <h2>Tài khoản cửa hàng</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <form onSubmit={createStaff}>
            <h2>Thêm nhân viên</h2>
            <label className="field">
              Họ tên
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <label className="field">
              Email
              <input name="email" required type="email" maxLength={254} />
            </label>
            <label className="field">
              Số điện thoại
              <input name="phone" required type="tel" maxLength={20} />
            </label>
            <label className="field">
              Mật khẩu ban đầu
              <input
                name="password"
                required
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button className="button" disabled={busy}>
              Tạo nhân viên
            </button>
          </form>
        </section>
      )}
      {tab === 'vouchers' && (
        <section className="staff-admin-section">
          <div>
            <h2>Ưu đãi đã phát hành</h2>
            {vouchers.map((v) => (
              <article className="campaign-card" key={v.id || v.code}>
                <strong>
                  {v.code} · {v.name}
                </strong>
                <p>
                  {v.type === 'percent' ? v.value + '%' : v.value.toLocaleString('vi-VN') + 'đ'} ·{' '}
                  {v.distribution === 'automatic' ? 'Tự động vào ví' : 'Khách nhập mã'}
                </p>
                <small>Hạn dùng: {new Date(v.expiresAt).toLocaleDateString('vi-VN')}</small>
              </article>
            ))}
            {!vouchers.length && !busy && <p>Chưa có chiến dịch.</p>}
          </div>
          <form onSubmit={createVoucher}>
            <h2>Phát hành voucher</h2>
            <label className="field">
              Mã ưu đãi
              <input
                name="code"
                required
                minLength={3}
                maxLength={40}
                pattern="[A-Za-z0-9_-]+"
                placeholder="HATHANH10"
              />
            </label>
            <label className="field">
              Tên chiến dịch
              <input name="name" required maxLength={120} />
            </label>
            <div className="form-row">
              <label className="field">
                Loại
                <select name="type">
                  <option value="fixed">Giảm số tiền</option>
                  <option value="percent">Giảm phần trăm</option>
                </select>
              </label>
              <label className="field">
                Giá trị
                <input name="value" type="number" min="1" required />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Đơn tối thiểu
                <input name="minOrder" type="number" min="0" defaultValue="0" required />
              </label>
              <label className="field">
                Giảm tối đa (0: không giới hạn)
                <input name="maxDiscount" type="number" min="0" defaultValue="0" required />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Bắt đầu
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label className="field">
                Kết thúc
                <input name="expiresAt" type="datetime-local" required />
              </label>
            </div>
            <label className="field">
              Cách nhận
              <select name="distribution">
                <option value="code">Nhập mã để nhận</option>
                <option value="automatic">Tự động vào ví khách</option>
              </select>
            </label>
            <div className="form-row">
              <label className="field">
                Tổng lượt dùng
                <input name="totalLimit" type="number" min="1" defaultValue="100" required />
              </label>
              <label className="field">
                Lượt mỗi khách
                <input name="perUserLimit" type="number" min="1" defaultValue="1" required />
              </label>
            </div>
            <button className="button" disabled={busy}>
              Phát hành ưu đãi
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
