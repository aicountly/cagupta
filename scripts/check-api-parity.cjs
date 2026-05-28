/**
 * Cross-check client API paths (web services + shared-services) against server-php Routes.php.
 * Usage: node scripts/check-api-parity.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, acc);
    } else if (/\.(js|ts)$/.test(name) && !name.endsWith('.test.js') && !name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const clientFiles = [
  ...walk(path.join(root, 'web/src/services')),
  ...walk(path.join(root, 'web/src/modules')),
  ...walk(path.join(root, 'packages/shared-services/src')),
].filter((f) => f.includes(`${path.sep}services${path.sep}`) || f.includes(`${path.sep}shared-services${path.sep}src${path.sep}`));

function normalizeClientPath(raw) {
  let p = String(raw).trim();
  // Optional query-string suffix vars in template literals
  p = p.replace(/\$\{dl\}/g, '');
  p = p.replace(/\$\{qs\}/g, '');
  // Insert slash before ${var} when glued to path segment (e.g. `/leaves${id}`)
  p = p.replace(/([^/])\$\{/g, '$1/${');
  p = p.replace(/\$\{[^}]+\}/g, '/:id');
  p = p.replace(/\/:id\/:id/g, '/:id');
  p = p.split('?')[0].split('#')[0];
  // Drop truncated template tails (e.g. audit-log${qs without closing brace)
  if (p.includes('${')) {
    p = p.slice(0, p.indexOf('${'));
  }
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.startsWith('/api/')) p = `/api${p}`;
  return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/api';
}

const clientPaths = new Set();

for (const file of clientFiles) {
  const src = fs.readFileSync(file, 'utf8');

  const fetchRe = /fetch\(\s*`[^`]*\$\{API_BASE(?:_URL)?\}([^`]+)`/gs;
  let m;
  while ((m = fetchRe.exec(src))) {
    const segment = m[1].split('?')[0];
    if (segment.trim()) clientPaths.add(normalizeClientPath(segment));
  }

  const apiRe = /api\.(get|post|put|patch|delete)\(\s*[`']([^`']+)[`']/g;
  while ((m = apiRe.exec(src))) {
    if (m[2].trim()) clientPaths.add(normalizeClientPath(m[2]));
  }
}

const routesPhp = fs.readFileSync(path.join(root, 'server-php/app/Config/Routes.php'), 'utf8');
const serverPaths = new Set();
const routeRe = /'pattern'\s*=>\s*'(\/api\/[^']+)'/g;
while ((m = routeRe.exec(routesPhp))) {
  serverPaths.add(m[1]);
}

function patternMatches(client, server) {
  const cParts = client.split('/').filter(Boolean);
  const sParts = server.split('/').filter(Boolean);
  if (cParts.length !== sParts.length) return false;
  return cParts.every((part, i) => {
    const sp = sParts[i];
    if (part === sp) return true;
    if (part === ':id' || sp.startsWith(':')) return true;
    return false;
  });
}

function isNoisePath(p) {
  return p === '/api/admin' || p === '/api';
}

function hasServerRoute(clientPath) {
  if ([...serverPaths].some((server) => patternMatches(clientPath, server))) return true;
  // Legacy affiliate paths are aliased to associate handlers
  const legacy = clientPath
    .replace('/api/associate/', '/api/affiliate/')
    .replace('/api/admin/associates', '/api/admin/affiliates')
    .replace('/api/admin/associate-', '/api/admin/affiliate-');
  if (legacy !== clientPath && [...serverPaths].some((server) => patternMatches(legacy, server))) {
    return true;
  }
  return false;
}

const missing = [...clientPaths].filter((p) => !isNoisePath(p) && !hasServerRoute(p)).sort();

if (missing.length) {
  console.error(`API parity check FAILED: ${missing.length} client path(s) without PHP route:`);
  missing.forEach((p) => console.error(' ', p));
  process.exit(1);
}

console.log(
  `API parity check OK (${clientPaths.size} client paths, ${serverPaths.size} server routes, 0 missing)`,
);
