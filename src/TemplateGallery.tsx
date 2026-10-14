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
import { save, type Item } from './api';
// @ts-expect-error The standalone MIT editor is shared without a runtime package dependency.
import { newDocument } from '../public/studio/core.js';
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
    setTemplates([
      {
        id: 'doc-blank',
        kind: 'doc',
        name: 'Blank document',
        description: 'A clean page for your next idea.',
        tags: ['Writer', 'DOCX'],
        accent: '#386a56',
        template: 'blank',
      },
      {
        id: 'doc-report',
        kind: 'doc',
        name: 'Project report',
        description: 'Summary, progress table and next steps.',
        tags: ['Report', 'Tables'],
        accent: '#386a56',
        template: 'report',
      },
      {
        id: 'doc-letter',
        kind: 'doc',
        name: 'Business letter',
        description: 'A simple, editable business letter.',
        tags: ['Letter', 'DOCX'],
        accent: '#386a56',
        template: 'letter',
      },
      {
        id: 'sheet-blank',
        kind: 'sheet',
        name: 'Blank workbook',
        description: 'Cells, formulas, styles and charts.',
        tags: ['Sheets', 'XLSX'],
        accent: '#788641',
        template: 'blank',
      },
      {
        id: 'sheet-budget',
        kind: 'sheet',
        name: 'Project budget',
        description: 'Plan against actuals with a live comparison chart.',
        tags: ['Budget', 'Formulas'],
        accent: '#788641',
        template: 'budget',
      },
      {
        id: 'slides-blank',
        kind: 'slides',
        name: 'Blank presentation',
        description: 'Start your story with a title slide.',
        tags: ['Slides', 'PPTX'],
        accent: '#b27843',
        template: 'blank',
      },
      {
        id: 'slides-pitch',
        kind: 'slides',
        name: 'Project pitch',
        description: 'An idea, the opportunity, and your plan.',
        tags: ['Pitch', 'Themes'],
        accent: '#b27843',
        template: 'pitch',
      },
    ]);
  }, []);
  return (
    <Modal
      title="Start with something good."
      description="Independent Reverse Studio editors. Create, edit and export your work."
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
              const content = newDocument(kind, chosen.template);
              content.title = title;
              const d = await save('documents', { title, projectId, kind, content });
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
