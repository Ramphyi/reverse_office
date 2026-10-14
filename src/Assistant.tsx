import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { api, type Item } from './api';
// @ts-expect-error Shared original MIT browser module.
import { bindFloating, prepareImage } from '../public/studio/floating.js';
const prompts: Record<string, string[]> = {
  doc: [
    'Create a clear outline for this document',
    'Rewrite this passage with a professional tone',
    'Suggest an executive summary',
  ],
  sheet: [
    'Explain a formula step by step',
    'Suggest charts for my data',
    'Help me build a budget model',
  ],
  slides: [
    'Create a compelling presentation outline',
    'Improve my opening slide',
    'Draft speaker notes for this presentation',
  ],
  workspace: ['Summarize my open tasks', 'Find budget', 'Help me draft a project update'],
};
export function Assistant({
  doc,
  onClose,
  open,
  userId,
  onOpenDocument,
}: {
  doc: Item | null;
  open: boolean;
  userId: string;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(''),
    [messages, setMessages] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [agent, setAgent] = useState('coordinator'),
    [catalog, setCatalog] = useState<Item>({ agents: [], tools: [] }),
    [images, setImages] = useState<Item[]>([]),
    [attachmentError, setAttachmentError] = useState(''),
    [mode, setMode] = useState('Ask'),
    [tone, setTone] = useState('Professional'),
    [language, setLanguage] = useState('English'),
    [context, setContext] = useState(''),
    [showContext, setShowContext] = useState(false),
    [copied, setCopied] = useState(-1),
    [service, setService] = useState<Item>({});
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null),
    handle = useRef<HTMLElement>(null),
    resize = useRef<HTMLButtonElement>(null);
  const controls = useRef<any>(null);
  const upload = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  useEffect(() => {
    controls.current = bindFloating(
      panel.current,
      handle.current,
      resize.current,
      'reverse-ai-window-' + userId,
    );
    return () => controls.current?.destroy();
  }, [userId]);
  useEffect(() => {
    if (open)
      panel.current
        ?.querySelector<HTMLTextAreaElement>('[aria-label="Message to assistant"]')
        ?.focus();
  }, [open]);
  async function attach(files: File[]) {
    setAttachmentError('');
    try {
      if (files.length + images.length > 3) throw Error('Attach at most three images.');
      const prepared: Item[] = await Promise.all(files.map((file) => prepareImage(file)));
      setImages((current) => [...current, ...prepared].slice(0, 3));
    } catch (error) {
      setAttachmentError((error as Error).message);
    }
  }
  useEffect(() => {
    if (!open) return;
    api('/ai/agents')
      .then(setCatalog)
      .catch(() => {});
    api('/integrations')
      .then(setService)
      .catch(() => {});
  }, [open]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  async function send(text = prompt) {
    if (!text.trim() || busy) return;
    setPrompt('');
    setMessages((m) => [...m, { role: 'user', text, images }]);
    setBusy(true);
    try {
      const result = await api('/ai', 'POST', {
        prompt: text.slice(0, 8000),
        documentId: doc?.id,
        mode,
        agent,
        images,
        tone,
        language,
        selectedText: context,
        history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 16000) })),
      });
      setMessages((m) => [...m, { role: 'assistant', ...result }]);
      setImages([]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(-1), 1800);
    } catch {
      setCopied(-1);
    }
  }
  const suggestions = prompts[doc?.kind ?? 'workspace'] ?? prompts.workspace;
  return (
    <aside
      ref={panel}
      hidden={!open}
      className="assistant-panel assistant-studio floating-assistant"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        attach(Array.from(e.dataTransfer.files));
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          attach(files);
        }
      }}
      aria-label="AI assistant"
    >
      <header
        ref={handle}
        tabIndex={0}
        aria-label="Move assistant. Use arrow keys; Home resets position."
        className="assistant-drag-handle"
      >
        <div className="assistant-logo">
          <Sparkles size={20} />
        </div>
        <div className="assistant-brand">
          <strong>
            Ask AI<span>WORKSPACE COPILOT</span>
          </strong>
          <small>
            <i className={service.ai ? 'online-dot' : 'search-dot'} />
            {service.ai ? 'AI connected' : 'Workspace search mode'}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="New AI conversation"
          disabled={busy}
          onClick={() => setMessages([])}
        >
          <MessageSquarePlus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Expand assistant"
          onClick={() => controls.current?.reset()}
        >
          <Maximize2 size={17} />
        </button>
        <button className="icon-button" onClick={onClose} aria-label="Close assistant">
          <X size={18} />
        </button>
      </header>
      <div className="assistant-context-strip">
        <span>
          <FileText size={13} />
          {doc ? doc.title : 'Your workspace'}
        </span>
        <button aria-expanded={showContext} onClick={() => setShowContext(!showContext)}>
          Add context <ChevronDown size={13} />
        </button>
      </div>
      {showContext && (
        <div className="assistant-context-input">
          <label>
            Selected text or data
            <textarea
              aria-label="AI additional context"
              maxLength={12000}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Paste a paragraph, formula, table or slide notes…"
            />
          </label>
          <small>This context is included with your next messages.</small>
        </div>
      )}
      <div className="agent-selector">
        <label>
          Agent{' '}
          <select aria-label="AI agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
            {(catalog.agents || []).map((a: Item) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>{catalog.tools?.length || 0} tools</summary>
          {catalog.tools?.map((t: Item) => (
            <p key={t.name}>
              <strong>{t.name}</strong> · {t.description}
            </p>
          ))}
        </details>
      </div>
      <div className="assistant-modes">
        {[
          ['Ask', Sparkles],
          ['Draft', WandSparkles],
          ['Analyze', Search],
          ['Explain', Lightbulb],
        ].map(([label, Icon]: any) => (
          <button
            key={label}
            className={mode === label ? 'active' : ''}
            onClick={() => setMode(label)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      <div className="assistant-messages" ref={scroll} aria-live="polite">
        {!messages.length && (
          <div className="assistant-welcome">
            <div className="assistant-orb">
              <Sparkles size={31} />
              <i />
              <i />
            </div>
            <span className="eyebrow">A LITTLE MOMENTUM</span>
            <h2>
              Good ideas
              <br />
              <em>start here.</em>
            </h2>
            <p>
              {doc
                ? 'A second pair of eyes for your next draft, formula or big idea.'
                : 'Turn your workspace into a starting point. Find answers, shape a draft, move work forward.'}
            </p>
            <div className="ai-suggestions">
              {suggestions.map((s, i) => (
                <button key={s} onClick={() => send(s)}>
                  <span>{['✦', '↗', '≡'][i]}</span>
                  <strong>{s}</strong>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            {!service.ai && (
              <div className="ai-provider-note">
                <Search size={15} />
                <span>
                  Search is available now. Configure an AI provider in your server settings to
                  generate and analyze content.
                </span>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div className={`ai-message ${m.role} ${m.error ? 'failed' : ''}`} key={i}>
            <div className="ai-message-label">
              {m.role === 'assistant' ? (
                <Sparkles size={13} />
              ) : (
                <span className="user-message-dot" />
              )}
              <strong>{m.role === 'user' ? 'You' : m.provider || 'Assistant'}</strong>
            </div>
            {m.images?.length > 0 && (
              <div className="ai-attachments">
                {m.images.map((image: Item, j: number) => (
                  <img key={j} src={image.data} alt={image.name} />
                ))}
              </div>
            )}
            {m.trace?.length > 0 && (
              <details className="ai-tool-trace" open>
                <summary>
                  {m.trace.length} tool steps · {m.agent}
                </summary>
                {m.trace.map((step: Item, j: number) => (
                  <div key={j}>
                    <span>{step.status === 'complete' ? '✓' : '!'}</span>{' '}
                    <strong>{step.tool}</strong>
                    <small>{step.summary}</small>
                  </div>
                ))}
              </details>
            )}
            <div className="ai-markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
            </div>
            {m.sources?.length > 0 && (
              <details className="ai-citations">
                <summary>
                  {m.sources.length} workspace reference{m.sources.length > 1 ? 's' : ''}
                </summary>
                {m.sources.map((s: Item) => (
                  <button key={s.id + (s.location || '')} onClick={() => onOpenDocument(s.id)}>
                    <FileText size={12} />
                    {s.title}
                    {s.location ? ' · ' + s.location : ''}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </details>
            )}
            {m.role === 'assistant' && !m.error && (
              <button className="copy-button" onClick={() => copy(m.text, i)}>
                {copied === i ? <Check size={13} /> : <Copy size={13} />}{' '}
                {copied === i ? 'Copied' : 'Copy draft'}
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="assistant-thinking">
            <span />
            <span />
            <span />
            <small>Working with your context…</small>
          </div>
        )}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="ai-attachments">
          {images.map((image, index) => (
            <div key={index}>
              <img src={image.data} alt={image.name} />
              <button
                type="button"
                aria-label={'Remove image ' + (index + 1)}
                onClick={() => setImages(images.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {attachmentError && <p role="alert">{attachmentError}</p>}
        <input
          ref={upload}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp"
          aria-label="Attach images"
          onChange={(e) => {
            attach(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <input
          ref={camera}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          aria-label="Take photo"
          onChange={(e) => {
            attach(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <div className="attachment-actions">
          <button type="button" onClick={() => upload.current?.click()}>
            ＋ Image
          </button>
          <button type="button" onClick={() => camera.current?.click()}>
            Camera
          </button>
          <small>Drop or paste · up to 3</small>
        </div>
        <div className="ai-compose-options">
          <select
            aria-label="AI response tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            {['Professional', 'Concise', 'Creative', 'Friendly'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="AI response language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option>English</option>
            <option>Romanian</option>
          </select>
          {context && <span className="ai-context-count">Context added</span>}
        </div>
        <textarea
          aria-label="Message to assistant"
          placeholder={mode === 'Draft' ? 'What would you like to write?' : 'Ask about your work…'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div>
          <span>
            <LockKeyhole size={12} />
            Your permissions apply
          </span>
          <button disabled={busy || !prompt.trim()} aria-label="Send to assistant">
            {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
          </button>
        </div>
      </form>
      <p className="assistant-disclaimer">
        AI drafts need your review. Shift + Enter for a new line.
      </p>
      <button
        type="button"
        ref={resize}
        className="assistant-resize"
        aria-label="Resize assistant. Use arrow keys."
        title="Drag to resize"
      >
        ◢
      </button>
    </aside>
  );
}
