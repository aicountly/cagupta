/**
 * Smoke-test representative API prefix groups (unauthenticated — expect 401/404, not 500).
 * Usage: node scripts/api-smoke.cjs [baseUrl]
 */
const base = (process.argv[2] || 'http://localhost:8080/api').replace(/\/$/, '');

const endpoints = [
  { group: 'auth', path: '/auth/me' },
  { group: 'admin', path: '/admin/dashboard/stats' },
  { group: 'associate', path: '/associate/dashboard' },
  { group: 'partner', path: '/partner/dashboard' },
  { group: 'client', path: '/client/services' },
  { group: 'chat', path: '/chat/conversations' },
  { group: 'marketing', path: '/marketing/tools' },
  { group: 'public', path: '/public/blog/posts' },
];

async function run() {
  let failed = 0;
  for (const ep of endpoints) {
    const url = `${base}${ep.path}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status >= 500) {
        console.error(`FAIL [${ep.group}] ${ep.path} → ${res.status}`);
        failed += 1;
      } else {
        console.log(`OK   [${ep.group}] ${ep.path} → ${res.status}`);
      }
    } catch (err) {
      console.error(`FAIL [${ep.group}] ${ep.path} → ${err.message}`);
      failed += 1;
    }
  }
  if (failed) {
    console.error(`API smoke: ${failed} server error(s)`);
    process.exit(1);
  }
  console.log('API smoke: all prefix groups reachable (no 5xx)');
}

run();
