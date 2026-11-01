#!/usr/bin/env node
/*
  generate-image-sitemap.js
  Rebuilds sitemap.xml so Google can discover every portfolio photo (Google Images).

  What it does:
    1. Reads portfolio_categories + portfolio_images from Supabase (public, read-only key
       already used by the site in supabase-config.js).
    2. Keeps your existing page entries in sitemap.xml.
    3. Adds one <url> per portfolio category (portfolio.html?category=slug) with an
       <image:image> entry for every photo (url, title, caption).

  Run from the site folder, then commit + push sitemap.xml:
      node scripts/generate-image-sitemap.js

  Offline test:  node scripts/generate-image-sitemap.js --from-json sample.json
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://impactgridgroup.com';
const SITEMAP = path.join(ROOT, 'sitemap.xml');

const cfg = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');
const SB_URL = (cfg.match(/_SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const SB_KEY = (cfg.match(/_SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function rest(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function loadData() {
  const i = process.argv.indexOf('--from-json');
  if (i > -1) return JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  const cats = await rest('portfolio_categories', 'select=*&order=created_at.desc');
  const imgs = await rest('portfolio_images', 'select=*&order=order.asc');
  return cats.map(c => ({ ...c, images: imgs.filter(m => m.category_id === c.id) }));
}

function slugify(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

(async () => {
  const cats = await loadData();
  const today = new Date().toISOString().slice(0, 10);

  // keep existing non-category entries
  const old = fs.readFileSync(SITEMAP, 'utf8');
  const kept = (old.match(/<url>[\s\S]*?<\/url>/g) || [])
    .filter(b => !/portfolio\.html\?category=/.test(b))
    .map(b => '  ' + b.trim());

  const catBlocks = cats.map(c => {
    const slug = c.slug || slugify(c.title);
    const loc = `${SITE}/portfolio.html?category=${encodeURIComponent(slug)}`;
    const images = (c.images || []).filter(m => m.url).map(m => {
      const title = m.alt_text || `${c.title} — Impact Grid event photography, Manchester`;
      return '      <image:image>\n' +
        `        <image:loc>${esc(m.url)}</image:loc>\n` +
        `        <image:title>${esc(title)}</image:title>\n` +
        (m.caption ? `        <image:caption>${esc(m.caption)}</image:caption>\n` : '') +
        '      </image:image>';
    });
    return '  <url>\n' +
      `    <loc>${esc(loc)}</loc>\n` +
      `    <lastmod>${esc((c.updated_at || c.created_at || today).slice(0, 10))}</lastmod>\n` +
      '    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n' +
      images.join('\n') + (images.length ? '\n' : '') +
      '  </url>';
  });

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    kept.join('\n') + '\n' + catBlocks.join('\n') + '\n</urlset>\n';

  fs.writeFileSync(SITEMAP, xml);
  const n = cats.reduce((a, c) => a + (c.images || []).length, 0);
  console.log(`sitemap.xml updated: ${cats.length} categories, ${n} images`);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
