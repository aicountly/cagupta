/**
 * Spot-check portal boundary responses (expect 401 without token, not 500).
 * Usage: node scripts/portal-boundary-smoke.cjs [baseUrl]
 * Default baseUrl: http://localhost:8080/api
 */
const base = (process.argv[2] || 'http://localhost:8080/api').replace(/\/$/, '');

const cases = [
  { method: 'GET', path: '/auth/me', expect: [401] },
  { method: 'GET', path: '/admin/contacts', expect: [401] },
  { method: 'GET', path: '/associate/dashboard', expect: [401] },
  { method: 'GET', path: '/partner/dashboard', expect: [401] },
  { method: 'GET', path: '/client/services', expect: [401] },
  { method: 'GET', path: '/public/blog/posts', expect: [200, 404] },
];

async function run() {
  let failed = 0;
  for (const c of cases) {
    const url = `${base}${c.path}`;
    try {
      const res = await fetch(url, { method: c.method, headers: { Accept: 'application/json' } });
      if (!c.expect.includes(res.status)) {
        console.error(`FAIL ${c.method} ${c.path} → ${res.status} (expected ${c.expect.join('|')})`);
        failed += 1;
      } else {
        console.log(`OK   ${c.method} ${c.path} → ${res.status}`);
      }
    } catch (err) {
      console.error(`FAIL ${c.method} ${c.path} → ${err.message}`);
      failed += 1;
    }
  }
  if (failed) {
    console.error(`Portal boundary smoke: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('Portal boundary smoke: all checks passed');
}

run();
