export type Item = Record<string, any>;
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
  mustChangePassword?: boolean;
  department?: string;
  jobTitle?: string;
  calendarId?: string;
  managerId?: string;
  company?: string;
};
export type State = Record<string, Item[]>;
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export const getCsrf = () => csrf;
export async function api(path: string, method = 'GET', data?: unknown): Promise<any> {
  const form = data instanceof FormData;
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': csrf },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(Error(result.error || 'Request failed'), { status: response.status });
  return result;
}
export const save = (kind: string, data: Item) =>
  api(`/entities/${kind}${data.id ? '/' + data.id : ''}`, data.id ? 'PUT' : 'POST', data);
export const initials = (name: string) =>
  name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const niceDate = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const currency = (value: number, unit = 'EUR') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: unit }).format(value);
export function downloadCsv(name: string, rows: unknown[][]) {
  const content = rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v ?? '');
          if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
