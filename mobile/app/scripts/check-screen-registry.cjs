/**
 * Verify every mobile screen file is imported by a navigator.
 * Usage: node mobile/app/scripts/check-screen-registry.cjs
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const navDir = path.join(appRoot, 'src', 'navigation');
const screensDir = path.join(appRoot, 'src', 'portals');

const screenFiles = [];
function walkScreens(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkScreens(full);
    else if (name.endsWith('Screen.tsx')) screenFiles.push(full);
  }
}
walkScreens(screensDir);

const navText = fs.readdirSync(navDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => fs.readFileSync(path.join(navDir, f), 'utf8'))
  .join('\n');

const missing = [];
for (const file of screenFiles) {
  const base = path.basename(file, '.tsx');
  if (!navText.includes(base)) missing.push(path.relative(appRoot, file));
}

if (missing.length) {
  console.error('Screens not referenced in navigators:', missing.length);
  missing.forEach((m) => console.error(' ', m));
  process.exit(1);
}
console.log(`Screen registry OK (${screenFiles.length} screens)`);
