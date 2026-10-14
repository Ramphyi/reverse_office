import { useEffect, useState } from 'react';
import { Plus, Search, Users, KeyRound } from 'lucide-react';
import { api, initials, type Item, type State, type User } from './api';
import { Badge, FormModal, type Field } from './components';
export function People({
  state,
  users,
  user,
  refresh,
  notify,
}: {
  state: State;
  users: User[];
  user: User;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [org, setOrg] = useState<Item>({}),
    [form, setForm] = useState<Item | null>(null);
  useEffect(() => {
    api('/organisation')
      .then(setOrg)
      .catch((e) => notify(e.message));
  }, []);
  const calendars = [...new Set((state.calendars || []).map((c) => c.calendarId))];
  const shared: Field[] = [
    { key: 'name', label: 'Full name', required: true },
    { key: 'department', label: 'Department' },
    { key: 'jobTitle', label: 'Job title' },
    {
      key: 'managerId',
      label: 'Reports to',
      type: 'select',
      default: '',
      options: [
        { value: '', label: 'No assigned manager' },
        ...users
          .filter((u) => u.active && ['manager', 'admin'].includes(u.role) && u.id !== form?.id)
          .map((u) => ({ value: u.id, label: u.name })),
      ],
      help: 'Reporting lines organize your team. Account roles still control approvals and project access.',
    },
    {
      key: 'role',
      label: 'Role',
      type: 'select',
      options: (form?.role === 'guest'
        ? ['guest', 'member', 'manager', 'admin']
        : ['member', 'manager', 'admin']
      ).map((v) => ({ value: v, label: v })),
      default: 'member',
      help: 'Members work on assigned projects. Managers review work and leave. Administrators also manage accounts.',
    },
    {
      key: 'calendarId',
      label: 'Employee working calendar',
      type: 'select',
      options: [
        { value: '', label: 'Organisation default' },
        ...calendars.map((v) => ({ value: v, label: v })),
      ],
      default: '',
    },
    {
      key: 'projectIds',
      label: 'Project access',
      type: 'multiselect',
      options: (state.projects || []).map((p) => ({ value: p.id, label: p.title })),
    },
  ];
  const rows = users.filter(
    (u) =>
      (filter === 'all' ||
        (filter === 'team'
          ? u.managerId === user.id
          : filter === 'active'
            ? !!u.active
            : !u.active)) &&
      `${u.name} ${u.email} ${u.department} ${u.jobTitle}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="people-intro">
        <Users size={25} />
        <div>
          <h2>
            Your people <span className="count">{users.length}</span>
          </h2>
          <p>Create accounts, assign work calendars and project access, and manage security.</p>
        </div>
        {user.role === 'admin' && (
          <button
            className="button primary"
            onClick={() =>
              setForm({
                mode: 'create',
                mustChangePassword: true,
                allowance: org.annualLeaveDays ?? 21,
                allowanceYear: new Date().getFullYear(),
              })
            }
          >
            <Plus size={16} /> Add person
          </button>
        )}
      </div>
      <div className="section-bar">
        <label className="people-search">
          <Search size={16} />
          <input
            aria-label="Search people"
            placeholder="Search name, email or department"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Account status filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All accounts</option>
          <option value="team">My direct reports</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <div className="panel data-table">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role & department</th>
              <th>Reports to</th>
              <th>Work calendar</th>
              <th>Projects</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="table-person">
                    <span className="avatar">{initials(u.name)}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <small>{u.email}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <Badge>{u.role}</Badge>
                  <small>
                    {u.department || '—'}
                    {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                  </small>
                </td>
                <td>
                  {users.find((p) => p.id === u.managerId)?.name || 'Unassigned'}
                  <small>{users.filter((p) => p.managerId === u.id).length} direct reports</small>
                </td>
                <td>{u.calendarId || org.calendarId || 'default'}</td>
                <td>
                  {(state.projects || [])
                    .filter((p) => p.members.includes(u.id))
                    .map((p) => p.title)
                    .join(', ') || 'No project access'}
                </td>
                <td>
                  <Badge>{u.active ? 'Active' : 'Disabled'}</Badge>
                  {!!u.mustChangePassword && <small>Password change required</small>}
                </td>
                <td>
                  {user.role === 'admin' && u.id !== user.id && (
                    <div className="row-actions">
                      <button
                        className="text-link"
                        onClick={() =>
                          setForm({
                            ...u,
                            mode: 'manage',
                            active: !!u.active,
                            projectIds: (state.projects || [])
                              .filter((p) => p.members.includes(u.id))
                              .map((p) => p.id),
                          })
                        }
                      >
                        Manage
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Reset password for ${u.name}`}
                        title="Reset password"
                        onClick={() => setForm({ mode: 'reset', id: u.id, name: u.name })}
                      >
                        <KeyRound size={16} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">No matching accounts.</p>}
      </div>
      <p className="footnote">
        Share temporary passwords through a trusted channel. Disabling or resetting an account
        revokes its active sessions.
      </p>
      {form && (
        <FormModal
          title={
            form.mode === 'create'
              ? 'Create an account'
              : form.mode === 'reset'
                ? `Reset password · ${form.name}`
                : 'Manage account'
          }
          initial={form}
          onClose={() => setForm(null)}
          fields={
            form.mode === 'reset'
              ? [
                  {
                    key: 'current',
                    label: 'Your administrator password',
                    type: 'password',
                    required: true,
                  },
                  {
                    key: 'password',
                    label: 'New temporary password (minimum 12 characters)',
                    type: 'password',
                    required: true,
                  },
                ]
              : [
                  ...shared,
                  ...(form.mode === 'create'
                    ? [
                        { key: 'email', label: 'Work email', type: 'email', required: true },
                        {
                          key: 'password',
                          label: 'Initial password (minimum 12 characters)',
                          type: 'password',
                          required: true,
                        },
                        {
                          key: 'mustChangePassword',
                          label: 'Require password change at first sign-in',
                          type: 'checkbox',
                          default: true,
                        },
                        {
                          key: 'allowance',
                          label: 'Initial annual allowance (days)',
                          type: 'number',
                          min: 0,
                          max: 366,
                          default: org.annualLeaveDays ?? 21,
                        },
                        {
                          key: 'allowanceYear',
                          label: 'Allowance year',
                          type: 'number',
                          min: 2000,
                          max: 2200,
                          default: new Date().getFullYear(),
                        },
                      ]
                    : [{ key: 'active', label: 'Account active', type: 'checkbox' }]),
                ]
          }
          onSubmit={async (data) => {
            if (form.mode === 'reset') {
              await api(`/users/${form.id}/reset-password`, 'POST', data);
              notify('Temporary password set. The user must replace it at next sign-in.');
            } else if (form.mode === 'create') {
              await api('/users', 'POST', data);
              notify('Account created. Share the temporary password securely.');
            } else {
              await api(`/users/${form.id}`, 'PATCH', data);
              notify('Account and project access updated; sessions revoked.');
            }
            await refresh();
          }}
        />
      )}
    </>
  );
}
