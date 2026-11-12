import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(root, 'output', 'coverage');
mkdirSync(destination, { recursive: true });
const lcov = join(destination, 'lcov.info');
const result = spawnSync(process.execPath, [
  '--test', '--test-isolation=none', '--experimental-test-coverage',
  '--test-coverage-include=**/lib/*.mjs', '--test-coverage-include=**/server.mjs', '--test-coverage-include=**/mcp.mjs',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=lcov', `--test-reporter-destination=${lcov}`,
  ...readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort().map(name => join(root, 'tests', name)),
], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
writeFileSync(join(destination, 'run.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else {
  let report;
  try { report = readFileSync(lcov, 'utf8'); } catch { console.error('Coverage did not produce LCOV data. Inspect output/coverage/run.log.'); process.exitCode = 1; }
  if (report) {
    const files = report.split('end_of_record').map(record => {
      const value = key => Number(record.match(new RegExp(`^${key}:(\\d+)`, 'm'))?.[1] ?? 0);
      const file = record.match(/^SF:(.+)$/m)?.[1].trim();
      return file ? { file, lines: { hit: value('LH'), total: value('LF') }, branches: { hit: value('BRH'), total: value('BRF') }, functions: { hit: value('FNH'), total: value('FNF') } } : null;
    }).filter(Boolean);
    const expected = ['server.mjs', 'mcp.mjs', ...readdirSync(join(root, 'lib')).filter(name => name.endsWith('.mjs')).map(name => `lib/${name}`)];
    const missing = expected.filter(name => !files.some(file => file.file.replaceAll('\\', '/').endsWith(name)));
    const totals = Object.fromEntries(['lines', 'branches', 'functions'].map(kind => { const total = files.reduce((sum, file) => sum + file[kind].total, 0); const hit = files.reduce((sum, file) => sum + file[kind].hit, 0); return [kind, { hit, total, percent: total ? 100 * hit / total : 100 }]; }));
    const threshold = 98;
    const summary = { scope: 'backend runtime only: all lib/*.mjs, server.mjs, mcp.mjs', gatedMetric: 'lines', runtimeFiles: expected.length, measuredFiles: files.length, missing, threshold, totals, files, testsPassed: result.status === 0, meetsThreshold: result.status === 0 && !missing.length && totals.lines.percent >= threshold };
    writeFileSync(join(destination, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ scope: summary.scope, gatedMetric: summary.gatedMetric, testsPassed: summary.testsPassed, runtimeFiles: expected.length, missing, lines: totals.lines.percent.toFixed(2), branches: totals.branches.percent.toFixed(2), functions: totals.functions.percent.toFixed(2), threshold, meetsThreshold: summary.meetsThreshold }, null, 2));
    if (result.status !== 0 || missing.length || (!process.argv.includes('--report-only') && !summary.meetsThreshold)) process.exitCode = 1;
  }
}
