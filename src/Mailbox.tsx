// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import {
  Mail,
  Send,
  FileText,
  Trash2,
  Star,
  Paperclip,
  Reply,
  Forward,
  RefreshCw,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type Item, type User } from './api';
import { Modal } from './components';
export function Mailbox({
  user,
  composeRequest,
  onConsumed,
  notify,
}: {
  user: User;
  composeRequest: Item | null;
  onConsumed: () => void;
  notify: (s: string) => void;
}) {
  const [messages, setMessages] = useState<Item[]>([]),
    [folder, setFolder] = useState('inbox'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Item | null>(null),
    [compose, setCompose] = useState<Item | null>(null),
    [attachments, setAttachments] = useState<Item[]>([]),
    [config, setConfig] = useState<Item>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [composeError, setComposeError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedId = useRef<string | null>(null);
  const reload = async () => {
    const [m, c] = await Promise.all([api('/mail'), api('/mail/config')]);
    setMessages(m);
    setConfig(c);
  };
  useEffect(() => {
    reload().catch((e) => setError(e.message));
    const timer = setInterval(() => reload().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (composeRequest) {
      setCompose({
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        body: '',
        attachments: [],
        ...composeRequest,
      });
      setComposeError('');
      onConsumed();
    }
  }, [composeRequest]);
  const rows = messages
    .filter((m) =>
      folder === 'trash'
        ? m.trashed
        : !m.trashed &&
          (folder === 'drafts'
            ? m.status === 'Draft'
            : folder === 'starred'
              ? m.starred
              : folder === 'sent'
                ? m.owner === user.id && !m.incoming && m.status !== 'Draft'
                : (m.owner !== user.id || m.incoming || m.to?.includes(user.email)) &&
                  m.status !== 'Draft'),
    )
    .filter((m) =>
      `${m.from} ${m.to} ${m.subject} ${m.body}`.toLowerCase().includes(query.toLowerCase()),
    );
  async function change(m: Item, patch: Item) {
    try {
      const result = await api(`/mail/${m.id}/state`, 'PATCH', {
        isRead: !!m.isRead,
        starred: !!m.starred,
        trashed: !!m.trashed,
        ...patch,
      });
      if (selectedId.current === m.id) setSelected(result);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function open(m: Item) {
    selectedId.current = m.id;
    setSelected(m);
    setError('');
    setAttachments([]);
    try {
      const files = await api(`/mail/${m.id}/attachments`);
      if (selectedId.current !== m.id) return;
      setAttachments(files);
      if (m.status === 'Draft') {
        setCompose({ ...m, draftId: m.id, attachments: files });
        setComposeError('');
      } else if (!m.isRead) await change(m, { isRead: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function persist(draft: boolean) {
    if (!compose || uploading) return;
    setBusy(true);
    setComposeError('');
    try {
      const result = await api(draft ? '/mail/drafts' : '/mail', 'POST', {
        ...compose,
        attachments: compose.attachments.map((a: Item) => a.id),
      });
      setAttachments(compose.attachments);
      setCompose(null);
      selectedId.current = result.id;
      setSelected(result);
      setFolder(draft ? 'drafts' : 'sent');
      await reload();
      notify(draft ? 'Draft saved' : result.status);
    } catch (e) {
      setComposeError((e as Error).message);
      if ((e as { status?: number }).status === 502) {
        setCompose(null);
        setFolder('sent');
        setError((e as Error).message);
      }
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const reply = (forward: boolean) => {
    if (!selected) return;
    setCompose({
      to: forward ? '' : selected.from,
      cc: '',
      bcc: '',
      subject: (forward ? 'Fwd: ' : 'Re: ') + selected.subject,
      body: `\n\n> ${selected.from} wrote:\n${selected.body
        .split('\n')
        .map((s: string) => '> ' + s)
        .join('\n')}`,
      attachments: [],
    });
    setComposeError('');
  };
  return (
    <>
      <div className="mail-service-status">
        <span>
          {config.smtp
            ? 'External sending: SMTP configured'
            : 'External sending: SMTP not configured'}
        </span>
        <span>
          {config.incoming
            ? 'Incoming gateway configured'
            : 'Incoming external mail: gateway not configured'}
        </span>
        <button
          className="button secondary"
          onClick={() => reload().catch((e) => setError(e.message))}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="mail-workspace">
        <nav aria-label="Mail folders">
          {[
            ['inbox', 'Inbox', Mail],
            ['sent', 'Sent', Send],
            ['drafts', 'Drafts', FileText],
            ['starred', 'Starred', Star],
            ['trash', 'Trash', Trash2],
          ].map(([id, label, Icon]: any) => (
            <button
              className={folder === id ? 'active' : ''}
              key={id}
              onClick={() => {
                setFolder(id);
                selectedId.current = null;
                setSelected(null);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <aside className="mail-messages">
          <input
            aria-label="Search mail"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {rows.map((m) => (
            <button
              className={`${selected?.id === m.id ? 'selected' : ''} ${m.isRead ? '' : 'unread'}`}
              key={m.id}
              onClick={() => open(m)}
            >
              <small>
                {m.incoming || m.owner !== user.id ? m.from : 'To: ' + m.to} ·{' '}
                {new Date(m.created).toLocaleDateString()}
              </small>
              <strong>
                {m.starred ? '★ ' : ''}
                {m.subject || '(No subject)'}
              </strong>
              <p>{m.body.slice(0, 95)}</p>
              <small>
                {m.attachments?.length ? '📎 ' : ''}
                {m.status}
              </small>
            </button>
          ))}
          {!rows.length && <p className="mail-empty">No messages in this folder.</p>}
        </aside>
        <section className="mail-reader">
          {selected ? (
            <>
              <div className="mail-reader-actions">
                <button className="button secondary" onClick={() => reply(false)}>
                  <Reply size={15} />
                  Reply
                </button>
                <button className="button secondary" onClick={() => reply(true)}>
                  <Forward size={15} />
                  Forward
                </button>
                <button
                  className="button secondary"
                  onClick={() => change(selected, { starred: !selected.starred })}
                >
                  {selected.starred ? 'Unstar' : 'Star'}
                </button>
                <button
                  className="button secondary"
                  onClick={() => change(selected, { trashed: !selected.trashed })}
                >
                  {selected.trashed ? 'Restore' : 'Move to trash'}
                </button>
              </div>
              <h2>{selected.subject}</h2>
              <p>
                From: {selected.from}
                <br />
                To: {selected.to}
                {selected.cc && (
                  <>
                    <br />
                    CC: {selected.cc}
                  </>
                )}
                {selected.bcc && (
                  <>
                    <br />
                    BCC: {selected.bcc}
                  </>
                )}
              </p>
              <p className="notice">
                {selected.status}
                {selected.deliveryNote ? ' · ' + selected.deliveryNote : ''}
              </p>
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
                  {selected.body}
                </Markdown>
              </div>
              <div className="mail-file-list">
                {attachments.map((a) => (
                  <a key={a.id} href={`/api/mail/attachments/${a.id}`}>
                    <Paperclip size={15} />
                    {a.title} · {(a.size / 1024).toFixed(1)} KB
                  </a>
                ))}
              </div>
            </>
          ) : (
            <div className="mail-empty">
              <Mail size={36} />
              <h2>Your mailbox</h2>
              <p>Select a message to read it, or compose a new one.</p>
            </div>
          )}
        </section>
      </div>
      {compose && (
        <Modal
          title={compose.draftId ? 'Edit draft' : 'New message'}
          wide
          onClose={() => {
            if (!busy && !uploading) setCompose(null);
          }}
        >
          <form
            className="mail-compose"
            onSubmit={(e) => {
              e.preventDefault();
              persist(false);
            }}
          >
            <div className="mail-address-fields">
              {[
                ['to', 'To'],
                ['cc', 'CC'],
                ['bcc', 'BCC'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    required={key === 'to'}
                    value={compose[key]}
                    placeholder="name@company.com; another@company.com"
                    onChange={(e) => setCompose({ ...compose, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label>
              Subject
              <input
                aria-label="Subject"
                maxLength={200}
                required
                value={compose.subject}
                onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
              />
            </label>
            <div className="mail-compose-tools">
              {[
                ['Bold', '**text**'],
                ['Italic', '*text*'],
                ['Code', '`code`'],
              ].map(([label, text]) => (
                <button
                  type="button"
                  className="button secondary"
                  key={label}
                  onClick={() => setCompose({ ...compose, body: compose.body + text })}
                >
                  {label}
                </button>
              ))}
              <button
                className="button secondary"
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={15} />
                Attach files
              </button>
            </div>
            <label>
              Message
              <textarea
                aria-label="Message"
                rows={10}
                required
                maxLength={50000}
                value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })}
              />
            </label>
            <small>
              Markdown formatting is supported in the workspace. External email includes a
              plain-text copy. Up to 20 MB of attachments.
            </small>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              aria-label="Mail attachments"
              onChange={async (e) => {
                const files = [...(e.target.files || [])];
                setUploading(true);
                setComposeError('');
                try {
                  for (const file of files) {
                    const form = new FormData();
                    form.append('file', file);
                    const a = await api('/mail/attachments', 'POST', form);
                    setCompose((c) => (c ? { ...c, attachments: [...c.attachments, a] } : c));
                  }
                } catch (e) {
                  setComposeError((e as Error).message);
                } finally {
                  setUploading(false);
                  if (fileInput.current) fileInput.current.value = '';
                }
              }}
            />
            <div className="mail-file-list">
              {compose.attachments.map((a: Item) => (
                <span key={a.id}>
                  {a.title}
                  <button
                    type="button"
                    aria-label={'Remove ' + a.title}
                    onClick={async () => {
                      try {
                        if (!a.messageId) await api('/mail/attachments/' + a.id, 'DELETE');
                        setCompose((c) =>
                          c
                            ? {
                                ...c,
                                attachments: c.attachments.filter((v: Item) => v.id !== a.id),
                              }
                            : c,
                        );
                      } catch (e) {
                        setComposeError((e as Error).message);
                      }
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {composeError && (
              <p className="error" role="alert">
                {composeError}
              </p>
            )}
            <footer>
              <span>
                {uploading
                  ? 'Uploading…'
                  : config.smtp
                    ? 'External mail uses your configured SMTP relay.'
                    : 'External delivery unavailable until SMTP is configured.'}
              </span>
              <button
                className="button secondary"
                type="button"
                disabled={busy || uploading}
                onClick={() => persist(true)}
              >
                Save draft
              </button>
              <button className="button primary" disabled={busy || uploading}>
                <Send size={16} />
                Send message
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
