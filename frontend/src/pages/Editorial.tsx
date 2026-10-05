import { ArrowRight, Flower2, Gift, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShop } from '../hooks/useShop';
import './editorial-public.css';

const storyChapters = [
  {
    number: '01',
    title: 'Một hương vị để nhớ',
    text: 'Bánh chả gợi về những buổi chiều chậm rãi, một tách trà còn ấm và câu chuyện bên người thân. Với Hà Thành Vị, đó là nguồn cảm hứng cho những thức quà mang dấu ấn Hà Nội.',
    image: 'mixing',
    imageAlt: 'Nhân vật thương hiệu đang chuẩn bị nhân bánh',
    note: 'Vị xưa trong nếp nhà',
  },
  {
    number: '02',
    title: 'Một cách thưởng thức mới',
    text: 'Bên cạnh vị truyền thống là socola và matcha — những lựa chọn mới mẻ dành cho những người trẻ yêu khám phá. Túi zip 350g giúp bạn dễ dàng mang theo và chia sẻ.',
    image: 'rolling',
    imageAlt: 'Nhân vật thương hiệu đang cán bột làm bánh',
    note: 'Thân quen mà mới mẻ',
  },
  {
    number: '03',
    title: 'Một món quà để thương',
    text: 'Từ chiếc bánh chả Hà Nội đến những lựa chọn quà tặng mang dấu ấn riêng. Dù dành cho mình hay gửi người thương, mỗi món quà đều có thể bắt đầu từ một hương vị thân quen.',
    image: 'baking',
    imageAlt: 'Nhân vật thương hiệu đang nướng bánh',
    note: 'Gói ghém điều muốn trao',
  },
];

const brandValues = [
  {
    Icon: Flower2,
    number: '01',
    title: 'Trân trọng vị xưa',
    text: 'Lấy cảm hứng từ bánh chả và văn hóa thưởng trà Hà Nội, gìn giữ nét thân quen trong từng ý tưởng sản phẩm.',
  },
  {
    Icon: Heart,
    number: '02',
    title: 'Gần gũi hôm nay',
    text: 'Những hương vị và quy cách dễ tiếp cận, phù hợp để mang theo, dùng hằng ngày và chia sẻ cùng bạn bè.',
  },
  {
    Icon: Gift,
    number: '03',
    title: 'Trao gửi tình cảm',
    text: 'Một món quà ý nhị là cách kết nối con người. Chúng mình chăm chút trải nghiệm ấy từ bánh, trà đến câu chuyện.',
  },
];

