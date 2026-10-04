import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { type Content } from '../constants/catalog';
import { useShop } from '../hooks/useShop';
import { request } from '../services/api';
import { customerApi, CustomerApiError, type CustomerUser } from '../services/customerApi';
export function Admin() {
  const { refresh } = useShop();
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Content | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setStatus('');
    async function load() {
      const result = await customerApi.me();
      if (!active) return;
      setUser(result.user);
      if (result.user.role !== 'admin') return;
      const content = await request<Content>('/admin/content');
      if (active) setDraft(content);
    }
    load()
      .catch((reason) => {
        if (active) {
          setDraft(null);
          if (!(reason instanceof CustomerApiError && reason.status === 401))
            setStatus(reason instanceof Error ? reason.message : 'Chưa tải được nội dung.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await request('/admin/content', { method: 'PUT', body: JSON.stringify(draft) });
      setStatus('Đã lưu nội dung vào hệ thống.');
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Chưa lưu được nội dung.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <Link to="/" className="text-link">
        ← Về website
      </Link>
      <h1>Quản trị nội dung</h1>
      <p>Hà Thành Vị · Quản lý trang và danh mục sản phẩm</p>
      {loading ? (
        <p role="status">Đang kiểm tra quyền quản trị…</p>
      ) : !user ? (
        <div className="notice">
          <p>Đăng nhập tài khoản quản trị để cập nhật nội dung và sản phẩm.</p>
          <Link className="button" to="/tai-khoan">
            Đăng nhập tài khoản
          </Link>
        </div>
      ) : user.role !== 'admin' ? (
        <div className="notice">
          <p>Tài khoản này chưa có quyền quản trị nội dung.</p>
          <Link className="button" to="/quan-tri">
            Mở trang làm việc
          </Link>
        </div>
      ) : !draft ? (
        <button className="button" onClick={() => setRevision((value) => value + 1)}>
          Tải lại nội dung
        </button>
      ) : (
        <form onSubmit={save}>
          <div className="section-heading">
            <h2>Nội dung thương hiệu</h2>
            <Link className="button button-outline" to="/quan-tri">
              Quản lý bán hàng
            </Link>
          </div>
          {(
            [
              'tagline',
              'heroTitle',
              'heroDescription',
              'story',
              'phone',
              'email',
              'address',
            ] as const
          ).map((key) => (
            <label className="field" key={key}>
              {
                {
                  tagline: 'Thông điệp thương hiệu',
                  heroTitle: 'Tiêu đề trang chủ',
                  heroDescription: 'Lời giới thiệu trang chủ',
                  story: 'Câu chuyện',
                  phone: 'Điện thoại',
                  email: 'Email',
                  address: 'Địa chỉ',
                }[key]
              }
              <textarea
                rows={key === 'story' ? 5 : 2}
                value={draft.site[key]}
                onChange={(e) =>
                  setDraft({ ...draft, site: { ...draft.site, [key]: e.target.value } })
                }
                required
              />
            </label>
          ))}
          <h2>Sản phẩm</h2>
          {draft.products.map((p, i) => (
            <fieldset key={p.id}>
              <legend>{p.name}</legend>
              {(['name', 'description', 'weight', 'flavor', 'image'] as const).map((key) => (
                <label className="field" key={key}>
                  {
                    {
                      name: 'Tên sản phẩm',
                      description: 'Mô tả',
                      weight: 'Quy cách',
                      flavor: 'Hương vị',
                      image: 'Đường dẫn ảnh',
                    }[key]
                  }
                  <input
                    value={p[key]}
                    required
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        products: draft.products.map((v, j) =>
                          j === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <label className="field">
                Giá VND (để trống: liên hệ)
                <input
                  type="number"
                  min="0"
                  value={p.price ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      products: draft.products.map((v, j) =>
                        j === i
                          ? { ...v, price: e.target.value === '' ? null : Number(e.target.value) }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={p.featured}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      products: draft.products.map((v, j) =>
                        j === i ? { ...v, featured: e.target.checked } : v,
                      ),
                    })
                  }
                />
                Hiện ở trang chủ
              </label>
            </fieldset>
          ))}
          <button className="button" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu nội dung'}
          </button>
        </form>
      )}{' '}
      {status && (
        <p className="form-status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}
