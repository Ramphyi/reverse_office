import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  X,
  ChevronDown,
  Plus,
  LoaderCircle,
  FileText,
  Table2,
  Presentation,
  StickyNote,
  File,
  Check,
  Search,
} from 'lucide-react';
import type { Item } from './api';
export const appIcons: Record<string, any> = {
  doc: FileText,
  sheet: Table2,
  slides: Presentation,
  note: StickyNote,
  pdf: File,
};
export function DocIcon({ kind = 'doc', large = false }: { kind?: string; large?: boolean }) {
  const Icon = appIcons[kind] || File;
  return (
    <span className={`doc-icon ${kind} ${large ? 'large' : ''}`}>
      <Icon size={large ? 25 : 18} />
    </span>
  );
}
export function Empty({
  title = 'Nothing here yet',
  description = 'Create something great. Your work will appear here.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Plus />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className={`badge ${String(children).toLowerCase().replaceAll(' ', '-')}`}>
      {children}
    </span>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: any;
  min?: number;
  max?: number;
  step?: string;
  help?: string;
};
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    ref.current?.querySelector<HTMLElement>('input,button')?.focus();
    return () => {
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function FormModal({
  title,
  description,
  fields,
  initial = {},
  onSubmit,
  onClose,
  submitLabel = 'Save changes',
}: {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Item;
  onSubmit: (data: Item) => Promise<void>;
  onClose: () => void;
  submitLabel?: string;
}) {
  const [data, setData] = useState<Item>(() =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          initial[f.key] ??
            f.default ??
            (f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : ''),
        ]),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSubmit({ ...initial, ...data });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-fields">
          {fields.map((f) => (
            <label key={f.key} className={f.type === 'checkbox' ? 'check-field' : ''}>
              <span>
                {f.label}
                {f.required && <em> *</em>}
              </span>
              {f.type === 'select' ? (
                <select
                  aria-label={f.label}
                  required={f.required}
                  value={data[f.key]}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'multiselect' ? (
                <div className="multi-options">
                  {f.options?.map((o) => (
                    <label key={o.value}>
                      <input
                        type="checkbox"
                        checked={data[f.key].includes(o.value)}
                        onChange={(e) =>
                          setData({
                            ...data,
                            [f.key]: e.target.checked
                              ? [...data[f.key], o.value]
                              : data[f.key].filter((x: string) => x !== o.value),
                          })
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea
                  aria-label={f.label}
                  rows={5}
                  required={f.required}
                  value={data[f.key]}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  aria-label={f.label}
                  type={f.type || 'text'}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  checked={f.type === 'checkbox' ? data[f.key] : undefined}
                  value={f.type === 'checkbox' ? undefined : data[f.key]}
                  onChange={(e) =>
                    setData({
                      ...data,
                      [f.key]:
                        f.type === 'checkbox'
                          ? e.target.checked
                          : f.type === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                />
              )}{' '}
              {f.help && <small>{f.help}</small>}
            </label>
          ))}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
