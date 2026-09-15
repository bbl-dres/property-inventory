// Runs every scenario in ./scenarios, one Node process each (module state is per process).
//   node all.js            all scenarios
//   node all.js simple     only scenarios whose file name starts with "simple"
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const filter = process.argv[2] || '';
const dir = path.join(__dirname, 'scenarios');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f.startsWith(filter)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), path.join(dir, f)].concat(process.argv.slice(3)), { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stdout.write(r.stderr);
  if (r.status !== 0) failed++;
}
console.log(failed ? failed + ' of ' + files.length + ' scenarios failed' : 'all ' + files.length + ' scenarios passed');
process.exit(failed ? 1 : 0);
