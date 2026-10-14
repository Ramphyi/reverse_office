// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
import { mountAssistant, mountNavigation } from './assistant.js';
import {
  clone,
  newDocument,
  blankSheet,
  column,
  address,
  coordinate,
  rectangle,
  rangeKeys,
  calculate,
  display,
  parseDelimited,
  delimited,
  translateFormula,
  FUNCTIONS,
  LIMITS,
} from './core.js';
import {
  sanitizeHtml,
  safeImage,
  importFile,
  validateDocument,
  docx,
  xlsx,
  pptx,
  exportCsv,
  THEMES,
} from './formats.js';
const root = document.querySelector('#app'),
  embedded = new URLSearchParams(location.search).has('embedded');
let doc = null,
  documents = [],
  savedRevision = 0,
  dirty = false,
  saveTimer,
  saveFlight = null,
  savedGeneration = 0,
  generation = 0,
  history = [],
  future = [],
  lastHistory = 0,
  activeTab = 'Home',
  slideIndex = 0,
  selection = ['A1', 'A1'],
  editorRange = null,
  copied = null,
  bridgeReady = false,
  pendingBridgeSave = null,
  filterText = '',
  theme = 'light';
try {
  theme = localStorage.getItem('reverse-studio-theme') || 'light';
} catch {}
document.documentElement.dataset.theme = theme;
const $ = (s, p = document) => p.querySelector(s);
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      n.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return n;
}
const button = (label, action, attrs = {}) =>
  el(
    'button',
    {
      type: 'button',
      ...attrs,
      onClick: async (e) => {
        try {
          await action(e);
        } catch (error) {
          notify(error.message);
        }
      },
    },
    label,
  );
const select = (label, values, value, action) =>
  el(
    'select',
    {
      'aria-label': label,
      onChange: (e) => {
        try {
          action(e.target.value);
        } catch (error) {
          notify(error.message);
        }
      },
    },
    values.map((v) => {
      const [key, name] = Array.isArray(v) ? v : [v, v];
      return el('option', { value: key, selected: key === value }, name);
    }),
  );
