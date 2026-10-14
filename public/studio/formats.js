// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
import {
  address,
  coordinate,
  rectangle,
  calculate,
  newDocument,
  blankSheet,
  parseDelimited,
  delimited,
  LIMITS,
} from './core.js';
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
export const xml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
function crc32(data) {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(entries) {
  const parts = [],
    central = [];
  let offset = 0;
  const write = (length) => {
    const bytes = new Uint8Array(length);
    return [bytes, new DataView(bytes.buffer)];
  };
  for (const [name, value] of Object.entries(entries)) {
    const key = encoder.encode(name),
      bytes = typeof value === 'string' ? encoder.encode(value) : value,
      crc = crc32(bytes);
    const [local, v] = write(30 + key.length);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, key.length, true);
    local.set(key, 30);
    parts.push(local, bytes);
    const [header, c] = write(46 + key.length);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, key.length, true);
    c.setUint32(42, offset, true);
    header.set(key, 46);
    central.push(header);
    offset += local.length + bytes.length;
  }
  const size = central.reduce((n, a) => n + a.length, 0),
    [end, e] = write(22);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
export async function unzip(file) {
  if (file.size > LIMITS.fileBytes) throw Error('The file limit is 20 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  if (end < 0) throw Error('Invalid ZIP file.');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw Error('Multipart ZIP is unsupported.');
  const count = view.getUint16(end + 10, true);
  if (count > 2000) throw Error('Too many archive entries.');
  let pos = view.getUint32(end + 16, true),
    total = 0;
  const result = Object.create(null);
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      throw Error('Invalid ZIP directory.');
    const method = view.getUint16(pos + 10, true),
      compressed = view.getUint32(pos + 20, true),
      size = view.getUint32(pos + 24, true),
      nameLength = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true),
      local = view.getUint32(pos + 42, true),
      crc = view.getUint32(pos + 16, true);
    total += size;
    if (
      total > 60 * 1024 * 1024 ||
      size > 20 * 1024 * 1024 ||
      compressed > LIMITS.fileBytes ||
      view.getUint16(pos + 8, true) & 1
    )
      throw Error('Encrypted or oversized archive.');
    if (
      pos + 46 + nameLength + extra + comment > end ||
      local + 30 > bytes.length ||
      view.getUint32(local, true) !== 0x04034b50
    )
      throw Error('Invalid ZIP entry.');
    const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLength));
    if (
      name.startsWith('/') ||
      name.includes('..') ||
      name.includes('\\') ||
      Object.hasOwn(result, name)
    )
      throw Error('Unsafe ZIP entry.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > bytes.length) throw Error('Truncated ZIP entry.');
    let data = bytes.slice(start, start + compressed);
    if (method === 8) {
      const reader = new Blob([data])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
      let length = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > size) {
          await reader.cancel();
          throw Error('Expanded archive exceeds declared size.');
        }
        chunks.push(value);
      }
      data = new Uint8Array(length);
      let n = 0;
      for (const chunk of chunks) {
        data.set(chunk, n);
        n += chunk.length;
      }
    } else if (method !== 0) throw Error('Unsupported archive compression.');
    if (data.length !== size || crc32(data) !== crc) throw Error('Archive integrity check failed.');
    result[name] = data;
    pos += 46 + nameLength + extra + comment;
  }
  return result;
}
const ns = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
};
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const rels = (items) =>
  declaration +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  items
    .map(
      ([id, type, target, mode]) =>
        `<Relationship Id="${xml(id)}" Type="${ns.r}/${type}" Target="${xml(target)}"${mode === 'External' ? ' TargetMode="External"' : ''}/>`,
    )
    .join('') +
  '</Relationships>';
const types = (items, images = false) =>
  declaration +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  (images
    ? '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>'
    : '') +
  items
    .map(
      ([path, type]) =>
        `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`,
    )
    .join('') +
  '</Types>';
