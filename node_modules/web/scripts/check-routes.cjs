/**
 * Flag internal navigation targets not declared in App.jsx routes.
 * Usage: node web/scripts/check-routes.cjs
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
const srcRoot = path.join(__dirname, '..', 'src');
const appSrc = fs.readFileSync(appPath, 'utf8');

const routePaths = new Set();
for (const m of appSrc.matchAll(/<Route\s+path=["']([^"']+)["']/g)) {
  routePaths.add(m[1]);
}

function normalizeTarget(raw) {
  let t = raw.trim();
  if (!t.startsWith('/')) return null;
  t = t.split('?')[0].split('#')[0];
  if (t.includes('${')) return null;
  if (t.startsWith('//')) return null;
  return t.replace(/\/+$/, '') || '/';
}

function matchRoute(target) {
  if (routePaths.has(target)) return true;
  for (const p of routePaths) {
    if (!p.includes(':')) continue;
    const re = new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$');
    if (re.test(target)) return true;
  }
  if (target.startsWith('/affiliate')) return true;
  return false;
}

const refs = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(jsx?|tsx?)$/.test(name)) {
      const text = fs.readFileSync(full, 'utf8');
      const rel = path.relative(srcRoot, full);
      for (const m of text.matchAll(/\b(?:to|navigate)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
        const t = normalizeTarget(m[1]);
        if (t && !matchRoute(t)) refs.push({ file: rel, target: t });
      }
      for (const m of text.matchAll(/href=["'](\/[^"'#?]+)["']/g)) {
        const t = normalizeTarget(m[1]);
        if (t && !matchRoute(t)) refs.push({ file: rel, target: t });
      }
    }
  }
}
walk(srcRoot);

const uniq = [...new Map(refs.map((r) => [`${r.file}:${r.target}`, r])).values()];
if (uniq.length) {
  console.error('Dead or missing routes:', uniq.length);
  for (const r of uniq.slice(0, 50)) console.error(`  ${r.file} -> ${r.target}`);
  process.exit(1);
}
console.log(`Route check OK (${routePaths.size} routes, 0 dead links)`);
