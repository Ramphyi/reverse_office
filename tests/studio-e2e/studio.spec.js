import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
import JSZip from 'jszip';
import fs from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});
test('Writer formats text, inserts a table, persists across reload and exports a real DOCX', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: /Writer From/ }).click();
  await page.getByRole('textbox', { name: 'Document title' }).fill('Quarterly report');
  const body = page.getByRole('textbox', { name: 'Document body' });
  await body.fill('Report with Romanian diacritics: ă â î ș ț');
  await body.press('Control+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(body.locator('span[style*="font-weight"], b, strong')).toContainText('Report');
  await body.press('Control+End');
  await body.press('Enter');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(body.locator('table td')).toHaveCount(9);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Back to documents' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Quarterly report' }).click();
  await expect(body).toContainText('diacritics');
  await expect(body.locator('table')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByLabel('Export document').selectOption('docx');
  const file = await download;
  const archive = await JSZip.loadAsync(await fs.readFile(await file.path()));
  const xml = await archive.file('word/document.xml').async('string');
  expect(xml).toContain('ă â î ș ț');
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('<w:b/>');
  expect(errors).toEqual([]);
});
test('Sheets selects ranges, merges, fills formulas, adds charts and exports XLSX', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Sheets Make/ }).click();
  async function cell(key, value) {
    await page.getByRole('gridcell', { name: 'Cell ' + key, exact: true }).dblclick();
    await page.getByRole('textbox', { name: 'Edit ' + key, exact: true }).fill(value);
    await page.getByRole('textbox', { name: 'Edit ' + key, exact: true }).press('Enter');
  }
  await cell('A1', 'Item');
  await cell('B1', 'Value');
  await cell('A2', 'One');
  await cell('B2', '10');
  await cell('A3', 'Two');
  await cell('B3', '20');
  await cell('C2', '=B2*2');
  const range = page.getByRole('textbox', { name: 'Selected range' });
  await range.fill('C2:C3');
  await range.press('Enter');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Fill down' }).click();
  await expect(page.getByRole('gridcell', { name: 'Cell C3', exact: true })).toHaveText('40');
  await range.fill('E1:F1');
  await range.press('Enter');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Merge cells' }).click();
  await expect(page.getByRole('gridcell', { name: 'Cell E1', exact: true })).toHaveAttribute(
    'colspan',
    '2',
  );
  await range.fill('A1:B3');
  await range.press('Enter');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Comparison' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByLabel('Export document').selectOption('xlsx');
  const file = await download;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await file.path());
  const s = workbook.getWorksheet(1);
  expect(s.getCell('C3').value).toEqual({ formula: 'B3*2', result: 40 });
  expect(s.getCell('E1').isMerged).toBe(true);
  expect(s.getCell('B2').value).toBe(10);
  const chartArchive = await JSZip.loadAsync(await fs.readFile(await file.path()));
  expect(await chartArchive.file('xl/charts/chart1.xml').async('string')).toContain('<c:barChart>');
  expect(await chartArchive.file('xl/charts/chart1.xml').async('string')).toContain(
    '<c:v>20</c:v>',
  );
  expect(await chartArchive.file('xl/worksheets/_rels/sheet1.xml.rels').async('string')).toContain(
    'drawing1.xml',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Back to documents' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Untitled workbook' }).click();
  await expect(page.getByRole('img', { name: 'Comparison' })).toBeAttached();
});
test('Slides edits themes and speaker notes, presents and exports a PPTX package', async ({
  page,
}) => {
  await page.getByRole('button', { name: '▣ Project pitch' }).click();
  await page.getByRole('textbox', { name: 'Slide title' }).fill('Our new independent workspace');
  await page.getByRole('textbox', { name: 'Speaker notes' }).fill('Keep the original files.');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByLabel('Presentation theme').selectOption('midnight');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate slide' }).click();
  await page.getByRole('button', { name: '▶ Present' }).click();
  await expect(page.getByRole('dialog', { name: 'Presentation' })).toContainText(
    'Our new independent workspace',
  );
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Presentation' })).toContainText('The opportunity');
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByLabel('Export document').selectOption('pptx');
  const file = await download;
  const archive = await JSZip.loadAsync(await fs.readFile(await file.path()));
  expect(
    Object.keys(archive.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)),
  ).toHaveLength(4);
  expect(await archive.file('ppt/slides/slide1.xml').async('string')).toContain(
    'Our new independent workspace',
  );
  expect(await archive.file('ppt/notesSlides/notesSlide1.xml').async('string')).toContain(
    'Keep the original files.',
  );
  expect(await archive.file('ppt/theme/theme1.xml').async('string')).toContain('14232B');
});
test('HTML import removes executable content and remote tracking; JSON validation rejects oversized cells', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { sanitizeHtml, validateDocument, importFile } = await import('/formats.js');
    const html = sanitizeHtml(
      '<script>window.bad=1</script><img src="https://example.com/tracker" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><p style="color:red;background-image:url(https://example.com)">safe</p>',
    );
    let rejected = false;
    try {
      validateDocument({
        studioVersion: 1,
        kind: 'sheet',
        sheets: [{ name: 'S', cells: { ZZ9999: '1' } }],
      });
    } catch {
      rejected = true;
    }
    const csv = await importFile(
      new File(['Name,Value\nUnsafe,=WEBSERVICE("https://example.com")'], 'import.csv'),
    );
    return { html, rejected, csv: csv.sheets[0].cells.B2 };
  });
  expect(result.html).not.toMatch(/script|onerror|tracker|javascript|url\(/);
  expect(result.html).toContain('safe');
  expect(result.rejected).toBe(true);
  expect(result.csv).toMatch(/^'=/);
});
test('Portable files import as separate copies and dark mode persists', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newDocument } = await import('/core.js'),
      { docx, xlsx, pptx, importFile } = await import('/formats.js');
    const d = newDocument('doc');
    d.html = '<h1>Preserved heading</h1><p><strong>Bold</strong> body</p>';
    const x = newDocument('sheet', 'budget'),
      p = newDocument('slides', 'pitch');
    const results = [];
    for (const [value, writer, ext] of [
      [d, docx, 'docx'],
      [x, xlsx, 'xlsx'],
      [p, pptx, 'pptx'],
    ]) {
      const imported = await importFile(new File([writer(value)], 'sample.' + ext));
      results.push({
        kind: imported.kind,
        title: imported.title,
        html: imported.html,
        cell: imported.sheets?.[0].cells.D4,
        slides: imported.slides?.length,
        warning: imported.importWarning,
      });
    }
    return results;
  });
  expect(result[0].html).toContain('Preserved heading');
  expect(result[1].cell).toBe('=B4-C4');
  expect(result[2].slides).toBe(3);
  expect(result.every((r) => r.warning && r.title.includes('copy'))).toBe(true);
  await page.getByRole('button', { name: '◐ Dark' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('html').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    'rgb(17, 29, 25)',
  );
  await page.screenshot({ path: 'artifacts/studio-home-dark.png', fullPage: true });
});
test('Concurrent tabs cannot silently overwrite a saved document', async ({ page, context }) => {
  await page.getByRole('button', { name: /Writer From/ }).click();
  await page.getByRole('textbox', { name: 'Document body' }).fill('Initial');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Open Untitled document' }).click();
  await page.getByRole('textbox', { name: 'Document body' }).fill('First tab saved');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await other.getByRole('textbox', { name: 'Document body' }).fill('Stale tab edit');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(other.locator('#notice')).toContainText('another tab');
  await expect(other.getByRole('textbox', { name: 'Document body' })).toHaveText('Stale tab edit');
});

