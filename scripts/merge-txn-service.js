const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function mergeFromGit(gitPath, destRel, importDepth) {
  const from = "../".repeat(importDepth) + "constants/config";
  const to = "../constants/config";
  let s = execSync(`git show HEAD:${gitPath}`, { encoding: 'utf8', cwd: root });
  s = s.replace(new RegExp(`from '${from.replace(/\//g, '\\/')}'`, 'g'), `from '${to}'`);
  s = s.replace(new RegExp(`from '${"../".repeat(importDepth)}utils/`, 'g'), "from '../utils/");
  fs.writeFileSync(path.join(root, destRel), s);
  console.log('merged', destRel);
}

mergeFromGit(
  'web/src/modules/finance/services/txnService.js',
  'web/src/services/txnService.js',
  3,
);
