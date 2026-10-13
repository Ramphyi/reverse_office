import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDocument, checkZipLimits } from '../server/exports.js';
import { safeImport } from '../server/import-safe.js';
import { schemas } from '../server/domain.js';
test('bounded import worker reads DOCX text and XLSX formula data', async () => {
  const doc = {
    kind: 'doc',
    title: 'Roundtrip',
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text & symbols — România' }] },
      ],
    },
  };
  const exported = await exportDocument(doc, 'docx'),
    imported = await safeImport({ originalname: 'test.docx', buffer: exported.bytes });
  assert.equal(imported.content.content[0].content[0].text, 'Text & symbols — România');
  const xlsx = await exportDocument(
    { kind: 'sheet', title: 'Budget', content: { cells: { A1: '2', A2: '3', A3: '=SUM(A1:A2)' } } },
    'xlsx',
  );
  const sheet = await safeImport({ originalname: 'budget.xlsx', buffer: xlsx.bytes });
  assert.equal(sheet.content.cells.A3, '=SUM(A1:A2)');
});
test('invalid archives and malformed document payloads fail closed', async () => {
  await assert.rejects(
    safeImport({ originalname: 'broken.docx', buffer: Buffer.from('not a zip') }),
  );
  assert.throws(() => checkZipLimits(Buffer.alloc(10)), /Invalid/);
  assert.equal(
    schemas.documents.safeParse({
      title: 'Bad',
      kind: 'sheet',
      content: { cells: { constructor: 'evil' } },
    }).success,
    false,
  );
  assert.equal(
    schemas.documents.safeParse({ title: 'Bad', kind: 'slides', content: { slides: 'not slides' } })
      .success,
    false,
  );
  assert.equal(
    schemas.documents.safeParse({
      title: 'Bad',
      kind: 'doc',
      content: { type: 'script', content: [] },
    }).success,
    false,
  );
});
