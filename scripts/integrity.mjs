import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const root = resolve(import.meta.dirname, '..');
const directories = ['src', 'lib', 'public', 'scripts', 'tests', 'site', '.github'];
const files = ['package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', '.gitattributes', 'server.mjs', 'mcp.mjs', 'Start-Connect.ps1', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'DESIGN.md', 'PRODUCT.md'];
const publicDocs = ['NOTIFICATIONS.md', 'PLAN-AND-FAILOVER.md', 'SESSION-DISCOVERY.md', 'TEST-SCENARIOS.md', 'COVERAGE.md', 'UI-AUDIT.md', 'RELEASE.md', 'DESIGN-REFERENCES.md', 'SECURITY-REVIEW.md'];
export async function releaseFiles(base = root) {
  const result = [];
  async function visit(path) {
    let info; try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw new Error(`Release inputs must not be symlinks: ${relative(base, path)}`);
    if (info.isDirectory()) { for (const entry of await readdir(path)) await visit(join(path, entry)); }
    else if (info.isFile()) result.push(relative(base, path).replaceAll('\\', '/'));
  }
  for (const directory of directories) await visit(resolve(base, directory));
  for (const file of files) await visit(resolve(base, file));
  for (const file of publicDocs) await visit(resolve(base, 'docs', file));
  return result.sort();
}
export const hash = data => createHash('sha256').update(data).digest('hex');
export async function generateManifest(base = root) {
  const entries = await Promise.all((await releaseFiles(base)).map(async path => ({ path, sha256: hash(await readFile(resolve(base, path))) })));
  return { formatVersion: 1, algorithm: 'sha256', files: entries };
}
export async function verifyManifest(manifest, base = root) {
  if (manifest?.formatVersion !== 1 || manifest.algorithm !== 'sha256' || !Array.isArray(manifest.files)) throw new Error('Unsupported integrity manifest.');
  const actual = await releaseFiles(base); const expected = manifest.files.map(entry => entry.path);
  if (new Set(expected).size !== expected.length) throw new Error('Duplicate paths in integrity manifest.');
  const changed = [...new Set([...actual, ...expected])].filter(path => !actual.includes(path) || !expected.includes(path));
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || !/^[a-zA-Z0-9_.\-/]+$/.test(entry.path) || entry.path.split('/').includes('..') || entry.path.startsWith('/') || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid path or digest in integrity manifest.');
    if (actual.includes(entry.path) && hash(await readFile(resolve(base, entry.path))) !== entry.sha256) changed.push(entry.path);
  }
  if (changed.length) throw new Error(`Integrity mismatch: ${[...new Set(changed)].join(', ')}`);
  return actual.length;
}
async function main() {
  const directory = resolve(root, 'integrity'), path = resolve(directory, 'sha256.json');
  if (process.argv[2] === 'generate') { const manifest = await generateManifest(); await mkdir(directory, { recursive: true }); await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`); await writeFile(resolve(directory, 'SHA256SUMS'), `${manifest.files.map(entry => `${entry.sha256}  ${entry.path}`).join('\n')}\n`); console.log(`Recorded SHA-256 for ${manifest.files.length} release files. No secrets or runtime directories are included.`); }
  else if (process.argv[2] === 'verify') { const count = await verifyManifest(JSON.parse(await readFile(path, 'utf8'))); console.log(`Integrity verified: ${count} files match the trusted local manifest. This is not a digital signature.`); }
  else throw new Error('Use integrity.mjs generate or verify.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
