// Reports drift between the common modules of prototype-simple and prototype-tabs.
// Both prototypes stay independent (no runtime sharing): the listed files are meant to be
// byte-identical copies, so a change in one must be applied to the other.
//   node check-alignment.js          exit code 1 when any common file differs
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const COMMON_JS = ['utils', 'i18n', 'toast', 'geo', 'keys', 'boot', 'basemaps', 'map-controls', 'measure',
  'context-menu', 'swisstopo', 'print', 'table', 'carousel', 'mini-map', 'gestures', 'accordion', 'tools-panel', 'location-tree'];
const COMMON_FILES = COMMON_JS.map(n => 'js/' + n + '.js').concat(['data/i18n.json', 'data/swagger.json', 'css/tokens.css', 'css/components.css', 'docs/DESIGNGUIDE.md',
  'vendor/swagger-ui/swagger-ui-bundle.js', 'vendor/swagger-ui/swagger-ui.css', 'vendor/swagger-ui/LICENSE', 'vendor/swagger-ui/NOTICE'])
  .concat(fs.readdirSync(path.join(ROOT, 'prototype-simple', 'assets', 'countries')).sort().map(f => 'assets/countries/' + f))
  .concat(fs.readdirSync(path.join(ROOT, 'prototype-simple', 'assets', 'regions')).sort().map(f => 'assets/regions/' + f));

// Per-app modules that share their structure but not their content (schema-specific)
const ALIGNED_JS = ['app', 'config', 'state', 'ui', 'filters', 'list', 'detail', 'map', 'search', 'export'];

let drift = 0;
for (const rel of COMMON_FILES) {
  const a = path.join(ROOT, 'prototype-simple', rel);
  const b = path.join(ROOT, 'prototype-tabs', rel);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log('MISSING  ' + rel); drift++; continue; }
  const same = fs.readFileSync(a).equals(fs.readFileSync(b));
  console.log((same ? 'same     ' : 'DIFFERS  ') + rel);
  if (!same) {
    drift++;
    const d = spawnSync('git', ['diff', '--no-index', '--stat', a, b], { encoding: 'utf8' });
    if (d.stdout) console.log(d.stdout.trim().split('\n').pop());
  }
}
console.log('');
for (const n of ALIGNED_JS) {
  const a = path.join(ROOT, 'prototype-simple', 'js', n + '.js');
  const b = path.join(ROOT, 'prototype-tabs', 'js', n + '.js');
  const la = fs.existsSync(a) ? fs.readFileSync(a, 'utf8').split('\n').length : 0;
  const lb = fs.existsSync(b) ? fs.readFileSync(b, 'utf8').split('\n').length : 0;
  console.log('aligned  js/' + n + '.js  (main ' + la + ' lines, tabs ' + lb + ' lines)');
}
console.log(drift ? '\n' + drift + ' common file(s) differ' : '\nall common files identical');
process.exit(drift ? 1 : 0);
