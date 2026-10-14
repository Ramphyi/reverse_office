import { Account } from './Account';
import { useEffect, useRef, useState } from 'react';
import {
  Home,
  FolderOpen,
  FileText,
  Table2,
  Presentation,
  PenTool,
  MessagesSquare,
  Mail,
  CalendarDays,
  LayoutGrid,
  Clock3,
  Users,
  ShieldCheck,
  Sparkles,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Settings2,
  Bell,
  LogOut,
  Upload,
  Folder,
  Download,
  Trash2,
  Check,
  CheckCheck,
  X,
  Menu,
  Globe,
  Activity,
  Send,
  LoaderCircle,
  Command,
  Video,
  BriefcaseBusiness,
  BookOpen,
  Copy,
  LockKeyhole,
  Link,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import {
  api,
  save,
  setCsrf,
  initials,
  niceDate,
  isoToday,
  currency,
  downloadCsv,
  type Item,
  type State,
  type User,
} from './api';
import {
  Badge,
  DocIcon,
  Empty,
  FormModal,
  Modal,
  SearchBox,
  Select,
  type Field,
} from './components';
import { Editor } from './Editors';
import { NativeEditor } from './NativeEditor';
import { TemplateGallery } from './TemplateGallery';
import { ThemePicker, useTheme } from './Theme';
import { Assistant } from './Assistant';
import { Chat, Meetings } from './Collaboration';
import { Admin, TimeOff, Reports, Timesheets } from './Operations';
import { Romania } from './Romania';

type ModalConfig = {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Item;
  submitLabel?: string;
  submit: (data: Item) => Promise<void>;
};
const sections = [
  {
    label: 'WORKSPACE',
    items: [
      ['home', 'Overview', Home],
      ['drive', 'My Drive', FolderOpen],
      ['hub', 'Team space', Globe],
    ],
  },
  {
    label: 'CREATE',
    items: [
      ['doc', 'Writer', FileText],
      ['sheet', 'Sheets', Table2],
      ['slides', 'Slides', Presentation],
      ['pdf', 'PDF & Sign', PenTool],
    ],
  },
  {
    label: 'COLLABORATE',
    items: [
      ['chat', 'Connect', MessagesSquare],
      ['mail', 'Mail', Mail],
      ['calendar', 'Calendar', CalendarDays],
      ['projects', 'Projects', LayoutGrid],
    ],
  },
  {
    label: 'MANAGE',
    items: [
      ['timesheets', 'Timesheets', Clock3],
      ['leave', 'Time off', CalendarDays],
      ['reports', 'Reports', Activity],
      ['billing', 'Billing · RO', BriefcaseBusiness],
      ['admin', 'Administration', ShieldCheck],
      ['account', 'My account', Users],
    ],
  },
];
const names: Record<string, string> = Object.fromEntries(
  sections.flatMap((s) => s.items.map(([id, name]) => [id, name])),
);
const subtitles: Record<string, string> = {
  drive: 'A home for everything you’re working on.',
  doc: 'Turn your next idea into a great document.',
  sheet: 'Make sense of the numbers. Find your next insight.',
  slides: 'Ideas that deserve to be seen.',
  pdf: 'Review, acknowledge and sign with confidence.',
  hub: 'Your team’s knowledge, in one shared space.',
  projects: 'Bring people, priorities and progress together.',
  timesheets: 'Make every hour count.',
  leave: 'A little time away. Everything in balance.',
  reports: 'From approved work to client-ready reports.',
  billing: 'Invoices, payments and your connection to ANAF.',
  admin: 'Your people. Your workspace. Your control.',
  mail: 'Keep the conversation moving.',
  calendar: 'Make time for what matters.',
  chat: 'Good things happen when we connect.',
};
export default function App() {
  const { theme, choice, setChoice } = useTheme();
  const [templateKind, setTemplateKind] = useState<string | null>(null);
  const [pdfEditing, setPdfEditing] = useState<Item | null>(null);
  const [auth, setAuth] = useState<{ user: User; csrf: string } | null>(null),
    [loading, setLoading] = useState(true),
    [setup, setSetup] = useState(false),
    [state, setState] = useState<State>({}),
    [users, setUsers] = useState<User[]>([]),
    [page, setPage] = useState('home'),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState<ModalConfig | null>(null),
    [doc, setDoc] = useState<Item | null>(null),
    [ai, setAi] = useState(false),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [integrations, setIntegrations] = useState<Item>({}),
    [organisation, setOrganisation] = useState<Item>({}),
    [selectedPdf, setSelectedPdf] = useState<Item | null>(null),
    [folder, setFolder] = useState(''),
    [projectFilter, setProjectFilter] = useState(''),
    [mail, setMail] = useState<Item[]>([]),
    [selectedMail, setSelectedMail] = useState<Item | null>(null);
  const [docDirty, setDocDirty] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = async () => {
    const [data, people, services, org] = await Promise.all([
      api('/state'),
      api('/users'),
      api('/integrations'),
      api('/organisation'),
    ]);
    setState(data);
    setUsers(people);
    setIntegrations(services);
    setOrganisation(org);
  };
  useEffect(() => {
    Promise.all([api('/setup'), api('/me').catch(() => null)])
      .then(([s, a]) => {
        setSetup(s.required);
        if (a) {
          setCsrf(a.csrf);
          setAuth(a);
        }
      })
      .catch((e) => notify(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (auth && !auth.user.mustChangePassword) refresh().catch((e) => notify(e.message));
  }, [auth]);
  useEffect(() => {
    if (page === 'mail' && auth && !auth.user.mustChangePassword)
      api('/mail')
        .then(setMail)
        .catch((e) => notify(e.message));
  }, [page, auth]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search your workspace"]')?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setAi((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          r<span>o</span>
        </div>
        <LoaderCircle className="spin" />
      </div>
    );
  if (!auth)
    return (
      <Login
        setup={setup}
        onLogin={(a) => {
          setCsrf(a.csrf);
          setAuth(a);
          setSetup(false);
        }}
      />
    );
  const user = auth.user,
    isManager = ['admin', 'manager'].includes(user.role),
    projects = state.projects ?? [],
    documents = state.documents ?? [],
    tasks = state.tasks ?? [];
  const accountChanged = (a: Item) => {
    setCsrf(a.csrf);
    setAuth(a as { user: User; csrf: string });
  };
  if (user.mustChangePassword)
    return (
      <main className="forced-account">
        <Account user={user} onChanged={accountChanged} onLogout={() => setAuth(null)} />
      </main>
    );
  const navigate = (id: string) => {
    if (
      (doc || pdfEditing) &&
      docDirty &&
      !confirm('Leave this editor? Use Save first to confirm your latest changes are stored.')
    )
      return;
    setPdfEditing(null);
    if (doc) {
      setDoc(null);
    }
    setDocDirty(false);
    setPage(id);
    setQuery('');
    setMobile(false);
    setFolder('');
  };
  const projectOptions = [
    { value: '', label: 'Private / personal' },
    ...projects.map((p) => ({ value: p.id, label: p.title })),
  ];
  const projectField: Field = {
    key: 'projectId',
    label: 'Project / sharing',
    type: 'select',
    options:
      page === 'hub'
        ? projectOptions.map((p) => (p.value ? p : { value: '', label: 'Everyone in workspace' }))
        : projectOptions,
    default: projectFilter || '',
  };
  const userOptions = users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }));
  const mutate = async (kind: string, data: Item) => {
    await save(kind, data);
    await refresh();
    notify('Saved to your workspace');
  };
  const createDocument = (kind: string) => {
    if (integrations.office && ['doc', 'sheet', 'slides'].includes(kind)) {
      setTemplateKind(kind);
      return;
    }
    setModal({
      title: `New ${kind === 'doc' ? 'document' : kind === 'sheet' ? 'spreadsheet' : kind === 'slides' ? 'presentation' : 'note'}`,
      fields: [{ key: 'title', label: 'Name', required: true }, projectField],
      submitLabel: 'Create & open',
      submit: async (data) => {
        const item = await save('documents', {
          ...data,
          kind,
          folderId: folder,
          content:
            kind === 'sheet'
              ? { cells: { A1: 'Your first spreadsheet' } }
              : kind === 'slides'
                ? { slides: [{ title: 'Your next big idea', body: 'A story worth sharing.' }] }
                : { type: 'doc', content: [{ type: 'paragraph' }] },
        });
        await refresh();
        setDoc(item);
      },
    });
  };
  const newTask = (initial?: Item) =>
    setModal({
      title: initial ? 'Edit task' : 'Create a task',
      initial,
      fields: [
        { key: 'title', label: 'Task name', required: true },
        projectField,
        { key: 'description', label: 'Description', type: 'textarea' },
        {
          key: 'assignee',
          label: 'Assign to',
          type: 'select',
          options: [{ value: '', label: 'Unassigned' }, ...userOptions],
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['Backlog', 'In progress', 'In review', 'Done'].map((v) => ({
            value: v,
            label: v,
          })),
          default: 'Backlog',
        },
        {
          key: 'priority',
          label: 'Priority',
          type: 'select',
          options: ['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v })),
          default: 'Medium',
        },
        { key: 'due', label: 'Due date', type: 'date' },
      ],
      submit: async (data) => {
        if (!data.due) delete data.due;
        await mutate('tasks', data);
      },
    });
  const newProject = (initial?: Item) =>
    setModal({
      title: initial ? 'Edit project' : 'Create a project',
      initial,
      fields: [
        { key: 'title', label: 'Project name', required: true },
        { key: 'client', label: 'Client name', required: true },
        { key: 'po', label: 'Purchase order (PO)' },
        {
          key: 'rate',
          label: 'Client hourly rate',
          type: 'number',
          min: 0,
          step: '.01',
          required: true,
          default: 0,
        },
        {
          key: 'currency',
          label: 'Currency',
          type: 'select',
          options: ['EUR', 'RON', 'USD'].map((v) => ({ value: v, label: v })),
          default: 'EUR',
        },
        { key: 'budgetHours', label: 'Budget in hours', type: 'number', min: 0, default: 0 },
        { key: 'calendarId', label: 'Calendar identifier', default: 'default', required: true },
        {
          key: 'members',
          label: 'Project members',
          type: 'multiselect',
          options: userOptions,
          default: [user.id],
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['Active', 'On hold', 'Completed'].map((v) => ({ value: v, label: v })),
          default: 'Active',
        },
      ],
      submit: (data) => mutate('projects', data),
    });
  const newEvent = () =>
    setModal({
      title: 'Schedule a meeting',
      fields: [
        { key: 'title', label: 'Meeting title', required: true },
        { key: 'start', label: 'Starts', type: 'datetime-local', required: true },
        { key: 'end', label: 'Ends', type: 'datetime-local', required: true },
        projectField,
        {
          key: 'attendees',
          label: 'Invite people',
          type: 'multiselect',
          options: userOptions,
          default: [user.id],
        },
        { key: 'description', label: 'Agenda', type: 'textarea' },
      ],
      submit: (data) =>
        mutate('events', {
          ...data,
          start: new Date(data.start).toISOString(),
          end: new Date(data.end).toISOString(),
        }),
    });
  const remove = async (kind: string, item: Item) => {
    if (!confirm(`Delete “${item.title ?? item.description ?? 'this item'}”?`)) return;
    try {
      await api(`/entities/${kind}/${item.id}`, 'DELETE');
      await refresh();
      notify('Item deleted');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const filtered = (items: Item[]) =>
    items.filter(
      (x) =>
        (x.title ?? '').toLowerCase().includes(query.toLowerCase()) &&
        (!projectFilter || x.projectId === projectFilter),
    );
  const openDoc = (d: Item) => {
    if (
      (doc || pdfEditing) &&
      docDirty &&
      !confirm('Leave this editor? Save first to keep your latest changes.')
    )
      return;
    setDocDirty(false);
    setPdfEditing(null);
    setDoc(d);
    setQuery('');
  };
  const uploadFile = async (file: File, importing = false) => {
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('projectId', projectFilter);
      form.append('folderId', folder);
      const result = await api(importing ? '/documents/import' : '/files', 'POST', form);
      await refresh();
      notify(importing ? 'Document imported' : 'File uploaded');
      if (importing) setDoc(result);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const compose = () =>
    setModal({
      title: 'New message',
      description:
        'Internal mail is available immediately. External delivery uses your configured SMTP server.',
      fields: [
        { key: 'to', label: 'To', type: 'email', required: true },
        { key: 'subject', label: 'Subject', required: true },
        { key: 'body', label: 'Message', type: 'textarea', required: true },
      ],
      submitLabel: 'Send message',
      submit: async (data) => {
        await api('/mail', 'POST', data);
        setMail(await api('/mail'));
        notify('Message sent');
      },
    });
  return (
    <div className={`app ${ai ? 'assistant-open' : ''}`}>
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
        >
          <div className="brand-mark">
            r<span>o</span>
            <i />
          </div>
          <div>
            reverse<span>office</span>
          </div>
        </a>
        <div className="workspace-switch">
          <span className="workspace-monogram">W</span>
          <div>
            <strong>{organisation.name || 'My workspace'}</strong>
            <small>{organisation.timezone || 'Private workspace'}</small>
          </div>
          <LockKeyhole size={13} />
        </div>
        <nav>
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-label">{section.label}</div>
              {section.items
                .filter(
                  ([id]) => !['reports', 'admin', 'billing'].includes(String(id)) || isManager,
                )
                .map(([id, label, Icon]: any) => (
                  <button
                    key={id}
                    aria-label={label}
                    onClick={() => navigate(id)}
                    className={page === id ? 'active' : ''}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    {id === 'chat' && <span className="nav-dot" />}
                    {id === 'timesheets' && <span className="nav-shortcut">⌘</span>}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <button className="sidebar-ai" onClick={() => setAi(true)}>
          <span>
            <Sparkles size={18} />
          </span>
          <div>
            <strong>A little help. A big difference.</strong>
            <small>
              Meet your workspace assistant <ArrowUpRight size={12} />
            </small>
          </div>
        </button>
        <div className="sidebar-user">
          <span className="avatar">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === 'admin' ? 'Workspace administrator' : user.role}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              await api('/logout', 'POST');
              setAuth(null);
              setDoc(null);
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{names[page]}</strong>
          </div>
          <div className="grow" />
          <div className="global-search">
            <Search size={16} />
            <input
              aria-label="Search your workspace"
              placeholder="Search your workspace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </div>
          <span className="top-divider" />
          <button
            className="icon-button"
            aria-label="Open calendar"
            onClick={() => navigate('calendar')}
          >
            <CalendarDays size={19} />
          </button>
          <ThemePicker value={choice} onChange={setChoice} />
          <button className={`assistant-trigger ${ai ? 'active' : ''}`} onClick={() => setAi(!ai)}>
            <Sparkles size={17} /> Ask AI
          </button>
          <span className="avatar small">{initials(user.name)}</span>
        </header>
        {pdfEditing ? (
          <NativeEditor
            key={pdfEditing.id}
            doc={pdfEditing}
            collection="files"
            theme={theme}
            onClose={() => {
              setPdfEditing(null);
              setSelectedPdf(pdfEditing);
            }}
            onSaved={refresh}
            onDirtyChange={setDocDirty}
            onAI={() => setAi(true)}
          />
        ) : doc && (integrations.office || doc.office) ? (
          <NativeEditor
            key={doc.id}
            doc={doc}
            theme={theme}
            onClose={() => setDoc(null)}
            onSaved={refresh}
            onDirtyChange={setDocDirty}
            onAI={() => setAi(true)}
          />
        ) : doc ? (
          <Editor
            key={doc.id}
            doc={doc}
            onClose={() => setDoc(null)}
            onSaved={refresh}
            onDirtyChange={setDocDirty}
            onAI={() => setAi(true)}
          />
        ) : (
          <main className="content">
            {query && page === 'home' ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">YOUR WORKSPACE</div>
                    <h1>Search results</h1>
                    <p>Documents and tasks matching “{query}”</p>
                  </div>
                </div>
                <DocumentTable docs={filtered(documents)} users={users} open={openDoc} />
                <div className="panel task-search">
                  {filtered(tasks).map((t) => (
                    <button key={t.id} onClick={() => newTask(t)}>
                      <span>{t.title}</span>
                      <Badge>{t.status}</Badge>
                    </button>
                  ))}
                </div>
              </>
            ) : page === 'home' ? (
              <Dashboard
                user={user}
                state={state}
                users={users}
                onCreate={createDocument}
                navigate={navigate}
                openDoc={openDoc}
                newTask={() => newTask()}
                newEvent={newEvent}
                onAI={() => setAi(true)}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {['doc', 'sheet', 'slides', 'pdf'].includes(page)
                        ? 'ROOM FOR YOUR NEXT BIG IDEA'
                        : 'YOUR CONNECTED WORKSPACE'}
                    </div>
                    <h1>{names[page]}</h1>
                    <p>{subtitles[page]}</p>
                  </div>
                  <div className="heading-actions">
                    {['doc', 'sheet', 'slides'].includes(page) ? (
                      <>
                        <button
                          className="button secondary"
                          onClick={() => importRef.current?.click()}
                        >
                          <Upload size={16} /> Import
                        </button>
                        <button className="button primary" onClick={() => createDocument(page)}>
                          <Plus size={17} /> Create new
                        </button>
                      </>
                    ) : page === 'drive' ? (
                      <>
                        <button
                          className="button secondary"
                          onClick={() =>
                            setModal({
                              title: 'New folder',
                              fields: [
                                { key: 'title', label: 'Folder name', required: true },
                                projectField,
                              ],
                              submit: (data) => mutate('folders', { ...data, parentId: folder }),
                            })
                          }
                        >
                          <Folder size={16} /> New folder
                        </button>
                        <button
                          className="button primary"
                          onClick={() => uploadRef.current?.click()}
                        >
                          <Upload size={16} /> Upload files
                        </button>
                      </>
                    ) : page === 'pdf' ? (
                      <button className="button primary" onClick={() => uploadRef.current?.click()}>
                        <Upload size={16} /> Upload PDF
                      </button>
                    ) : page === 'projects' ? (
                      <>
                        <button className="button secondary" onClick={() => newTask()}>
                          <Plus size={16} /> New task
                        </button>
                        {isManager && (
                          <button className="button primary" onClick={() => newProject()}>
                            <Plus size={16} /> New project
                          </button>
                        )}
                      </>
                    ) : page === 'calendar' ? (
                      <button className="button primary" onClick={newEvent}>
                        <Plus size={16} /> Schedule meeting
                      </button>
                    ) : page === 'mail' ? (
                      <button className="button primary" onClick={compose}>
                        <Plus size={16} /> Compose
                      </button>
                    ) : null}
                  </div>
                </div>
                {['doc', 'sheet', 'slides'].includes(page) && (
                  <>
                    <div className="template-row">
                      <button
                        className={`blank-template ${page}`}
                        onClick={() => createDocument(page)}
                      >
                        <Plus size={24} />
                        <div>
                          <strong>
                            Start from a blank{' '}
                            {page === 'doc'
                              ? 'document'
                              : page === 'sheet'
                                ? 'spreadsheet'
                                : 'presentation'}
                          </strong>
                          <span>
                            A fresh space for your ideas <ArrowUpRight size={13} />
                          </span>
                        </div>
                      </button>
                      <div className="format-note">
                        <span className="tiny-eyebrow">OPEN FORMATS. YOUR FILES.</span>
                        <strong>
                          {page === 'doc'
                            ? 'Write freely. Share anywhere.'
                            : page === 'sheet'
                              ? 'Clear numbers. Better decisions.'
                              : 'From first thought to final slide.'}
                        </strong>
                        <p>
                          {page === 'doc'
                            ? 'Export as DOCX, PDF or plain text.'
                            : page === 'sheet'
                              ? 'Formulas, cell references, XLSX and CSV export.'
                              : 'Edit, present and export to PowerPoint.'}
                        </p>
                      </div>
                    </div>
                    <div className="section-bar">
                      <h2>
                        Your {names[page].toLowerCase()} files{' '}
                        <span className="count">
                          {documents.filter((d) => d.kind === page).length}
                        </span>
                      </h2>
                      <Select
                        value={projectFilter}
                        onChange={setProjectFilter}
                        label="Filter by project"
                        options={[
                          { value: '', label: 'All projects' },
                          ...projects.map((p) => ({ value: p.id, label: p.title })),
                        ]}
                      />
                    </div>
                    <DocumentTable
                      docs={filtered(documents.filter((d) => d.kind === page))}
                      users={users}
                      open={openDoc}
                      remove={(d) => remove('documents', d)}
                    />
                  </>
                )}
                {page === 'drive' && (
                  <>
                    <div className="section-bar">
                      <div className="drive-breadcrumb">
                        <button onClick={() => setFolder('')}>All files</button>
                        {folder && (
                          <>
                            <ChevronRight size={14} />
                            <strong>{state.folders?.find((f) => f.id === folder)?.title}</strong>
                          </>
                        )}
                      </div>
                      <Select
                        label="Project filter"
                        value={projectFilter}
                        onChange={(v) => {
                          setProjectFilter(v);
                          setFolder('');
                        }}
                        options={[
                          { value: '', label: 'All accessible files' },
                          ...projects.map((p) => ({ value: p.id, label: p.title })),
                        ]}
                      />
                    </div>
                    <div className="folder-grid">
                      {filtered(state.folders ?? [])
                        .filter((f) => f.parentId === folder)
                        .map((f) => (
                          <div className="folder-card" key={f.id}>
                            <button
                              onClick={() => {
                                setFolder(f.id);
                                setProjectFilter(f.projectId);
                              }}
                            >
                              <Folder size={30} />
                              <strong>{f.title}</strong>
                              <small>
                                {f.projectId ? 'Shared project folder' : 'Personal folder'}
                              </small>
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Delete ${f.title}`}
                              onClick={() => remove('folders', f)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                    <DocumentTable
                      docs={filtered([
                        ...documents.filter((d) => d.folderId === folder),
                        ...(state.files ?? [])
                          .filter((f) => f.folderId === folder)
                          .map((f) => ({
                            ...f,
                            kind: f.mime === 'application/pdf' ? 'pdf' : 'file',
                            isFile: true,
                          })),
                      ])}
                      users={users}
                      open={(d) =>
                        d.isFile
                          ? d.kind === 'pdf'
                            ? setSelectedPdf(d)
                            : window.location.assign(`/api/files/${d.id}/download`)
                          : openDoc(d)
                      }
                      remove={(d) => remove(d.isFile ? 'files' : 'documents', d)}
                    />
                    <p className="footnote">
                      <LockKeyhole size={13} /> Personal files are private. Project files are shared
                      only with project members and managers.
                    </p>
                  </>
                )}
                {page === 'pdf' && (
                  <>
                    <div className="pdf-banner">
                      <PenTool size={32} />
                      <div>
                        <h3>From document to agreement.</h3>
                        <p>
                          Add an electronic acknowledgement or sign using your organization’s
                          configured certificate.
                        </p>
                      </div>
                      <Badge>
                        {integrations.certificate
                          ? 'Certificate configured'
                          : 'Acknowledgements ready'}
                      </Badge>
                    </div>
                    <DocumentTable
                      docs={filtered(
                        (state.files ?? [])
                          .filter((f) => f.mime === 'application/pdf')
                          .map((f) => ({ ...f, kind: 'pdf' })),
                      )}
                      users={users}
                      open={setSelectedPdf}
                      remove={(d) => remove('files', d)}
                    />
                  </>
                )}
                {page === 'hub' && (
                  <>
                    <div className="section-bar">
                      <h2>Team knowledge</h2>
                      <button
                        className="button primary"
                        onClick={() =>
                          setModal({
                            title: 'Publish to team space',
                            fields: [
                              { key: 'title', label: 'Title', required: true },
                              projectField,
                              {
                                key: 'category',
                                label: 'Category',
                                type: 'select',
                                options: ['Knowledge', 'Announcement', 'Policy'].map((v) => ({
                                  value: v,
                                  label: v,
                                })),
                                default: 'Knowledge',
                              },
                              {
                                key: 'content',
                                label: 'Content',
                                type: 'textarea',
                                required: true,
                              },
                            ],
                            submit: (data) => mutate('pages', data),
                          })
                        }
                      >
                        <Plus size={16} /> New page
                      </button>
                    </div>
                    <div className="knowledge-grid">
                      {filtered(state.pages ?? []).map((p) => (
                        <article className="knowledge-card" key={p.id}>
                          <span className="knowledge-symbol">
                            <BookOpen size={23} />
                          </span>
                          <Badge>{p.category}</Badge>
                          <h2>{p.title}</h2>
                          <p>{p.content}</p>
                          <footer>
                            <span>
                              {users.find((u) => u.id === p.owner)?.name} · {niceDate(p.updated)}
                            </span>
                            {(p.owner === user.id || isManager) && (
                              <button
                                className="icon-button"
                                aria-label={`Edit ${p.title}`}
                                onClick={() =>
                                  setModal({
                                    title: 'Edit page',
                                    initial: p,
                                    fields: [
                                      { key: 'title', label: 'Title', required: true },
                                      projectField,
                                      {
                                        key: 'category',
                                        label: 'Category',
                                        type: 'select',
                                        options: ['Knowledge', 'Announcement', 'Policy'].map(
                                          (v) => ({ value: v, label: v }),
                                        ),
                                      },
                                      {
                                        key: 'content',
                                        label: 'Content',
                                        type: 'textarea',
                                        required: true,
                                      },
                                    ],
                                    submit: (data) => mutate('pages', data),
                                  })
                                }
                              >
                                <Settings2 size={16} />
                              </button>
                            )}
                          </footer>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                {page === 'projects' && (
                  <>
                    <div className="project-grid">
                      {filtered(projects.map((p) => ({ ...p, projectId: p.id }))).map((p) => {
                        const done = tasks.filter(
                            (t) => t.projectId === p.id && t.status === 'Done',
                          ).length,
                          total = tasks.filter((t) => t.projectId === p.id).length;
                        return (
                          <article className="project-card" key={p.id}>
                            <div className="project-top">
                              <span
                                className="project-symbol"
                                style={{ background: p.color + '20', color: p.color }}
                              >
                                <BriefcaseBusiness size={23} />
                              </span>
                              <Badge>{p.status}</Badge>
                              {isManager && (
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${p.title}`}
                                  onClick={() => newProject(p)}
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                              )}
                            </div>
                            <h3>{p.title}</h3>
                            <p>
                              {p.client} <span>·</span> {p.po || 'No PO assigned'}
                            </p>
                            <div className="project-progress">
                              <span>
                                {done} of {total} tasks complete
                              </span>
                              <strong>{total ? Math.round((done / total) * 100) : 0}%</strong>
                            </div>
                            <div className="progress-track">
                              <i
                                style={{
                                  width: `${total ? (done / total) * 100 : 0}%`,
                                  background: p.color,
                                }}
                              />
                            </div>
                            <footer>
                              <div className="avatar-stack">
                                {p.members.slice(0, 4).map((id: string) => (
                                  <span
                                    key={id}
                                    className="avatar small"
                                    title={users.find((u) => u.id === id)?.name}
                                  >
                                    {initials(users.find((u) => u.id === id)?.name ?? '?')}
                                  </span>
                                ))}
                              </div>
                              <small>{p.budgetHours}h budget</small>
                            </footer>
                          </article>
                        );
                      })}
                    </div>
                    <div className="section-bar">
                      <h2>
                        Project board <span className="count">{tasks.length}</span>
                      </h2>
                      <Select
                        label="Board project"
                        value={projectFilter}
                        onChange={setProjectFilter}
                        options={[
                          { value: '', label: 'All projects' },
                          ...projects.map((p) => ({ value: p.id, label: p.title })),
                        ]}
                      />
                    </div>
                    <div className="kanban">
                      {['Backlog', 'In progress', 'In review', 'Done'].map((status) => (
                        <div className="kanban-column" key={status}>
                          <div className="kanban-heading">
                            <span
                              className={`status-dot ${status.toLowerCase().replace(' ', '-')}`}
                            />
                            <strong>{status}</strong>
                            <span>{filtered(tasks).filter((t) => t.status === status).length}</span>
                            <button
                              className="icon-button"
                              onClick={() => newTask()}
                              aria-label={`Add task to ${status}`}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                          {filtered(tasks)
                            .filter((t) => t.status === status)
                            .map((t) => (
                              <article key={t.id} className="task-card">
                                <button className="task-name" onClick={() => newTask(t)}>
                                  {t.title}
                                </button>
                                <p>
                                  {projects.find((p) => p.id === t.projectId)?.title ||
                                    'Personal task'}
                                </p>
                                <footer>
                                  <Badge>{t.priority}</Badge>
                                  <span
                                    className="avatar tiny"
                                    title={users.find((u) => u.id === t.assignee)?.name}
                                  >
                                    {initials(users.find((u) => u.id === t.assignee)?.name || '?')}
                                  </span>
                                </footer>
                                <select
                                  aria-label={`Move ${t.title}`}
                                  value={status}
                                  onChange={(e) =>
                                    mutate('tasks', { ...t, status: e.target.value }).catch((e) =>
                                      notify(e.message),
                                    )
                                  }
                                >
                                  {['Backlog', 'In progress', 'In review', 'Done'].map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </article>
                            ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {page === 'chat' && (
                  <Chat
                    state={state}
                    user={user}
                    users={users}
                    refresh={refresh}
                    notify={notify}
                    projectOptions={projectOptions}
                  />
                )}
                {page === 'calendar' && (
                  <Meetings
                    state={state}
                    user={user}
                    users={users}
                    notify={notify}
                    newEvent={newEvent}
                  />
                )}
                {page === 'timesheets' && (
                  <Timesheets
                    state={state}
                    user={user}
                    users={users}
                    refresh={refresh}
                    notify={notify}
                  />
                )}
                {page === 'leave' && (
                  <TimeOff
                    state={state}
                    user={user}
                    users={users}
                    refresh={refresh}
                    notify={notify}
                  />
                )}
                {page === 'reports' && <Reports state={state} notify={notify} />}
                {page === 'billing' && isManager && (
                  <Romania user={user} state={state} notify={notify} />
                )}
                {page === 'account' && (
                  <Account user={user} onChanged={accountChanged} onLogout={() => setAuth(null)} />
                )}
                {page === 'admin' && (
                  <Admin
                    state={state}
                    user={user}
                    users={users}
                    refresh={refresh}
                    integrations={integrations}
                    notify={notify}
                  />
                )}
                {page === 'mail' && (
                  <div className="mail-layout">
                    <aside>
                      <div className="mail-folder-title">
                        <Mail size={17} /> Inbox & sent <span>{mail.length}</span>
                      </div>
                      {mail.map((m) => (
                        <button
                          key={m.id}
                          className={selectedMail?.id === m.id ? 'selected' : ''}
                          onClick={() => setSelectedMail(m)}
                        >
                          <div>
                            <strong>{m.from === user.email ? 'To: ' + m.to : m.from}</strong>
                            <small>{niceDate(m.created)}</small>
                          </div>
                          <b>{m.subject}</b>
                          <p>{m.body.slice(0, 90)}</p>
                          <Badge>{m.status}</Badge>
                        </button>
                      ))}
                      {!mail.length && (
                        <Empty
                          title="A fresh inbox"
                          description="Send your first message to a teammate."
                        />
                      )}
                    </aside>
                    <section>
                      {selectedMail ? (
                        <>
                          <div className="mail-detail-head">
                            <h2>{selectedMail.subject}</h2>
                            <Badge>{selectedMail.status}</Badge>
                          </div>
                          <p className="muted">
                            From {selectedMail.from}
                            <br />
                            To {selectedMail.to} · {new Date(selectedMail.created).toLocaleString()}
                          </p>
                          <div className="mail-body">{selectedMail.body}</div>
                        </>
                      ) : (
                        <Empty
                          title="Your conversations, all together"
                          description="Select a message or start a new conversation."
                          action={
                            <button className="button primary" onClick={compose}>
                              <Plus size={16} /> Compose message
                            </button>
                          }
                        />
                      )}
                    </section>
                  </div>
                )}
              </>
            )}
          </main>
        )}
        <footer className="app-footer">
          <span>
            <span className="online-dot" /> Your workspace. Your infrastructure.
          </span>
          <span>
            Reverse Office <span className="footer-dot">·</span> Made for better work
          </span>
        </footer>
      </div>
      {ai && (
        <Assistant
          doc={doc}
          onClose={() => setAi(false)}
          onOpenDocument={(id) => {
            const found = documents.find((d) => d.id === id);
            if (found) setDoc(found);
          }}
        />
      )}
      {modal && (
        <FormModal
          title={modal.title}
          description={modal.description}
          initial={modal.initial}
          fields={modal.fields}
          submitLabel={modal.submitLabel}
          onSubmit={modal.submit}
          onClose={() => setModal(null)}
        />
      )}
      {templateKind && (
        <TemplateGallery
          kind={templateKind}
          projects={projects}
          onClose={() => setTemplateKind(null)}
          onCreate={async (item) => {
            await refresh();
            setDoc(item);
          }}
        />
      )}
      {selectedPdf && (
        <PdfViewer
          file={selectedPdf}
          integrations={integrations}
          onEdit={() => {
            setPdfEditing(selectedPdf);
            setSelectedPdf(null);
          }}
          onClose={() => setSelectedPdf(null)}
          onSigned={async (f) => {
            await refresh();
            setSelectedPdf(f);
            notify('Signed copy saved to Drive');
          }}
        />
      )}
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        accept={page === 'pdf' ? 'application/pdf' : undefined}
        onChange={(e) => {
          if (e.target.files?.[0]) uploadFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={importRef}
        type="file"
        className="hidden"
        accept=".docx,.xlsx,.pptx,.txt,.md"
        onChange={(e) => {
          if (e.target.files?.[0]) uploadFile(e.target.files[0], true);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Login({ setup, onLogin }: { setup: boolean; onLogin: (a: any) => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <a className="brand">
          <div className="brand-mark">
            r<span>o</span>
            <i />
          </div>
          <div>
            reverse<span>office</span>
          </div>
        </a>
        <div className="login-copy">
          <span className="eyebrow">A LITTLE MORE CONNECTED.</span>
          <h1>
            Good work.
            <br />
            Great company.
          </h1>
          <p>
            Your documents, ideas and people.
            <br />
            Finally, in the same place.
          </p>
          <div className="login-apps">
            <DocIcon kind="doc" large />
            <DocIcon kind="sheet" large />
            <DocIcon kind="slides" large />
            <span>
              <MessagesSquare />
            </span>
          </div>
        </div>
        <span className="login-bottom">Your workspace. Your infrastructure. Your way.</span>
        <div className="login-art">
          <div />
          <div />
          <div />
        </div>
      </div>
      <div className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">WELCOME TO REVERSE OFFICE</span>
          <h2>{setup ? 'Make yourself at home.' : 'Welcome back.'}</h2>
          <p>
            {setup
              ? 'Create your workspace and first administrator account.'
              : 'A new day. A fresh start. Your work is waiting.'}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                onLogin(await api(setup ? '/setup' : '/login', 'POST', data));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    placeholder="Alex Morgan"
                  />
                </label>
                <label>
                  Workspace setup key
                  <input
                    name="key"
                    required
                    type="password"
                    placeholder="From your server console"
                  />
                  <small>Printed once when you start the server.</small>
                </label>
              </>
            )}
            <label>
              Work email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={200}
                autoComplete={setup ? 'new-password' : 'current-password'}
                required
                placeholder={setup ? 'At least 12 characters' : 'Your password'}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <>
                  {setup ? 'Create workspace' : 'Sign in'}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="login-privacy">
            <ShieldCheck size={17} />
            <span>Hosted by you. Built around your privacy.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  user,
  state,
  users,
  onCreate,
  navigate,
  openDoc,
  newTask,
  newEvent,
  onAI,
}: {
  user: User;
  state: State;
  users: User[];
  onCreate: (kind: string) => void;
  navigate: (page: string) => void;
  openDoc: (doc: Item) => void;
  newTask: () => void;
  newEvent: () => void;
  onAI: () => void;
}) {
  const today = isoToday(),
    docs = state.documents ?? [],
    tasks = state.tasks ?? [],
    time = state.timesheets ?? [],
    events = (state.events ?? [])
      .filter((e) => e.start.slice(0, 10) === today)
      .sort((a, b) => a.start.localeCompare(b.start));
  const myTasks = tasks.filter((t) => t.assignee === user.id && t.status !== 'Done'),
    weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const hours = time
    .filter(
      (t) => t.userId === user.id && new Date(t.date + 'T12:00:00') >= weekStart && t.date <= today,
    )
    .reduce((s, t) => s + t.hours, 0);
  return (
    <>
      <div className="dashboard-date">
        {new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        <span>
          <span className="online-dot" /> All your work, connected
        </span>
      </div>
      <div className="page-heading dashboard-heading">
        <div>
          <h1>
            {new Date().getHours() < 12
              ? 'Good morning'
              : new Date().getHours() < 18
                ? 'Good afternoon'
                : 'Good evening'}
            , {user.name.split(' ')[0]} <span className="greeting-dot">✳</span>
          </h1>
          <p>Here’s your space to focus, create and move things forward.</p>
        </div>
        <button className="button primary" onClick={() => onCreate('doc')}>
          <Plus size={17} /> Create new <ChevronDown size={14} />
        </button>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span /> LESS SWITCHING. MORE DOING.
          </span>
          <h2>
            A little space.
            <br />
            For your next big thing.
          </h2>
          <p>
            Write, plan, connect. Bring your best work together
            <br className="desktop-only" /> in one thoughtful workspace.
          </p>
          <button onClick={onAI}>
            Find your focus with AI <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-pill pill-back" />
          <div className="art-pill pill-front" />
          <div className="floating-card card-document">
            <FileText size={28} />
            <i />
            <i />
            <i />
          </div>
          <div className="floating-card card-chart">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="art-star">✳</div>
          <div className="art-dot" />
        </div>
        <span className="hero-caption">A WORKSPACE THAT WORKS WITH YOU.</span>
      </section>
      <section className="quick-apps">
        {[
          { kind: 'doc', label: 'Writer', description: 'Give ideas a voice', Icon: FileText },
          { kind: 'sheet', label: 'Sheets', description: 'Make numbers work', Icon: Table2 },
          {
            kind: 'slides',
            label: 'Slides',
            description: 'Tell a great story',
            Icon: Presentation,
          },
          { kind: 'pdf', label: 'PDF & Sign', description: 'Make it official', Icon: PenTool },
          {
            kind: 'chat',
            label: 'Connect',
            description: 'Bring people together',
            Icon: MessagesSquare,
          },
        ].map((a) => (
          <button key={a.kind} onClick={() => navigate(a.kind)}>
            <span className={`app-tile ${a.kind}`}>
              <a.Icon size={22} />
            </span>
            <div>
              <strong>{a.label}</strong>
              <small>{a.description}</small>
            </div>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </section>
      <section className="metrics">
        <button onClick={() => navigate('projects')}>
          <span>
            Active projects <BriefcaseBusiness size={16} />
          </span>
          <div>
            <strong>{(state.projects ?? []).filter((p) => p.status === 'Active').length}</strong>
            <small>Moving work forward</small>
          </div>
          <div className="mini-bars">
            {[20, 32, 24, 42, 36, 48, 55, 46, 64, 56, 76, 70].map((h, i) => (
              <i key={i} style={{ height: h + '%' }} />
            ))}
          </div>
        </button>
        <button onClick={() => navigate('timesheets')}>
          <span>
            Hours this week <Clock3 size={16} />
          </span>
          <div>
            <strong>
              {hours.toFixed(1)}
              <em>h</em>
            </strong>
            <small>Your recorded time</small>
          </div>
          <div className="metric-track">
            <i style={{ width: `${Math.min((hours / 40) * 100, 100)}%` }} />
          </div>
        </button>
        <button onClick={() => navigate('projects')}>
          <span>
            My open tasks <CheckCheck size={16} />
          </span>
          <div>
            <strong>{myTasks.length}</strong>
            <small>One thing at a time</small>
          </div>
          <span className="metric-detail">
            {myTasks.filter((t) => t.priority === 'High').length} high priority{' '}
            <ArrowRight size={13} />
          </span>
        </button>
        <button onClick={() => navigate('drive')}>
          <span>
            Workspace documents <FolderOpen size={16} />
          </span>
          <div>
            <strong>{docs.length}</strong>
            <small>Ideas taking shape</small>
          </div>
          <div className="metric-docs">
            <span className="doc" />
            <span className="sheet" />
            <span className="slides" />
            <span className="pdf" />
          </div>
        </button>
      </section>
      <div className="dashboard-columns">
        <section className="recent-section">
          <div className="section-bar">
            <h2>Pick up where you left off</h2>
            <button className="text-link" onClick={() => navigate('drive')}>
              View all files <ArrowRight size={14} />
            </button>
          </div>
          <div className="recent-tabs">
            <button className="active">Recent</button>
            <span>Everything you need, close at hand</span>
          </div>
          <DocumentTable docs={docs.slice(0, 5)} users={users} open={openDoc} />
          <div className="section-bar lower-section">
            <h2>A little progress, every day</h2>
            <button className="text-link" onClick={newTask}>
              <Plus size={14} /> Add task
            </button>
          </div>
          <div className="today-tasks">
            {myTasks.slice(0, 3).map((t) => (
              <button key={t.id} onClick={() => navigate('projects')}>
                <span className="task-circle" />
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {state.projects?.find((p) => p.id === t.projectId)?.title || 'Personal'}
                  </small>
                </div>
                <Badge>{t.priority}</Badge>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!myTasks.length && (
              <div className="quiet-state">
                <CheckCheck size={20} />
                <span>You’re all caught up. Make room for something new.</span>
              </div>
            )}
          </div>
        </section>
        <aside className="day-panel">
          <div className="section-bar">
            <h2>Your day, at a glance</h2>
            <button
              className="icon-button"
              onClick={() => navigate('calendar')}
              aria-label="View calendar"
            >
              <CalendarDays size={17} />
            </button>
          </div>
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + i);
              return (
                <button
                  key={i}
                  className={d.toDateString() === new Date().toDateString() ? 'today' : ''}
                  onClick={() => navigate('calendar')}
                >
                  <span>{d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 1)}</span>
                  <strong>{d.getDate()}</strong>
                  {d.toDateString() === new Date().toDateString() && <i />}
                </button>
              );
            })}
          </div>
          <div className="agenda-label">
            TODAY’S SCHEDULE <span>{events.length} events</span>
          </div>
          {events.length ? (
            events.slice(0, 3).map((e) => (
              <button className="agenda-event" key={e.id} onClick={() => navigate('calendar')}>
                <span>
                  {new Date(e.start).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    <Video size={12} /> Workspace meeting
                  </small>
                </div>
              </button>
            ))
          ) : (
            <div className="free-day">
              <span>
                <CalendarDays size={25} />
              </span>
              <strong>A little breathing room.</strong>
              <p>
                No meetings today.
                <br />
                Time to make something great.
              </p>
              <button className="text-link" onClick={newEvent}>
                Schedule a meeting <Plus size={13} />
              </button>
            </div>
          )}
          <div className="ai-nudge">
            <span className="ai-nudge-icon">
              <Sparkles size={19} />
            </span>
            <h3>A second pair of hands.</h3>
            <p>Find a file, shape an idea, or get a fresh perspective on your work.</p>
            <button onClick={onAI}>
              Let’s work on it <ArrowRight size={15} />
            </button>
            <small>YOUR WORKSPACE ASSISTANT</small>
          </div>
        </aside>
      </div>
    </>
  );
}

function DocumentTable({
  docs,
  users,
  open,
  remove,
}: {
  docs: Item[];
  users: User[];
  open: (d: Item) => void;
  remove?: (d: Item) => void;
}) {
  return (
    <div className="document-table panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Last modified</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="document-name" onClick={() => open(d)}>
                  <DocIcon kind={d.kind} />
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.projectId ? 'Shared with project' : 'Only you'}
                      {d.signature ? ' · Signed copy' : ''}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className="table-person">
                  <span className="avatar tiny">
                    {initials(users.find((u) => u.id === d.owner)?.name ?? '?')}
                  </span>
                  {users.find((u) => u.id === d.owner)?.name?.split(' ')[0] ?? 'Team'}
                </span>
              </td>
              <td>{niceDate(d.updated)}</td>
              <td>
                {remove ? (
                  <button
                    className="icon-button subtle"
                    aria-label={`Delete ${d.title}`}
                    onClick={() => remove(d)}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <button
                    className="icon-button subtle"
                    aria-label={`Open ${d.title}`}
                    onClick={() => open(d)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!docs.length && (
        <Empty
          title="Your next idea starts here"
          description="Create or upload a file to get started."
        />
      )}
    </div>
  );
}

function PdfViewer({
  file,
  integrations,
  onClose,
  onSigned,
  onEdit,
}: {
  file: Item;
  integrations: Item;
  onClose: () => void;
  onSigned: (file: Item) => Promise<void>;
  onEdit: () => void;
}) {
  const [mode, setMode] = useState('acknowledgement'),
    [reason, setReason] = useState('I have reviewed and acknowledge this document.'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={file.title}
      description="Keep the original. Save an independently traceable signed copy."
      onClose={onClose}
      wide
    >
      <div className="pdf-workbench">
        <iframe title="PDF preview" src={`/api/files/${file.id}/preview`} />
        <div>
          <h3>Review & sign</h3>
          {integrations.office && (
            <button className="button primary" onClick={onEdit}>
              <FileText size={16} />
              Edit PDF · full editor
            </button>
          )}
          {integrations.office && (
            <p className="muted small">
              Edit text and images, annotate, fill forms and organize pages. Save your changes
              before returning here to sign.
            </p>
          )}
          <label>
            Signature type
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="acknowledgement">Electronic acknowledgement</option>
              <option value="certificate" disabled={!integrations.certificate}>
                Certificate signature{!integrations.certificate ? ' (not configured)' : ''}
              </option>
            </select>
          </label>
          <p className="muted small">
            {mode === 'acknowledgement'
              ? 'Adds your identity, timestamp and the source file hash to an acknowledgement page. This is not a certificate-based signature.'
              : 'Uses the organization’s configured PKCS#12 certificate. Qualified signature status depends on your certificate and trust provider.'}
          </p>
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={150}
              rows={4}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button
            className="button primary"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onSigned(await api(`/files/${file.id}/sign`, 'POST', { reason, mode }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <PenTool size={16} />
            {busy ? 'Signing…' : 'Sign & save copy'}
          </button>
          <a className="button secondary" href={`/api/files/${file.id}/download`}>
            <Download size={16} /> Download PDF
          </a>
          <small className="file-hash">
            SHA-256
            <br />
            {file.sha256}
          </small>
        </div>
      </div>
    </Modal>
  );
}
