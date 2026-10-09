import { subscribeChat } from '../services/chatRealtime';
import { newerChatSnapshot } from '../services/chatSnapshot';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { customerApi, type CustomerUser, type SupportTicket } from '../services/customerApi';
import { chatApi, type ChatHandoff } from '../services/chatApi';
import { request } from '../services/api';
import { priceLabel } from '../utils/format';
import { type Order, orderStatuses, paymentStatuses } from '../constants/commerce';
import { OrderSummary } from './Orders';
import { AdminAccountManagement } from '../components/AdminAccountManagement';
import { useNotificationCenter } from '../components/NotificationCenter';
import { AdminSystemLogs, WorkspaceFrame, WorkspaceNotifications } from '../components/Workspace';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './staff.css';

type Campaign = {
  id: string;
  code: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  minOrder: number;
  maxDiscount: number;
  startsAt: string;
  expiresAt: string;
  distribution: 'automatic' | 'code' | 'targeted';
  totalLimit: number;
  perUserLimit: number;
  active: boolean;
  walletCount: number;
};
const campaignDateTimeToIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Vui lòng nhập đầy đủ thời gian áp dụng.');
  const [, year, month, day, hour, minute] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) -
      7 * 60 * 60 * 1000,
  ).toISOString();
};
const campaignDateLabel = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
type OrderQueue =
  'needs_action' | 'awaiting_payment' | 'fulfillment' | 'shipping' | 'closed' | 'all';
