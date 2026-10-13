import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  ArrowLeft,
  Save,
  Download,
  Bold,
  Italic,
  List,
  Heading1,
  Heading2,
  Undo2,
  Redo2,
  Plus,
  Trash2,
  Play,
  Sparkles,
  Check,
  FileText,
  Table2,
  Presentation,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { api, save, type Item } from './api';
import { DocIcon, Modal } from './components';
// @ts-ignore Shared pure evaluator is also exercised by the server unit tests.
import { evaluateCell } from '../server/domain.js';

export function Editor({
  doc,
  onClose,
  onSaved,
  onAI,
  onDirtyChange,
}: {
  doc: Item;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAI: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(doc.title),
    [content, setContent] = useState(doc.content),
    [version, setVersion] = useState(doc.version),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [present, setPresent] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty]);
  const change = (value: Item) => {
    setContent(value);
    setDirty(true);
  };
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  const persist = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await save('documents', { ...doc, title, content, version });
      setVersion(result.version);
      setDirty(false);
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async (format: string) => {
    if (dirty && !(await persist())) return;
    window.location.href = `/api/documents/${doc.id}/export/${format}`;
  };
  return (
    <div className="editor-shell">
      <div className="editor-titlebar">
        <button
          className="icon-button"
          aria-label="Back to workspace"
          onClick={() => {
            if (!dirty || confirm('Discard unsaved changes?')) onClose();
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <DocIcon kind={doc.kind} />
        <input
          aria-label="Document title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
        <span className="save-status">
          {dirty ? (
            'Unsaved changes'
          ) : (
            <>
              <Check size={13} /> Saved
            </>
          )}
        </span>
        <div className="grow" />
        <button className="button secondary" onClick={onAI}>
          <Sparkles size={16} /> Assistant
        </button>
        <button className="button primary" onClick={persist} disabled={busy || !dirty}>
          <Save size={16} /> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="ribbon-tabs">
        <span className="active">Home</span>
        <span>
          {doc.kind === 'sheet' ? 'Formulas' : doc.kind === 'slides' ? 'Design' : 'Layout'}
        </span>
        <div className="grow" />
        {doc.kind === 'slides' && (
          <button onClick={() => setPresent(true)}>
            <Play size={14} /> Present
          </button>
        )}
        <label className="export-menu">
          <Download size={14} />
          <select
            aria-label="Export document"
            value=""
            onChange={(e) => exportFile(e.target.value)}
          >
            <option value="" disabled>
              Export
            </option>
            {(doc.kind === 'sheet'
              ? ['xlsx', 'csv', 'pdf', 'json']
              : doc.kind === 'slides'
                ? ['pptx', 'pdf', 'json']
                : ['docx', 'pdf', 'txt', 'json']
            ).map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {['doc', 'note'].includes(doc.kind) ? (
        <Writer initial={content} onChange={change} />
      ) : doc.kind === 'sheet' ? (
        <Sheet initial={content} onChange={change} />
      ) : (
        <Slides content={content} onChange={change} />
      )}
      <div className="editor-status">
        <span>{doc.kind === 'doc' ? 'Writer' : doc.kind === 'sheet' ? 'Sheets' : 'Slides'}</span>
        <span>
          Version {version} · {doc.projectId ? 'Shared with project members' : 'Private document'}
        </span>
        <span>100%</span>
      </div>
      {present && (
        <PresentationMode slides={content.slides ?? []} onClose={() => setPresent(false)} />
      )}
    </div>
  );
}
function Writer({ initial, onChange }: { initial: Item; onChange: (value: Item) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start with a thought. Make it something great.' }),
    ],
    content: initial as any,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  if (!editor) return null;
  const tools = [
    {
      label: 'Bold',
      Icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      Icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Heading 1',
      Icon: Heading1,
      active: editor.isActive('heading', { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      Icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bullet list',
      Icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    { label: 'Undo', Icon: Undo2, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', Icon: Redo2, run: () => editor.chain().focus().redo().run() },
  ];
  return (
    <>
      <div className="writer-toolbar">
        <span className="font-label">Aptos / System Sans</span>
        <span className="tool-divider" />
        {tools.map((t) => (
          <button
            key={t.label}
            title={t.label}
            aria-label={t.label}
            aria-pressed={t.active}
            className={`icon-button ${t.active ? 'active' : ''}`}
            onClick={t.run}
          >
            <t.Icon size={18} />
          </button>
        ))}
        <span className="tool-divider" />
        <span className="muted small">Select text to format</span>
      </div>
      <div className="writer-canvas">
        <div className="paper">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
function Sheet({ initial, onChange }: { initial: Item; onChange: (value: Item) => void }) {
  const [cells, setCells] = useState<Record<string, string>>(initial.cells ?? {}),
    [selected, setSelected] = useState('A1'),
    [rows, setRows] = useState(30);
  const columns = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
  const change = (key: string, value: string) => {
    const next = { ...cells, [key]: value };
    setCells(next);
    onChange({ cells: next });
  };
  return (
    <>
      <div className="formula-bar">
        <span className="cell-address">{selected}</span>
        <span className="fx">ƒx</span>
        <input
          aria-label="Formula bar"
          value={cells[selected] ?? ''}
          onChange={(e) => change(selected, e.target.value)}
          placeholder="Value or formula, e.g. =SUM(B2:B8)"
        />
      </div>
      <div className="sheet-scroll">
        <table className="spreadsheet">
          <thead>
            <tr>
              <th />
              <>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {columns.map((c) => {
                  const key = c + (r + 1);
                  return (
                    <td key={c} className={selected === key ? 'selected' : ''}>
                      <input
                        aria-label={`Cell ${key}`}
                        value={
                          selected === key ? (cells[key] ?? '') : String(evaluateCell(cells, key))
                        }
                        onFocus={() => setSelected(key)}
                        onChange={(e) => change(key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const next = document.querySelector<HTMLInputElement>(
                              `[aria-label="Cell ${c}${r + 2}"]`,
                            );
                            next?.focus();
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="button secondary" onClick={() => setRows(rows + 20)}>
          <Plus size={14} /> Add 20 rows
        </button>
      </div>
      <div className="sheet-tabs">
        <span>Sheet 1</span>
        <small>Arithmetic · SUM · AVERAGE · MIN · MAX · cell references</small>
      </div>
    </>
  );
}
function Slides({ content, onChange }: { content: Item; onChange: (value: Item) => void }) {
  const [index, setIndex] = useState(0),
    slides = content.slides ?? [],
    current = slides[index];
  const change = (key: string, value: string) =>
    onChange({
      slides: slides.map((s: Item, i: number) => (i === index ? { ...s, [key]: value } : s)),
    });
  return (
    <div className="slides-layout">
      <aside className="slide-list">
        {slides.map((s: Item, i: number) => (
          <button key={i} className={index === i ? 'selected' : ''} onClick={() => setIndex(i)}>
            <small>{i + 1}</small>
            <div className="mini-slide">
              <strong>{s.title}</strong>
              <span>{s.body}</span>
            </div>
          </button>
        ))}
        <button
          className="button secondary"
          onClick={() => {
            onChange({
              slides: [...slides, { title: 'Your next big idea', body: 'Tell your story.' }],
            });
            setIndex(slides.length);
          }}
        >
          <Plus size={16} /> New slide
        </button>
      </aside>
      <div className="slide-canvas">
        {current && (
          <>
            <div className="slide-page">
              <div className="slide-overline">REVERSE OFFICE / PRESENTATION</div>
              <textarea
                aria-label="Slide title"
                className="slide-title"
                value={current.title}
                onChange={(e) => change('title', e.target.value)}
              />
              <textarea
                aria-label="Slide body"
                className="slide-body"
                value={current.body}
                onChange={(e) => change('body', e.target.value)}
              />
              <div className="slide-number">
                {String(index + 1).padStart(2, '0')} <span>MAKE ROOM FOR BETTER WORK.</span>
              </div>
              <div className="slide-orbit" />
            </div>
            <button
              className="button text-button"
              disabled={slides.length < 2}
              onClick={() => {
                onChange({ slides: slides.filter((_: Item, i: number) => i !== index) });
                setIndex(Math.max(0, index - 1));
              }}
            >
              <Trash2 size={14} /> Delete slide
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function PresentationMode({ slides, onClose }: { slides: Item[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(slides.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <div className="presentation-mode">
      <button
        className="icon-button presentation-close"
        onClick={onClose}
        aria-label="Exit presentation"
      >
        <X />
      </button>
      <div className="slide-page">
        <div className="slide-overline">REVERSE OFFICE / PRESENTATION</div>
        <h1>{slides[i]?.title}</h1>
        <p>{slides[i]?.body}</p>
        <div className="slide-orbit" />
      </div>
      <footer>
        <button
          className="icon-button"
          onClick={() => setI(Math.max(0, i - 1))}
          aria-label="Previous slide"
        >
          <ChevronLeft />
        </button>
        {i + 1} / {slides.length}
        <button
          className="icon-button"
          onClick={() => setI(Math.min(slides.length - 1, i + 1))}
          aria-label="Next slide"
        >
          <ChevronRight />
        </button>
      </footer>
    </div>
  );
}
