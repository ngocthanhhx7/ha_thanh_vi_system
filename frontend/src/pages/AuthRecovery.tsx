import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '../services/customerApi';
import '../components/auth.css';
import './account-public.css';

export function AuthRecovery({ reset = false }: { reset?: boolean }) {
  const [token] = useState(() =>
    reset ? new URLSearchParams(window.location.search).get('token') || '' : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!reset) return;
    const previous = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = previous || document.createElement('meta');
    const old = meta.content;
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    if (!previous) document.head.appendChild(meta);
    if (window.location.search)
      window.history.replaceState(window.history.state, '', window.location.pathname);
    return () => {
      if (previous) meta.content = old;
      else meta.remove();
    };
  }, [reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (reset) {
        const password = String(form.get('password') || '');
        const confirmPassword = String(form.get('confirmPassword') || '');
        if (password !== confirmPassword) throw new Error('Mật khẩu xác nhận chưa khớp.');
        const result = await customerApi.resetPassword({ token, password, confirmPassword });
        setMessage(result.message);
        setDone(true);
      } else {
        const result = await customerApi.forgotPassword(String(form.get('email') || '').trim());
        setMessage(result.message);
        setDone(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa thể hoàn tất. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section account-page auth-reset">
      <p className="eyebrow">GÓC NHỎ CỦA BẠN</p>
      <h1>{reset ? 'Đặt lại mật khẩu' : 'Quên mật khẩu?'}</h1>
      <p>
        {reset
          ? 'Chọn mật khẩu mới để tiếp tục giữ những thức quà thân quen.'
          : 'Nhập email của bạn. Nếu tài khoản phù hợp, chúng mình sẽ gửi liên kết đặt lại mật khẩu.'}
      </p>
      {reset && !token ? (
        <p role="alert" className="account-error">
          Liên kết chưa hợp lệ. Hãy yêu cầu một liên kết mới.
        </p>
      ) : (
        !done && (
          <form onSubmit={submit}>
            {reset ? (
              <>
                <label className="field">
                  Mật khẩu mới
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </label>
                <label className="field">
                  Xác nhận mật khẩu
                  <input
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </label>
              </>
            ) : (
              <label className="field">
                Email
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
            )}
            <button className="button" disabled={busy}>
              {busy ? 'Đang xử lý…' : reset ? 'Lưu mật khẩu mới' : 'Gửi liên kết đặt lại'}
            </button>
          </form>
        )
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        <Link to="/tai-khoan">Quay lại đăng nhập</Link>
        {reset && !done && (
          <>
            {' '}
            · <Link to="/quen-mat-khau">Yêu cầu liên kết mới</Link>
          </>
        )}
      </p>
    </section>
  );
}
