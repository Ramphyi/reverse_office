import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ChartColumn,
  FileText,
  LayoutTemplate,
  Plus,
  Presentation,
  Table2,
  X,
} from 'lucide-react';
import { api, type Item } from './api';
import { Modal } from './components';
export function TemplateGallery({
  kind,
  projects,
  onClose,
  onCreate,
}: {
  kind: string;
  projects: Item[];
  onClose: () => void;
  onCreate: (doc: Item) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Item[]>([]),
    [chosen, setChosen] = useState<Item | null>(null),
    [title, setTitle] = useState(''),
    [projectId, setProject] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    api('/office/templates')
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Modal
      title="Start with something good."
      description="Native Office templates. Every page, cell and object is yours to edit."
      wide
      onClose={onClose}
    >
      {!chosen ? (
        <div className="template-gallery">
          {templates
            .filter((t) => t.kind === kind)
            .map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => {
                  setChosen(t);
                  setTitle(t.name);
                }}
              >
                <div
                  className={'template-preview ' + t.kind}
                  style={{ '--template-accent': t.accent } as any}
                >
                  <span>
                    {t.kind === 'doc' ? (
                      <FileText size={16} />
                    ) : t.kind === 'sheet' ? (
                      <Table2 size={16} />
                    ) : (
                      <Presentation size={16} />
                    )}
                  </span>
                  {t.id.endsWith('blank') ? (
                    <Plus className="template-plus" size={36} />
                  ) : t.kind === 'sheet' ? (
                    <>
                      <div className="template-grid" />
                      <ChartColumn className="template-chart" size={66} />
                    </>
                  ) : t.kind === 'slides' ? (
                    <>
                      <strong>{t.name}</strong>
                      <i />
                      <i />
                      <i />
                    </>
                  ) : (
                    <>
                      <b>{t.name}</b>
                      <i />
                      <i />
                      <i />
                      <i />
                      <div className="template-table" />
                    </>
                  )}
                </div>
                <div className="template-info">
                  <h3>
                    {t.name}
                    <ArrowUpRight size={15} />
                  </h3>
                  <p>{t.description}</p>
                  <div>
                    {t.tags.map((tag: string) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const d = await api('/office/create', 'POST', {
                templateId: chosen.id,
                title,
                projectId,
              });
              await onCreate(d);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="template-selection">
            <LayoutTemplate size={24} />
            <div>
              <strong>{chosen.name}</strong>
              <p>{chosen.description}</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Choose another template"
              onClick={() => setChosen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="form-fields">
            <label>
              Document name
              <input
                aria-label="Document name"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Sharing
              <select
                aria-label="Template sharing"
                value={projectId}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Private / personal</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={() => setChosen(null)}>
              Back to templates
            </button>
            <button className="button primary" disabled={busy}>
              Create & open <ArrowUpRight size={15} />
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Modal>
  );
}
