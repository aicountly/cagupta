/**
 * Add 'staff' middleware to /api/admin/* routes that have auth but not staff.
 * Run from repo root: node scripts/patch-staff-admin-routes.js
 */
const fs = require('fs');
const path = 'server-php/app/Config/Routes.php';
let s = fs.readFileSync(path, 'utf8');

let patched = 0;
s = s.replace(
  /('pattern'\s+=>\s+'\/api\/admin\/[^']+'[\s\S]*?'middleware'\s+=>\s+\[)([^\]]+)(\])/g,
  (block, pre, mid, post) => {
    if (mid.includes("'staff'")) return block;
    if (!mid.includes("'auth'")) return block;
    patched += 1;
    const next = mid.replace("'auth'", "'auth', 'staff'");
    return pre + next + post;
  },
);

fs.writeFileSync(path, s);
console.log(`Added staff middleware to ${patched} admin routes`);
