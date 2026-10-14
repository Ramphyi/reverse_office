import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SPDX OR selects an allowed license; AND requires every license to be allowed.
// Unknown syntax and WITH exceptions fail closed. Never relabel a dependency.
export function allowedExpression(expression, allowed = ['MIT', 'Apache-2.0']) {
  if (typeof expression !== 'string' || !expression.trim()) return false;
  const tokens = expression.match(/[A-Za-z0-9.+-]+|[()]/g) || [];
  if (tokens.join('') !== expression.replace(/\s/g, '')) return false;
  let i = 0;
  function atom() {
    if (tokens[i] === '(') {
      i++;
      const result = or();
      if (tokens[i++] !== ')') throw Error('Unbalanced expression');
      return result;
    }
    const token = tokens[i++];
    if (!token || ['AND', 'OR', 'WITH', ')'].includes(token)) throw Error('Invalid expression');
    return allowed.includes(token);
  }
  function and() {
    let result = atom();
    while (tokens[i] === 'AND') {
      i++;
      const right = atom();
      result = result && right;
    }
    return result;
  }
  function or() {
    let result = and();
    while (tokens[i] === 'OR') {
      i++;
      const right = and();
      result = result || right;
    }
    return result;
  }
  try {
    const result = or();
    return i === tokens.length && result;
  } catch {
    return false;
  }
}

export function audit(lock, policy) {
  const packages = Object.entries(lock.packages || {})
    .filter(([p]) => p)
    .map(([location, pkg]) => ({
      location,
      version: pkg.version || null,
      declaredLicense: pkg.license || 'UNKNOWN',
      developmentOnly: !!pkg.dev,
      status: !pkg.license
        ? 'review-required'
        : allowedExpression(pkg.license, policy.allowedLicenses)
          ? 'allowed-declaration'
          : 'blocked',
    }));
  const exceptions = packages.filter((p) => p.status !== 'allowed-declaration');
  const external = policy.externalComponents.map((c) => ({
    ...c,
    status: allowedExpression(c.license, policy.allowedLicenses)
      ? 'allowed-declaration'
      : 'blocked',
  }));
  return {
    scope: policy.scope,
    releaseStatus:
      policy.status === 'approved' &&
      !exceptions.length &&
      external.every((c) => c.status === 'allowed-declaration')
        ? 'declarations-pass-review-still-required'
        : 'blocked',
    limitation:
      'A passing SPDX declaration is not proof that bundled code/assets and binaries contain no other licenses. Runtime/container entries are confirmed blockers and unresolved reviews, not a complete SBOM or legal opinion. Final-artifact license evidence is still required.',
    summary: {
      packages: packages.length,
      allowedDeclarations: packages.length - exceptions.length,
      exceptions: exceptions.length,
      productionExceptions: exceptions.filter((p) => !p.developmentOnly).length,
      externalBlockers: external.filter((c) => c.status === 'blocked').length,
    },
    exceptions,
    externalComponents: external,
    packages,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = audit(
    JSON.parse(readFileSync(path.join(root, 'package-lock.json'))),
    JSON.parse(readFileSync(path.join(root, 'license-policy.json'))),
  );
  if (!process.argv.includes('--no-write')) {
    mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    writeFileSync(
      path.join(root, 'artifacts/license-audit.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
  console.log(JSON.stringify({ releaseStatus: report.releaseStatus, ...report.summary }, null, 2));
  for (const p of report.exceptions)
    console.log(
      `${p.status}: ${p.location} @ ${p.version} — ${p.declaredLicense}${p.developmentOnly ? ' (development)' : ''}`,
    );
  for (const c of report.externalComponents)
    if (c.status === 'blocked') console.log(`blocked artifact: ${c.name} — ${c.license}`);
  if (
    process.argv.includes('--check') &&
    report.releaseStatus !== 'declarations-pass-review-still-required'
  ) {
    console.error(
      'RELEASE BLOCKED: current components do not meet the requested MIT/Apache-2.0-only policy. See license-policy.json and docs/LICENSE-STATUS.md.',
    );
    process.exitCode = 1;
  }
}
