import { context } from 'esbuild';
import { spawn } from 'node:child_process';

const build = await context({ entryPoints: ['src/app.jsx'], outfile: 'public/app.js', bundle: true, sourcemap: false, jsx: 'automatic', target: ['es2022'], legalComments: 'eof', define: { 'process.env.NODE_ENV': '"development"' } });
await build.rebuild();
await build.watch();
const server = spawn(process.execPath, ['--watch', 'server.mjs'], { stdio: 'inherit', windowsHide: true });
console.log('Frontend watch enabled. Refresh your browser after changes.');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; server.kill(); await build.dispose(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
server.on('exit', async code => { await stop(); process.exitCode = code || 0; });
