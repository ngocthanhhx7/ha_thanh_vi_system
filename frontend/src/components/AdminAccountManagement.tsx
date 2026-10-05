import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { customerApi, type AccountAppeal, type CustomerUser } from '../services/customerApi';
import { request } from '../services/api';

type Props = {
  currentUser: CustomerUser;
  reloadKey: number;
  onUpdated: () => void;
};

const ACCOUNT_PAGE_SIZE = 25;
type AccountRoleFilter = CustomerUser['role'] | 'all';
type AccountStatusFilter = CustomerUser['accountStatus'] | 'all';
type AccountSort =
  'name-asc' | 'name-desc' | 'email-asc' | 'email-desc' | 'role-asc' | 'status-asc';

const roleLabels: Record<CustomerUser['role'], string> = {
  customer: 'Khách hàng',
  staff: 'Nhân viên',
  admin: 'Quản trị viên',
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(-2)
    .join('')
    .toLocaleUpperCase('vi');
}

function AccountAppealCard({
  appeal,
  onReviewed,
}: {
  appeal: AccountAppeal;
  onReviewed: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(decision: 'approve' | 'reject') {
    if (decision === 'reject' && note.trim().length < 5) {
      setError('Hãy ghi ít nhất 5 ký tự giải thích quyết định từ chối.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await customerApi.reviewAccountAppeal(appeal.id, decision, note.trim());
      onReviewed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xử lý được kháng nghị.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="admin-appeal-card">
      <div className="admin-appeal-person">
        <span className="admin-account-avatar" aria-hidden="true">
          {initials(appeal.userName)}
        </span>
        <div>
          <strong>{appeal.userName}</strong>
          <span>{appeal.userEmail}</span>
        </div>
        <time dateTime={appeal.submittedAt}>
          {new Date(appeal.submittedAt).toLocaleString('vi-VN')}
        </time>
      </div>
      <p className="admin-appeal-message">{appeal.message}</p>
      <label className="field">
        Ghi chú quyết định <span>(bắt buộc khi từ chối)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1000}
        />
      </label>
      <div className="admin-account-actions">
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => void review('approve')}
        >
          {busy ? 'Đang xử lý…' : 'Chấp thuận và mở tài khoản'}
        </button>
        <button
          className="button button-outline"
          type="button"
          disabled={busy || note.trim().length < 5}
          onClick={() => void review('reject')}
        >
          Từ chối kháng nghị
        </button>
      </div>
      {error && (
        <p className="form-status" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function AdminAccountRow({
  user,
  currentUser,
  expanded,
  onToggle,
  onUpdated,
}: {
  user: CustomerUser;
  currentUser: CustomerUser;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [role, setRole] = useState(user.role);
  const [accountStatus, setAccountStatus] = useState(user.accountStatus);
  const [reason, setReason] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof customerApi.accountAudit>>['audit']>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const previousUser = useRef(user);
  const isSelf = user.id === currentUser.id;
  const reasonRequired =
    accountStatus === 'suspended' && user.accountStatus !== 'suspended' && !isSelf;
  const isDirty =
    name !== user.name ||
    phone !== user.phone ||
    role !== user.role ||
    accountStatus !== user.accountStatus;

  useEffect(() => {
    if (previousUser.current === user) return;
    const previous = previousUser.current;
    if (name === previous.name) setName(user.name);
    if (phone === previous.phone) setPhone(user.phone);
    if (role === previous.role) setRole(user.role);
    if (accountStatus === previous.accountStatus) setAccountStatus(user.accountStatus);
    previousUser.current = user;
  }, [user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await customerApi.updateAdminUser(user.id, {
        name,
        phone,
        role,
        accountStatus,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setName(result.user.name);
      setPhone(result.user.phone);
      setRole(result.user.role);
      setAccountStatus(result.user.accountStatus);
      setReason('');
      setNotice('Đã lưu thay đổi tài khoản.');
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được thay đổi.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAudit() {
    const next = !auditOpen;
    setAuditOpen(next);
    if (!next || audit.length) return;
    setAuditLoading(true);
    setAuditError('');
    try {
      setAudit((await customerApi.accountAudit(user.id)).audit);
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : 'Chưa tải được nhật ký.');
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <article className={'admin-account-card' + (expanded ? ' is-expanded' : '')}>
      <div className="admin-account-summary">
        <span className="admin-account-avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <div className="admin-account-identity">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <small>{user.phone || 'Chưa có số điện thoại'}</small>
        </div>
        <span className={'admin-account-role is-' + user.role}>{roleLabels[user.role]}</span>
        <span className={'admin-account-status is-' + user.accountStatus}>
          {user.accountStatus === 'active' ? 'Đang hoạt động' : 'Đã tạm khóa'}
        </span>
        <button
          className="admin-account-open"
          type="button"
          aria-expanded={expanded}
          aria-controls={'account-details-' + user.id}
          onClick={onToggle}
        >
          {expanded ? 'Thu gọn' : 'Quản lý hồ sơ'}
        </button>
      </div>
      {expanded && (
        <div className="admin-account-expanded" id={'account-details-' + user.id}>
          {user.accountStatus === 'suspended' && user.accountStatusReason && (
            <p className="admin-account-reason">
              <strong>Lý do tạm khóa:</strong> {user.accountStatusReason}
            </p>
          )}
          <form className="admin-account-form" onSubmit={save}>
            <div className="admin-account-form-heading">
              <div>
                <p className="eyebrow">HỒ SƠ TÀI KHOẢN</p>
                <h3>Thông tin và quyền truy cập</h3>
              </div>
              {isSelf && <span className="admin-account-self-tag">Tài khoản của bạn</span>}
            </div>
            <label className="field">
              Họ và tên
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label className="field">
              Email đăng nhập
              <input value={user.email} readOnly aria-describedby={'email-note-' + user.id} />
              <small id={'email-note-' + user.id}>Email xác thực không thể sửa tại đây.</small>
            </label>
            <label className="field">
              Số điện thoại
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={20}
                autoComplete="tel"
              />
            </label>
            <label className="field">
              Vai trò
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as CustomerUser['role'])}
                disabled={isSelf}
              >
                <option value="customer">Khách hàng</option>
                <option value="staff">Nhân viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </label>
            <label className="field">
              Trạng thái tài khoản
              <select
                value={accountStatus}
                onChange={(event) =>
                  setAccountStatus(event.target.value as CustomerUser['accountStatus'])
                }
                disabled={isSelf}
              >
                <option value="active">Đang hoạt động</option>
                <option value="suspended">Tạm khóa</option>
              </select>
            </label>
            {accountStatus === 'suspended' && !isSelf && (
              <label className="field admin-account-reason-field">
                Lý do / ghi chú thay đổi {reasonRequired ? '(bắt buộc)' : '(không bắt buộc)'}
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={1500}
                  required={reasonRequired}
                />
                {reasonRequired && (
                  <small>
                    Ghi lý do để nhân sự hiểu quyết định và giúp bộ phận quản trị truy vết.
                  </small>
                )}
              </label>
            )}
            <div className="admin-account-form-footer">
              {isSelf && (
                <small className="admin-account-self-note">
                  Không thể tự đổi vai trò hoặc trạng thái của tài khoản đang đăng nhập.
                </small>
              )}
              <div className="admin-account-actions">
                <button
                  className="button"
                  type="submit"
                  disabled={busy || !isDirty || (reasonRequired && !reason.trim())}
                >
                  {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => void toggleAudit()}
                  disabled={auditLoading}
                >
                  {auditLoading
                    ? 'Đang tải nhật ký…'
                    : auditOpen
                      ? 'Ẩn nhật ký'
                      : 'Xem nhật ký thay đổi'}
                </button>
              </div>
            </div>
            {error && (
              <p className="form-status" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="form-status" role="status">
                {notice}
              </p>
            )}
          </form>
          {auditOpen && (
            <div className="admin-account-audit" aria-label={'Nhật ký của ' + user.name}>
              {auditError && (
                <p className="form-status" role="alert">
                  {auditError}
                </p>
              )}
              {auditLoading && <p role="status">Đang tải nhật ký…</p>}
              {!audit.length && !auditLoading && !auditError && (
                <p>Chưa có thay đổi được ghi nhận.</p>
              )}
              {audit.map((entry) => (
                <article key={entry.id}>
                  <header>
                    <strong>{entry.action}</strong>
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString('vi-VN')}
                    </time>
                  </header>
                  <p>
                    Thực hiện bởi {entry.actorName} · {entry.actorEmail}
                  </p>
                  {(entry.actorIp || entry.actorUserAgent) && (
                    <small>
                      {entry.actorIp && <>IP: {entry.actorIp}</>}
                      {entry.actorIp && entry.actorUserAgent && ' · '}
                      {entry.actorUserAgent && <>Thiết bị: {entry.actorUserAgent}</>}
                    </small>
                  )}
                  {entry.changes.map((change) => (
                    <p key={change.field}>
                      {change.field}: {String(change.before ?? '—')} → {String(change.after ?? '—')}
                    </p>
                  ))}
                  {entry.reason && <p>Lý do: {entry.reason}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function AdminAccountManagement({ currentUser, reloadKey, onUpdated }: Props) {
  const [appeals, setAppeals] = useState<AccountAppeal[]>([]);
  const [appealsOpen, setAppealsOpen] = useState(false);
  const [appealsLoading, setAppealsLoading] = useState(true);
  const [appealsError, setAppealsError] = useState('');
  const [accounts, setAccounts] = useState<{ users: CustomerUser[]; total: number }>({
    users: [],
    total: 0,
  });
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AccountRoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [sort, setSort] = useState<AccountSort>('name-asc');
  const [page, setPage] = useState(1);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [staffNotice, setStaffNotice] = useState('');
  const [staffError, setStaffError] = useState('');

  const refreshAppeals = useCallback(async () => {
    setAppealsError('');
    setAppealsLoading(true);
    try {
      const result = await customerApi.accountAppeals();
      setAppeals(result.appeals);
      setAppealsOpen(result.appeals.length > 0);
    } catch (cause) {
      setAppealsError(
        cause instanceof Error ? cause.message : 'Chưa tải được danh sách kháng nghị.',
      );
    } finally {
      setAppealsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAppeals();
  }, [refreshAppeals]);

  const sortField = sort.startsWith('name')
    ? 'name'
    : sort.startsWith('email')
      ? 'email'
      : sort === 'role-asc'
        ? 'role'
        : sort === 'status-asc'
          ? 'accountStatus'
          : 'createdAt';
  const direction = sort.endsWith('-desc') ? 'desc' : 'asc';

  useEffect(() => {
    let active = true;
    setAccountsLoading(true);
    setAccountsError('');
    const timer = window.setTimeout(() => {
      customerApi
        .adminUsers({
          page,
          limit: ACCOUNT_PAGE_SIZE,
          q: search.trim(),
          role: roleFilter,
          accountStatus: statusFilter,
          sort: sortField,
          direction,
        })
        .then((result) => {
          if (active) setAccounts({ users: result.users, total: result.total });
        })
        .catch((cause) => {
          if (active)
            setAccountsError(cause instanceof Error ? cause.message : 'Chưa tải được tài khoản.');
        })
        .finally(() => {
          if (active) setAccountsLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, search, roleFilter, statusFilter, sortField, direction, reloadKey]);

  const pageCount = Math.max(1, Math.ceil(accounts.total / ACCOUNT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function changeRoleFilter(role: AccountRoleFilter) {
    setRoleFilter(role);
    setPage(1);
    setExpandedAccountId(null);
  }

  function clearFilters() {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setSort('name-asc');
    setPage(1);
    setExpandedAccountId(null);
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreating(true);
    setStaffError('');
    setStaffNotice('');
    try {
      await request('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setCreateOpen(false);
      setRoleFilter('staff');
      setPage(1);
      setStaffNotice(
        'Đã tạo tài khoản nhân viên. Hãy gửi thông tin đăng nhập an toàn cho nhân sự.',
      );
      onUpdated();
    } catch (cause) {
      setStaffError(cause instanceof Error ? cause.message : 'Chưa tạo được tài khoản nhân viên.');
    } finally {
      setCreating(false);
    }
  }

  const roleFilters: { value: AccountRoleFilter; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'staff', label: 'Nhân viên' },
    { value: 'admin', label: 'Quản trị viên' },
    { value: 'customer', label: 'Khách hàng' },
  ];
  const hasFilters =
    Boolean(search.trim()) || roleFilter !== 'all' || statusFilter !== 'all' || sort !== 'name-asc';

  return (
    <div className="admin-account-management">
      <header className="admin-account-page-heading">
        <div>
          <p className="eyebrow">QUẢN TRỊ NHÂN SỰ</p>
          <h2>Tài khoản & quyền truy cập</h2>
          <p>Tìm hồ sơ, cập nhật quyền và kiểm soát trạng thái trong một danh sách duy nhất.</p>
        </div>
        <button
          className="button"
          type="button"
          aria-expanded={createOpen}
          onClick={() => {
            setCreateOpen((open) => !open);
            setStaffError('');
          }}
        >
          {createOpen ? 'Đóng biểu mẫu' : 'Thêm nhân viên'}
        </button>
      </header>
      {staffNotice && (
        <p className="form-status" role="status">
          {staffNotice}
        </p>
      )}
      {createOpen && (
        <form className="admin-staff-create" onSubmit={createStaff}>
          <div className="admin-staff-create-heading">
            <div>
              <p className="eyebrow">TÀI KHOẢN NỘI BỘ</p>
              <h3>Tạo nhân viên mới</h3>
            </div>
            <p>
              Nhân viên đăng nhập bằng email và mật khẩu khởi tạo. Không dùng lại mật khẩu cá nhân
              của bạn.
            </p>
          </div>
          <div className="admin-staff-create-grid">
            <label className="field">
              Họ tên
              <input name="name" required minLength={2} maxLength={100} autoComplete="name" />
            </label>
            <label className="field">
              Email
              <input name="email" required type="email" maxLength={254} autoComplete="email" />
            </label>
            <label className="field">
              Số điện thoại
              <input name="phone" required type="tel" maxLength={20} autoComplete="tel" />
            </label>
            <div className="field">
              <label htmlFor="admin-staff-password">Mật khẩu ban đầu</label>
              <input
                id="admin-staff-password"
                name="password"
                required
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                aria-describedby="admin-staff-password-hint"
              />
              <small id="admin-staff-password-hint">
                Tối thiểu 10 ký tự; nhân viên nên đổi mật khẩu sau lần đăng nhập đầu.
              </small>
            </div>
          </div>
          {staffError && (
            <p className="form-status" role="alert">
              {staffError}
            </p>
          )}
          <div className="admin-account-actions">
            <button className="button" type="submit" disabled={creating}>
              {creating ? 'Đang tạo…' : 'Tạo nhân viên'}
            </button>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      <section className={'admin-appeals-section' + (appeals.length ? ' has-pending' : '')}>
        <div className="admin-appeal-overview">
          <div>
            <p className="eyebrow">XÁC MINH TÀI KHOẢN</p>
            <h3>
              {appealsLoading
                ? 'Đang kiểm tra kháng nghị…'
                : appeals.length
                  ? 'Kháng nghị cần xem xét'
                  : 'Kháng nghị tài khoản'}
            </h3>
            <p>
              {appealsLoading
                ? 'Đang tải dữ liệu xác minh.'
                : appeals.length
                  ? 'Đánh giá nội dung trước khi mở lại quyền truy cập.'
                  : 'Không có kháng nghị chờ xử lý.'}
            </p>
          </div>
          <div className="admin-appeal-overview-actions">
            <span className={'admin-appeal-count' + (appeals.length ? ' has-count' : '')}>
              {appeals.length}
            </span>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setAppealsOpen((open) => !open)}
              aria-expanded={appealsOpen}
              disabled={appealsLoading}
            >
              {appealsOpen ? 'Ẩn' : appeals.length ? 'Xem kháng nghị' : 'Chi tiết'}
            </button>
            <button
              className="admin-refresh-button"
              type="button"
              onClick={() => void refreshAppeals()}
              disabled={appealsLoading}
              aria-label="Làm mới kháng nghị"
            >
              Làm mới
            </button>
          </div>
        </div>
        {appealsError && (
          <p className="form-status" role="alert">
            {appealsError}
          </p>
        )}
        {appealsOpen && appeals.length > 0 && (
          <div className="admin-appeal-list">
            {appeals.map((appeal) => (
              <AccountAppealCard
                key={appeal.id}
                appeal={appeal}
                onReviewed={() => {
                  void refreshAppeals();
                  onUpdated();
                }}
              />
            ))}
          </div>
        )}
        {appealsOpen && !appealsLoading && !appeals.length && !appealsError && (
          <p className="admin-appeal-empty">Không có hồ sơ nào cần bạn xem xét.</p>
        )}
      </section>

      <section className="admin-accounts-section">
        <div className="admin-account-list-heading">
          <div>
            <p className="eyebrow">DANH BẠ HỆ THỐNG</p>
            <h3>Danh sách tài khoản</h3>
          </div>
          <span className="admin-account-total" aria-live="polite">
            {accountsLoading ? 'Đang tải…' : `${accounts.total.toLocaleString('vi-VN')} kết quả`}
          </span>
        </div>
        <div className="admin-account-role-tabs" role="group" aria-label="Lọc theo nhóm tài khoản">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={roleFilter === filter.value}
              onClick={() => changeRoleFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="admin-account-toolbar" role="search" aria-label="Tìm và lọc tài khoản">
          <label className="field admin-account-search">
            Tìm theo tên, email hoặc số điện thoại
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Ví dụ: Nguyễn Hà My"
            />
          </label>
          <label className="field">
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as AccountStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="suspended">Đã tạm khóa</option>
            </select>
          </label>
          <label className="field">
            Sắp xếp
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as AccountSort);
                setPage(1);
              }}
            >
              <option value="name-asc">Tên A–Z</option>
              <option value="name-desc">Tên Z–A</option>
              <option value="email-asc">Email A–Z</option>
              <option value="email-desc">Email Z–A</option>
              <option value="role-asc">Vai trò A–Z</option>
              <option value="status-asc">Trạng thái A–Z</option>
            </select>
          </label>
          {hasFilters && (
            <button className="admin-clear-filters" type="button" onClick={clearFilters}>
              Xóa bộ lọc
            </button>
          )}
        </div>
        <p className="admin-account-result-count" aria-live="polite">
          {accountsLoading
            ? 'Đang tìm tài khoản…'
            : accounts.total
              ? `Đang hiển thị ${(currentPage - 1) * ACCOUNT_PAGE_SIZE + 1}–${Math.min(currentPage * ACCOUNT_PAGE_SIZE, accounts.total)} trong ${accounts.total} tài khoản.`
              : 'Không có tài khoản phù hợp.'}
        </p>
        {accountsError && (
          <p className="form-status" role="alert">
            {accountsError}
          </p>
        )}
        <div className="admin-account-list" aria-busy={accountsLoading}>
          {accounts.users.map((account) => (
            <AdminAccountRow
              key={account.id}
              user={account}
              currentUser={currentUser}
              expanded={expandedAccountId === account.id}
              onToggle={() => setExpandedAccountId((id) => (id === account.id ? null : account.id))}
              onUpdated={onUpdated}
            />
          ))}
        </div>
        {!accountsLoading && !accountsError && !accounts.total && (
          <p className="admin-account-empty">
            Không tìm thấy tài khoản phù hợp. Thử từ khóa khác hoặc xóa bớt bộ lọc.
          </p>
        )}
        {pageCount > 1 && (
          <nav className="admin-account-pagination" aria-label="Phân trang tài khoản">
            <button
              className="button button-outline"
              type="button"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={currentPage === 1 || accountsLoading}
            >
              Trang trước
            </button>
            <span aria-current="page">
              Trang {currentPage} / {pageCount}
            </span>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setPage((previous) => Math.min(pageCount, previous + 1))}
              disabled={currentPage === pageCount || accountsLoading}
            >
              Trang tiếp
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