export function safeImage(value) {
  return typeof value === 'string' &&
    value.length < 14000000 &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)
    ? value
    : '';
}
export function sanitizeHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html), 'text/html'),
    allowed = new Set(
      'P DIV SPAN BR H1 H2 H3 H4 H5 H6 STRONG B EM I U S STRIKE UL OL LI BLOCKQUOTE TABLE THEAD TBODY TR TH TD HR A IMG SUB SUP'.split(
        ' ',
      ),
    );
  const output = document.createElement('div');
  function clean(node, parent) {
    if (node.nodeType === 3) {
      parent.append(document.createTextNode(node.textContent));
      return;
    }
    if (
      node.nodeType !== 1 ||
      ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'TEMPLATE'].includes(node.tagName)
    )
      return;
    if (!allowed.has(node.tagName)) {
      for (const child of node.childNodes) clean(child, parent);
      return;
    }
    const el = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'IMG') {
      const src = safeImage(node.getAttribute('src'));
      if (!src) return;
      el.src = src;
      el.alt = (node.getAttribute('alt') || 'Image').slice(0, 300);
      el.style.maxWidth = '100%';
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        el.setAttribute('href', href);
        el.rel = 'noopener noreferrer';
        el.target = '_blank';
      }
    }
    for (const attr of ['colspan', 'rowspan']) {
      const n = Number(node.getAttribute(attr));
      if (n > 0 && n <= 100) el.setAttribute(attr, String(n));
    }
    for (const prop of [
      'color',
      'background-color',
      'text-align',
      'font-weight',
      'font-style',
      'text-decoration',
      'font-size',
      'font-family',
      'width',
      'height',
      'border',
      'padding',
    ]) {
      const value = node.style.getPropertyValue(prop);
      if (value && value.length < 150 && !/url|expression|var\(|\\|[<>]/i.test(value))
        el.style.setProperty(prop, value);
    }
    for (const child of node.childNodes) clean(child, el);
    parent.append(el);
  }
  for (const node of parsed.body.childNodes) clean(node, output);
  return output.innerHTML;
}
function mediaData(src) {
  const m = /^data:image\/(png|jpeg);base64,(.*)$/.exec(safeImage(src));
  if (!m) return null;
  return {
    extension: m[1] === 'jpeg' ? 'jpg' : 'png',
    data: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)),
  };
}
const color = (value) =>
  /^#[0-9a-f]{6}$/i.test(value || '') ? value.slice(1).toUpperCase() : undefined;
