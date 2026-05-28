/**
 * Fix permission verb mismatches: mutating routes should use *.edit not *.view
 * Run: node scripts/fix-route-permissions.js
 */
const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../server-php/app/Config/Routes.php');
let content = fs.readFileSync(routesPath, 'utf8');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function patchBlock(block, viewPerm, editPerm) {
  const methodMatch = block.match(/'method'\s*=>\s*'(\w+)'/);
  if (!methodMatch) return block;
  const method = methodMatch[1];
  if (!MUTATING.has(method)) return block;
  return block.replace(
    `'permission:${viewPerm}'`,
    `'permission:${editPerm}'`,
  );
}

// Split on route array entries (each starts with [ at line level after routes array)
const routeEntryRe = /(\[\s*\n\s*'method'\s*=>\s*'[^']+',[\s\S]*?\n\s*\],)/g;

let changed = 0;
content = content.replace(routeEntryRe, (block) => {
  let next = block;
  if (block.includes("'permission:registers.view'")) {
    next = patchBlock(block, 'registers.view', 'registers.edit');
  }
  if (block.includes("'permission:settings.view'") && !block.includes('permission_any:')) {
    next = patchBlock(next, 'settings.view', 'settings.edit');
  }
  if (next !== block) changed += 1;
  return next;
});

fs.writeFileSync(routesPath, content);
console.log(`Patched ${changed} route entries in Routes.php`);
