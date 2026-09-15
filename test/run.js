// Runs one scenario file in this process: node run.js scenarios/<name>.js
const path = require('path');
const { bootApp } = require('./lib/harness');

const file = process.argv[2];
if (!file) {
  console.error('usage: node run.js scenarios/<scenario>.js');
  process.exit(2);
}
const scenario = require(path.resolve(file));

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
}

(async () => {
  let ctx;
  try {
    ctx = await bootApp(scenario.boot);
    await scenario.run(ctx, check);
  } catch (e) {
    results.push({ name: 'scenario threw', ok: false, detail: (e && e.stack) || String(e) });
  }
  if (ctx) {
    ctx.restoreConsole();
    const unexpected = ctx.errors.filter(e => !(scenario.allowedErrors || []).some(re => re.test(e)));
    check('no unexpected console/runtime errors', unexpected.length === 0, unexpected.join('\n'));
  }
  const failed = results.filter(r => !r.ok);
  console.log((failed.length ? 'FAIL ' : 'PASS ') + scenario.name + ' (' + (results.length - failed.length) + '/' + results.length + ')');
  failed.forEach(r => console.log('  x ' + r.name + (r.detail ? '\n      ' + String(r.detail).split('\n').join('\n      ') : '')));
  if (process.argv.includes('--verbose')) results.filter(r => r.ok).forEach(r => console.log('  ok ' + r.name));
  process.exit(failed.length ? 1 : 0);
})();
