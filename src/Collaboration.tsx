import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Hash,
  Plus,
  Send,
  Video,
  CalendarDays,
  Clock3,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MonitorUp,
  PhoneOff,
  Users,
  ArrowRight,
} from 'lucide-react';
import {
  api,
  save,
  getCsrf,
  initials,
  isoToday,
  niceDate,
  type State,
  type User,
  type Item,
} from './api';
import { Badge, Empty, FormModal, Modal } from './components';

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
    [text, setText] = useState(''),
    [newChannel, setNewChannel] = useState(false),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMessages(state.messages ?? []);
    if (!channel && state.channels?.[0]) setChannel(state.channels[0].id);
  }, [state]);
  useEffect(() => {
    if (!channel) return;
    const socket = io({ auth: { csrf: getCsrf() } });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('channel:join', channel);
      api('/entities/messages')
        .then(setMessages)
        .catch((e) => notify(e.message));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('message', (message: Item) =>
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message])),
    );
    return () => {
      socket.disconnect();
    };
  }, [channel]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, channel]);
  const current = state.channels?.find((c) => c.id === channel),
    list = messages
      .filter((m) => m.channelId === channel)
      .sort((a, b) => a.created.localeCompare(b.created));
  const send = async () => {
    if (!text.trim() || !channel || busy) return;
    setBusy(true);
    try {
      const message = await save('messages', { channelId: channel, text });
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
      setText('');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chat-layout">
      <aside className="channels">
        <div>
          <strong>Channels</strong>
          <button
            className="icon-button"
            aria-label="New channel"
            onClick={() => setNewChannel(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        {state.channels?.map((c) => (
          <button
            className={channel === c.id ? 'active' : ''}
            key={c.id}
            onClick={() => setChannel(c.id)}
          >
            <Hash size={18} />
            {c.title}
          </button>
        ))}
        <footer>
          <span className={`online-dot ${connected ? '' : 'offline'}`} />
          {connected ? 'Connected' : 'Reconnecting…'}
        </footer>
      </aside>
      <section className="conversation">
        <header>
          <Hash size={22} />
          <div>
            <h3>{current?.title ?? 'Your conversations'}</h3>
            <p>{current?.description || 'A space to bring your ideas together.'}</p>
          </div>
          <div className="grow" />
          <Users size={19} />
        </header>
        <div className="message-list">
          {!list.length && (
            <Empty
              title={`This is the start of #${current?.title ?? 'your channel'}`}
              description="Share an idea, ask a question, start something good."
            />
          )}
          {list.map((m, i) => {
            const author = users.find((u) => u.id === m.owner),
              same = i > 0 && list[i - 1].owner === m.owner;
            return (
              <article
                key={m.id}
                className={`chat-message ${m.owner === user.id ? 'own' : ''} ${same ? 'continued' : ''}`}
              >
                <span className="avatar">{initials(author?.name ?? '?')}</span>
                <div>
                  <header>
                    <strong>{author?.name ?? 'Team member'}</strong>
                    <time>
                      {new Date(m.created).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </header>
                  <p>{m.text}</p>
                </div>
              </article>
            );
          })}
          <div ref={bottom} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Channel message"
            placeholder={`Message #${current?.title ?? 'channel'}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div>
            <small>Enter to send · Shift + Enter for a new line</small>
            <button className="button primary" disabled={busy || !text.trim() || !channel}>
              <Send size={16} /> Send
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
            setChannel(c.id);
            notify('Channel created');
          }}
        />
      )}
    </div>
  );
}

export function Meetings({
  state,
  user,
  users,
  notify,
  newEvent,
}: {
  state: State;
  user: User;
  users: User[];
  notify: (t: string) => void;
  newEvent: () => void;
}) {
  const [month, setMonth] = useState(isoToday().slice(0, 7)),
    [day, setDay] = useState(isoToday()),
    [meeting, setMeeting] = useState<Item | null>(null);
  const start = new Date(month + '-01T12:00:00'),
    offset = (start.getDay() + 6) % 7,
    last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(),
    events = (state.events ?? []).sort((a, b) => a.start.localeCompare(b.start));
  const localDay = (v: string) => {
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return (
    <>
      <div className="calendar-layout">
        <section className="calendar-panel panel">
          <div className="section-bar">
            <h2>{start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
            <input
              type="month"
              aria-label="Calendar month"
              value={month}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setDay(e.target.value + '-01');
                }
              }}
            />
          </div>
          <div className="calendar-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((s) => (
              <div className="calendar-day-label" key={s}>
                {s}
              </div>
            ))}
            {Array.from({ length: Math.ceil((last + offset) / 7) * 7 }, (_, i) => {
              const n = i - offset + 1,
                id = month + '-' + String(n).padStart(2, '0');
              return (
                <button
                  disabled={n < 1 || n > last}
                  className={`${id === day ? 'selected' : ''} ${id === isoToday() ? 'today' : ''}`}
                  key={i}
                  onClick={() => setDay(id)}
                >
                  {n > 0 && n <= last && (
                    <>
                      <span>{n}</span>
                      {events
                        .filter((e) => localDay(e.start) === id)
                        .slice(0, 2)
                        .map((e) => (
                          <small key={e.id}>{e.title}</small>
                        ))}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="day-schedule panel">
          <div className="section-bar">
            <h2>{niceDate(day)}</h2>
            <button className="icon-button" aria-label="Schedule meeting" onClick={newEvent}>
              <Plus size={18} />
            </button>
          </div>
          {events
            .filter((e) => localDay(e.start) === day)
            .map((e) => (
              <article className="meeting-card" key={e.id}>
                <div>
                  <Video size={20} />
                  <Badge>Meeting</Badge>
                </div>
                <h3>{e.title}</h3>
                <p>
                  <Clock3 size={13} />
                  {new Date(e.start).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(e.end).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p>{e.description}</p>
                <div className="avatar-stack">
                  {e.attendees.map((id: string) => (
                    <span
                      key={id}
                      className="avatar tiny"
                      title={users.find((u) => u.id === id)?.name}
                    >
                      {initials(users.find((u) => u.id === id)?.name ?? '?')}
                    </span>
                  ))}
                </div>
                <button className="button primary" onClick={() => setMeeting(e)}>
                  <Video size={15} /> Join meeting
                </button>
              </article>
            ))}
          {!events.some((e) => localDay(e.start) === day) && (
            <Empty
              title="Room for focus"
              description="No meetings scheduled for this day."
              action={
                <button className="text-link" onClick={newEvent}>
                  Schedule something <ArrowRight size={14} />
                </button>
              }
            />
          )}
        </aside>
      </div>
      <p className="footnote">
        Meetings use browser audio, video and screen sharing. Use HTTPS outside localhost, and
        configure TURN for participants on different networks. Up to 6 participants per room.
      </p>
      {meeting && (
        <MeetingRoom
          meeting={meeting}
          user={user}
          onClose={() => setMeeting(null)}
          notify={notify}
        />
      )}
    </>
  );
}
function VideoTile({
  stream,
  name,
  muted = false,
}: {
  stream: MediaStream;
  name: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span>{name}</span>
    </div>
  );
}
function MeetingRoom({
  meeting,
  user,
  onClose,
  notify,
}: {
  meeting: Item;
  user: User;
  onClose: () => void;
  notify: (t: string) => void;
}) {
  const [local, setLocal] = useState<MediaStream | null>(null),
    [remotes, setRemotes] = useState<Record<string, { stream: MediaStream; name: string }>>({}),
    [error, setError] = useState(''),
    [mic, setMic] = useState(true),
    [camera, setCamera] = useState(true),
    [screen, setScreen] = useState<MediaStream | null>(null),
    [ready, setReady] = useState(false);
  const socket = useRef<Socket | null>(null),
    peers = useRef<Record<string, RTCPeerConnection>>({}),
    localRef = useRef<MediaStream | null>(null),
    screenRef = useRef<MediaStream | null>(null),
    candidates = useRef<Record<string, RTCIceCandidateInit[]>>({}),
    ice = useRef<RTCConfiguration>({ iceServers: [] });
  const cleanup = () => {
    socket.current?.emit('meeting:leave');
    socket.current?.disconnect();
    Object.values(peers.current).forEach((p) => p.close());
    peers.current = {};
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
  };
  useEffect(() => () => cleanup(), []);
  const makePeer = (id: string, name: string) => {
    if (peers.current[id]) return peers.current[id];
    const pc = new RTCPeerConnection(ice.current);
    peers.current[id] = pc;
    localRef.current?.getTracks().forEach((t) => {
      const track =
        t.kind === 'video' && screenRef.current ? screenRef.current.getVideoTracks()[0] : t;
      pc.addTrack(track, screenRef.current ?? localRef.current!);
    });
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.current?.emit('meeting:signal', {
          to: id,
          room: meeting.id,
          signal: { candidate: e.candidate.toJSON() },
        });
    };
    pc.ontrack = (e) =>
      setRemotes((r) => ({
        ...r,
        [id]: { stream: e.streams[0] ?? new MediaStream([e.track]), name },
      }));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed')
        setError('A peer connection failed. Check HTTPS and your TURN configuration.');
    };
    return pc;
  };
  const start = async () => {
    setError('');
    try {
      ice.current = await api('/rtc-config');
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localRef.current = media;
      setLocal(media);
      const s = io({ auth: { csrf: getCsrf() } });
      socket.current = s;
      s.on('connect', () => {
        setReady(true);
        s.emit('meeting:join', meeting.id);
      });
      s.on('disconnect', () => {
        Object.values(peers.current).forEach((p) => p.close());
        peers.current = {};
        setRemotes({});
        setReady(false);
        setError('Meeting connection ended. Rejoin to continue.');
      });
      s.on('connect_error', () => setError('Unable to authenticate the meeting connection.'));
      s.on('meeting:error', setError);
      s.on('meeting:peers', async (members: { id: string; name: string }[]) => {
        for (const member of members)
          try {
            const pc = makePeer(member.id, member.name);
            await pc.setLocalDescription(await pc.createOffer());
            s.emit('meeting:signal', {
              to: member.id,
              room: meeting.id,
              signal: { description: pc.localDescription },
            });
          } catch (e) {
            setError((e as Error).message);
          }
      });
      s.on('meeting:signal', async ({ from, signal, name }) => {
        try {
          const pc = makePeer(from, name);
          if (signal.description) {
            await pc.setRemoteDescription(signal.description);
            for (const c of candidates.current[from] ?? []) await pc.addIceCandidate(c);
            candidates.current[from] = [];
            if (signal.description.type === 'offer') {
              await pc.setLocalDescription(await pc.createAnswer());
              s.emit('meeting:signal', {
                to: from,
                room: meeting.id,
                signal: { description: pc.localDescription },
              });
            }
          } else if (signal.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
            else candidates.current[from] = [...(candidates.current[from] ?? []), signal.candidate];
          }
        } catch (e) {
          setError((e as Error).message);
        }
      });
      s.on('meeting:left', (id: string) => {
        peers.current[id]?.close();
        delete peers.current[id];
        setRemotes((r) => {
          const n = { ...r };
          delete n[id];
          return n;
        });
      });
    } catch (e) {
      setError(`Could not start camera and microphone: ${(e as Error).message}`);
      cleanup();
    }
  };
  const stopScreen = async () => {
    for (const pc of Object.values(peers.current)) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      await sender?.replaceTrack(localRef.current?.getVideoTracks()[0] ?? null);
    }
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setScreen(null);
  };
  const shareScreen = async () => {
    try {
      if (screenRef.current) {
        await stopScreen();
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = stream;
      setScreen(stream);
      for (const pc of Object.values(peers.current))
        await pc
          .getSenders()
          .find((s) => s.track?.kind === 'video')
          ?.replaceTrack(stream.getVideoTracks()[0]);
      stream.getVideoTracks()[0].onended = () => stopScreen();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <Modal
      title={meeting.title}
      description="Your meeting space · audio, video & screen sharing"
      onClose={onClose}
      wide
    >
      <div className="meeting-room">
        {error && <div className="error">{error}</div>}
        {!local ? (
          <div className="meeting-lobby">
            <Video size={44} />
            <h2>A good conversation starts here.</h2>
            <p>Your browser will ask for camera and microphone permission.</p>
            <button className="button primary" onClick={start}>
              <Video size={16} /> Enter meeting
            </button>
          </div>
        ) : (
          <>
            <div className="video-grid">
              <VideoTile stream={screen ?? local} name={user.name + ' (you)'} muted />
              {Object.entries(remotes).map(([id, r]) => (
                <VideoTile key={id} stream={r.stream} name={r.name} />
              ))}
            </div>
            <div className="meeting-status">
              <span className="online-dot" />
              {ready
                ? `${Object.keys(remotes).length + 1} participant(s) connected`
                : 'Connecting…'}
            </div>
            <div className="meeting-controls">
              <button
                aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}
                className={`icon-button ${mic ? '' : 'off'}`}
                onClick={() => {
                  local.getAudioTracks().forEach((t) => (t.enabled = !mic));
                  setMic(!mic);
                }}
              >
                {mic ? <Mic /> : <MicOff />}
              </button>
              <button
                aria-label={camera ? 'Turn camera off' : 'Turn camera on'}
                className={`icon-button ${camera ? '' : 'off'}`}
                onClick={() => {
                  local.getVideoTracks().forEach((t) => (t.enabled = !camera));
                  setCamera(!camera);
                }}
              >
                {camera ? <Camera /> : <CameraOff />}
              </button>
              <button
                className={`button secondary ${screen ? 'active' : ''}`}
                onClick={shareScreen}
              >
                <MonitorUp size={18} />
                {screen ? 'Stop sharing' : 'Share screen'}
              </button>
              <button className="button danger" onClick={onClose}>
                <PhoneOff size={18} /> Leave
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
