/**
 * Patch marketing route middleware in Routes.php with granular permissions.
 * Run from repo root: node scripts/patch-marketing-permissions.js
 */
const fs = require('fs');
const path = 'server-php/app/Config/Routes.php';
let s = fs.readFileSync(path, 'utf8');

const DASHBOARD = "['auth', 'staff', 'permission:dashboard.view']";
const SETTINGS = "['auth', 'staff', 'permission:settings.view']";
const LEADS_ANY = "['auth', 'staff', 'permission_any:leads.view,leads.create,leads.edit,quotations.manage']";
const DOCS_UPLOAD = "['auth', 'staff', 'permission:documents.upload']";

const rules = [
  // Traffic & AI insights (read-only analytics)
  { pattern: '/api/marketing/traffic/', middleware: DASHBOARD },
  { pattern: '/api/marketing/ai-insights', middleware: DASHBOARD },
  { pattern: '/api/marketing/logs', middleware: DASHBOARD },
  // Prospects & campaigns (leads domain)
  { pattern: '/api/marketing/prospects', middleware: LEADS_ANY },
  { pattern: '/api/marketing/campaigns', middleware: LEADS_ANY },
  // Document share
  { pattern: '/api/marketing/documents/', middleware: DOCS_UPLOAD },
  // Blog mutations
  { pattern: '/api/marketing/blog/posts', method: 'POST', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/posts', method: 'PUT', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/posts', method: 'DELETE', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/posts/', middleware: SETTINGS, exclude: 'GET' },
  { pattern: '/api/marketing/blog/drafts', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/generate-ai-drafts', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/ai-settings', middleware: SETTINGS },
  { pattern: '/api/marketing/blog/upload-image', middleware: SETTINGS },
  // Blog read
  { pattern: '/api/marketing/blog/posts', method: 'GET', middleware: DASHBOARD },
  // WA / SMS / Social (sensitive send & session control)
  { pattern: '/api/marketing/wa/', middleware: SETTINGS },
  { pattern: '/api/marketing/sms/', middleware: SETTINGS },
  { pattern: '/api/marketing/social/', middleware: SETTINGS },
];

function patchRoute(block, rule) {
  if (!block.includes(`'pattern'    => '${rule.pattern}'`) && !block.includes(`'pattern'    => "${rule.pattern}"`)) {
    if (!block.includes(`'pattern'    => '${rule.pattern}`)) return block;
  }
  if (rule.pattern.endsWith('/') && !block.includes(`'pattern'    => '${rule.pattern}`)) return block;
  if (rule.method && !block.includes(`'method'     => '${rule.method}'`)) return block;
  if (rule.exclude && block.includes(`'method'     => '${rule.exclude}'`)) return block;

  const patternOk = rule.pattern.endsWith('/')
    ? new RegExp(`'pattern'\\s+=>\\s+'${rule.pattern.replace('/', '\\/')}`).test(block)
    : block.includes(`'pattern'    => '${rule.pattern}'`);
  if (!patternOk) return block;

  return block.replace(/'middleware'\s+=>\s+\[[^\]]+\]/, `'middleware' => ${rule.middleware}`);
}

// Split into route blocks and apply rules (last matching rule wins per specificity)
const blockRe = /\[\s*\n\s*'method'\s+=>[\s\S]*?\n\s*\],/g;
s = s.replace(blockRe, (block) => {
  if (!block.includes('/api/marketing/')) return block;
  if (block.includes('/api/public/')) return block;

  let updated = block;
  for (const rule of rules) {
    updated = patchRoute(updated, rule);
  }
  return updated;
});

fs.writeFileSync(path, s);
console.log('Patched marketing permissions in Routes.php');
