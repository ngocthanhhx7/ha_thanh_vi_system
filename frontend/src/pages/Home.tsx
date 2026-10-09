import { useState } from 'react';
import { ArrowDown, ArrowRight, Flower2, Gift, Coffee, Pause, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShop } from '../hooks/useShop';
import { ProductCard, TextLink } from '../components/ProductCard';
import './home-critical-fonts.css';
import './home-public.css';
// Decode the inline faces before the first hero layout, rather than swapping from an OS font.
// The data is already in the route CSS; this does not wait for any network font request.
export const homeFontsReady = Promise.all([
  document.fonts.load('400 40px "Home Serif Fallback"'),
  document.fonts.load('italic 400 40px "Home Serif Fallback"'),
  document.fonts.load('400 13px "Home UI Fallback"'),
]).catch(() => undefined);

export function Home() {
  const [valuesRibbonPaused, setValuesRibbonPaused] = useState(false);
  const {
    content: { site, products },
  } = useShop();
  return (
    <>
      <section className="hero home-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-line" />
            THỨC QUÀ TỪ HÀ NỘI
          </div>
          <h1>
            {site.heroTitle.split('\n').map((line, i) => (
              <span key={line} className={i ? 'hero-italic' : ''}>
                {line.split(/(Hà\s+Nội)/g).map((part, partIndex) =>
                  /^Hà\s+Nội$/.test(part) ? (
                    <span key={`${part}-${partIndex}`} className="hero-no-break">
                      {part}
                    </span>
                  ) : (
                    part
                  ),
                )}
              </span>
            ))}
          </h1>
          <p>{site.heroDescription}</p>
          <div className="hero-buttons">
            <Link to="/san-pham" className="button">
              Khám phá thức quà
              <ArrowRight size={18} />
            </Link>
            <Link to="/cau-chuyen" className="quiet-link">
              Câu chuyện của chúng mình
            </Link>
          </div>
          <div className="hero-signature">
            <img src="/brand/ornament.webp" alt="" />
            <span>
              VỊ XƯA TINH HOA
              <br />
              <strong>TRONG TỪNG CHIẾC BÁNH</strong>
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <img
              src="/brand/pastry.webp"
              srcSet="/brand/pastry-640.webp 640w, /brand/pastry-960.webp 960w, /brand/pastry-1280.webp 1280w, /brand/pastry.webp 1500w"
              sizes="(max-width: 640px) 560px, (max-width: 850px) 610px, (max-width: 1100px) 705px, 915px"
              alt="Minh họa bánh chả vàng giòn bên chén trà sen"
              width="1500"
              height="1000"
              fetchPriority="high"
              loading="eager"
            />
          </div>
          <div className="round-seal">
            <span>HÀ NỘI</span>
            <Flower2 size={31} />
            <span>TRONG TỪNG VỊ</span>
          </div>
          <div className="hero-note">
            <img
              src="/brand/artisan-rolling.webp"
              alt="Nhân vật người thợ bánh trong bộ nhận diện Hà Thành Vị"
            />
            <div>
              <small>THÂN QUEN MÀ MỚI MẺ</small>
              <strong>
                Một chút vị xưa,
                <br />
                cho ngày hôm nay.
              </strong>
            </div>
          </div>
        </div>
        <a className="scroll-cue" href="#loi-ngo">
          <ArrowDown size={16} />
          CHẬM MỘT CHÚT, THƯƠNG NHIỀU HƠN
        </a>
      </section>
      <div
        className={'home-values-ribbon' + (valuesRibbonPaused ? ' is-paused' : '')}
        role="region"
        aria-label="Điều làm nên Hà Thành Vị"
      >
        <div className="home-values-ribbon-viewport">
          <div className="home-values-ribbon-track">
            {[0, 1].map((copy) => (
              <div
                className="home-values-ribbon-group"
                aria-hidden={copy === 1 || undefined}
                key={copy}
              >
                <span className="home-values-ribbon-item">
                  <Flower2 aria-hidden="true" />
                  <span className="home-values-ribbon-item-label">Hương vị Hà Nội</span>
                </span>
                <i aria-hidden="true" />
                <span className="home-values-ribbon-item">
                  <Coffee aria-hidden="true" />
                  <span className="home-values-ribbon-item-label">Thức quà cho mỗi ngày</span>
                </span>
                <i aria-hidden="true" />
                <span className="home-values-ribbon-item">
                  <Gift aria-hidden="true" />
                  <span className="home-values-ribbon-item-label">Trao gửi điều thân thương</span>
                </span>
                <i aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
        <button
          className="home-values-ribbon-toggle"
          type="button"
          aria-label={valuesRibbonPaused ? 'Tiếp tục dải thông điệp' : 'Tạm dừng dải thông điệp'}
          aria-pressed={valuesRibbonPaused}
          onClick={() => setValuesRibbonPaused((paused) => !paused)}
        >
          {valuesRibbonPaused ? (
            <Play size={14} aria-hidden="true" />
          ) : (
            <Pause size={14} aria-hidden="true" />
          )}
        </button>
      </div>
      <section className="section intro-section home-intro" id="loi-ngo">
        <div>
          <p className="eyebrow">CHÚT TÂM TÌNH TỪ HÀ THÀNH VỊ</p>
          <h2>
            Giữ vị Hà Nội,
            <br />
            <em>theo cách hôm nay.</em>
          </h2>
        </div>
        <div>
          <p>
            Giữa những ngày vội vã, có lẽ ai cũng cần một khoảnh khắc để ngồi xuống, nhấp ngụm trà
            và thưởng thức một chiếc bánh ngon.
          </p>
          <p>
            Hà Thành Vị mang bánh chả thân quen đến gần bạn hơn — từ những túi bánh nhỏ mỗi ngày đến
            những hộp quà dành cho người thương.
          </p>
          <TextLink to="/cau-chuyen">Đọc câu chuyện của chúng mình</TextLink>
        </div>
      </section>
      <section className="section collection-section home-collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THỨC QUÀ ĐƯỢC CHĂM CHÚT</p>
            <h2>
              Chọn một chút <em>thương.</em>
            </h2>
          </div>
          <TextLink to="/san-pham">Tất cả sản phẩm</TextLink>
        </div>
        <div className="product-grid">
          {products
            .filter((p) => p.featured)
            .map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
        </div>
        <p className="fine-print">
          Thông tin bao bì và hình ảnh sản phẩm thực tế sẽ được cập nhật.
        </p>
      </section>
      <section className="story-feature home-story-feature">
        <div className="story-feature-art">
          <img
            className="story-pattern"
            src="/brand/pattern-optimized.webp"
            alt=""
            loading="lazy"
          />
          <img
            className="story-artisan one"
            src="/brand/artisan-mixing.webp"
            alt="Nhân vật trộn nhân bánh"
            loading="lazy"
          />
          <img
            className="story-artisan two"
            src="/brand/artisan-baking.webp"
            alt="Nhân vật chăm chút khay bánh"
            loading="lazy"
          />
          <span className="story-art-label">MỘT NÉT HÀ NỘI · MỘT VỊ THÂN QUEN</span>
        </div>
        <div className="story-feature-copy">
          <p className="eyebrow">TỪ KÝ ỨC ĐẾN MÓN QUÀ</p>
          <h2>
            Có những hương vị,
            <br />
            chỉ cần nếm là <em>nhớ.</em>
          </h2>
          <p>{site.story}</p>
          <Link className="button button-light" to="/cau-chuyen">
            Lắng nghe câu chuyện
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <section className="section gift-callout home-gift-callout">
        <img src="/brand/ornament.webp" alt="" />
        <p className="eyebrow">MÓN QUÀ NHỎ, TẤM LÒNG LỚN</p>
        <h2>
          Bạn muốn gửi Hà Nội <em>đến ai?</em>
        </h2>
        <p>
          Một cuộc gặp, một lời cảm ơn hay đơn giản là “mình nhớ bạn”.
          <br />
          Hà Thành Vị cùng bạn chọn một thức quà vừa ý.
        </p>
        <Link className="button" to="/lien-he">
          Cùng chọn món quà
          <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
