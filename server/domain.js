import { z } from 'zod';

const text = z.string().trim().min(1).max(200);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Invalid date',
  );
const projectId = z.string().max(100).default('');
const members = z.array(z.string()).max(500).default([]);
const base = { title: text, projectId };
export const schemas = {
  projects: z.object({
    title: text,
    client: text,
    po: z.string().max(100).default(''),
    rate: z.number().min(0).max(1000000),
    currency: z.enum(['EUR', 'RON', 'USD']).default('EUR'),
    budgetHours: z.number().min(0).max(1000000).default(0),
    members,
    calendarId: z.string().default('default'),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#386a56'),
    status: z.enum(['Active', 'On hold', 'Completed']).default('Active'),
  }),
  documents: z
    .object({
      ...base,
      kind: z.enum(['doc', 'sheet', 'slides', 'note']),
      content: z.any(),
      folderId: z.string().default(''),
    })
    .superRefine((d, ctx) => {
      if (!validContent(d.kind, d.content))
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid or oversized document content',
          path: ['content'],
        });
    }),
  tasks: z.object({
    ...base,
    description: z.string().max(20000).default(''),
    status: z.enum(['Backlog', 'In progress', 'In review', 'Done']).default('Backlog'),
    priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
    assignee: z.string().default(''),
    due: date.optional(),
  }),
  timesheets: z.object({
    projectId: text,
    date,
    hours: z.number().gt(0).max(24),
    description: text,
    billable: z.boolean().default(true),
    status: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected']).default('Draft'),
    userId: z.string().optional(),
  }),
  leave: z
    .object({
      start: date,
      end: date,
      type: z.enum(['Annual', 'Sick', 'Unpaid']),
      reason: z.string().max(1000).default(''),
      calendarId: z.string().default('default'),
      status: z.enum(['Pending', 'Approved', 'Rejected']).default('Pending'),
      userId: z.string().optional(),
    })
    .refine(
      (v) => v.end >= v.start && daysBetween(v.start, v.end) <= 366,
      'Invalid leave interval',
    ),
  calendars: z
    .object({
      title: text,
      year: z.number().int().min(2000).max(2200),
      calendarId: text,
      holidays: z.array(date).max(366),
      weekend: z.array(z.number().int().min(0).max(6)).default([0, 6]),
    })
    .refine(
      (v) => v.holidays.every((d) => d.startsWith(String(v.year))),
      'Holiday must belong to calendar year',
    ),
  entitlements: z.object({
    userId: text,
    year: z.number().int().min(2000).max(2200),
    days: z.number().min(0).max(366),
    carryLimit: z.number().min(0).max(366).default(5),
    calendarId: z.string().default('default'),
  }),
  channels: z.object({ title: text, projectId, description: z.string().max(1000).default('') }),
  messages: z.object({ channelId: text, text: z.string().trim().min(1).max(10000) }),
  events: z
    .object({
      ...base,
      start: z.string().datetime(),
      end: z.string().datetime(),
      attendees: members,
      description: z.string().max(5000).default(''),
      room: z.string().max(100).default(''),
    })
    .refine((v) => v.end > v.start, 'End must be after start'),
  folders: z.object({ ...base, parentId: z.string().default('') }),
  pages: z.object({
    ...base,
    content: z.string().max(100000),
    category: z.enum(['Knowledge', 'Announcement', 'Policy']).default('Knowledge'),
  }),
  mail: z.object({ to: z.string().email(), subject: text, body: z.string().min(1).max(50000) }),
};

function validContent(kind, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  if (kind === 'sheet')
    return (
      content.cells &&
      typeof content.cells === 'object' &&
      !Array.isArray(content.cells) &&
      Object.keys(content.cells).length <= 50000 &&
      Object.entries(content.cells).every(
        ([key, value]) =>
          /^[A-Z]{1,3}[1-9]\d{0,4}$/.test(key) &&
          typeof value === 'string' &&
          value.length <= 10000,
      )
    );
  if (kind === 'slides')
    return (
      Array.isArray(content.slides) &&
      content.slides.length > 0 &&
      content.slides.length <= 200 &&
      content.slides.every(
        (s) =>
          s &&
          typeof s.title === 'string' &&
          typeof s.body === 'string' &&
          s.title.length <= 1000 &&
          s.body.length <= 30000,
      )
    );
  let count = 0;
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 20 || ++count > 20000) return false;
    if (
      ![
        'doc',
        'paragraph',
        'heading',
        'text',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'hardBreak',
        'horizontalRule',
      ].includes(node.type)
    )
      return false;
    if (node.type === 'text' && (typeof node.text !== 'string' || !node.text.length)) return false;
    if (
      node.content &&
      (!Array.isArray(node.content) || !node.content.every((n) => walk(n, depth + 1)))
    )
      return false;
    return true;
  };
  return content.type === 'doc' && walk(content, 0);
}