test('Images are embedded in Writer and Slides Office exports; print builds real content', async ({
  page,
}) => {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17664c';
    ctx.fillRect(0, 0, 320, 160);
    ctx.fillStyle = '#fff';
    ctx.font = '28px Arial';
    ctx.fillText('Reverse Studio', 24, 90);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  for (const kind of ['Writer', 'Slides']) {
    await page
      .getByRole('button', { name: kind === 'Writer' ? /Writer From/ : /Slides Give/ })
      .click();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: kind === 'Writer' ? 'Image' : 'Insert image', exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'illustration.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.locator(kind === 'Writer' ? '.paper img' : '.slide-page img')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByLabel('Export document').selectOption(kind === 'Writer' ? 'docx' : 'pptx');
    const file = await download,
      archive = await JSZip.loadAsync(await fs.readFile(await file.path()));
    const name = Object.keys(archive.files).find((n) => /media\/image\d+\.png$/.test(n));
    expect(name).toBeTruthy();
    expect((await archive.file(name).async('uint8array')).length).toBeGreaterThan(100);
    await page.evaluate(() => (window.print = () => {}));
    await page.getByLabel('Export document').selectOption('pdf');
    await expect(page.locator('#print-area img')).toHaveCount(1);
    await page.screenshot({
      path: 'artifacts/studio-' + kind.toLowerCase() + '.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Back to documents' }).click();
  }
});

test('Compressed XLSX imports preserve the source and spreadsheet clipboard supports rectangles', async ({
  page,
}) => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('Imported');
  sheet.getCell('A1').value = 'Original file';
  sheet.getCell('B2').value = 42;
  sheet.mergeCells('D1:E1');
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '↑ Import file' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'source.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  });
  await expect(page.getByRole('gridcell', { name: 'Cell B2', exact: true })).toHaveText('42');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original' }).click();
  expect(await fs.readFile(await (await download).path())).toEqual(bytes);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByRole('gridcell', { name: 'Cell A4', exact: true }).click();
  await page.getByRole('gridcell', { name: 'Cell A4', exact: true }).evaluate((cell) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'first\t5\nsecond\t=SUM(B2,5)');
    cell.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboard }));
  });
  await expect(page.getByRole('gridcell', { name: 'Cell B5', exact: true })).toHaveText('47');
  const start = await page.getByRole('gridcell', { name: 'Cell A4', exact: true }).boundingBox(),
    end = await page.getByRole('gridcell', { name: 'Cell B5', exact: true }).boundingBox();
  await page.mouse.move(start.x + 10, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(end.x + 10, end.y + 10, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole('textbox', { name: 'Selected range' })).toHaveValue('A4:B5');
  await expect(page.locator('.grid td[aria-selected="true"]')).toHaveCount(4);
  await page.getByRole('gridcell', { name: 'Cell D1', exact: true }).click();
  await page.getByRole('button', { name: 'Unmerge', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'Cell E1', exact: true })).toBeAttached();
  await page.screenshot({ path: 'artifacts/studio-sheets.png', fullPage: true });
});
