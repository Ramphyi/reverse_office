// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { api, save, isoToday, type Item } from './api';
import { Modal } from './components';
export const activities = [
  'Work from office',
  'Work from home',
  'Business trip',
  'Training',
  'Other work',
  'Paid vacation',
  'Special occasion',
  'Sick leave',
  'Unpaid leave',
];
export const isAbsence = (activity: string) => activities.indexOf(activity) >= 5;
export function HoursStepper({
  value,
  onChange,
  label = 'Hours worked',
  disabled = false,
  min = 0.25,
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <div className="hours-stepper">
      <button
        type="button"
        aria-label={'Decrease ' + label}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 0.5))}
      >
        −
      </button>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={24}
        step={0.25}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>h</span>
      <button
        type="button"
        aria-label={'Increase ' + label}
        disabled={disabled || value >= 24}
        onClick={() => onChange(Math.min(24, value + 0.5))}
      >
        +
      </button>
    </div>
  );
}
export function TimeEntry({
  initial,
  projects,
  onClose,
  onSaved,
}: {
  initial: Item;
  projects: Item[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [activity, setActivity] = useState(initial.activity || 'Work from office'),
    [hours, setHours] = useState(initial.hours ?? 8),
    [day, setDay] = useState(initial.date || isoToday()),
    [projectId, setProjectId] = useState(initial.projectId || projects[0]?.id || ''),
    [description, setDescription] = useState(initial.description || ''),
    [billable, setBillable] = useState(initial.billable ?? true),
    [status, setStatus] = useState(initial.status || 'Draft'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const absence = isAbsence(activity);
  return (
    <Modal
      title={initial.id ? 'Edit time entry' : 'Log your time'}
      description="Choose your day, activity and hours. A normal working day starts at 8 hours."
      onClose={onClose}
    >
      <form
        className="time-entry-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const value = {
              ...initial,
              date: day,
              projectId,
              activity,
              hours,
              description: description.trim() || activity,
              billable,
              status,
            };
            if (initial.id) await save('timesheets', value);
            else await api('/work-log/batch', 'POST', { entries: [value] });
            await onSaved();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="time-entry-row">
          <label>
            Work date
            <input
              aria-label="Work date"
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            Activity
            <select
              aria-label="Activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            >
              {activities
                .filter((a) => !initial.id || !isAbsence(a))
                .map((a) => (
                  <option key={a}>{a}</option>
                ))}
            </select>
          </label>
        </div>
        {absence ? (
          <p className="notice">
            This creates a full-day time-off request in the shared calendar, pending approval. It is
            not billed as worked time. Paid vacation uses your annual leave balance.
          </p>
        ) : (
          <>
            <label>
              Project
              <select
                aria-label="Project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Choose project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="time-hours">
              <strong>Hours worked</strong>
              <HoursStepper value={hours} onChange={setHours} />
              <div className="hour-presets">
                {[4, 8, 10].map((h) => (
                  <button
                    className="button secondary"
                    type="button"
                    key={h}
                    onClick={() => setHours(h)}
                  >
                    {h} hours
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <label>
          {absence ? 'Note for your manager' : 'What did you work on?'}
          <textarea
            aria-label={absence ? 'Note for your manager' : 'What did you work on?'}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details…"
          />
        </label>
        {!absence && (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
              />
              Billable to client
            </label>
            <label>
              Save as
              <select
                aria-label="Save as"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="Draft">Draft</option>
                <option value="Submitted">Submit for approval</option>
              </select>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="time-entry-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {absence ? 'Request time off' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