function cssColor(value) {
  if (color(value)) return color(value);
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value || '');
  return m
    ? m
        .slice(1)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    : undefined;
}
export function docx(doc) {
  const body = new DOMParser().parseFromString(sanitizeHtml(doc.html), 'text/html').body,
    entries = {},
    relations = [];
  let imageId = 0;
  function runs(node, style = {}) {
    if (node.nodeType === 3)
      return (
        '<w:r><w:rPr>' +
        (style.bold ? '<w:b/>' : '') +
        (style.italic ? '<w:i/>' : '') +
        (style.underline ? '<w:u w:val="single"/>' : '') +
        (style.strike ? '<w:strike/>' : '') +
        (style.color ? `<w:color w:val="${style.color}"/>` : '') +
        (style.background ? `<w:shd w:fill="${style.background}"/>` : '') +
        (style.font
          ? `<w:rFonts w:ascii="${xml(style.font)}" w:hAnsi="${xml(style.font)}"/>`
          : '') +
        (style.size ? `<w:sz w:val="${style.size}"/>` : '') +
        '</w:rPr><w:t xml:space="preserve">' +
        xml(node.textContent) +
        '</w:t></w:r>'
      );
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'BR') return '<w:r><w:br/></w:r>';
    if (node.tagName === 'A' && /^(https?:\/\/|mailto:)/i.test(node.getAttribute('href') || '')) {
      const id = 'link' + relations.length;
      relations.push([id, 'hyperlink', node.getAttribute('href'), 'External']);
      return (
        `<w:hyperlink r:id="${id}">` +
        [...node.childNodes]
          .map((n) => runs(n, { ...style, underline: true, color: '17664C' }))
          .join('') +
        '</w:hyperlink>'
      );
    }
    if (node.tagName === 'IMG') {
      const image = mediaData(node.src);
      if (!image) return '';
      imageId++;
      const name = `image${imageId}.${image.extension}`;
      entries['word/media/' + name] = image.data;
      relations.push(['image' + imageId, 'image', 'media/' + name]);
      const width = Math.min(600, parseFloat(node.style.width) || 420) * 9525,
        height = (parseFloat(node.style.height) || 260) * 9525;
      return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${imageId}" name="Image ${imageId}"/><a:graphic xmlns:a="${ns.a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${imageId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    const next = {
      ...style,
      bold:
        style.bold || ['B', 'STRONG'].includes(node.tagName) || node.style.fontWeight === 'bold',
      italic:
        style.italic || ['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic',
      underline:
        style.underline || node.tagName === 'U' || node.style.textDecoration.includes('underline'),
      strike:
        style.strike ||
        ['S', 'STRIKE'].includes(node.tagName) ||
        node.style.textDecoration.includes('line-through'),
      color: cssColor(node.style.color) || style.color,
      background: cssColor(node.style.backgroundColor) || style.background,
      font: node.style.fontFamily.replaceAll('"', '').replaceAll("'", '') || style.font,
      size: parseFloat(node.style.fontSize)
        ? Math.round(parseFloat(node.style.fontSize) * 1.5)
        : { small: 20, medium: 24, large: 28, 'x-large': 36 }[node.style.fontSize] || style.size,
    };
    return [...node.childNodes].map((n) => runs(n, next)).join('');
  }
  function blocks(node) {
    if (node.nodeType === 3) return node.textContent.trim() ? '<w:p>' + runs(node) + '</w:p>' : '';
    if (node.tagName === 'TABLE')
      return (
        '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="CBD5D1"/>`)
          .join('') +
        '</w:tblBorders></w:tblPr>' +
        [...node.querySelectorAll('tr')]
          .map(
            (tr) =>
              '<w:tr>' +
              [...tr.children]
                .map(
                  (td) =>
                    '<w:tc><w:tcPr>' +
                    (td.colSpan > 1 ? `<w:gridSpan w:val="${td.colSpan}"/>` : '') +
                    '</w:tcPr><w:p>' +
                    runs(td, { bold: td.tagName === 'TH' }) +
                    '</w:p></w:tc>',
                )
                .join('') +
              '</w:tr>',
          )
          .join('') +
        '</w:tbl>'
      );
    if (node.tagName === 'UL' || node.tagName === 'OL')
      return [...node.children]
        .map(
          (li, i) =>
            '<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t>' +
            xml(node.tagName === 'OL' ? i + 1 + '. ' : '• ') +
            '</w:t></w:r>' +
            runs(li) +
            '</w:p>',
        )
        .join('');
    const level = /^H([1-6])$/.exec(node.tagName),
      align = node.style?.textAlign;
    return (
      '<w:p><w:pPr>' +
      (level ? `<w:pStyle w:val="Heading${level[1]}"/>` : '') +
      (align ? `<w:jc w:val="${align === 'justify' ? 'both' : xml(align)}"/>` : '') +
      '</w:pPr>' +
      runs(node, {
        bold: !!level,
        size: level ? Math.max(24, 48 - Number(level[1]) * 4) : undefined,
      }) +
      '</w:p>'
    );
  }
  const landscape = doc.page?.orientation === 'landscape',
    margin = Math.round((doc.page?.margin || 56) * 15);
  entries['word/document.xml'] =
    declaration +
    `<w:document xmlns:w="${ns.w}" xmlns:r="${ns.r}"><w:body>` +
    [...body.childNodes].map(blocks).join('') +
    `<w:sectPr><w:pgSz w:w="${landscape ? 16838 : 11906}" w:h="${landscape ? 11906 : 16838}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}"/></w:sectPr></w:body></w:document>`;
  entries['word/_rels/document.xml.rels'] = rels(relations);
  entries['_rels/.rels'] = rels([['rId1', 'officeDocument', 'word/document.xml']]);
  entries['[Content_Types].xml'] = types(
    [['word/document.xml', 'wordprocessingml.document.main+xml']],
    true,
  );
  return zip(entries);
}
function spreadsheetCharts(doc, sheet, sheetIndex, entries, overrides, startIndex) {
  if (!sheet.charts?.length) return 0;
  const chartNs = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const links = [],
    anchors = [];
  sheet.charts.forEach((chart, ci) => {
    const id = startIndex + ci + 1,
      [r1, c1, r2, c2] = rectangle(...chart.range.split(':'));
    const rows = Math.min(50, r2 - r1),
      series = Math.min(5, c2 - c1);
    const sheetName = "'" + sheet.name.replaceAll("'", "''") + "'!";
    const reference = (r, c) => '$' + address(r, c).replace(/\d+$/, '') + '$' + (r + 1);
    const cache = new Map(),
      value = (r, c) => calculate(doc, sheetIndex, address(r, c), new Set(), cache);
    const colors = ['388669', 'B79A4D', '688CAD', 'AB7B83', '8B82AD'];
    let data = '';
    for (let s = 0; s < series; s++) {
      const c = c1 + s + 1;
      data += `<c:ser><c:idx val="${s}"/><c:order val="${s}"/><c:tx><c:strRef><c:f>${xml(sheetName + reference(r1, c))}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(value(r1, c))}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${colors[s]}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${colors[s]}"/></a:solidFill></a:ln></c:spPr>`;
      data +=
        '<c:cat><c:strRef><c:f>' +
        xml(sheetName + reference(r1 + 1, c1) + ':' + reference(r1 + rows, c1)) +
        '</c:f><c:strCache><c:ptCount val="' +
        rows +
        '"/>' +
        Array.from(
          { length: rows },
          (_, i) => `<c:pt idx="${i}"><c:v>${xml(value(r1 + 1 + i, c1))}</c:v></c:pt>`,
        ).join('') +
        '</c:strCache></c:strRef></c:cat>';
      data +=
        '<c:val><c:numRef><c:f>' +
        xml(sheetName + reference(r1 + 1, c) + ':' + reference(r1 + rows, c)) +
        '</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' +
        rows +
        '"/>' +
        Array.from(
          { length: rows },
          (_, i) =>
            `<c:pt idx="${i}"><c:v>${typeof value(r1 + 1 + i, c) === 'number' ? value(r1 + 1 + i, c) : 0}</c:v></c:pt>`,
        ).join('') +
        '</c:numCache></c:numRef></c:val>' +
        (chart.type === 'line' ? '<c:smooth val="0"/>' : '') +
        '</c:ser>';
    }
    const tag = chart.type === 'line' ? 'lineChart' : 'barChart';
    entries[`xl/charts/chart${id}.xml`] =
      declaration +
      `<c:chartSpace xmlns:c="${chartNs}" xmlns:a="${ns.a}" xmlns:r="${ns.r}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:layout/><c:${tag}>` +
      (chart.type === 'line'
        ? '<c:grouping val="standard"/>'
        : '<c:barDir val="col"/><c:grouping val="clustered"/>') +
      data +
      `<c:axId val="${id * 10 + 1}"/><c:axId val="${id * 10 + 2}"/></c:${tag}><c:catAx><c:axId val="${id * 10 + 1}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${id * 10 + 2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${id * 10 + 2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="${id * 10 + 1}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
    overrides.push([`xl/charts/chart${id}.xml`, 'drawingml.chart+xml']);
    links.push(['chart' + id, 'chart', `../charts/chart${id}.xml`]);
    const top = r2 + 3 + ci * 16;
    anchors.push(
      `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${top}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${top + 15}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${chartNs}"><c:chart xmlns:c="${chartNs}" r:id="chart${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    );
  });
  entries[`xl/drawings/drawing${sheetIndex + 1}.xml`] =
    declaration +
    `<xdr:wsDr xmlns:xdr="${drawingNs}" xmlns:a="${ns.a}" xmlns:r="${ns.r}">` +
    anchors.join('') +
    '</xdr:wsDr>';
  entries[`xl/drawings/_rels/drawing${sheetIndex + 1}.xml.rels`] = rels(links);
  entries[`xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`] = rels([
    ['drawing', 'drawing', `../drawings/drawing${sheetIndex + 1}.xml`],
  ]);
  overrides.push([`xl/drawings/drawing${sheetIndex + 1}.xml`, 'drawing+xml']);
  return sheet.charts.length;
}
export function xlsx(doc) {
  const entries = {},
    styleList = [{}],
    styleMap = new Map(),
    styleIndex = (s) => {
      const key = JSON.stringify(s || {});
      if (!styleMap.has(key)) {
        styleMap.set(key, styleList.length);
        styleList.push(s || {});
      }
      return styleMap.get(key);
    };
  const overrides = [
    ['xl/workbook.xml', 'spreadsheetml.sheet.main+xml'],
    ['xl/styles.xml', 'spreadsheetml.styles+xml'],
  ];
  let chartIndex = 0;
  doc.sheets.forEach((sheet, index) => {
    const rows = new Map(),
      cache = new Map();
    for (const key of new Set([...Object.keys(sheet.cells), ...Object.keys(sheet.styles || {})])) {
      const [r] = coordinate(key),
        v = sheet.cells[key] ?? '',
        result = calculate(doc, index, key, new Set(), cache),
        s = styleIndex(sheet.styles?.[key]);
      // Only supported locally evaluated formulas are executable in exported workbooks.
      const formula =
        String(v).startsWith('=') &&
        !String(result).startsWith('#') &&
        !/\[|\]|\||https?:|DDE|WEBSERVICE|HYPERLINK/i.test(String(v));
      const value = formula
        ? result
        : typeof result === 'number'
          ? result
          : String(v).startsWith('=')
            ? String(v)
            : result;
      const cell =
        `<c r="${key}" s="${s}"${typeof value === 'number' ? '' : typeof value === 'boolean' ? ' t="b"' : formula ? ' t="str"' : ' t="inlineStr"'}>` +
        (formula ? `<f>${xml(String(v).slice(1))}</f>` : '') +
        (typeof value === 'number' || typeof value === 'boolean' || formula
          ? `<v>${xml(typeof value === 'boolean' ? +value : value)}</v>`
          : `<is><t xml:space="preserve">${xml(value)}</t></is>`) +
        '</c>';
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(cell);
    }
    entries[`xl/worksheets/sheet${index + 1}.xml`] =
      declaration +
      `<worksheet xmlns="${ns.s}" xmlns:r="${ns.r}"><sheetViews><sheetView workbookViewId="0">${sheet.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="${sheet.columns || 16}" width="18" customWidth="1"/></cols><sheetData>` +
      [...rows]
        .sort((a, b) => a[0] - b[0])
        .map(([r, c]) => `<row r="${r + 1}">${c.join('')}</row>`)
        .join('') +
      '</sheetData>' +
      ((sheet.merges || []).length
        ? `<mergeCells count="${sheet.merges.length}">` +
          sheet.merges.map((r) => `<mergeCell ref="${xml(r)}"/>`).join('') +
          '</mergeCells>'
        : '') +
      (sheet.charts?.length ? '<drawing r:id="drawing"/>' : '') +
      '</worksheet>';
    overrides.push([`xl/worksheets/sheet${index + 1}.xml`, 'spreadsheetml.worksheet+xml']);
    chartIndex += spreadsheetCharts(doc, sheet, index, entries, overrides, chartIndex);
  });
  const formats = { general: 0, number: 4, currency: 164, percent: 10, date: 14 };
  entries['xl/styles.xml'] =
    declaration +
    `<styleSheet xmlns="${ns.s}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;€&quot;#,##0.00"/></numFmts><fonts count="${styleList.length}">` +
    styleList
      .map(
        (s) =>
          '<font><sz val="11"/><name val="Arial"/>' +
          (s.bold ? '<b/>' : '') +
          (s.italic ? '<i/>' : '') +
          (s.underline ? '<u/>' : '') +
          (color(s.color) ? `<color rgb="FF${color(s.color)}"/>` : '') +
          '</font>',
      )
      .join('') +
    `</fonts><fills count="${styleList.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    styleList
      .map(
        (s) =>
          '<fill><patternFill patternType="solid"><fgColor rgb="FF' +
          (color(s.background) || 'FFFFFF') +
          '"/><bgColor indexed="64"/></patternFill></fill>',
      )
      .join('') +
    '</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>' +
    ['left', 'right', 'top', 'bottom']
      .map((s) => `<${s} style="thin"><color rgb="FFBBCBC4"/></${s}>`)
      .join('') +
    '<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${styleList.length}">` +
    styleList
      .map(
        (s, i) =>
          `<xf numFmtId="${formats[s.format] || 0}" fontId="${i}" fillId="${s.background ? i + 2 : 0}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="${['left', 'center', 'right'].includes(s.align) ? s.align : 'general'}" wrapText="${s.wrap ? 1 : 0}"/></xf>`,
      )
      .join('') +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  entries['xl/workbook.xml'] =
    declaration +
    `<workbook xmlns="${ns.s}" xmlns:r="${ns.r}"><sheets>` +
    doc.sheets
      .map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  entries['xl/_rels/workbook.xml.rels'] = rels([
    ...doc.sheets.map((s, i) => ['rId' + (i + 1), 'worksheet', `worksheets/sheet${i + 1}.xml`]),
    ['styles', 'styles', 'styles.xml'],
  ]);
  entries['_rels/.rels'] = rels([['rId1', 'officeDocument', 'xl/workbook.xml']]);
  entries['[Content_Types].xml'] = types(overrides);
  return zip(entries);
}
export const THEMES = {
  forest: { background: 'F1F5EF', ink: '173F35', accent: '287C62' },
  midnight: { background: '14232B', ink: 'F4F5EE', accent: '9DE7C2' },
  sunrise: { background: 'FFF4EA', ink: '683C29', accent: 'B95D36' },
  paper: { background: 'FFFFFF', ink: '242933', accent: '376EC8' },
};
export function pptx(doc) {
  const entries = {},
    overrides = [
      ['ppt/presentation.xml', 'presentationml.presentation.main+xml'],
      ['ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster+xml'],
      ['ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout+xml'],
      ['ppt/theme/theme1.xml', 'theme+xml'],
    ],
    t = THEMES[doc.theme] || THEMES.forest;
  const tree =
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const shape = (id, name, text, x, y, w, h, size, bold) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>` +
    String(text || '')
      .split('\n')
      .map(
        (line) =>
          `<a:p><a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${t.ink}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${xml(line)}</a:t></a:r></a:p>`,
      )
      .join('') +
    '</p:txBody></p:sp>';
  doc.slides.forEach((s, i) => {
    const relations = [['layout', 'slideLayout', '../slideLayouts/slideLayout1.xml']],
      img = mediaData(s.image);
    let picture = '';
    if (img) {
      const name = `image${i + 1}.${img.extension}`;
      entries['ppt/media/' + name] = img.data;
      relations.push(['image', 'image', '../media/' + name]);
      picture = `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="image"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="6700000" y="2400000"/><a:ext cx="4300000" cy="3300000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    entries[`ppt/slides/slide${i + 1}.xml`] =
      declaration +
      `<p:sld xmlns:a="${ns.a}" xmlns:r="${ns.r}" xmlns:p="${ns.p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${t.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>` +
      tree +
      shape(2, 'Title', s.title, 730000, 700000, 10500000, 1500000, 4000, true) +
      shape(3, 'Body', s.body, 730000, 2400000, img ? 5400000 : 10500000, 3300000, 2400, false) +
      picture +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    if (s.notes) {
      relations.push(['notes', 'notesSlide', `../notesSlides/notesSlide${i + 1}.xml`]);
      entries[`ppt/notesSlides/notesSlide${i + 1}.xml`] =
        declaration +
        `<p:notes xmlns:p="${ns.p}" xmlns:a="${ns.a}"><p:cSld><p:spTree>${tree}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(s.notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
      entries[`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`] = rels([
        ['slide', 'slide', `../slides/slide${i + 1}.xml`],
      ]);
      overrides.push([`ppt/notesSlides/notesSlide${i + 1}.xml`, 'presentationml.notesSlide+xml']);
    }
    entries[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels(relations);
    overrides.push([`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide+xml']);
  });
  entries['ppt/presentation.xml'] =
    declaration +
    `<p:presentation xmlns:a="${ns.a}" xmlns:r="${ns.r}" xmlns:p="${ns.p}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="master"/></p:sldMasterIdLst><p:sldIdLst>` +
    doc.slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="slide${i + 1}"/>`).join('') +
    '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  entries['ppt/_rels/presentation.xml.rels'] = rels([
    ['master', 'slideMaster', 'slideMasters/slideMaster1.xml'],
    ...doc.slides.map((s, i) => ['slide' + (i + 1), 'slide', `slides/slide${i + 1}.xml`]),
  ]);
  entries['ppt/slideMasters/slideMaster1.xml'] =
    declaration +
    `<p:sldMaster xmlns:a="${ns.a}" xmlns:r="${ns.r}" xmlns:p="${ns.p}"><p:cSld><p:spTree>${tree}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="layout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  entries['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([
    ['layout', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
    ['theme', 'theme', '../theme/theme1.xml'],
  ]);
  entries['ppt/slideLayouts/slideLayout1.xml'] =
    declaration +
    `<p:sldLayout xmlns:a="${ns.a}" xmlns:p="${ns.p}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  entries['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([
    ['master', 'slideMaster', '../slideMasters/slideMaster1.xml'],
  ]);
  const colors = {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: t.ink,
    lt2: t.background,
    accent1: t.accent,
    accent2: 'D99F50',
    accent3: '679EB0',
    accent4: 'A288C3',
    accent5: 'CF7967',
    accent6: '8CA86B',
    hlink: '376EC8',
    folHlink: '8844AA',
  };
  entries['ppt/theme/theme1.xml'] =
    declaration +
    `<a:theme xmlns:a="${ns.a}" name="Reverse Studio"><a:themeElements><a:clrScheme name="Studio">` +
    Object.entries(colors)
      .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`)
      .join('') +
    '</a:clrScheme><a:fontScheme name="System"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Studio"><a:fillStyleLst>' +
    Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('') +
    '</a:fillStyleLst><a:lnStyleLst>' +
    Array(3)
      .fill(
        '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>',
      )
      .join('') +
    '</a:lnStyleLst><a:effectStyleLst>' +
    Array(3).fill('<a:effectStyle><a:effectLst/></a:effectStyle>').join('') +
    '</a:effectStyleLst><a:bgFillStyleLst>' +
    Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('') +
    '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  entries['_rels/.rels'] = rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]);
  entries['[Content_Types].xml'] = types(overrides, true);
  return zip(entries);
}
function readXml(entries, path) {
  const bytes = entries[path];
  if (!bytes) throw Error('Missing Office part: ' + path);
  const text = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('XML entities are not accepted.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('Invalid Office XML.');
  return doc;
}
const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
const text = (node, name) =>
  tags(node, name)
    .map((n) => n.textContent)
    .join('');
const attr = (node, name) => node.getAttributeNS(ns.w, name) || node.getAttribute(name);
export async function importFile(file) {
  if (file.size > LIMITS.fileBytes) throw Error('The file limit is 20 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'json') return validateDocument(JSON.parse(await file.text()));
  if (['txt', 'html', 'htm'].includes(extension)) {
    const doc = newDocument('doc');
    doc.title = file.name.replace(/\.[^.]+$/, '');
    doc.html =
      extension === 'txt'
        ? '<p>' + xml(await file.text()).replaceAll('\n', '<br>') + '</p>'
        : sanitizeHtml(await file.text());
    return doc;
  }
  if (['csv', 'tsv'].includes(extension)) {
    const doc = newDocument('sheet');
    doc.title = file.name;
    const rows = parseDelimited(await file.text(), extension === 'tsv' ? '\t' : ',');
    rows.forEach((r, i) =>
      r.forEach((v, c) => (doc.sheets[0].cells[address(i, c)] = /^[=+@]/.test(v) ? "'" + v : v)),
    );
    doc.sheets[0].rows = Math.max(40, rows.length);
    doc.sheets[0].columns = Math.max(16, ...rows.map((r) => r.length));
    return doc;
  }
  if (!['docx', 'xlsx', 'pptx'].includes(extension))
    throw Error('Choose DOCX, XLSX, PPTX, CSV, TSV, TXT, HTML or Studio JSON.');
  const entries = await unzip(file);
  let doc;
  if (extension === 'docx') {
    doc = newDocument('doc');
    const source = readXml(entries, 'word/document.xml'),
      images = {};
    if (entries['word/_rels/document.xml.rels'])
      for (const rel of tags(readXml(entries, 'word/_rels/document.xml.rels'), 'Relationship')) {
        const target = rel.getAttribute('Target');
        if (rel.getAttribute('TargetMode') === 'External' || !target?.startsWith('media/'))
          continue;
        const data = entries['word/' + target];
        if (data && /\.(png|jpg|jpeg)$/i.test(target)) {
          let encoded = '';
          for (const b of data) encoded += String.fromCharCode(b);
          images[rel.getAttribute('Id')] =
            'data:image/' + (/\.png$/i.test(target) ? 'png' : 'jpeg') + ';base64,' + btoa(encoded);
        }
      }
    function paragraph(p) {
      let html = '';
      for (const r of tags(p, 'r')) {
        let value = '';
        for (const child of r.childNodes) {
          if (child.localName === 't') value += xml(child.textContent);
          if (child.localName === 'br') value += '<br>';
          if (child.localName === 'tab') value += '    ';
        }
        for (const blip of tags(r, 'blip')) {
          const src = images[blip.getAttributeNS(ns.r, 'embed')];
          if (src) value += '<img src="' + src + '" alt="Imported image">';
        }
        if (tags(r, 'b').some((n) => attr(n, 'val') !== '0'))
          value = '<strong>' + value + '</strong>';
        if (tags(r, 'i').some((n) => attr(n, 'val') !== '0')) value = '<em>' + value + '</em>';
        if (tags(r, 'u').length) value = '<u>' + value + '</u>';
        const col = tags(r, 'color')[0];
        if (col && /^[\da-f]{6}$/i.test(attr(col, 'val')))
          value = '<span style="color:#' + attr(col, 'val') + '">' + value + '</span>';
        html += value;
      }
      const style = tags(p, 'pStyle')[0],
        match = /Heading([1-6])/i.exec(style ? attr(style, 'val') : '');
      const tag = match ? 'h' + match[1] : 'p';
      return '<' + tag + '>' + html + '</' + tag + '>';
    }
    const body = tags(source, 'body')[0];
    doc.html = [...body.children]
      .map((node) =>
        node.localName === 'p'
          ? paragraph(node)
          : node.localName === 'tbl'
            ? '<table><tbody>' +
              [...node.children]
                .filter((n) => n.localName === 'tr')
                .map(
                  (tr) =>
                    '<tr>' +
                    [...tr.children]
                      .filter((n) => n.localName === 'tc')
                      .map((td) => '<td>' + tags(td, 'p').map(paragraph).join('') + '</td>')
                      .join('') +
                    '</tr>',
                )
                .join('') +
              '</tbody></table>'
            : '',
      )
      .join('');
  } else if (extension === 'xlsx') {
    doc = newDocument('sheet');
    doc.sheets = [];
    const workbook = readXml(entries, 'xl/workbook.xml'),
      relationships = Object.fromEntries(
        tags(readXml(entries, 'xl/_rels/workbook.xml.rels'), 'Relationship')
          .filter((r) => r.getAttribute('TargetMode') !== 'External')
          .map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]),
      );
    const shared = entries['xl/sharedStrings.xml']
      ? tags(readXml(entries, 'xl/sharedStrings.xml'), 'si').map((n) => text(n, 't'))
      : [];
    for (const source of tags(workbook, 'sheet')) {
      if (doc.sheets.length >= 20) throw Error('The workbook limit is 20 sheets.');
      const target = relationships[source.getAttributeNS(ns.r, 'id')];
      if (!target || target.includes('..')) throw Error('Unsupported sheet path');
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      const sheet = blankSheet(source.getAttribute('name')),
        data = readXml(entries, path);
      for (const cell of tags(data, 'c')) {
        const key = cell.getAttribute('r'),
          [r, c] = coordinate(key);
        if (r >= LIMITS.rows || c >= LIMITS.columns)
          throw Error('Workbook exceeds 1,000 rows or 100 columns.');
        const formula = tags(cell, 'f')[0],
          raw = text(cell, 'v'),
          type = cell.getAttribute('t');
        sheet.cells[key] = formula
          ? '=' + formula.textContent
          : type === 's'
            ? (shared[Number(raw)] ?? '')
            : type === 'inlineStr'
              ? text(cell, 't')
              : type === 'b'
                ? raw === '1'
                  ? 'TRUE'
                  : 'FALSE'
                : raw;
        sheet.rows = Math.max(sheet.rows, r + 1);
        sheet.columns = Math.max(sheet.columns, c + 1);
      }
      sheet.merges = tags(data, 'mergeCell').map((m) => m.getAttribute('ref'));
      doc.sheets.push(sheet);
    }
  } else {
    doc = newDocument('slides');
    doc.slides = [];
    const presentation = readXml(entries, 'ppt/presentation.xml'),
      relationships = Object.fromEntries(
        tags(readXml(entries, 'ppt/_rels/presentation.xml.rels'), 'Relationship')
          .filter((r) => r.getAttribute('TargetMode') !== 'External')
          .map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]),
      );
    for (const slide of tags(presentation, 'sldId')) {
      if (doc.slides.length >= 100) throw Error('The presentation limit is 100 slides.');
      const target = relationships[slide.getAttributeNS(ns.r, 'id')];
      if (!target || target.includes('..')) throw Error('Unsupported slide path');
      const source = readXml(entries, target.startsWith('/') ? target.slice(1) : 'ppt/' + target);
      const strings = tags(source, 'sp').map((n) =>
        tags(n, 'p')
          .map((p) => text(p, 't'))
          .join('\n'),
      );
      doc.slides.push({
        title: strings[0] || 'Slide',
        body: strings.slice(1).join('\n'),
        layout: 'title-body',
        notes: '',
      });
    }
  }
  doc.title = file.name.replace(/\.[^.]+$/, '') + ' (imported copy)';
  doc.importWarning =
    'Imported editable copy. Complex layouts, drawings, charts, macros, embedded objects and unsupported formatting may be omitted. Keep the original file.';
  return validateDocument(doc);
}
export function validateDocument(input) {
  if (!input || input.studioVersion !== 1 || !['doc', 'sheet', 'slides'].includes(input.kind))
    throw Error('Unsupported Studio document.');
  const doc = newDocument(input.kind);
  doc.title = String(input.title || doc.title).slice(0, 200);
  doc.id = crypto.randomUUID();
  if (input.kind === 'doc') {
    doc.html = sanitizeHtml(String(input.html || ''));
    doc.page = {
      orientation: input.page?.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: Math.max(24, Math.min(100, Number(input.page?.margin) || 56)),
    };
  }
  if (input.kind === 'sheet') {
    if (!Array.isArray(input.sheets) || input.sheets.length < 1 || input.sheets.length > 20)
      throw Error('A workbook needs 1–20 sheets.');
    const names = new Set();
    doc.sheets = input.sheets.map((s, i) => {
      const name = String(s.name || 'Sheet ' + (i + 1))
        .slice(0, 31)
        .replace(/[\\/*?:\[\]]/g, ' ');
      if (names.has(name.toLowerCase())) throw Error('Duplicate sheet names.');
      names.add(name.toLowerCase());
      const sheet = blankSheet(name);
      for (const [key, value] of Object.entries(s.cells || {})) {
        const [r, c] = coordinate(key);
        if (r >= LIMITS.rows || c >= LIMITS.columns || String(value).length > 32000)
          throw Error('Cell exceeds workbook limits.');
        sheet.cells[address(r, c)] = String(value);
        sheet.rows = Math.max(sheet.rows, r + 1);
        sheet.columns = Math.max(sheet.columns, c + 1);
      }
      for (const [key, style] of Object.entries(s.styles || {})) {
        const [r, c] = coordinate(key);
        if (r >= LIMITS.rows || c >= LIMITS.columns) throw Error('Invalid style range');
        const out = {};
        for (const p of ['bold', 'italic', 'underline', 'wrap', 'border'])
          if (style[p]) out[p] = true;
        for (const p of ['color', 'background']) if (color(style[p])) out[p] = style[p];
        if (['left', 'center', 'right'].includes(style.align)) out.align = style.align;
        if (['general', 'number', 'currency', 'percent', 'date'].includes(style.format))
          out.format = style.format;
        sheet.styles[address(r, c)] = out;
      }
      sheet.rows = Math.max(sheet.rows, Math.min(LIMITS.rows, Number(s.rows) || 40));
      sheet.columns = Math.max(sheet.columns, Math.min(LIMITS.columns, Number(s.columns) || 16));
      const covered = new Set();
      sheet.merges = (s.merges || []).map((m) => {
        const parts = String(m).split(':');
        if (parts.length !== 2) throw Error('Invalid merge');
        const [r1, c1] = coordinate(parts[0]),
          [r2, c2] = coordinate(parts[1]);
        if (r2 < r1 || c2 < c1 || r2 >= LIMITS.rows || c2 >= LIMITS.columns)
          throw Error('Invalid merge bounds');
        for (let r = r1; r <= r2; r++)
          for (let c = c1; c <= c2; c++) {
            const k = address(r, c);
            if (covered.has(k)) throw Error('Overlapping merged cells');
            covered.add(k);
          }
        return parts.join(':');
      });
      sheet.charts = (s.charts || []).slice(0, 10).map((ch) => ({
        id: crypto.randomUUID(),
        title: String(ch.title || 'Chart').slice(0, 200),
        range: /^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/.test(ch.range) ? ch.range : 'A1:B2',
        type: ch.type === 'line' ? 'line' : 'bar',
      }));
      sheet.freeze = !!s.freeze;
      return sheet;
    });
  }
  if (input.kind === 'slides') {
    if (!Array.isArray(input.slides) || !input.slides.length || input.slides.length > 100)
      throw Error('A deck needs 1–100 slides.');
    doc.theme = Object.hasOwn(THEMES, input.theme) ? input.theme : 'forest';
    doc.slides = input.slides.map((s) => ({
      title: String(s.title || '').slice(0, 500),
      body: String(s.body || '').slice(0, 10000),
      notes: String(s.notes || '').slice(0, 10000),
      image: safeImage(s.image),
      layout: ['title', 'title-body', 'split'].includes(s.layout) ? s.layout : 'title-body',
    }));
  }
  if (input.importWarning) doc.importWarning = String(input.importWarning).slice(0, 400);
  return doc;
}
export function exportCsv(doc, index = 0) {
  const sheet = doc.sheets[index],
    keys = Object.keys(sheet.cells),
    coords = keys.map(coordinate),
    rows = coords.length ? Math.max(...coords.map((c) => c[0])) + 1 : 1,
    cols = coords.length ? Math.max(...coords.map((c) => c[1])) + 1 : 1,
    cache = new Map();
  return (
    '\uFEFF' +
    delimited(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const v = calculate(doc, index, address(r, c), new Set(), cache);
          return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
        }),
      ),
    )
  );
}