function notify(message) {
  const n = $('#notice');
  n.textContent = message;
  n.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => n.classList.remove('visible'), 6500);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = el('a', { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function documentName(extension) {
  return (doc.title.replace(/[<>:"/\\|?*]/g, '_') || 'Untitled') + '.' + extension;
}
function setTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('reverse-studio-theme', theme);
  } catch {}
  if (!doc) renderHome();
}
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('reverse-studio', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('documents', { keyPath: 'id' });
    request.result.createObjectStore('originals');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function readAll() {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction('documents').objectStore('documents').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function writeLocal(snapshot, expected) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite'),
      store = tx.objectStore('documents'),
      read = store.get(snapshot.id);
    let conflict = false;
    read.onsuccess = () => {
      if ((read.result?.revision || 0) !== expected) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put({ ...snapshot, revision: expected + 1 });
    };
    tx.oncomplete = () => resolve(expected + 1);
    tx.onabort = () =>
      reject(
        Error(
          conflict
            ? 'This document changed in another tab. Download a JSON backup of your edits, then reopen the saved version.'
            : tx.error?.message || 'Could not save. Download a JSON backup.',
        ),
      );
    tx.onerror = () => {};
  });
}
async function original(id, file) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('originals', file ? 'readwrite' : 'readonly'),
      store = tx.objectStore('originals');
    let result;
    if (file) store.put(file, id);
    else {
      const r = store.get(id);
      r.onsuccess = () => (result = r.result);
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
function markChanged() {
  dirty = true;
  generation++;
  doc.updated = new Date().toISOString();
  updateStatus();
  if (embedded) parent.postMessage({ type: 'studio:dirty', dirty: true }, location.origin);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch((e) => notify(e.message)), 1000);
}
function remember(group = false) {
  if (!doc) return;
  const now = Date.now();
  if (!group || now - lastHistory > 700) {
    history.push(clone(doc));
    if (history.length > 50) history.shift();
    future = [];
  }
  lastHistory = now;
}
function change(action, { render = true, group = false } = {}) {
  remember(group);
  action();
  markChanged();
  if (render) renderEditor();
}
async function persist() {
  if (!doc || !dirty) return true;
  if (saveFlight) {
    await saveFlight;
    if (dirty) return persist();
    return true;
  }
  const snapshot = clone(doc),
    atGeneration = generation;
  updateStatus('Saving…');
  saveFlight = (async () => {
    if (embedded) {
      if (!bridgeReady) throw Error('The workspace connection is not ready.');
      await new Promise((resolve, reject) => {
        const token = crypto.randomUUID(),
          timer = setTimeout(() => {
            pendingBridgeSave = null;
            reject(Error('Workspace save timed out. Download a JSON backup and retry.'));
          }, 20000);
        pendingBridgeSave = {
          token,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (message) => {
            clearTimeout(timer);
            reject(Error(message));
          },
        };
        parent.postMessage({ type: 'studio:save', token, document: snapshot }, location.origin);
      });
    } else savedRevision = await writeLocal(snapshot, savedRevision);
    savedGeneration = atGeneration;
    dirty = generation !== savedGeneration;
    if (embedded) parent.postMessage({ type: 'studio:dirty', dirty }, location.origin);
    updateStatus();
  })();
  try {
    await saveFlight;
    return true;
  } catch (e) {
    updateStatus('Save failed — export a backup');
    throw e;
  } finally {
    saveFlight = null;
  }
}
function updateStatus(message) {
  const label = $('.save-label');
  if (label)
    label.textContent =
      message ||
      (dirty ? 'Saving changes…' : embedded ? 'Saved to workspace' : 'Saved in this browser');
  const status = $('.status-summary');
  if (status && doc) {
    if (doc.kind === 'doc') {
      const content = $('.paper')?.innerText || '',
        words = content.trim().split(/\s+/).filter(Boolean).length;
      status.textContent = words + ' words · ' + content.length + ' characters';
    } else if (doc.kind === 'sheet') {
      const keys = rangeKeys(...selection),
        nums = keys
          .map((k) => calculate(doc, doc.activeSheet || 0, k))
          .filter((v) => typeof v === 'number');
      status.textContent = `${selection[0]}${selection[1] !== selection[0] ? ':' + selection[1] : ''} · ${keys.length} cells${nums.length ? ' · Sum ' + display(nums.reduce((a, b) => a + b, 0)) + ' · Average ' + display(nums.reduce((a, b) => a + b, 0) / nums.length) : ''}`;
    } else status.textContent = `Slide ${slideIndex + 1} of ${doc.slides.length} · 16:9`;
  }
}
async function openDocument(value) {
  if (doc && dirty) await persist();
  doc = value;
  savedRevision = doc.revision || 0;
  generation = 0;
  savedGeneration = 0;
  dirty = false;
  history = [];
  future = [];
  slideIndex = 0;
  selection = ['A1', 'A1'];
  activeTab = 'Home';
  renderEditor();
}
async function create(kind, template) {
  const value = newDocument(kind, template);
  await openDocument(value);
  markChanged();
  await persist();
}
async function home() {
  if (dirty) await persist();
  if (embedded) {
    parent.postMessage({ type: 'studio:close' }, location.origin);
    return;
  }
  doc = null;
  documents = await readAll();
  renderHome();
}
async function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0]));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
async function importDocument() {
  const file = await chooseFile('.docx,.xlsx,.pptx,.json,.csv,.tsv,.txt,.html,.htm');
  if (!file) return;
  const value = await importFile(file);
  if (embedded) {
    parent.postMessage({ type: 'studio:import', document: value }, location.origin);
    return;
  }
  value.originalName = file.name;
  await original(value.id, file);
  await openDocument(value);
  markChanged();
  await persist();
  if (value.importWarning) notify(value.importWarning);
}
async function backupOriginal() {
  const file = await original(doc.id);
  if (file) download(file, doc.originalName || 'original');
  else notify('The original is available in the company workspace or your source file.');
}
function renderHome() {
  const filtered = documents
    .filter((d) => d.title.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  root.replaceChildren(
    el(
      'nav',
      { class: 'home-nav' },
      el(
        'div',
        { class: 'brand' },
        el('span', { class: 'mark' }, 'ro'),
        'reverse',
        el('i', {}, 'STUDIO'),
      ),
      el('span', { class: 'grow' }),
      button(theme === 'dark' ? '☀ Light' : '◐ Dark', setTheme),
      button('Help', showHelp),
      button('↑ Import file', importDocument, { class: 'primary' }),
    ),
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { class: 'hero' },
        el(
          'div',
          {},
          el('span', { class: 'eyebrow' }, 'A little space. A lot of possibility.'),
          el('h1', {}, 'Make room for\nyour best work.'),
          el(
            'p',
            {},
            'Write a proposal. Explore the numbers. Present the next big idea. Familiar tools, an uncluttered workspace, and files you can take with you.',
          ),
        ),
        el(
          'aside',
          { class: 'privacy' },
          el('strong', {}, 'Your files stay with you.'),
          'Documents save in this browser. Export backups to keep them safe. Optional agents send requested context to your chosen AI provider only when you press Send. No account is required.',
        ),
      ),
      el(
        'section',
        { class: 'app-cards' },
        [
          [
            'doc',
            'W',
            'Writer',
            'From the first line to the final draft.',
            'Rich text · tables · images · DOCX',
          ],
          [
            'sheet',
            'S',
            'Sheets',
            'Make the numbers tell their story.',
            'Formulas · ranges · charts · XLSX',
          ],
          [
            'slides',
            'P',
            'Slides',
            'Give your ideas a little more space.',
            'Themes · pictures · presenter · PPTX',
          ],
        ].map(([kind, glyph, name, description, features]) =>
          el(
            'button',
            { class: 'app-card', onClick: () => create(kind).catch((e) => notify(e.message)) },
            el('div', { class: 'app-glyph ' + kind }, glyph),
            el('h2', {}, name),
            el('p', {}, description),
            el('footer', {}, features, el('span', {}, '↗')),
          ),
        ),
      ),
      el('div', { class: 'section-title' }, el('h2', {}, 'A head start')),
      el(
        'div',
        { class: 'templates' },
        button('▤ Project report', () => create('doc', 'report')),
        button('✉ Business letter', () => create('doc', 'letter')),
        button('▦ Project budget', () => create('sheet', 'budget')),
        button('▣ Project pitch', () => create('slides', 'pitch')),
      ),
      el(
        'div',
        { class: 'section-title' },
        el('h2', {}, 'Your recent work'),
        el('span', { class: 'muted small' }, documents.length + ' files'),
        el('span', { class: 'grow' }),
        el('input', {
          class: 'search',
          placeholder: 'Search documents',
          'aria-label': 'Search documents',
          value: filterText,
          onInput: (e) => {
            filterText = e.target.value;
            const start = e.target.selectionStart;
            renderHome();
            const input = $('.search');
            input.focus();
            input.setSelectionRange(start, start);
          },
        }),
      ),
      el(
        'section',
        { class: 'doc-list' },
        filtered.length
          ? filtered
              .map((d) =>
                el(
                  'div',
                  { class: 'doc-row' },
                  el(
                    'div',
                    { class: 'app-glyph ' + d.kind },
                    d.kind === 'doc' ? 'W' : d.kind === 'sheet' ? 'S' : 'P',
                  ),
                  button('', () => openDocument(clone(d)), {
                    class: 'doc-open',
                    'aria-label': 'Open ' + d.title,
                  }),
                  el('span', { class: 'muted small' }, new Date(d.updated).toLocaleDateString()),
                  button('Duplicate', async () => {
                    const copy = validateDocument(d);
                    copy.title = d.title + ' (copy)';
                    await openDocument(copy);
                    markChanged();
                    await persist();
                  }),
                  button('Delete', async () => {
                    if (
                      !confirm(
                        'Delete “' +
                          d.title +
                          '” from this browser? Export a backup first if needed.',
                      )
                    )
                      return;
                    const db = await database;
                    await new Promise((resolve, reject) => {
                      const tx = db.transaction(['documents', 'originals'], 'readwrite');
                      tx.objectStore('documents').delete(d.id);
                      tx.objectStore('originals').delete(d.id);
                      tx.oncomplete = resolve;
                      tx.onerror = () => reject(tx.error);
                    });
                    await home();
                  }),
                ),
              )
              .map((row, i) => {
                row
                  .querySelector('.doc-open')
                  .append(
                    el('strong', {}, filtered[i].title),
                    el(
                      'small',
                      {},
                      filtered[i].kind === 'doc'
                        ? 'Writer document'
                        : filtered[i].kind === 'sheet'
                          ? 'Sheets workbook'
                          : 'Slides presentation',
                    ),
                  );
                return row;
              })
          : el(
              'div',
              { class: 'empty' },
              'Your next project starts here. Create a document or import a file.',
            ),
      ),
      el(
        'p',
        { class: 'footer-note' },
        'Independent software by Reverse Office. Original Studio code is MIT licensed. Browser and host software are supplied by you. Office import creates an editable copy with documented format limits. ',
        el('a', { href: './LICENSE', download: 'LICENSE' }, 'License'),
      ),
    ),
  );
}
function renderEditor() {
  if (!doc) return;
  const kindName = { doc: 'Writer', sheet: 'Sheets', slides: 'Slides' }[doc.kind],
    tabs =
      doc.kind === 'doc'
        ? ['Home', 'Insert', 'Layout']
        : doc.kind === 'sheet'
          ? ['Home', 'Insert', 'Data', 'Formulas']
          : ['Home', 'Insert', 'Design'];
  if (!tabs.includes(activeTab)) activeTab = 'Home';
  const exports =
    doc.kind === 'doc'
      ? [
          ['docx', 'Word (.docx)'],
          ['html', 'Web page (.html)'],
          ['txt', 'Plain text (.txt)'],
        ]
      : doc.kind === 'sheet'
        ? [
            ['xlsx', 'Excel (.xlsx)'],
            ['csv', 'CSV (active sheet)'],
          ]
        : [['pptx', 'PowerPoint (.pptx)']];
  root.replaceChildren(
    el(
      'header',
      { class: 'topbar' },
      button('←', home, { 'aria-label': 'Back to documents' }),
      el('div', { class: 'brand' }, el('span', { class: 'mark' }, 'ro')),
      el('span', { class: 'muted small' }, kindName),
      el('input', {
        class: 'title',
        'aria-label': 'Document title',
        value: doc.title,
        onInput: (e) => {
          remember(true);
          doc.title = e.target.value.slice(0, 200);
          markChanged();
        },
      }),
      el('span', { class: 'save-label' }, ''),
      el('span', { class: 'grow' }),
      button('Undo', undo, { 'aria-label': 'Undo' }),
      button('Redo', redo, { 'aria-label': 'Redo' }),
      button('◐', setTheme, { 'aria-label': 'Toggle dark mode' }),
      button('?', showHelp, { 'aria-label': 'Help' }),
      select(
        'Export document',
        [
          ['', 'Export ↓'],
          ...exports,
          ['pdf', 'Print / Save PDF'],
          ['json', 'Studio backup (.json)'],
        ],
        '',
        async (value) => {
          await exportDocument(value);
          const s = $('[aria-label="Export document"]');
          if (s) s.value = '';
        },
      ),
      button('Save', persist, { class: 'primary' }),
    ),
    el(
      'section',
      { class: 'ribbon' },
      el(
        'nav',
        { class: 'ribbon-tabs', 'aria-label': 'Editor tools' },
        tabs.map((tab) =>
          button(
            tab,
            () => {
              activeTab = tab;
              renderToolbar();
              $('.ribbon-tabs')
                .querySelectorAll('button')
                .forEach((b) => b.classList.toggle('active', b.textContent === tab));
            },
            { class: activeTab === tab ? 'active' : '' },
          ),
        ),
      ),
      el('div', { class: 'toolbar' }),
    ),
    doc.importWarning
      ? el(
          'div',
          { class: 'import-warning' },
          el('span', {}, doc.importWarning),
          !embedded && doc.originalName ? button('Download original', backupOriginal) : null,
          button('Dismiss', () => change(() => delete doc.importWarning)),
        )
      : document.createTextNode(''),
    el('main', { class: 'workspace' }),
    el(
      'footer',
      { class: 'statusbar' },
      el('span', { class: 'status-summary' }),
      el('span', { class: 'grow' }),
      el('span', {}, embedded ? 'Company workspace' : 'Local to this browser'),
      el('span', {}, 'Reverse Studio'),
    ),
  );
  renderToolbar();
  if (doc.kind === 'doc') renderWriter();
  else if (doc.kind === 'sheet') renderSheet();
  else renderSlides();
  updateStatus();
  if (doc.importWarning) $('.workspace').style.height = 'calc(100vh - 245px)';
}
function undo() {
  if (!history.length) return;
  future.push(clone(doc));
  doc = history.pop();
  markChanged();
  renderEditor();
}
function redo() {
  if (!future.length) return;
  history.push(clone(doc));
  doc = future.pop();
  markChanged();
  renderEditor();
}
const divider = () => el('span', { class: 'divider' });
function tool(label, action, attrs = {}) {
  return button(label, action, { onMousedown: (e) => e.preventDefault(), ...attrs });
}
function renderToolbar() {
  const toolbar = $('.toolbar');
  toolbar.replaceChildren(
    ...(doc.kind === 'doc' ? writerTools() : doc.kind === 'sheet' ? sheetTools() : slideTools()),
  );
}
function showDialog(title, description, fields, onSubmit, submitLabel = 'Apply') {
  const form = el('form'),
    dialog = el('dialog', { class: 'dialog' }, form),
    inputs = {};
  form.append(el('h2', {}, title), el('p', {}, description));
  for (const field of fields) {
    const input = field.options
      ? select(field.label, field.options, field.value, () => {})
      : el('input', {
          type: field.type || 'text',
          value: field.value ?? '',
          required: field.required,
          min: field.min,
          max: field.max,
          maxlength: field.maxlength || 200,
        });
    input.setAttribute('aria-label', field.label);
    inputs[field.name] = input;
    form.append(el('label', {}, field.label, input));
  }
  const error = el('p', { class: 'error', role: 'alert' });
  form.append(
    error,
    el(
      'footer',
      {},
      button('Cancel', () => dialog.close()),
      el('button', { class: 'primary', type: 'submit' }, submitLabel),
    ),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    dialog.close();
    try {
      await onSubmit(
        Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])),
      );
    } catch (e) {
      error.textContent = e.message;
      if (!dialog.isConnected) document.body.append(dialog);
      dialog.showModal();
    }
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  Object.values(inputs)[0]?.focus();
  return dialog;
}
function showHelp() {
  const dialog = el(
    'dialog',
    { class: 'dialog' },
    el('h2', {}, 'A workspace you can work in.'),
    el(
      'div',
      { class: 'help-content' },
      el('h3', {}, 'Writer'),
      el(
        'p',
        {},
        'Format selected text, insert pictures and tables, edit table rows and columns, choose page margins and export DOCX. Paste is sanitized. Ctrl+B / I / U apply formatting.',
      ),
      el('h3', {}, 'Sheets'),
      el(
        'p',
        {},
        'Click or drag a range. Shift+click extends it. Enter A1:D8 in the address box. Double-click, F2 or type to edit; Enter commits. Ctrl+C / V copies a rectangle. Fill down/right adjusts relative references; $A$1 stays fixed. Merge preserves the top-left cell and asks before removing other values. Data tools sort values, find text, and add rows or columns. Chart ranges use a header row and labels in the first column.',
      ),
      el('p', {}, 'Functions: ' + FUNCTIONS.join(', ')),
      el(
        'p',
        {},
        "Cross-sheet formulas: =SUM('Sheet 2'!B2:B8). VLOOKUP and MATCH support exact matches only. Limit: 20 sheets, 1,000 rows × 100 columns. Unsupported formulas display an error and export as inert text.",
      ),
      el('h3', {}, 'Slides'),
      el(
        'p',
        {},
        'Add, duplicate, reorder and delete slides. Choose a theme and layout, add a picture and speaker notes, then present with arrow keys. Escape exits. Export an editable PPTX. Limit: 100 slides.',
      ),
      el('h3', {}, 'Files and privacy'),
      el(
        'p',
        {},
        'Standalone documents are saved in IndexedDB in this browser. This is local storage, not a company cloud drive. Clearing browser data removes these copies. Download Studio JSON backups to preserve all supported features. Imported Office files are retained separately; importing makes a simplified editable copy. DOCX import preserves basic text, tables and images; XLSX import preserves cell values, formulas and merges; PPTX import extracts text. Advanced objects and format fidelity are not guaranteed. Bar and line charts export as editable XLSX chart objects. Studio JSON preserves the complete editor model.',
      ),
      el(
        'p',
        {},
        'Save PDF uses the browser print dialog. This Studio does not apply certificate-based digital signatures, run AI models, send mail or host meetings. Those remain separate company-suite services. No Microsoft, Adobe or ONLYOFFICE code or bundled assets are included.',
      ),
    ),
    el(
      'footer',
      {},
      button('Close', () => dialog.close(), { class: 'primary' }),
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
function writerTools() {
  if (activeTab === 'Home')
    return [
      select(
        'Text style',
        [
          ['p', 'Normal text'],
          ['h1', 'Heading 1'],
          ['h2', 'Heading 2'],
          ['h3', 'Heading 3'],
          ['blockquote', 'Quote'],
        ],
        'p',
        (v) => command('formatBlock', v),
      ),
      select(
        'Font family',
        [
          ['Arial', 'Sans serif'],
          ['Georgia', 'Serif'],
          ['monospace', 'Monospace'],
        ],
        'Arial',
        (v) => command('fontName', v),
      ),
      select(
        'Font size',
        [
          ['2', 'Small'],
          ['3', 'Normal'],
          ['4', 'Large'],
          ['5', 'Title'],
        ],
        '3',
        (v) => command('fontSize', v),
      ),
      divider(),
      tool('B', () => command('bold'), { 'aria-label': 'Bold', style: { fontWeight: 'bold' } }),
      tool('I', () => command('italic'), {
        'aria-label': 'Italic',
        style: { fontStyle: 'italic' },
      }),
      tool('U', () => command('underline'), {
        'aria-label': 'Underline',
        style: { textDecoration: 'underline' },
      }),
      tool('S̶', () => command('strikeThrough'), { 'aria-label': 'Strikethrough' }),
      el(
        'label',
        {},
        'Text',
        el('input', {
          type: 'color',
          value: '#223a33',
          'aria-label': 'Text color',
          onInput: (e) => command('foreColor', e.target.value),
        }),
      ),
      el(
        'label',
        {},
        'Highlight',
        el('input', {
          type: 'color',
          value: '#fff2a6',
          'aria-label': 'Highlight color',
          onInput: (e) => command('hiliteColor', e.target.value),
        }),
      ),
      divider(),
      tool('Left', () => command('justifyLeft')),
      tool('Center', () => command('justifyCenter')),
      tool('Right', () => command('justifyRight')),
      tool('• List', () => command('insertUnorderedList')),
      tool('1. List', () => command('insertOrderedList')),
      tool('Indent', () => command('indent')),
      tool('Outdent', () => command('outdent')),
      tool('Clear format', () => command('removeFormat')),
    ];
  if (activeTab === 'Insert')
    return [
      tool('Image', insertWriterImage),
      tool('Table', () =>
        showDialog(
          'Insert a table',
          'Choose the number of rows and columns.',
          [
            { name: 'rows', label: 'Rows', type: 'number', value: 3, min: 1, max: 30 },
            { name: 'cols', label: 'Columns', type: 'number', value: 3, min: 1, max: 20 },
          ],
          ({ rows, cols }) => {
            const r = Number(rows),
              c = Number(cols);
            if (r < 1 || r > 30 || c < 1 || c > 20) throw Error('Use 1–30 rows and 1–20 columns.');
            command(
              'insertHTML',
              '<table><tbody>' +
                Array.from(
                  { length: r },
                  () => '<tr>' + Array(c).fill('<td><p><br></p></td>').join('') + '</tr>',
                ).join('') +
                '</tbody></table><p><br></p>',
            );
          },
        ),
      ),
      tool('Link', () =>
        showDialog(
          'Insert a link',
          'Select text first, then enter a web or email address.',
          [{ name: 'url', label: 'URL', required: true, value: 'https://' }],
          ({ url }) => {
            if (!/^(https?:\/\/|mailto:)/i.test(url))
              throw Error('Use an https, http or mailto link.');
            command('createLink', url);
          },
        ),
      ),
      tool('Remove link', () => command('unlink')),
      tool('Divider', () => command('insertHorizontalRule')),
      divider(),
      tool('Row below', () => tableAction('row')),
      tool('Column right', () => tableAction('column')),
      tool('Delete row', () => tableAction('delete-row')),
      tool('Delete table', () => tableAction('delete')),
    ];
  return [
    select(
      'Page orientation',
      [
        ['portrait', 'Portrait'],
        ['landscape', 'Landscape'],
      ],
      doc.page?.orientation || 'portrait',
      (v) => change(() => (doc.page = { ...doc.page, orientation: v })),
    ),
    select(
      'Page margins',
      [
        ['32', 'Narrow margins'],
        ['56', 'Normal margins'],
        ['80', 'Wide margins'],
      ],
      String(doc.page?.margin || 56),
      (v) => change(() => (doc.page = { ...doc.page, margin: Number(v) })),
    ),
    tool('Find & replace', writerFind),
    tool('Print / PDF', printDocument),
  ];
}
function renderWriter() {
  const paper = el('article', {
    class: 'paper ' + (doc.page?.orientation || ''),
    contenteditable: 'true',
    role: 'textbox',
    'aria-label': 'Document body',
    'aria-multiline': 'true',
    spellcheck: true,
    html: sanitizeHtml(doc.html),
    style: { padding: (doc.page?.margin || 56) + 'px' },
  });
  paper.addEventListener('input', () => {
    remember(true);
    doc.html = sanitizeHtml(paper.innerHTML);
    markChanged();
  });
  paper.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'),
      text = e.clipboardData.getData('text/plain');
    if (html) command('insertHTML', sanitizeHtml(html));
    else command('insertText', text);
  });
  paper.addEventListener('drop', (e) => e.preventDefault());
  $('.workspace').append(el('div', { class: 'writer-wrap' }, paper));
}
document.addEventListener('selectionchange', () => {
  const paper = $('.paper');
  const s = window.getSelection();
  if (paper && s?.rangeCount && paper.contains(s.anchorNode))
    editorRange = s.getRangeAt(0).cloneRange();
});
function restoreSelection() {
  const paper = $('.paper');
  paper?.focus();
  if (editorRange && paper?.contains(editorRange.commonAncestorContainer)) {
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(editorRange);
  }
}
function command(name, value) {
  restoreSelection();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(name, false, value);
  const paper = $('.paper');
  if (paper) {
    remember(true);
    doc.html = sanitizeHtml(paper.innerHTML);
    markChanged();
  }
}
async function readImage() {
  const file = await chooseFile('image/png,image/jpeg,image/webp');
  if (!file) return null;
  if (file.size > 8 * 1024 * 1024) throw Error('Choose an image smaller than 8 MB.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40000000) {
    bitmap.close();
    throw Error('Image dimensions are too large.');
  }
  const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}
async function insertWriterImage() {
  const src = await readImage();
  if (src)
    command(
      'insertHTML',
      '<img src="' + src + '" alt="Inserted image" style="width:420px;max-width:100%"><p><br></p>',
    );
}
function tableAction(action) {
  restoreSelection();
  const sel = window.getSelection(),
    node = sel?.anchorNode,
    element = node?.nodeType === 1 ? node : node?.parentElement,
    cell = element?.closest('td,th'),
    table = element?.closest('table');
  if (!table || !$('.paper').contains(table)) throw Error('Place the cursor inside a table first.');
  remember();
  if (action === 'delete') table.remove();
  else if (action === 'delete-row') {
    cell?.parentElement.remove();
    if (!table.rows.length) table.remove();
  } else if (action === 'row') {
    const row = cell?.parentElement;
    if (!row) throw Error('Select a cell first.');
    const next = row.cloneNode(true);
    next.querySelectorAll('td,th').forEach((c) => (c.innerHTML = '<p><br></p>'));
    row.after(next);
  } else {
    if (!cell) throw Error('Select a cell first.');
    const index = cell.cellIndex;
    for (const row of table.rows) {
      const td = document.createElement('td');
      td.innerHTML = '<p><br></p>';
      row.cells[index]?.after(td);
    }
  }
  doc.html = sanitizeHtml($('.paper').innerHTML);
  markChanged();
}
function writerFind() {
  showDialog(
    'Find & replace',
    'Replace literal text throughout the document. Formatting is preserved within each text run.',
    [
      { name: 'find', label: 'Find', required: true },
      { name: 'replace', label: 'Replace with' },
    ],
    ({ find, replace }) => {
      remember();
      const paper = $('.paper'),
        walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
      let count = 0,
        node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(find)) {
          count += node.textContent.split(find).length - 1;
          node.textContent = node.textContent.split(find).join(replace);
        }
      }
      doc.html = sanitizeHtml(paper.innerHTML);
      markChanged();
      notify(count + ' replacements');
    },
  );
}
const sheet = () => doc.sheets[doc.activeSheet || 0];
function styleCells(property, value) {
  change(() => {
    for (const key of rangeKeys(...selection))
      sheet().styles[key] = { ...sheet().styles[key], [property]: value };
  });
}
function sheetTools() {
  if (activeTab === 'Home')
    return [
      tool('B', () => styleCells('bold', !sheet().styles[selection[0]]?.bold), {
        'aria-label': 'Bold cells',
        style: { fontWeight: 'bold' },
      }),
      tool('I', () => styleCells('italic', !sheet().styles[selection[0]]?.italic), {
        'aria-label': 'Italic cells',
        style: { fontStyle: 'italic' },
      }),
      tool('U', () => styleCells('underline', !sheet().styles[selection[0]]?.underline), {
        'aria-label': 'Underline cells',
      }),
      el(
        'label',
        {},
        'Fill',
        el('input', {
          type: 'color',
          value: sheet().styles[selection[0]]?.background || '#e5f3ed',
          'aria-label': 'Cell fill color',
          onChange: (e) => styleCells('background', e.target.value),
        }),
      ),
      el(
        'label',
        {},
        'Text',
        el('input', {
          type: 'color',
          value: sheet().styles[selection[0]]?.color || '#223a33',
          'aria-label': 'Cell text color',
          onChange: (e) => styleCells('color', e.target.value),
        }),
      ),
      divider(),
      select(
        'Number format',
        [
          ['general', 'General'],
          ['number', 'Number · 2 decimals'],
          ['currency', 'Currency · EUR'],
          ['percent', 'Percentage'],
          ['date', 'Date'],
        ],
        sheet().styles[selection[0]]?.format || 'general',
        (v) => styleCells('format', v),
      ),
      select(
        'Cell alignment',
        [
          ['left', 'Align left'],
          ['center', 'Align center'],
          ['right', 'Align right'],
        ],
        sheet().styles[selection[0]]?.align || 'left',
        (v) => styleCells('align', v),
      ),
      tool('Borders', () => styleCells('border', !sheet().styles[selection[0]]?.border)),
      tool('Wrap text', () => styleCells('wrap', !sheet().styles[selection[0]]?.wrap)),
      divider(),
      tool('Merge cells', mergeCells),
      tool('Unmerge', unmergeCells),
      tool('Clear values', () =>
        change(() => {
          for (const key of rangeKeys(...selection)) delete sheet().cells[key];
        }),
      ),
      tool('Clear format', () =>
        change(() => {
          for (const key of rangeKeys(...selection)) delete sheet().styles[key];
        }),
      ),
    ];
  if (activeTab === 'Insert')
    return [
      tool('Bar chart', () => addChart('bar')),
      tool('Line chart', () => addChart('line')),
      divider(),
      tool('Add worksheet', () => {
        if (doc.sheets.length >= 20) throw Error('Maximum 20 worksheets.');
        let n = doc.sheets.length + 1;
        while (doc.sheets.some((s) => s.name === 'Sheet ' + n)) n++;
        change(() => {
          doc.sheets.push(blankSheet('Sheet ' + n));
          doc.activeSheet = doc.sheets.length - 1;
          selection = ['A1', 'A1'];
        });
      }),
      tool('Rename worksheet', renameSheet),
      tool('Delete worksheet', deleteSheet),
      divider(),
      tool('Add 20 rows', () =>
        change(() => (sheet().rows = Math.min(LIMITS.rows, sheet().rows + 20))),
      ),
      tool('Add 5 columns', () =>
        change(() => (sheet().columns = Math.min(LIMITS.columns, sheet().columns + 5))),
      ),
    ];
  if (activeTab === 'Data')
    return [
      tool('Sort A → Z', () => sortRange(false)),
      tool('Sort Z → A', () => sortRange(true)),
      divider(),
      tool('Fill down', () => fillRange('down')),
      tool('Fill right', () => fillRange('right')),
      tool('Find cell', () =>
        showDialog(
          'Find in this sheet',
          'Search displayed values or formulas.',
          [{ name: 'find', label: 'Find', required: true }],
          ({ find }) => {
            const key = Object.keys(sheet().cells).find((k) =>
              String(sheet().cells[k]).toLowerCase().includes(find.toLowerCase()),
            );
            if (!key) throw Error('No matching cell.');
            selection = [key, key];
            renderSheet();
            $(`[data-cell="${key}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
          },
        ),
      ),
      divider(),
      tool(sheet().freeze ? 'Unfreeze header' : 'Freeze first row', () =>
        change(() => (sheet().freeze = !sheet().freeze)),
      ),
      tool('Import file', importDocument),
    ];
  return [
    select('Insert function', [['', 'Choose a function'], ...FUNCTIONS], '', (name) => {
      if (!name) return;
      const input = $('.formula-input');
      input.value = '=' + name + '(';
      input.focus();
    }),
    tool('AutoSum', () => {
      const [r, c] = coordinate(selection[0]);
      if (!r) throw Error('Select a cell below the numbers to sum.');
      change(() => (sheet().cells[selection[0]] = `=SUM(${address(0, c)}:${address(r - 1, c)})`));
    }),
    el(
      'span',
      { class: 'muted small' },
      'Use =SUM(A1:A5), =IF(B2>0,"Yes","No") or =\'Sheet 2\'!A1. No macros or external formulas.',
    ),
  ];
}
function mergeCells() {
  const keys = rangeKeys(...selection);
  if (keys.length < 2) throw Error('Select at least two cells to merge.');
  const chosen = new Set(keys),
    s = sheet();
  if (s.merges.some((m) => rangeKeys(...m.split(':')).some((k) => chosen.has(k))))
    throw Error('Unmerge overlapping cells first.');
  const [r1, c1, r2, c2] = rectangle(...selection),
    first = address(r1, c1);
  if (keys.some((k) => k !== first && s.cells[k] !== undefined && s.cells[k] !== ''))
    if (!confirm('Merging keeps only ' + first + '. Remove values from the other selected cells?'))
      return;
  change(() => {
    for (const key of keys) if (key !== first) delete s.cells[key];
    s.merges.push(first + ':' + address(r2, c2));
    selection = [first, first];
  });
}
function unmergeCells() {
  const chosen = new Set(rangeKeys(...selection));
  change(
    () =>
      (sheet().merges = sheet().merges.filter(
        (m) => !rangeKeys(...m.split(':')).some((k) => chosen.has(k)),
      )),
  );
}
function renameSheet() {
  showDialog(
    'Rename worksheet',
    'Sheet names must be unique. Existing formula references are updated.',
    [{ name: 'name', label: 'Worksheet name', value: sheet().name, required: true, maxlength: 31 }],
    ({ name }) => {
      name = name.trim();
      if (
        !name ||
        /[\\/*?:\[\]']/.test(name) ||
        doc.sheets.some((s) => s !== sheet() && s.name.toLowerCase() === name.toLowerCase())
      )
        throw Error('Choose a unique name without / \ : * ? [ ] or apostrophes.');
      const old = sheet().name;
      change(() => {
        for (const s of doc.sheets)
          for (const key of Object.keys(s.cells))
            if (String(s.cells[key]).startsWith('='))
              s.cells[key] = s.cells[key].replace(
                /"(?:[^"]|"")*"|'(?:[^']|'')*'!|[A-Za-z_][A-Za-z_0-9.]*!/g,
                (part) =>
                  part.startsWith('"')
                    ? part
                    : part.slice(0, -1).replace(/^'|'$/g, '').toLowerCase() === old.toLowerCase()
                      ? "'" + name + "'!"
                      : part,
              );
        sheet().name = name;
      });
    },
  );
}
function deleteSheet() {
  if (doc.sheets.length === 1) throw Error('Keep at least one worksheet.');
  if (
    !confirm('Delete worksheet “' + sheet().name + '”? Formulas referring to it will show #REF!.')
  )
    return;
  change(() => {
    doc.sheets.splice(doc.activeSheet || 0, 1);
    doc.activeSheet = Math.max(0, (doc.activeSheet || 0) - 1);
    selection = ['A1', 'A1'];
  });
}
function sortRange(descending) {
  const [r1, c1, r2, c2] = rectangle(...selection);
  if (r1 === r2)
    throw Error('Select multiple rows to sort; the first selected column is the sort key.');
  const keys = new Set(rangeKeys(...selection));
  if (sheet().merges.some((m) => rangeKeys(...m.split(':')).some((k) => keys.has(k))))
    throw Error('Unmerge cells before sorting.');
  if ([...keys].some((k) => String(sheet().cells[k] || '').startsWith('=')))
    throw Error('Sorting formula cells is not supported. Select a values-only range.');
  change(() => {
    const rows = [];
    for (let r = r1; r <= r2; r++)
      rows.push(
        Array.from({ length: c2 - c1 + 1 }, (_, c) => ({
          value: sheet().cells[address(r, c1 + c)] || '',
          style: clone(sheet().styles[address(r, c1 + c)] || {}),
        })),
      );
    rows.sort((a, b) => {
      const x = a[0].value,
        y = b[0].value,
        result =
          x !== '' && y !== '' && Number.isFinite(+x) && Number.isFinite(+y)
            ? +x - +y
            : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return descending ? -result : result;
    });
    rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        sheet().cells[address(r1 + r, c1 + c)] = cell.value;
        sheet().styles[address(r1 + r, c1 + c)] = cell.style;
      }),
    );
  });
}
function fillRange(direction) {
  const [r1, c1, r2, c2] = rectangle(...selection);
  if ((direction === 'down' && r1 === r2) || (direction === 'right' && c1 === c2))
    throw Error('Select a range extending in the fill direction.');
  const keys = new Set(rangeKeys(...selection));
  if (sheet().merges.some((m) => rangeKeys(...m.split(':')).some((k) => keys.has(k))))
    throw Error('Unmerge the range before filling.');
  change(() => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const source = address(direction === 'down' ? r1 : r, direction === 'right' ? c1 : c),
          target = address(r, c);
        sheet().cells[target] = translateFormula(
          sheet().cells[source] || '',
          direction === 'down' ? r - r1 : 0,
          direction === 'right' ? c - c1 : 0,
        );
        sheet().styles[target] = clone(sheet().styles[source] || {});
      }
  });
}
function renderSheet() {
  const workspace = $('.workspace');
  workspace.replaceChildren();
  const s = sheet(),
    index = doc.activeSheet || 0;
  const formula = el('input', {
    class: 'formula-input',
    'aria-label': 'Formula bar',
    value: s.cells[selection[0]] || '',
    placeholder: 'Enter a value or a formula. Double-click a cell to edit.',
    onChange: (e) => {
      const value = e.target.value;
      change(() => (s.cells[selection[0]] = value), { render: false });
      const td = $(`[data-cell="${selection[0]}"]`);
      if (td) td.textContent = display(calculate(doc, index, selection[0]), s.styles[selection[0]]);
      // Recalculate dependent visible cells without replacing the focused formula input.
      const cache = new Map();
      $('.grid')
        ?.querySelectorAll('[data-cell]')
        .forEach((cell) => {
          if (!cell.querySelector('input'))
            cell.textContent = display(
              calculate(doc, index, cell.dataset.cell, new Set(), cache),
              s.styles[cell.dataset.cell],
            );
        });
      updateStatus();
    },
    onKeydown: (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
        renderSheet();
        $(`[data-cell="${selection[0]}"]`)?.focus();
      }
    },
  });
  workspace.append(
    el(
      'div',
      { class: 'formula' },
      el('input', {
        class: 'address',
        'aria-label': 'Selected range',
        value: selection[0] + (selection[0] !== selection[1] ? ':' + selection[1] : ''),
        onKeydown: (e) => {
          if (e.key === 'Enter') {
            try {
              const parts = e.target.value.toUpperCase().replaceAll('$', '').split(':');
              rangeKeys(parts[0], parts[1] || parts[0]);
              const [r1, c1, r2, c2] = rectangle(parts[0], parts[1] || parts[0]);
              selection = [address(r1, c1), address(r2, c2)];
              s.rows = Math.max(s.rows, r2 + 1);
              s.columns = Math.max(s.columns, c2 + 1);
              renderSheet();
              $(`[data-cell="${selection[0]}"]`)?.scrollIntoView({
                block: 'center',
                inline: 'center',
              });
            } catch (error) {
              notify(error.message);
            }
          }
        },
      }),
      el('i', {}, 'ƒx'),
      formula,
    ),
  );
  const table = el('table', { class: 'grid', role: 'grid', 'aria-label': s.name }),
    thead = el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', {
          'aria-label': 'Select all',
          onClick: () => selectRange('A1', address(s.rows - 1, s.columns - 1)),
        }),
        Array.from({ length: s.columns }, (_, c) =>
          el(
            'th',
            { onClick: () => selectRange(address(0, c), address(s.rows - 1, c)) },
            column(c),
          ),
        ),
      ),
    ),
    body = el('tbody');
  table.append(thead, body);
  const merged = new Map(),
    hidden = new Set();
  for (const merge of s.merges) {
    const [a, b] = merge.split(':'),
      [r1, c1, r2, c2] = rectangle(a, b);
    merged.set(a, { rowspan: r2 - r1 + 1, colspan: c2 - c1 + 1 });
    for (const key of rangeKeys(a, b)) if (key !== a) hidden.add(key);
  }
  const cache = new Map();
  let drag = false;
  for (let r = 0; r < s.rows; r++) {
    const tr = el(
      'tr',
      s.freeze && r === 0
        ? { style: { position: 'sticky', top: '29px', zIndex: '2', background: 'var(--panel)' } }
        : {},
    );
    tr.append(
      el('th', { onClick: () => selectRange(address(r, 0), address(r, s.columns - 1)) }, r + 1),
    );
    for (let c = 0; c < s.columns; c++) {
      const key = address(r, c);
      if (hidden.has(key)) continue;
      const style = s.styles[key] || {},
        value = calculate(doc, index, key, new Set(), cache),
        td = el(
          'td',
          {
            'data-cell': key,
            role: 'gridcell',
            'aria-label': 'Cell ' + key,
            tabindex: key === selection[0] ? '0' : '-1',
            ...(merged.get(key) || {}),
            style: {
              fontWeight: style.bold ? '700' : '400',
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              textAlign: style.align || (typeof value === 'number' ? 'right' : 'left'),
              background: style.background || '',
              color: style.color || '',
              whiteSpace: style.wrap ? 'normal' : 'nowrap',
              ...(style.border ? { border: '1px solid #8ba998' } : {}),
            },
          },
          display(value, style),
        );
      td.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        drag = true;
        document.addEventListener(
          'mouseup',
          () => {
            drag = false;
          },
          { once: true },
        );
        selectRange(e.shiftKey ? selection[0] : key, key);
        td.focus({ preventScroll: true });
      });
      td.addEventListener('mouseenter', () => {
        if (drag) selectRange(selection[0], key);
      });
      td.addEventListener('dblclick', () => startCellEdit(key));
      td.addEventListener('keydown', (e) => cellKey(e, key));
      tr.append(td);
    }
    body.append(tr);
  }
  const area = el('div', { class: 'sheet-area' }, table);
  if (s.charts.length)
    area.append(
      el(
        'section',
        { class: 'chart-panel' },
        s.charts.map((chart) => chartCard(chart)),
      ),
    );
  workspace.append(
    area,
    el(
      'div',
      { class: 'sheet-footer' },
      doc.sheets.map((s, i) =>
        button(
          s.name,
          () => {
            doc.activeSheet = i;
            selection = ['A1', 'A1'];
            renderEditor();
          },
          { class: i === index ? 'active' : '' },
        ),
      ),
      button(
        '+',
        () => {
          activeTab = 'Insert';
          renderToolbar();
          notify('Use “Add worksheet” in the Insert toolbar.');
        },
        { 'aria-label': 'Worksheet tools' },
      ),
      el('span', { class: 'grow' }),
      el('span', { class: 'small muted' }, s.rows + ' rows × ' + s.columns + ' columns'),
    ),
  );
  area.addEventListener('mouseleave', () => (drag = false));
  selectRange(...selection);
}
function selectRange(a, b) {
  selection = [a, b];
  const selected = new Set(rangeKeys(a, b));
  $('.grid')
    ?.querySelectorAll('[data-cell]')
    .forEach((td) => {
      td.classList.toggle('selected', selected.has(td.dataset.cell));
      td.classList.toggle('anchor', td.dataset.cell === a);
      td.setAttribute('aria-selected', String(selected.has(td.dataset.cell)));
      td.tabIndex = td.dataset.cell === a ? 0 : -1;
    });
  const range = $('.address');
  if (range) range.value = a + (a !== b ? ':' + b : '');
  const formula = $('.formula-input');
  if (formula) formula.value = sheet().cells[a] || '';
  updateStatus();
}
function startCellEdit(key, initial) {
  const td = $(`[data-cell="${key}"]`);
  if (!td || td.querySelector('input')) return;
  const input = el('input', {
    'aria-label': 'Edit ' + key,
    value: initial ?? sheet().cells[key] ?? '',
  });
  td.classList.add('editing');
  td.replaceChildren(input);
  let cancelled = false,
    committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    if (!cancelled && input.value !== (sheet().cells[key] ?? '')) {
      remember();
      sheet().cells[key] = input.value;
      markChanged();
    }
    renderSheet();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      cancelled = true;
      commit();
      $(`[data-cell="${key}"]`)?.focus();
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commit();
      moveCell(key, e.key === 'Enter' ? 1 : 0, e.key === 'Tab' ? 1 : 0, false);
    }
  });
  input.focus();
  if (initial === undefined) input.select();
  else input.setSelectionRange(input.value.length, input.value.length);
}
function moveCell(key, dr, dc, extend) {
  const [r, c] = coordinate(key),
    next = address(
      Math.min(sheet().rows - 1, Math.max(0, r + dr)),
      Math.min(sheet().columns - 1, Math.max(0, c + dc)),
    );
  const merge = sheet().merges.find((m) => rangeKeys(...m.split(':')).includes(next));
  const target = merge ? merge.split(':')[0] : next;
  selectRange(extend ? selection[0] : target, target);
  $(`[data-cell="${target}"]`)?.focus();
}
function cellKey(e, key) {
  if (e.target.tagName === 'INPUT') return;
  const directions = {
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    Enter: [1, 0],
    Tab: [0, e.shiftKey ? -1 : 1],
  };
  if (directions[e.key]) {
    e.preventDefault();
    moveCell(e.shiftKey ? selection[1] : key, ...directions[e.key], e.shiftKey && e.key !== 'Tab');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    change(() => {
      for (const k of rangeKeys(...selection)) delete sheet().cells[k];
    });
    $(`[data-cell="${key}"]`)?.focus();
  } else if (e.key === 'F2') {
    e.preventDefault();
    startCellEdit(key);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectRange('A1', address(sheet().rows - 1, sheet().columns - 1));
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    startCellEdit(key, e.key);
  }
}
document.addEventListener('copy', (e) => {
  if (doc?.kind !== 'sheet' || !e.target.closest?.('.grid') || e.target.tagName === 'INPUT') return;
  const [r1, c1, r2, c2] = rectangle(...selection),
    rows = [];
  for (let r = r1; r <= r2; r++)
    rows.push(
      Array.from({ length: c2 - c1 + 1 }, (_, c) => sheet().cells[address(r, c1 + c)] ?? ''),
    );
  const text = delimited(rows, '\t');
  copied = { text, row: r1, col: c1, rows };
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  notify('Copied ' + rangeKeys(...selection).length + ' cells');
});
document.addEventListener('paste', (e) => {
  if (doc?.kind !== 'sheet' || !e.target.closest?.('.grid') || e.target.tagName === 'INPUT') return;
  e.preventDefault();
  try {
    const text = e.clipboardData.getData('text/plain');
    if (text.length > 2e6) throw Error('Clipboard data exceeds 2 MB.');
    const rows = parseDelimited(text, '\t'),
      [r, c] = coordinate(selection[0]),
      width = Math.max(...rows.map((row) => row.length));
    if (r + rows.length > LIMITS.rows || c + width > LIMITS.columns)
      throw Error('Paste exceeds the sheet limits.');
    const targets = new Set(rangeKeys(address(r, c), address(r + rows.length - 1, c + width - 1)));
    if (sheet().merges.some((m) => rangeKeys(...m.split(':')).some((k) => targets.has(k))))
      throw Error('Unmerge destination cells before pasting.');
    change(() => {
      rows.forEach((row, dr) =>
        row.forEach(
          (value, dc) =>
            (sheet().cells[address(r + dr, c + dc)] =
              copied?.text === text
                ? translateFormula(value, r - copied.row, c - copied.col)
                : value),
        ),
      );
      sheet().rows = Math.max(sheet().rows, r + rows.length);
      sheet().columns = Math.max(sheet().columns, c + width);
      selection = [address(r, c), address(r + rows.length - 1, c + width - 1)];
    });
  } catch (error) {
    notify(error.message);
  }
});
function addChart(type) {
  const [r1, c1, r2, c2] = rectangle(...selection);
  if (r2 <= r1 || c2 <= c1)
    throw Error(
      'Select a table with a header row, labels in its first column, and at least one numeric series.',
    );
  if (r2 - r1 > 50 || c2 - c1 > 5) throw Error('Use up to 50 categories and 5 series.');
  if (sheet().charts.length >= 10) throw Error('Maximum 10 charts per sheet.');
  change(() =>
    sheet().charts.push({
      id: crypto.randomUUID(),
      title: type === 'line' ? 'Trend' : 'Comparison',
      type,
      range: address(r1, c1) + ':' + address(r2, c2),
    }),
  );
  $('.chart-panel')?.scrollIntoView({ block: 'end' });
}
function chartCard(chart) {
  const card = el(
    'article',
    { class: 'chart-card' },
    el(
      'header',
      {},
      el('span', {}, chart.title + ' · ' + chart.range),
      button(
        '×',
        () => change(() => (sheet().charts = sheet().charts.filter((c) => c.id !== chart.id))),
        { 'aria-label': 'Delete chart' },
      ),
    ),
  );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 450 250');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', chart.title);
  const draw = (tag, attributes, text) => {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };
  const [r1, c1, r2, c2] = rectangle(...chart.range.split(':')),
    colors = ['#388669', '#b79a4d', '#688cad', '#ab7b83', '#8b82ad'],
    count = Math.min(r2 - r1, 50),
    series = Math.min(c2 - c1, 5),
    values = Array.from({ length: count }, (_, i) =>
      Array.from({ length: series }, (_, j) => {
        const value = calculate(doc, doc.activeSheet || 0, address(r1 + 1 + i, c1 + 1 + j));
        return typeof value === 'number' ? value : 0;
      }),
    ),
    flat = values.flat(),
    min = Math.min(0, ...flat),
    max = Math.max(1, ...flat),
    y = (v) => 210 - ((v - min) / (max - min)) * 175,
    step = 380 / Math.max(count, 1);
  for (let i = 0; i <= 4; i++) {
    const value = min + ((max - min) * i) / 4,
      py = y(value);
    draw('line', { x1: 50, y1: py, x2: 435, y2: py, stroke: 'var(--line)' });
    draw('text', { x: 44, y: py + 3, 'text-anchor': 'end' }, display(value));
  }
  for (let j = 0; j < series; j++) {
    if (chart.type === 'line')
      draw('polyline', {
        points: values.map((row, i) => 50 + step * (i + 0.5) + ',' + y(row[j])).join(' '),
        fill: 'none',
        stroke: colors[j],
        'stroke-width': 2,
      });
    values.forEach((row, i) => {
      const cx = 50 + step * (i + 0.5);
      if (chart.type === 'line') draw('circle', { cx, cy: y(row[j]), r: 3, fill: colors[j] });
      else {
        const w = (step * 0.75) / series;
        draw('rect', {
          x: 50 + step * i + step * 0.125 + j * w,
          y: Math.min(y(0), y(row[j])),
          width: Math.max(1, w - 2),
          height: Math.max(1, Math.abs(y(0) - y(row[j]))),
          rx: 2,
          fill: colors[j],
        });
      }
    });
  }
  for (let i = 0; i < count; i++) {
    if (count <= 12 || i % Math.ceil(count / 12) === 0)
      draw(
        'text',
        { x: 50 + step * (i + 0.5), y: 234, 'text-anchor': 'middle' },
        String(calculate(doc, doc.activeSheet || 0, address(r1 + 1 + i, c1))).slice(0, 12),
      );
  }
  card.append(
    svg,
    el(
      'div',
      { class: 'legend' },
      Array.from({ length: series }, (_, j) =>
        el(
          'span',
          {},
          el('i', { style: { background: colors[j] } }),
          String(calculate(doc, doc.activeSheet || 0, address(r1, c1 + j + 1))),
        ),
      ),
    ),
  );
  return card;
}
function slideTools() {
  if (activeTab === 'Home')
    return [
      tool('New slide', () => {
        if (doc.slides.length >= 100) throw Error('Maximum 100 slides.');
        change(() => {
          doc.slides.splice(slideIndex + 1, 0, {
            title: 'Your next idea',
            body: 'Tell your story.',
            notes: '',
            layout: 'title-body',
          });
          slideIndex++;
        });
      }),
      tool('Duplicate slide', () => {
        if (doc.slides.length >= 100) throw Error('Maximum 100 slides.');
        change(() => {
          doc.slides.splice(slideIndex + 1, 0, clone(doc.slides[slideIndex]));
          slideIndex++;
        });
      }),
      tool('Delete slide', () => {
        if (doc.slides.length === 1) throw Error('Keep at least one slide.');
        change(() => {
          doc.slides.splice(slideIndex, 1);
          slideIndex = Math.max(0, slideIndex - 1);
        });
      }),
      divider(),
      tool('Move up', () => {
        if (slideIndex === 0) return;
        change(() => {
          const [slide] = doc.slides.splice(slideIndex, 1);
          doc.slides.splice(--slideIndex, 0, slide);
        });
      }),
      tool('Move down', () => {
        if (slideIndex === doc.slides.length - 1) return;
        change(() => {
          const [slide] = doc.slides.splice(slideIndex, 1);
          doc.slides.splice(++slideIndex, 0, slide);
        });
      }),
      divider(),
      tool('▶ Present', present, { class: 'primary' }),
    ];
  if (activeTab === 'Insert')
    return [
      tool('Insert image', async () => {
        const image = await readImage();
        if (image)
          change(() => {
            doc.slides[slideIndex].image = image;
            doc.slides[slideIndex].layout = 'title-body';
          });
      }),
      tool('Remove image', () => change(() => delete doc.slides[slideIndex].image)),
      el('span', { class: 'muted small' }, 'PNG, JPEG or WebP · images are embedded in your file'),
      divider(),
      tool('Speaker notes', () => $('.notes textarea').focus()),
    ];
  return [
    select(
      'Presentation theme',
      Object.keys(THEMES).map((name) => [name, name[0].toUpperCase() + name.slice(1)]),
      doc.theme || 'forest',
      (value) => change(() => (doc.theme = value)),
    ),
    select(
      'Slide layout',
      [
        ['title', 'Title slide'],
        ['title-body', 'Title and body'],
        ['split', 'Two columns'],
      ],
      doc.slides[slideIndex].layout || 'title-body',
      (value) => change(() => (doc.slides[slideIndex].layout = value)),
    ),
    el('span', { class: 'muted small' }, 'Widescreen 16:9'),
    tool('Print / PDF', printDocument),
  ];
}
function slidePage(slide, index, editing = false) {
  const t = THEMES[doc.theme] || THEMES.forest,
    page = el(
      'section',
      {
        class:
          'slide-page layout-' + (slide.layout || 'title-body') + (slide.image ? ' has-image' : ''),
        style: { background: '#' + t.background, color: '#' + t.ink },
      },
      el('div', { class: 'slide-kicker' }, doc.title),
    );
  const update = (key, value) => {
    remember(true);
    slide[key] = value;
    markChanged();
    const thumb = $(`.thumb[data-slide="${index}"] ${key === 'title' ? 'strong' : 'p'}`);
    if (thumb) thumb.textContent = value;
  };
  page.append(
    editing
      ? el(
          'textarea',
          {
            class: 'slide-title',
            'aria-label': 'Slide title',
            rows: 2,
            onInput: (e) => update('title', e.target.value),
          },
          slide.title,
        )
      : el('h1', {}, slide.title),
    editing
      ? el(
          'textarea',
          {
            class: 'slide-body',
            'aria-label': 'Slide body',
            onInput: (e) => update('body', e.target.value),
          },
          slide.body,
        )
      : el('p', { class: 'slide-body' }, slide.body),
  );
  if (safeImage(slide.image))
    page.append(el('img', { src: slide.image, alt: 'Slide illustration' }));
  page.append(
    el('span', { class: 'slide-rule' }),
    el('span', { class: 'slide-number' }, String(index + 1).padStart(2, '0')),
  );
  return page;
}
function renderSlides() {
  const s = doc.slides[slideIndex];
  $('.workspace').append(
    el(
      'div',
      { class: 'slides-workspace' },
      el(
        'aside',
        { class: 'slide-list', 'aria-label': 'Slides' },
        doc.slides
          .map((slide, i) =>
            button(
              '',
              () => {
                slideIndex = i;
                renderEditor();
              },
              {
                class: 'thumb ' + (i === slideIndex ? 'active' : ''),
                'data-slide': i,
                'aria-label': 'Select slide ' + (i + 1),
              },
            ),
          )
          .map((button, i) => {
            button.append(
              el('small', {}, String(i + 1).padStart(2, '0')),
              el('strong', {}, doc.slides[i].title),
              el('p', {}, doc.slides[i].body),
            );
            return button;
          }),
      ),
      el(
        'div',
        { class: 'slide-stage' },
        slidePage(s, slideIndex, true),
        el(
          'div',
          { class: 'notes' },
          el(
            'label',
            {},
            'Speaker notes',
            el(
              'textarea',
              {
                'aria-label': 'Speaker notes',
                placeholder: 'What would you like to remember when presenting?',
                onInput: (e) => {
                  remember(true);
                  s.notes = e.target.value;
                  markChanged();
                },
              },
              s.notes || '',
            ),
          ),
        ),
      ),
    ),
  );
}
function present() {
  let index = slideIndex;
  const overlay = el('div', {
    class: 'presenter',
    role: 'dialog',
    'aria-label': 'Presentation',
    tabindex: -1,
  });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', key);
  };
  const render = () =>
    overlay.replaceChildren(
      button('× Exit', close, { class: 'exit' }),
      slidePage(doc.slides[index], index),
      el(
        'div',
        { class: 'presenter-controls' },
        button('← Previous', () => {
          index = Math.max(0, index - 1);
          render();
        }),
        el('span', {}, `${index + 1} / ${doc.slides.length}`),
        button('Next →', () => {
          index = Math.min(doc.slides.length - 1, index + 1);
          render();
        }),
      ),
    );
  const key = (e) => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      index = Math.min(doc.slides.length - 1, index + 1);
      render();
    }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      index = Math.max(0, index - 1);
      render();
    }
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', key);
  document.body.append(overlay);
  render();
  overlay.focus();
}
async function exportDocument(format) {
  if (!format) return;
  const filename = documentName(format);
  let blob;
  if (format === 'pdf') {
    printDocument();
    return;
  }
  if (format === 'json')
    blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  else if (format === 'docx') blob = docx(doc);
  else if (format === 'xlsx') {
    blob = xlsx(doc);
  } else if (format === 'pptx') blob = pptx(doc);
  else if (format === 'csv')
    blob = new Blob([exportCsv(doc, doc.activeSheet || 0)], { type: 'text/csv;charset=utf-8' });
  else if (format === 'html')
    blob = new Blob(
      [
        '<!doctype html><html><head><meta charset="utf-8"><title>Document</title></head><body>' +
          sanitizeHtml(doc.html) +
          '</body></html>',
      ],
      { type: 'text/html;charset=utf-8' },
    );
  else if (format === 'txt')
    blob = new Blob(
      [new DOMParser().parseFromString(sanitizeHtml(doc.html), 'text/html').body.textContent],
      { type: 'text/plain;charset=utf-8' },
    );
  if (blob) download(blob, filename);
}
function printDocument() {
  const area = $('#print-area');
  area.replaceChildren();
  if (doc.kind === 'doc')
    area.append(el('article', { class: 'paper', html: sanitizeHtml(doc.html) }));
  else if (doc.kind === 'slides') doc.slides.forEach((s, i) => area.append(slidePage(s, i)));
  else {
    const s = sheet(),
      coords = Object.keys(s.cells).map(coordinate),
      rows = Math.max(1, ...coords.map((c) => c[0] + 1)),
      cols = Math.max(1, ...coords.map((c) => c[1] + 1));
    if (rows * cols > 10000)
      throw Error('Print up to 10,000 used cells at a time. Export XLSX for larger workbooks.');
    const table = el('table'),
      cache = new Map();
    for (let r = 0; r < rows; r++) {
      const tr = el('tr');
      for (let c = 0; c < cols; c++) {
        const key = address(r, c),
          style = s.styles[key] || {};
        tr.append(
          el(
            'td',
            {
              style: {
                fontWeight: style.bold ? '700' : '400',
                background: style.background || 'white',
                color: style.color || 'black',
                textAlign: style.align || 'left',
              },
            },
            display(calculate(doc, doc.activeSheet || 0, key, new Set(), cache), style),
          ),
        );
      }
      table.append(tr);
    }
    area.append(
      el('h1', {}, doc.title + ' — ' + s.name),
      table,
      ...s.charts.map((chart) => {
        const card = chartCard(chart);
        card.querySelector('button')?.remove();
        return card;
      }),
    );
  }
  window.print();
}
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('dialog,.presenter')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    persist()
      .then(() => notify('Saved'))
      .catch((e) => notify(e.message));
  }
  if (
    doc &&
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'z' &&
    !e.target.closest?.('.paper')
  ) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
  if (
    doc &&
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'y' &&
    !e.target.closest?.('.paper')
  ) {
    e.preventDefault();
    redo();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('message', async (event) => {
  if (!embedded || event.source !== parent || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type === 'studio:init' && !bridgeReady) {
    try {
      const value = validateDocument(message.document);
      value.id = message.document.id || value.id;
      bridgeReady = true;
      theme = message.theme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      await openDocument(value);
    } catch (e) {
      parent.postMessage({ type: 'studio:error', message: e.message }, location.origin);
    }
  }
  if (message?.type === 'studio:saved' && pendingBridgeSave?.token === message.token) {
    const pending = pendingBridgeSave;
    pendingBridgeSave = null;
    message.error ? pending.reject(message.error) : pending.resolve();
  }
  if (message?.type === 'studio:theme') {
    theme = message.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  }
});
if (embedded) {
  root.append(el('p', { class: 'empty' }, 'Opening your document…'));
  parent.postMessage({ type: 'studio:ready' }, location.origin);
} else
  home().catch((e) => {
    root.replaceChildren(
      el(
        'main',
        { class: 'home' },
        el('h1', {}, 'Storage is unavailable'),
        el('p', {}, e.message),
        el('p', {}, 'Enable browser storage for this local site and reload.'),
      ),
    );
  });

if (!embedded)
  mountAssistant({
    getDocuments: readAll,
    getCurrent: () => doc,
    onOpen: async (id, location) => {
      const value = doc?.id === id ? doc : (await readAll()).find((d) => d.id === id);
      if (!value) throw Error('Document no longer exists.');
      if (doc?.id !== id) await openDocument(value);
      if (value.kind === 'sheet' && location.includes('!')) {
        const split = location.lastIndexOf('!'),
          sheetName = location.slice(0, split),
          cell = location.slice(split + 1);
        const index = value.sheets.findIndex((sheet) => sheet.name === sheetName);
        if (index >= 0 && /^[A-Z]+[1-9][0-9]*$/.test(cell)) {
          doc.activeSheet = index;
          selection = [cell, cell];
          renderEditor();
        }
      }
    },
  });

if (!embedded)
  mountNavigation([
    { id: 'home', label: 'Documents', symbol: '⌂', run: home },
    { id: 'doc', label: 'New Writer document', symbol: 'W', run: () => create('doc') },
    { id: 'sheet', label: 'New spreadsheet', symbol: '▦', run: () => create('sheet') },
    { id: 'slides', label: 'New presentation', symbol: '▱', run: () => create('slides') },
    { id: 'import', label: 'Import a file', symbol: '↑', run: importDocument },
    { id: 'help', label: 'Studio help', symbol: '?', run: showHelp },
  ]);
