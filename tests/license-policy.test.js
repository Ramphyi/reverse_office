import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedExpression, audit } from '../scripts/license-audit.mjs';

test('strict license expressions accept allowed alternatives but not additional obligations', () => {
  for (const value of [
    'MIT',
    'Apache-2.0',
    '(MIT OR GPL-3.0-or-later)',
    '(MIT AND Apache-2.0)',
    'BSD-3-Clause OR (Apache-2.0 AND MIT)',
  ])
    assert.equal(allowedExpression(value), true, value);
  for (const value of [
    'ISC',
    'BSD-3-Clause',
    'MIT-0',
    'OFL-1.1',
    '(MIT AND Zlib)',
    'MIT WITH LLVM-exception',
    'MIT/X11',
    'MIT OR',
    '(MIT',
    'MIT)',
    '',
    'UNKNOWN',
    null,
    'GPL-3.0-only',
    'MIT OR (Apache-2.0 AND GPL-3.0-only) WITH other',
  ])
    assert.equal(allowedExpression(value), false, String(value));
});
test('an all-MIT npm list cannot hide a forbidden runtime or an incomplete artifact review', () => {
  const lock = { packages: { '': {}, 'node_modules/demo': { version: '1.0.0', license: 'MIT' } } };
  const policy = {
    allowedLicenses: ['MIT', 'Apache-2.0'],
    status: 'blocked',
    scope: 'all',
    externalComponents: [],
  };
  assert.equal(audit(lock, policy).releaseStatus, 'blocked');
  assert.equal(
    audit(lock, {
      ...policy,
      status: 'approved',
      externalComponents: [{ name: 'libc', license: 'LGPL-2.1-or-later' }],
    }).releaseStatus,
    'blocked',
  );
  assert.equal(
    audit(
      { packages: { 'node_modules/unknown': { version: '1.0.0' } } },
      { ...policy, status: 'approved' },
    ).summary.productionExceptions,
    1,
  );
});
