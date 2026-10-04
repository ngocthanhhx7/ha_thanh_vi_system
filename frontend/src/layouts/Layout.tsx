import { CartContents } from '../components/CartContents';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Menu,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
  X,
  MessageCircle,
  Mail,
  MapPin,
} from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { Modal } from '../components/Modal';
const links = [
  ['/', 'Trang chủ'],
  ['/cau-chuyen', 'Câu chuyện'],
  ['/san-pham', 'Sản phẩm'],
  ['/ve-chung-toi', 'Về chúng tôi'],
  ['/lien-he', 'Liên hệ'],
];
export function Layout() {
  const {
    content: { site, products },
    cart,
  } = useShop();
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<'menu' | 'search' | 'cart' | null>(null);
  const [query, setQuery] = useState('');
  const [mascot, setMascot] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setPanel(null);
    const title = links.find((x) => x[0] === location.pathname)?.[1] || 'Khám phá';
    document.title = title + ' | Hà Thành Vị';
  }, [location.pathname]);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <>
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
          <Link className="icon-button account-button" aria-label="Tài khoản" to="/tai-khoan">
            <UserRound size={21} />
          </Link>
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
        <Outlet />
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
      <div className="mascot-widget">
        {mascot && (
          <div className="mascot-message">
            <button
              className="icon-button"
              aria-label="Đóng lời chào"
              onClick={() => setMascot(false)}
            >
              <X size={16} />
            </button>
            <strong>Chào bạn, mời một chút Hà Nội!</strong>
            <p>Mình giúp bạn chọn bánh và quà tặng nhé.</p>
            <a href={site.zalo} target="_blank" rel="noreferrer">
              Trò chuyện qua Zalo <ArrowRight size={16} />
            </a>
          </div>
        )}
        <button
          className="mascot-toggle"
          aria-label="Mở lời chào và hỗ trợ"
          aria-expanded={mascot}
          onClick={() => setMascot((v) => !v)}
        >
          <img src="/brand/artisan-baking.webp" alt="" />
          <span>
            <MessageCircle size={14} />
            Mình ở đây!
          </span>
        </button>
      </div>
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
    </>
  );
}
