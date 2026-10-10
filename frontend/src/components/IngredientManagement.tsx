import { useEffect, useState, type FormEvent } from 'react';
import type { Ingredient } from '../constants/catalog';
import { useShop } from '../hooks/useShop';
import { request } from '../services/api';

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Chưa thể hoàn tất. Vui lòng thử lại.';

function useIngredientCatalog() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    request<{ ingredients: Ingredient[] }>('/admin/ingredients')
      .then((response) => {
        if (!Array.isArray(response.ingredients))
          throw new Error('Danh mục thành phần chưa hợp lệ.');
        if (active) setIngredients(response.ingredients);
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return { ingredients, loading, error, reload: () => setRevision((value) => value + 1) };
}

export function ProductIngredientSelector({
  selected,
  onChange,
  onReady,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  onReady: (ready: boolean) => void;
}) {
  const { ingredients, loading, error, reload } = useIngredientCatalog();
  const missing = selected.filter((id) => !ingredients.some((ingredient) => ingredient.id === id));
  const ready = !loading && !error && missing.length === 0;
  useEffect(() => onReady(ready), [ready, onReady]);
  return (
    <div className="admin-wide admin-ingredient-selector">
      <h3>Thành phần của sản phẩm</h3>
      <p>Chọn thành phần sẽ xuất hiện trên trang sản phẩm.</p>
      {loading && <p role="status">Đang tải danh mục thành phần…</p>}
      {error && (
        <div>
          <p role="alert" className="account-error">
            {error}
          </p>
          <button className="button button-outline" type="button" onClick={reload}>
            Tải lại thành phần
          </button>
        </div>
      )}
      {!loading && !error && (
        <>
          {!ingredients.length && (
            <p>Chưa có thành phần. Thêm tại mục Thành phần trước khi chọn.</p>
          )}
          <div className="admin-ingredient-options">
            {ingredients.map((ingredient) => (
              <label className="admin-ingredient-option" key={ingredient.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(ingredient.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, ingredient.id]
                        : selected.filter((id) => id !== ingredient.id),
                    )
                  }
                />
                <img src={ingredient.image} alt="" loading="lazy" width="44" height="66" />
                <span>{ingredient.name}</span>
              </label>
            ))}
            {missing.map((id) => (
              <label className="admin-ingredient-option" key={id}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => onChange(selected.filter((value) => value !== id))}
                />
                <span>{id} (không còn trong danh mục)</span>
              </label>
            ))}
          </div>
          {missing.length > 0 && (
            <p role="alert">Bỏ chọn các thành phần không còn trong danh mục trước khi lưu.</p>
          )}
        </>
      )}
    </div>
  );
}

const emptyIngredient = (): Ingredient => ({
  id: '',
  name: '',
  image: '',
  description: '',
  coreFlavor: '',
});

