const path = require('path');
const r = require(path.join(__dirname, '..', 'eslint-errors.json'));
const errs = [];
for (const f of r) {
  for (const m of f.messages) {
    if (m.severity !== 2) continue;
    const file = f.filePath.replace(/.*[\\/]web[\\/]src[\\/]/, 'src/');
    errs.push({ file, line: m.line, rule: m.ruleId, msg: m.message });
  }
}
console.log('total', errs.length);
for (const e of errs) {
  console.log(`${e.rule}\t${e.file}:${e.line}\t${e.msg.slice(0, 120)}`);
}
