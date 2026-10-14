import { mediaPreferences, audioConstraints, videoConstraints, setSpeaker } from './MediaSettings';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Video,
  Plus,
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
  niceDate,
  api,
  getCsrf,
  initials,
  isoToday,
  type State,
  type User,
  type Item,
} from './api';
import { Badge, Empty, Modal } from './components';

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
  userId,
}: {
  stream: MediaStream;
  name: string;
  muted?: boolean;
  userId: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [outputError, setOutputError] = useState('');
  useEffect(() => {
    const apply = () => {
      if (ref.current && !muted)
        setSpeaker(ref.current, mediaPreferences(userId).speaker).catch((e) =>
          setOutputError(e.message),
        );
    };
    apply();
    window.addEventListener('reverse-media-change', apply);
    return () => window.removeEventListener('reverse-media-change', apply);
  }, [userId, muted]);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span>{name}</span>
      {outputError && <small>{outputError}</small>}
    </div>
  );
}
export function MeetingRoom({
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
    [camera, setCamera] = useState(meeting.callMode !== 'audio'),
    [starting, setStarting] = useState(false),
    [screen, setScreen] = useState<MediaStream | null>(null),
    [ready, setReady] = useState(false);
  const mounted = useRef(true);
  const socket = useRef<Socket | null>(null),
    peers = useRef<Record<string, RTCPeerConnection>>({}),
    localRef = useRef<MediaStream | null>(null),
    screenRef = useRef<MediaStream | null>(null),
    candidates = useRef<Record<string, RTCIceCandidateInit[]>>({}),
    ice = useRef<RTCConfiguration>({ iceServers: [] });
  const cleanup = () => {
    if (localRef.current && meeting.call && meeting.owner === user.id)
      api('/chat/calls/' + meeting.id + '/end', 'POST').catch(() => {});
    socket.current?.emit('meeting:leave');
    socket.current?.disconnect();
    Object.values(peers.current).forEach((p) => p.close());
    peers.current = {};
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    screenRef.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup();
    };
  }, []);
  const makePeer = (id: string, name: string, initiator = true) => {
    if (peers.current[id]) return peers.current[id];
    const pc = new RTCPeerConnection(ice.current);
    peers.current[id] = pc;
    localRef.current?.getTracks().forEach((t) => {
      const track =
        t.kind === 'video' && screenRef.current ? screenRef.current.getVideoTracks()[0] : t;
      pc.addTrack(track, screenRef.current ?? localRef.current!);
    });
    if (initiator && !localRef.current?.getVideoTracks().length)
      pc.addTransceiver('video', { direction: 'sendrecv', streams: [localRef.current!] });
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.current?.emit('meeting:signal', {
          to: id,
          room: meeting.id,
          signal: { candidate: e.candidate.toJSON() },
        });
    };
    pc.ontrack = (e) =>
      setRemotes((r) => {
        const stream = r[id]?.stream || e.streams[0] || new MediaStream();
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        return { ...r, [id]: { stream, name } };
      });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed')
        setError('A peer connection failed. Check HTTPS and your TURN configuration.');
    };
    return pc;
  };
  const start = async (withVideo = camera) => {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      ice.current = await api('/rtc-config');
      const prefs = mediaPreferences(user.id);
      const media = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(prefs),
        video: withVideo ? videoConstraints(prefs) : false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      setCamera(withVideo);
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
      s.on('call:ended', (call: Item) => {
        if (call.id === meeting.id) onClose();
      });
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
          const pc = makePeer(from, name, false);
          if (signal.description) {
            await pc.setRemoteDescription(signal.description);
            for (const c of candidates.current[from] ?? []) await pc.addIceCandidate(c);
            candidates.current[from] = [];
            if (signal.description.type === 'offer') {
              for (const transceiver of pc.getTransceivers())
                if (transceiver.receiver.track.kind === 'video') transceiver.direction = 'sendrecv';
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
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  const stopScreen = async () => {
    for (const pc of Object.values(peers.current)) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;
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
          .getTransceivers()
          .find((t) => t.receiver.track.kind === 'video')
          ?.sender?.replaceTrack(stream.getVideoTracks()[0]);
      stream.getVideoTracks()[0].onended = () => stopScreen();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const leave = () => {
    if (meeting.call && meeting.owner === user.id)
      api('/chat/calls/' + meeting.id + '/end', 'POST').catch(() => {});
    onClose();
  };
  return (
    <Modal
      title={meeting.title}
      description="Your meeting space · audio, video & screen sharing"
      onClose={leave}
      wide
    >
      <div className="meeting-room">
        {error && <div className="error">{error}</div>}
        {!local ? (
          <div className="meeting-lobby">
            <Video size={44} />
            <h2>A good conversation starts here.</h2>
            <p>
              {camera
                ? 'Your browser will ask for camera and microphone permission.'
                : 'Audio call · your camera stays off until you enable it.'}{' '}
              Preferred devices come from My account → Audio & video preferences.
            </p>
            <button className="button primary" disabled={starting} onClick={() => start()}>
              <Video size={16} /> {starting ? 'Connecting…' : 'Enter meeting'}
            </button>
            {camera && (
              <button className="button" disabled={starting} onClick={() => start(false)}>
                Join audio only
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="video-grid">
              <VideoTile
                stream={screen ?? local}
                name={user.name + ' (you)'}
                userId={user.id}
                muted
              />
              {Object.entries(remotes).map(([id, r]) => (
                <VideoTile key={id} stream={r.stream} name={r.name} userId={user.id} />
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
                onClick={async () => {
                  try {
                    if (!localRef.current?.getVideoTracks().length) {
                      const capture = await navigator.mediaDevices.getUserMedia({
                        video: videoConstraints(mediaPreferences(user.id)),
                        audio: false,
                      });
                      if (!mounted.current || !localRef.current) {
                        capture.getTracks().forEach((t) => t.stop());
                        return;
                      }
                      const track = capture.getVideoTracks()[0];
                      localRef.current.addTrack(track);
                      if (!screenRef.current)
                        for (const pc of Object.values(peers.current))
                          await pc
                            .getTransceivers()
                            .find((t) => t.receiver.track.kind === 'video')
                            ?.sender.replaceTrack(track);
                      setLocal(new MediaStream(localRef.current.getTracks()));
                      setCamera(true);
                    } else {
                      localRef.current.getVideoTracks().forEach((t) => (t.enabled = !camera));
                      setCamera(!camera);
                    }
                  } catch (e) {
                    setError((e as Error).message);
                  }
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
              <button className="button danger" onClick={leave}>
                <PhoneOff size={18} /> Leave
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function CallNotifications({
  user,
  notify,
}: {
  user: User;
  notify: (text: string) => void;
}) {
  const [invite, setInvite] = useState<Item | null>(null),
    [meeting, setMeeting] = useState<Item | null>(null);
  useEffect(() => {
    const socket = io({ auth: { csrf: getCsrf() } });
    socket.on('call:invite', (call: Item) => setInvite(call));
    socket.on('call:ended', (call: Item) =>
      setInvite((current) => (current?.id === call.id ? null : current)),
    );
    return () => {
      socket.disconnect();
    };
  }, [user.id]);
  useEffect(() => {
    if (!invite) return;
    const timer = setTimeout(() => setInvite(null), 45000);
    return () => clearTimeout(timer);
  }, [invite]);
  return (
    <>
      {invite && !meeting && (
        <aside className="incoming-call" role="dialog" aria-label="Incoming call">
          <Video />
          <div>
            <strong>{invite.title}</strong>
            <p>Incoming {invite.callMode} call</p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setMeeting(invite);
              setInvite(null);
            }}
          >
            Accept call
          </button>
          <button className="button" onClick={() => setInvite(null)}>
            Decline call
          </button>
        </aside>
      )}
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