export function IngredientManagement() {
  const catalog = useIngredientCatalog();
  const { refresh } = useShop();
  const [editor, setEditor] = useState<{ value: Ingredient; create: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Ingredient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function save(value: Ingredient, create: boolean) {
    await request<Ingredient>(
      '/admin/ingredients' + (create ? '' : '/' + encodeURIComponent(value.id)),
      {
        method: create ? 'POST' : 'PATCH',
        body: JSON.stringify(value),
      },
    );
    setEditor(null);
    setStatus(create ? 'Đã thêm thành phần.' : 'Đã lưu thành phần.');
    catalog.reload();
    await refresh();
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await request('/admin/ingredients/' + encodeURIComponent(deleting.id), { method: 'DELETE' });
      setDeleting(null);
      setStatus('Đã xóa thành phần.');
      catalog.reload();
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-panel admin-ingredient-management">
      <div className="admin-catalog-heading">
        <div>
          <h2>Danh mục thành phần</h2>
          <p>Dùng chung cho các sản phẩm trong cửa hàng.</p>
        </div>
        <button
          className="button"
          type="button"
          disabled={Boolean(editor) || busy || catalog.loading || Boolean(catalog.error)}
          onClick={() => {
            setEditor({ value: emptyIngredient(), create: true });
            setDeleting(null);
            setError('');
            setStatus('');
          }}
        >
          Thêm thành phần
        </button>
      </div>
      {(error || catalog.error) && (
        <p role="alert" className="account-error">
          {error || catalog.error}
        </p>
      )}
      {status && (
        <p role="status" className="form-status">
          {status}
        </p>
      )}
      {catalog.loading && <p role="status">Đang tải danh mục thành phần…</p>}
      {catalog.error && (
        <button className="button button-outline" type="button" onClick={catalog.reload}>
          Tải lại thành phần
        </button>
      )}
      {editor ? (
        <IngredientEditor
          key={editor.create ? 'new' : editor.value.id}
          {...editor}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      ) : (
        !catalog.loading &&
        !catalog.error && (
          <div className="admin-ingredient-list">
            {!catalog.ingredients.length && <p>Danh mục chưa có thành phần.</p>}
            {catalog.ingredients.map((ingredient) => (
              <article className="admin-ingredient-row" key={ingredient.id}>
                <img src={ingredient.image} alt="" width="72" height="108" loading="lazy" />
                <div>
                  <h3>{ingredient.name}</h3>
                  <p>{ingredient.coreFlavor}</p>
                </div>
                <div className="admin-row-actions">
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditor({ value: ingredient, create: false });
                      setDeleting(null);
                      setError('');
                      setStatus('');
                    }}
                  >
                    Sửa thành phần
                  </button>
                  <button
                    className="admin-delete"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDeleting(ingredient);
                      setError('');
                      setStatus('');
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      )}
      {deleting && (
        <div
          className="admin-delete-confirm"
          role="alertdialog"
          aria-labelledby="delete-ingredient-title"
        >
          <h3 id="delete-ingredient-title">Xóa “{deleting.name}”?</h3>
          <p>Chỉ có thể xóa thành phần chưa được dùng trong sản phẩm nào.</p>
          <button className="button" type="button" disabled={busy} onClick={() => void remove()}>
            {busy ? 'Đang xóa…' : 'Xác nhận xóa thành phần'}
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            Giữ thành phần
          </button>
        </div>
      )}
    </section>
  );
}

function IngredientEditor({
  value,
  create,
  onSave,
  onClose,
}: {
  value: Ingredient;
  create: boolean;
  onSave: (value: Ingredient, create: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function upload(file?: File) {
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
    setUploading(true);
    try {
      const { url } = await request<{ url: string }>('/admin/uploads', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      setDraft((previous) => ({ ...previous, image: url }));
      setNotice('Đã tải ảnh. Lưu thành phần để cập nhật.');
    } catch (reason) {
      setError(message(reason));
    } finally {
      setUploading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    setError('');
    try {
      await onSave(draft, create);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-editor" onSubmit={submit}>
      <h2>{create ? 'Thêm thành phần mới' : 'Chỉnh sửa thành phần'}</h2>
      <fieldset disabled={busy || uploading}>
        <legend>Thông tin thành phần</legend>
        <div className="admin-editor-grid">
          <label className="field">
            Mã thành phần
            <input
              value={draft.id}
              required
              maxLength={100}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              readOnly={!create}
              onChange={(event) => setDraft({ ...draft, id: event.target.value })}
            />
            <small>Chữ thường và dấu gạch ngang, không đổi sau khi tạo.</small>
          </label>
          <label className="field">
            Tên thành phần
            <input
              value={draft.name}
              required
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="field admin-wide">
            Mô tả thành phần
            <textarea
              value={draft.description}
              required
              maxLength={2000}
              rows={4}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <label className="field admin-wide">
            Hương vị cốt lõi
            <textarea
              value={draft.coreFlavor}
              required
              maxLength={1000}
              rows={3}
              onChange={(event) => setDraft({ ...draft, coreFlavor: event.target.value })}
            />
          </label>
          <div className="admin-image-field admin-wide">
            <label className="field">
              Đường dẫn ảnh thành phần
              <input
                value={draft.image}
                required
                maxLength={2048}
                onChange={(event) => setDraft({ ...draft, image: event.target.value })}
              />
            </label>
            <label className="field">
              Tải ảnh thành phần
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <small>JPEG, PNG hoặc WebP, tối đa 5 MB.</small>
            </label>
            {draft.image && (
              <img
                className="admin-image-preview"
                src={draft.image}
                alt="Xem trước ảnh thành phần"
              />
            )}
          </div>
        </div>
      </fieldset>
      {uploading && <p role="status">Đang tải ảnh…</p>}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-status">
          {notice}
        </p>
      )}
      <div className="admin-editor-actions">
        <button className="button" disabled={busy || uploading}>
          {busy ? 'Đang lưu…' : create ? 'Tạo thành phần' : 'Lưu thành phần'}
        </button>
        <button
          className="button button-outline"
          type="button"
          disabled={busy || uploading}
          onClick={onClose}
        >
          Đóng chỉnh sửa
        </button>
      </div>
    </form>
  );
}