export function Story() {
  const {
    content: { site },
  } = useShop();

  return (
    <div className="public-editorial public-editorial--story">
      <section className="editorial-hero" aria-labelledby="story-title">
        <div className="editorial-hero__copy">
          <p className="public-eyebrow">CÂU CHUYỆN HÀ THÀNH VỊ</p>
          <h1 id="story-title">
            Hà Nội trong ký ức.
            <br />
            <em>Thân thương trong từng vị.</em>
          </h1>
          <p className="editorial-hero__description">{site.story}</p>
          <div className="editorial-actions">
            <Link className="editorial-button" to="/san-pham">
              Khám phá thức quà <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="editorial-text-link" to="/lien-he">
              Kết nối với chúng mình <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="editorial-handnote">
            <img src="/brand/ornament.webp" alt="" aria-hidden="true" />
            <span>Mời bạn, một chút vị xưa.</span>
          </div>
        </div>
        <div className="editorial-hero__visual">
          <div className="editorial-hero__frame">
            <img
              src="/brand/gift.webp"
              alt="Bốn nhân vật làm bánh quây quanh logo Hà Thành Vị"
              width="700"
              height="700"
              fetchPriority="high"
            />
          </div>
          <div className="editorial-hero__seal" aria-hidden="true">
            <img src="/brand/ornament.webp" alt="" />
            <span>Vị xưa · Tình mới</span>
          </div>
          <p className="editorial-hero__caption">Một thức quà nhỏ, một câu chuyện dài.</p>
        </div>
      </section>

      <section className="story-section" aria-labelledby="story-chapters-title">
        <div className="editorial-section-heading">
          <div>
            <p className="public-eyebrow">NHỮNG ĐIỀU CHÚNG MÌNH MUỐN KỂ</p>
            <h2 id="story-chapters-title">
              Từ một chiếc bánh,
              <br />
              đến <em>một sự kết nối.</em>
            </h2>
          </div>
          <p>
            Có những hương vị khiến ta chậm lại — để nhớ một buổi trà, một người thân, hay một góc
            Hà Nội trong lòng.
          </p>
        </div>
        <div className="story-chapters">
          {storyChapters.map((chapter) => (
            <article className="story-card" key={chapter.number}>
              <div className="story-card__image">
                <img
                  src={'/brand/artisan-' + chapter.image + '.webp'}
                  alt={chapter.imageAlt}
                  loading="lazy"
                  width="520"
                  height="420"
                />
                <span className="story-card__number">{chapter.number}</span>
              </div>
              <div className="story-card__body">
                <p className="story-card__note">{chapter.note}</p>
                <h3>{chapter.title}</h3>
                <p>{chapter.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="editorial-quote" aria-label="Lời nhắn từ Hà Thành Vị">
        <img src="/brand/ornament.webp" alt="" aria-hidden="true" />
        <blockquote>
          “Giữ lại một chút thân quen,
          <br />
          <em>để trao đi thật nhiều tình cảm.”</em>
        </blockquote>
        <span>HÀ THÀNH VỊ</span>
      </section>

      <section className="editorial-ending">
        <div>
          <p className="public-eyebrow">CÂU CHUYỆN TIẾP THEO</p>
          <h2>
            Mình cùng
            <br />
            <em>viết nhé.</em>
          </h2>
        </div>
        <Link className="editorial-button" to="/san-pham">
          Khám phá những thức quà <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}

export function About() {
  const {
    content: { site },
  } = useShop();

  return (
    <div className="public-editorial public-editorial--about">
      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-hero__copy">
          <p className="public-eyebrow">VỀ CHÚNG MÌNH</p>
          <h1 id="about-title">
            Mang vị Hà Nội
            <br />
            <em>gần bạn hơn.</em>
          </h1>
          <p>
            {site.company} mong muốn đưa bánh chả và những món quà mang cảm hứng Hà Nội đến gần hơn
            với cuộc sống hôm nay.
          </p>
          <p>
            Từ Thạch Thất, Hà Nội, chúng mình kết nối với những người yêu thức quà truyền thống —
            đặc biệt là thế hệ trẻ đang tìm một hương vị vừa thân quen, vừa mới mẻ.
          </p>
          <Link className="editorial-button" to="/lien-he">
            Làm quen với chúng mình <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="about-hero__visual">
          <img
            src="/brand/artisan-shaping.webp"
            alt="Minh họa người thợ làm bánh trong bộ nhận diện Hà Thành Vị"
            width="620"
            height="620"
            fetchPriority="high"
          />
          <div className="about-hero__caption">
            <img src="/brand/ornament.webp" alt="" aria-hidden="true" />
            <span>GẦN GŨI · TINH TẾ · SẺ CHIA</span>
          </div>
        </div>
      </section>

      <section className="about-values" aria-labelledby="about-values-title">
        <div className="editorial-section-heading">
          <div>
            <p className="public-eyebrow">NHỮNG ĐIỀU CHÚNG MÌNH TRÂN TRỌNG</p>
            <h2 id="about-values-title">
              Chân thành trong từng <em>điều nhỏ.</em>
            </h2>
          </div>
        </div>
        <div className="about-values__grid">
          {brandValues.map(({ Icon, number, title, text }) => (
            <article className="value-card" key={number}>
              <div className="value-card__topline">
                <span>{number}</span>
                <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <figure className="about-banner">
        <img
          src="/brand/brand-banner.webp"
          alt="Minh họa thương hiệu Hà Thành Vị và những người thợ bánh"
          loading="lazy"
          width="1600"
          height="700"
        />
        <figcaption>Những thức quà mang cảm hứng từ Hà Nội.</figcaption>
      </figure>

      <section className="editorial-ending editorial-ending--about">
        <div>
          <p className="public-eyebrow">HÀ THÀNH VỊ Ở ĐÂY</p>
          <h2>
            Ghé chơi,
            <br />
            <em>kể nhau nghe.</em>
          </h2>
          <p>{site.address}</p>
        </div>
        <Link className="editorial-button" to="/lien-he">
          Kết nối với Hà Thành Vị <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}

export function NotFound() {
  return (
    <section className="editorial-not-found" aria-labelledby="not-found-title">
      <p className="public-eyebrow">404 · LẠC MỘT CHÚT THÔI</p>
      <h1 id="not-found-title">Thức quà này chưa ở đây.</h1>
      <p>Mời bạn quay về để tiếp tục khám phá Hà Thành Vị.</p>
      <Link to="/" className="editorial-button">
        Về trang chủ <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
