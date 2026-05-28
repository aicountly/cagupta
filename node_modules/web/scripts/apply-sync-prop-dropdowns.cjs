/**
 * One-off: replace displayValue sync useEffect with useSyncProp in search dropdowns.
 */
const fs = require('fs');
const path = require('path');

const files = [
  'src/components/common/ClientSearchDropdown.jsx',
  'src/components/common/EntitySearchDropdown.jsx',
  'src/components/common/GroupSearchDropdown.jsx',
  'src/components/common/OrganizationSearchDropdown.jsx',
  'src/modules/crm/components/ClientSearchDropdown.jsx',
  'src/modules/crm/components/EntitySearchDropdown.jsx',
  'src/modules/crm/components/GroupSearchDropdown.jsx',
];

const root = path.join(__dirname, '..');

for (const rel of files) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('useSyncProp')) {
    src = src.replace(
      /from 'react';/,
      "from 'react';\nimport { useSyncProp } from '../../hooks/useSyncProp';".replace(
        '../../hooks',
        rel.includes('modules/crm') ? '../../../hooks' : '../../hooks',
      ),
    );
  }
  src = src.replace(
    /const \[query, setQuery\]\s*=\s*useState\(displayValue \|\| ''\);/,
    "const [query, setQuery] = useSyncProp(displayValue || '', (v) => v || '');",
  );
  src = src.replace(
    /\n  \/\/ Keep the input text in sync when the parent changes the displayValue\n  useEffect\(\(\) => \{\n    setQuery\(displayValue \|\| ''\);\n  \}, \[displayValue\]\);\n/,
    '\n',
  );
  // EntitySearchDropdown may sync entityType too
  src = src.replace(
    /\n  useEffect\(\(\) => \{\n    setQuery\(displayValue \|\| ''\);\n  \}, \[displayValue\]\);\n/,
    '\n',
  );
  fs.writeFileSync(file, src);
  console.log('updated', rel);
}
