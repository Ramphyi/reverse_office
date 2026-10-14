import { ConnectorSettings } from './AssistantOutputs';
import { CostManagement } from './WorkspaceExperience';
import { TimeEntry } from './TimeEntry';
import { AISettings } from './AISettings';
import { WorkCalendar } from './WorkCalendar';
import { People } from './People';
import { Organisation } from './Organisation';
import { useEffect, useState } from 'react';
import {
  Plus,
  Clock3,
  Check,
  X,
  Download,
  CalendarDays,
  Users,
  ShieldCheck,
  Settings2,
  ArrowUpRight,
  Activity,
  FileText,
  Printer,
  KeyRound,
} from 'lucide-react';
import {
  api,
  save,
  isoToday,
  niceDate,
  initials,
  currency,
  downloadCsv,
  type State,
  type Item,
  type User,
} from './api';
import { Badge, Empty, FormModal, Select, type Field } from './components';
type Props = {
  state: State;
  user: User;
  users: User[];
  refresh: () => Promise<void>;
  notify: (text: string) => void;
};
const isManager = (user: User) => ['admin', 'manager'].includes(user.role);
export function TimeWorkspace(props: Props) {
  const [view, setView] = useState('time');
  return (
    <>
      <div className="tabs attendance-tabs">
        <button className={view === 'time' ? 'active' : ''} onClick={() => setView('time')}>
          Time entries
        </button>
        <button className={view === 'leave' ? 'active' : ''} onClick={() => setView('leave')}>
          Time off
        </button>
      </div>
      {view === 'time' ? <Timesheets {...props} /> : <TimeOff {...props} />}
    </>
  );
}
export function Timesheets({ state, user, users, refresh, notify }: Props) {
  const [editing, setEditing] = useState<Item | null>(null),
    [tab, setTab] = useState('mine'),
    [month, setMonth] = useState(localStorage.getItem('work-month') || isoToday().slice(0, 7));
  const all = state.timesheets ?? [],
    rows = all
      .filter(
        (t) =>
          t.date.startsWith(month) &&
          (tab === 'approvals' ? t.status === 'Submitted' : t.userId === user.id),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((s, r) => s + r.hours, 0),
    approved = rows.filter((r) => r.status === 'Approved').reduce((s, r) => s + r.hours, 0),
    billable = rows.filter((r) => r.billable).reduce((s, r) => s + r.hours, 0);
  const approve = async (row: Item, status: string) => {
    try {
      await api(`/approve/timesheets/${row.id}`, 'POST', { status, version: row.version });
      await refresh();
      notify(`Timesheet ${status.toLowerCase()}`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const exportRows = () =>
    downloadCsv('timesheets.csv', [
      ['Employee', 'Date', 'Project', 'Activity', 'Hours', 'Billable', 'Description', 'Status'],
      ...rows.map((r) => [
        users.find((u) => u.id === r.userId)?.name,
        r.date,
        state.projects?.find((p) => p.id === r.projectId)?.title,
        r.activity || 'Work from office',
        r.hours,
        r.billable,
        r.description,
        r.status,
      ]),
    ]);
  return (
    <>
      <WorkCalendar
        state={state}
        user={user}
        users={users}
        refresh={refresh}
        notify={notify}
        monthValue={month}
        onMonthChange={setMonth}
      />
      <div className="stat-row">
        <Stat label="Recorded this month" value={`${total.toFixed(1)} h`} icon={Clock3} />
        <Stat label="Approved time" value={`${approved.toFixed(1)} h`} icon={Check} />
        <Stat label="Billable hours" value={`${billable.toFixed(1)} h`} icon={Activity} />
      </div>
      <div className="section-bar">
        <div className="tabs">
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
            My timesheets
          </button>
          {isManager(user) && (
            <button
              className={tab === 'approvals' ? 'active' : ''}
              onClick={() => setTab('approvals')}
            >
              Approvals{' '}
              <span className="count">{all.filter((t) => t.status === 'Submitted').length}</span>
            </button>
          )}
        </div>
        <div className="heading-actions">
          <input
            aria-label="Timesheet month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button className="button secondary" onClick={exportRows}>
            <Download size={15} /> Export
          </button>
          <button className="button primary" onClick={() => setEditing({})}>
            <Plus size={16} /> Log time
          </button>
        </div>
      </div>
      <div className="panel data-table">
        <table>
          <thead>
            <tr>
              <th>Date / person</th>
              <th>Project & work</th>
              <th>Hours</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{niceDate(r.date)}</strong>
                  <small>{users.find((u) => u.id === r.userId)?.name}</small>
                </td>
                <td>
                  <strong>{state.projects?.find((p) => p.id === r.projectId)?.title}</strong>
                  <small>
                    {r.activity || 'Work from office'} · {r.description}
                  </small>
                </td>
                <td>
                  <b>{r.hours}h</b>
                </td>
                <td>{r.billable ? 'Billable' : 'Non-billable'}</td>
                <td>
                  <Badge>{r.status}</Badge>
                </td>
                <td>
                  <div className="row-actions">
                    {r.userId === user.id && ['Draft', 'Rejected'].includes(r.status) && (
                      <>
                        <button onClick={() => setEditing(r)} className="text-link">
                          Edit
                        </button>
                        <button
                          className="button tiny-button secondary"
                          onClick={async () => {
                            try {
                              await save('timesheets', { ...r, status: 'Submitted' });
                              await refresh();
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          Submit
                        </button>
                      </>
                    )}
                    {isManager(user) && r.status === 'Submitted' && r.userId !== user.id && (
                      <>
                        <button
                          className="icon-button approve"
                          aria-label="Approve timesheet"
                          onClick={() => approve(r, 'Approved')}
                        >
                          <Check size={17} />
                        </button>
                        <button
                          className="icon-button reject"
                          aria-label="Reject timesheet"
                          onClick={() => approve(r, 'Rejected')}
                        >
                          <X size={17} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title={tab === 'approvals' ? 'All caught up' : 'Your time, thoughtfully tracked'}
            description={
              tab === 'approvals'
                ? 'No submitted entries for this month.'
                : 'Log your work against a project to get started.'
            }
          />
        )}
      </div>
      <p className="footnote">
        <ShieldCheck size={14} /> Submitted hours are locked. A different manager reviews and
        approves your work.
      </p>
      {editing && (
        <TimeEntry
          initial={editing}
          projects={state.projects || []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
            notify('Calendar updated');
          }}
        />
      )}
    </>
  );
}
function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="stat-card">
      <span>
        {label}
        <Icon size={18} />
      </span>
      <strong>{value}</strong>
    </div>
  );
}
export function TimeOff({ state, user, users, refresh, notify }: Props) {
  const [open, setOpen] = useState(false),
    [year, setYear] = useState(
      Number((localStorage.getItem('work-month') || isoToday()).slice(0, 4)),
    ),
    [workMonth, setWorkMonth] = useState(
      localStorage.getItem('work-month') || isoToday().slice(0, 7),
    ),
    [balance, setBalance] = useState<Item>({}),
    [calendar, setCalendar] = useState(user.calendarId || 'default');
  useEffect(() => {
    if (!user.calendarId)
      api('/organisation')
        .then((org) => setCalendar(org.calendarId))
        .catch((e) => notify(e.message));
  }, [user.calendarId]);
  useEffect(() => {
    api(`/leave-balance?year=${year}&calendarId=${encodeURIComponent(calendar)}`)
      .then(setBalance)
      .catch((e) => notify(e.message));
  }, [year, calendar, state]);
  const rows = (state.leave ?? []).filter(
    (l) => l.start.slice(0, 4) <= String(year) && l.end.slice(0, 4) >= String(year),
  );
  const calendars = [...new Set((state.calendars ?? []).map((c) => c.calendarId))];
  const approve = async (row: Item, status: string) => {
    try {
      await api(`/approve/leave/${row.id}`, 'POST', { status, version: row.version });
      await refresh();
      notify(`Leave ${status.toLowerCase()}`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <WorkCalendar
        state={state}
        user={user}
        users={users}
        refresh={refresh}
        notify={notify}
        monthValue={workMonth}
        onMonthChange={(v) => {
          setWorkMonth(v);
          setYear(Number(v.slice(0, 4)));
        }}
      />
      <div className="section-bar">
        <div className="heading-actions">
          <Select
            label="Leave year"
            value={String(year)}
            onChange={(v) => {
              setYear(Number(v));
              setWorkMonth(v + '-' + workMonth.slice(5));
            }}
            options={Array.from({ length: 5 }, (_, i) => ({
              value: String(new Date().getFullYear() - 2 + i),
              label: String(new Date().getFullYear() - 2 + i),
            }))}
          />
          <Select
            label="Leave calendar"
            value={calendar}
            onChange={setCalendar}
            options={calendars.map((v) => ({ value: v, label: v }))}
          />
        </div>
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> Request time off
        </button>
      </div>
      <div className="stat-row four">
        <Stat label="Annual allowance" value={`${balance.days ?? 0} days`} icon={CalendarDays} />
        <Stat
          label="Carried from last year"
          value={`${balance.carry ?? 0} days`}
          icon={ArrowUpRight}
        />
        <Stat label="Approved leave" value={`${balance.used ?? 0} days`} icon={Check} />
        <Stat label="Available to you" value={`${balance.remaining ?? 0} days`} icon={Clock3} />
      </div>
      {!balance.configured && (
        <div className="notice">
          Your leave entitlement is not configured for {year}. Ask an administrator to add it.
        </div>
      )}
      <div className="section-bar">
        <h2>Leave requests</h2>
        <span className="muted small">Weekends and calendar holidays are excluded</span>
      </div>
      <div className="panel data-table">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Dates</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="table-person">
                    <span className="avatar tiny">
                      {initials(users.find((u) => u.id === r.userId)?.name || '?')}
                    </span>
                    {users.find((u) => u.id === r.userId)?.name}
                  </span>
                </td>
                <td>
                  {niceDate(r.start)} – {niceDate(r.end)}
                </td>
                <td>{r.type}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <Badge>{r.status}</Badge>
                </td>
                <td>
                  {isManager(user) && r.status === 'Pending' && r.userId !== user.id && (
                    <div className="row-actions">
                      <button
                        className="icon-button approve"
                        aria-label="Approve leave"
                        onClick={() => approve(r, 'Approved')}
                      >
                        <Check size={17} />
                      </button>
                      <button
                        className="icon-button reject"
                        aria-label="Reject leave"
                        onClick={() => approve(r, 'Rejected')}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  )}
                  {r.userId === user.id && r.status === 'Pending' && (
                    <button
                      className="text-link"
                      onClick={async () => {
                        if (confirm('Cancel this leave request?'))
                          try {
                            await api(`/entities/leave/${r.id}`, 'DELETE');
                            await refresh();
                          } catch (e) {
                            notify((e as Error).message);
                          }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title="Make room for a little time away"
            description="Your leave requests will appear here."
          />
        )}
      </div>
      <p className="footnote">
        Carryover uses unused base allowance from the previous year, capped by the annual carry
        limit. Cross-year requests are checked against each year separately.
      </p>
      {open && (
        <FormModal
          title="Request time off"
          onClose={() => setOpen(false)}
          fields={[
            {
              key: 'type',
              label: 'Leave type',
              type: 'select',
              options: ['Annual', 'Sick', 'Unpaid', 'Special occasion'].map((v) => ({
                value: v,
                label: v,
              })),
              default: 'Annual',
            },
            { key: 'start', label: 'First day', type: 'date', required: true },
            { key: 'end', label: 'Last day', type: 'date', required: true },
            {
              key: 'calendarId',
              label: 'Project / company calendar',
              type: 'select',
              options: calendars.map((v) => ({ value: v, label: v })),
              default: calendar,
            },
            { key: 'reason', label: 'Note for your manager', type: 'textarea' },
          ]}
          submitLabel="Send request"
          onSubmit={async (data) => {
            await save('leave', data);
            await refresh();
            notify('Leave request sent for approval');
          }}
        />
      )}
    </>
  );
}
export function Reports({ state, notify }: { state: State; notify: (t: string) => void }) {
  const [start, setStart] = useState(isoToday().slice(0, 7) + '-01'),
    [end, setEnd] = useState(isoToday()),
    [project, setProject] = useState(''),
    [report, setReport] = useState<Item | null>(null);
  const load = async () => {
    try {
      setReport(await api(`/reports?start=${start}&end=${end}&projectId=${project}`));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="report-toolbar panel">
        <label>
          From
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label>
          Project
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {state.projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" onClick={load}>
          Generate report <ArrowUpRight size={16} />
        </button>
      </div>
      {report && (
        <>
          <div className="stat-row">
            <Stat label="Approved hours" value={`${report.hours} h`} icon={Clock3} />
            {Object.entries(report.totals).map(([unit, value]) => (
              <Stat
                key={unit}
                label={`Billable amount · ${unit}`}
                value={currency(value as number, unit)}
                icon={Activity}
              />
            ))}
          </div>
          <div className="section-bar">
            <div>
              <h2>Client activity report</h2>
              <small className="muted">
                {report.start} — {report.end} · approved entries only
              </small>
            </div>
            <div className="heading-actions">
              <button className="button secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print / PDF
              </button>
              <button
                className="button primary"
                onClick={() =>
                  downloadCsv('client-report.csv', [
                    [
                      'Date',
                      'Employee',
                      'Client',
                      'Project',
                      'PO',
                      'Description',
                      'Hours',
                      'Rate',
                      'Amount',
                      'Currency',
                    ],
                    ...report.rows.map((r: Item) => [
                      r.date,
                      r.employee,
                      r.client,
                      r.project,
                      r.po,
                      r.description,
                      r.hours,
                      r.rate,
                      r.amount,
                      r.currency,
                    ]),
                  ])
                }
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
          <div className="panel data-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person / work</th>
                  <th>Client / PO</th>
                  <th>Hours</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: Item) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      <strong>{r.employee}</strong>
                      <small>{r.description}</small>
                    </td>
                    <td>
                      <strong>{r.client}</strong>
                      <small>
                        {r.project} · {r.po}
                      </small>
                    </td>
                    <td>{r.hours}h</td>
                    <td>{currency(r.rate, r.currency)}</td>
                    <td>
                      <strong>{currency(r.amount, r.currency)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length && (
              <Empty
                title="Ready when the work is approved"
                description="Approve submitted timesheets to build a client report."
              />
            )}
          </div>
          <p className="footnote">
            Rates and purchase orders are frozen when a timesheet is approved. This activity report
            is not a tax invoice. Romanian invoicing and SPV are maintained on the separate Romania
            branch.
          </p>
        </>
      )}
    </>
  );
}
export function Admin({
  state,
  user,
  users,
  refresh,
  integrations,
  notify,
}: Props & { integrations: Item }) {
  const [tab, setTab] = useState('people'),
    [form, setForm] = useState<{
      title: string;
      fields: Field[];
      initial?: Item;
      submit: (data: Item) => Promise<void>;
    } | null>(null),
    [audit, setAudit] = useState<Item | null>(null);
  const year = new Date().getFullYear();
  useEffect(() => {
    if (tab === 'audit')
      api('/audit')
        .then(setAudit)
        .catch((e) => notify(e.message));
  }, [tab]);
  const calendarForm = (initial?: Item) =>
    setForm({
      title: initial?.id ? 'Edit calendar' : 'Create yearly calendar',
      initial: initial
        ? { ...initial, holidays: initial.holidays.join('\n'), weekend: initial.weekend.join(',') }
        : undefined,
      fields: [
        { key: 'title', label: 'Calendar name', required: true },
        {
          key: 'calendarId',
          label: 'Calendar identifier',
          required: true,
          default: 'default',
          help: 'Use the same identifier across years and in project settings.',
        },
        {
          key: 'year',
          label: 'Year',
          type: 'number',
          min: 2000,
          max: 2200,
          default: year,
          required: true,
        },
        {
          key: 'holidays',
          label: 'Non-working days',
          type: 'textarea',
          help: 'One date per line in YYYY-MM-DD format. Configure holidays for each year.',
        },
        { key: 'weekend', label: 'Weekend days (0 = Sunday, 6 = Saturday)', default: '0,6' },
      ],
      submit: async (data) => {
        await save('calendars', {
          ...data,
          holidays: String(data.holidays)
            .split(/[\s,]+/)
            .filter(Boolean),
          weekend: String(data.weekend).split(',').filter(Boolean).map(Number),
        });
        await refresh();
        notify('Calendar saved');
      },
    });
  const entitlementForm = (initial?: Item) =>
    setForm({
      title: 'Annual leave allowance',
      initial,
      fields: [
        {
          key: 'userId',
          label: 'Employee',
          type: 'select',
          options: users.map((u) => ({ value: u.id, label: u.name })),
          default: users[0]?.id,
          required: true,
        },
        {
          key: 'year',
          label: 'Year',
          type: 'number',
          min: 2000,
          max: 2200,
          default: year,
          required: true,
        },
        {
          key: 'days',
          label: 'Base allowance (days)',
          type: 'number',
          min: 0,
          max: 366,
          default: 21,
          required: true,
        },
        {
          key: 'carryLimit',
          label: 'Maximum carryover from previous year',
          type: 'number',
          min: 0,
          max: 366,
          default: 5,
        },
        { key: 'calendarId', label: 'Calendar identifier', default: 'default', required: true },
      ],
      submit: async (data) => {
        await save('entitlements', data);
        await refresh();
        notify('Allowance saved');
      },
    });
  return (
    <>
      <div className="tabs admin-tabs">
        {[
          { id: 'people', name: 'People', Icon: Users },
          { id: 'organisation', name: 'Organisation', Icon: Settings2 },
          { id: 'ai', name: 'AI settings', Icon: Settings2 },
          ...(user.role === 'admin'
            ? [{ id: 'costs', name: 'Compensation & costs', Icon: Activity }]
            : []),
          { id: 'calendars', name: 'Calendars', Icon: CalendarDays },
          { id: 'entitlements', name: 'Leave allowances', Icon: Clock3 },
          ...(user.role === 'admin' ? [{ id: 'audit', name: 'Audit log', Icon: ShieldCheck }] : []),
          { id: 'settings', name: 'Integrations & account', Icon: Settings2 },
        ].map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <t.Icon size={16} />
            {t.name}
          </button>
        ))}
      </div>
      {tab === 'people' && (
        <People state={state} user={user} users={users} refresh={refresh} notify={notify} />
      )}
      {tab === 'organisation' && (
        <Organisation state={state} user={user} users={users} refresh={refresh} notify={notify} />
      )}
      {tab === 'ai' && (
        <>
          <AISettings admin={user.role === 'admin'} />
          {user.role === 'admin' && <ConnectorSettings />}
        </>
      )}
      {tab === 'costs' && user.role === 'admin' && (
        <CostManagement users={users} projects={state.projects || []} />
      )}
      {tab === 'calendars' && (
        <>
          <div className="section-bar">
            <h2>Project calendars</h2>
            <button className="button primary" onClick={() => calendarForm()}>
              <Plus size={16} /> Add calendar year
            </button>
          </div>
          <div className="knowledge-grid">
            {state.calendars?.map((c) => (
              <article className="knowledge-card" key={c.id}>
                <CalendarDays size={25} />
                <Badge>{c.year}</Badge>
                <h2>{c.title}</h2>
                <p>
                  Identifier: {c.calendarId}
                  <br />
                  {c.holidays.length} holidays configured
                  <br />
                  Weekend days: {c.weekend.join(', ')}
                </p>
                <div className="holiday-tags">
                  {c.holidays.map((d: string) => (
                    <span key={d}>{niceDate(d)}</span>
                  ))}
                </div>
                <button className="button secondary" onClick={() => calendarForm(c)}>
                  Edit calendar
                </button>
                <button
                  className="button secondary"
                  disabled={state.calendars?.some(
                    (next) => next.calendarId === c.calendarId && next.year === c.year + 1,
                  )}
                  onClick={() =>
                    calendarForm({
                      ...c,
                      id: undefined,
                      version: undefined,
                      year: c.year + 1,
                      holidays: [],
                    })
                  }
                >
                  Create next year
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === 'entitlements' && (
        <>
          <div className="section-bar">
            <h2>Annual allowances & rollover</h2>
            <button className="button primary" onClick={() => entitlementForm()}>
              <Plus size={16} /> Add allowance
            </button>
          </div>
          <div className="panel data-table">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Year</th>
                  <th>Base allowance</th>
                  <th>Carryover cap</th>
                  <th>Calendar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.entitlements?.map((e) => (
                  <tr key={e.id}>
                    <td>{users.find((u) => u.id === e.userId)?.name}</td>
                    <td>{e.year}</td>
                    <td>{e.days} days</td>
                    <td>{e.carryLimit} days</td>
                    <td>{e.calendarId}</td>
                    <td>
                      <button className="text-link" onClick={() => entitlementForm(e)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'audit' && audit && (
        <>
          <div className="section-bar">
            <div>
              <h2>Workspace audit trail</h2>
              <p className="muted small">
                {audit.rows.length} most recent events · append-only database records
              </p>
            </div>
            <Badge>{audit.valid ? 'Hash chain verified' : 'Integrity check failed'}</Badge>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv('audit.csv', [
                  ['ID', 'Time', 'Actor', 'Action', 'Target', 'Detail', 'Previous', 'Hash'],
                  ...audit.rows.map((r: Item) => [
                    r.id,
                    r.time,
                    r.actor,
                    r.action,
                    r.target,
                    r.detail,
                    r.previous,
                    r.hash,
                  ]),
                ])
              }
            >
              <Download size={15} /> Export audit
            </button>
          </div>
          <div className="panel data-table audit-table">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Integrity</th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((r: Item) => (
                  <tr key={r.id}>
                    <td>{new Date(r.time).toLocaleString()}</td>
                    <td>{users.find((u) => u.id === r.actor)?.name ?? r.actor}</td>
                    <td>
                      <Badge>{r.action}</Badge>
                    </td>
                    <td>
                      <code>{r.target}</code>
                    </td>
                    <td title={r.hash}>
                      <code>{r.hash.slice(0, 12)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote">
            Export and retain audit head hashes externally for stronger tamper evidence. A database
            administrator with filesystem access can replace the database.
          </p>
        </>
      )}
      {tab === 'settings' && (
        <>
          <div className="integration-grid">
            {[
              {
                name: 'Full Office editors',
                description: integrations.office
                  ? 'ONLYOFFICE Docs configured: native documents, spreadsheets, slides and PDFs.'
                  : 'Start the editors Docker profile and configure the OFFICE_* server settings.',
                ready: integrations.office,
              },
              {
                name: 'Workspace assistant',
                description: integrations.ai
                  ? `Connected model: ${integrations.aiModel}`
                  : 'Configure AI_BASE_URL and AI_MODEL for Ollama or another compatible provider.',
                ready: integrations.ai,
              },
              {
                name: 'Email delivery',
                description: integrations.smtp
                  ? 'External SMTP delivery configured.'
                  : 'Internal mail is ready. Configure SMTP_HOST for external delivery.',
                ready: integrations.smtp,
              },
              {
                name: 'PDF certificate signing',
                description: integrations.certificate
                  ? 'Organization PKCS#12 certificate configured.'
                  : 'Set PDF_P12_PATH and PDF_P12_PASSPHRASE on the server.',
                ready: integrations.certificate,
              },
              {
                name: 'Meeting connectivity',
                description: integrations.rtc
                  ? 'TURN relay is configured.'
                  : 'Peer-to-peer on local networks. Configure TURN_URL for routed networks.',
                ready: integrations.rtc,
              },
              {
                name: 'File storage',
                description: 'Files and SQLite data are persisted on the deployment volume.',
                ready: true,
              },
              {
                name: 'Romania / SPV',
                description:
                  'Invoicing and ANAF integration live on the separate feature/romania-spv branch.',
                ready: false,
              },
            ].map((i) => (
              <article key={i.name} className="integration-card">
                <Settings2 size={22} />
                <Badge>{i.ready ? 'Configured' : 'Setup available'}</Badge>
                <h3>{i.name}</h3>
                <p>{i.description}</p>
              </article>
            ))}
          </div>
          <div className="section-bar">
            <h2>Your account</h2>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              setForm({
                title: 'Change your password',
                fields: [
                  { key: 'current', label: 'Current password', type: 'password', required: true },
                  {
                    key: 'password',
                    label: 'New password (minimum 12 characters)',
                    type: 'password',
                    required: true,
                  },
                ],
                submit: async (data) => {
                  const result = await api('/password', 'POST', data);
                  const { setCsrf } = await import('./api');
                  setCsrf(result.csrf);
                  notify('Password updated. Other sessions have been signed out.');
                },
              })
            }
          >
            <KeyRound size={16} /> Change password
          </button>
        </>
      )}
      {form && (
        <FormModal
          title={form.title}
          fields={form.fields}
          initial={form.initial}
          onClose={() => setForm(null)}
          onSubmit={form.submit}
        />
      )}
    </>
  );
}
