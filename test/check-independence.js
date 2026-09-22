// Runtime imports must stay inside their prototype; no shared-code directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let imports = 0;
for (const prototype of ['prototype-simple', 'prototype-tabs']) {
  const base = path.join(root, prototype);
  for (const file of fs.readdirSync(path.join(base, 'js')).filter(name => name.endsWith('.js'))) {
    const sourcePath = path.join(base, 'js', file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = fs.realpathSync(path.resolve(path.dirname(sourcePath), specifier));
      assert(target.startsWith(base + path.sep), prototype + '/' + file + ' imports outside its prototype: ' + specifier);
      imports++;
    }
  }
}
console.log('PASS ' + imports + ' local imports; both prototype module graphs are independent');
