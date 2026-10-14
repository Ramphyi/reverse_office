import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument, PDFName } from 'pdf-lib';
test.describe.configure({ mode: 'serial' });

test('native Office edits, formulas, charts, images, PDF exports, dark theme and assistant', async ({
  page,
}) => {
  const setup = await page.request.post('/api/setup', {
    data: {
      name: 'Office Tester',
      email: 'office@example.test',
      password: 'Native-editor-test-42!',
      key: 'office-browser-test-key',
    },
  });
  expect(setup.status()).toBe(201);
  const { csrf } = await setup.json();
  const create = await page.request.post('/api/office/create', {
    headers: { 'x-csrf-token': csrf },
    data: { templateId: 'writer-report', title: 'Native business report' },
  });
  expect(create.status()).toBe(201);
  const document = await create.json();
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'Writer', exact: true }).click();
  await page.getByRole('button', { name: /^Native business report/ }).click();
  await expect(page.locator('.native-editor')).toBeVisible();
  await expect(
    page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  await page.screenshot({ path: 'artifacts/native-writer.png', fullPage: true });
  const frame = page.frames().find((f) => f.url().includes('documenteditor'));
  expect(frame).toBeTruthy();
  writeFileSync('artifacts/native-writer-dom.txt', await frame.locator('body').innerText());
  writeFileSync(
    'artifacts/native-writer-inputs.json',
    JSON.stringify(
      await frame.locator('input,textarea,canvas,[contenteditable]').evaluateAll((elements) =>
        elements.map((e) => ({
          tag: e.tagName,
          id: e.id,
          role: e.getAttribute('role'),
          label: e.getAttribute('aria-label'),
          title: e.getAttribute('title'),
          cls: e.className,
        })),
      ),
      null,
      2,
    ),
  );
  await frame.locator('#area_id').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Native browser edit preserved after saving.');
  await page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.native-document-name')).toContainText('Saved · version 2');
  const exported = await page.request.get(`/api/documents/${document.id}/export/docx`);
  expect(exported.status()).toBe(200);
  const zip = await JSZip.loadAsync(await exported.body());
  expect(await zip.file('word/document.xml').async('string')).toContain(
    'Native browser edit preserved',
  );
  const pdf = await page.request.get(`/api/documents/${document.id}/export/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await PDFDocument.load(await pdf.body())).getPageCount()).toBeGreaterThan(0);
  for (const format of ['odt', 'rtf', 'txt']) {
    const result = await page.request.get(`/api/documents/${document.id}/export/${format}`);
    expect(result.status(), format).toBe(200);
    if (format === 'odt')
      expect((await JSZip.loadAsync(await result.body())).file('content.xml')).toBeTruthy();
    if (format === 'txt')
      expect((await result.body()).toString()).toContain('Native browser edit preserved');
    if (format === 'rtf') expect((await result.body()).toString().startsWith('{\\rtf')).toBe(true);
  }
  await page.getByLabel('Color theme').selectOption('dark');
  await page.getByRole('button', { name: 'Apply dark to editor' }).click();
  await expect(
    page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
  await page.locator('.native-editor').getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'AI assistant' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/native-dark-ai.png', fullPage: true });
  await page.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await expect(page.locator('.template-card')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/native-templates-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  for (const [templateId, title, module, frameName] of [
    ['sheet-budget', 'Native budget', 'Sheets', 'spreadsheeteditor'],
    ['slides-pitch', 'Native pitch', 'Slides', 'presentationeditor'],
  ]) {
    const created = await page.request.post('/api/office/create', {
      headers: { 'x-csrf-token': csrf },
      data: { templateId, title },
    });
    expect(created.status()).toBe(201);
    const item = await created.json();
    await page.reload();
    await page.locator('nav').getByRole('button', { name: module, exact: true }).click();
    await page.getByRole('button', { name: new RegExp('^' + title) }).click();
    await expect(
      page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    const editor = page.frames().find((f) => f.url().includes(frameName));
    expect(editor).toBeTruthy();
    await page.screenshot({ path: `artifacts/native-${module.toLowerCase()}.png`, fullPage: true });
    writeFileSync(`artifacts/native-${module}-dom.txt`, await editor.locator('body').innerText());
    writeFileSync(
      `artifacts/native-${module}-inputs.json`,
      JSON.stringify(
        await editor.locator('input,textarea,canvas,[contenteditable]').evaluateAll((elements) =>
          elements.map((e) => ({
            tag: e.tagName,
            id: e.id,
            role: e.getAttribute('role'),
            label: e.getAttribute('aria-label'),
            title: e.getAttribute('title'),
            cls: e.className,
          })),
        ),
        null,
        2,
      ),
    );
    if (module === 'Sheets') {
      await editor.locator('#ce-cell-name').fill('C4');
      await editor.locator('#ce-cell-name').press('Enter');
      await page.keyboard.type('26000');
      await page.keyboard.press('Enter');
      await page
        .locator('.native-editor')
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(page.locator('.native-document-name')).toContainText('Saved · version 2');
      const saved = await page.request.get(`/api/documents/${item.id}/export/xlsx`);
      expect(saved.status()).toBe(200);
      const savedZip = await JSZip.loadAsync(await saved.body());
      expect(savedZip.file('xl/charts/chart1.xml')).toBeTruthy();
      const sheetXml = await savedZip.file('xl/worksheets/sheet1.xml').async('string');
      expect(sheetXml).toMatch(/<c r="C4"[^>]*>[\s\S]*?<v>26000<\/v>/);
      expect(sheetXml).toMatch(/<c r="D4"[^>]*>[\s\S]*?<v>1000<\/v>/);
    } else {
      await editor.locator('#area_id').focus();
      await page.keyboard.press('Control+m');
      await expect(editor.locator('body')).toContainText('of 9');
      await page
        .locator('.native-editor')
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(page.locator('.native-document-name')).toContainText('Saved · version 2');
      const saved = await page.request.get(`/api/documents/${item.id}/export/pptx`);
      const savedZip = await JSZip.loadAsync(await saved.body());
      expect(savedZip.file('ppt/slides/slide9.xml')).toBeTruthy();
      expect(savedZip.file('ppt/charts/chart1.xml')).toBeTruthy();
      await editor.getByRole('button', { name: 'Image', exact: true }).click();
      const chooserPromise = page.waitForEvent('filechooser');
      await editor
        .getByRole('tabpanel', { name: 'Home', exact: true })
        .getByText(/^Image from file$/i)
        .click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      await expect(page.locator('.native-document-name')).toContainText('Editing');
      await page
        .locator('.native-editor')
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(page.locator('.native-document-name')).toContainText('Saved · version 3');
      const withImage = await page.request.get(`/api/documents/${item.id}/export/pptx`);
      const imageZip = await JSZip.loadAsync(await withImage.body());
      expect(
        Object.keys(imageZip.files).some(
          (n) => n.startsWith('ppt/media/') && !imageZip.files[n].dir,
        ),
      ).toBe(true);
    }
    const converted = await page.request.get(`/api/documents/${item.id}/export/pdf`);
    expect(converted.status()).toBe(200);
    expect((await PDFDocument.load(await converted.body())).getPageCount()).toBeGreaterThan(0);
    const openFormat = module === 'Sheets' ? 'ods' : 'odp';
    const openExport = await page.request.get(`/api/documents/${item.id}/export/${openFormat}`);
    expect(openExport.status()).toBe(200);
    expect((await JSZip.loadAsync(await openExport.body())).file('content.xml')).toBeTruthy();
    if (module === 'Sheets') {
      const csv = await page.request.get(`/api/documents/${item.id}/export/csv`);
      expect(csv.status()).toBe(200);
      expect((await csv.body()).toString()).toContain('26000');
    }
    await page.getByRole('button', { name: 'Back to workspace' }).click();
  }
  const pdfFile = await page.request.post('/api/files', {
    headers: { 'x-csrf-token': csrf },
    multipart: {
      file: { name: 'Native PDF.pdf', mimeType: 'application/pdf', buffer: await pdf.body() },
    },
  });
  expect(pdfFile.status()).toBe(201);
  const pdfItem = await pdfFile.json();
  await page.reload();
  await page.locator('nav').getByRole('button', { name: 'PDF & Sign', exact: true }).click();
  await page.getByText('Native PDF.pdf', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit PDF · full editor' }).click();
  await expect(
    page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  await page.screenshot({ path: 'artifacts/native-pdf.png', fullPage: true });
  const pdfEditor = page.frames().find((f) => f.url().includes('pdfeditor'));
  expect(pdfEditor).toBeTruthy();
  writeFileSync('artifacts/native-pdf-dom.txt', await pdfEditor.locator('body').innerText());
  writeFileSync(
    'artifacts/native-pdf-controls.json',
    JSON.stringify(
      await pdfEditor.locator('button,[role=button],input,canvas').evaluateAll((es) =>
        es.map((e) => ({
          tag: e.tagName,
          id: e.id,
          label: e.getAttribute('aria-label'),
          text: e.innerText,
        })),
      ),
      null,
      2,
    ),
  );
  await pdfEditor.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await expect(pdfEditor.getByText('Insert', { exact: true })).toBeVisible();
  await pdfEditor.getByText('Insert', { exact: true }).click();
  await pdfEditor.getByRole('button', { name: 'Image', exact: true }).click();
  const pdfChooserPromise = page.waitForEvent('filechooser');
  await pdfEditor
    .getByText(/^Image from file$/i)
    .filter({ visible: true })
    .click();
  await (await pdfChooserPromise).setFiles('artifacts/native-writer.png');
  await expect(page.locator('.native-document-name')).toContainText('Editing');
  await page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.native-document-name')).toContainText('Saved · version 2');
  const savedPdf = await page.request.get(`/api/files/${pdfItem.id}/download`);
  const parsedPdf = await PDFDocument.load(await savedPdf.body());
  expect(
    parsedPdf.context
      .enumerateIndirectObjects()
      .some(([, object]) => object.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image'),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/native-pdf-edit.png', fullPage: true });
  writeFileSync(
    'artifacts/native-pdf-edit-controls.json',
    JSON.stringify(
      await pdfEditor
        .locator('button,[role=button]')
        .evaluateAll((es) =>
          es.map((e) => ({ id: e.id, label: e.getAttribute('aria-label'), text: e.innerText })),
        ),
      null,
      2,
    ),
  );
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  const signResponse = page.waitForResponse(
    (r) => r.url().endsWith(`/api/files/${pdfItem.id}/sign`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign & save copy' }).click();
  const signed = await signResponse;
  expect(signed.status()).toBe(201);
  const signedItem = await signed.json();
  const signedBytes = await page.request.get(`/api/files/${signedItem.id}/download`);
  expect((await PDFDocument.load(await signedBytes.body())).getPageCount()).toBe(
    parsedPdf.getPageCount() + 1,
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('nav').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'artifacts/dashboard-dark.png', fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('two accounts coedit one native file and preserve both saved contributions', async ({
  browser,
}) => {
  const alice = await browser.newContext({ baseURL: 'http://localhost:3102' }),
    bob = await browser.newContext({ baseURL: 'http://localhost:3102' });
  try {
    const initial = await (await alice.request.get('/api/setup')).json();
    const signedIn = await alice.request.post(initial.required ? '/api/setup' : '/api/login', {
      data: {
        name: 'Office Tester',
        email: 'office@example.test',
        password: 'Native-editor-test-42!',
        key: 'office-browser-test-key',
      },
    });
    expect(signedIn.ok()).toBe(true);
    const admin = await signedIn.json();
    const memberResponse = await alice.request.post('/api/users', {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        name: 'Coediting Member',
        email: 'coeditor@example.test',
        password: 'Native-coedit-password-42!',
        role: 'member',
      },
    });
    expect(memberResponse.status()).toBe(201);
    const member = await memberResponse.json();
    const projectResponse = await alice.request.post('/api/entities/projects', {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        title: 'Native collaboration',
        client: 'Test team',
        rate: 100,
        members: [admin.user.id, member.id],
      },
    });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();
    const docResponse = await alice.request.post('/api/office/create', {
      headers: { 'x-csrf-token': admin.csrf },
      data: { templateId: 'writer-blank', title: 'Shared native document', projectId: project.id },
    });
    expect(docResponse.status()).toBe(201);
    const shared = await docResponse.json();
    expect(
      (
        await bob.request.post('/api/login', {
          data: { email: 'coeditor@example.test', password: 'Native-coedit-password-42!' },
        })
      ).status(),
    ).toBe(200);
    const first = await alice.newPage(),
      second = await bob.newPage();
    const keys = [];
    for (const page of [first, second]) {
      await page.goto('/');
      await page.locator('nav').getByRole('button', { name: 'Writer', exact: true }).click();
      const configured = page.waitForResponse(
        (r) => r.url().endsWith('/config') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /^Shared native document/ }).click();
      keys.push((await (await configured).json()).key);
      await expect(
        page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
      ).toBeEnabled();
    }
    expect(keys[0]).toBe(keys[1]);
    for (const [page, text] of [
      [first, 'First author contribution.'],
      [second, 'Second author contribution.'],
    ]) {
      await page.bringToFront();
      const frame = page.frames().find((f) => f.url().includes('documenteditor'));
      await frame.locator('#area_id').focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      await page.keyboard.type(text);
      await page
        .locator('.native-editor')
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(page.locator('.native-document-name')).toContainText(/Saved · version [23]/);
    }
    const output = await alice.request.get(`/api/documents/${shared.id}/export/docx`);
    const zip = await JSZip.loadAsync(await output.body());
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('First author contribution.');
    expect(xml).toContain('Second author contribution.');
    await first.screenshot({ path: 'artifacts/native-coediting.png', fullPage: true });
  } finally {
    await alice.close();
    await bob.close();
  }
});

test('spreadsheet range selection, merge, unmerge, rectangular paste and persisted XLSX', async ({
  page,
}) => {
  const needsSetup = (await (await page.request.get('/api/setup')).json()).required;
  const auth = await page.request.post(needsSetup ? '/api/setup' : '/api/login', {
    data: {
      name: 'Office Tester',
      email: 'office@example.test',
      password: 'Native-editor-test-42!',
      key: 'office-browser-test-key',
    },
  });
  expect(auth.ok()).toBeTruthy();
  const { csrf } = await auth.json();
  const created = await page.request.post('/api/office/create', {
    headers: { 'x-csrf-token': csrf },
    data: { templateId: 'sheet-blank', title: 'Selection and merged cells' },
  });
  expect(created.status()).toBe(201);
  const doc = await created.json();
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'Sheets', exact: true }).click();
  await page.getByRole('button', { name: /^Selection and merged cells/ }).click();
  await expect(
    page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  const editor = page.frames().find((f) => f.url().includes('spreadsheeteditor'));
  expect(editor).toBeTruthy();
  const select = async (value) => {
    await editor.locator('#ce-cell-name').fill(value);
    await editor.locator('#ce-cell-name').press('Enter');
  };
  await select('A12');
  await page.keyboard.type('Merged heading');
  await page.keyboard.press('Enter');
  await select('A12:D12');
  writeFileSync('artifacts/sheet-range-controls.txt', await editor.locator('body').ariaSnapshot());
  await editor
    .getByRole('button', { name: /Merge and center/i })
    .first()
    .click();
  await page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.native-document-name')).toContainText('Saved · version 2');
  const download = await page.request.get(`/api/documents/${doc.id}/export/xlsx`);
  const zip = await JSZip.loadAsync(await download.body());
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  expect(xml).toMatch(/<mergeCell ref="A12:D12"/);
  await page.screenshot({ path: 'artifacts/sheets-merged-range.png', fullPage: true });
  await select('A12:D12');
  await editor
    .getByRole('button', { name: /Merge and center/i })
    .first()
    .click();
  await page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.native-document-name')).toContainText('Saved · version 3');
  const unmerged = await JSZip.loadAsync(
    await (await page.request.get(`/api/documents/${doc.id}/export/xlsx`)).body(),
  );
  expect(await unmerged.file('xl/worksheets/sheet1.xml').async('string')).not.toContain(
    '<mergeCell ref="A12:D12"',
  );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('12\t34\n56\t78'));
  await select('A20');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.native-document-name')).toContainText('Editing');
  await page.locator('.native-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.native-document-name')).toContainText('Saved · version 4');
  const pasted = await JSZip.loadAsync(
    await (await page.request.get(`/api/documents/${doc.id}/export/xlsx`)).body(),
  );
  const pastedXml = await pasted.file('xl/worksheets/sheet1.xml').async('string');
  expect(pastedXml).toMatch(/<c r="A20"[^>]*>[\s\S]*?<v>12<\/v>/);
  expect(pastedXml).toMatch(/<c r="B21"[^>]*>[\s\S]*?<v>78<\/v>/);
});
