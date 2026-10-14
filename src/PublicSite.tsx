// SPDX-License-Identifier: MIT
import { useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  FileText,
  Table2,
  Presentation,
  MessagesSquare,
  Clock3,
  FolderOpen,
  Sparkles,
  BookOpen,
  Check,
  Github,
} from 'lucide-react';
import { ProductGuide, GuideLanguage, useGuideLanguage } from './ProductGuide';
import { words, type Words } from './guide-content';
import { ThemePicker, useTheme } from './Theme';

export default function PublicSite({ guide = false }: { guide?: boolean }) {
  const { language, setLanguage } = useGuideLanguage(),
    t = (v: Words) => words(v, language);
  const { choice, setChoice } = useTheme();
  useEffect(() => {
    document.title = guide
      ? 'Ghid / Guide · Reverse Office'
      : 'Reverse Office · Your work, together';
    document.documentElement.lang = language;
  }, [guide, language]);
  const groups: {
    title: Words;
    description: Words;
    apps: string;
    icon: typeof FileText;
    topic: string;
  }[] = [
    {
      title: ['Creează cu sens.', 'Make something useful.'],
      description: [
        'De la prima idee la document, spreadsheet, prezentare și PDF.',
        'From the first idea to a document, spreadsheet, presentation and PDF.',
      ],
      apps: 'Writer · Sheets · Slides · PDF & Sign',
      icon: FileText,
      topic: 'writer',
    },
    {
      title: ['Lucrează împreună.', 'Work it out together.'],
      description: [
        'Conversații, apeluri, fișiere și cunoștințe comune, aproape de proiect.',
        'Conversations, calls, files and shared knowledge, close to the project.',
      ],
      apps: 'Connect · Mail · Drive · Team space',
      icon: MessagesSquare,
      topic: 'connect',
    },
    {
      title: ['Ține lucrurile în ordine.', 'Keep things in order.'],
      description: [
        'Proiecte, sarcini, pontaj, concedii și rapoarte pentru întreaga echipă.',
        'Projects, tasks, hours, time off and reports for the whole team.',
      ],
      apps: 'Projects · Timesheets · People · Reports',
      icon: Clock3,
      topic: 'time',
    },
  ];
  const faqs: [Words, Words][] = [
    [
      ['Ce este Reverse Office?', 'What is Reverse Office?'],
      [
        'Un proiect comunitar care aduce instrumentele de lucru într-o singură aplicație web: creare, colaborare și administrare. Editorii sunt dezvoltați independent, iar funcțiile cresc împreună cu proiectul.',
        'A community project bringing work tools into one web app: creation, collaboration and administration. Editors are independently developed and features grow with the project.',
      ],
    ],
    [
      ['Am nevoie de un cont?', 'Do I need an account?'],
      [
        'Prezentarea și ghidul sunt publice. Pentru spațiul companiei, administratorul îți creează un cont sau îți trimite o invitație guest. La prima instalare se creează administratorul cu cheia afișată de server.',
        'The introduction and guide are public. For a company workspace, an administrator creates your account or shares a guest invitation. First-time installation creates an administrator using the server’s setup key.',
      ],
    ],
    [
      ['Cum funcționează Nova?', 'How does Nova work?'],
      [
        'Nova caută în informațiile accesibile contului tău și poate folosi specialiști și instrumente. Administratorul alege OpenAI sau un model local compatibil. Web, MCP și analiza imaginilor necesită configurare; fără model există căutare locală.',
        'Nova searches information accessible to your account and can use specialists and tools. An administrator chooses OpenAI or a compatible local model. Web, MCP and image analysis require configuration; local search works without a model.',
      ],
    ],
    [
      ['Pot folosi fișiere Office?', 'Can I use Office files?'],
      [
        'Există import/export DOCX, XLSX și PPTX prin editorii proprii. Nu toate obiectele, formulele și machetele sunt păstrate. Lucrează pe copii și verifică fișierele importante după import/export.',
        'The independent editors import/export DOCX, XLSX and PPTX. Not every object, formula or layout is preserved. Work on copies and check important files after import/export.',
      ],
    ],
    [
      ['Este gata pentru orice instalare?', 'Is it ready for every deployment?'],
      [
        'Există o aplicație funcțională în dezvoltare și un container separat pentru Studio. Distribuția întregii suite încă are blocaje de licențiere față de politica strictă MIT/Apache-2.0. Integrarea SPV este pe un branch separat, cu teste simulate.',
        'There is a working application under development and a separate Studio container. Full-suite distribution still has licensing blockers under the strict MIT/Apache-2.0 policy. SPV is on a separate branch with simulated tests.',
      ],
    ],
  ];
  return (
    <div className="public-site" lang={language}>
      <a className="site-skip" href="#site-main">
        {t(['Sari la conținut', 'Skip to content'])}
      </a>
      <header className="site-header">
        <a className="site-brand" href="/welcome" aria-label="Reverse Office home">
          <span className="site-logo">
            ro<span>•</span>
          </span>
          <strong>
            reverse<span>office</span>
          </strong>
        </a>
        <nav aria-label={t(['Navigare publică', 'Public navigation'])}>
          <a href="/welcome#modules">{t(['Aplicații', 'Apps'])}</a>
          <a href="/guide" aria-current={guide ? 'page' : undefined}>
            {t(['Ghid', 'Guide'])}
          </a>
          <a className="site-enter" href="/?app=home">
            {t(['Deschide workspace', 'Open workspace'])}
            <ArrowUpRight size={15} />
          </a>
        </nav>
        {!guide && <GuideLanguage language={language} setLanguage={setLanguage} />}
        <ThemePicker value={choice} onChange={setChoice} />
      </header>
      <main id="site-main">
        {guide ? (
          <div className="site-guide-wrap">
            <h1 className="site-guide-title">
              {t(['Ghidul Reverse Office', 'The Reverse Office guide'])}
            </h1>
            <ProductGuide languageControl={{ language, setLanguage }} />
          </div>
        ) : (
          <>
            <section className="site-hero site-width">
              <div>
                <span className="site-kicker">
                  <span />{' '}
                  {t(['MAI PUȚIN SCHIMBAT. MAI MULT CREAT.', 'LESS SWITCHING. MORE MAKING.'])}
                </span>
                <h1>
                  {t(['Toată munca ta.', 'All your work.'])}
                  <br />
                  <em>{t(['În același loc.', 'In one place.'])}</em>
                </h1>
                <p>
                  {t([
                    'Idei, documente, oameni și proiecte. Reverse Office le aduce împreună într-un spațiu simplu, pe care îl poți face al tău.',
                    'Ideas, documents, people and projects. Reverse Office brings them together in a simple space you can make your own.',
                  ])}
                </p>
                <div className="site-actions">
                  <a className="site-primary" href="/?app=home">
                    {t(['Intră în workspace', 'Enter workspace'])}
                    <ArrowUpRight size={18} />
                  </a>
                  <a className="site-secondary" href="/guide">
                    {t(['Vezi cum funcționează', 'See how it works'])}
                    <ArrowRight size={17} />
                  </a>
                </div>
                <div className="site-values">
                  <span>
                    <Check size={14} /> {t(['În browser', 'In your browser'])}
                  </span>
                  <span>
                    <Check size={14} /> {t(['Găzduit de tine', 'Self-hosted'])}
                  </span>
                  <span>
                    <Check size={14} /> {t(['Construit deschis', 'Built in the open'])}
                  </span>
                </div>
              </div>
              <div
                className="site-workmap"
                aria-label={t(['Harta modulelor Reverse Office', 'Reverse Office module map'])}
              >
                <div className="site-map-header">
                  <span>YOUR CONNECTED WORKSPACE</span>
                  <span>↗</span>
                </div>
                <div className="site-map-center">
                  <span className="site-logo">
                    ro<span>•</span>
                  </span>
                  <h2>{t(['O idee. Multe posibilități.', 'One idea. Many possibilities.'])}</h2>
                </div>
                <div className="site-map-apps">
                  {[
                    [FileText, 'Writer', 'writer'],
                    [Table2, 'Sheets', 'sheets'],
                    [Presentation, 'Slides', 'slides'],
                    [MessagesSquare, 'Connect', 'connect'],
                    [FolderOpen, 'Drive', 'drive'],
                    [Clock3, 'Time', 'time'],
                  ].map(([Icon, title, topic]: any) => (
                    <a key={topic} href={'/guide?topic=' + topic}>
                      <Icon size={21} />
                      <span>{title}</span>
                    </a>
                  ))}
                </div>
                <a className="site-map-nova" href="/guide?topic=nova">
                  <span className="site-nova-eyes" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>Nova AI</strong>
                    <small>
                      {t(['Ajutor, aproape de munca ta.', 'Help, close to your work.'])}
                    </small>
                  </span>
                  <ArrowUpRight size={19} />
                </a>
                <p>
                  {t([
                    'Explorează un modul pentru pașii de început.',
                    'Explore a module for your first steps.',
                  ])}
                </p>
              </div>
            </section>
            <section className="site-modules site-width" id="modules">
              <div className="site-section-heading">
                <span className="site-kicker">
                  01 / {t(['SPAȚIUL TĂU DE LUCRU', 'YOUR WORKSPACE'])}
                </span>
                <h2>{t(['Instrumente care au sens împreună.', 'Tools that belong together.'])}</h2>
                <p>
                  {t([
                    'Fiecare modul își are rolul. Proiectul le ține conectate.',
                    'Each module has a purpose. The project keeps them connected.',
                  ])}
                </p>
              </div>
              <div className="site-feature-grid">
                {groups.map((g, i) => (
                  <a className="site-feature" key={g.topic} href={'/guide?topic=' + g.topic}>
                    <span className={'site-feature-icon tone-' + i}>
                      <g.icon size={24} />
                    </span>
                    <h3>{t(g.title)}</h3>
                    <p>{t(g.description)}</p>
                    <small>{g.apps}</small>
                    <span className="site-feature-link">
                      {t(['Explorează', 'Explore'])}
                      <ArrowUpRight size={16} />
                    </span>
                  </a>
                ))}
              </div>
            </section>
            <section className="site-flow site-width">
              <div className="site-section-heading">
                <span className="site-kicker">
                  02 / {t(['DE LA IDEE LA LIVRARE', 'FROM IDEA TO DELIVERY'])}
                </span>
                <h2>{t(['O zi de lucru, fără ocoluri.', 'A working day, connected.'])}</h2>
              </div>
              <ol>
                {(
                  [
                    [
                      ['Planifică', 'Plan'],
                      [
                        'Creează proiectul, adaugă echipa și împarte sarcinile.',
                        'Create the project, add the team and break down tasks.',
                      ],
                      'projects',
                    ],
                    [
                      ['Creează', 'Create'],
                      [
                        'Scrie propunerea, calculează bugetul și pregătește prezentarea.',
                        'Write the proposal, calculate the budget and prepare the presentation.',
                      ],
                      'writer',
                    ],
                    [
                      ['Discută', 'Discuss'],
                      [
                        'Împarte fișierele, cere feedback și intră în apel.',
                        'Share files, ask for feedback and join a call.',
                      ],
                      'connect',
                    ],
                    [
                      ['Încheie', 'Wrap up'],
                      [
                        'Pontează timpul, aprobă orele și exportă raportul.',
                        'Log time, approve hours and export the report.',
                      ],
                      'time',
                    ],
                  ] as [Words, Words, string][]
                ).map(([title, description, topic], i) => (
                  <li key={topic}>
                    <span>0{i + 1}</span>
                    <h3>{t(title)}</h3>
                    <p>{t(description)}</p>
                    <a
                      href={'/guide?topic=' + topic}
                      aria-label={t(title) + ' — ' + t(['deschide ghidul', 'open guide'])}
                    >
                      <ArrowRight size={20} />
                    </a>
                  </li>
                ))}
              </ol>
            </section>
            <section className="site-ai site-width">
              <div>
                <span className="site-kicker">
                  <Sparkles size={15} /> MEET NOVA
                </span>
                <h2>
                  {t([
                    'Un ajutor care știe unde să caute.',
                    'An assistant that knows where to look.',
                  ])}
                </h2>
                <p>
                  {t([
                    'Întreabă despre documente, celule sau proiecte. Alege un specialist, urmărește sursele și obține grafice din date salvate. Tu alegi furnizorul și modelul.',
                    'Ask about documents, cells or projects. Choose a specialist, follow sources and get charts from saved data. You choose the provider and model.',
                  ])}
                </p>
                <a href="/guide?topic=nova">
                  {t(['Cunoaște-o pe Nova', 'Get to know Nova'])}
                  <ArrowUpRight size={17} />
                </a>
              </div>
              <div className="site-ai-example">
                <span>{t(['EXEMPLE DE ÎNTREBĂRI', 'THINGS YOU CAN ASK'])}</span>
                <p>“{t(['Unde este bugetul proiectului?', 'Where is the project budget?'])}”</p>
                <p>
                  “{t(['Fă un grafic din intervalul B2:B8.', 'Make a chart from range B2:B8.'])}”
                </p>
                <small>
                  {t([
                    'Disponibilitatea instrumentelor depinde de configurare și de permisiunile contului.',
                    'Tool availability depends on configuration and account permissions.',
                  ])}
                </small>
              </div>
            </section>
            <section className="site-faq site-width">
              <div>
                <span className="site-kicker">03 / {t(['BINE DE ȘTIUT', 'GOOD TO KNOW'])}</span>
                <h2>{t(['Înainte să începi.', 'Before you begin.'])}</h2>
                <p>
                  {t([
                    'Un proiect care crește, cu funcții și limite explicate deschis.',
                    'A growing project, with features and limits explained openly.',
                  ])}
                </p>
              </div>
              <div>
                {faqs.map(([question, answer], i) => (
                  <details key={i}>
                    <summary>{t(question)}</summary>
                    <p>{t(answer)}</p>
                  </details>
                ))}
              </div>
            </section>
            <section className="site-start site-width">
              <BookOpen size={28} />
              <h2>{t(['Începe cu un singur pas.', 'Start with one small step.'])}</h2>
              <p>
                {t([
                  'Ghidul te duce prin fiecare aplicație, în ritmul tău.',
                  'The guide walks you through every app, at your own pace.',
                ])}
              </p>
              <a className="site-primary" href="/guide">
                {t(['Deschide ghidul', 'Open the guide'])}
                <ArrowRight size={17} />
              </a>
            </section>
          </>
        )}
      </main>
      <footer className="site-footer site-width">
        <div>
          <strong>
            reverseoffice<span>↗</span>
          </strong>
          <p>
            {t([
              'Mai mult loc pentru lucrul care contează.',
              'More room for the work that matters.',
            ])}
          </p>
        </div>
        <nav aria-label="Project links">
          <a href="/welcome">{t(['Proiectul', 'The project'])}</a>
          <a href="/guide">{t(['Ghid', 'Guide'])}</a>
          <a
            href="https://github.com/Ramphyi/reverse_office"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={15} /> GitHub
          </a>
        </nav>
        <small>
          {t([
            'Codul original al proiectului: MIT. Licențele componentelor terțe rămân distincte. Reverse Office este un proiect independent, fără afiliere Microsoft sau Adobe.',
            'Original project code: MIT. Third-party component licenses remain separate. Reverse Office is an independent project, unaffiliated with Microsoft or Adobe.',
          ])}
        </small>
      </footer>
    </div>
  );
}
