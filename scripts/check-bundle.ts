/**
 * Fails if any page route ships more than 200 KB of compressed initial JavaScript
 * (constitution "Performance Budgets"). Run after `next build`.
 *
 *   npm run perf:bundle
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 200 * 1024;
const NEXT = '.next';

type AppManifest = { pages: Record<string, string[]> };
type BuildManifest = { rootMainFiles?: string[]; polyfillFiles?: string[] };

const app = JSON.parse(readFileSync(join(NEXT, 'app-build-manifest.json'), 'utf8')) as AppManifest;
const build = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8')) as BuildManifest;

const sizes = new Map<string, number>();
const gz = (file: string) => {
  let size = sizes.get(file);
  if (size === undefined) {
    size = gzipSync(readFileSync(join(NEXT, file)), { level: 9 }).length;
    sizes.set(file, size);
  }
  return size;
};

/** The segment keys (layouts, loading, error, not-found, page) a page route loads, root first. */
function segmentsFor(pageKey: string): string[] {
  const parts = pageKey
    .replace(/\/page$/, '')
    .split('/')
    .filter(Boolean);
  const keys: string[] = [];
  for (let i = 0; i <= parts.length; i++) {
    const dir = '/' + parts.slice(0, i).join('/');
    const prefix = dir === '/' ? '' : dir;
    for (const kind of ['layout', 'loading', 'error', 'not-found']) keys.push(`${prefix}/${kind}`);
  }
  keys.push(pageKey);
  return keys.filter((k) => k in app.pages);
}

const pages = Object.keys(app.pages).filter((k) => k.endsWith('/page'));
let failed = false;
for (const page of pages.sort()) {
  const files = new Set<string>([...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]);
  for (const key of segmentsFor(page))
    for (const f of app.pages[key] ?? []) if (f.endsWith('.js')) files.add(f);
  const total = [...files].filter((f) => f.endsWith('.js')).reduce((sum, f) => sum + gz(f), 0);
  const ok = total <= BUDGET_BYTES;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${(total / 1024).toFixed(1).padStart(6)} KB  ${page.replace(/\/page$/, '') || '/'}`,
  );
}
if (failed) {
  console.error(`One or more routes exceed the ${BUDGET_BYTES / 1024} KB initial JS budget`);
  process.exit(1);
}