export function daysBetween(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}
export function workingDays(start, end, calendars = [], calendarId = 'default') {
  if (end < start || daysBetween(start, end) > 3660) return 0;
  let days = 0;
  for (
    let d = new Date(start + 'T00:00:00Z');
    d <= new Date(end + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10),
      cal = calendars.find((c) => c.calendarId === calendarId && c.year === d.getUTCFullYear());
    if (!(cal?.weekend ?? [0, 6]).includes(d.getUTCDay()) && !cal?.holidays.includes(key)) days++;
  }
  return days;
}
export function leaveBalance(
  userId,
  year,
  entitlements,
  leaves,
  calendars,
  calendarId = 'default',
) {
  const entitlement = entitlements.find(
    (e) => e.userId === userId && e.year === year && e.calendarId === calendarId,
  );
  const previous = entitlements.find(
    (e) => e.userId === userId && e.year === year - 1 && e.calendarId === calendarId,
  );
  const usedFor = (y) =>
    leaves
      .filter(
        (l) =>
          l.userId === userId &&
          l.type === 'Annual' &&
          l.status === 'Approved' &&
          l.calendarId === calendarId,
      )
      .reduce(
        (s, l) =>
          s +
          workingDays(
            l.start < `${y}-01-01` ? `${y}-01-01` : l.start,
            l.end > `${y}-12-31` ? `${y}-12-31` : l.end,
            calendars,
            calendarId,
          ),
        0,
      );
  // Carry only unused base entitlement from the previous year; never roll already-carried days indefinitely.
  const carry = Math.min(
    entitlement?.carryLimit ?? 0,
    Math.max(0, (previous?.days ?? 0) - usedFor(year - 1)),
  );
  const days = entitlement?.days ?? 0,
    used = usedFor(year);
  return {
    year,
    days,
    carry,
    used,
    remaining: days + carry - used,
    configured: Boolean(entitlement),
  };
}

// Small, deterministic formula evaluator. No eval/Function, external links or macros.
export function evaluateCell(cells, address, seen = new Set(), budget = { remaining: 10000 }) {
  if (--budget.remaining < 0) return '#LIMIT!';
  const raw = String(cells[address] ?? '');
  if (!raw.startsWith('=')) return raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  if (seen.has(address) || seen.size > 100) return '#CYCLE!';
  const chain = new Set(seen).add(address);
  try {
    let source = raw
      .slice(1)
      .toUpperCase()
      .replace(/\b(SUM|AVERAGE|MIN|MAX)\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_, fn, a, b) => {
        const col = (s) =>
          [...s.match(/[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
        const label = (n) => {
          let s = '';
          for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
          return s;
        };
        const values = [];
        for (let r = +a.match(/\d+/)[0]; r <= +b.match(/\d+/)[0]; r++)
          for (let c = col(a); c <= col(b); c++) {
            if (values.length > 10000) throw Error('range');
            const value = evaluateCell(cells, `${label(c)}${r}`, chain, budget);
            if (typeof value === 'string' && value.startsWith('#')) throw Error(value);
            if (value !== '' && Number.isFinite(Number(value))) values.push(Number(value));
          }
        if (!values.length) return '0';
        return String(
          fn === 'MIN'
            ? Math.min(...values)
            : fn === 'MAX'
              ? Math.max(...values)
              : values.reduce((s, n) => s + n, 0) / (fn === 'AVERAGE' ? values.length : 1),
        );
      })
      .replace(/\b[A-Z]+\d+\b/g, (ref) => {
        const value = evaluateCell(cells, ref, chain, budget);
        if (!Number.isFinite(Number(value))) throw Error(String(value));
        return `(${Number(value)})`;
      });
    const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
    if (tokens.join('') !== source.replace(/\s/g, '')) return '#ERROR!';
    let i = 0;
    const atom = () => {
      const t = tokens[i++];
      if (t === '-') return -atom();
      if (t === '+') return atom();
      if (t === '(') {
        const v = expr();
        if (tokens[i++] !== ')') throw Error();
        return v;
      }
      if (!t || !/^\d/.test(t)) throw Error();
      return Number(t);
    };
    const term = () => {
      let v = atom();
      while (['*', '/'].includes(tokens[i])) {
        const op = tokens[i++],
          n = atom();
        v = op === '*' ? v * n : v / n;
      }
      return v;
    };
    const expr = () => {
      let v = term();
      while (['+', '-'].includes(tokens[i])) {
        const op = tokens[i++],
          n = term();
        v = op === '+' ? v + n : v - n;
      }
      return v;
    };
    const result = expr();
    return i !== tokens.length
      ? '#ERROR!'
      : Number.isFinite(result)
        ? Math.round(result * 1e10) / 1e10
        : '#DIV/0!';
  } catch (e) {
    return e.message === '#CYCLE!' ? '#CYCLE!' : '#ERROR!';
  }
}
