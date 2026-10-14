// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { api, type Item, type User } from './api';
import { Modal } from './components';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const chatNotice =
  'Workspace administrators can review conversations and shared files. Each review is recorded in the audit log.';
function PeoplePicker({
  users,
  selected,
  onChange,
  locked = '',
}: {
  users: User[];
  selected: string[];
  onChange: (ids: string[]) => void;
  locked?: string;
}) {
  const [query, setQuery] = useState('');
  return (
    <div className="participant-picker">
      <input
        aria-label="Find participants"
        placeholder="Find a person or company…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div>
        {users
          .filter(
            (u) =>
              u.active &&
              `${u.name} ${u.email} ${u.company || ''}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((u) => (
            <label key={u.id}>
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                disabled={u.id === locked}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, u.id] : selected.filter((id) => id !== u.id),
                  )
                }
              />
              <span>
                {u.name}
                <small>{u.company ? `${u.company} · External` : u.email}</small>
              </span>
            </label>
          ))}
      </div>
    </div>
  );
}
export function ConversationEditor({
  current,
  users,
  user,
  projectOptions,
  onClose,
  onSaved,
}: {
  current?: Item;
  users: User[];
  user: User;
  projectOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (c: Item) => Promise<void>;
}) {
  const direct = current?.visibility === 'direct';
  const [title, setTitle] = useState(direct ? 'New group' : current?.title || ''),
    [visibility, setVisibility] = useState(
      current?.visibility === 'workspace' ? 'workspace' : 'group',
    ),
    [category, setCategory] = useState('General'),
    [description, setDescription] = useState(''),
    [projectId, setProjectId] = useState(''),
    [ids, setIds] = useState<string[]>(current?.memberIds || [user.id]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={current ? 'Manage participants' : 'Create a conversation'} onClose={onClose}>
      <form
        className="space-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const c = current
              ? await api(
                  `/chat/${current.id}/${direct ? 'expand' : 'members'}`,
                  direct ? 'POST' : 'PUT',
                  { title, memberIds: ids, version: current.version },
                )
              : await api('/chat/conversations', 'POST', {
                  title,
                  visibility,
                  category,
                  description,
                  projectId,
                  memberIds: ids,
                });
            await onSaved(c);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {(!current || direct) && (
          <label>
            Conversation name
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        {!current && (
          <>
            <label>
              Conversation type
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="group">Group · invited people only</option>
                <option value="workspace">Channel · workspace or project</option>
              </select>
            </label>
            <label>
              Category
              <input
                required
                maxLength={80}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {visibility === 'workspace' && (
              <label>
                Channel access
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projectOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value ? p.label : 'Everyone in the workspace (external accounts excluded)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {direct && (
          <p className="notice">
            Adding people creates a new group. Earlier direct messages stay in the original
            conversation.
          </p>
        )}
        {visibility !== 'workspace' && (
          <>
            <p>New participants can read the group's existing messages and shared files.</p>
            <PeoplePicker
              users={users}
              selected={ids}
              onChange={setIds}
              locked={current?.owner || user.id}
            />
          </>
        )}
        <p className="chat-policy">{chatNotice}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {current ? 'Save participants' : 'Create conversation'}
        </button>
      </form>
    </Modal>
  );
}
export function InviteGuest({ channel, onClose }: { channel: Item; onClose: () => void }) {
  const [email, setEmail] = useState(''),
    [company, setCompany] = useState(''),
    [url, setUrl] = useState(''),
    [invites, setInvites] = useState<Item[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const reload = () => api(`/chat/${channel.id}/invitations`).then(setInvites);
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [channel.id]);
  return (
    <Modal title="Invite external collaborator" onClose={onClose}>
      <form
        className="space-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setUrl('');
          try {
            const result = await api(`/chat/${channel.id}/invitations`, 'POST', { email, company });
            setUrl(`${location.origin}/#invite=${result.token}`);
            await reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          The guest gets access only to conversations they are added to, including earlier messages.
          Send the single-use link to its intended recipient. It expires in 7 days.
        </p>
        <label>
          Guest email
          <input
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Guest company
          <input
            required
            maxLength={120}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Create invitation link
        </button>
        {url && (
          <label>
            Invitation link
            <input
              aria-label="Invitation link"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .catch(() => setError('Select and copy the link manually.'))
              }
            >
              Copy invitation
            </button>
            <small>
              Use your externally reachable HTTPS address instead of localhost when sharing
              remotely. No email has been sent.
            </small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="invitation-list">
        {invites.map((i) => (
          <div key={i.id}>
            <span>
              {i.email}
              <small>
                {i.company} ·{' '}
                {i.usedAt
                  ? 'Accepted'
                  : i.revoked
                    ? 'Revoked'
                    : Date.parse(i.expires) < Date.now()
                      ? 'Expired'
                      : 'Pending'}
              </small>
            </span>
            {!i.usedAt && !i.revoked && (
              <button
                className="button"
                onClick={async () => {
                  try {
                    await api(`/chat/${channel.id}/invitations/${i.id}`, 'DELETE');
                    await reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
export function GuestInvitation({
  token,
  onLogin,
  onCancel,
}: {
  token: string;
  onLogin: (a: any) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="guest-join">
      <h1>Join the conversation</h1>
      <p>Create your external collaborator account using the email assigned to your invitation.</p>
      <form
        className="space-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            onLogin(
              await api('/chat-invitations/accept', 'POST', { ...data, token, acknowledge: true }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your name
          <input name="name" autoComplete="name" minLength={2} maxLength={100} required />
        </label>
        <label>
          Choose a password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
          />
        </label>
        <label className="acknowledge">
          <input type="checkbox" required />I understand that administrators can review messages and
          files, and that this is a limited guest account.
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Accept invitation
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Back to sign in
        </button>
      </form>
    </main>
  );
}
export function ExternalMeeting({
  channelId,
  onClose,
  onSaved,
}: {
  channelId: string;
  onClose: () => void;
  onSaved: (m: Item) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Teams or Google Meet" onClose={onClose}>
      <form
        className="space-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            onSaved(await api(`/chat/${channelId}/external-meeting`, 'POST', data));
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Meeting title
          <input name="title" required maxLength={120} />
        </label>
        <label>
          Meeting link
          <input
            type="url"
            name="url"
            placeholder="https://meet.google.com/abc-defg-hij"
            required
            maxLength={4000}
          />
        </label>
        <p>
          Opens the provider's meeting in a new tab. Your Reverse Office login is not a Microsoft or
          Google identity. Join as a guest if the host allows it; the provider may require sign-in
          or admission.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Share meeting
        </button>
      </form>
    </Modal>
  );
}
export function ChatReview({ users, onClose }: { users: User[]; onClose: () => void }) {
  const [channels, setChannels] = useState<Item[]>([]),
    [id, setId] = useState(''),
    [reason, setReason] = useState(''),
    [record, setRecord] = useState<Item | null>(null),
    [reviewReason, setReviewReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/chat/admin/conversations')
      .then(setChannels)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Modal title="Conversation review" wide onClose={onClose}>
      <form
        className="space-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setRecord(null);
          try {
            setRecord(await api(`/chat/admin/${id}/review`, 'POST', { reason }));
            setReviewReason(reason);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Read-only administrator access. Opening a conversation and downloading files records your
          identity and reason in the audit log.
        </p>
        <label>
          Conversation
          <select
            required
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setRecord(null);
            }}
          >
            <option value="">Choose a conversation…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.visibility === 'direct'
                  ? c.memberIds
                      .map((id: string) => users.find((u) => u.id === id)?.name || id)
                      .join(' / ')
                  : c.title}{' '}
                · {c.visibility || 'workspace'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason for review
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Open audited review
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      {record && (
        <div className="review-messages">
          {[...record.messages]
            .sort((a, b) => a.created.localeCompare(b.created))
            .map((m: Item) => (
              <article key={m.id}>
                <strong>{users.find((u) => u.id === m.owner)?.name || 'Former participant'}</strong>
                <small>{new Date(m.created).toLocaleString()}</small>
                <div className="chat-markdown">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{
                      img: () => null,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {m.text}
                  </Markdown>
                </div>
                {(m.attachments || []).map((id: string) => {
                  const a = record.attachments.find((a: Item) => a.id === id);
                  return (
                    a && (
                      <a
                        key={id}
                        className="button"
                        href={`/api/chat/admin/attachments/${id}/download?reason=${encodeURIComponent(reviewReason)}`}
                      >
                        Download {a.relativePath || a.title}
                      </a>
                    )
                  );
                })}
              </article>
            ))}
        </div>
      )}
    </Modal>
  );
}
