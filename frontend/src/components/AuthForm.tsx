import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, CustomerApiError, type CustomerUser } from '../services/customerApi';
import './auth.css';

export function AuthForm({
  onAuthenticated,
  onAccountAppeal,
  initialError = '',
}: {
  onAuthenticated: (user: CustomerUser) => void;
  onAccountAppeal: (appealToken: string) => void;
  initialError?: string;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<{ email: string; challengeId?: string } | null>(null);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownUntil = useRef(0);
  function startCooldown(seconds: number) {
    cooldownUntil.current = Date.now() + seconds * 1000;
    setCooldown(seconds);
  }
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000))),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  function complete(user: CustomerUser) {
    setStep(null);
    onAuthenticated(user);
    window.dispatchEvent(new Event('customer-session-changed'));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (step) {
        const code = String(form.get('code') || '').trim();
        const result = step.challengeId
          ? await customerApi.verifyLogin({ challengeId: step.challengeId, code })
          : await customerApi.verifyEmail({ email: step.email, code, rememberDevice: remember });
        if ('appealRequired' in result && result.appealRequired) {
          setStep(null);
          onAccountAppeal(result.appealToken);
          return;
        }
        if (!('user' in result)) throw new Error('Chưa thể xác minh tài khoản. Vui lòng thử lại.');
        complete(result.user);
      } else {
        const email = String(form.get('email') || '').trim();
        const password = String(form.get('password') || '');
        if (mode === 'register') {
          const confirmPassword = String(form.get('confirmPassword') || '');
          if (password !== confirmPassword) throw new Error('Mật khẩu xác nhận chưa khớp.');
          const result = await customerApi.register({
            email,
            password,
            confirmPassword,
            name: String(form.get('name') || '').trim(),
            phone: String(form.get('phone') || '').trim(),
          });
          element.reset();
          setStep({ email: result.email || email });
          startCooldown(60);
          setNotice(result.message);
        } else {
          const result = await customerApi.login({ email, password, rememberDevice: remember });
          if (result.user) complete(result.user);
          else if (result.otpRequired && result.challengeId) {
            element.reset();
            setStep({ email: result.email || email, challengeId: result.challengeId });
            startCooldown(60);
            setNotice(result.message || 'Mã xác minh đã được gửi đến email của bạn.');
          } else if (result.verificationRequired) {
            element.reset();
            setStep({ email });
            setNotice(result.message || 'Vui lòng xác minh email để tiếp tục.');
          } else throw new Error('Chưa thể đăng nhập. Vui lòng thử lại.');
        }
      }
    } catch (reason) {
      if (
        !step &&
        mode === 'login' &&
        reason instanceof CustomerApiError &&
        reason.status === 403 &&
        reason.verificationRequired &&
        reason.email
      ) {
        element.reset();
        setStep({ email: reason.email });
        setNotice(reason.message);
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Chưa thể hoàn tất. Vui lòng thử lại.');
      if (reason instanceof CustomerApiError && reason.retryAfter) startCooldown(reason.retryAfter);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!step || busy || cooldown) return;
    setBusy(true);
    setError('');
    try {
      const result = step.challengeId
        ? await customerApi.resendLoginOtp(step.challengeId)
        : await customerApi.resendVerification(step.email);
      setNotice(result.message);
      startCooldown(60);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa gửi được mã.');
      if (reason instanceof CustomerApiError && reason.retryAfter) startCooldown(reason.retryAfter);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-panel auth-panel">
      {!step && (
        <div className="account-auth-tabs" aria-label="Tài khoản">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setError('');
                setNotice('');
              }}
            >
              {value === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          ))}
        </div>
      )}
      <h2>
        {step
          ? 'Xác minh email của bạn'
          : mode === 'login'
            ? 'Mừng bạn trở lại'
            : 'Thêm một người bạn mới'}
      </h2>
      {step && (
        <p>
          Nhập mã 6 chữ số được gửi đến <strong>{step.email}</strong>.
        </p>
      )}
      <form onSubmit={submit} key={step ? 'otp' : mode}>
        {step ? (
          <label className="field">
            Mã xác minh
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              minLength={6}
              required
              autoFocus
            />
          </label>
        ) : (
          <>
            {mode === 'register' && (
              <>
                <label className="field">
                  Họ và tên
                  <input name="name" autoComplete="name" required maxLength={100} />
                </label>
                <label className="field">
                  Số điện thoại
                  <input name="phone" type="tel" autoComplete="tel" required maxLength={20} />
                </label>
              </>
            )}
            <label className="field">
              Email
              <input name="email" type="email" autoComplete="username" required maxLength={254} />
            </label>
            <label className="field">
              Mật khẩu
              <input
                name="password"
                aria-label="Mật khẩu"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 10 : undefined}
                maxLength={128}
              />
              {mode === 'register' && <small>Từ 10 đến 128 ký tự.</small>}
            </label>
            {mode === 'register' && (
              <label className="field">
                Xác nhận mật khẩu
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
            )}
          </>
        )}
        {(mode === 'login' || step) && (
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy || Boolean(step?.challengeId)}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Tin cậy thiết bị này trong 30 ngày
          </label>
        )}
        <button className="button" disabled={busy}>
          {busy
            ? 'Đang xử lý…'
            : step
              ? 'Xác minh'
              : mode === 'login'
                ? 'Đăng nhập'
                : 'Tạo tài khoản'}
        </button>
      </form>
      {(error || initialError) && (
        <p className="account-error" role="alert">
          {error || initialError}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {step ? (
        <div className="auth-links">
          <button type="button" disabled={busy || cooldown > 0} onClick={() => void resend()}>
            {cooldown ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep(null);
              setMode('login');
              setError('');
              setNotice('');
            }}
          >
            Quay lại đăng nhập
          </button>
        </div>
      ) : (
        <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
      )}
      <p className="fine-print">
        Bạn vẫn có thể <Link to="/tra-cuu-don-hang">tra cứu đơn mua không cần tài khoản</Link> bằng
        khóa riêng.
      </p>
    </div>
  );
}
