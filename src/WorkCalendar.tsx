import { TimeEntry, HoursStepper, activities, isAbsence } from './TimeEntry';
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Plus } from 'lucide-react';
import {
  api,
  save,
  isoToday,
  niceDate,
  downloadCsv,
  type Item,
  type State,
  type User,
} from './api';
import { Badge, FormModal, Modal } from './components';

const shift = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function WorkCalendar({
  state,
  user,
  users,
  refresh,
  notify,
  monthValue,
  onMonthChange,
}: {
  state: State;
  user: User;
  users: User[];
  refresh: () => Promise<void>;
  notify: (v: string) => void;
  monthValue?: string;
  onMonthChange?: (value: string) => void;
}) {
  const [localMonth, setMonth] = useState(
    localStorage.getItem('work-month') || isoToday().slice(0, 7),
  );
  const month = monthValue || localMonth;
  useEffect(() => {
    localStorage.setItem('work-month', month);
  }, [month]);
  const [person, setPerson] = useState(user.id),
    [project, setProject] = useState(''),
    [data, setData] = useState<Item | null>(null),
    [error, setError] = useState('');
  const [selected, setSelected] = useState(
      month === isoToday().slice(0, 7) ? isoToday() : month + '-01',
    ),
    [form, setForm] = useState<Item | null>(null),
    [weekly, setWeekly] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selected.startsWith(month)) setSelected(month + '-01');
  }, [month]);
  const [weekActivity, setWeekActivity] = useState<Record<string, string>>({});
  const [weekHours, setWeekHours] = useState<Record<string, string>>({}),
    [weekProject, setWeekProject] = useState(''),
    [description, setDescription] = useState(''),
    [submit, setSubmit] = useState(false);
  const first = month + '-01',
    offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7,
    start = shift(first, -offset),
    end = shift(start, 41);
  const own = person === user.id,
    projects = (state.projects || []).filter((p) => p.status !== 'Completed');
  useEffect(() => {
    let live = true;
    setError('');
    setData(null);
    api(`/work-calendar?start=${start}&end=${end}&userId=${person}&projectId=${project}`)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [start, end, person, project, state]);
  const chooseMonth = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    setMonth(value);
    onMonthChange?.(value);
    localStorage.setItem('work-month', value);
    setSelected(value === isoToday().slice(0, 7) ? isoToday() : value + '-01');
  };
  const move = (n: number) => {
    const d = new Date(first + 'T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    chooseMonth(d.toISOString().slice(0, 7));
  };
  const day = data?.days.find((d: Item) => d.date === selected),
    monthly = (data?.days || []).filter((d: Item) => d.date.startsWith(month));
  const total = (key: string) => monthly.reduce((n: number, d: Item) => n + d[key], 0);
  const newTime = (date = selected) =>
    setForm({
      kind: 'time',
      date,
      projectId: project || projects[0]?.id,
      hours: 8,
      status: 'Draft',
      billable: true,
    });
  const weekStart = shift(selected, -((new Date(selected + 'T12:00:00Z').getUTCDay() + 6) % 7)),
    week = Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
  return (
    <section className="work-calendar panel" aria-label="Shared work calendar">
      <div className="work-calendar-heading">
        <div>
          <span className="eyebrow">WORK & TIME AWAY</span>
          <h2>
            <CalendarDays size={20} /> One calendar for your working day
          </h2>
          <p>Hours, leave and holidays together · {data?.calendarId || 'Loading calendar…'}</p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() =>
              downloadCsv('work-calendar-' + month + '.csv', [
                ['Date', 'Calendar', 'Capacity', 'Recorded hours', 'Remaining', 'Holiday', 'Leave'],
                ...monthly.map((d: Item) => [
                  d.date,
                  data?.calendarId,
                  d.capacity,
                  d.hours,
                  d.remaining,
                  d.holiday,
                  d.leave.map((l: Item) => `${l.type} (${l.status})`).join('; '),
                ]),
              ])
            }
          >
            <Download size={15} /> Calendar CSV
          </button>
        </div>
      </div>
      <div className="calendar-controls">
        <div className="heading-actions">
          <button className="icon-button" aria-label="Previous work month" onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </button>
          <input
            aria-label="Work calendar month"
            type="month"
            value={month}
            onChange={(e) => chooseMonth(e.target.value)}
          />
          <button className="icon-button" aria-label="Next work month" onClick={() => move(1)}>
            <ChevronRight size={18} />
          </button>
          <button className="button secondary" onClick={() => chooseMonth(isoToday().slice(0, 7))}>
            Today
          </button>
        </div>
        <div className="heading-actions">
          {['admin', 'manager'].includes(user.role) && (
            <select
              aria-label="Calendar employee"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === user.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Work calendar project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All projects · employee calendar</option>
            {(state.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {p.calendarId}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-summary">
        <span>
          <strong>{total('hours')}h</strong> recorded
        </span>
        <span>
          <strong>{total('capacity')}h</strong> available capacity
        </span>
        <span>
          <strong>{total('remaining')}h</strong> unlogged
        </span>
        <span>
          <strong>
            {monthly.filter((d: Item) => d.leave.some((l: Item) => l.status === 'Approved')).length}
          </strong>{' '}
          approved days off
        </span>
      </div>
      {data && (
        <>
          <div className="work-calendar-layout">
            <div className="calendar-grid-wrap">
              <div className="work-month-grid" role="group" aria-label="Working days">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
                  <div className="weekday-label" key={n}>
                    {n}
                  </div>
                ))}
                {data.days.map((d: Item) => (
                  <button
                    key={d.date}
                    aria-label={`Work day ${d.date}`}
                    aria-pressed={selected === d.date}
                    className={`work-day ${d.date === selected ? 'selected' : ''} ${d.date.startsWith(month) ? '' : 'outside'} ${d.weekend || d.holiday ? 'nonworking' : ''} ${d.date === isoToday() ? 'today' : ''}`}
                    onClick={() => setSelected(d.date)}
                  >
                    <span className="day-number">{Number(d.date.slice(8))}</span>
                    {d.holiday && <span className="day-chip holiday">Holiday</span>}
                    {d.leave.map((l: Item) => (
                      <span
                        key={l.id}
                        className={`day-chip ${l.status === 'Approved' ? 'leave' : 'pending'}`}
                      >
                        {l.type} · {l.status === 'Approved' ? 'Off' : 'Pending'}
                      </span>
                    ))}
                    {d.hours > 0 && <span className="day-chip hours">{d.hours}h logged</span>}
                    {d.capacity > 0 && (
                      <span className="day-capacity">{d.remaining}h remaining</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <aside className="work-day-detail">
              <span className="eyebrow">DAY DETAILS</span>
              <h3>{niceDate(selected)}</h3>
              {day && (
                <>
                  <p>
                    {day.holiday
                      ? 'Public / company holiday'
                      : day.weekend
                        ? 'Non-working day'
                        : `${day.hours}h logged · ${day.capacity}h capacity`}
                  </p>
                  {!day.calendarConfigured && (
                    <p className="notice">
                      No yearly holiday calendar configured. Weekend defaults apply.
                    </p>
                  )}
                  {day.leave.map((l: Item) => (
                    <article className="day-entry" key={l.id}>
                      <strong>{l.type} time off</strong>
                      <Badge>{l.status}</Badge>
                      <small>
                        {niceDate(l.start)} – {niceDate(l.end)}
                      </small>
                      {['admin', 'manager'].includes(user.role) && (
                        <button
                          className="text-link"
                          onClick={() => setForm({ kind: 'cancel', ...l })}
                        >
                          Cancel leave
                        </button>
                      )}
                    </article>
                  ))}
                  {day.entries.map((t: Item) => (
                    <article className="day-entry" key={t.id}>
                      <strong>
                        {t.hours}h · {state.projects?.find((p) => p.id === t.projectId)?.title}
                      </strong>
                      <small>{t.description}</small>
                      <Badge>{t.status}</Badge>
                      {own && ['Draft', 'Rejected'].includes(t.status) && (
                        <div className="row-actions">
                          <button
                            className="text-link"
                            onClick={() => setForm({ ...t, kind: 'time', status: 'Draft' })}
                          >
                            Edit
                          </button>
                          <button
                            className="text-link"
                            onClick={async () => {
                              if (!confirm('Delete this time entry?')) return;
                              try {
                                await api(`/entities/timesheets/${t.id}`, 'DELETE');
                                await refresh();
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {!day.entries.length && !day.leave.length && (
                    <p className="muted">Nothing recorded yet.</p>
                  )}
                  {own && (
                    <div className="day-actions">
                      <button
                        className="button primary"
                        disabled={day.leave.some((l: Item) => l.status === 'Approved')}
                        onClick={() => newTime()}
                      >
                        <Plus size={15} /> Log time on this day
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setForm({
                            kind: 'leave',
                            start: selected,
                            end: selected,
                            type: 'Annual',
                            calendarId: data.calendarId,
                          })
                        }
                      >
                        Request time off on this day
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setWeekHours(
                            Object.fromEntries(
                              week.map((date) => {
                                const d = data.days.find((d: Item) => d.date === date);
                                return [date, String(Math.min(8, d?.remaining || 0))];
                              }),
                            ),
                          );
                          setWeekActivity({});
                          setWeekProject(project || projects[0]?.id || '');
                          setWeekly(true);
                        }}
                      >
                        <Clock3 size={15} /> Fill working week
                      </button>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
          <div className="calendar-legend">
            <span>● Logged work</span>
            <span>● Approved leave</span>
            <span>◌ Pending leave</span>
            <span>▧ Holiday / weekend</span>
            <small>
              Pending leave does not reduce capacity. Overtime on non-working days is allowed;
              approved full-day leave blocks work entries.
            </small>
          </div>
        </>
      )}
      {form?.kind === 'time' && (
        <TimeEntry
          initial={form}
          projects={projects}
          onClose={() => setForm(null)}
          onSaved={async () => {
            await refresh();
            notify('Calendar updated');
          }}
        />
      )}
      {form && form.kind !== 'time' && (
        <FormModal
          title={
            form.kind === 'time'
              ? form.id
                ? 'Edit time entry'
                : 'Log your time'
              : form.kind === 'cancel'
                ? 'Cancel time off'
                : 'Request time off'
          }
          initial={form}
          onClose={() => setForm(null)}
          fields={
            form.kind === 'cancel'
              ? [
                  {
                    key: 'reason',
                    label: 'Reason for cancellation',
                    required: true,
                    type: 'textarea',
                  },
                ]
              : [
                  {
                    key: 'type',
                    label: 'Leave type',
                    type: 'select',
                    options: ['Annual', 'Sick', 'Unpaid', 'Special occasion'].map((v) => ({
                      value: v,
                      label: v,
                    })),
                  },
                  { key: 'start', label: 'First day', type: 'date', required: true },
                  { key: 'end', label: 'Last day', type: 'date', required: true },
                  { key: 'reason', label: 'Note for your manager', type: 'textarea' },
                ]
          }
          onSubmit={async (value) => {
            if (form.kind === 'cancel') await api(`/leave/${form.id}/cancel`, 'POST', value);
            else await save(form.kind === 'time' ? 'timesheets' : 'leave', value);
            await refresh();
            notify('Calendar updated');
          }}
        />
      )}
      {weekly && data && (
        <Modal
          wide
          title="Fill working week"
          description="Create separate entries for selected days. Existing entries remain; the whole batch is checked before saving."
          onClose={() => {
            if (!busy) setWeekly(false);
          }}
        >
          <form
            className="form-grid weekly-log-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const entries = week
                  .filter((d) => Number(weekHours[d]) > 0)
                  .map((date) => ({
                    date,
                    projectId: weekProject,
                    hours: Number(weekHours[date]),
                    activity: weekActivity[date] || 'Work from office',
                    description,
                    billable: true,
                    status: submit ? 'Submitted' : 'Draft',
                  }));
                if (!entries.length) throw Error('Enter hours for at least one day');
                await api('/work-log/batch', 'POST', { entries });
                await refresh();
                setWeekly(false);
                notify(`${entries.length} time entries saved`);
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Project
              <select required value={weekProject} onChange={(e) => setWeekProject(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Work description
              <textarea
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="week-hours">
              {week.map((date) => {
                const d = data.days.find((d: Item) => d.date === date),
                  off = d?.leave.some((l: Item) => l.status === 'Approved');
                return (
                  <label key={date}>
                    {niceDate(date)}
                    <select
                      aria-label={`Activity ${date}`}
                      value={weekActivity[date] || 'Work from office'}
                      disabled={off}
                      onChange={(e) => {
                        setWeekActivity({ ...weekActivity, [date]: e.target.value });
                        if (isAbsence(e.target.value)) setWeekHours({ ...weekHours, [date]: '8' });
                      }}
                    >
                      {activities.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <HoursStepper
                      label={`Hours ${date}`}
                      min={0}
                      value={Number(weekHours[date] || 0)}
                      disabled={off || isAbsence(weekActivity[date] || '')}
                      onChange={(n) => setWeekHours({ ...weekHours, [date]: String(n) })}
                    />
                    <small>
                      {off
                        ? 'Approved leave'
                        : d?.holiday
                          ? 'Holiday'
                          : d?.weekend
                            ? 'Weekend'
                            : `${d?.remaining ?? 0}h unlogged`}
                    </small>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setWeekHours(
                  Object.fromEntries(
                    week.map((date) => {
                      const d = data.days.find((d: Item) => d.date === date);
                      return [date, String(d?.remaining || 0)];
                    }),
                  ),
                )
              }
            >
              Fill remaining capacity
            </button>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={submit}
                onChange={(e) => setSubmit(e.target.checked)}
              />{' '}
              Submit for approval immediately
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save week'}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
