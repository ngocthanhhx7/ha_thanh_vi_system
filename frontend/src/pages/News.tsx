import { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  newsArticles,
  newsCategories,
  newsImages,
  newsCuratedAt,
  normalizeNewsSearch,
  type NewsArticle,
} from '../constants/news';
import './news-public.css';

const description =
  'Tuyển chọn 20 bài báo về bánh chả, trà sen, cốm và văn hóa ẩm thực Hà Nội. Tóm tắt dễ đọc, ghi rõ nguồn và liên kết trực tiếp đến bài gốc.';
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function ArticleCard({ article, featured = false }: { article: NewsArticle; featured?: boolean }) {
  const image = newsImages[article.category];
  const category = newsCategories.find((entry) => entry.id === article.category)?.label;
  return (
    <article className={`news-article ${featured ? 'news-article--featured' : ''}`}>
      <div className="news-article-image">
        <img
          src={image.src}
          alt={image.alt}
          width="1200"
          height="800"
          loading={featured ? 'eager' : 'lazy'}
          decoding="async"
        />
        <span className="news-article-category">{category}</span>
      </div>
      <div className="news-article-copy">
        {featured && (
          <p className="news-eyebrow">
            <BookOpen size={15} aria-hidden="true" /> CÂU CHUYỆN ĐÁNG ĐỌC
          </p>
        )}
        <div className="news-article-meta">
          <span>Nguồn: {article.source}</span>
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {dateFormat.format(new Date(article.publishedAt))}
            </time>
          )}
        </div>
        <h2>
          <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer">
            {article.title}
            <span className="news-sr-only"> (mở bài gốc trong tab mới)</span>
          </a>
        </h2>
        <p className="news-article-summary">{article.summary}</p>
        <a
          className="news-source-link"
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={article.originalTitle}
          aria-label={`Đọc bài gốc trên ${article.source}: ${article.originalTitle} (mở tab mới)`}
        >
          Đọc bài gốc <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export function News() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const categoryParam = params.get('chu-de') ?? 'all';
  const category = newsCategories.some((entry) => entry.id === categoryParam)
    ? categoryParam
    : 'all';
  const matches = useMemo(() => {
    const term = normalizeNewsSearch(query.trim());
    return newsArticles.filter(
      (article) =>
        (category === 'all' || article.category === category) &&
        (!term ||
          normalizeNewsSearch(
            `${article.title} ${article.originalTitle} ${article.summary} ${article.source}`,
          ).includes(term)),
    );
  }, [query, category]);
  const isFiltered = query.trim() !== '' || category !== 'all';
  const featured = isFiltered ? undefined : matches[0];
  const cards = featured ? matches.slice(1) : matches;

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || (key === 'chu-de' && value === 'all')) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    const tags = [
      ['name', 'description', description],
      ['property', 'og:title', 'Tin tức ẩm thực Hà Nội | Hà Thành Vị'],
      ['property', 'og:description', description],
      ['property', 'og:type', 'website'],
    ];
    const restore = tags.map(([attribute, name, content]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      const tag = existing ?? document.createElement('meta');
      const previous = tag.getAttribute('content');
      tag.setAttribute(attribute, name);
      tag.setAttribute('content', content);
      if (!existing) document.head.appendChild(tag);
      return () => {
        if (!existing) tag.remove();
        else if (previous === null) tag.removeAttribute('content');
        else tag.setAttribute('content', previous);
      };
    });
    return () => restore.forEach((reset) => reset());
  }, []);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Tin tức & câu chuyện ẩm thực Hà Nội',
    description,
    inLanguage: 'vi-VN',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: matches.length,
      itemListElement: matches.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: { '@type': 'WebPage', name: article.originalTitle, url: article.sourceUrl },
      })),
    },
  };

  return (
    <div className="news-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <section className="news-hero" aria-labelledby="news-title">
        <p className="news-eyebrow">TIN TỨC & CÂU CHUYỆN</p>
        <h1 id="news-title">
          Đọc một chút.
          <br />
          <em>Thương thêm Hà Nội.</em>
        </h1>
        <p className="news-hero-description">
          Từ chiếc bánh chả, chén trà sen đến những góc phố thân quen.
          <br className="news-desktop-break" /> Cùng chúng mình khám phá những câu chuyện làm nên
          hương vị Hà Nội.
        </p>
        <a className="news-hero-link" href="#news-selection">
          Khám phá bài viết <ArrowDown size={16} aria-hidden="true" />
        </a>
        <div className="news-hero-ornament" aria-hidden="true">
          <span />
          <img src="/brand/ornament.webp" alt="" width="34" height="34" />
          <span />
        </div>
      </section>

      <section className="news-selection" id="news-selection" aria-label="Bài viết tuyển chọn">
        <div className="news-toolbar">
          <div>
            <p className="news-eyebrow">GÓC ĐỌC HÀ THÀNH</p>
            <h2>
              Câu chuyện <em>ẩm thực Hà Nội.</em>
            </h2>
          </div>
          <label className="news-search">
            <span className="news-sr-only">Tìm bài viết</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Tìm món ăn, câu chuyện…"
              value={query}
              onChange={(event) => updateFilter('q', event.target.value)}
            />
            {query && (
              <button type="button" aria-label="Xóa từ khóa" onClick={() => updateFilter('q', '')}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>
        <div className="news-filters" role="group" aria-label="Lọc theo chủ đề">
          {newsCategories.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={category === entry.id}
              onClick={() => updateFilter('chu-de', entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="news-selection-note">
          <p role="status" aria-live="polite">
            {isFiltered
              ? `${matches.length} bài phù hợp`
              : `${newsArticles.length} bài viết tuyển chọn`}
          </p>
          <span>Tóm tắt bởi Hà Thành Vị · Đọc đầy đủ tại nguồn gốc</span>
        </div>
        {featured && <ArticleCard article={featured} featured />}
        {cards.length > 0 && (
          <div className="news-grid">
            {cards.map((article) => (
              <ArticleCard article={article} key={article.id} />
            ))}
          </div>
        )}
        {matches.length === 0 && (
          <div className="news-empty">
            <BookOpen size={32} aria-hidden="true" />
            <h2>Chưa tìm thấy bài phù hợp</h2>
            <p>Thử một từ khóa khác hoặc khám phá lại tất cả câu chuyện.</p>
            <button
              type="button"
              onClick={() => setParams({}, { replace: true, preventScrollReset: true })}
            >
              Xóa bộ lọc <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <aside className="news-editorial-note">
          <BookOpen size={20} aria-hidden="true" />
          <div>
            <strong>Một góc đọc, nhiều nguồn tin.</strong>
            <p>
              Hà Thành Vị tuyển chọn và tóm lược các bài viết từ báo chí, cổng thông tin chính thức.
              Tiêu đề trên trang được biên tập ngắn gọn; nội dung đầy đủ, tác giả và thông tin cập
              nhật thuộc về nguồn gốc. Hình ảnh trên trang là minh họa theo chủ đề, không phải ảnh
              của bài báo.
            </p>
            <p>
              Nguồn được kiểm tra ngày{' '}
              {dateFormat.format(new Date(`${newsCuratedAt}T00:00:00+07:00`))}.
            </p>
          </div>
        </aside>
      </section>

      <section className="news-ending">
        <div>
          <p className="news-eyebrow">TỪ CÂU CHUYỆN ĐẾN THỨC QUÀ</p>
          <h2>
            Mang một chút <em>Hà Nội về nhà.</em>
          </h2>
          <p>Chiếc bánh chả nhỏ, gói ghém chút thân quen cho bạn và người thương.</p>
          <Link to="/san-pham">
            Khám phá thức quà <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <img
          src="/brand/gift-box-standard-nha-sac-ha-thanh.webp"
          alt="Hộp quà Nhã Sắc Hà Thành của Hà Thành Vị"
          width="480"
          height="480"
          loading="lazy"
        />
      </section>
    </div>
  );
}
