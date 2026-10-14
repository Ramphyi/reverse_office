// SPDX-License-Identifier: MIT
import { useRef, useState, useEffect } from 'react';
import { save, type Item, type User } from './api';
import { Modal } from './components';
// @ts-expect-error Original shared MIT sanitizer.
import { sanitizeHtml } from '../public/studio/formats.js';
// @ts-expect-error Original image resizing helper.
import { prepareImage } from '../public/studio/floating.js';
export function TeamSpace({
  pages,
  projects,
  user,
  onSaved,
}: {
  pages: Item[];
  projects: Item[];
  user: User;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const editor = useRef<HTMLDivElement>(null),
    image = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && editor.current) {
      if (editing.format === 'html') editor.current.innerHTML = sanitizeHtml(editing.content || '');
      else editor.current.textContent = editing.content || '';
    }
  }, [editing?.id, !!editing]);
  const format = (command: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(command, false, value);
  };
  return (
    <>
      <div className="section-bar">
        <h2>Team knowledge</h2>
        <button
          className="button primary"
          onClick={() => {
            setError('');
            setEditing({ title: '', content: '', projectId: '', category: 'Knowledge' });
          }}
        >
          New page
        </button>
      </div>
      <div className="knowledge-grid">
        {pages.map((p) => (
          <article className="knowledge-card" key={p.id}>
            <small>{p.category}</small>
            <h2>{p.title}</h2>
            {p.format === 'html' ? (
              <div
                className="team-rich"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.content) }}
              />
            ) : (
              <p>{p.content}</p>
            )}
            {(p.owner === user.id || ['admin', 'manager'].includes(user.role)) && (
              <button className="text-link" onClick={() => setEditing(p)}>
                Edit {p.title}
              </button>
            )}
          </article>
        ))}
      </div>
      {editing && (
        <Modal
          title={editing.id ? 'Edit page' : 'Publish to team space'}
          wide
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form
            className="team-compose"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await save('pages', {
                  ...editing,
                  format: 'html',
                  content: sanitizeHtml(editor.current?.innerHTML || ''),
                });
                await onSaved();
                setEditing(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Title
              <input
                required
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label>
              Project / sharing
              <select
                value={editing.projectId}
                onChange={(e) => setEditing({ ...editing, projectId: e.target.value })}
              >
                <option value="">Everyone in workspace</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              >
                {['Knowledge', 'Announcement', 'Policy'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <div className="rich-toolbar">
              {[
                ['Bold', 'bold'],
                ['Italic', 'italic'],
                ['Underline', 'underline'],
                ['Bullet list', 'insertUnorderedList'],
                ['Numbered list', 'insertOrderedList'],
              ].map(([name, command]) => (
                <button
                  type="button"
                  key={name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format(command)}
                >
                  {name}
                </button>
              ))}
              <button type="button" onClick={() => format('formatBlock', 'h2')}>
                Heading
              </button>
              <button type="button" onClick={() => image.current?.click()}>
                Insert image
              </button>
            </div>
            <div
              ref={editor}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Page content"
              className="team-editor team-rich"
              onPaste={(e) => {
                e.preventDefault();
                format('insertText', e.clipboardData.getData('text/plain'));
              }}
            />
            <input
              ref={image}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              aria-label="Page image"
              onChange={async (e) => {
                try {
                  if (e.target.files?.[0]) {
                    const img = await prepareImage(e.target.files[0]);
                    format('insertHTML', `<img src="${img.data}" alt="Page image">`);
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  if (image.current) image.current.value = '';
                }
              }}
            />
            {error && <p role="alert">{error}</p>}
            <footer>
              <button className="button primary" disabled={busy}>
                Publish page
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
