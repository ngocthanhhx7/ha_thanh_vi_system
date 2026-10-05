import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, House, RefreshCw } from 'lucide-react';
import './error-page.css';

type ErrorCopy = { title: string; description: string; primary?: { label: string; to: string } };

const messages: Record<number, ErrorCopy> = {
  401: {
    title: 'Phiên đăng nhập đã hết hạn.',
    description: 'Hãy đăng nhập lại để tiếp tục an toàn.',
    primary: { label: 'Đăng nhập', to: '/tai-khoan' },
  },
  403: {
    title: 'Bạn chưa có quyền vào đây.',
    description: 'Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên.',
    primary: { label: 'Về trang chủ', to: '/' },
  },
  404: {
    title: 'Trang này chưa được tìm thấy.',
    description: 'Có thể đường dẫn đã thay đổi hoặc nội dung không còn ở đây.',
    primary: { label: 'Khám phá sản phẩm', to: '/san-pham' },
  },
  413: {
    title: 'Dữ liệu gửi lên quá lớn.',
    description: 'Hãy giảm dung lượng tệp hoặc rút gọn nội dung rồi thử lại.',
  },
  429: {
    title: 'Mình cần chậm lại một chút.',
    description: 'Hệ thống nhận quá nhiều yêu cầu trong thời gian ngắn. Vui lòng đợi rồi thử lại.',
  },
  500: {
    title: 'Có chút trục trặc ở phía chúng mình.',
    description: 'Hệ thống gặp lỗi ngoài dự kiến. Dữ liệu của bạn vẫn được bảo vệ.',
  },
  502: {
    title: 'Máy chủ chưa phản hồi đúng.',
    description: 'Kết nối tới dịch vụ đang gặp trục trặc. Vui lòng thử lại sau ít phút.',
  },
  503: {
    title: 'Dịch vụ tạm thời chưa sẵn sàng.',
    description: 'Chúng mình đang khắc phục sự cố. Hãy quay lại sau ít phút nhé.',
  },
  504: {
    title: 'Yêu cầu mất quá nhiều thời gian.',
    description: 'Kết nối đã hết thời gian chờ. Hãy thử lại khi đường truyền ổn định hơn.',
  },
  505: {
    title: 'Phiên bản giao thức chưa được hỗ trợ.',
    description:
      'Trình duyệt hoặc máy chủ không thống nhất phiên bản HTTP. Hãy tải lại trang hoặc liên hệ quản trị viên.',
  },
};

function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return undefined;
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return undefined;
    return target.pathname + target.search + target.hash;
  } catch {
    return undefined;
  }
}

export function ErrorPage({ status: fixedStatus }: { status?: number }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = fixedStatus ?? Number(params.status);
  const status =
    Number.isInteger(requested) && requested >= 400 && requested <= 599 ? requested : 500;
  const copy = messages[status] ?? {
    title: 'Yêu cầu chưa thể hoàn tất.',
    description: 'Hệ thống gặp sự cố ngoài dự kiến. Vui lòng thử lại sau.',
  };
  const returnTo = safeReturnTo((location.state as { from?: unknown } | null)?.from);
  const retryable = status === 429 || status >= 500;

  return (
    <main className="error-page">
      <div className="error-card">
        <span className="error-code">{status}</span>
        <p className="eyebrow">HÀ THÀNH VỊ · CÓ CHÚT TRỤC TRẶC</p>
        <h1>{copy.title}</h1>
        <p className="error-description">{copy.description}</p>
        <div className="error-actions">
          {copy.primary ? (
            <Link className="button" to={copy.primary.to}>
              {copy.primary.label}
            </Link>
          ) : retryable && returnTo ? (
            <button
              className="button"
              type="button"
              onClick={() => navigate(returnTo, { replace: true })}
            >
              <RefreshCw size={17} /> Thử lại
            </button>
          ) : retryable ? (
            <button className="button" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={17} /> Tải lại trang
            </button>
          ) : (
            <Link className="button" to="/">
              {' '}
              <House size={17} /> Về trang chủ
            </Link>
          )}
          <Link className="error-back" to="/lien-he">
            <ArrowLeft size={16} /> Cần hỗ trợ? Liên hệ với chúng mình
          </Link>
        </div>
      </div>
    </main>
  );
}
