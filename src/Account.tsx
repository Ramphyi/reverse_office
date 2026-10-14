import { useState } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { api, setCsrf, type User, type Item } from './api';

export function Account({
  user,
  onChanged,
  onLogout,
}: {
  user: User;
  onChanged: (auth: Item) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name),
    [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-page">
      <div className="account-banner">
        <ShieldCheck size={30} />
        <div>
          <h2>
            {user.mustChangePassword ? 'Set your personal password' : 'Your account & security'}
          </h2>
          <p>
            {user.mustChangePassword
              ? 'Replace the temporary password before opening your workspace.'
              : 'Manage your profile and keep your account secure.'}
          </p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="account-cards">
        {!user.mustChangePassword && (
          <form
            className="panel account-card"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api('/profile', 'PATCH', { name });
                onChanged(await api('/me'));
                setMessage('Profile updated');
              });
            }}
          >
            <UserRound />
            <h3>Your profile</h3>
            <label>
              Display name
              <input
                aria-label="Display name"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input value={user.email} readOnly />
            </label>
            <p>
              {user.role} · {user.department || 'No department assigned'}
              {user.jobTitle ? ` · ${user.jobTitle}` : ''}
            </p>
            <button className="button primary" disabled={busy}>
              Save profile
            </button>
          </form>
        )}
        <form
          className="panel account-card"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (password !== confirm) throw Error('The new passwords do not match');
              if (password === current) throw Error('Choose a different password');
              const result = await api('/password', 'POST', { current, password });
              setCsrf(result.csrf);
              onChanged(result);
              setCurrent('');
              setPassword('');
              setConfirm('');
              setMessage('Password updated. Other sessions have been signed out.');
            });
          }}
        >
          <KeyRound />
          <h3>Change password</h3>
          <label>
            Current password
            <input
              aria-label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              aria-label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <small>Use at least 12 characters. Password changes revoke your other sessions.</small>
          <button className="button primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
      <button
        className="button secondary"
        onClick={async () => {
          await api('/logout', 'POST');
          onLogout();
        }}
      >
        Sign out of this account
      </button>
    </div>
  );
}
