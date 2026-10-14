import { useEffect, useRef, useState } from 'react';
import { Mic, SlidersHorizontal } from 'lucide-react';
export type MediaPreferences = {
  microphone: string;
  speaker: string;
  camera: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
};
export function mediaPreferences(userId: string): MediaPreferences {
  const defaults = {
    microphone: '',
    speaker: '',
    camera: '',
    echoCancellation: true,
    noiseSuppression: true,
  };
  try {
    const value = JSON.parse(localStorage.getItem('reverse-media-' + userId) || '{}');
    for (const name of ['microphone', 'speaker', 'camera'] as const)
      if (typeof value[name] === 'string' && value[name].length < 512) defaults[name] = value[name];
    for (const name of ['echoCancellation', 'noiseSuppression'] as const)
      if (typeof value[name] === 'boolean') defaults[name] = value[name];
  } catch {}
  return defaults;
}
export function audioConstraints(p: MediaPreferences): MediaTrackConstraints {
  return {
    ...(p.microphone ? { deviceId: { ideal: p.microphone } } : {}),
    echoCancellation: p.echoCancellation,
    noiseSuppression: p.noiseSuppression,
  };
}
export function videoConstraints(p: MediaPreferences): MediaTrackConstraints {
  return { ...(p.camera ? { deviceId: { ideal: p.camera } } : {}), width: { ideal: 1280 } };
}
export async function setSpeaker(element: HTMLMediaElement, id: string) {
  const media = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (media.setSinkId) await media.setSinkId(id);
  else if (id)
    throw Error(
      'This browser uses the system audio output. Change it in your operating system settings.',
    );
}
export function MediaSettings({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState(() => mediaPreferences(userId)),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [status, setStatus] = useState(''),
    [testing, setTesting] = useState(false),
    [level, setLevel] = useState(0);
  const stop = useRef<() => void>(() => {}),
    mounted = useRef(true);
  async function enumerate() {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setStatus('Device selection requires HTTPS or localhost and a supported browser.');
    }
  }
  useEffect(() => {
    mounted.current = true;
    enumerate();
    const changed = () => {
      enumerate();
    };
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    return () => {
      mounted.current = false;
      stop.current();
      navigator.mediaDevices?.removeEventListener('devicechange', changed);
    };
  }, []);
  async function testMic() {
    if (testing) {
      stop.current();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(prefs),
        video: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const context = new AudioContext(),
        analyser = context.createAnalyser(),
        bytes = new Uint8Array(256);
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      let frame = 0;
      const tick = () => {
        analyser.getByteFrequencyData(bytes);
        setLevel(Math.min(100, (bytes.reduce((sum, n) => sum + n, 0) / bytes.length) * 2));
        frame = requestAnimationFrame(tick);
      };
      const timer = setTimeout(() => stop.current(), 10000);
      stop.current = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        context.close().catch(() => {});
        stop.current = () => {};
        setTesting(false);
        setLevel(0);
      };
      await context.resume();
      setTesting(true);
      setStatus('Microphone test · stops automatically after 10 seconds.');
      tick();
      await enumerate();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }
  async function testSpeaker() {
    try {
      // Original short PCM tone; no external media, codec package or audio asset.
      const count = 11025,
        bytes = new ArrayBuffer(44 + count * 2),
        view = new DataView(bytes);
      const word = (offset: number, value: string) =>
        [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      word(0, 'RIFF');
      view.setUint32(4, 36 + count * 2, true);
      word(8, 'WAVE');
      word(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 22050, true);
      view.setUint32(28, 44100, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      word(36, 'data');
      view.setUint32(40, count * 2, true);
      for (let i = 0; i < count; i++)
        view.setInt16(
          44 + i * 2,
          Math.sin((i * 440 * 2 * Math.PI) / 22050) * Math.sin((Math.PI * i) / count) * 6000,
          true,
        );
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })),
        audio = new Audio(url);
      try {
        await setSpeaker(audio, prefs.speaker);
        await audio.play();
        setTimeout(() => {
          audio.pause();
          URL.revokeObjectURL(url);
        }, 1000);
        setStatus('Playing a short test tone.');
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    } catch (error) {
      setStatus((error as Error).message);
    }
  }
  return (
    <section className="panel media-settings">
      <SlidersHorizontal />
      <h3>Audio & video preferences</h3>
      <p>
        Saved for your account in this browser. Calls use these devices; unavailable devices fall
        back to the system default.
      </p>
      {(['microphone', 'speaker', 'camera'] as const).map((name) => {
        const kind = { microphone: 'audioinput', speaker: 'audiooutput', camera: 'videoinput' }[
          name
        ];
        return (
          <label key={name}>
            Preferred {name}
            <select
              aria-label={'Preferred ' + name}
              value={prefs[name]}
              onChange={(e) => setPrefs({ ...prefs, [name]: e.target.value })}
            >
              <option value="">System default</option>
              {prefs[name] && !devices.some((d) => d.deviceId === prefs[name]) && (
                <option value={prefs[name]}>Saved device (currently unavailable)</option>
              )}
              {devices
                .filter((d) => d.kind === kind && d.deviceId)
                .map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || name + ' ' + (i + 1)}
                  </option>
                ))}
            </select>
          </label>
        );
      })}
      <div className="media-options">
        {(['echoCancellation', 'noiseSuppression'] as const).map((name) => (
          <label key={name}>
            <input
              type="checkbox"
              checked={prefs[name]}
              onChange={(e) => setPrefs({ ...prefs, [name]: e.target.checked })}
            />
            {name === 'echoCancellation' ? 'Echo cancellation' : 'Noise suppression'}
          </label>
        ))}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="button"
          onClick={async () => {
            try {
              const devices = navigator.mediaDevices as MediaDevices & {
                selectAudioOutput?: () => Promise<MediaDeviceInfo>;
              };
              if (!devices.selectAudioOutput) {
                setStatus(
                  'Use the preferred speaker list or your system audio settings in this browser.',
                );
                return;
              }
              const chosen = await devices.selectAudioOutput();
              setPrefs((current) => ({ ...current, speaker: chosen.deviceId }));
              await enumerate();
            } catch (error) {
              setStatus((error as Error).message);
            }
          }}
        >
          Choose speaker
        </button>
        <button
          type="button"
          className="button"
          onClick={async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
              stream.getTracks().forEach((t) => t.stop());
              await enumerate();
              setStatus('Camera choices refreshed.');
            } catch (error) {
              setStatus((error as Error).message);
            }
          }}
        >
          Enable camera choices
        </button>

        <button
          className="button"
          type="button"
          onClick={async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              stream.getTracks().forEach((t) => t.stop());
              await enumerate();
              setStatus('Device list refreshed.');
            } catch (error) {
              setStatus((error as Error).message);
            }
          }}
        >
          Refresh devices
        </button>
        <button type="button" className="button" onClick={testMic}>
          <Mic size={15} />
          {testing ? 'Stop microphone test' : 'Test microphone'}
        </button>
        <button type="button" className="button" onClick={testSpeaker}>
          Test speaker
        </button>
      </div>
      {testing && <meter aria-label="Microphone level" min={0} max={100} value={level} />}
      <p role="status">{status}</p>
      <button
        type="button"
        className="button primary"
        onClick={() => {
          try {
            localStorage.setItem('reverse-media-' + userId, JSON.stringify(prefs));
            setStatus(
              'Audio and video preferences saved. Rejoin an active call to apply input changes.',
            );
            window.dispatchEvent(new Event('reverse-media-change'));
          } catch {
            setStatus('Browser storage is unavailable; preferences could not be saved.');
          }
        }}
      >
        Save device preferences
      </button>
      <small>
        Speaker selection depends on browser support. If unavailable, use your operating system's
        audio output settings.
      </small>
    </section>
  );
}