function orderPriority(order: Order) {
  if (order.status === 'return_requested') return { label: 'Yêu cầu trả hàng', tone: 'urgent' };
  if (
    order.payOsException ||
    order.paymentReviewAt ||
    ['refund_pending', 'failed'].includes(order.paymentStatus)
  )
    return { label: 'Cần đối soát', tone: 'urgent' };
  if (
    order.status === 'pending' &&
    (order.paymentMethod === 'cod' || order.paymentStatus === 'paid')
  )
    return { label: 'Cần xác nhận', tone: 'action' };
  if (order.status === 'confirmed') return { label: 'Cần chuẩn bị', tone: 'action' };
  if (
    order.status === 'pending' &&
    order.paymentMethod === 'payos' &&
    order.paymentStatus !== 'paid'
  )
    return { label: 'Chờ khách thanh toán', tone: 'waiting' };
  if (order.status === 'shipping') return { label: 'Đang giao', tone: 'shipping' };
  return { label: 'Đã hoàn tất', tone: 'closed' };
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Chưa thể thực hiện. Vui lòng thử lại.';
type StaffDashboardData = {
  orders: {
    pending: number;
    returnRequested: number;
    byStatus: { status: string; count: number }[];
    daily: { date: string; orders: number; paid: number }[];
  };
  support: { open: number };
  chat: { waiting: number; assignedToMe: number };
};

function VoucherRecipientPicker({
  selected,
  onChange,
}: {
  selected: CustomerUser[];
  onChange: (users: CustomerUser[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setMatches([]);
      setLoading(false);
      setError('');
      return;
    }
    let active = true;
    setMatches([]);
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      customerApi
        .adminUsers({
          page: 1,
          limit: 10,
          q: search,
          role: 'customer',
          accountStatus: 'active',
          sort: 'name',
          direction: 'asc',
        })
        .then((result) => {
          if (active) setMatches(result.users);
        })
        .catch((reason) => {
          if (active) setError(errorText(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="campaign-recipient-picker">
      <label className="field">
        Tìm khách nhận ưu đãi
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nhập tên, email hoặc số điện thoại"
          autoComplete="off"
        />
      </label>
      <small className="fine-print">
        Nhập ít nhất 2 ký tự; chỉ tìm tài khoản khách đang hoạt động.
      </small>
      {loading && <p role="status">Đang tìm khách hàng…</p>}
      {error && (
        <p role="alert" className="form-status">
          {error}
        </p>
      )}
      {matches.length > 0 && (
        <div className="campaign-recipient-results">
          {matches.map((customer) => {
            const alreadySelected = selected.some((entry) => entry.id === customer.id);
            return (
              <button
                className="campaign-recipient-option"
                type="button"
                key={customer.id}
                disabled={alreadySelected}
                onClick={() => onChange([...selected, customer])}
              >
                <span>{customer.name}</span>
                <small>
                  {customer.email} · {alreadySelected ? 'Đã chọn' : 'Thêm khách'}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {query.trim().length >= 2 && !loading && !error && matches.length === 0 && (
        <p className="fine-print">Không tìm thấy khách hàng phù hợp.</p>
      )}
      {selected.length > 0 && (
        <ul className="campaign-recipient-selected" aria-label="Khách đã chọn nhận voucher">
          {selected.map((customer) => (
            <li key={customer.id}>
              <span>
                {customer.name} · {customer.email}
              </span>
              <button
                type="button"
                aria-label={`Bỏ chọn ${customer.email}`}
                onClick={() => onChange(selected.filter((entry) => entry.id !== customer.id))}
              >
                Bỏ chọn
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManagedOrder({
  order,
  onSaved,
  isAdmin,
}: {
  order: Order;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const { notify } = useNotificationCenter();
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
      notify({
        title: 'Đơn hàng đã được cập nhật',
        message: `${order.code} · ${stateLabels[status] || status}`,
        href: '/quan-tri?tab=orders',
        actionLabel: 'Quay lại hàng đợi',
        tone: 'success',
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
      {order.isOwnOrder ? (
        <p className="notice" role="note">
          Bạn không thể xử lý đơn hàng do chính mình đặt.
        </p>
      ) : (
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
      )}
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
function StaffChatInbox({ currentUser }: { currentUser: CustomerUser }) {
  const selectedRequest = useRef('');
  const [handoffs, setHandoffs] = useState<ChatHandoff[]>([]);
  const [selected, setSelected] = useState<ChatHandoff | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    let request = 0;
    const load = async () => {
      const current = ++request;
      try {
        const result = await chatApi.staffHandoffs();
        if (alive && current === request) setHandoffs(result.handoffs);
      } catch (reason) {
        if (alive) setError(errorText(reason));
      }
    };
    void load();
    const realtime = subscribeChat('staff', () => void load());
    const timer = window.setInterval(() => {
      if (!realtime.connected()) void load();
    }, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      realtime.close();
    };
  }, [version]);

  useEffect(() => {
    if (!selected || selected.status === 'resolved') return;
    let alive = true;
    const load = async () => {
      try {
        const result = await chatApi.staffHandoff(selected.id);
        if (alive)
          setSelected((current) =>
            current?.id === result.handoff.id
              ? newerChatSnapshot(current, result.handoff)
              : current,
          );
      } catch (reason) {
        if (alive) setError(errorText(reason));
      }
    };
    const realtime = subscribeChat('staff', (id) => {
      if (!id || id === selected.id) void load();
    });
    const timer = window.setInterval(() => {
      if (!realtime.connected()) void load();
    }, 7000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      realtime.close();
    };
  }, [selected?.id, selected?.updatedAt]);

  async function openHandoff(id: string) {
    selectedRequest.current = id;
    setError('');
    try {
      const result = await chatApi.staffHandoff(id);
      if (selectedRequest.current === id)
        setSelected((current) => newerChatSnapshot(current, result.handoff));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function claim() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await chatApi.claimHandoff(selected.id);
      setSelected((current) =>
        current?.id === result.handoff.id ? newerChatSnapshot(current, result.handoff) : current,
      );
      setNotice('Bạn đã tiếp nhận yêu cầu tư vấn.');
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await chatApi.replyHandoff(selected.id, reply.trim());
      setSelected((current) =>
        current?.id === result.handoff.id ? newerChatSnapshot(current, result.handoff) : current,
      );
      setReply('');
      setNotice('Đã gửi phản hồi cho khách.');
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await chatApi.resolveHandoff(selected.id);
      setSelected((current) =>
        current?.id === result.handoff.id ? newerChatSnapshot(current, result.handoff) : current,
      );
      setNotice('Đã kết thúc cuộc tư vấn.');
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const canWork = Boolean(
    selected &&
    selected.status !== 'resolved' &&
    (currentUser.role === 'admin' ||
      !selected.assignedStaffId ||
      selected.assignedStaffId === currentUser.id),
  );
  return (
    <section className="staff-chat-workspace" aria-label="Hộp thư tư vấn Vị Ơi">
      <div className="staff-chat-inbox">
        <header>
          <div>
            <p className="eyebrow">HỖ TRỢ TRỰC TIẾP</p>
            <h2>Khách đang chờ</h2>
          </div>
          <span>{handoffs.filter((item) => item.status === 'waiting').length} mới</span>
        </header>
        <div className="staff-chat-list">
          {handoffs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={'staff-chat-list-item' + (selected?.id === item.id ? ' is-selected' : '')}
              onClick={() => void openHandoff(item.id)}
            >
              <span className="staff-chat-list-top">
                <strong>
                  {item.customerType === 'guest' ? 'Khách vãng lai' : 'Khách thành viên'}
                </strong>
                <time>
                  {new Date(item.lastMessageAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </span>
              <span className="staff-chat-preview">
                {item.lastMessagePreview || 'Khách muốn được tư vấn trực tiếp'}
              </span>
              <span className="staff-chat-list-bottom">
                <span className={'staff-chat-status is-' + item.status}>
                  {item.status === 'waiting'
                    ? 'Chờ tiếp nhận'
                    : `Đang xử lý · ${item.assignedStaffName || ''}`}
                </span>
                {item.staffUnreadCount > 0 && <span className="staff-chat-unread">Mới</span>}
              </span>
            </button>
          ))}
          {!handoffs.length && <p className="staff-chat-empty">Chưa có khách nào chờ tư vấn.</p>}
        </div>
      </div>
      <div className="staff-chat-conversation">
        {!selected ? (
          <div className="staff-chat-placeholder">
            <span>✦</span>
            <h2>Chọn một yêu cầu</h2>
            <p>Hội thoại và các phản hồi sẽ hiện tại đây để bạn tiếp tục hỗ trợ khách.</p>
          </div>
        ) : (
          <>
            <header className="staff-chat-conversation-head">
              <div>
                <p className="eyebrow">
                  {selected.customerType === 'guest' ? 'KHÁCH VÃNG LAI' : 'KHÁCH THÀNH VIÊN'}
                </p>
                <h2>Tư vấn trực tiếp</h2>
                <small>Tiếp nhận lúc {new Date(selected.createdAt).toLocaleString('vi-VN')}</small>
              </div>
              {selected.status !== 'resolved' &&
                canWork &&
                selected.assignedStaffId !== currentUser.id && (
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => void claim()}
                  >
                    Nhận xử lý
                  </button>
                )}
              {selected.status === 'assigned' &&
                selected.assignedStaffId !== currentUser.id &&
                currentUser.role !== 'admin' && (
                  <span className="staff-chat-locked">
                    Đang do {selected.assignedStaffName} xử lý
                  </span>
                )}
            </header>
            <div className="staff-chat-transcript" role="log" aria-label="Nội dung hội thoại">
              {selected.messages.map((message) => (
                <article className={'staff-chat-message is-' + message.sender} key={message.id}>
                  <span>
                    {message.sender === 'customer'
                      ? 'Khách hàng'
                      : message.authorName ||
                        (message.sender === 'assistant' ? 'Vị Ơi' : 'Hà Thành Vị')}
                  </span>
                  <p>{message.content}</p>
                  <time>{new Date(message.createdAt).toLocaleString('vi-VN')}</time>
                </article>
              ))}
            </div>
            {selected.status === 'resolved' ? (
              <p className="staff-chat-closed">Cuộc tư vấn đã kết thúc.</p>
            ) : (
              <form className="staff-chat-reply" onSubmit={sendReply}>
                <textarea
                  aria-label="Phản hồi khách hàng"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={
                    canWork
                      ? 'Soạn lời phản hồi thân thiện…'
                      : 'Yêu cầu đang được nhân viên khác xử lý'
                  }
                  maxLength={1500}
                  rows={3}
                  disabled={!canWork || busy}
                />
                <div>
                  {canWork && selected.status === 'assigned' && (
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={busy}
                      onClick={() => void resolve()}
                    >
                      Kết thúc tư vấn
                    </button>
                  )}
                  <button
                    className="button"
                    type="submit"
                    disabled={!canWork || busy || !reply.trim()}
                  >
                    {busy ? 'Đang gửi…' : 'Gửi phản hồi'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
      {notice && (
        <p role="status" className="form-status staff-chat-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="form-status staff-chat-error">
          {error}
        </p>
      )}
    </section>
  );
}
export function StaffDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    'dashboard' | 'orders' | 'tickets' | 'chat' | 'vouchers' | 'users' | 'notifications' | 'logs'
  >('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [vouchers, setVouchers] = useState<Campaign[]>([]);
  const [voucherDistribution, setVoucherDistribution] = useState<Campaign['distribution']>('code');
  const [voucherRecipients, setVoucherRecipients] = useState<CustomerUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [orderQueue, setOrderQueue] = useState<OrderQueue>('needs_action');
  const [orderSearch, setOrderSearch] = useState('');
  const [appliedOrderSearch, setAppliedOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [orderPaymentStatus, setOrderPaymentStatus] = useState('');
  const [orderPaymentMethod, setOrderPaymentMethod] = useState('');
  const [orderFrom, setOrderFrom] = useState('');
  const [orderTo, setOrderTo] = useState('');
  const [orderSort, setOrderSort] = useState<'priority' | 'oldest' | 'newest' | 'total-desc'>(
    'priority',
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chatSummary, setChatSummary] = useState({ waiting: 0, unread: 0 });
  const [dashboard, setDashboard] = useState<StaffDashboardData | null>(null);
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    const availableTabs = [
      'dashboard',
      'orders',
      'tickets',
      'chat',
      'vouchers',
      'users',
      'notifications',
      'logs',
    ];
    if (
      requestedTab &&
      availableTabs.includes(requestedTab) &&
      (user?.role === 'admin' || !['vouchers', 'users', 'logs'].includes(requestedTab))
    )
      setTab(requestedTab as typeof tab);
  }, [searchParams, user?.role]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedOrderSearch(orderSearch.trim());
      setPage(1);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [orderSearch]);
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
    let previousWaiting: number | null = null;
    const poll = async () => {
      try {
        const summary = await chatApi.staffSummary();
        if (!alive) return;
        setChatSummary(summary);
        if (previousWaiting !== null && summary.waiting > previousWaiting) {
          const notificationText = `${summary.waiting} yêu cầu tư vấn đang chờ tiếp nhận.`;
          setNotice(notificationText);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Vị Ơi cần hỗ trợ khách', { body: notificationText });
          }
        }
        previousWaiting = summary.waiting;
      } catch {
        if (alive) setChatSummary({ waiting: 0, unread: 0 });
      }
    };
    void poll();
    const realtime = subscribeChat('staff', () => void poll());
    const timer = window.setInterval(() => {
      if (!realtime.connected()) void poll();
    }, 20000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      realtime.close();
    };
  }, [user]);
  useEffect(() => {
    if (
      !user ||
      user.role === 'customer' ||
      ['chat', 'notifications', 'logs', 'users'].includes(tab)
    ) {
      setBusy(false);
      return;
    }
    if (tab === 'orders' && orderFrom && orderTo && orderFrom > orderTo) {
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    setError('');
    (async () => {
      try {
        if (tab === 'dashboard') {
          const r = await request<StaffDashboardData>('/staff/dashboard');
          if (alive) setDashboard(r);
        }
        if (tab === 'orders') {
          const query = new URLSearchParams({
            page: String(page),
            limit: '20',
            queue: orderQueue,
            sort: orderSort,
          });
          if (appliedOrderSearch) query.set('q', appliedOrderSearch);
          if (orderStatus) query.set('status', orderStatus);
          if (orderPaymentStatus) query.set('paymentStatus', orderPaymentStatus);
          if (orderPaymentMethod) query.set('paymentMethod', orderPaymentMethod);
          if (orderFrom) query.set('from', new Date(orderFrom + 'T00:00:00').toISOString());
          if (orderTo) query.set('to', new Date(orderTo + 'T23:59:59.999').toISOString());
          const r = await request<{ orders: Order[]; total: number }>(`/admin/orders?${query}`);
          if (alive) {
            setOrders(r.orders);
            setTotal(r.total);
            setSelectedOrderId((selected) =>
              r.orders.some((order) => order.id === selected)
                ? selected
                : (r.orders[0]?.id ?? null),
            );
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
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    user,
    tab,
    page,
    version,
    orderQueue,
    appliedOrderSearch,
    orderStatus,
    orderPaymentStatus,
    orderPaymentMethod,
    orderFrom,
    orderTo,
    orderSort,
  ]);
  async function createVoucher(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    const distribution = String(d.get('distribution')) as Campaign['distribution'];
    if (distribution === 'targeted' && !voucherRecipients.length) {
      setError('Hãy chọn ít nhất một khách hàng nhận voucher.');
      return;
    }
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const body = {
        code: d.get('code'),
        name: d.get('name'),
        type: d.get('type'),
        value: Number(d.get('value')),
        minOrder: Number(d.get('minOrder')),
        maxDiscount: Number(d.get('maxDiscount')),
        startsAt: campaignDateTimeToIso(String(d.get('startsAt'))),
        expiresAt: campaignDateTimeToIso(String(d.get('expiresAt'))),
        distribution,
        customerIds:
          distribution === 'targeted' ? voucherRecipients.map((recipient) => recipient.id) : [],
        totalLimit: Number(d.get('totalLimit')),
        perUserLimit: Number(d.get('perUserLimit')),
        active: true,
      };
      await request('/admin/vouchers', { method: 'POST', body: JSON.stringify(body) });
      setNotice(
        distribution === 'targeted'
          ? `Đã phát hành và cấp voucher vào ví của ${voucherRecipients.length} khách hàng.`
          : distribution === 'automatic'
            ? 'Đã phát hành ưu đãi tự động cho khách hàng.'
            : 'Đã phát hành mã ưu đãi.',
      );
      f.reset();
      setVoucherDistribution('code');
      setVoucherRecipients([]);
      setVersion((v) => v + 1);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function toggleVoucher(voucher: Campaign) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await request(`/admin/vouchers/${encodeURIComponent(voucher.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !voucher.active }),
      });
      setNotice(voucher.active ? 'Voucher đã được tạm ngưng.' : 'Voucher đã được kích hoạt lại.');
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  const activeOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const orderQueues: { value: OrderQueue; label: string }[] = [
    { value: 'needs_action', label: 'Cần xử lý' },
    { value: 'awaiting_payment', label: 'Chờ thanh toán' },
    { value: 'fulfillment', label: 'Chờ chuẩn bị' },
    { value: 'shipping', label: 'Đang giao' },
    { value: 'closed', label: 'Đã đóng' },
    { value: 'all', label: 'Tất cả đơn hàng' },
  ];
  const orderFiltersActive = Boolean(
    orderSearch ||
    orderStatus ||
    orderPaymentStatus ||
    orderPaymentMethod ||
    orderFrom ||
    orderTo ||
    orderSort !== 'priority',
  );
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
    <WorkspaceFrame user={user} active={tab}>
      <header className="workspace-page-heading">
        <div>
          <p className="eyebrow">
            HÀ THÀNH VỊ · {user.role === 'admin' ? 'ADMIN / MANAGER' : 'NHÂN VIÊN'}
          </p>
          <h1>
            {tab === 'dashboard'
              ? 'Tổng quan công việc'
              : tab === 'orders'
                ? 'Quản lý đơn hàng'
                : tab === 'tickets'
                  ? 'Chăm sóc khách hàng'
                  : tab === 'chat'
                    ? 'Hộp thư tư vấn'
                    : tab === 'users'
                      ? 'Nhân sự & tài khoản'
                      : tab === 'vouchers'
                        ? 'Quản lý ưu đãi'
                        : tab === 'notifications'
                          ? 'Thông báo'
                          : 'Nhật ký hệ thống'}
          </h1>
          <p>Xin chào {user.name}. Khu vực xử lý nghiệp vụ nội bộ.</p>
        </div>
      </header>
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
            ['chat', `Tư vấn chat${chatSummary.waiting ? ` · ${chatSummary.waiting}` : ''}`],
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
                const selectedTab = id as typeof tab;
                setTab(selectedTab);
                setSearchParams({ tab: selectedTab }, { replace: true });
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
        {tab === 'dashboard' && dashboard && (
          <section className="staff-overview" aria-label="Dashboard nhân viên">
            <div className="staff-overview-kpis">
              <Link to="/quan-tri?tab=orders">
                <span>Đơn chờ xác nhận</span>
                <strong>{dashboard.orders.pending}</strong>
                <small>Mở hàng đợi đơn hàng →</small>
              </Link>
              <Link to="/quan-tri?tab=orders">
                <span>Yêu cầu đổi trả</span>
                <strong>{dashboard.orders.returnRequested}</strong>
                <small>Xem yêu cầu cần xử lý →</small>
              </Link>
              <Link to="/quan-tri?tab=tickets">
                <span>Yêu cầu chăm sóc mở</span>
                <strong>{dashboard.support.open}</strong>
                <small>Mở hộp chăm sóc khách →</small>
              </Link>
              <Link to="/quan-tri?tab=chat">
                <span>Chat đang chờ</span>
                <strong>{dashboard.chat.waiting}</strong>
                <small>{dashboard.chat.assignedToMe} cuộc được giao cho bạn →</small>
              </Link>
            </div>
            <div className="staff-overview-charts">
              <article className="staff-overview-chart">
                <h2>Đơn hàng 14 ngày gần đây</h2>
                <div className="staff-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={dashboard.orders.daily}
                      margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d7" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value: string) => value.slice(5)}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        name="Đơn tạo"
                        stroke="#8c6843"
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="staff-overview-chart">
                <h2>Đơn hàng theo trạng thái</h2>
                <div className="staff-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dashboard.orders.byStatus}
                      margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d7" />
                      <XAxis
                        dataKey="status"
                        tickFormatter={(value: string) => stateLabels[value] || value}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Số đơn" fill="#9d784f" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
            <div className="staff-overview-shortcuts">
              <h2>Việc cần chú ý</h2>
              <Link to="/quan-tri?tab=orders">Xử lý đơn chờ và đổi trả</Link>
              <Link to="/quan-tri?tab=tickets">Phản hồi yêu cầu chăm sóc khách</Link>
              <Link to="/quan-tri?tab=chat">Tiếp nhận cuộc trò chuyện Vị Ơi</Link>
            </div>
          </section>
        )}
        {tab === 'notifications' && <WorkspaceNotifications />}
        {tab === 'logs' && user.role === 'admin' && <AdminSystemLogs />}
        {tab === 'orders' && (
          <section className="order-management" aria-label="Hàng đợi xử lý đơn hàng">
            <header className="order-queue-heading">
              <div>
                <p className="eyebrow">HÀNG ĐỢI VẬN HÀNH</p>
                <h2>Ưu tiên xử lý đúng thứ tự</h2>
                <p>Đơn cần xử lý và đối soát được đưa lên trước; chưa có SLA được xác nhận.</p>
              </div>
              <span>
                {busy ? 'Đang cập nhật…' : `${total.toLocaleString('vi-VN')} đơn phù hợp`}
              </span>
            </header>
            <nav className="order-queue-tabs" aria-label="Nhóm đơn hàng">
              {orderQueues.map((queue) => (
                <button
                  key={queue.value}
                  type="button"
                  aria-pressed={orderQueue === queue.value}
                  onClick={() => {
                    setOrderQueue(queue.value);
                    setPage(1);
                  }}
                >
                  {queue.label}
                </button>
              ))}
            </nav>
            <div className="order-queue-filters" role="search" aria-label="Tìm và lọc đơn hàng">
              <label className="field order-queue-search">
                Tìm mã đơn, người nhận, email, số điện thoại hoặc sản phẩm
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Ví dụ: HTV-… hoặc Nguyễn Hà My"
                />
              </label>
              <label className="field">
                Trạng thái đơn
                <select
                  value={orderStatus}
                  onChange={(event) => {
                    setOrderStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả trạng thái</option>
                  {Object.entries(stateLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Thanh toán
                <select
                  value={orderPaymentStatus}
                  onChange={(event) => {
                    setOrderPaymentStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Mọi trạng thái</option>
                  {Object.entries(paymentStatuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Phương thức
                <select
                  value={orderPaymentMethod}
                  onChange={(event) => {
                    setOrderPaymentMethod(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="cod">COD</option>
                  <option value="payos">VietQR · PayOS</option>
                </select>
              </label>
              <label className="field">
                Từ ngày
                <input
                  type="date"
                  value={orderFrom}
                  onChange={(event) => {
                    setOrderFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="field">
                Đến ngày
                <input
                  type="date"
                  value={orderTo}
                  onChange={(event) => {
                    setOrderTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="field">
                Sắp xếp
                <select
                  value={orderSort}
                  onChange={(event) => {
                    setOrderSort(event.target.value as typeof orderSort);
                    setPage(1);
                  }}
                >
                  <option value="priority">Mức độ cần xử lý</option>
                  <option value="oldest">Cũ nhất trước</option>
                  <option value="newest">Mới nhất trước</option>
                  <option value="total-desc">Giá trị cao nhất</option>
                </select>
              </label>
              {orderFiltersActive && (
                <button
                  className="order-queue-clear"
                  type="button"
                  onClick={() => {
                    setOrderSearch('');
                    setAppliedOrderSearch('');
                    setOrderStatus('');
                    setOrderPaymentStatus('');
                    setOrderPaymentMethod('');
                    setOrderFrom('');
                    setOrderTo('');
                    setOrderSort('priority');
                    setPage(1);
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
            {orderFrom && orderTo && orderFrom > orderTo && (
              <p className="form-status" role="alert">
                Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
              </p>
            )}
            {busy && (
              <p className="order-queue-loading" role="status">
                Đang tải hàng đợi đơn…
              </p>
            )}
            {!busy && !orders.length && (
              <p className="order-queue-empty">
                Không có đơn phù hợp trong nhóm này. Thử đổi nhóm, bộ lọc hoặc từ khóa.
              </p>
            )}
            {orders.length > 0 && (
              <div className="order-queue-layout">
                <div className="order-queue-list" aria-label="Các đơn phù hợp">
                  {orders.map((order) => {
                    const priority = orderPriority(order);
                    return (
                      <button
                        className={
                          'order-queue-row' + (selectedOrderId === order.id ? ' is-selected' : '')
                        }
                        key={order.id}
                        type="button"
                        aria-pressed={selectedOrderId === order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <span className={'order-priority is-' + priority.tone}>
                          {priority.label}
                        </span>
                        <span className="order-row-code">{order.code}</span>
                        <span className="order-row-customer">
                          {order.customer.name} · {order.customer.phone}
                        </span>
                        <span className="order-row-meta">
                          {stateLabels[order.status] || order.status} ·{' '}
                          {paymentStatuses[order.paymentStatus] || order.paymentStatus}
                        </span>
                        <span className="order-row-total">{priceLabel(order.total)}</span>
                        <time dateTime={order.createdAt}>
                          {new Date(order.createdAt).toLocaleString('vi-VN')}
                        </time>
                        {order.isOwnOrder && (
                          <span className="order-own-label">Đơn của bạn · chỉ xem</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="order-queue-detail">
                  {activeOrder && (
                    <ManagedOrder
                      key={
                        activeOrder.id +
                        activeOrder.status +
                        activeOrder.paymentStatus +
                        (activeOrder.trackingNumber || '')
                      }
                      order={activeOrder}
                      isAdmin={user.role === 'admin'}
                      onSaved={() => setVersion((value) => value + 1)}
                    />
                  )}
                </div>
              </div>
            )}
            <div className="workspace-pagination">
              <button
                className="button button-outline"
                disabled={page <= 1 || busy}
                onClick={() => setPage((value) => value - 1)}
              >
                Trang trước
              </button>
              <span>
                Trang {page} · {total.toLocaleString('vi-VN')} đơn
              </span>
              <button
                className="button button-outline"
                disabled={page * 20 >= total || busy}
                onClick={() => setPage((value) => value + 1)}
              >
                Trang sau
              </button>
            </div>
          </section>
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
        {tab === 'chat' && <StaffChatInbox currentUser={user} />}
        {tab === 'users' && (
          <section className="staff-admin-section">
            <AdminAccountManagement
              currentUser={user}
              reloadKey={version}
              onUpdated={() => setVersion((value) => value + 1)}
            />
          </section>
        )}
        {tab === 'vouchers' && (
          <section className="staff-admin-section">
            <div>
              <h2>Ưu đãi đã phát hành</h2>
              {vouchers.map((v) => (
                <article className="campaign-card" key={v.id}>
                  <div className="campaign-card-heading">
                    <strong>
                      {v.code} · {v.name}
                    </strong>
                    <span className={'campaign-status' + (!v.active ? ' is-paused' : '')}>
                      {!v.active
                        ? 'Tạm ngưng'
                        : new Date(v.expiresAt).getTime() <= Date.now()
                          ? 'Hết hạn'
                          : new Date(v.startsAt).getTime() > Date.now()
                            ? 'Sắp diễn ra'
                            : 'Đang hoạt động'}
                    </span>
                  </div>
                  <p>
                    {v.type === 'percent' ? v.value + '%' : v.value.toLocaleString('vi-VN') + 'đ'}
                    {' · '}
                    {v.distribution === 'automatic'
                      ? 'Tự động cho khách'
                      : v.distribution === 'targeted'
                        ? 'Cấp đích danh'
                        : 'Mã công khai'}
                    {' · '}
                    {v.distribution === 'automatic'
                      ? `${v.walletCount} ví đã đồng bộ; khách mới tự nhận khi mở ví`
                      : `${v.walletCount} lượt cấp vào ví`}
                  </p>
                  <small>
                    Hiệu lực: {campaignDateLabel(v.startsAt)} – {campaignDateLabel(v.expiresAt)}
                    {' (GMT+7) · '}
                    {v.totalLimit} lượt dùng tối đa · {v.perUserLimit} lượt/khách
                  </small>
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={busy || new Date(v.expiresAt).getTime() <= Date.now()}
                    onClick={() => void toggleVoucher(v)}
                  >
                    {v.active ? 'Tạm ngưng voucher' : 'Kích hoạt lại'}
                  </button>
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
                  Bắt đầu (giờ Việt Nam)
                  <input name="startsAt" type="datetime-local" required />
                </label>
                <label className="field">
                  Kết thúc (giờ Việt Nam)
                  <input name="expiresAt" type="datetime-local" required />
                </label>
              </div>
              <p className="fine-print campaign-timezone-note">
                Mốc thời gian được nhập và hiển thị theo giờ Việt Nam (Asia/Ho_Chi_Minh, GMT+7).
                Thời điểm kết thúc không còn hiệu lực.
              </p>
              <label className="field">
                Cách nhận
                <select
                  name="distribution"
                  value={voucherDistribution}
                  onChange={(event) => {
                    const distribution = event.target.value as Campaign['distribution'];
                    setVoucherDistribution(distribution);
                    if (distribution !== 'targeted') setVoucherRecipients([]);
                  }}
                >
                  <option value="code">Mã công khai — khách nhập khi thanh toán</option>
                  <option value="automatic">Tự động — mọi khách thấy trong ví</option>
                  <option value="targeted">Cấp đích danh — chọn khách nhận</option>
                </select>
              </label>
              {voucherDistribution === 'targeted' && (
                <VoucherRecipientPicker
                  selected={voucherRecipients}
                  onChange={setVoucherRecipients}
                />
              )}
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
    </WorkspaceFrame>
  );
}
