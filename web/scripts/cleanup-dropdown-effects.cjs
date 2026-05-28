const fs = require('fs');
const path = require('path');

const files = [
  'src/components/common/OrganizationSearchDropdown.jsx',
  'src/modules/crm/components/ClientSearchDropdown.jsx',
  'src/modules/crm/components/EntitySearchDropdown.jsx',
  'src/modules/crm/components/GroupSearchDropdown.jsx',
];

const root = path.join(__dirname, '..');
const block = /\n  useEffect\(\(\) => \{\n    setQuery\(displayValue \|\| ''\);\n  \}, \[displayValue\]\);\n/g;

for (const rel of files) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('useSyncProp')) {
    const hookPath = rel.includes('modules/crm') ? '../../../hooks/useSyncProp' : '../../hooks/useSyncProp';
    src = src.replace(/from 'react';/, `from 'react';\nimport { useSyncProp } from '${hookPath}';`);
    src = src.replace(
      /const \[query, setQuery\]\s*=\s*useState\(displayValue \|\| ''\);/,
      "const [query, setQuery] = useSyncProp(displayValue || '', (v) => v || '');",
    );
  }
  src = src.replace(block, '\n');
  // EntitySearchDropdown controlledEntityType sync
  src = src.replace(
    /\n  \/\/ Keep activeType in sync when parent controls entityType\n  useEffect\(\(\) => \{\n    if \(controlledEntityType\) setActiveType\(controlledEntityType\);\n  \}, \[controlledEntityType\]\);\n/,
    '\n',
  );
  src = src.replace(
    /const \[activeType, setActiveType\]\s*=\s*useState\(controlledEntityType \|\| 'contact'\);/,
    "const [activeType, setActiveType] = useSyncProp(controlledEntityType || 'contact', (v) => v || 'contact');",
  );
  fs.writeFileSync(file, src);
  console.log('updated', rel);
}
