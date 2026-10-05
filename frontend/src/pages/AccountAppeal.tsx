import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Send } from 'lucide-react';
import { customerApi, CustomerApiError } from '../services/customerApi';
import './account.css';
import './account-public.css';

type AppealLocationState = { appealToken?: string };

export function AccountAppeal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [appealToken, setAppealToken] = useState(
    (location.state as AppealLocationState | null)?.appealToken ?? '',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appealToken || busy) return;
    setBusy(true);
    setError('');
    try {
      await customerApi.submitAppeal(appealToken, message.trim());
      setAppealToken('');
      setMessage('');
      setSubmitted(true);
      navigate(location.pathname, { replace: true, state: null });
    } catch (reason) {
      setError(
        reason instanceof CustomerApiError && reason.status === 401
          ? 'Phiên xác minh đã hết hạn. Vui lòng đăng nhập và xác thực email lại để gửi kháng nghị.'
          : reason instanceof Error
            ? reason.message
            : 'Chưa thể gửi kháng nghị. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="section account-appeal-page">
      <Link className="text-link" to="/tai-khoan">
        <ArrowLeft size={16} /> Quay lại tài khoản
      </Link>
      <section className="account-panel account-appeal-card">
        {submitted ? (
          <>
            <BadgeCheck size={34} aria-hidden="true" />
            <p className="eyebrow">ĐÃ GHI NHẬN</p>
            <h1>Kháng nghị đã được gửi.</h1>
            <p>
              Quản trị viên sẽ xem xét nội dung và quyết định có mở lại tài khoản hay không. Bạn có
              thể thử đăng nhập lại sau khi nhận được phản hồi.
            </p>
            <Link className="button" to="/tai-khoan">
              Về trang đăng nhập
            </Link>
          </>
        ) : !appealToken ? (
          <>
            <p className="eyebrow">HỖ TRỢ TÀI KHOẢN</p>
            <h1>Cần xác minh trước khi gửi kháng nghị.</h1>
            <p>
              Vì lý do bảo mật, trang này chỉ mở sau khi bạn nhập đúng mật khẩu và mã OTP gửi tới
              email đã xác minh.
            </p>
            <Link className="button" to="/tai-khoan">
              Đăng nhập và xác minh email
            </Link>
          </>
        ) : (
          <>
            <p className="eyebrow">YÊU CẦU XEM XÉT TÀI KHOẢN</p>
            <h1>Gửi kháng nghị</h1>
            <p>
              Tài khoản đang tạm khóa và chưa thể đăng nhập. Hãy mô tả ngắn gọn lý do bạn cho rằng
              cần xem xét lại. Không gửi mật khẩu, mã OTP hoặc thông tin thanh toán.
            </p>
            <form className="account-appeal-form" onSubmit={submit}>
              <label className="field">
                Nội dung kháng nghị
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  minLength={20}
                  maxLength={1500}
                  rows={7}
                  required
                  placeholder="Cho chúng tôi biết thêm bối cảnh để quản trị viên có thể xem xét…"
                />
                <small>{message.length}/1500 ký tự · tối thiểu 20 ký tự</small>
              </label>
              <button
                className="button"
                type="submit"
                disabled={busy || message.trim().length < 20}
              >
                <Send size={17} /> {busy ? 'Đang gửi…' : 'Gửi kháng nghị'}
              </button>
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  );
}
