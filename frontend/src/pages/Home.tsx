import { ArrowDown, ArrowRight, Flower2, Gift, Coffee } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShop } from '../hooks/useShop';
import { ProductCard, TextLink } from '../components/ProductCard';
export function Home() {
  const {
    content: { site, products },
  } = useShop();
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-line" />
            THỨC QUÀ TỪ HÀ NỘI
          </div>
          <h1>
            {site.heroTitle.split('\n').map((line, i) => (
              <span key={line} className={i ? 'hero-italic' : ''}>
                {line}
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
              alt="Minh họa bánh chả vàng giòn bên chén trà sen"
              width="1500"
              height="1000"
              fetchPriority="high"
            />
            <span className="hero-photo-caption">BÁNH CHẢ & TRÀ THƠM · ẢNH MINH HỌA</span>
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
      <div className="values-ribbon">
        <span>
          <Flower2 />
          Hương vị Hà Nội
        </span>
        <i />
        <span>
          <Coffee />
          Thức quà cho mỗi ngày
        </span>
        <i />
        <span>
          <Gift />
          Trao gửi điều thân thương
        </span>
      </div>
      <section className="section intro-section" id="loi-ngo">
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
      <section className="section collection-section">
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
          Ảnh bánh và phối cảnh nhận diện dùng để minh họa ý tưởng. Bao bì, hình ảnh sản phẩm thực
          tế sẽ được cập nhật.
        </p>
      </section>
      <section className="story-feature">
        <div className="story-feature-art">
          <img className="story-pattern" src="/brand/pattern.webp" alt="" />
          <img
            className="story-artisan one"
            src="/brand/artisan-mixing.webp"
            alt="Nhân vật trộn nhân bánh"
          />
          <img
            className="story-artisan two"
            src="/brand/artisan-baking.webp"
            alt="Nhân vật chăm chút khay bánh"
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
      <section className="section gift-callout">
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
