/**
 * Cross-check web txnService.js API paths against server-php Routes.php.
 * Usage: node scripts/check-txn-routes.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const txnJs = fs.readFileSync(path.join(root, 'web/src/services/txnService.js'), 'utf8');
const routesPhp = fs.readFileSync(path.join(root, 'server-php/app/Config/Routes.php'), 'utf8');

function normalizeClientPath(raw) {
  let p = raw.replace(/\$\{[^}]+\}/g, ':id').replace(/\?.*$/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.startsWith('/api/')) p = `/api${p}`;
  return p.replace(/\/+/g, '/');
}

const clientPaths = new Set();
const fetchRe = /fetch\(\s*`[^`]*\$\{API_BASE\}([^`]+)`/gs;
let m;
while ((m = fetchRe.exec(txnJs))) {
  const segment = m[1].split('?')[0].split('${')[0];
  if (segment.trim()) clientPaths.add(normalizeClientPath(segment));
}

const serverPaths = new Set();
const routeRe = /'pattern'\s*=>\s*'(\/api\/admin\/[^']+)'/g;
while ((m = routeRe.exec(routesPhp))) {
  serverPaths.add(m[1]);
}

function patternMatches(client, server) {
  const cParts = client.split('/').filter(Boolean);
  const sParts = server.split('/').filter(Boolean);
  if (cParts.length !== sParts.length) return false;
  return cParts.every((part, i) => part === sParts[i] || part === ':id' || sParts[i].startsWith(':'));
}

const missing = [];
for (const client of [...clientPaths].sort()) {
  if (!client.includes('/admin/txn') && !client.includes('/admin/finance') && !client.includes('/admin/invoices')) {
    continue;
  }
  const found = [...serverPaths].some((server) => patternMatches(client, server));
  if (!found) missing.push(client);
}

if (missing.length) {
  console.error('txnService paths without matching PHP route:', missing.length);
  missing.forEach((p) => console.error(' ', p));
  process.exit(1);
}

console.log(`Txn route check OK (${clientPaths.size} client paths scanned, ${missing.length} missing)`);
