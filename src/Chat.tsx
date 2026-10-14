import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Hash,
  Plus,
  Send,
  Video,
  Phone,
  Paperclip,
  FolderUp,
  Smile,
  MessageCircle,
  X,
} from 'lucide-react';
import { api, save, getCsrf, initials, type State, type User, type Item } from './api';
import { Empty, FormModal } from './components';
import { MeetingRoom } from './Collaboration';
const emojis = [
  '😀',
  '😊',
  '😂',
  '❤️',
  '👍',
  '👏',
  '🎉',
  '🚀',
  '✅',
  '👀',
  '🙏',
  '🤔',
  '💡',
  '🔥',
  '📌',
  '💻',
  '🐛',
  '☕',
  '💪',
  '🙌',
  '😅',
  '👋',
  '⭐',
  '❗',
];
function RichText({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        img: () => null,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
export function Chat({
  state,
  user,
  users,
  refresh,
  notify,
  projectOptions,
}: {
  state: State;
  user: User;
  users: User[];
  refresh: () => Promise<void>;
  notify: (t: string) => void;
  projectOptions: { value: string; label: string }[];
}) {
  const [channel, setChannel] = useState(state.channels?.[0]?.id ?? ''),
    [messages, setMessages] = useState<Item[]>(state.messages ?? []),
    [channels, setChannels] = useState<Item[]>(state.channels ?? []),
    [attachments, setAttachments] = useState<Item[]>([]),
    [pending, setPending] = useState<Item[]>([]),
    [text, setText] = useState(''),
    [newChannel, setNewChannel] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [connected, setConnected] = useState(false),
    [emoji, setEmoji] = useState(false),
    [preview, setPreview] = useState(false),
    [meeting, setMeeting] = useState<Item | null>(null);
  const bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    gif = useRef<HTMLInputElement>(null);
  const currentId = useRef(channel);
  currentId.current = channel;
  useEffect(() => {
    setChannels(state.channels ?? []);
    setMessages(state.messages ?? []);
  }, [state]);
  useEffect(() => {
    folder.current?.setAttribute('webkitdirectory', '');
  }, []);
  async function loadAttachments(id: string) {
    const result = await api('/chat/' + id + '/attachments');
    if (currentId.current === id) {
      setAttachments(result);
      setPending(result.filter((a: Item) => !a.messageId && a.owner === user.id));
    }
  }
  useEffect(() => {
    if (!channel) return;
    let live = true;
    setAttachments([]);
    setPending([]);
    setText('');
    loadAttachments(channel).catch((e) => notify(e.message));
    const socket = io({ auth: { csrf: getCsrf() } });
    socket.on('connect', () => {
      if (!live) return;
      setConnected(true);
      socket.emit('channel:join', channel);
      api('/entities/messages')
        .then((data) => {
          if (live) setMessages(data);
        })
        .catch((e) => notify(e.message));
    });
    socket.on('disconnect', () => {
      if (live) setConnected(false);
    });
    socket.on('connect_error', () => {
      if (live) setConnected(false);
    });
    socket.on('chat:updated', () => {
      api('/entities/channels')
        .then((data) => {
          if (live) setChannels(data);
        })
        .catch((e) => notify(e.message));
    });
    socket.on('message', (message: Item) => {
      if (live) {
        setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
        if (message.channelId === channel) loadAttachments(channel).catch((e) => notify(e.message));
      }
    });
    return () => {
      live = false;
      socket.disconnect();
    };
  }, [channel]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, channel]);
  const current = channels.find((c) => c.id === channel);
  const title = (c?: Item) =>
    c?.visibility === 'direct'
      ? users.find((u) => c.memberIds.includes(u.id) && u.id !== user.id)?.name ||
        'Private conversation'
      : c?.title || 'Your conversations';
  const list = messages
    .filter((m) => m.channelId === channel)
    .sort((a, b) => a.created.localeCompare(b.created));
  async function direct(id: string) {
    if (!id) return;
    try {
      const c = await api('/chat/direct', 'POST', { userId: id });
      setChannels((cs) => (cs.some((v) => v.id === c.id) ? cs : [...cs, c]));
      setChannel(c.id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function format(before: string, after = before) {
    const area = input.current;
    const start = area?.selectionStart || 0,
      end = area?.selectionEnd || start;
    setText(
      text.slice(0, start) + before + (text.slice(start, end) || 'text') + after + text.slice(end),
    );
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + before.length, end + before.length);
    });
  }
  async function attach(selected: File[]) {
    if (!channel || uploading || busy) return;
    if (
      pending.length + selected.length > 100 ||
      [...selected, ...pending].reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024
    )
      return notify('Attach at most 100 files and 100 MB per message.');
    if (selected.some((f) => f.size > 25 * 1024 * 1024))
      return notify('Each file must be 25 MB or smaller.');
    setUploading(true);
    const target = channel;
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append('file', file);
        form.append('relativePath', file.webkitRelativePath || file.name);
        const result = await api('/chat/' + target + '/attachments', 'POST', form);
        if (currentId.current === target) {
          setPending((p) => [...p, result]);
          setAttachments((a) => [...a, result]);
        }
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
      if (files.current) files.current.value = '';
      if (folder.current) folder.current.value = '';
      if (gif.current) gif.current.value = '';
    }
  }
  async function send() {
    if ((!text.trim() && !pending.length) || !channel || busy || uploading) return;
    const target = channel;
    setBusy(true);
    try {
      const message = await save('messages', {
        channelId: target,
        text,
        attachments: pending.map((a) => a.id),
      });
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
      if (currentId.current === target) {
        setText('');
        setPending([]);
        setPreview(false);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function call(mode: 'audio' | 'video') {
    try {
      setMeeting(await api('/chat/' + channel + '/call', 'POST', { mode }));
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="chat-layout rich-chat">
      <aside className="channels">
        <div>
          <strong>Conversations</strong>
          <button
            className="icon-button"
            aria-label="New channel"
            onClick={() => setNewChannel(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        <label className="chat-person-picker">
          New private chat
          <select
            aria-label="Start private chat"
            value=""
            disabled={uploading || busy}
            onChange={(e) => direct(e.target.value)}
          >
            <option value="">Choose a person…</option>
            {users
              .filter((u) => u.active && u.id !== user.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === user.managerId
                    ? ' · Your manager'
                    : u.managerId === user.id
                      ? ' · Direct report'
                      : ''}
                </option>
              ))}
          </select>
        </label>
        {user.managerId && (
          <button onClick={() => direct(user.managerId!)}>
            <MessageCircle size={16} />
            Chat with my manager
          </button>
        )}
        {channels.map((c) => (
          <button
            disabled={uploading || busy}
            className={channel === c.id ? 'active' : ''}
            key={c.id}
            onClick={() => setChannel(c.id)}
          >
            {c.visibility === 'direct' ? <MessageCircle size={18} /> : <Hash size={18} />}
            <span>{title(c)}</span>
          </button>
        ))}
        <footer>
          <span className={`online-dot ${connected ? '' : 'offline'}`} />
          {connected ? 'Connected' : 'Reconnecting…'}
        </footer>
      </aside>
      <section className="conversation">
        <header>
          <MessageCircle size={22} />
          <div>
            <h3>{title(current)}</h3>
            <p>{current?.description || 'Messages, ideas and files in one place.'}</p>
          </div>
          <div className="grow" />
          <button
            className="icon-button"
            aria-label="Start audio call"
            disabled={!channel}
            onClick={() => call('audio')}
          >
            <Phone size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Start video call"
            disabled={!channel}
            onClick={() => call('video')}
          >
            <Video size={20} />
          </button>
        </header>
        <div className="message-list">
          {!list.length && (
            <Empty
              title="Start the conversation"
              description="Share an idea, a document or a quick hello."
            />
          )}
          {list.map((m) => (
            <article key={m.id} className={`chat-message ${m.owner === user.id ? 'own' : ''}`}>
              <span className="avatar">
                {initials(users.find((u) => u.id === m.owner)?.name || '?')}
              </span>
              <div className="chat-message-body">
                <header>
                  <strong>{users.find((u) => u.id === m.owner)?.name || 'Team member'}</strong>
                  <time>
                    {new Date(m.created).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </header>
                <div className="chat-markdown">
                  <RichText text={m.text} />
                </div>
                {!!m.callId && (
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        const events: Item[] = await api('/entities/events');
                        const event = events.find((e) => e.id === m.callId);
                        if (!event || Date.parse(event.end) < Date.now())
                          throw Error('This call invitation has expired');
                        setMeeting(event);
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <Phone size={15} />
                    Join call
                  </button>
                )}
                <div className="chat-attachments">
                  {(m.attachments || []).map((id: string) => {
                    const a = attachments.find((v) => v.id === id);
                    return (
                      a && (
                        <a
                          className="chat-attachment"
                          key={id}
                          href={'/api/chat/attachments/' + id + '/download'}
                        >
                          {a.imageType && (
                            <img
                              loading="lazy"
                              src={'/api/chat/attachments/' + id + '/preview'}
                              alt={a.title}
                            />
                          )}
                          <span>
                            <Paperclip size={13} />
                            {a.relativePath || a.title}
                          </span>
                          <small>{(a.size / 1024).toFixed(1)} KB · Download</small>
                        </a>
                      )
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
          <div ref={bottom} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            attach([...e.dataTransfer.files]);
          }}
        >
          <div className="chat-formatting" role="toolbar" aria-label="Message formatting">
            {[
              ['Bold', '**', '**'],
              ['Italic', '_', '_'],
              ['Strike', '~~', '~~'],
              ['Code', '`', '`'],
              ['Code block', '```\n', '\n```'],
              ['List', '\n- ', ''],
              ['Quote', '\n> ', ''],
            ].map(([name, before, after]) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                onClick={() => format(before, after)}
              >
                {name}
              </button>
            ))}
            <button type="button" onClick={() => setPreview(!preview)}>
              {preview ? 'Edit text' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="chat-markdown composer-preview">
              <RichText text={text} />
            </div>
          ) : (
            <textarea
              ref={input}
              aria-label="Channel message"
              placeholder={'Message ' + title(current) + '…'}
              value={text}
              maxLength={10000}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  attach([...e.clipboardData.files]);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          )}
          <div className="chat-pending">
            {pending.map((a) => (
              <span key={a.id}>
                {a.relativePath}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={'Remove attachment ' + a.title}
                  disabled={busy || uploading}
                  onClick={async () => {
                    try {
                      await api('/chat/attachments/' + a.id, 'DELETE');
                      setPending((p) => p.filter((v) => v.id !== a.id));
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <input
            ref={files}
            hidden
            type="file"
            multiple
            aria-label="Attach chat files"
            onChange={(e) => attach([...(e.target.files || [])])}
          />
          <input
            ref={folder}
            hidden
            type="file"
            multiple
            aria-label="Attach chat folder"
            onChange={(e) => attach([...(e.target.files || [])])}
          />
          <input
            ref={gif}
            hidden
            type="file"
            accept="image/gif"
            aria-label="Attach GIF"
            onChange={(e) => attach([...(e.target.files || [])])}
          />
          {emoji && (
            <div className="emoji-picker" aria-label="Emoji picker">
              {emojis.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-label={'Insert ' + value}
                  onClick={() => {
                    setText((t) => t + value);
                    setEmoji(false);
                    input.current?.focus();
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          <div className="chat-send-actions">
            <div>
              <button
                type="button"
                className="icon-button"
                aria-label="Attach files or images"
                disabled={uploading}
                onClick={() => files.current?.click()}
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Attach folder"
                disabled={uploading}
                onClick={() => folder.current?.click()}
              >
                <FolderUp size={18} />
              </button>
              <button type="button" className="icon-button" onClick={() => gif.current?.click()}>
                GIF
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Choose emoji"
                onClick={() => setEmoji(!emoji)}
              >
                <Smile size={18} />
              </button>
            </div>
            <small>
              {uploading ? 'Uploading…' : 'Enter to send · Shift + Enter for a new line'}
            </small>
            <button
              className="button primary"
              disabled={busy || uploading || (!text.trim() && !pending.length) || !channel}
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </form>
      </section>
      {newChannel && (
        <FormModal
          title="Create a channel"
          onClose={() => setNewChannel(false)}
          fields={[
            { key: 'title', label: 'Channel name', required: true },
            { key: 'description', label: 'What is this channel for?', type: 'textarea' },
            {
              key: 'projectId',
              label: 'Access',
              type: 'select',
              options: projectOptions.map((p) =>
                p.value ? p : { value: '', label: 'Everyone in the workspace' },
              ),
            },
          ]}
          onSubmit={async (data) => {
            const c = await save('channels', data);
            await refresh();
            setChannels((cs) => [...cs.filter((v) => v.id !== c.id), c]);
            setChannel(c.id);
            notify('Channel created');
          }}
        />
      )}
      {meeting && (
        <MeetingRoom
          meeting={meeting}
          user={user}
          onClose={() => setMeeting(null)}
          notify={notify}
        />
      )}
    </div>
  );
}
