import initialContent from '../../../content/site.json';
export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  weight: string;
  flavor: string;
  description: string;
  image: string;
  price: number | null;
  featured: boolean;
};
export type Site = typeof initialContent.site;
export type Content = { site: Site; products: Product[] };
export const seed: Content = initialContent;
