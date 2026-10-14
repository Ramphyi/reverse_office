// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { api, type Item, type User } from './api';
import { Modal } from './components';
export const fileDownload = (item: Item) =>
  item.isFile || item.collection === 'files'
    ? `/api/files/${item.id}/download`
    : `/api/documents/${item.id}/export/${item.kind === 'sheet' ? 'xlsx' : item.kind === 'slides' ? 'pptx' : 'docx'}`;
export function DriveSharing({
  item,
  users,
  onClose,
  onSaved,
}: {
  item: Item;
  users: User[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [policy, setPolicy] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false);
  const endpoint = `/drive/${item.isFile ? 'files' : 'documents'}/${item.id}/sharing`;
  useEffect(() => {
    api(endpoint)
      .then(setPolicy)
      .catch((e) => setError(e.message));
  }, [endpoint]);
  return (
    <Modal title={'Share · ' + item.title} onClose={onClose}>
      <form
        className="space-form padded-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api(endpoint, 'PUT', policy);
            await onSaved();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Explicit shares grant read and download access. The owner keeps editing rights. “Everyone”
          means signed-in workspace members, never an anonymous public link. External accounts must
          be selected explicitly.
        </p>
        {policy && (
          <>
            <label>
              Who can access
              <select
                aria-label="Who can access"
                value={policy.mode}
                onChange={(e) => setPolicy({ ...policy, mode: e.target.value })}
              >
                <option value="private">Only the owner</option>
                <option value="project">Default project access / personal owner</option>
                <option value="workspace">Everyone in this workspace</option>
                <option value="people">Specific people, including external accounts</option>
              </select>
            </label>
            {policy.mode === 'people' && (
              <div className="sharing-people">
                <input
                  placeholder="Find a name, email or company…"
                  aria-label="Find people to share with"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {users
                  .filter(
                    (u) =>
                      u.active &&
                      u.id !== item.owner &&
                      `${u.name} ${u.email} ${u.company || ''}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((u) => (
                    <label className="check-field" key={u.id}>
                      <input
                        type="checkbox"
                        checked={policy.userIds.includes(u.id)}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            userIds: e.target.checked
                              ? [...policy.userIds, u.id]
                              : policy.userIds.filter((id: string) => id !== u.id),
                          })
                        }
                      />
                      <span>
                        {u.name}
                        <small>
                          {u.email}
                          {u.role === 'guest' ? ' · External · ' + u.company : ''}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            )}
            <small>
              Changing access closes existing native editing sessions. Sharing applies to this item,
              not its folder contents.
            </small>
            <button className="button primary" disabled={busy}>
              Save permissions
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
export function SharedDrive() {
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    api('/drive/shared')
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel shared-drive">
      <h2>Files shared with you</h2>
      <p>Read-only access. Downloads always check your current permissions.</p>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <a className="shared-file" key={item.id} href={fileDownload(item)}>
          <strong>{item.title}</strong>
          <span>Download</span>
        </a>
      ))}
      {!items.length && <p>No shared files yet.</p>}
    </section>
  );
}
