import { useEffect, useState } from 'react';
import { Building2, CalendarDays, Users, Check } from 'lucide-react';
import { api, type Item, type State, type User } from './api';
export function Organisation({
  state,
  users,
  user,
  notify,
  refresh,
}: {
  state: State;
  users: User[];
  user: User;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<Item | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    api('/organisation')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (!data) return <p>{error || 'Loading organisation…'}</p>;
  const calendars = [...new Set((state.calendars || []).map((c) => c.calendarId))];
  return (
    <div className="organisation-layout">
      <form
        className="panel account-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setData(await api('/organisation', 'PUT', data));
            await refresh();
            notify('Organisation settings saved');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Building2 />
        <h2>Organisation settings</h2>
        <p>
          One organisation per deployment. Defaults apply to people without an individual calendar
          assignment.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={user.role !== 'admin' || busy}>
          <label>
            Organisation name
            <input
              aria-label="Organisation name"
              required
              minLength={2}
              maxLength={100}
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label>
            Default working calendar
            <select
              aria-label="Default working calendar"
              value={data.calendarId}
              onChange={(e) => setData({ ...data, calendarId: e.target.value })}
            >
              {calendars.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Standard hours per day
            <input
              aria-label="Standard hours per day"
              type="number"
              required
              min={1}
              max={24}
              step="0.25"
              value={data.hoursPerDay}
              onChange={(e) => setData({ ...data, hoursPerDay: Number(e.target.value) })}
            />
          </label>
          <label>
            Organisation timezone
            <input
              aria-label="Organisation timezone"
              required
              value={data.timezone}
              onChange={(e) => setData({ ...data, timezone: e.target.value })}
            />
          </label>
          <label>
            Default annual leave days
            <input
              aria-label="Default annual leave days"
              type="number"
              min={0}
              max={366}
              required
              value={data.annualLeaveDays}
              onChange={(e) => setData({ ...data, annualLeaveDays: Number(e.target.value) })}
            />
          </label>
          <label>
            Default carryover limit
            <input
              aria-label="Default carryover limit"
              type="number"
              min={0}
              max={366}
              required
              value={data.carryLimit}
              onChange={(e) => setData({ ...data, carryLimit: Number(e.target.value) })}
            />
          </label>
          {user.role === 'admin' && (
            <button className="button primary" disabled={busy}>
              <Check size={16} /> Save organisation
            </button>
          )}
        </fieldset>
      </form>
      <aside className="onboarding-checklist">
        <h2>Set up your team</h2>
        <article>
          <Building2 />
          <div>
            <strong>1. Name your organisation</strong>
            <p>Set daily capacity and the calendar used for work and leave.</p>
          </div>
        </article>
        <article>
          <CalendarDays />
          <div>
            <strong>2. Configure calendar years</strong>
            <p>
              Add holidays and weekend rules in Calendars. Keep the same identifier across years.
            </p>
            <small>{state.calendars?.length || 0} calendar years configured</small>
          </div>
        </article>
        <article>
          <Users />
          <div>
            <strong>3. Add people and projects</strong>
            <p>
              In People, create accounts, assign project access and set an initial annual allowance.
              New users replace their temporary password at first sign-in.
            </p>
            <small>
              {users.filter((u) => u.active).length} active accounts · {state.projects?.length || 0}{' '}
              projects
            </small>
          </div>
        </article>
        <p className="notice">
          Allowances belong to a person, calendar and year. Changing these defaults does not
          overwrite existing allowances or approved records.
        </p>
      </aside>
    </div>
  );
}
