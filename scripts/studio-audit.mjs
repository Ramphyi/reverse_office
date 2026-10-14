// SPDX-License-Identifier: MIT
// Review gate for the standalone artifact, whose source set excludes the company application.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = ['LICENSE', 'app.js', 'core.js', 'formats.js', 'index.html', 'styles.css'];
const directory = path.join(root, 'public', 'studio');
const actual = readdirSync(directory).sort();
const issues = [];
if (JSON.stringify(actual) !== JSON.stringify(assets))
  issues.push('Unreviewed asset files in public/studio.');
const components = [];
for (const name of assets) {
  const bytes = readFileSync(path.join(directory, name)),
    source = bytes.toString('utf8');
  if (name !== 'LICENSE' && !source.slice(0, 250).includes('SPDX-License-Identifier: MIT'))
    issues.push(name + ': original-source license marker missing.');
  if (name.endsWith('.js')) {
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g))
      if (!['./core.js', './formats.js'].includes(match[1]))
        issues.push(name + ': external import ' + match[1]);
    if (/\bimport\s*\(|\brequire\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/.test(source))
      issues.push(name + ': runtime code loading requires review.');
    if (/\bfetch\s*\(|\bnew\s+(WebSocket|XMLHttpRequest|EventSource|Worker)\s*\(/.test(source))
      issues.push(name + ': network or worker runtime requires review.');
  }
  components.push({
    path: 'public/studio/' + name,
    license: 'MIT',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const server = readFileSync(path.join(root, 'studio-server/server.c'), 'utf8');
if (
  !server.startsWith('/* SPDX-License-Identifier: MIT') ||
  /#include\s*[<"](?!assets\.h")/.test(server)
)
  issues.push('Server source requires license/include review.');
components.push({
  path: 'studio-server/server.c',
  license: 'MIT',
  sha256: createHash('sha256').update(server).digest('hex'),
});
const license = readFileSync(path.join(directory, 'LICENSE'), 'utf8');
if (
  license.replaceAll('\r\n', '\n') !==
  readFileSync(path.join(root, 'LICENSE'), 'utf8').replaceAll('\r\n', '\n')
)
  issues.push('Studio license differs from original-code MIT grant.');
const result = {
  artifact: 'Reverse Studio standalone',
  status: issues.length ? 'blocked' : 'source-allowlist-pass',
  components,
  issues,
  scope:
    'Only original Studio browser assets and the freestanding server. The Docker build also verifies no undefined symbols, dynamic interpreter or shared-library dependencies. This check does not approve the company application, its npm packages, or unreviewed future code.',
};
mkdirSync(path.join(root, 'artifacts'), { recursive: true });
writeFileSync(
  path.join(root, 'artifacts', 'studio-license-audit.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  `${result.artifact}: ${result.status}; ${components.length} original MIT source components; ${issues.length} issues.`,
);
for (const issue of issues) console.error(issue);
if (issues.length) process.exitCode = 1;
