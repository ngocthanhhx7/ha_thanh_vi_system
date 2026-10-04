import { readFileSync } from 'node:fs';
import { contentSchema, type SiteContent } from '../validators/content.js';

// src/utils and dist/utils have the same depth relative to the repository content folder.
export function loadSeedContent(): SiteContent {
  const raw = readFileSync(new URL('../../../content/site.json', import.meta.url), 'utf8');
  return contentSchema.parse(JSON.parse(raw));
}
