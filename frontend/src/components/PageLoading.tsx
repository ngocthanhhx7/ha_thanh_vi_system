export function PageLoading() {
  return (
    <section className="page-loading section" role="status" aria-live="polite" aria-busy="true">
      <span className="page-loading-mark" aria-hidden="true">
        ✦
      </span>
      <p>Đang mở trang…</p>
      <div className="page-loading-placeholder" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
