// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
import { calculate } from './core.js';

export function workbookOf(document) {
  const content = document.content || document;
  return { sheets: content.sheets || [{ name: 'Sheet1', cells: content.cells || {} }] };
}
const plain = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function searchDocuments(documents, query, { limit = 30, kind } = {}) {
  const needle = plain(query)
    .replace(/^(find|search|cauta|caută)\s+/i, '')
    .toLocaleLowerCase();
  if (!needle) return [];
  const results = [];
  const add = (document, location, value) => {
    const text = plain(value),
      index = text.toLocaleLowerCase().indexOf(needle);
    if (index < 0 || results.length >= limit) return;
    results.push({
      id: document.id,
      title: document.title,
      kind: document.kind,
      location,
      excerpt: text.slice(Math.max(0, index - 65), index + needle.length + 140),
    });
  };
  for (const document of documents) {
    if (kind && document.kind !== kind) continue;
    const content = document.content || document;
    add(document, 'Title', document.title);
    if (document.kind === 'sheet') {
      const workbook = workbookOf(document);
      for (const [index, sheet] of workbook.sheets.entries()) {
        const cache = new Map();
        for (const [cell, raw] of Object.entries(sheet.cells || {}).slice(0, 100000)) {
          // Formula results are calculated by the bounded, non-evaluating Studio parser.
          let value = String(raw ?? '');
          if (value.startsWith('=')) {
            try {
              value += ' → ' + calculate(workbook, index, cell, new Set(), cache);
            } catch {}
          }
          add(document, `${sheet.name}!${cell}`, value);
          if (results.length >= limit) return results;
        }
      }
    } else if (document.kind === 'slides') {
      (content.slides || [])
        .slice(0, 500)
        .forEach((slide, index) =>
          add(document, `Slide ${index + 1}`, [slide.title, slide.body, slide.notes].join(' ')),
        );
    } else
      add(document, 'Content', content.html || content.body || content.text || document.body || '');
    if (results.length >= limit) break;
  }
  return results;
}

export function readSheet(document, sheetName, range = 'A1:F20') {
  const workbook = workbookOf(document);
  const index = sheetName ? workbook.sheets.findIndex((sheet) => sheet.name === sheetName) : 0;
  if (index < 0) throw Error('Sheet not found');
  const match = /^([A-Z]{1,3})([1-9]\d{0,3}):([A-Z]{1,3})([1-9]\d{0,3})$/i.exec(range);
  if (!match) throw Error('Use an A1 range such as A1:F20');
  const col = (s) => [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const [left, top, right, bottom] = [col(match[1]), +match[2], col(match[3]), +match[4]];
  if (
    left > right ||
    top > bottom ||
    right > 100 ||
    bottom > 1000 ||
    (right - left + 1) * (bottom - top + 1) > 200
  )
    throw Error('Select at most 200 cells within A1:CV1000');
  const sheet = workbook.sheets[index],
    cache = new Map(),
    cells = [];
  for (let row = top; row <= bottom; row++)
    for (let column = left; column <= right; column++) {
      let label = '',
        n = column;
      while (n) {
        label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
        n = Math.floor((n - 1) / 26);
      }
      const address = label + row,
        raw = sheet.cells?.[address] ?? '';
      let value = raw;
      try {
        value = calculate(workbook, index, address, new Set(), cache);
      } catch {
        value = '#ERROR!';
      }
      cells.push({ address, raw, value });
    }
  return { sheet: sheet.name, range, cells };
}
