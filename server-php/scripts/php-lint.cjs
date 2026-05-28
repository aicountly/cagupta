/**
 * Syntax-check all PHP files under server-php/app.
 * Usage: node server-php/scripts/php-lint.cjs
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'app');
const files = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (name.endsWith('.php')) files.push(full);
  }
}

walk(root);
let failed = 0;
for (const file of files) {
  try {
    execSync(`php -l "${file}"`, { stdio: 'pipe' });
  } catch (e) {
    failed += 1;
    console.error(String(e.stderr || e.stdout || e.message));
  }
}
console.log(`PHP syntax: ${files.length} files, ${failed} errors`);
process.exit(failed ? 1 : 0);
