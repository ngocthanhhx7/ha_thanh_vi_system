import { GameLauncher } from '../components/GameLauncher';
import { CartContents } from '../components/CartContents';
import { ViOiChat } from '../components/ViOiChat';
import { Suspense, useEffect, useRef, useState } from 'react';
import { PageLoading } from '../components/PageLoading';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Gift,
  Headphones,
  LogOut,
  MapPin,
  MessageCircle,
  Menu,
  Phone,
  Package,
  Search,
  ShoppingBag,
  Star,
  UserRound,
  Mail,
} from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { Modal } from '../components/Modal';
import { customerApi, CustomerApiError, type CustomerUser } from '../services/customerApi';
import { useNotificationCenter } from '../components/NotificationCenter';
import './public-shell.css';
const accountSections = [
  { id: 'notifications', label: 'Thông báo', icon: Bell },
  { id: 'orders', label: 'Đơn hàng của tôi', icon: Package },
  { id: 'profile', label: 'Thông tin tài khoản', icon: UserRound },
  { id: 'addresses', label: 'Sổ địa chỉ', icon: MapPin },
  { id: 'vouchers', label: 'Ví ưu đãi', icon: Gift },
  { id: 'reviews', label: 'Đánh giá sản phẩm', icon: Star },
  { id: 'support', label: 'Hỗ trợ & đổi trả', icon: MessageCircle },
];
const links = [
  ['/', 'Trang chủ'],
  ['/cau-chuyen', 'Câu chuyện'],
  ['/san-pham', 'Sản phẩm'],
  ['/tin-tuc', 'Tin tức'],
  ['/ve-chung-toi', 'Về chúng tôi'],
  ['/lien-he', 'Liên hệ'],
];
export function Layout() {
  const { unreadCount } = useNotificationCenter();
  const {
    content: { site, products },
    cart,
  } = useShop();
  const location = useLocation();
  const isGames = /^\/tro-choi\/?$/.test(location.pathname);
  const navigate = useNavigate();
  const [panel, setPanel] = useState<'menu' | 'search' | 'cart' | null>(null);
  const [query, setQuery] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<CustomerUser | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const accountMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setPanel(null);
    setAccountMenuOpen(false);
    const title =
      location.pathname === '/tro-choi'
        ? 'Chơi cùng Hà Thành Vị'
        : links.find((x) => x[0] === location.pathname)?.[1] || 'Khám phá';
    document.title =
      (location.pathname === '/tin-tuc' ? 'Tin tức ẩm thực Hà Nội' : title) + ' | Hà Thành Vị';
  }, [location.pathname]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    let active = true;
    setAccountLoading(true);
    setAccountError('');
    customerApi
      .me()
      .then(({ user }) => {
        if (active) setAccountUser(user);
      })
      .catch((reason) => {
        if (!active) return;
        setAccountUser(null);
        if (!(reason instanceof CustomerApiError && reason.status === 401))
          setAccountError(reason instanceof Error ? reason.message : 'Chưa tải được tài khoản.');
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenu.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      active = false;
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    const refreshAccount = () => {
      customerApi
        .me()
        .then(({ user }) => setAccountUser(user))
        .catch(() => setAccountUser(null));
    };
    window.addEventListener('customer-session-changed', refreshAccount);
    return () => window.removeEventListener('customer-session-changed', refreshAccount);
  }, []);
  async function logoutFromAccountMenu() {
    try {
      await customerApi.logout();
      setAccountUser(null);
      setAccountError('');
      setAccountMenuOpen(false);
      window.dispatchEvent(new Event('customer-session-changed'));
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'Chưa thể đăng xuất.');
    }
  }
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className={isGames ? 'public-layout game-shell' : 'public-layout'}>
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <div className="announcement">
        <span>MỘT THỨC QUÀ HÀ NỘI · MỘT CHÚT TÌNH GỬI TRAO</span>
        <a href={'tel:' + site.phone}>
          <Phone size={12} />
          0973 607 163
        </a>
      </div>
      <header className="header">
        <Link to="/" className="brand" aria-label="Hà Thành Vị - Trang chủ">
          <img src="/brand/logo.png" alt="Hà Thành Vị" width="122" height="72" />
        </Link>
        <nav aria-label="Điều hướng chính" className="desktop-nav">
          {links.map(([to, label]) => (
            <NavLink to={to} end key={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Tìm sản phẩm"
            onClick={() => setPanel('search')}
          >
            <Search size={21} />
          </button>
          <div className="account-menu-wrap" ref={accountMenu}>
            <button
              type="button"
              className="icon-button account-button"
              aria-label={
                'Mở menu tài khoản' + (unreadCount ? `, ${unreadCount} thông báo chưa đọc` : '')
              }
              aria-expanded={accountMenuOpen}
              aria-controls="account-dropdown"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <UserRound size={21} />
              {unreadCount > 0 && <span className="account-notification-dot" aria-hidden="true" />}
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown" id="account-dropdown">
                <div className="account-dropdown-heading">
                  <strong>{accountUser?.name || 'Tài khoản của bạn'}</strong>
                  <span>
                    {accountLoading
                      ? 'Đang kiểm tra tài khoản…'
                      : accountUser
                        ? accountUser.role === 'admin'
                          ? 'Quản trị viên'
                          : accountUser.role === 'staff'
                            ? 'Nhân viên Hà Thành Vị'
                            : accountUser.email
                        : 'Đăng nhập để quản lý đơn hàng và ưu đãi'}
                  </span>
                </div>
                {accountError && (
                  <p className="account-dropdown-error" role="alert">
                    {accountError}
                  </p>
                )}
                {accountLoading ? (
                  <div className="account-dropdown-loading" role="status" aria-busy="true">
                    <span className="visually-hidden">Đang tải các lối tắt…</span>
                    <div className="account-dropdown-skeleton" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <Link to="/tra-cuu-don-hang" onClick={() => setAccountMenuOpen(false)}>
                      Tra cứu đơn hàng <ArrowRight size={16} />
                    </Link>
                  </div>
                ) : accountUser ? (
                  <>
                    <nav className="account-dropdown-links" aria-label="Tài khoản của tôi">
                      {accountSections.map(({ id, label, icon: Icon }) => (
                        <Link
                          key={id}
                          to={`/tai-khoan?section=${id}`}
                          onClick={() => setAccountMenuOpen(false)}
                        >
                          <Icon size={18} />
                          {id === 'notifications' && unreadCount > 0
                            ? `${label} · ${unreadCount} mới`
                            : label}
                        </Link>
                      ))}
                    </nav>
                    {accountUser.role !== 'customer' && (
                      <div className="account-dropdown-group">
                        <span>Công việc</span>
                        <Link to="/quan-tri?tab=orders" onClick={() => setAccountMenuOpen(false)}>
                          <Package size={18} /> Đơn hàng
                        </Link>
                        <Link to="/quan-tri?tab=tickets" onClick={() => setAccountMenuOpen(false)}>
                          <MessageCircle size={18} /> Chăm sóc khách hàng
                        </Link>
                        <Link to="/quan-tri?tab=chat" onClick={() => setAccountMenuOpen(false)}>
                          <Headphones size={18} /> Tư vấn chat
                        </Link>
                        {accountUser.role === 'admin' && (
                          <>
                            <Link
                              to="/quan-tri?tab=vouchers"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              <Gift size={18} /> Quản lý ưu đãi
                            </Link>
                            <Link
                              to="/quan-tri?tab=users"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              <UserRound size={18} /> Quản lý nhân sự
                            </Link>
                            <Link
                              to="/admin?tab=products"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              <ArrowUpRight size={18} /> Quản trị sản phẩm
                            </Link>
                            <Link to="/admin?tab=site" onClick={() => setAccountMenuOpen(false)}>
                              <ArrowUpRight size={18} /> Nội dung thương hiệu
                            </Link>
                            <Link to="/admin?tab=stats" onClick={() => setAccountMenuOpen(false)}>
                              <ArrowUpRight size={18} /> Thống kê cửa hàng
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="account-dropdown-logout"
                      onClick={() => void logoutFromAccountMenu()}
                    >
                      <LogOut size={18} /> Đăng xuất
                    </button>
                  </>
                ) : (
                  <nav className="account-dropdown-links" aria-label="Truy cập tài khoản">
                    <Link to="/tai-khoan" onClick={() => setAccountMenuOpen(false)}>
                      <UserRound size={18} /> Đăng nhập hoặc tạo tài khoản
                    </Link>
                    <Link to="/tra-cuu-don-hang" onClick={() => setAccountMenuOpen(false)}>
                      <Package size={18} /> Tra cứu đơn hàng
                    </Link>
                    <Link to="/gio-hang" onClick={() => setAccountMenuOpen(false)}>
                      <ShoppingBag size={18} /> Giỏ hàng của bạn
                    </Link>
                  </nav>
                )}
              </div>
            )}
          </div>
          <button
            className="icon-button cart-button"
            aria-label={'Mở giỏ hàng, ' + count + ' sản phẩm'}
            onClick={() => setPanel('cart')}
          >
            <ShoppingBag size={22} />
            <span>{count}</span>
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label="Mở menu"
            onClick={() => setPanel('menu')}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main id="main-content">
        <Suspense key={location.pathname} fallback={<PageLoading />}>
          <div
            className={location.key === 'default' ? 'page-entry page-entry-initial' : 'page-entry'}
          >
            <Outlet />
          </div>
        </Suspense>
      </main>
      <section className="closing-strip">
        <img src="/brand/ornament.webp" alt="" />
        <span>HÀ THÀNH VỊ</span>
        <span>VỊ XƯA TINH HOA TRONG TỪNG CHIẾC BÁNH</span>
        <img src="/brand/ornament.webp" alt="" />
      </section>
      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/brand/logo-light.png" alt="Hà Thành Vị" width="150" height="95" />
            <p>
              Một thức quà nhỏ,
              <br />
              gói ghém cả Hà Nội thương.
            </p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <Link to="/tai-khoan">Tài khoản của bạn</Link>
            <Link to="/tra-cuu-don-hang">Tra cứu đơn hàng</Link>
            {links.slice(1).map(([to, label]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </div>
          <div>
            <h3>Ghé thăm Hà Thành Vị</h3>
            <p>
              <MapPin size={16} />
              {site.address}
            </p>
            <a href={'tel:' + site.phone}>
              <Phone size={16} />
              0973 607 163
            </a>
            <a href={'mailto:' + site.email}>
              <Mail size={16} />
              {site.email}
            </a>
          </div>
          <div>
            <h3>Mình kết nối nhé</h3>
            <a href={site.facebook} target="_blank" rel="noreferrer">
              Facebook <ArrowRight size={16} />
            </a>
            <a href={site.zalo} target="_blank" rel="noreferrer">
              Zalo <ArrowRight size={16} />
            </a>
            <p className="footer-small">
              Bánh ngon, trà thơm.
              <br />
              Câu chuyện cứ thế bắt đầu.
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {site.company}
          </span>
          <span>Được chăm chút bởi Ngọc Thành</span>
        </div>
      </footer>
      <ViOiChat />
      <GameLauncher />
      {panel && (
        <Modal
          title={
            panel === 'menu'
              ? 'Khám phá Hà Thành Vị'
              : panel === 'search'
                ? 'Bạn tìm thức quà nào?'
                : 'Giỏ hàng của bạn'
          }
          onClose={() => setPanel(null)}
        >
          {panel === 'menu' && (
            <nav className="mobile-nav">
              <Link to="/tai-khoan">
                Tài khoản
                <ArrowRight size={18} />
              </Link>
              {links.map(([to, label]) => (
                <NavLink to={to} end key={to}>
                  {label}
                  <ArrowRight size={18} />
                </NavLink>
              ))}
            </nav>
          )}
          {panel === 'search' && (
            <>
              <label className="field">
                Tên sản phẩm
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Bánh chả, matcha, hộp quà…"
                />
              </label>
              <div className="search-results">
                {products
                  .filter((p) =>
                    (p.name + ' ' + p.flavor)
                      .toLocaleLowerCase('vi')
                      .includes(query.toLocaleLowerCase('vi')),
                  )
                  .map((p) => (
                    <button key={p.id} onClick={() => navigate('/san-pham/' + p.slug)}>
                      {p.name}
                      <ArrowRight size={18} />
                    </button>
                  ))}
                {!products.some((p) =>
                  (p.name + ' ' + p.flavor)
                    .toLocaleLowerCase('vi')
                    .includes(query.toLocaleLowerCase('vi')),
                ) && <p>Chưa tìm thấy sản phẩm. Thử “bánh chả” hoặc “quà” nhé.</p>}
              </div>
            </>
          )}
          {panel === 'cart' && <CartContents />}
        </Modal>
      )}
    </div>
  );
}
