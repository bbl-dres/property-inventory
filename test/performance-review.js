// Repeatable comparator microbenchmark; timings are informational, correctness is asserted.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
(async () => {
  const { compareTableValues } = await import(pathToFileURL(path.resolve('prototype-tabs/js/table-sort.js')));
  const rows = Array.from({ length: 20000 }, (_, i) => ['Zürich', 'Bern', 'Genève', 'Basel'][i % 4] + ' ' + (i * 7919 % 20000));
  const before = (a, b) => a.localeCompare(b, 'de-CH', { numeric: true, sensitivity: 'base' });
  const after = (a, b) => compareTableValues(a, b, 1, 'de-CH');
  assert.deepEqual(rows.slice().sort(after), rows.slice().sort(before));
  assert.deepEqual([null, '10', 2, '', 1].sort((a, b) => compareTableValues(a, b, -1, 'de-CH')), ['10', 2, 1, null, '']);
  function median(fn) {
    const samples = [];
    for (let i = 0; i < 3; i++) { const start = performance.now(); rows.slice().sort(fn); samples.push(performance.now() - start); }
    return samples.sort((a, b) => a - b)[1];
  }
  const oldMs = median(before), newMs = median(after);
  console.log(JSON.stringify({ rows: rows.length, medianOf: 3, previousMs: +oldMs.toFixed(1), cachedCollatorMs: +newMs.toFixed(1), speedup: +(oldMs / newMs).toFixed(1), identicalOrder: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
