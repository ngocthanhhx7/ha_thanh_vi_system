import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  Gift,
  Headset,
  House,
  LogOut,
  MessageSquareText,
  Package,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  customerApi,
  type CustomerUser,
  type NotificationItem,
  type SystemLogQuery,
} from '../services/customerApi';
import '../pages/workspace.css';

type WorkspaceTab =
  | 'dashboard'
  | 'orders'
  | 'tickets'
  | 'chat'
  | 'users'
  | 'vouchers'
  | 'products'
  | 'site'
  | 'stats'
  | 'notifications'
  | 'logs';

const labels: Record<WorkspaceTab, string> = {
  dashboard: 'Tổng quan',
  orders: 'Đơn hàng',
  tickets: 'Chăm sóc khách',
  chat: 'Hộp thư Vị Ơi',
  users: 'Nhân sự & tài khoản',
  vouchers: 'Ưu đãi',
  products: 'Sản phẩm',
  site: 'Nội dung website',
  stats: 'Báo cáo',
  notifications: 'Thông báo',
  logs: 'Nhật ký hệ thống',
};

const iconFor: Record<WorkspaceTab, typeof House> = {
  dashboard: House,
  orders: ClipboardList,
  tickets: Headset,
  chat: MessageSquareText,
  users: Users,
  vouchers: Gift,
  products: Package,
  site: FileText,
  stats: ChartNoAxesCombined,
  notifications: Bell,
  logs: ShieldAlert,
};

function hrefFor(tab: WorkspaceTab, role: CustomerUser['role']) {
  if (tab === 'dashboard')
    return role === 'admin' ? '/admin?tab=overview' : '/quan-tri?tab=dashboard';
  if (['products', 'site', 'stats'].includes(tab)) return '/admin?tab=' + tab;
  return '/quan-tri?tab=' + tab;
}

