import { ArrowRight, Flower2, Heart, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShop } from '../hooks/useShop';
export function Story() {
  const {
    content: { site },
  } = useShop();
  return (
    <>
      <section className="editorial-hero section">
        <div>
          <p className="eyebrow">CÂU CHUYỆN HÀ THÀNH VỊ</p>
          <h1>
            Hà Nội trong ký ức.
            <br />
            <em>Thân thương trong từng vị.</em>
          </h1>
          <p>{site.story}</p>
          <span className="handwritten">Mời bạn, một chút vị xưa.</span>
        </div>
        <div className="editorial-illustration">
          <img
            src="/brand/gift.webp"
            alt="Bốn nhân vật làm bánh quây quanh logo Hà Thành Vị"
            width="700"
            height="700"
          />
        </div>
      </section>
      <section className="section story-chapters">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NHỮNG ĐIỀU CHÚNG MÌNH MUỐN KỂ</p>
            <h2>
              Từ một chiếc bánh,
              <br />
              đến <em>một sự kết nối.</em>
            </h2>
          </div>
        </div>
        {[
          {
            n: '01',
            title: 'Một hương vị để nhớ',
            text: 'Bánh chả gợi về những buổi chiều chậm rãi, một tách trà còn ấm và câu chuyện bên người thân. Với Hà Thành Vị, đó là nguồn cảm hứng cho những thức quà mang dấu ấn Hà Nội.',
            img: 'mixing',
          },
          {
            n: '02',
            title: 'Một cách thưởng thức mới',
            text: 'Bên cạnh vị truyền thống là socola và matcha — những lựa chọn mới mẻ dành cho những người trẻ yêu khám phá. Túi zip 350g giúp bạn dễ dàng mang theo và chia sẻ.',
            img: 'rolling',
          },
          {
            n: '03',
            title: 'Một món quà để thương',
            text: 'Bánh chả, trà sen và nét đẹp của gốm sứ gặp nhau trong các set quà. Mỗi lựa chọn là một cách nói lời cảm ơn, một lời chúc, hay đơn giản là gửi đi sự quan tâm.',
            img: 'baking',
          },
        ].map((c) => (
          <article className="story-chapter" key={c.n}>
            <span className="chapter-number">{c.n}</span>
            <div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </div>
            <img
              src={'/brand/artisan-' + c.img + '.webp'}
              alt="Minh họa nhân vật thương hiệu"
              loading="lazy"
            />
          </article>
        ))}
      </section>
      <section className="editorial-quote">
        <img src="/brand/ornament.webp" alt="" />
        <blockquote>
          “Giữ lại một chút thân quen,
          <br />
          để trao đi thật nhiều tình cảm.”
        </blockquote>
        <span>HÀ THÀNH VỊ</span>
      </section>
      <section className="section gift-callout">
        <h2>
          Câu chuyện tiếp theo,
          <br />
          <em>mình cùng viết nhé.</em>
        </h2>
        <Link className="button" to="/san-pham">
          Khám phá những thức quà
          <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
export function About() {
  const {
    content: { site },
  } = useShop();
  return (
    <>
      <section className="section editorial-hero">
        <div>
          <p className="eyebrow">VỀ CHÚNG MÌNH</p>
          <h1>
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
          <Link className="button" to="/lien-he">
            Làm quen với chúng mình
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="about-collage">
          <img
            src="/brand/artisan-shaping.webp"
            alt="Minh họa người thợ làm bánh trong bộ nhận diện"
          />
          <span>GẦN GŨI · TINH TẾ · SẺ CHIA</span>
        </div>
      </section>
      <section className="section about-values">
        <p className="eyebrow">NHỮNG ĐIỀU CHÚNG MÌNH TRÂN TRỌNG</p>
        <h2>
          Chân thành trong từng <em>điều nhỏ.</em>
        </h2>
        <div className="values-grid">
          {[
            {
              Icon: Flower2,
              title: 'Trân trọng vị xưa',
              text: 'Lấy cảm hứng từ bánh chả và văn hóa thưởng trà Hà Nội, gìn giữ nét thân quen trong từng ý tưởng sản phẩm.',
            },
            {
              Icon: Heart,
              title: 'Gần gũi hôm nay',
              text: 'Những hương vị và quy cách dễ tiếp cận, phù hợp để mang theo, dùng hằng ngày và chia sẻ cùng bạn bè.',
            },
            {
              Icon: Gift,
              title: 'Trao gửi tình cảm',
              text: 'Một món quà ý nhị là cách kết nối con người. Chúng mình chăm chút trải nghiệm ấy từ bánh, trà đến câu chuyện.',
            },
          ].map(({ Icon, title, text }) => (
            <article key={title}>
              <Icon size={32} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="brand-banner">
        <img
          src="/brand/brand-banner.webp"
          alt="Minh họa thương hiệu Hà Thành Vị và những người thợ bánh"
          loading="lazy"
        />
      </div>
      <section className="section gift-callout">
        <h2>
          Ghé Hà Thành Vị,
          <br />
          <em>kể nhau nghe.</em>
        </h2>
        <p>{site.address}</p>
        <Link className="button" to="/lien-he">
          Kết nối với Hà Thành Vị
          <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
export function NotFound() {
  return (
    <section className="section empty-state">
      <p className="eyebrow">404 · LẠC MỘT CHÚT THÔI</p>
      <h1>Thức quà này chưa ở đây.</h1>
      <p>Mời bạn quay về để tiếp tục khám phá Hà Thành Vị.</p>
      <Link to="/" className="button">
        Về trang chủ
        <ArrowRight size={18} />
      </Link>
    </section>
  );
}
