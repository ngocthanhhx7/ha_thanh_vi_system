import { useState, type FormEvent } from 'react';
import { ArrowRight, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';
import { useShop } from '../hooks/useShop';
export function Contact() {
  const {
    content: { site },
  } = useShop();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    const form = e.currentTarget;
    const d = new FormData(form);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.get('name'),
          email: d.get('email'),
          phone: d.get('phone'),
          message: d.get('message'),
          consent: d.get('consent') === 'on',
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
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
    <>
      <div className="page-intro">
        <p className="eyebrow">MÌNH TRÒ CHUYỆN NHÉ</p>
        <h1>Một lời nhắn, mở đầu câu chuyện.</h1>
        <p>
          Chọn bánh cho mình, tìm quà cho người thương hay cùng nhau hợp tác.
          <br />
          Hà Thành Vị luôn sẵn lòng lắng nghe.
        </p>
        <img src="/brand/ornament.webp" alt="" />
      </div>
      <section className="section contact-grid">
        <div className="contact-info">
          <h2>
            Ghé thăm <em>chúng mình.</em>
          </h2>
          <p>Liên hệ trực tiếp để được tư vấn sản phẩm, báo giá và thông tin đặt hàng.</p>
          <a className="contact-line" href={'tel:' + site.phone}>
            <Phone />
            <span>
              <small>GỌI MỘT CUỘC</small>
              <strong>0973 607 163</strong>
            </span>
            <ArrowRight />
          </a>
          <a className="contact-line" href={'mailto:' + site.email}>
            <Mail />
            <span>
              <small>GỬI CHÚT TÂM TÌNH</small>
              <strong>{site.email}</strong>
            </span>
            <ArrowRight />
          </a>
          <div className="contact-line">
            <MapPin />
            <span>
              <small>HÀ THÀNH VỊ Ở ĐÂY</small>
              <strong>{site.address}</strong>
            </span>
          </div>
          <div className="social-buttons">
            <a className="button button-outline" href={site.zalo} target="_blank" rel="noreferrer">
              <MessageCircle size={18} />
              Nhắn Zalo
            </a>
            <a className="text-link" href={site.facebook} target="_blank" rel="noreferrer">
              Ghé Facebook
              <ArrowRight size={18} />
            </a>
          </div>
          <div className="contact-illustration">
            <img
              src="/brand/artisan-mixing.webp"
              alt="Nhân vật thương hiệu đang chuẩn bị nhân bánh"
            />
            <span>
              Bánh ngon, trà thơm.
              <br />
              <em>Chuyện mình cứ kể.</em>
            </span>
          </div>
        </div>
        <form className="contact-form" onSubmit={submit}>
          <p className="eyebrow">ĐỂ LẠI LỜI NHẮN</p>
          <h2>
            Chúng mình có thể
            <br />
            giúp gì cho bạn?
          </h2>
          <label className="field">
            Họ và tên
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="Tên của bạn"
            />
          </label>
          <div className="form-row">
            <label className="field">
              Số điện thoại
              <input
                name="phone"
                type="tel"
                required
                maxLength={20}
                autoComplete="tel"
                placeholder="Số điện thoại liên hệ"
              />
            </label>
            <label className="field">
              Email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="ban@email.com"
              />
            </label>
          </div>
          <label className="field">
            Lời nhắn
            <textarea
              name="message"
              required
              minLength={10}
              maxLength={3000}
              rows={4}
              placeholder="Bạn đang tìm món quà như thế nào?"
            />
          </label>
          <label className="consent">
            <input type="checkbox" name="consent" required />
            Tôi đồng ý để Hà Thành Vị sử dụng thông tin đã cung cấp nhằm liên hệ và phản hồi yêu cầu
            này.
          </label>
          <button className="button full" disabled={busy} type="submit">
            {busy ? 'Đang gửi…' : 'Gửi lời nhắn'}
            <ArrowRight size={18} />
          </button>
          <p className="fine-print">
            Thông tin chỉ được lưu khi hệ thống tiếp nhận hoạt động. Bạn có thể yêu cầu xóa thông
            tin qua email liên hệ.
          </p>
          {status && (
            <p className="form-status" role="status">
              {status}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
