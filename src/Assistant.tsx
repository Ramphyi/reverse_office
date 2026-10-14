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
  onOpenDocument,
}: {
  doc: Item | null;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(''),
    [messages, setMessages] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [wide, setWide] = useState(false),
    [mode, setMode] = useState('Ask'),
    [tone, setTone] = useState('Professional'),
    [language, setLanguage] = useState('English'),
    [context, setContext] = useState(''),
    [showContext, setShowContext] = useState(false),
    [copied, setCopied] = useState(-1),
    [service, setService] = useState<Item>({});
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api('/integrations')
      .then(setService)
      .catch(() => {});
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  async function send(text = prompt) {
    if (!text.trim() || busy) return;
    setPrompt('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const result = await api('/ai', 'POST', {
        prompt: text.slice(0, 8000),
        documentId: doc?.id,
        mode,
        tone,
        language,
        selectedText: context,
        history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 16000) })),
      });
      setMessages((m) => [...m, { role: 'assistant', ...result }]);
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
      className={`assistant-panel assistant-studio ${wide ? 'wide' : ''}`}
      aria-label="AI assistant"
    >
      <header>
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
          aria-label={wide ? 'Narrow assistant' : 'Expand assistant'}
          onClick={() => setWide(!wide)}
        >
          {wide ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
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
            <div className="ai-markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
            </div>
            {m.sources?.length > 0 && (
              <details className="ai-citations">
                <summary>
                  {m.sources.length} workspace reference{m.sources.length > 1 ? 's' : ''}
                </summary>
                {m.sources.map((s: Item) => (
                  <button key={s.id} onClick={() => onOpenDocument(s.id)}>
                    <FileText size={12} />
                    {s.title}
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
    </aside>
  );
}
