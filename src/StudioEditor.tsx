import { useEffect, useRef, useState } from 'react';
import { save, type Item } from './api';

/** Bridge to our dependency-free editor. The authenticated API retains ownership and versions. */
export function StudioEditor({
  doc,
  theme,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  doc: Item;
  theme: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(doc);
  const callbacks = useRef({ onClose, onSaved, onDirtyChange });
  callbacks.current = { onClose, onSaved, onDirtyChange };
  const [error, setError] = useState('');
  useEffect(() => {
    let saving = false;
    const post = (data: Item) => frame.current?.contentWindow?.postMessage(data, location.origin);
    const listener = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'studio:ready')
        post({
          type: 'studio:init',
          document: {
            ...current.current.content,
            id: current.current.id,
            title: current.current.title,
          },
          theme,
        });
      if (message?.type === 'studio:dirty') callbacks.current.onDirtyChange(!!message.dirty);
      if (message?.type === 'studio:close') callbacks.current.onClose();
      if (message?.type === 'studio:error') setError(String(message.message));
      if (message?.type === 'studio:save') {
        if (saving) {
          post({
            type: 'studio:saved',
            token: message.token,
            error: 'A save is already in progress.',
          });
          return;
        }
        saving = true;
        try {
          if (!message.document || message.document.kind !== current.current.kind)
            throw Error('Invalid editor document.');
          if (JSON.stringify(message.document).length > 3500000)
            throw Error(
              'Workspace documents are limited to 3.5 MB. Export a JSON backup and reduce image sizes.',
            );
          const result = await save('documents', {
            ...current.current,
            title: message.document.title,
            content: message.document,
          });
          current.current = { ...current.current, ...result };
          post({ type: 'studio:saved', token: message.token });
          setError('');
          await callbacks.current.onSaved();
        } catch (e) {
          const error = (e as Error).message;
          post({ type: 'studio:saved', token: message.token, error });
          setError(error);
        } finally {
          saving = false;
        }
      }
      if (message?.type === 'studio:import')
        setError('Import files from the Studio home page, then save the imported copy separately.');
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'studio:theme', theme }, location.origin);
  }, [theme]);
  return (
    <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <iframe
        ref={frame}
        title="Reverse Studio document editor"
        src="/studio/index.html?embedded=1"
        style={{ width: '100%', flex: 1, minHeight: '650px', border: 0 }}
      />
    </section>
  );
}
