import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminSystemLogs, WorkspaceFrame, WorkspaceNotifications } from '../components/Workspace';
import { type Content, type Product } from '../constants/catalog';
import { orderStatuses } from '../constants/commerce';
import { useShop } from '../hooks/useShop';
import { request } from '../services/api';
import { customerApi, CustomerApiError, type CustomerUser } from '../services/customerApi';
import { priceLabel } from '../utils/format';
import './admin.css';

type AdminTab = 'overview' | 'products' | 'site' | 'stats' | 'notifications' | 'logs';
type ProductSort = 'name' | 'price' | 'category';
type ProductPage = {
  products: Product[];
  total: number;
  page: number;
  limit: number;
};
type Statistics = {
  orders: number;
  totalCollected: number;
  delivered: number;
  pending: number;
  customers: number;
  products: number;
  byStatus: { status: string; count: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  dailyOrders: { date: string; orders: number; collected: number }[];
};

const tabValues: AdminTab[] = ['overview', 'products', 'site', 'stats', 'notifications', 'logs'];
const categoryLabels: Record<string, string> = {
  'banh-cha': 'Bánh chả',
  'qua-tang': 'Quà tặng',
};
const chartColors = ['#80613c', '#b68e52', '#63816a', '#8b6e91', '#bd715d', '#607e97'];
const emptyProduct = (): Product => ({
  id: '',
  slug: '',
  name: '',
  category: 'banh-cha',
  weight: '',
  flavor: '',
  description: '',
  image: '',
  price: null,
  featured: false,
});
const errorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Chưa thể hoàn tất. Vui lòng thử lại.';
const siteLabels = {
  tagline: 'Thông điệp thương hiệu',
  heroTitle: 'Tiêu đề trang chủ',
  heroDescription: 'Lời giới thiệu trang chủ',
  story: 'Câu chuyện',
  phone: 'Điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
} as const;
const productLabels = {
  name: 'Tên sản phẩm',
  description: 'Mô tả',
  weight: 'Quy cách',
  flavor: 'Hương vị',
  tagline: 'Thông điệp sản phẩm',
  packaging: 'Đóng gói',
  ingredients: 'Thành phần chính thức',
  allergens: 'Thông tin dị ứng',
  storage: 'Hướng dẫn bảo quản',
} as const;
const tabHeadings: Record<AdminTab, { title: string; description: string }> = {
  overview: {
    title: 'Tổng quan vận hành',
    description: 'Theo dõi đơn hàng, doanh thu đã thu và các xu hướng thực tế của cửa hàng.',
  },
  products: {
    title: 'Quản lý sản phẩm',
    description: 'Tìm kiếm, lọc, sắp xếp và cập nhật catalog theo từng trang.',
  },
  site: {
    title: 'Nội dung website',
    description: 'Chỉnh sửa thông tin thương hiệu đang hiển thị trên website.',
  },
  stats: {
    title: 'Báo cáo hoạt động',
    description: 'Xem chi tiết trạng thái đơn và các sản phẩm đã bán trong khoảng ngày chọn.',
  },
  notifications: {
    title: 'Thông báo',
    description: 'Cập nhật công việc và hoạt động liên quan đến tài khoản của bạn.',
  },
  logs: {
    title: 'Nhật ký hệ thống',
    description: 'Tra cứu sự kiện vận hành và bảo mật trong hệ thống.',
  },
};

function parseTab(value: string | null): AdminTab {
  return tabValues.includes(value as AdminTab) ? (value as AdminTab) : 'overview';
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function recentDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { from: localDateValue(start), to: localDateValue(end) };
}

export function Admin() {
  const { refresh } = useShop();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<AdminTab>(() => parseTab(searchParams.get('tab')));
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authRevision, setAuthRevision] = useState(0);
  const [content, setContent] = useState<Content | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [editor, setEditor] = useState<{ value: Product; create: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [contentRevision, setContentRevision] = useState(0);

  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productLoading, setProductLoading] = useState(false);
  const [productReload, setProductReload] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<ProductSort>('name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    setAuthLoading(true);
    setAuthError('');
    customerApi
      .me()
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch((reason) => {
        if (!active) return;
        if (!(reason instanceof CustomerApiError && reason.status === 401))
          setAuthError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authRevision]);

  useEffect(() => {
    if (tab !== 'site' || !user || user.role !== 'admin' || content) return;
    let active = true;
    setContentLoading(true);
    setError('');
    request<Content>('/admin/content')
      .then((result) => {
        if (active) setContent(result);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setContentLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, user, content, contentRevision]);

  useEffect(() => {
    const normalized = searchInput.trim();
    const timer = window.setTimeout(() => {
      if (normalized !== appliedSearch) {
        setAppliedSearch(normalized);
        setPage(1);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, appliedSearch]);

  useEffect(() => {
    if (tab !== 'products' || !user || user.role !== 'admin') return;
    let active = true;
    setProductLoading(true);
    setError('');
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      direction,
    });
    if (appliedSearch) query.set('q', appliedSearch);
    if (category) query.set('category', category);
    request<ProductPage>('/admin/products?' + query.toString())
      .then((result) => {
        if (!active) return;
        setProducts(result.products);
        setProductTotal(result.total);
        if (result.page !== page) setPage(result.page);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setProductLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, user, appliedSearch, category, sort, direction, page, limit, productReload]);

  async function openProduct(product: Product) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const value = await request<Product>('/admin/products/' + encodeURIComponent(product.id));
      setEditor({ value, create: false });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(value: Product, create: boolean) {
    const body: Record<string, unknown> = { ...value };
    for (const key of [
      'tagline',
      'packaging',
      'ingredients',
      'ingredientImage',
      'allergens',
      'storage',
    ] as const) {
      if (typeof value[key] === 'string' && !value[key]?.trim()) {
        if (create) delete body[key];
        else body[key] = null;
      }
    }
    const saved = await request<Product>(
      '/admin/products' + (create ? '' : '/' + encodeURIComponent(value.id)),
      { method: create ? 'POST' : 'PATCH', body: JSON.stringify(body) },
    );
    setEditor(null);
    setStatus(create ? 'Đã thêm sản phẩm.' : 'Đã lưu sản phẩm.');
    if (create) setPage(1);
    setProductReload((revision) => revision + 1);
    await refresh();
    return saved;
  }

  async function removeProduct() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await request('/admin/products/' + encodeURIComponent(deleting.id), { method: 'DELETE' });
      setDeleting(null);
      setStatus('Đã xóa sản phẩm khỏi danh mục.');
      if (products.length === 1 && page > 1) setPage((current) => current - 1);
      else setProductReload((revision) => revision + 1);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    if (!content) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const latest = await request<{ products: Product[] }>('/admin/products');
      await request('/admin/content', {
        method: 'PUT',
        body: JSON.stringify({ site: content.site, products: latest.products }),
      });
      setStatus('Đã lưu nội dung thương hiệu.');
      setContentRevision((revision) => revision + 1);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <main className="admin-access-state">
        <p role="status">Đang kiểm tra quyền quản trị…</p>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="admin-access-state">
        <section className="admin-access-card">
          <h1>Không gian quản trị</h1>
          {authError ? (
            <>
              <p role="alert" className="account-error">
                {authError}
              </p>
              <button
                className="button"
                type="button"
                onClick={() => setAuthRevision((value) => value + 1)}
              >
                Thử lại
              </button>
            </>
          ) : (
            <>
              <p>Đăng nhập bằng tài khoản quản trị để tiếp tục.</p>
              <Link className="button" to="/tai-khoan">
                Đăng nhập
              </Link>
            </>
          )}
        </section>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="admin-access-state">
        <section className="admin-access-card">
          <h1>Không gian quản trị</h1>
          <p>Tài khoản này chưa có quyền quản trị nội dung.</p>
          <Link className="button" to="/quan-tri">
            Mở không gian làm việc
          </Link>
        </section>
      </main>
    );
  }

  const heading = tabHeadings[tab];
  const workspaceTab = tab === 'overview' ? 'dashboard' : tab;
  const pageCount = Math.max(1, Math.ceil(productTotal / limit));
  const categoryOptions = Array.from(
    new Set(['banh-cha', 'qua-tang', ...products.map((product) => product.category)]),
  ).sort((left, right) =>
    (categoryLabels[left] || left).localeCompare(categoryLabels[right] || right, 'vi'),
  );
  const firstResult = productTotal === 0 ? 0 : (page - 1) * limit + 1;
  const lastResult = Math.min(page * limit, productTotal);

  return (
    <WorkspaceFrame user={user} active={workspaceTab}>
      <div className="admin-workspace">
        <header className="workspace-page-heading admin-page-heading">
          <div>
            <p className="eyebrow">HÀ THÀNH VỊ · QUẢN TRỊ</p>
            <h1>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>
          {tab === 'products' && (
            <button
              className="button"
              type="button"
              disabled={busy || Boolean(editor)}
              onClick={() => {
                setEditor({ value: emptyProduct(), create: true });
                setDeleting(null);
                setError('');
                setStatus('');
              }}
            >
              Thêm sản phẩm
            </button>
          )}
        </header>

        {error && (
          <p role="alert" className="account-error admin-feedback">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="form-status admin-feedback">
            {status}
          </p>
        )}

        {tab === 'overview' && <AdminAnalytics mode="overview" />}

        {tab === 'stats' && <AdminAnalytics mode="report" />}

        {tab === 'products' && (
          <section className="admin-catalog workspace-panel" aria-labelledby="admin-products-title">
            <div className="admin-catalog-heading">
              <div>
                <p className="eyebrow">DANH MỤC</p>
                <h2 id="admin-products-title">Catalog sản phẩm</h2>
                <p>
                  Hiển thị {firstResult}–{lastResult} trong {productTotal.toLocaleString('vi-VN')}{' '}
                  sản phẩm
                </p>
              </div>
              <label className="admin-page-size">
                Mỗi trang
                <select
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            {!editor && (
              <div className="admin-catalog-filters">
                <label className="field">
                  Tìm sản phẩm
                  <input
                    type="search"
                    value={searchInput}
                    maxLength={120}
                    placeholder="Tên, mã, đường dẫn hoặc hương vị"
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </label>
                <label className="field">
                  Nhóm sản phẩm (mã)
                  <input
                    type="search"
                    list="admin-product-categories"
                    value={category}
                    maxLength={100}
                    placeholder="Tất cả nhóm"
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setPage(1);
                    }}
                  />
                  <datalist id="admin-product-categories">
                    {categoryOptions.map((value) => (
                      <option value={value} key={value}>
                        {categoryLabels[value] || value}
                      </option>
                    ))}
                  </datalist>
                </label>
                <button
                  className="button button-outline admin-clear-filters"
                  type="button"
                  disabled={!searchInput && !category}
                  onClick={() => {
                    setSearchInput('');
                    setAppliedSearch('');
                    setCategory('');
                    setPage(1);
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}

            {editor ? (
              <ProductEditor
                key={editor.create ? 'new' : editor.value.id}
                value={editor.value}
                create={editor.create}
                onSave={saveProduct}
                onClose={() => setEditor(null)}
              />
            ) : (
              <>
                {productLoading && (
                  <p className="admin-loading" role="status">
                    Đang tải catalog…
                  </p>
                )}
                <div className="admin-product-table-wrap">
                  <table className="admin-product-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          <button
                            className="admin-sort-button"
                            type="button"
                            aria-label="Sắp xếp theo tên sản phẩm"
                            onClick={() => {
                              setSort('name');
                              setDirection(sort === 'name' && direction === 'asc' ? 'desc' : 'asc');
                              setPage(1);
                            }}
                          >
                            Sản phẩm {sort === 'name' ? (direction === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">
                          <button
                            className="admin-sort-button"
                            type="button"
                            aria-label="Sắp xếp theo nhóm sản phẩm"
                            onClick={() => {
                              setSort('category');
                              setDirection(
                                sort === 'category' && direction === 'asc' ? 'desc' : 'asc',
                              );
                              setPage(1);
                            }}
                          >
                            Nhóm {sort === 'category' ? (direction === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">
                          <button
                            className="admin-sort-button"
                            type="button"
                            aria-label="Sắp xếp theo giá"
                            onClick={() => {
                              setSort('price');
                              setDirection(
                                sort === 'price' && direction === 'asc' ? 'desc' : 'asc',
                              );
                              setPage(1);
                            }}
                          >
                            Giá {sort === 'price' ? (direction === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <div className="admin-product-identity">
                              <img src={product.image} alt="" loading="lazy" />
                              <div>
                                <strong>{product.name}</strong>
                                <span>
                                  {product.id} · {product.weight}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>{categoryLabels[product.category] || product.category}</td>
                          <td>{priceLabel(product.price)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                className="button button-outline"
                                type="button"
                                disabled={busy}
                                onClick={() => void openProduct(product)}
                              >
                                Xem / sửa
                              </button>
                              <button
                                className="admin-delete"
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setDeleting(product);
                                  setError('');
                                }}
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!productLoading && !products.length && (
                  <p className="workspace-empty">
                    {appliedSearch || category
                      ? 'Không tìm thấy sản phẩm khớp với bộ lọc.'
                      : 'Danh mục chưa có sản phẩm. Thêm thức quà đầu tiên nhé.'}
                  </p>
                )}
                <div className="workspace-pagination admin-catalog-pagination">
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={page <= 1 || productLoading}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Trang trước
                  </button>
                  <span>
                    Trang {page} / {pageCount}
                  </span>
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={page >= pageCount || productLoading}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              </>
            )}

            {deleting && (
              <div
                className="admin-delete-confirm"
                role="alertdialog"
                aria-modal="false"
                aria-labelledby="delete-product-title"
              >
                <h3 id="delete-product-title">Xóa “{deleting.name}”?</h3>
                <p>
                  Sản phẩm sẽ được gỡ khỏi danh mục. Thông tin trong những đơn hàng đã đặt vẫn được
                  giữ lại.
                </p>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void removeProduct()}
                >
                  {busy ? 'Đang xóa…' : 'Xác nhận xóa sản phẩm'}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  Giữ sản phẩm
                </button>
              </div>
            )}
          </section>
        )}

        {tab === 'site' &&
          (contentLoading ? (
            <p className="workspace-panel" role="status">
              Đang tải nội dung website…
            </p>
          ) : content ? (
            <form className="admin-site-editor workspace-panel" onSubmit={saveSite}>
              <div className="admin-catalog-heading">
                <div>
                  <p className="eyebrow">CMS</p>
                  <h2>Nội dung thương hiệu</h2>
                  <p>Thay đổi được lưu theo luồng nội dung hiện có.</p>
                </div>
              </div>
              <div className="admin-site-fields">
                {(Object.keys(siteLabels) as (keyof typeof siteLabels)[]).map((key) => (
                  <label className="field" key={key}>
                    {siteLabels[key]}
                    <textarea
                      rows={key === 'story' ? 5 : 2}
                      value={content.site[key]}
                      required
                      onChange={(event) =>
                        setContent({
                          ...content,
                          site: { ...content.site, [key]: event.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="button" type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu nội dung thương hiệu'}
              </button>
            </form>
          ) : (
            <section className="workspace-panel">
              <p>Nội dung chưa được tải.</p>
              <button
                className="button"
                type="button"
                onClick={() => setContentRevision((value) => value + 1)}
              >
                Tải lại nội dung
              </button>
            </section>
          ))}

        {tab === 'notifications' && <WorkspaceNotifications />}
        {tab === 'logs' && <AdminSystemLogs />}
      </div>
    </WorkspaceFrame>
  );
}

function ProductEditor({
  value,
  create,
  onSave,
  onClose,
}: {
  value: Product;
  create: boolean;
  onSave: (value: Product, create: boolean) => Promise<Product>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Product>(value);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'image' | 'ingredientImage' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const disabled = busy || uploading !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(draft, create);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined, key: 'image' | 'ingredientImage') {
    if (!file) return;
    setError('');
    setNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Chọn ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh tối đa 5 MB.');
      return;
    }
    setUploading(key);
    try {
      const result = await request<{ url: string; width: number; height: number }>(
        '/admin/uploads',
        { method: 'POST', headers: { 'Content-Type': file.type }, body: file },
      );
      setDraft((previous) => ({ ...previous, [key]: result.url }));
      setNotice('Đã tải ảnh. Lưu sản phẩm để cập nhật ảnh trên website.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUploading(null);
    }
  }

  return (
    <form className="admin-editor" onSubmit={submit}>
      <h2>{create ? 'Thêm thức quà mới' : 'Chi tiết và chỉnh sửa sản phẩm'}</h2>
      <fieldset disabled={disabled}>
        <legend>Thông tin sản phẩm</legend>
        <div className="admin-editor-grid">
          <label className="field">
            Mã sản phẩm
            <input
              value={draft.id}
              required
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              readOnly={!create}
              onChange={(event) => setDraft({ ...draft, id: event.target.value })}
            />
            <small>
              Mã duy nhất, dùng chữ thường và dấu gạch ngang. Không thể đổi sau khi tạo.
            </small>
          </label>
          <label className="field">
            Đường dẫn sản phẩm
            <input
              value={draft.slug}
              required
              maxLength={100}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              readOnly={!create}
              onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            />
            <small>Ví dụ: banh-cha-truyen-thong. Không thể đổi sau khi tạo.</small>
          </label>
          <label className="field">
            Nhóm sản phẩm
            <input
              value={draft.category}
              required
              maxLength={100}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
          </label>
          <label className="field">
            Giá VND (để trống: liên hệ)
            <input
              type="number"
              min={0}
              step={1}
              value={draft.price ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  price: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
          {(Object.keys(productLabels) as (keyof typeof productLabels)[]).map((key) => (
            <label
              className={
                'field ' +
                (['description', 'ingredients', 'storage'].includes(key) ? 'admin-wide' : '')
              }
              key={key}
            >
              {productLabels[key]}
              <textarea
                rows={key === 'description' || key === 'ingredients' ? 4 : 2}
                value={draft[key] || ''}
                required={['name', 'description', 'weight', 'flavor'].includes(key)}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label className="field admin-wide">
            Trong pack có gì? (mỗi dòng một món và số lượng)
            <textarea
              rows={4}
              value={draft.packageContents?.join('\n') || ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  packageContents: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {(['image', 'ingredientImage'] as const).map((key) => (
            <div key={key} className="admin-image-field">
              <label className="field">
                {key === 'image' ? 'Đường dẫn ảnh sản phẩm' : 'Đường dẫn ảnh bảng thành phần'}
                <input
                  value={draft[key] || ''}
                  required={key === 'image'}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
              <label className="field">
                {key === 'image' ? 'Tải ảnh sản phẩm' : 'Tải ảnh bảng thành phần'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void upload(event.target.files?.[0], key)}
                />
                <small>JPEG, PNG hoặc WebP, tối đa 5 MB.</small>
              </label>
              {draft[key] && (
                <img
                  className="admin-image-preview"
                  src={draft[key]}
                  alt={key === 'image' ? 'Xem trước ảnh sản phẩm' : 'Xem trước bảng thành phần'}
                />
              )}
            </div>
          ))}
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(event) => setDraft({ ...draft, featured: event.target.checked })}
            />
            Hiện ở trang chủ
          </label>
        </div>
      </fieldset>
      {uploading && <p role="status">Đang tải ảnh…</p>}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-status">
          {notice}
        </p>
      )}
      <div className="admin-editor-actions">
        <button className="button" disabled={disabled}>
          {busy ? 'Đang lưu…' : create ? 'Tạo sản phẩm' : 'Lưu sản phẩm'}
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={disabled}
          onClick={onClose}
        >
          Đóng chỉnh sửa
        </button>
      </div>
    </form>
  );
}

function AdminAnalytics({ mode }: { mode: 'overview' | 'report' }) {
  const defaultRange = useMemo(() => recentDateRange(), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [filter, setFilter] = useState(defaultRange);
  const [data, setData] = useState<Statistics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setData(null);
    const query = new URLSearchParams();
    if (filter.from) query.set('from', filter.from);
    if (filter.to) query.set('to', filter.to);
    request<Statistics>('/admin/statistics' + (query.size ? '?' + query.toString() : ''))
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [filter]);

  const trend = useMemo(
    () => makeTrend(data?.dailyOrders || [], filter.from, filter.to),
    [data, filter],
  );
  const statusData = useMemo(
    () =>
      (data?.byStatus || []).map((item) => ({
        ...item,
        label: orderStatuses[item.status as keyof typeof orderStatuses] || item.status,
      })),
    [data],
  );

  function apply(event: FormEvent) {
    event.preventDefault();
    if (from && to && from > to) {
      setError('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
      return;
    }
    setFilter({ from, to });
  }

  return (
    <section className="admin-analytics">
      <div className="admin-analytics-toolbar">
        <div>
          <p className="eyebrow">{mode === 'overview' ? 'BẢNG ĐIỀU HÀNH' : 'PHÂN TÍCH CHI TIẾT'}</p>
          <h2>{mode === 'overview' ? 'Hiệu quả cửa hàng' : 'Báo cáo theo khoảng thời gian'}</h2>
          <p>
            Đơn hàng tính theo ngày tạo; tiền đã thu chỉ gồm đơn đã thanh toán, không gồm đơn hủy
            hoặc hoàn trả. Khách hàng và sản phẩm là số hiện có.
          </p>
        </div>
        <form className="admin-stats-filter" onSubmit={apply}>
          <label className="field">
            Từ ngày
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            Đến ngày
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="button" disabled={busy}>
            Cập nhật
          </button>
        </form>
      </div>
      {busy && (
        <p role="status" className="admin-loading">
          Đang tải thống kê…
        </p>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="admin-stat-cards">
            <article>
              <span>Đơn hàng</span>
              <strong>{data.orders.toLocaleString('vi-VN')}</strong>
              <small>Trong khoảng ngày chọn</small>
            </article>
            <article>
              <span>Tiền đã thu</span>
              <strong>{priceLabel(data.totalCollected)}</strong>
              <small>Đơn đã thanh toán, trừ hủy và hoàn</small>
            </article>
            <article>
              <span>Chờ xử lý</span>
              <strong>{data.pending.toLocaleString('vi-VN')}</strong>
              <small>Đơn đang ở trạng thái chờ</small>
            </article>
            <article>
              <span>Đã giao</span>
              <strong>{data.delivered.toLocaleString('vi-VN')}</strong>
              <small>Trong khoảng ngày tạo đơn</small>
            </article>
            <article>
              <span>Khách hàng</span>
              <strong>{data.customers.toLocaleString('vi-VN')}</strong>
              <small>Tổng tài khoản khách hiện có</small>
            </article>
            <article>
              <span>Sản phẩm</span>
              <strong>{data.products.toLocaleString('vi-VN')}</strong>
              <small>Tổng sản phẩm hiện có</small>
            </article>
          </div>

          <div className="admin-chart-grid">
            <article className="admin-chart-card admin-chart-trend">
              <div className="admin-chart-heading">
                <div>
                  <h3>Đơn hàng và tiền đã thu</h3>
                  <p>Xu hướng theo ngày · số ngày hiển thị tối đa 31</p>
                </div>
              </div>
              <div className="admin-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 12, right: 14, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="#eee7dc" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis
                      yAxisId="orders"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                    />
                    <YAxis
                      yAxisId="money"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                      formatter={(value, name) =>
                        name === 'Tiền đã thu'
                          ? [priceLabel(Number(value)), name]
                          : [Number(value).toLocaleString('vi-VN'), name]
                      }
                    />
                    <Legend />
                    <Area
                      yAxisId="orders"
                      type="monotone"
                      dataKey="orders"
                      name="Đơn hàng"
                      stroke="#80613c"
                      fill="#eadcc4"
                      fillOpacity={0.72}
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="money"
                      type="monotone"
                      dataKey="collected"
                      name="Tiền đã thu"
                      stroke="#63816a"
                      fill="#dce9dd"
                      fillOpacity={0.5}
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="admin-chart-card">
              <div className="admin-chart-heading">
                <div>
                  <h3>Trạng thái đơn hàng</h3>
                  <p>Phân bổ theo ngày tạo trong khoảng chọn</p>
                </div>
              </div>
              {statusData.length ? (
                <div className="admin-chart admin-chart-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="54%"
                        outerRadius="78%"
                        paddingAngle={2}
                      >
                        {statusData.map((item, index) => (
                          <Cell key={item.status} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [Number(value).toLocaleString('vi-VN'), name]}
                      />
                      <Legend verticalAlign="bottom" height={42} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="workspace-empty admin-chart-empty">
                  Chưa có đơn hàng trong khoảng này.
                </p>
              )}
            </article>

            <article className="admin-chart-card admin-chart-products">
              <div className="admin-chart-heading">
                <div>
                  <h3>Sản phẩm bán chạy</h3>
                  <p>Số lượng trong đơn đã thanh toán, không gồm hủy hoặc hoàn</p>
                </div>
              </div>
              {data.topProducts.length ? (
                <div className="admin-chart admin-chart-bars">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topProducts.slice(0, 7)}
                      layout="vertical"
                      margin={{ top: 6, right: 20, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid stroke="#eee7dc" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [
                          Number(value).toLocaleString('vi-VN') + ' sản phẩm',
                          'Số lượng',
                        ]}
                      />
                      <Bar
                        dataKey="quantity"
                        name="Số lượng"
                        fill="#b68e52"
                        radius={[0, 7, 7, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="workspace-empty admin-chart-empty">
                  Chưa có sản phẩm bán ra trong khoảng này.
                </p>
              )}
            </article>
          </div>

          {mode === 'report' && (
            <div className="admin-report-tables">
              <section className="workspace-panel">
                <h3>Chi tiết trạng thái đơn hàng</h3>
                <div className="admin-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Trạng thái</th>
                        <th scope="col">Số đơn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusData.map((item) => (
                        <tr key={item.status}>
                          <td>{item.label}</td>
                          <td>{item.count.toLocaleString('vi-VN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!statusData.length && <p>Chưa có đơn hàng trong khoảng này.</p>}
              </section>
              <section className="workspace-panel">
                <h3>Sản phẩm bán chạy</h3>
                <div className="admin-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Sản phẩm</th>
                        <th scope="col">Số lượng</th>
                        <th scope="col">Tiền đã thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((item) => (
                        <tr key={item.productId}>
                          <td>{item.name}</td>
                          <td>{item.quantity.toLocaleString('vi-VN')}</td>
                          <td>{priceLabel(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.topProducts.length && <p>Chưa có sản phẩm bán ra trong khoảng này.</p>}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function makeTrend(dailyOrders: Statistics['dailyOrders'], from: string, to: string) {
  const byDate = new Map(dailyOrders.map((item) => [item.date, item]));
  const end = to || dailyOrders.at(-1)?.date || localDateValue(new Date());
  const endDate = new Date(end + 'T12:00:00');
  let start = from || dailyOrders[0]?.date || end;
  const startDate = new Date(start + 'T12:00:00');
  const selectedDays = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
  );
  if (selectedDays > 31) {
    startDate.setTime(endDate.getTime());
    startDate.setDate(startDate.getDate() - 30);
    start = localDateValue(startDate);
  }
  const chartData: { date: string; label: string; orders: number; collected: number }[] = [];
  const cursor = new Date(start + 'T12:00:00');
  while (cursor <= endDate && chartData.length < 31) {
    const date = localDateValue(cursor);
    const item = byDate.get(date);
    chartData.push({
      date,
      label: date.slice(5),
      orders: item?.orders || 0,
      collected: item?.collected || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return chartData;
}
