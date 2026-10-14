// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
export const clone = (value) => structuredClone(value);
export const LIMITS = { rows: 1000, columns: 100, cells: 100000, fileBytes: 20 * 1024 * 1024 };
export function column(n) {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function address(r, c) {
  return column(c) + (r + 1);
}
export function coordinate(value) {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,5})$/i.exec(value);
  if (!m) throw Error('Invalid cell address');
  const c = [...m[1].toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [Number(m[2]) - 1, c];
}
export function rectangle(a, b = a) {
  const [r1, c1] = coordinate(a),
    [r2, c2] = coordinate(b);
  return [Math.min(r1, r2), Math.min(c1, c2), Math.max(r1, r2), Math.max(c1, c2)];
}
export function rangeKeys(a, b = a) {
  const [r1, c1, r2, c2] = rectangle(a, b);
  if ((r2 - r1 + 1) * (c2 - c1 + 1) > LIMITS.cells || r2 >= LIMITS.rows || c2 >= LIMITS.columns)
    throw Error('Range exceeds 1,000 rows or 100 columns.');
  const keys = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) keys.push(address(r, c));
  return keys;
}
export function translateFormula(value, dr, dc) {
  if (!String(value).startsWith('=')) return value;
  // Quoted literals are never interpreted as references.
  return value.replace(
    /"(?:[^"]|"")*"|(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)\b/g,
    (all, ca, c, ra, r) => {
      if (ca === undefined) return all;
      const [row, col] = coordinate(c + r),
        nr = row + (ra ? 0 : dr),
        nc = col + (ca ? 0 : dc);
      return nr < 0 || nc < 0 || nr >= LIMITS.rows || nc >= LIMITS.columns
        ? '#REF!'
        : ca + column(nc) + ra + (nr + 1);
    },
  );
}
export function parseDelimited(text, delimiter = ',') {
  text = text.replace(/^\uFEFF/, '');
  const rows = [],
    row = [];
  let field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === '') quoted = !quoted;
      else field += ch;
    } else if (ch === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\r' || ch === '\n') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row.splice(0));
      field = '';
    } else field += ch;
  }
  if (quoted) throw Error('Unclosed quoted field');
  if (field || row.length || !rows.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length > LIMITS.rows || rows.some((r) => r.length > LIMITS.columns))
    throw Error('File exceeds the sheet size limit.');
  return rows;
}
export function delimited(rows, delimiter = ',') {
  return rows
    .map((row) => row.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(delimiter))
    .join('\r\n');
}
class FormulaError extends Error {}
const fail = (message) => {
  throw new FormulaError(message);
};
const numeric = (value) => {
  if (typeof value === 'boolean') return +value;
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) fail('#VALUE!');
  return n;
};
export const FUNCTIONS = [
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'COUNTA',
  'IF',
  'IFERROR',
  'AND',
  'OR',
  'NOT',
  'SUMIF',
  'COUNTIF',
  'ROUND',
  'ROUNDUP',
  'ROUNDDOWN',
  'ABS',
  'SQRT',
  'POWER',
  'MOD',
  'CONCAT',
  'CONCATENATE',
  'LEN',
  'UPPER',
  'LOWER',
  'TRIM',
  'LEFT',
  'RIGHT',
  'MID',
  'DATE',
  'TODAY',
  'YEAR',
  'MONTH',
  'DAY',
  'VLOOKUP',
  'INDEX',
  'MATCH',
  'SUMIFS',
  'COUNTIFS',
  'AVERAGEIF',
  'AVERAGEIFS',
  'MEDIAN',
  'STDEV.S',
  'STDEV.P',
  'PRODUCT',
  'INT',
  'SIGN',
  'ISNUMBER',
  'ISTEXT',
  'COUNTBLANK',
  'TEXTJOIN',
  'SUBSTITUTE',
  'REPT',
  'XLOOKUP',
];
export function calculate(workbook, sheetIndex, key, trail = new Set(), cache = new Map()) {
  const sheet = workbook.sheets[sheetIndex];
  if (!sheet) return '#REF!';
  const id = sheetIndex + '!' + key.replaceAll('$', '').toUpperCase();
  if (cache.has(id)) return cache.get(id);
  if (trail.has(id) || trail.size > 100) return '#CYCLE!';
  const value = sheet.cells[key.replaceAll('$', '').toUpperCase()] ?? '';
  if (typeof value !== 'string' || !value.startsWith('=')) {
    if (typeof value === 'string' && value.startsWith("'")) return value.slice(1);
    return value !== '' && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(value))
      ? Number(value)
      : value;
  }
  const visiting = new Set(trail);
  visiting.add(id);
  try {
    const source = value.slice(1);
    if (source.length > 4096) fail('#LIMIT!');
    const tokens = [];
    let pos = 0;
    const re =
      /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)|("(?:[^"]|"")*")|('(?:[^']|'')*')|(\$?[A-Za-z_][A-Za-z_0-9.$]*)|(<>|<=|>=|[+\-*/^&=<>():,;!%]))/y;
    while (pos < source.length) {
      if (!source.slice(pos).trim()) break;
      re.lastIndex = pos;
      const match = re.exec(source);
      if (!match) fail('#PARSE!');
      tokens.push(
        match[1] !== undefined
          ? { type: 'number', v: Number(match[1]) }
          : match[2] !== undefined
            ? { type: 'text', v: match[2].slice(1, -1).replaceAll('""', '"') }
            : match[3] !== undefined
              ? { type: 'name', v: match[3].slice(1, -1).replaceAll("''", "'") }
              : { type: match[4] ? 'word' : 'op', v: match[4] ?? match[5] },
      );
      pos = re.lastIndex;
    }
    let at = 0,
      depth = 0;
    const peek = () => tokens[at]?.v;
    const take = (s) => {
      if (peek() !== s) fail('#PARSE!');
      at++;
    };
    function atom() {
      if (++depth > 100) fail('#LIMIT!');
      const t = tokens[at++];
      if (!t) fail('#PARSE!');
      let node;
      if (t.type === 'number' || t.type === 'text') node = { type: 'literal', value: t.v };
      else if (t.v === '(') {
        node = expression(0);
        take(')');
      } else if (t.v === '+' || t.v === '-')
        node = { type: 'unary', op: t.v, child: expression(4) };
      else if (t.type === 'word' || t.type === 'name') {
        let name = t.v,
          sheet = sheetIndex;
        if (peek() === '!') {
          at++;
          sheet = workbook.sheets.findIndex(
            (s) => s.name.toLowerCase() === String(name).toLowerCase(),
          );
          name = tokens[at++]?.v;
          if (sheet < 0) fail('#REF!');
        }
        if (peek() === '(') {
          at++;
          const args = [];
          if (peek() !== ')') {
            do {
              args.push(expression(0));
              if (peek() !== ',' && peek() !== ';') break;
              at++;
            } while (true);
          }
          take(')');
          node = { type: 'call', name: String(name).toUpperCase(), args };
        } else if (/^\$?[A-Z]{1,3}\$?[1-9]\d*$/i.test(name)) {
          let end = name;
          if (peek() === ':') {
            at++;
            end = tokens[at++]?.v;
            if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*$/i.test(end)) fail('#REF!');
          }
          node = {
            type: 'ref',
            sheet,
            start: name.replaceAll('$', '').toUpperCase(),
            end: end.replaceAll('$', '').toUpperCase(),
          };
        } else if (/^(TRUE|FALSE)$/i.test(name))
          node = { type: 'literal', value: String(name).toUpperCase() === 'TRUE' };
        else fail('#NAME?');
      } else fail('#PARSE!');
      while (peek() === '%') {
        at++;
        node = { type: 'percent', child: node };
      }
      depth--;
      return node;
    }
    const precedence = {
      '=': 1,
      '<>': 1,
      '<': 1,
      '>': 1,
      '<=': 1,
      '>=': 1,
      '&': 2,
      '+': 3,
      '-': 3,
      '*': 4,
      '/': 4,
      '^': 5,
    };
    function expression(min) {
      let left = atom();
      while ((precedence[peek()] ?? 0) > min) {
        const op = tokens[at++].v,
          p = precedence[op];
        left = { type: 'binary', op, left, right: expression(op === '^' ? p - 1 : p) };
      }
      return left;
    }
    const ast = expression(0);
    if (at !== tokens.length) fail('#PARSE!');
    const scalar = (v) => (Array.isArray(v) ? v.flat(Infinity)[0] : v);
    const flat = (a) => a.flat(Infinity);
    const numbers = (a) =>
      flat(a)
        .filter((v) => v !== '' && (typeof v === 'number' || typeof v === 'boolean'))
        .map(numeric);
    const criterion = (value, expected) => {
      const m = /^(<>|>=|<=|>|<|=)?(.*)$/.exec(String(expected));
      const right = m[2] !== '' && Number.isFinite(Number(m[2])) ? Number(m[2]) : m[2];
      return compare(value, right, m[1] || '=');
    };
    const compare = (l, r, op) => {
      if (typeof l === 'string' && typeof r === 'string') {
        l = l.toLowerCase();
        r = r.toLowerCase();
      }
      return op === '='
        ? l === r
        : op === '<>'
          ? l !== r
          : op === '<'
            ? l < r
            : op === '>'
              ? l > r
              : op === '<='
                ? l <= r
                : l >= r;
    };
    function evalNode(n) {
      if (n.type === 'literal') return n.value;
      if (n.type === 'ref') {
        const [r1, c1, r2, c2] = rectangle(n.start, n.end);
        rangeKeys(n.start, n.end);
        const rows = [];
        for (let r = r1; r <= r2; r++) {
          const row = [];
          for (let c = c1; c <= c2; c++) {
            const result = calculate(workbook, n.sheet, address(r, c), visiting, cache);
            if (
              typeof result === 'string' &&
              /^#(REF!|VALUE!|DIV\/0!|CYCLE!|NAME\?|PARSE!|N\/A|LIMIT!|NUM!)$/.test(result)
            )
              fail(result);
            row.push(result);
          }
          rows.push(row);
        }
        return n.start === n.end ? rows[0][0] : rows;
      }
      if (n.type === 'unary') return numeric(scalar(evalNode(n.child))) * (n.op === '-' ? -1 : 1);
      if (n.type === 'percent') return numeric(scalar(evalNode(n.child))) / 100;
      if (n.type === 'binary') {
        const l = scalar(evalNode(n.left)),
          r = scalar(evalNode(n.right));
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return compare(l, r, n.op);
        if (n.op === '&') return String(l) + String(r);
        const a = numeric(l),
          b = numeric(r);
        if (n.op === '/' && b === 0) fail('#DIV/0!');
        return n.op === '+'
          ? a + b
          : n.op === '-'
            ? a - b
            : n.op === '*'
              ? a * b
              : n.op === '/'
                ? a / b
                : a ** b;
      }
      const name = n.name;
      if (name === 'IF') {
        if (n.args.length < 2 || n.args.length > 3) fail('#VALUE!');
        return evalNode(
          n.args[scalar(evalNode(n.args[0])) ? 1 : 2] ?? { type: 'literal', value: false },
        );
      }
      if (name === 'IFERROR') {
        if (n.args.length !== 2) fail('#VALUE!');
        try {
          return evalNode(n.args[0]);
        } catch {
          return evalNode(n.args[1]);
        }
      }
      if (name === 'XLOOKUP') {
        if (n.args.length < 3 || n.args.length > 6) fail('#VALUE!');
        if (n.args[4] && scalar(evalNode(n.args[4])) !== 0) fail('#N/A');
        const mode = n.args[5] ? numeric(scalar(evalNode(n.args[5]))) : 1;
        if (![1, -1].includes(mode)) fail('#N/A');
        const value = scalar(evalNode(n.args[0])),
          lookup = flat([evalNode(n.args[1])]),
          result = flat([evalNode(n.args[2])]);
        if (lookup.length !== result.length) fail('#VALUE!');
        const indexes = lookup.map((_, i) => i);
        if (mode === -1) indexes.reverse();
        const index = indexes.find((i) => compare(lookup[i], value, '='));
        if (index === undefined) {
          if (n.args[3]) return evalNode(n.args[3]);
          fail('#N/A');
        }
        return result[index];
      }
      const args = n.args.map(evalNode),
        a = scalar(args[0]),
        b = scalar(args[1]),
        c = scalar(args[2]),
        nums = numbers(args);
      switch (name) {
        case 'SUMIFS':
        case 'COUNTIFS':
        case 'AVERAGEIFS': {
          const count = name === 'COUNTIFS',
            start = count ? 0 : 1;
          if (args.length < start + 2 || (args.length - start) % 2) fail('#VALUE!');
          const range = flat([args[0]]),
            pairs = [];
          for (let i = start; i < args.length; i += 2) {
            const r = flat([args[i]]);
            if (r.length !== range.length) fail('#VALUE!');
            pairs.push([r, scalar(args[i + 1])]);
          }
          const matching = range.filter((_, i) => pairs.every(([r, c]) => criterion(r[i], c)));
          if (count) return matching.length;
          const values = numbers(matching);
          if (name === 'AVERAGEIFS' && !values.length) fail('#DIV/0!');
          const sum = values.reduce((x, y) => x + y, 0);
          return name === 'AVERAGEIFS' ? sum / values.length : sum;
        }
        case 'AVERAGEIF': {
          if (args.length < 2 || args.length > 3) fail('#VALUE!');
          const source = flat([args[0]]),
            target = flat([args[2] ?? args[0]]);
          if (source.length !== target.length) fail('#VALUE!');
          const values = numbers(target.filter((_, i) => criterion(source[i], b)));
          if (!values.length) fail('#DIV/0!');
          return values.reduce((x, y) => x + y, 0) / values.length;
        }
        case 'MEDIAN': {
          if (!nums.length) fail('#NUM!');
          const sorted = [...nums].sort((a, b) => a - b),
            i = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
        }
        case 'STDEV.S':
        case 'STDEV.P': {
          const divisor = nums.length - (name === 'STDEV.S' ? 1 : 0);
          if (divisor <= 0) fail('#DIV/0!');
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          return Math.sqrt(nums.reduce((n, v) => n + (v - mean) ** 2, 0) / divisor);
        }
        case 'PRODUCT':
          return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
        case 'INT':
          return Math.floor(numeric(a));
        case 'SIGN':
          return Math.sign(numeric(a));
        case 'ISNUMBER':
          return typeof a === 'number';
        case 'ISTEXT':
          return typeof a === 'string';
        case 'COUNTBLANK':
          return flat(args).filter((v) => v === '').length;
        case 'TEXTJOIN': {
          const value = flat(args.slice(2))
            .filter((v) => !b || v !== '')
            .join(String(a));
          if (value.length > 32767) fail('#VALUE!');
          return value;
        }
        case 'SUBSTITUTE': {
          const text = String(a),
            old = String(b),
            replacement = String(c);
          if (!old) return text;
          const instance = args[3] === undefined ? null : numeric(scalar(args[3]));
          if (instance !== null && (!Number.isInteger(instance) || instance < 1)) fail('#VALUE!');
          let n = 0;
          return text
            .split(old)
            .map((v, i) =>
              i === 0 ? v : ((++n, instance === null || n === instance) ? replacement : old) + v,
            )
            .join('');
        }
        case 'REPT': {
          const n = Math.floor(numeric(b));
          if (n < 0 || String(a).length * n > 32767) fail('#VALUE!');
          return String(a).repeat(n);
        }
        case 'SUM':
          return nums.reduce((x, y) => x + y, 0);
        case 'AVERAGE':
          if (!nums.length) fail('#DIV/0!');
          return nums.reduce((x, y) => x + y, 0) / nums.length;
        case 'MIN':
          return nums.length ? Math.min(...nums) : 0;
        case 'MAX':
          return nums.length ? Math.max(...nums) : 0;
        case 'COUNT':
          return nums.length;
        case 'COUNTA':
          return flat(args).filter((v) => v !== '').length;
        case 'AND':
          return flat(args).every(Boolean);
        case 'OR':
          return flat(args).some(Boolean);
        case 'NOT':
          return !a;
        case 'SUMIF':
          return flat([args[0]]).reduce(
            (sum, v, i) => sum + (criterion(v, b) ? numeric(flat([args[2] ?? args[0]])[i]) : 0),
            0,
          );
        case 'COUNTIF':
          return flat([args[0]]).filter((v) => criterion(v, b)).length;
        case 'ROUND':
        case 'ROUNDUP':
        case 'ROUNDDOWN': {
          const value = numeric(a),
            digits = numeric(b);
          if (Math.abs(digits) > 15) fail('#NUM!');
          const factor = 10 ** digits;
          return (
            (Math.sign(value) *
              (name === 'ROUNDUP' ? Math.ceil : name === 'ROUNDDOWN' ? Math.floor : Math.round)(
                (Math.abs(value) + Number.EPSILON) * factor,
              )) /
            factor
          );
        }
        case 'ABS':
          return Math.abs(numeric(a));
        case 'SQRT':
          return Math.sqrt(numeric(a));
        case 'POWER':
          return numeric(a) ** numeric(b);
        case 'MOD':
          if (!numeric(b)) fail('#DIV/0!');
          return ((numeric(a) % numeric(b)) + numeric(b)) % numeric(b);
        case 'CONCAT':
        case 'CONCATENATE':
          return flat(args).join('');
        case 'LEN':
          return String(a ?? '').length;
        case 'UPPER':
          return String(a ?? '').toUpperCase();
        case 'LOWER':
          return String(a ?? '').toLowerCase();
        case 'TRIM':
          return String(a ?? '')
            .trim()
            .replace(/\s+/g, ' ');
        case 'LEFT':
          return String(a ?? '').slice(0, b === undefined ? 1 : Math.max(0, numeric(b)));
        case 'RIGHT':
          return String(a ?? '')
            .slice(-Math.max(0, b === undefined ? 1 : numeric(b)))
            .slice(b === 0 ? String(a ?? '').length : 0);
        case 'MID':
          return String(a ?? '').slice(
            Math.max(0, numeric(b) - 1),
            Math.max(0, numeric(b) - 1) + Math.max(0, numeric(c)),
          );
        case 'DATE':
          return Math.floor(
            (Date.UTC(numeric(a), numeric(b) - 1, numeric(c)) - Date.UTC(1899, 11, 30)) / 86400000,
          );
        case 'TODAY': {
          const d = new Date();
          return Math.floor(
            (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) /
              86400000,
          );
        }
        case 'YEAR':
        case 'MONTH':
        case 'DAY': {
          const d = new Date(Date.UTC(1899, 11, 30) + numeric(a) * 86400000);
          return name === 'YEAR'
            ? d.getUTCFullYear()
            : name === 'MONTH'
              ? d.getUTCMonth() + 1
              : d.getUTCDate();
        }
        case 'INDEX': {
          const matrix = Array.isArray(args[0]) ? args[0] : [[args[0]]];
          const v = matrix[numeric(b) - 1]?.[c === undefined ? 0 : numeric(c) - 1];
          if (v === undefined) fail('#REF!');
          return v;
        }
        case 'MATCH': {
          if (c !== 0) fail('#N/A');
          const ix = flat([args[1]]).findIndex((v) => compare(v, a, '='));
          if (ix < 0) fail('#N/A');
          return ix + 1;
        }
        case 'VLOOKUP': {
          if (args.length < 4 || (scalar(args[3]) !== false && scalar(args[3]) !== 0)) fail('#N/A');
          const table = Array.isArray(args[1]) ? args[1] : [[args[1]]];
          const row = table.find((row) => compare(row[0], a, '='));
          if (!row) fail('#N/A');
          if (numeric(c) < 1 || numeric(c) > row.length) fail('#REF!');
          return row[numeric(c) - 1];
        }
        default:
          fail('#NAME?');
      }
    }
    const result = scalar(evalNode(ast));
    if (typeof result === 'number' && !Number.isFinite(result)) fail('#NUM!');
    cache.set(id, result);
    return result;
  } catch (e) {
    return e instanceof FormulaError ? e.message : '#VALUE!';
  }
}
export function display(value, style = {}) {
  if (typeof value !== 'number') return String(value ?? '');
  if (style.format === 'percent')
    return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(
      value,
    );
  if (style.format === 'currency')
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value);
  if (style.format === 'number')
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  if (style.format === 'date')
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  return String(Math.round(value * 1e10) / 1e10);
}
export function blankSheet(name = 'Sheet 1') {
  return { name, cells: {}, styles: {}, merges: [], charts: [], rows: 40, columns: 16 };
}
export function newDocument(kind, template = 'blank') {
  const base = {
    id: crypto.randomUUID(),
    kind,
    title:
      kind === 'sheet'
        ? 'Untitled workbook'
        : kind === 'slides'
          ? 'Untitled presentation'
          : 'Untitled document',
    updated: new Date().toISOString(),
    studioVersion: 1,
  };
  if (kind === 'doc')
    return {
      ...base,
      html:
        template === 'report'
          ? '<h1>Project report</h1><p>Prepared by your team · ' +
            new Date().toLocaleDateString() +
            '</p><h2>Executive summary</h2><p>Describe the outcome and the decisions needed.</p><h2>Progress this period</h2><table><tbody><tr><th>Workstream</th><th>Status</th><th>Next milestone</th></tr><tr><td>Delivery</td><td>On track</td><td>Review</td></tr></tbody></table><h2>Next steps</h2><ul><li>Assign owners and agree dates.</li></ul>'
          : template === 'letter'
            ? '<h1>Your company</h1><p>Address · Contact details</p><hr><p>Dear recipient,</p><p>Write your message here.</p><p>Kind regards,<br>Your name</p>'
            : '<p><br></p>',
      page: { orientation: 'portrait', margin: 56 },
    };
  if (kind === 'sheet') {
    const s = blankSheet();
    if (template === 'budget') {
      base.title = 'Project budget';
      s.cells = {
        A1: 'Project budget',
        A3: 'Category',
        B3: 'Planned',
        C3: 'Actual',
        D3: 'Variance',
        A4: 'People',
        B4: '12000',
        C4: '11500',
        D4: '=B4-C4',
        A5: 'Software',
        B5: '1800',
        C5: '2100',
        D5: '=B5-C5',
        A6: 'Operations',
        B6: '2400',
        C6: '2000',
        D6: '=B6-C6',
        A8: 'Total',
        B8: '=SUM(B4:B6)',
        C8: '=SUM(C4:C6)',
        D8: '=B8-C8',
      };
      s.merges = ['A1:D1'];
      for (const k of ['A1', 'A3', 'B3', 'C3', 'D3', 'A8', 'B8', 'C8', 'D8'])
        s.styles[k] = { bold: true, background: '#e5f3ed' };
      s.charts = [
        { id: crypto.randomUUID(), range: 'A3:C6', type: 'bar', title: 'Budget vs actual' },
      ];
    }
    return { ...base, sheets: [s], activeSheet: 0 };
  }
  return {
    ...base,
    theme: 'forest',
    slides:
      template === 'pitch'
        ? [
            {
              title: 'A better way to work',
              body: 'Your idea, clearly told.\nA presentation by your team.',
              layout: 'title',
              notes: 'Introduce the problem and your team.',
            },
            {
              title: 'The opportunity',
              body: 'What needs to change?\nWho will benefit?\nWhat does success look like?',
              layout: 'split',
              notes: '',
            },
            {
              title: 'The plan',
              body: '01  Discover\n02  Build\n03  Deliver',
              layout: 'title-body',
              notes: '',
            },
          ]
        : [
            {
              title: 'Your next big idea',
              body: 'Start telling your story.',
              layout: 'title',
              notes: '',
            },
          ],
  };
}
