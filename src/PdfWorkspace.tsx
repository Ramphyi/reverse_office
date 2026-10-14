// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { api, type Item } from './api';
export function PdfWorkspace({
  file,
  onClose,
  onSaved,
}: {
  file: Item;
  onClose: () => void;
  onSaved: (file: Item) => Promise<void>;
}) {
  const [info, setInfo] = useState<Item>({ pages: [], fields: [] }),
    [page, setPage] = useState(1),
    [action, setAction] = useState('text'),
    [text, setText] = useState(''),
    [field, setField] = useState(''),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [size, setSize] = useState(12),
    [color, setColor] = useState('#1d3930'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/files/' + file.id + '/pdf-info')
      .then((info) => {
        setInfo(info);
        setPage((page) => Math.min(page, info.pages.length));
      })
      .catch((e) => setError(e.message));
  }, [file.id]);
  return (
    <section className="independent-pdf">
      <header>
        <h2>{file.title}</h2>
        <button className="button secondary" onClick={onClose}>
          Back to review & sign
        </button>
      </header>
      <div>
        <iframe title="PDF editing preview" src={`/api/files/${file.id}/preview#page=${page}`} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await onSaved(
                await api('/files/' + file.id + '/pdf-edit', 'POST', {
                  page,
                  action,
                  text,
                  field,
                  x,
                  y,
                  size,
                  color,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>PDF tools</h3>
          <p>
            Save an edited copy. Text annotations add a new layer; they do not replace existing text
            or redact content.
          </p>
          <label>
            Page
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
              {info.pages.map((p: Item) => (
                <option key={p.page} value={p.page}>
                  Page {p.page} · {Math.round(p.width)} × {Math.round(p.height)} pt
                </option>
              ))}
            </select>
          </label>
          <label>
            Action
            <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="text">Add text annotation</option>
              <option value="rotate">Rotate page 90°</option>
              <option value="remove">Remove page</option>
              <option value="form">Fill existing form field</option>
            </select>
          </label>
          {action === 'form' && (
            <label>
              Form field
              <select value={field} onChange={(e) => setField(e.target.value)}>
                <option value="">Choose field</option>
                {info.fields.map((f: Item) => (
                  <option key={f.name} value={f.name}>
                    {f.name} · {f.type}
                  </option>
                ))}
              </select>
            </label>
          )}
          {['text', 'form'].includes(action) && (
            <label>
              {action === 'form' ? 'Value (checkbox: true / false)' : 'Annotation text'}
              <textarea required value={text} onChange={(e) => setText(e.target.value)} />
              <small>
                The built-in PDF font supports Western Latin characters; extended Unicode fonts are
                not yet supported.
              </small>
            </label>
          )}
          {action === 'text' && (
            <>
              {[
                ['From left (pt)', x, setX],
                ['From top (pt)', y, setY],
                ['Font size', size, setSize],
              ].map(([label, value, set]: any) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </label>
              ))}
              <label>
                Text color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="button primary" disabled={busy || !info.pages.length}>
            Save edited PDF copy
          </button>
        </form>
      </div>
    </section>
  );
}
