import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate,
  newDocument,
  coordinate,
  rangeKeys,
  translateFormula,
  parseDelimited,
  delimited,
} from '../public/studio/core.js';
import { zip, unzip } from '../public/studio/formats.js';
import { schemas } from '../server/domain.js';

test('Studio computes formulas, cross-sheet references, lookup, conditions and text without code execution', () => {
  const d = newDocument('sheet');
  d.sheets[0].cells = {
    A1: '10',
    A2: '20',
    A3: 'text',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=IF(B1>20,"yes","no")',
    C1: '=IFERROR(1/0,99)',
    C2: '=IF(FALSE,1/0,42)',
    C3: '=COUNTIF(A1:A3,">15")',
    D1: '=SUMIF(A1:A3,">15")',
    D2: '=ROUND(-1.235,2)',
    D3: '=2+3*4^2',
    E1: '=CONCAT(UPPER("ab"),LEFT("cde",1))',
    E2: '=INDEX(A1:A3,2)',
    E3: '=MATCH(20,A1:A3,0)',
  };
  for (const [key, expected] of Object.entries({
    B1: 30,
    B2: 15,
    B3: 'yes',
    C1: 99,
    C2: 42,
    C3: 1,
    D1: 20,
    D2: -1.24,
    D3: 50,
    E1: 'ABc',
    E2: 20,
    E3: 2,
  }))
    assert.equal(calculate(d, 0, key), expected, key);
  d.sheets.push({ name: 'Other sheet', cells: { A1: '8', B1: "='Sheet 1'!B1" } });
  d.sheets[0].cells.F1 = "='Other sheet'!A1 + 2";
  assert.equal(calculate(d, 0, 'F1'), 10);
  assert.equal(calculate(d, 1, 'B1'), 30);
  d.sheets[0].cells.F2 = '=VLOOKUP(20,A1:B3,2,FALSE)';
  assert.equal(calculate(d, 0, 'F2'), 15);
  d.sheets[0].cells.F3 = '=YEAR(DATE(2026,10,14))';
  assert.equal(calculate(d, 0, 'F3'), 2026);
});
test('Studio formula failures are bounded and malicious expressions stay inert', () => {
  const d = newDocument('sheet');
  for (const [formula, expected] of [
    ['=1/0', '#DIV/0!'],
    ['=A1', '#CYCLE!'],
    ['=WEBSERVICE("https://example.com")', '#NAME?'],
    ['=globalThis.process.exit()', '#NAME?'],
    ['=SUM(A1:ZZ999999)', '#VALUE!'],
    ['=SQRT(-1)', '#NUM!'],
    ['="literal A1"', 'literal A1'],
  ]) {
    d.sheets[0].cells.A1 = formula;
    assert.equal(calculate(d, 0, 'A1'), expected, formula);
  }
  d.sheets[0].cells = { A1: '=B1', B1: '=A1' };
  assert.equal(calculate(d, 0, 'A1'), '#CYCLE!');
});
test('Studio ranges, relative formulas and multiline clipboard data preserve values', () => {
  assert.deepEqual(coordinate('CV1000'), [999, 99]);
  assert.deepEqual(rangeKeys('B2', 'A1'), ['A1', 'B1', 'A2', 'B2']);
  assert.throws(() => rangeKeys('A1', 'CW1000'));
  assert.equal(translateFormula('=A1+$B2+C$3+$D$4+"A1"', 2, 1), '=B3+$B4+D$3+$D$4+"A1"');
  assert.equal(translateFormula('=A1', -1, 0), '=#REF!');
  const rows = [
    ['hello\nworld', '"quoted"', 'a,b'],
    ['', 'last', ''],
  ];
  assert.deepEqual(parseDelimited(delimited(rows)), rows);
  assert.deepEqual(parseDelimited(delimited(rows, '\t'), '\t'), rows);
});
test('Original ZIP writer round trips with integrity checks and rejects corrupt or huge input', async () => {
  const archive = zip({
    'hello.txt': 'Salut, lume!',
    'nested/bytes.bin': new Uint8Array([0, 255, 3]),
  });
  const files = await unzip(archive);
  assert.equal(new TextDecoder().decode(files['hello.txt']), 'Salut, lume!');
  assert.deepEqual(files['nested/bytes.bin'], new Uint8Array([0, 255, 3]));
  const bad = new Uint8Array(await archive.arrayBuffer());
  bad[40] ^= 1;
  await assert.rejects(unzip(new Blob([bad])), /integrity/);
  await assert.rejects(unzip(zip({ '../escape': 'no' })), /Unsafe/);
  await assert.rejects(unzip({ size: 21 * 1024 * 1024 }), /20 MB/);
});
test('Company schema accepts Studio models and rejects wrong kinds or oversized coordinates', () => {
  for (const kind of ['doc', 'sheet', 'slides'])
    assert.equal(
      schemas.documents.safeParse({ title: 'Studio', kind, content: newDocument(kind) }).success,
      true,
    );
  assert.equal(
    schemas.documents.safeParse({ title: 'Wrong', kind: 'doc', content: newDocument('sheet') })
      .success,
    false,
  );
  const content = newDocument('sheet');
  content.sheets[0].cells.ZZ99999 = 'no';
  assert.equal(
    schemas.documents.safeParse({ title: 'Too large', kind: 'sheet', content }).success,
    false,
  );
});
