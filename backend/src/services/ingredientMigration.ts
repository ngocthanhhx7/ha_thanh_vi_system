import type { ContentRepository } from './contentRepository.js';
import { contentSchema, type SiteContent } from '../validators/content.js';

/** Upgrade legacy content once; an explicit catalog (even empty) is owned by the admin. */
export function withIngredientCatalog(current: SiteContent, seed: SiteContent): SiteContent {
  const ingredients = current.ingredients ?? seed.ingredients ?? [];
  const available = new Set(ingredients.map((item) => item.id));
  let changed = current.ingredients === undefined;
  const products = current.products.map((product) => {
    if (product.ingredientIds !== undefined) return product;
    const defaults = seed.products.find((item) => item.id === product.id)?.ingredientIds;
    if (!defaults) return product;
    changed = true;
    return { ...product, ingredientIds: defaults.filter((id) => available.has(id)) };
  });
  return changed ? contentSchema.parse({ ...current, ingredients, products }) : current;
}

export async function migrateIngredientCatalog(
  repository: ContentRepository,
  seed: SiteContent,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await repository.getContent();
    if (!current) return;
    const updated = withIngredientCatalog(current, seed);
    if (updated === current) return;
    if (repository.saveContentIfCurrent) {
      if (await repository.saveContentIfCurrent(updated, current)) return;
    } else {
      await repository.saveContent(updated);
      return;
    }
  }
  throw new Error('Danh mục đang được cập nhật. Chưa thể nâng cấp thành phần an toàn.');
}
