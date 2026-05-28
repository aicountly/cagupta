/**
 * Gate B naming + PORTAL_META duplication check.
 * Usage: node scripts/web-mobile-sync-check.js
 */
const { execSync } = require('child_process');

function rg(args) {
  try {
    return execSync(`rg ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return e.stdout || '';
  }
}

let failed = 0;

const affiliateHits = rg('-i "Affiliate [Pp]ortal|For Affiliate Member" web/ mobile/ packages/ --glob "*.{js,jsx,ts,tsx}"').trim();
if (affiliateHits) {
  console.error('Stale affiliate portal strings:\n', affiliateHits);
  failed += 1;
}

const portalMeta = rg('"PORTAL_META\\s*=" web/ mobile/ --glob "*.{js,jsx,ts,tsx}"').trim();
const dupes = portalMeta.split('\n').filter((l) => l && !l.includes('shared-constants'));
if (dupes.length) {
  console.error('Duplicate PORTAL_META outside shared-constants:\n', dupes.join('\n'));
  failed += 1;
}

if (failed) process.exit(1);
console.log('Web-mobile sync naming check OK');