export function WorkspaceFrame({
  user,
  active,
  children,
}: {
  user: CustomerUser;
  active: WorkspaceTab;
  children: React.ReactNode;
}) {
  const [unread, setUnread] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const tabs: WorkspaceTab[] =
    user.role === 'admin'
      ? [
          'dashboard',
          'orders',
          'tickets',
          'chat',
          'products',
          'users',
          'vouchers',
          'site',
          'stats',
          'notifications',
          'logs',
        ]
      : ['dashboard', 'orders', 'tickets', 'chat', 'notifications'];

  useEffect(() => {
    let activeRequest = true;
    const load = () =>
      customerApi
        .notifications(1, 1)
        .then((response) => {
          if (activeRequest) setUnread(response.unread);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      activeRequest = false;
      window.clearInterval(timer);
    };
  }, [active]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await customerApi.logout();
      window.dispatchEvent(new Event('customer-session-changed'));
      navigate('/tai-khoan', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" to="/" aria-label="Hà Thành Vị">
          <img
            className="workspace-brand-logo"
            src="/brand/logo-light.png"
            alt="Hà Thành Vị"
            width="106"
            height="64"
          />
          <span>
            <small>Không gian vận hành</small>
          </span>
        </Link>
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {user.name.trim().charAt(0).toLocaleUpperCase('vi')}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</small>
          </span>
        </div>
        <nav className="workspace-nav" aria-label="Điều hướng nghiệp vụ">
          <p className="workspace-nav-caption">VẬN HÀNH</p>
          {tabs.map((tab) => {
            const Icon = iconFor[tab];
            return (
              <NavLink
                key={tab}
                to={hrefFor(tab, user.role)}
                className={active === tab ? 'is-active' : ''}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{labels[tab]}</span>
                {tab === 'notifications' && unread > 0 && (
                  <span className="workspace-nav-badge" aria-label={unread + ' chưa đọc'}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="workspace-sidebar-bottom">
          <Link to="/">
            <Boxes size={17} /> Xem website
          </Link>
          <button type="button" onClick={() => void logout()} disabled={loggingOut}>
            <LogOut size={17} /> {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <div className="workspace-mobile-top">
          <Link to="/" className="workspace-brand">
            <img
              className="workspace-brand-logo"
              src="/brand/logo-light.png"
              alt="Hà Thành Vị"
              width="106"
              height="64"
            />
          </Link>
          <Link
            to={hrefFor('notifications', user.role)}
            aria-label={'Thông báo, ' + unread + ' chưa đọc'}
          >
            <Bell size={20} />
            {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
          </Link>
        </div>
        <div className="workspace-page">{children}</div>
      </main>
    </div>
  );
}

export function WorkspaceNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await customerApi.notifications(page, 30);
      setItems(response.notifications);
      setUnread(response.unread);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa tải được thông báo.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page]);

  async function markAllRead() {
    await customerApi.readAllNotifications();
    await load();
  }

  return (
    <section className="workspace-panel workspace-notifications">
      <header className="workspace-section-heading">
        <div>
          <p className="eyebrow">TRUNG TÂM CẬP NHẬT</p>
          <h2>Thông báo</h2>
          <p>{unread} thông báo chưa đọc</p>
        </div>
        <button
          className="button button-outline"
          type="button"
          onClick={() => void markAllRead()}
          disabled={!unread || busy}
        >
          Đánh dấu tất cả đã đọc
        </button>
      </header>
      {error && (
        <p role="alert" className="form-status">
          {error}
        </p>
      )}
      {busy && <p role="status">Đang tải thông báo…</p>}
      {!busy && !items.length && <p className="workspace-empty">Chưa có thông báo mới.</p>}
      <div className="workspace-notification-list">
        {items.map((item) => (
          <article key={item.id} className={!item.readAt ? 'is-unread' : ''}>
            <span className={'workspace-notification-icon is-' + item.category}>
              <Bell size={17} />
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString('vi-VN')}
              </time>
            </div>
            {!item.readAt && (
              <Link
                to={item.href}
                onClick={() => void customerApi.readNotification(item.id)}
                aria-label="Mở thông báo"
              >
                Xem chi tiết
              </Link>
            )}
          </article>
        ))}
      </div>
      <div className="workspace-pagination">
        <button
          className="button button-outline"
          type="button"
          disabled={page <= 1 || busy}
          onClick={() => setPage((value) => value - 1)}
        >
          Trước
        </button>
        <span>Trang {page}</span>
        <button
          className="button button-outline"
          type="button"
          disabled={items.length < 30 || busy}
          onClick={() => setPage((value) => value + 1)}
        >
          Tiếp
        </button>
      </div>
    </section>
  );
}

type SystemLogItem = Awaited<ReturnType<typeof customerApi.systemLogs>>['logs'][number];

function logSeverityLabel(severity: string) {
  return (
    (
      { info: 'Thông tin', warning: 'Cần chú ý', error: 'Lỗi', critical: 'Nghiêm trọng' } as Record<
        string,
        string
      >
    )[severity] || 'Sự kiện'
  );
}

function explainSystemLog(log: SystemLogItem) {
  const path = log.path.toLowerCase();
  if (path.startsWith('/auth/login')) return 'Đăng nhập tài khoản';
  if (path.startsWith('/auth/verify-login')) return 'Xác minh mã đăng nhập';
  if (path.startsWith('/auth/register')) return 'Tạo tài khoản mới';
  if (path.startsWith('/auth/forgot-password')) return 'Yêu cầu đặt lại mật khẩu';
  if (path.startsWith('/auth/reset-password')) return 'Đặt lại mật khẩu';
  if (path.startsWith('/admin/appeals'))
    return log.method === 'PATCH' ? 'Xử lý kháng nghị tài khoản' : 'Xem kháng nghị tài khoản';
  if (path.startsWith('/admin/users'))
    return log.method === 'PATCH' ? 'Cập nhật hồ sơ hoặc quyền tài khoản' : 'Tra cứu tài khoản';
  if (path.startsWith('/admin/orders'))
    return log.method === 'PATCH' ? 'Cập nhật đơn hàng' : 'Tra cứu đơn hàng';
  if (path.startsWith('/admin/products'))
    return log.method === 'DELETE'
      ? 'Xóa sản phẩm'
      : log.method === 'POST'
        ? 'Thêm sản phẩm'
        : log.method === 'PATCH'
          ? 'Cập nhật sản phẩm'
          : 'Tra cứu sản phẩm';
  if (path.startsWith('/admin/system-logs')) return 'Tra cứu nhật ký hệ thống';
  if (path.startsWith('/staff/tickets'))
    return log.method === 'PATCH'
      ? 'Xử lý yêu cầu chăm sóc khách hàng'
      : 'Xem yêu cầu chăm sóc khách hàng';
  if (path.startsWith('/staff/chat-handoffs')) return 'Xử lý yêu cầu gặp nhân viên';
  if (path.startsWith('/admin/vouchers'))
    return log.method === 'POST' ? 'Tạo chương trình ưu đãi' : 'Quản lý chương trình ưu đãi';
  const target =
    (
      {
        order: 'đơn hàng',
        user: 'tài khoản',
        product: 'sản phẩm',
        ticket: 'yêu cầu hỗ trợ',
        appeal: 'kháng nghị',
      } as Record<string, string>
    )[log.targetType || ''] || 'dữ liệu hệ thống';
  const action =
    (
      {
        GET: 'Tra cứu',
        POST: 'Tạo hoặc gửi',
        PUT: 'Thay thế',
        PATCH: 'Cập nhật',
        DELETE: 'Xóa',
      } as Record<string, string>
    )[log.method] || 'Truy cập';
  return action + ' ' + target;
}

function explainLogResult(log: SystemLogItem) {
  if (log.outcome === 'success') return 'Hệ thống đã tiếp nhận và hoàn tất yêu cầu.';
  if (log.statusCode === 400) return 'Thông tin gửi lên chưa hợp lệ; hãy kiểm tra dữ liệu nhập.';
  if (log.statusCode === 401)
    return 'Chưa xác thực được người dùng; có thể phiên đã hết hạn hoặc mã đăng nhập không đúng.';
  if (log.statusCode === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
  if (log.statusCode === 404) return 'Không tìm thấy dữ liệu hoặc đường dẫn được yêu cầu.';
  if (log.statusCode === 429) return 'Đã vượt giới hạn yêu cầu trong khoảng thời gian ngắn.';
  if (log.statusCode >= 500)
    return 'Hệ thống gặp lỗi khi xử lý; cần kiểm tra kỹ thuật nếu lặp lại.';
  return 'Yêu cầu không hoàn tất. Mã phản hồi: ' + log.statusCode + '.';
}

function anomalyCopy(type: string) {
  if (type === 'repeated_auth_failures')
    return 'Nhiều lần xác thực thất bại từ cùng một địa chỉ IP';
  return 'Nhiều lần truy cập bị từ chối từ cùng một địa chỉ IP';
}

export function AdminSystemLogs() {
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof customerApi.systemLogs>>['logs']>([]);
  const [anomalies, setAnomalies] = useState<
    Awaited<ReturnType<typeof customerApi.systemLogs>>['anomalies']
  >([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<SystemLogQuery['severity'] | ''>('');
  const [outcome, setOutcome] = useState<SystemLogQuery['outcome'] | ''>('');
  const [actorRole, setActorRole] = useState<SystemLogQuery['actorRole'] | ''>('');
  const [method, setMethod] = useState<SystemLogQuery['method'] | ''>('');
  const [targetType, setTargetType] = useState<SystemLogQuery['targetType'] | ''>('');
  const [statusCode, setStatusCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const rangeInvalid = Boolean(from && to && from > to);
  const filterActive = Boolean(
    search || severity || outcome || actorRole || method || targetType || statusCode || from || to,
  );

  useEffect(() => {
    let active = true;
    if (rangeInvalid) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      setBusy(false);
      return () => {
        active = false;
      };
    }
    setError('');
    const timer = window.setTimeout(() => {
      setBusy(true);
      customerApi
        .systemLogs({
          page,
          limit: 50,
          q: search.trim(),
          severity: severity || undefined,
          outcome: outcome || undefined,
          actorRole: actorRole || undefined,
          method: method || undefined,
          targetType: targetType || undefined,
          statusCode: statusCode || undefined,
          from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
          to: to ? new Date(to + 'T23:59:59.999').toISOString() : undefined,
        })
        .then((result) => {
          if (!active) return;
          setLogs(result.logs);
          setTotal(result.total);
          setAnomalies(result.anomalies);
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Chưa tải được nhật ký.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    page,
    search,
    severity,
    outcome,
    actorRole,
    method,
    targetType,
    statusCode,
    from,
    to,
    rangeInvalid,
  ]);

  function clearFilters() {
    setSearch('');
    setSeverity('');
    setOutcome('');
    setActorRole('');
    setMethod('');
    setTargetType('');
    setStatusCode('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));
  return (
    <section className="workspace-panel workspace-system-logs" aria-label="Nhật ký hệ thống">
      <header className="workspace-log-heading">
        <div>
          <p className="eyebrow">AN TOÀN & KIỂM SOÁT</p>
          <h2>Hoạt động được ghi nhận</h2>
          <p>{total.toLocaleString('vi-VN')} sự kiện phù hợp · Mới nhất trước</p>
        </div>
        <span className="workspace-log-window">
          <Activity size={15} /> Cập nhật trực tiếp khi lọc
        </span>
      </header>
      {anomalies.length > 0 && (
        <section className="workspace-log-alerts" aria-label="Cảnh báo hành động bất thường">
          <header>
            <AlertTriangle size={18} />
            <div>
              <strong>Có tín hiệu cần rà soát</strong>
              <p>Đây là cảnh báo theo ngưỡng, không tự kết luận có tấn công.</p>
            </div>
          </header>
          {anomalies.map((anomaly) => (
            <article key={anomaly.type + anomaly.actorIp}>
              <div>
                <strong>{anomalyCopy(anomaly.type)}</strong>
                <p>
                  {anomaly.count} lần trong {anomaly.windowMinutes} phút (ngưỡng {anomaly.threshold}
                  )
                </p>
              </div>
              <span>IP {anomaly.actorIp}</span>
              <time dateTime={anomaly.latestAt}>
                {new Date(anomaly.latestAt).toLocaleTimeString('vi-VN')}
              </time>
            </article>
          ))}
        </section>
      )}
      <div className="workspace-log-quick-filters" role="group" aria-label="Bộ lọc nhanh">
        <button
          type="button"
          aria-pressed={!outcome && !severity}
          onClick={() => {
            setOutcome('');
            setSeverity('');
            setPage(1);
          }}
        >
          Tất cả sự kiện
        </button>
        <button
          type="button"
          aria-pressed={outcome === 'failure' && !severity}
          onClick={() => {
            setOutcome('failure');
            setSeverity('');
            setPage(1);
          }}
        >
          Không thành công
        </button>
        <button
          type="button"
          aria-pressed={severity === 'critical'}
          onClick={() => {
            setSeverity('critical');
            setOutcome('');
            setPage(1);
          }}
        >
          Nghiêm trọng
        </button>
      </div>
      <div className="workspace-log-filters" role="search" aria-label="Lọc nhật ký chi tiết">
        <label className="field workspace-log-search">
          Tìm người dùng, IP, request ID, mã hoặc từ khóa
          <input
            type="search"
            value={search}
            onChange={(event) => updateFilter(setSearch, event.target.value)}
            placeholder="Ví dụ: 403, /admin/users, đăng nhập"
          />
        </label>
        <label className="field">
          Mức độ
          <select
            value={severity}
            onChange={(event) => updateFilter(setSeverity, event.target.value as typeof severity)}
          >
            <option value="">Tất cả mức độ</option>
            <option value="info">Thông tin</option>
            <option value="warning">Cần chú ý</option>
            <option value="error">Lỗi</option>
            <option value="critical">Nghiêm trọng</option>
          </select>
        </label>
        <label className="field">
          Kết quả
          <select
            value={outcome}
            onChange={(event) => updateFilter(setOutcome, event.target.value as typeof outcome)}
          >
            <option value="">Thành công và thất bại</option>
            <option value="success">Thành công</option>
            <option value="failure">Không thành công</option>
          </select>
        </label>
        <label className="field">
          Người thực hiện
          <select
            value={actorRole}
            onChange={(event) => updateFilter(setActorRole, event.target.value as typeof actorRole)}
          >
            <option value="">Tất cả người dùng</option>
            <option value="admin">Quản trị viên</option>
            <option value="staff">Nhân viên</option>
            <option value="customer">Khách hàng</option>
            <option value="guest">Khách chưa đăng nhập</option>
          </select>
        </label>
        <label className="field">
          Loại nghiệp vụ
          <select
            value={targetType}
            onChange={(event) =>
              updateFilter(setTargetType, event.target.value as typeof targetType)
            }
          >
            <option value="">Tất cả loại</option>
            <option value="order">Đơn hàng</option>
            <option value="user">Tài khoản</option>
            <option value="product">Sản phẩm</option>
            <option value="ticket">Chăm sóc khách</option>
            <option value="appeal">Kháng nghị</option>
          </select>
        </label>
        <label className="field">
          Thao tác
          <select
            value={method}
            onChange={(event) => updateFilter(setMethod, event.target.value as typeof method)}
          >
            <option value="">Tất cả thao tác</option>
            <option value="GET">Xem / tra cứu</option>
            <option value="POST">Tạo / gửi</option>
            <option value="PATCH">Cập nhật</option>
            <option value="PUT">Thay thế</option>
            <option value="DELETE">Xóa</option>
          </select>
        </label>
        <label className="field">
          Mã phản hồi
          <select
            value={statusCode}
            onChange={(event) => updateFilter(setStatusCode, event.target.value)}
          >
            <option value="">Tất cả mã</option>
            <option value="400">400 · Dữ liệu chưa hợp lệ</option>
            <option value="401">401 · Chưa xác thực</option>
            <option value="403">403 · Không đủ quyền</option>
            <option value="404">404 · Không tìm thấy</option>
            <option value="429">429 · Quá nhiều yêu cầu</option>
            <option value="500">500 · Lỗi hệ thống</option>
            <option value="503">503 · Tạm thời không khả dụng</option>
          </select>
        </label>
        <label className="field">
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(event) => updateFilter(setFrom, event.target.value)}
          />
        </label>
        <label className="field">
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(event) => updateFilter(setTo, event.target.value)}
          />
        </label>
        {filterActive && (
          <button className="workspace-log-clear" type="button" onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="form-status">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="workspace-log-loading">
          Đang lọc nhật ký…
        </p>
      )}
      {!busy && !logs.length && !error && (
        <p className="workspace-empty">Không tìm thấy sự kiện phù hợp. Thử xóa một vài bộ lọc.</p>
      )}
      <div className="workspace-log-list" aria-busy={busy}>
        {logs.map((log) => (
          <article key={log.id} className={'workspace-log-entry is-' + log.severity}>
            <span className={'workspace-severity is-' + log.severity}>
              {logSeverityLabel(log.severity)}
            </span>
            <div className="workspace-log-main">
              <div className="workspace-log-event-head">
                <strong>{explainSystemLog(log)}</strong>
                <time dateTime={log.createdAt}>
                  {new Date(log.createdAt).toLocaleString('vi-VN')}
                </time>
              </div>
              <p className="workspace-log-plain-result">{explainLogResult(log)}</p>
              <div className="workspace-log-meta">
                <span>
                  {log.actorName || 'Khách chưa đăng nhập'}
                  {log.actorRole
                    ? ' · ' +
                      (
                        {
                          admin: 'Quản trị viên',
                          staff: 'Nhân viên',
                          customer: 'Khách hàng',
                        } as Record<string, string>
                      )[log.actorRole]
                    : ''}
                </span>
                <span className={log.outcome === 'failure' ? 'is-failure' : 'is-success'}>
                  {log.outcome === 'success' ? 'Đã hoàn tất' : 'Không thành công'} · HTTP{' '}
                  {log.statusCode}
                </span>
              </div>
              <details className="workspace-log-details">
                <summary>Xem thông tin kỹ thuật</summary>
                <dl>
                  <div>
                    <dt>Thao tác</dt>
                    <dd>
                      {log.method} {log.path}
                    </dd>
                  </div>
                  <div>
                    <dt>Mã lý do</dt>
                    <dd>
                      {log.reasonCode
                        ? log.reasonCode + ' — ' + explainLogResult(log)
                        : 'Không có mã lỗi'}
                    </dd>
                  </div>
                  <div>
                    <dt>Địa chỉ IP</dt>
                    <dd>{log.actorIp || 'Không ghi nhận'}</dd>
                  </div>
                  <div>
                    <dt>Đối tượng</dt>
                    <dd>
                      {log.targetType || 'Không xác định'}
                      {log.targetId ? ' · ' + log.targetId : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Mã yêu cầu</dt>
                    <dd>{log.requestId}</dd>
                  </div>
                </dl>
                {log.actorUserAgent && <p>Thiết bị: {log.actorUserAgent}</p>}
              </details>
            </div>
          </article>
        ))}
      </div>
      <div className="workspace-pagination">
        <button
          className="button button-outline"
          type="button"
          disabled={page <= 1 || busy}
          onClick={() => setPage((value) => value - 1)}
        >
          Trước
        </button>
        <span>
          Trang {page} / {pageCount}
        </span>
        <button
          className="button button-outline"
          type="button"
          disabled={page >= pageCount || busy}
          onClick={() => setPage((value) => value + 1)}
        >
          Tiếp
        </button>
      </div>
      <p className="workspace-security-note">
        <Activity size={15} /> Nhật ký không lưu nội dung yêu cầu, mật khẩu, OTP hoặc khóa bí mật.
        Cảnh báo chỉ là tín hiệu để con người kiểm tra.
      </p>
    </section>
  );
}
