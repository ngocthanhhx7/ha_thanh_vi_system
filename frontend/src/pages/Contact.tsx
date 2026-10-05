import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useShop } from '../hooks/useShop';
import './editorial-public.css';

export function Contact() {
  const {
    content: { site },
  } = useShop();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone'),
          message: data.get('message'),
          consent: data.get('consent') === 'on',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        setStatus(
          'Chưa thể gửi yêu cầu lúc này. Bạn vui lòng gọi 0973 607 163 hoặc nhắn Zalo để được hỗ trợ.',
        );
        return;
      }

      setStatus('Hà Thành Vị đã nhận lời nhắn của bạn. Cảm ơn bạn đã kết nối!');
      form.reset();
    } catch {
      setStatus(
        'Chưa thể gửi yêu cầu lúc này. Bạn vui lòng gọi 0973 607 163 hoặc nhắn Zalo để được hỗ trợ.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-contact">
      <section className="contact-hero" aria-labelledby="contact-title">
        <div className="contact-hero__copy">
          <p className="public-eyebrow">MÌNH TRÒ CHUYỆN NHÉ</p>
          <h1 id="contact-title">
            Một lời nhắn,
            <br />
            <em>mở đầu câu chuyện.</em>
          </h1>
          <p>
            Chọn bánh cho mình, tìm quà cho người thương hay cùng nhau hợp tác. Hà Thành Vị luôn sẵn
            lòng lắng nghe.
          </p>
        </div>
        <div className="contact-hero__art" aria-hidden="true">
          <img src="/brand/ornament.webp" alt="" />
          <span>Chút tâm tình · Chút vị Hà Nội</span>
        </div>
      </section>

      <section className="contact-layout" aria-label="Thông tin liên hệ và gửi lời nhắn">
        <div className="contact-details">
          <div className="contact-details__intro">
            <p className="public-eyebrow">HÀ THÀNH VỊ Ở ĐÂY</p>
            <h2>
              Ghé thăm <em>chúng mình.</em>
            </h2>
            <p>Liên hệ trực tiếp để được tư vấn sản phẩm, báo giá và thông tin đặt hàng.</p>
          </div>

          <div className="contact-channels">
            <a className="contact-channel" href={'tel:' + site.phone}>
              <span className="contact-channel__icon" aria-hidden="true">
                <Phone />
              </span>
              <span className="contact-channel__copy">
                <small>GỌI MỘT CUỘC</small>
                <strong>0973 607 163</strong>
              </span>
              <ArrowRight className="contact-channel__arrow" aria-hidden="true" />
            </a>
            <a className="contact-channel" href={'mailto:' + site.email}>
              <span className="contact-channel__icon" aria-hidden="true">
                <Mail />
              </span>
              <span className="contact-channel__copy">
                <small>GỬI CHÚT TÂM TÌNH</small>
                <strong>{site.email}</strong>
              </span>
              <ArrowRight className="contact-channel__arrow" aria-hidden="true" />
            </a>
            <div className="contact-channel contact-channel--address">
              <span className="contact-channel__icon" aria-hidden="true">
                <MapPin />
              </span>
              <span className="contact-channel__copy">
                <small>HÀ THÀNH VỊ Ở ĐÂY</small>
                <strong>{site.address}</strong>
              </span>
            </div>
          </div>

          <div className="contact-socials">
            <a className="contact-socials__zalo" href={site.zalo} target="_blank" rel="noreferrer">
              <MessageCircle size={18} aria-hidden="true" />
              Nhắn Zalo
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a
              className="contact-socials__facebook"
              href={site.facebook}
              target="_blank"
              rel="noreferrer"
            >
              Ghé Facebook <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>

          <aside className="contact-note">
            <img
              src="/brand/artisan-mixing.webp"
              alt="Nhân vật thương hiệu đang chuẩn bị nhân bánh"
              loading="lazy"
              width="180"
              height="180"
            />
            <p>
              Bánh ngon, trà thơm.
              <br />
              <em>Chuyện mình cứ kể.</em>
            </p>
          </aside>
        </div>

        <form className="contact-form" onSubmit={submit} aria-busy={busy}>
          <div className="contact-form__heading">
            <p className="public-eyebrow">ĐỂ LẠI LỜI NHẮN</p>
            <h2>
              Chúng mình có thể
              <br />
              <em>giúp gì cho bạn?</em>
            </h2>
            <p>Cứ kể điều bạn đang tìm — chúng mình sẽ hồi âm sớm nhất có thể.</p>
          </div>

          <label className="contact-field" htmlFor="contact-name">
            Họ và tên
            <input
              id="contact-name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="Tên của bạn"
            />
          </label>
          <div className="contact-form__row">
            <label className="contact-field" htmlFor="contact-phone">
              Số điện thoại
              <input
                id="contact-phone"
                name="phone"
                type="tel"
                required
                maxLength={20}
                autoComplete="tel"
                placeholder="Số điện thoại liên hệ"
              />
            </label>
            <label className="contact-field" htmlFor="contact-email">
              Email
              <input
                id="contact-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="ban@email.com"
              />
            </label>
          </div>
          <label className="contact-field" htmlFor="contact-message">
            Lời nhắn
            <textarea
              id="contact-message"
              name="message"
              required
              minLength={10}
              maxLength={3000}
              rows={4}
              placeholder="Bạn đang tìm món quà như thế nào?"
            />
          </label>
          <label className="contact-consent" htmlFor="contact-consent">
            <input id="contact-consent" type="checkbox" name="consent" required />
            <span>
              Tôi đồng ý để Hà Thành Vị sử dụng thông tin đã cung cấp nhằm liên hệ và phản hồi yêu
              cầu này.
            </span>
          </label>
          <button className="contact-submit" disabled={busy} type="submit">
            {busy ? 'Đang gửi…' : 'Gửi lời nhắn'}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className="contact-form__fine-print">
            Thông tin chỉ được lưu khi hệ thống tiếp nhận hoạt động. Bạn có thể yêu cầu xóa thông
            tin qua email liên hệ.
          </p>
          {status && (
            <p className="contact-form__status" role="status" aria-live="polite">
              {status}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
