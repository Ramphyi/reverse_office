import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';
import pptxgen from 'pptxgenjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { evaluateCell } from './domain.js';

export function plainText(node) {
  if (typeof node === 'string') return node.replace(/<[^>]*>/g, '');
  if (!node) return '';
  if (node.text) return node.text;
  return (node.content ?? [])
    .map(plainText)
    .join(['doc', 'bulletList', 'orderedList'].includes(node.type) ? '\n' : '');
}
const safeAscii = (s) => String(s).replace(/[^\x20-\x7E\n]/g, '?');
export async function exportDocument(doc, format) {
  if (doc.content?.studioVersion === 1 && format !== 'json')
    throw Object.assign(
      Error(
        'Open this document in Reverse Studio and use Export to preserve its supported content.',
      ),
      { status: 400 },
    );
  if (format === 'json')
    return { bytes: Buffer.from(JSON.stringify(doc.content, null, 2)), mime: 'application/json' };
  if (format === 'txt')
    return { bytes: Buffer.from(plainText(doc.content)), mime: 'text/plain;charset=utf-8' };
  if (format === 'docx' && ['doc', 'note'].includes(doc.kind)) {
    const paragraphs = (
      doc.content?.content ?? [{ type: 'paragraph', content: [{ text: plainText(doc.content) }] }]
    ).map(
      (n) =>
        new Paragraph({
          heading:
            n.type === 'heading'
              ? HeadingLevel[`HEADING_${Math.min(n.attrs?.level ?? 1, 6)}`]
              : undefined,
          children: (n.content ?? []).map(
            (t) =>
              new TextRun({
                text: plainText(t),
                bold: t.marks?.some((m) => m.type === 'bold'),
                italics: t.marks?.some((m) => m.type === 'italic'),
              }),
          ),
        }),
    );
    return {
      bytes: await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] })),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (['xlsx', 'csv'].includes(format) && doc.kind === 'sheet') {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Sheet 1'),
      cells = doc.content.cells ?? {};
    for (const [key, value] of Object.entries(cells)) {
      if (!/^[A-Z]{1,3}[1-9]\d{0,4}$/.test(key)) continue;
      const result = evaluateCell(cells, key);
      // Export only supported, safely evaluated formulas; external formulas are inert text.
      sheet.getCell(key).value =
        String(value).startsWith('=') && typeof result === 'number'
          ? { formula: String(value).slice(1), result }
          : String(value).startsWith('=')
            ? `'${value}`
            : result;
    }
    sheet.columns.forEach((c) => (c.width = 22));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A3B' } };
    if (format === 'csv') {
      const rows = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
          let v = String(evaluateCell(cells, sheet.getCell(r, c).address));
          if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
          row.push('"' + v.replaceAll('"', '""') + '"');
        }
        rows.push(row.join(','));
      }
      return { bytes: Buffer.from('\uFEFF' + rows.join('\r\n')), mime: 'text/csv;charset=utf-8' };
    }
    return {
      bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  if (format === 'pptx' && doc.kind === 'slides') {
    const deck = new pptxgen();
    deck.layout = 'LAYOUT_WIDE';
    deck.author = 'Reverse Office';
    deck.subject = doc.title;
    for (const [i, item] of (doc.content.slides ?? []).entries()) {
      const slide = deck.addSlide();
      slide.background = { color: 'F4F2EB' };
      slide.addText(String(item.title ?? ''), {
        x: 0.8,
        y: 1.2,
        w: 11.6,
        h: 1.3,
        fontFace: 'Aptos Display',
        fontSize: 38,
        bold: true,
        color: '174A3B',
        breakLine: false,
      });
      slide.addText(String(item.body ?? ''), {
        x: 0.85,
        y: 3,
        w: 11,
        h: 3,
        fontSize: 22,
        color: '3F5149',
        breakLine: false,
      });
      slide.addText(`${i + 1} / REVERSE OFFICE`, {
        x: 0.85,
        y: 6.8,
        w: 8,
        h: 0.3,
        fontSize: 10,
        color: '738077',
      });
    }
    return {
      bytes: Buffer.from(await deck.write({ outputType: 'nodebuffer' })),
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
  }
  if (format === 'pdf') {
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    const content =
      doc.kind === 'slides'
        ? (doc.content.slides ?? []).map((s) => `${s.title}\n\n${s.body}`).join('\n\n')
        : doc.kind === 'sheet'
          ? Object.entries(doc.content.cells ?? {})
              .map(([k]) => `${k}: ${evaluateCell(doc.content.cells, k)}`)
              .join('\n')
          : plainText(doc.content);
    let page, y;
    const addPage = () => {
      page = pdf.addPage([595, 842]);
      y = 785;
    };
    addPage();
    const lines = [doc.title, '', ...content.split('\n')];
    for (const line of lines)
      for (const wrap of safeAscii(line).match(/.{1,85}(?:\s|$)|.{1,85}/g) ?? ['']) {
        if (y < 55) addPage();
        page.drawText(wrap.trim(), { x: 50, y, size: 12, font, color: rgb(0.1, 0.2, 0.17) });
        y -= 19;
      }
    return { bytes: Buffer.from(await pdf.save()), mime: 'application/pdf' };
  }
  throw Object.assign(Error('Unsupported export for this document type'), { status: 400 });
}
export async function importOffice(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.xlsx')) checkZipLimits(file.buffer);
  if (name.endsWith('.docx')) {
    const zip = await JSZip.loadAsync(file.buffer),
      xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw Error('Invalid DOCX: missing document body');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error('Document type declarations are not supported');
    const nodes = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: true,
      processEntities: true,
      trimValues: false,
    }).parse(xml);
    const paragraphs = [];
    const textOf = (node) =>
      Object.entries(node)
        .map(([key, value]) =>
          key === '#text' ? String(value) : Array.isArray(value) ? value.map(textOf).join('') : '',
        )
        .join('');
    const visit = (nodes) => {
      for (const node of nodes)
        for (const [key, value] of Object.entries(node)) {
          if (key === 'w:p') {
            const text = textOf(node);
            paragraphs.push({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
          } else if (Array.isArray(value)) visit(value);
        }
    };
    visit(nodes);
    return {
      kind: 'doc',
      content: { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] },
    };
  }
  if (name.endsWith('.xlsx')) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.buffer);
    const cells = {};
    book.worksheets[0]?.eachRow((row) =>
      row.eachCell((cell) => {
        if (Object.keys(cells).length > 50000)
          throw Object.assign(Error('Workbook exceeds 50,000 populated cells'), { status: 413 });
        cells[cell.address] = cell.formula ? '=' + cell.formula : String(cell.text ?? '');
      }),
    );
    return { kind: 'sheet', content: { cells } };
  }
  if (name.endsWith('.txt') || name.endsWith('.md'))
    return {
      kind: 'doc',
      content: {
        type: 'doc',
        content: file.buffer
          .toString('utf8')
          .split('\n')
          .map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })),
      },
    };
  throw Object.assign(
    Error('Import supports DOCX, XLSX, TXT and Markdown. Upload other formats to Drive.'),
    { status: 400 },
  );
}

export function checkZipLimits(buffer) {
  // Inspect central directory before any decompression. ZIP64, encryption and oversized archives are refused.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error('Invalid Office ZIP archive');
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 2000 || offset >= buffer.length) throw Error('Archive is too large');
  let position = offset,
    total = 0;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== 0x02014b50)
      throw Error('Invalid ZIP directory');
    const flags = buffer.readUInt16LE(position + 8),
      size = buffer.readUInt32LE(position + 24);
    total += size;
    if (flags & 1 || size > 25 * 1024 * 1024 || total > 50 * 1024 * 1024)
      throw Error('Encrypted or oversized Office archive');
    const nameLength = buffer.readUInt16LE(position + 28);
    if (position + 46 + nameLength > buffer.length) throw Error('Invalid ZIP filename');
    names.add(buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8'));
    position +=
      46 +
      buffer.readUInt16LE(position + 28) +
      buffer.readUInt16LE(position + 30) +
      buffer.readUInt16LE(position + 32);
  }
  return names;
}
