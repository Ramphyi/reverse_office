// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { api, isoToday, type Item, type User, type State } from './api';
import { FormModal } from './components';
export function Mascot({ busy = false }: { busy?: boolean }) {
  return (
    <span className={`nova-mascot ${busy ? 'thinking' : ''}`} aria-hidden="true">
      <i />
      <i />
      <b />
    </span>
  );
}
export function Appearance() {
  const [accent, setAccent] = useState(localStorage.getItem('ro-accent') || '#47896c');
  const [density, setDensity] = useState(localStorage.getItem('ro-density') || 'comfortable');
  useEffect(() => {
    document.documentElement.style.setProperty('--green', accent);
    document.documentElement.style.setProperty('--green-dark', accent);
    document.documentElement.dataset.density = density;
    localStorage.setItem('ro-accent', accent);
    localStorage.setItem('ro-density', density);
  }, [accent, density]);
  return (
    <details className="appearance-control">
      <summary aria-label="Customize appearance">🎨</summary>
      <div>
        <label>
          Accent color
          <input
            aria-label="Accent color"
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          />
        </label>
        <label>
          Density
          <select
            aria-label="Interface density"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <button
          onClick={() => {
            setAccent('#47896c');
            setDensity('comfortable');
          }}
        >
          Reset appearance
        </button>
      </div>
    </details>
  );
}
export function AppWindows({ page }: { page: string }) {
  const url = `/?app=${encodeURIComponent(page)}`;
  const [installer, setInstaller] = useState<any>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstaller(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  return (
    <div className="app-window-actions">
      {installer && (
        <button
          className="button secondary"
          onClick={async () => {
            await installer.prompt();
            setInstaller(null);
          }}
        >
          Install app
        </button>
      )}
      <a className="button secondary" href={url} target="_blank" rel="noopener">
        Open in new tab
      </a>
      <button
        className="button secondary"
        onClick={() =>
          window.open(url + '&window=1', '_blank', 'popup,width=1280,height=900,noopener')
        }
      >
        Open in window
      </button>
    </div>
  );
}
export function AttendanceInbox({ onOpen }: { onOpen: () => void }) {
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () =>
      api('/attendance-alerts')
        .then((items) => {
          setItems(items);
          setError('');
        })
        .catch(() => setError('Attendance could not be refreshed. Try again shortly.'));
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="attendance-inbox">
      <button
        className="button secondary"
        aria-label="Nova attendance alerts"
        onClick={() => setOpen(!open)}
      >
        ◉ {items.length || ''}
      </button>
      {open && (
        <section>
          <h3>Nova · Attendance</h3>
          <p>
            Missing time from the last 7 completed days. Approved leave and holidays are excluded.
          </p>
          {error && <p role="alert">{error}</p>}
          {!error && !items.length && <p>Nothing to catch up on.</p>}
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
            >
              <strong>{a.name}</strong> · {a.date} <b>{a.missing}h missing</b>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
export function OrganisationGraph({
  users,
  state,
  onConnect,
}: {
  users: User[];
  state: State;
  onConnect: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [error, setError] = useState('');
  const people = users.filter((u) => u.active);
  const card = (u: User, seen: string[] = []): any => {
    if (seen.includes(u.id)) return null;
    const children = people.filter((c) => c.managerId === u.id);
    return (
      <li key={u.id}>
        <article
          className={
            query &&
            !`${u.name} ${u.company} ${u.department}`.toLowerCase().includes(query.toLowerCase())
              ? 'dimmed'
              : ''
          }
        >
          <strong>{u.name}</strong>
          <span>
            {u.jobTitle || u.role} · {u.company || u.department || 'Workspace'}
          </span>
          <small>
            {(state.projects || [])
              .filter((p) => p.members.includes(u.id))
              .map((p) => p.title)
              .join(' · ') || 'No assigned projects'}
          </small>
          <button
            onClick={async () => {
              try {
                const channel = await api('/chat/direct', 'POST', { userId: u.id });
                onConnect(channel.id);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Connect
          </button>
        </article>
        {children.length > 0 && <ul>{children.map((c) => card(c, [...seen, u.id]))}</ul>}
      </li>
    );
  };
  return (
    <section>
      {error && <p role="alert">{error}</p>}
      <div className="section-bar">
        <div>
          <h2>People & reporting lines</h2>
          <p>Projects and companies are shown only where your account has access.</p>
        </div>
        <input
          aria-label="Find in organisation"
          placeholder="Find a person, company or department"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="org-tree">
        <ul>
          {people.filter((u) => !people.some((p) => p.id === u.managerId)).map((u) => card(u))}
        </ul>
      </div>
    </section>
  );
}
export function CostManagement({
  users,
  projects,
  initialUser,
}: {
  users: User[];
  projects: Item[];
  initialUser?: string;
}) {
  const [rates, setRates] = useState<Item[]>([]),
    [report, setReport] = useState<Item>({ rows: [], totals: [] }),
    [month, setMonth] = useState(isoToday().slice(0, 7)),
    [editing, setEditing] = useState<Item | null>(initialUser ? { userId: initialUser } : null),
    [error, setError] = useState('');
  const refresh = async () => {
    const [r, c] = await Promise.all([api('/compensation'), api('/cost-report?month=' + month)]);
    setRates(r);
    setReport(c);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [month]);
  return (
    <section className="cost-workspace">
      <div className="section-bar">
        <div>
          <h2>Compensation & project costs</h2>
          <p>
            Administrator-only rates. Monthly salary is allocated using the configured monthly
            hours; this is a cost estimate, not payroll.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing({})}>
          Add salary / project rate
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <input
        type="month"
        aria-label="Cost report month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <div className="stat-row">
        {report.totals.map((t: Item) => (
          <article className="panel" key={t.currency}>
            <h3>{t.currency}</h3>
            <p>Allocated cost: {t.cost.toFixed(2)}</p>
            <p>Priced revenue: {t.revenue.toFixed(2)}</p>
            <small>{t.unpricedRevenue} entries without a client rate</small>
          </article>
        ))}
      </div>
      <p>
        {report.missingRates || 0} entries have no applicable employee rate. Currencies are kept
        separate.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Project</th>
              <th>Effective</th>
              <th>Compensation</th>
              <th>Client hourly rate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{users.find((u) => u.id === r.userId)?.name}</td>
                <td>
                  {projects.find((p) => p.id === r.projectId)?.title || 'Default employee rate'}
                </td>
                <td>{r.effective}</td>
                <td>
                  {r.amount} {r.currency} / {r.basis}
                </td>
                <td>{r.clientRate ?? 'Not set'}</td>
                <td>
                  <button className="text-link" onClick={() => setEditing(r)}>
                    Edit rate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee / project</th>
              <th>Hours</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r: Item) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>
                  {r.name}
                  <small>{r.project}</small>
                </td>
                <td>{r.hours}</td>
                <td>{r.cost === null ? 'Missing rate' : `${r.cost.toFixed(2)} ${r.currency}`}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <FormModal
          title="Employee compensation"
          initial={editing}
          onClose={() => setEditing(null)}
          fields={[
            {
              key: 'userId',
              label: 'Employee',
              type: 'select',
              required: true,
              default: initialUser || users[0]?.id,
              options: users
                .filter((u) => u.active && u.role !== 'guest')
                .map((u) => ({ value: u.id, label: u.name })),
            },
            {
              key: 'projectId',
              label: 'Project override',
              type: 'select',
              default: '',
              options: [
                { value: '', label: 'Default for all projects' },
                ...projects.map((p) => ({ value: p.id, label: p.title })),
              ],
            },
            {
              key: 'effective',
              label: 'Effective from',
              type: 'date',
              default: isoToday(),
              required: true,
            },
            {
              key: 'basis',
              label: 'Pay basis',
              type: 'select',
              default: 'monthly',
              options: [
                { value: 'monthly', label: 'Monthly salary' },
                { value: 'hourly', label: 'Hourly cost' },
              ],
            },
            {
              key: 'amount',
              label: 'Salary / hourly cost',
              type: 'number',
              min: 0,
              max: 10000000,
              step: '0.01',
              required: true,
            },
            {
              key: 'monthlyHours',
              label: 'Monthly hours for cost allocation',
              type: 'number',
              min: 1,
              max: 744,
              default: 160,
            },
            { key: 'currency', label: 'Currency (ISO code)', default: 'EUR', required: true },
            {
              key: 'clientRate',
              label: 'Client hourly rate (same currency, optional)',
              type: 'number',
              min: 0,
              max: 1000000,
              step: '0.01',
            },
          ]}
          onSubmit={async (d) => {
            await api('/compensation', 'POST', {
              ...d,
              clientRate: d.clientRate === '' ? null : d.clientRate,
              currency: d.currency.toUpperCase(),
            });
            await refresh();
          }}
        />
      )}
    </section>
  );
}
