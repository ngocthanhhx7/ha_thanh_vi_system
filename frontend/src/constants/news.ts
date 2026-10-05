import selection from './news.json';

export const newsCategories = [
  { id: 'all', label: 'Tất cả' },
  { id: 'banh-qua', label: 'Bánh & quà Hà Nội' },
  { id: 'tra-com', label: 'Trà & cốm' },
  { id: 'am-thuc', label: 'Ẩm thực Hà Nội' },
  { id: 'van-hoa', label: 'Văn hóa & di sản' },
] as const;

export type NewsCategory = Exclude<(typeof newsCategories)[number]['id'], 'all'>;
export type NewsArticle = {
  id: string;
  title: string;
  originalTitle: string;
  source: string;
  sourceUrl: string;
  publishedAt: string | null;
  category: NewsCategory;
  summary: string;
};

export const newsArticles = selection.articles as NewsArticle[];
export const newsCuratedAt = selection.curatedAt;
export const newsImages: Record<NewsCategory, { src: string; alt: string }> = {
  'banh-qua': {
    src: '/news/banh-qua.webp',
    alt: 'Minh họa bánh chả vàng giòn, chén trà và thức quà Hà Nội',
  },
  'tra-com': {
    src: '/news/tea-com.webp',
    alt: 'Minh họa trà sen, hoa sen và cốm xanh trên lá sen',
  },
  'am-thuc': {
    src: '/news/hanoi-food.webp',
    alt: 'Minh họa những món ăn thân quen của Hà Nội',
  },
  'van-hoa': {
    src: '/news/hanoi-culture.webp',
    alt: 'Minh họa phố cổ Hà Nội và văn hóa thưởng trà',
  },
};

export function normalizeNewsSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
