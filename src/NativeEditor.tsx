import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Expand,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
  X,
  ShieldCheck,
} from 'lucide-react';
import { api, type Item } from './api';
import { DocIcon } from './components';
declare global {
  interface Window {
    DocsAPI: any;
  }
}
let sdk: Promise<void> | undefined;
function loadSdk(url: string) {
  if (window.DocsAPI) return Promise.resolve();
  sdk ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => {
      sdk = undefined;
      script.remove();
      reject(Error('The document engine could not be reached. Check the configured editor URL.'));
    };
    document.head.appendChild(script);
  });
  return sdk;
}
export function NativeEditor({
  doc,
  collection = 'documents',
  theme,
  onClose,
  onSaved,
  onAI,
  onDirtyChange,
}: {
  doc: Item;
  collection?: string;
  theme: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAI: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = 'office' + useId().replace(/:/g, ''),
    instance = useRef<any>(null),
    dirtyRef = useRef(false),
    syncPending = useRef(false),
    latestRevision = useRef(0),
    closing = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('Connecting to your document…'),
    [history, setHistory] = useState<Item[] | null>(null),
    [expanded, setExpanded] = useState(false),
    [reload, setReload] = useState(0),
    [dirty, setDirty] = useState(false),
    [editorTheme, setEditorTheme] = useState(theme);
  const base = `/office/${collection}/${doc.id}`,
    format =
      collection === 'files'
        ? 'pdf'
        : ({ doc: 'docx', note: 'docx', sheet: 'xlsx', slides: 'pptx' } as Item)[doc.kind];
  const changed = (v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
    onDirtyChange(v);
  };
  const closed = useRef(onClose);
  closed.current = onClose;
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setReady(false);
    setError('');
    (async () => {
      const service = await api('/office/health');
      if (!service.reachable)
        throw Error(
          service.configured
            ? 'The document engine is starting or unavailable. Wait a moment and reconnect.'
            : 'Full editing needs the document engine. Start Docker Compose with the editors profile; your saved file can still be downloaded.',
        );
      const response = await api(base + '/config', 'POST', { theme });
      latestRevision.current = response.revision;
      await loadSdk(response.scriptUrl);
      if (disposed) return;
      instance.current = new window.DocsAPI.DocEditor(id, {
        ...response.config,
        events: {
          onDocumentReady: () => {
            if (disposed) return;
            setReady(true);
            setEditorTheme(theme);
            setStatus(`Saved · version ${response.revision}`);
          },
          onDocumentStateChange: (event: any) => {
            syncPending.current = !!event.data;
            if (event.data) {
              changed(true);
              setStatus('Editing · save to workspace when ready');
            }
          },
          onError: (event: any) =>
            setError(event.data?.errorDescription || 'The document editor reported an error.'),
          onRequestClose: () => {
            void close();
          },
        },
      });
      timer = setInterval(async () => {
        try {
          const result = await api(base + '/status');
          if (disposed) return;
          const revision = result.office?.revision ?? 0;
          if (revision > latestRevision.current) {
            latestRevision.current = revision;
            setStatus(
              `Version ${revision} saved${dirtyRef.current ? ' · editing session open' : ''}`,
            );
            onSaved().catch(() => {});
          }
        } catch (e) {
          if (!disposed && [401, 403].includes((e as any).status)) {
            instance.current?.denyEditingRights('Your access has changed.');
            setReady(false);
            setError((e as Error).message);
          }
        }
      }, 4000);
    })().catch((e) => {
      if (!disposed) setError(e.message);
    });
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      instance.current?.destroyEditor();
      instance.current = null;
    };
  }, [doc.id, reload]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function persist() {
    setBusy(true);
    setError('');
    setStatus('Saving to workspace…');
    try {
      // The editor acknowledges when local changes have reached its service. A fixed delay can lose the final keystrokes.
      await new Promise((r) => setTimeout(r, 300));
      for (let i = 0; syncPending.current && i < 150; i++)
        await new Promise((r) => setTimeout(r, 200));
      if (syncPending.current)
        throw Error(
          'The editor has not synchronized your changes. Keep it open and check the connection.',
        );
      const result = await api(base + '/save', 'POST', {});
      if (!result.pending)
        latestRevision.current = result.office?.revision ?? latestRevision.current;
      if (result.pending) {
        let saved = false;
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 800));
          const check = await api(base + '/status?save=' + encodeURIComponent(result.requestId));
          if (check.save?.state === 'saved') {
            latestRevision.current = check.save.revision;
            saved = true;
            break;
          }
        }
        if (!saved)
          throw Error('Saving is still pending. Keep this editor open and try again shortly.');
      }
      changed(false);
      setStatus(`Saved · version ${latestRevision.current}`);
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      setStatus('Save needs attention');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (closing.current) return;
    closing.current = true;
    try {
      if (dirtyRef.current && !(await persist())) return;
      changed(false);
      closed.current();
    } finally {
      closing.current = false;
    }
  }
  async function download(f: string) {
    if (dirtyRef.current && !(await persist())) return;
    setBusy(true);
    setError('');
    try {
      const url =
          collection === 'files'
            ? `/api/files/${doc.id}/download`
            : `/api/documents/${doc.id}/export/${f}`,
        response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw Error((await response.json()).error || 'Export failed');
      const blob = await response.blob(),
        link = document.createElement('a'),
        objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = doc.title.replace(/\.(docx|xlsx|pptx|pdf)$/i, '') + '.' + f;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`native-editor ${expanded ? 'expanded' : ''}`}
      aria-label="Full Office editor"
    >
      <div className="native-titlebar">
        <button
          className="icon-button"
          aria-label="Back to workspace"
          onClick={close}
          disabled={busy}
        >
          <ArrowLeft size={19} />
        </button>
        <DocIcon kind={collection === 'files' ? 'pdf' : doc.kind} />
        <div className="native-document-name">
          <strong>{doc.title}</strong>
          <span>
            <i className={dirty ? 'dirty-dot' : 'saved-dot'} />
            {status}
          </span>
        </div>
        <div className="grow" />
        <button className="button secondary native-ai" onClick={onAI}>
          <Sparkles size={15} />
          Ask AI
        </button>
        <button
          className="icon-button"
          aria-label="Version history"
          onClick={async () => {
            try {
              setHistory(await api(base + '/history'));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <History size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={expanded ? 'Exit expanded editor' : 'Expand editor'}
          onClick={() => setExpanded(!expanded)}
        >
          <Expand size={18} />
        </button>
        <label className="native-export">
          <Download size={16} />
          <select
            aria-label="Export document"
            value=""
            disabled={busy}
            onChange={(e) => download(e.target.value)}
          >
            <option value="" disabled>
              Export
            </option>
            {[
              format,
              ...(format === 'pdf' ? [] : ['pdf']),
              ...(format === 'xlsx'
                ? ['csv', 'ods']
                : format === 'docx'
                  ? ['odt', 'rtf', 'txt']
                  : format === 'pptx'
                    ? ['odp']
                    : []),
            ].map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy || !ready} onClick={persist}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save
        </button>
      </div>
      <div className="native-engine-bar">
        <span>
          <ShieldCheck size={13} />
          Full editing · {format.toUpperCase()}
        </span>
        <span>
          {theme !== editorTheme && ready && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (!dirtyRef.current || (await persist())) setReload((v) => v + 1);
              }}
            >
              Apply {theme} to editor
            </button>
          )}
          Powered by ONLYOFFICE Docs
        </span>
      </div>
      {error && (
        <div className="native-error" role="alert">
          <div>
            <strong>{ready ? 'Your document needs attention' : 'Editor unavailable'}</strong>
            <p>{error}</p>
          </div>
          <button className="button secondary" onClick={() => setReload((v) => v + 1)}>
            <RefreshCw size={15} />
            Reconnect
          </button>
        </div>
      )}
      {!ready && !error && (
        <div className="native-loading">
          <div className="loading-orbit">
            <FileGlyph />
          </div>
          <h3>Preparing your workspace</h3>
          <p>Loading the editor, fonts and your document.</p>
          <LoaderCircle size={20} className="spin" />
        </div>
      )}
      <div
        className="native-frame"
        inert={busy || undefined}
        style={{ visibility: ready ? 'visible' : 'hidden' }}
      >
        <div id={id} />
      </div>
      {busy && (
        <div className="native-saving-shield">
          <LoaderCircle size={24} className="spin" />
          <strong>Saving your latest changes�</strong>
          <span>Keep this window open until saving finishes.</span>
        </div>
      )}
      {busy && (
        <div className="native-saving-shield">
          <LoaderCircle size={24} className="spin" />
          <strong>Saving your latest changes…</strong>
          <span>Keep this window open until saving finishes.</span>
        </div>
      )}
      {history && (
        <aside className="native-history">
          <header>
            <h3>Version history</h3>
            <button
              className="icon-button"
              aria-label="Close version history"
              onClick={() => setHistory(null)}
            >
              <X size={18} />
            </button>
          </header>
          <p>Last 50 saved versions. Download a revision to keep a separate copy.</p>
          {history.map((h) => (
            <a href={`/api${base}/history/${h.revision}`} key={h.revision}>
              <span className="history-check">
                <Check size={15} />
              </span>
              <div>
                <strong>Version {h.revision}</strong>
                <small>
                  {h.name} · {new Date(h.created).toLocaleString()}
                </small>
              </div>
              <Download size={14} />
            </a>
          ))}
        </aside>
      )}
    </section>
  );
}
function FileGlyph() {
  return (
    <span className="native-glyph">
      ro<span>✦</span>
    </span>
  );
}
