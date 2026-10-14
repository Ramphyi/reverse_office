// SPDX-License-Identifier: MIT
export type Language = 'ro' | 'en';
export type Words = [string, string];
export const words = (value: Words, language: Language) => value[language === 'ro' ? 0 : 1];
export type GuideTopic = {
  id: string;
  app: string;
  category: 'start' | 'create' | 'team' | 'manage';
  title: string;
  summary: Words;
  steps: Words[];
  note: Words;
  roles?: string[];
  optional?: boolean;
};
export const guideTopics: GuideTopic[] = [
  {
    id: 'start',
    app: 'admin',
    category: 'start',
    title: 'Start · Workspace',
    roles: ['admin'],
    summary: [
      'De la un spațiu gol la o echipă pregătită de lucru.',
      'From an empty workspace to a team ready to work.',
    ],
    steps: [
      [
        'La prima pornire, folosește cheia de configurare afișată de server și creează contul administratorului. Nu există o parolă universală.',
        'On first launch, use the setup key printed by the server to create the administrator account. There is no universal password.',
      ],
      [
        'În Administration → Organisation, setează numele, fusul orar și orele de lucru. Configurează calendarele și zilele libere pentru anul folosit.',
        'In Administration → Organisation, set the name, time zone and working hours. Configure calendars and holidays for the relevant year.',
      ],
      [
        'Creează un proiect în Projects, apoi adaugă colegii din Administration → People. Alege rolul, managerul, calendarul și proiectele fiecăruia.',
        'Create a project in Projects, then add colleagues in Administration → People. Choose each person’s role, manager, calendar and projects.',
      ],
      [
        'Transmite individual datele inițiale de acces. Colegul își schimbă parola temporară la prima autentificare; apoi poate lucra în modulele permise.',
        'Share initial credentials individually. Colleagues replace temporary passwords at first sign-in, then use their permitted modules.',
      ],
    ],
    note: [
      'O organizație per instalare. Configurarea furnizorilor AI, email și a serviciilor externe este separată.',
      'One organisation per deployment. AI providers, email and external services need separate configuration.',
    ],
  },
  {
    id: 'workspace',
    app: 'home',
    category: 'start',
    title: 'Overview · Your workspace',
    summary: [
      'Găsește aplicațiile, personalizează spațiul și lucrează în mai multe ferestre.',
      'Find your apps, personalise your space and work across windows.',
    ],
    steps: [
      [
        'Pornește din Overview pentru documente recente, proiecte și activitatea ta. Deschide un modul din meniul din stânga.',
        'Start in Overview for recent documents, projects and your activity. Open a module from the left sidebar.',
      ],
      [
        'Folosește setările meniului pentru a ascunde sau reordona scurtături. Trage marginea meniului pentru a-i schimba lățimea.',
        'Use sidebar settings to hide or reorder shortcuts. Drag its edge to change the width.',
      ],
      [
        'Alege Light, Dark sau System și folosește paleta pentru culoarea accentului și densitate. Open in new tab / Open in window deschide modulul separat.',
        'Choose Light, Dark or System and use the palette for accent colour and density. Open in new tab / Open in window opens a separate module.',
      ],
    ],
    note: [
      'Preferințele vizuale sunt salvate în browser. O fereastră separată folosește același cont și aceleași permisiuni.',
      'Appearance preferences are saved in your browser. Separate windows use the same account and permissions.',
    ],
  },
  {
    id: 'writer',
    app: 'doc',
    category: 'create',
    title: 'Writer',
    summary: [
      'Redactează documente cu text formatat, imagini și tabele.',
      'Write documents with formatted text, images and tables.',
    ],
    steps: [
      [
        'Deschide Writer → Create new, alege un model, dă-i un nume și selectează Create & open.',
        'Open Writer → Create new, choose a template, name it and select Create & open.',
      ],
      [
        'Scrie în pagină și folosește instrumentele editorului pentru titluri, liste, culori, imagini și tabele. Undo / Redo te ajută să revii asupra editărilor.',
        'Write in the page and use editor tools for headings, lists, colours, images and tables. Use Undo / Redo to revise edits.',
      ],
      [
        'Apasă Save și așteaptă confirmarea. Folosește Export pentru DOCX sau formatele disponibile; redeschide documentul pentru a verifica rezultatul.',
        'Press Save and wait for confirmation. Use Export for DOCX or the available formats; reopen the document to check the result.',
      ],
    ],
    note: [
      'Documentele din motorul anterior se importă prin Create editable Studio copy. Originalul rămâne intact; machetele complexe pot necesita ajustări.',
      'Earlier-engine documents use Create editable Studio copy. Originals remain intact; complex layouts may need adjustment.',
    ],
  },
  {
    id: 'sheets',
    app: 'sheet',
    category: 'create',
    title: 'Sheets',
    summary: [
      'Organizează date, calculează cu formule și construiește grafice.',
      'Organise data, calculate formulas and create charts.',
    ],
    steps: [
      [
        'Creează un spreadsheet sau importă o copie XLSX. Introdu date în celule și folosește foile pentru a separa bugete, activități sau scenarii.',
        'Create a spreadsheet or import an XLSX copy. Enter cells and use sheets to separate budgets, activities or scenarios.',
      ],
      [
        'Selectează un interval pentru formatare, copiere/lipire sau unirea celulelor. Încearcă =SUM(B2:B5) ori =AVERAGE(B2:B5) și verifică valorile calculate.',
        'Select a range for formatting, copy/paste or merging cells. Try =SUM(B2:B5) or =AVERAGE(B2:B5) and check the calculated values.',
      ],
      [
        'Adaugă un grafic din datele tale, salvează și exportă XLSX. Nova poate căuta celule și construi grafice din intervale deja salvate.',
        'Add a chart from your data, save and export XLSX. Nova can find cells and build charts from saved ranges.',
      ],
    ],
    note: [
      'Motorul are un set definit de formule, inclusiv SUMIFS și XLOOKUP exact. Macro-urile, pivot tables și toate funcțiile Excel nu sunt implementate.',
      'The engine supports a defined formula set, including SUMIFS and exact XLOOKUP. Macros, pivot tables and the complete Excel function set are not implemented.',
    ],
  },
  {
    id: 'slides',
    app: 'slides',
    category: 'create',
    title: 'Slides',
    summary: [
      'Transformă un plan într-o prezentare cu text, imagini și note.',
      'Turn a plan into a presentation with text, images and notes.',
    ],
    steps: [
      [
        'În Slides, creează o prezentare din modelul potrivit și stabilește titlul.',
        'In Slides, create a presentation from a suitable template and set its title.',
      ],
      [
        'Adaugă sau reordonează slide-uri, editează obiectele, inserează imagini și completează notele prezentatorului.',
        'Add or reorder slides, edit objects, insert images and write speaker notes.',
      ],
      [
        'Verifică prezentarea cu Present, salvează și exportă PPTX. Compară orice fișier importat cu originalul înainte de livrare.',
        'Review with Present, save and export PPTX. Compare imported files with their originals before delivery.',
      ],
    ],
    note: [
      'Importul și exportul nu păstrează orice efect sau obiect PowerPoint. Animațiile avansate nu sunt disponibile.',
      'Import and export do not preserve every PowerPoint effect or object. Advanced animations are unavailable.',
    ],
  },
  {
    id: 'pdf',
    app: 'pdf',
    category: 'create',
    title: 'PDF & Sign',
    summary: [
      'Revizuiește PDF-uri și creează copii adnotate sau semnate.',
      'Review PDFs and create annotated or signed copies.',
    ],
    steps: [
      [
        'Încarcă PDF-ul și deschide-l din PDF & Sign. Verifică fișierul înainte de orice semnare.',
        'Upload the PDF and open it in PDF & Sign. Review it before signing.',
      ],
      [
        'Alege Edit PDF pentru adnotări text, rotirea sau eliminarea unei pagini și completarea câmpurilor existente. Save edited PDF copy creează un fișier separat.',
        'Choose Edit PDF for text annotations, page rotation/removal and existing form fields. Save edited PDF copy creates a separate file.',
      ],
      [
        'Revino la review & sign. Alege confirmarea electronică sau semnarea cu certificat, dacă administratorul a configurat certificatul organizației.',
        'Return to review & sign. Choose electronic acknowledgement or certificate signing if the administrator configured the organisation certificate.',
      ],
    ],
    note: [
      'O confirmare nu este o semnătură calificată. Adnotarea nu șterge textul original și nu face redactare; fontul PDF standard are suport Unicode limitat.',
      'Acknowledgement is not a qualified signature. Annotations do not remove original text or redact content; the standard PDF font has limited Unicode support.',
    ],
  },
  {
    id: 'drive',
    app: 'drive',
    category: 'team',
    title: 'My Drive',
    summary: [
      'Păstrează fișierele și controlează cine le poate vedea.',
      'Keep files together and control who can see them.',
    ],
    steps: [
      [
        'Creează foldere, încarcă fișiere și asociază-le unui proiect atunci când echipa proiectului trebuie să le acceseze.',
        'Create folders, upload files and associate them with a project when its team needs access.',
      ],
      [
        'Deschide Share și alege Only me, Project access, Everyone in this workspace sau Specific people.',
        'Open Share and choose Only me, Project access, Everyone in this workspace or Specific people.',
      ],
      [
        'Pentru parteneri externi, invită întâi un cont guest, apoi selectează persoana explicit. Revino în Share pentru a modifica sau retrage accesul.',
        'For external partners, invite a guest account first, then select that person explicitly. Return to Share to change or revoke access.',
      ],
    ],
    note: [
      'Partajarea explicită oferă citire/descărcare. Nu există linkuri publice anonime; copiile deja descărcate nu pot fi retrase.',
      'Explicit sharing grants read/download access. There are no anonymous public links; downloaded copies cannot be revoked.',
    ],
  },
  {
    id: 'team-space',
    app: 'hub',
    category: 'team',
    title: 'Team space',
    summary: [
      'Publică ghiduri interne, politici și anunțuri cu imagini.',
      'Publish internal guides, policies and announcements with images.',
    ],
    steps: [
      [
        'Selectează New page, scrie titlul și alege categoria.',
        'Select New page, enter a title and choose the category.',
      ],
      [
        'Alege proiectul sau Everyone in workspace. Formatează textul cu titluri și liste; Insert image adaugă o imagine locală.',
        'Choose a project or Everyone in workspace. Format text with headings and lists; Insert image adds a local image.',
      ],
      [
        'Apasă Publish page. Deschide Edit pentru actualizări și verifică pagina după salvare.',
        'Press Publish page. Use Edit for updates and review the page after saving.',
      ],
    ],
    note: [
      'Imaginile sunt redimensionate înainte de includere. Conținutul activ și imaginile externe de tracking sunt eliminate.',
      'Images are resized before embedding. Active content and external tracking images are removed.',
    ],
  },
  {
    id: 'projects',
    app: 'projects',
    category: 'team',
    title: 'Projects & Kanban',
    summary: [
      'Leagă echipa, sarcinile și orele de același proiect.',
      'Connect the team, tasks and hours to the same project.',
    ],
    steps: [
      [
        'Creează un proiect cu nume, client, PO și detaliile comerciale permise rolului tău. Selectează mai mulți membri ai echipei.',
        'Create a project with a name, client, PO and commercial details allowed by your role. Select multiple team members.',
      ],
      [
        'Folosește New task sau adaugă o sarcină într-o coloană. Completează responsabilul, prioritatea, termenul și descrierea.',
        'Use New task or add a task in a column. Set assignee, priority, due date and description.',
      ],
      [
        'Mută cardurile între Backlog, In progress, In review și Done. Pe tastatură sau telefon poți folosi selectorul de status.',
        'Move cards between Backlog, In progress, In review and Done. Keyboard and touch users can use the status selector.',
      ],
    ],
    note: [
      'Tarifele și salariile nu sunt publice pentru toți membrii. Costurile individuale se configurează separat de administrator.',
      'Rates and salaries are not public to every member. Individual costs are configured separately by an administrator.',
    ],
  },
  {
    id: 'connect',
    app: 'chat',
    category: 'team',
    title: 'Connect',
    summary: [
      'Conversații, canale, fișiere și apeluri într-un spațiu comun.',
      'Conversations, channels, files and calls in one shared space.',
    ],
    steps: [
      [
        'Deschide o conversație directă sau creează un canal/grup și adaugă participanții. Partenerii externi folosesc invitații guest.',
        'Open a direct conversation or create a channel/group and add participants. External partners use guest invitations.',
      ],
      [
        'Scrie mesaje formatate, cod, emoji sau atașează imagini, GIF-uri, fișiere și foldere. Preview îți arată formatarea înainte de trimitere.',
        'Write formatted messages, code and emoji or attach images, GIFs, files and folders. Preview shows formatting before sending.',
      ],
      [
        'Folosește telefonul/camera pentru apel. În apel poți controla microfonul, camera și partajarea ecranului. Open in window oferă o fereastră dedicată.',
        'Use phone/camera controls to call. In a call, control the microphone, camera and screen sharing. Open in window gives you a dedicated window.',
      ],
    ],
    note: [
      'Administratorii pot revizui conversațiile, iar revizuirea este auditată. Linkurile Teams/Meet deschid furnizorul extern; nu transformă contul local într-un cont Microsoft/Google.',
      'Administrators can review conversations; reviews are audited. Teams/Meet links open the external provider, not a federated Microsoft/Google identity.',
    ],
  },
  {
    id: 'mail',
    app: 'mail',
    category: 'team',
    title: 'Mail',
    summary: [
      'Mesaje, ciorne, atașamente și urmărirea trimiterii.',
      'Messages, drafts, attachments and sending status.',
    ],
    steps: [
      [
        'Deschide New message și completează To, opțional CC/BCC, subiectul și mesajul. Folosește formatarea și preview-ul.',
        'Open New message and enter To, optional CC/BCC, subject and message. Use formatting and preview.',
      ],
      [
        'Adaugă atașamente, apoi salvează o ciornă sau trimite. Mesajele interne ajung în conturile active ale organizației.',
        'Add attachments, then save a draft or send. Internal messages reach active organisation accounts.',
      ],
      [
        'Folosește Inbox, Sent, Drafts, Starred și Trash. Reply răspunde; Forward creează inclusiv copii ale atașamentelor.',
        'Use Inbox, Sent, Drafts, Starred and Trash. Reply answers a message; Forward also copies attachments.',
      ],
    ],
    note: [
      'Trimiterea externă cere SMTP; primirea externă cere gateway configurat. Acceptarea de către SMTP nu confirmă livrarea în inbox. Nu există sincronizare IMAP/Exchange.',
      'External sending requires SMTP; receiving requires a configured gateway. SMTP acceptance does not confirm inbox delivery. IMAP/Exchange sync is unavailable.',
    ],
  },
  {
    id: 'calendar',
    app: 'calendar',
    category: 'team',
    title: 'Calendar & Meetings',
    summary: [
      'Planifică întâlniri și intră în apel la momentul potrivit.',
      'Schedule meetings and join calls at the right time.',
    ],
    steps: [
      [
        'În Calendar, creează o întâlnire cu titlu, început, sfârșit și participanți.',
        'In Calendar, create a meeting with a title, start, end and attendees.',
      ],
      [
        'Verifică fusul orar și accesul participanților. Deschide întâlnirea și intră în apel din browser.',
        'Check the time zone and participant access. Open the meeting and join from your browser.',
      ],
      [
        'Permite accesul la microfon/cameră când dorești să le folosești. Selectează dispozitivele preferate și verifică mute/camera înainte de discuție.',
        'Allow microphone/camera access when you want to use them. Select preferred devices and check mute/camera before talking.',
      ],
    ],
    note: [
      'Apelurile au maximum șase participanți. În afara rețelei locale pot fi necesare HTTPS și TURN configurate de operator.',
      'Calls support up to six participants. Outside the local network, operator-configured HTTPS and TURN may be needed.',
    ],
  },
  {
    id: 'time',
    app: 'timesheets',
    category: 'manage',
    title: 'Timesheets & Time off',
    summary: [
      'Pontează munca și gestionează absențele în același calendar.',
      'Log work and manage absences in the same calendar.',
    ],
    steps: [
      [
        'În Time entries → Log time, alege proiectul, data și activitatea: office, home, training sau alt tip de muncă.',
        'In Time entries → Log time, choose the project, date and activity: office, home, training or other work.',
      ],
      [
        'Pornește de la 8 ore și ajustează cu +/−, preseturi sau introducere directă. Adaugă descrierea; salvează Draft sau trimite pentru aprobare.',
        'Start with 8 hours and adjust with +/−, presets or direct input. Add a description; save a Draft or submit for approval.',
      ],
      [
        'Fill working week completează zilele selectate. Pentru absențe folosește Time off sau categoria de concediu din formular și urmărește aprobarea.',
        'Fill working week fills selected days. For absences use Time off or a leave category in the form, then track approval.',
      ],
    ],
    note: [
      'Concediul nu este înregistrat ca muncă facturabilă. Sărbătorile și concediile aprobate influențează capacitatea; absențele sunt pe zile întregi.',
      'Leave is not logged as billable work. Holidays and approved leave affect capacity; absences use full days.',
    ],
  },
  {
    id: 'people',
    app: 'organisation-map',
    category: 'manage',
    title: 'People map & Costs',
    summary: [
      'Vezi relațiile din echipă, proiectele și costurile permise rolului tău.',
      'See reporting lines, projects and costs allowed by your role.',
    ],
    steps: [
      [
        'În People map, caută o persoană, un departament sau o companie. Cardurile arată managerii și proiectele accesibile.',
        'In People map, search a person, department or company. Cards show reporting lines and accessible projects.',
      ],
      [
        'Folosește Connect pentru o discuție directă. Managerii sunt setați în Administration → People.',
        'Use Connect for a direct conversation. Managers are assigned in Administration → People.',
      ],
      [
        'Ca administrator, deschide Compensation & costs. Configurează salariul/tariful, moneda, data de aplicare și eventual un tarif diferit pe proiect.',
        'As administrator, open Compensation & costs. Set salary/rate, currency, effective date and an optional project-specific rate.',
      ],
    ],
    note: [
      'Costurile sunt estimări pe orele înregistrate, inclusiv ciorne. Nu sunt calcul salarial legal; monedele nu sunt convertite automat.',
      'Costs estimate recorded hours, including drafts. They are not statutory payroll; currencies are not automatically converted.',
    ],
  },
  {
    id: 'reports',
    app: 'reports',
    category: 'manage',
    title: 'Reports',
    roles: ['admin', 'manager'],
    summary: [
      'Transformă orele aprobate în rapoarte pentru client.',
      'Turn approved hours into client reports.',
    ],
    steps: [
      [
        'Verifică aprobarea pontajelor înainte de raportare.',
        'Check timesheet approvals before reporting.',
      ],
      [
        'În Reports, alege proiectul și perioada. Verifică orele, PO-ul, tarifele și totalurile pe monedă.',
        'In Reports, choose the project and date range. Check hours, PO, rates and currency totals.',
      ],
      [
        'Exportă CSV sau folosește print/PDF din browser pentru versiunea de trimis clientului.',
        'Export CSV or use browser print/PDF for the version you will send to the client.',
      ],
    ],
    note: [
      'Un raport de muncă nu este o factură fiscală. Facturarea România este o extensie separată.',
      'A work report is not a tax invoice. Romania billing is a separate extension.',
    ],
  },
  {
    id: 'nova',
    app: 'nova',
    category: 'start',
    title: 'Nova AI',
    summary: [
      'Caută informații, analizează date și primește ajutor cu surse.',
      'Find information, analyse data and get help with sources.',
    ],
    steps: [
      [
        'Deschide Nova AI din colțul din dreapta jos sau cu Ctrl/Cmd + J. Trage bara pentru mutare și colțul pentru redimensionare.',
        'Open Nova AI at the bottom right or with Ctrl/Cmd + J. Drag the header to move it and the corner to resize it.',
      ],
      [
        'Încearcă „Găsește bugetul proiectului” sau „Fă un grafic din B2:B8 în documentul Buget”. Salvează documentul înainte și verifică sursele/rezultatele.',
        'Try “Find the project budget” or “Chart B2:B8 in the Budget document”. Save the document first and check sources/results.',
      ],
      [
        'Alege specialistul potrivit. Poți atașa imagini dacă este configurat un model cu vision. Alertele de pontaj sunt accesibile și din bara de sus.',
        'Choose the appropriate specialist. Attach images when a vision model is configured. Attendance alerts are also available in the top bar.',
      ],
      [
        'Administratorul alege furnizorul/modelul din AI settings. Instrumentele web și MCP au nevoie de configurarea operatorului.',
        'An administrator selects the provider/model in AI settings. Web and MCP tools need operator configuration.',
      ],
    ],
    note: [
      'Fără model configurat, Nova oferă căutare locală explicită. Nu trimite automat emailuri și nu salvează modificări în locul tău.',
      'Without a configured model, Nova explicitly offers local search. It does not automatically send emails or save edits for you.',
    ],
  },
  {
    id: 'account',
    app: 'account',
    category: 'start',
    title: 'My account & Security',
    summary: [
      'Actualizează profilul și controlează accesul la cont.',
      'Update your profile and control account access.',
    ],
    steps: [
      [
        'Deschide My account pentru numele și detaliile profilului.',
        'Open My account for your name and profile details.',
      ],
      [
        'La schimbarea parolei, introdu parola actuală și una nouă de minimum 12 caractere. Celelalte sesiuni sunt revocate.',
        'To change your password, enter the current password and a new one of at least 12 characters. Other sessions are revoked.',
      ],
      [
        'Pe dispozitivul tău, bifează Keep me signed in la autentificare pentru o sesiune de 30 de zile. Pe un dispozitiv partajat, debifează și folosește Sign out.',
        'On your own device, check Keep me signed in for a 30-day session. On shared devices, leave it unchecked and use Sign out.',
      ],
    ],
    note: [
      'Dacă ai uitat parola, cere resetarea administratorului. Folosește consecvent aceeași adresă a aplicației; localhost și 127.0.0.1 au cookie-uri distincte.',
      'If you forget your password, ask an administrator to reset it. Use the same app address consistently; localhost and 127.0.0.1 have separate cookies.',
    ],
  },
  {
    id: 'administration',
    app: 'admin',
    category: 'manage',
    title: 'Administration & Audit',
    roles: ['admin'],
    summary: [
      'Gestionează conturi, calendare, acces și configurarea organizației.',
      'Manage accounts, calendars, access and organisation settings.',
    ],
    steps: [
      [
        'Adaugă persoane cu rolul minim necesar. Configurează managerii, proiectele și calendarul de lucru.',
        'Add people with the minimum necessary role. Configure managers, projects and working calendars.',
      ],
      [
        'Actualizează zilele libere și alocațiile de concediu pentru anii următori. Verifică politica de reportare în noul an.',
        'Update holidays and leave allowances for future years. Check the carryover policy for the new year.',
      ],
      [
        'Folosește resetarea parolei sau dezactivarea contului când este necesar. Deschide Audit log pentru acțiunile înregistrate și verificarea lanțului de hash-uri.',
        'Use password reset or account deactivation when needed. Open Audit log for recorded actions and hash-chain verification.',
      ],
    ],
    note: [
      'Auditul nu înlocuiește backup-ul. Configurarea producției, copiile de siguranță și politicile de acces rămân responsabilitatea operatorului.',
      'Auditing does not replace backups. Production configuration, backups and access policies remain the operator’s responsibility.',
    ],
  },
  {
    id: 'romania',
    app: 'billing',
    category: 'manage',
    title: 'Billing · România / SPV',
    roles: ['admin', 'manager'],
    optional: true,
    summary: [
      'Extensie separată pentru clienți, furnizori, facturi și integrarea ANAF.',
      'A separate extension for customers, suppliers, invoices and ANAF integration.',
    ],
    steps: [
      [
        'Folosește branch-ul feature/romania-spv. În Billing · RO configurează datele firmei și registrele de clienți/furnizori.',
        'Use the feature/romania-spv branch. In Billing · RO configure company details and customer/supplier registers.',
      ],
      [
        'Creează și verifică factura, emite documentul și exportă UBL. Urmărește încasările și facturile de plată.',
        'Create and check an invoice, issue it and export UBL. Track payments and payable invoices.',
      ],
      [
        'Configurează separat accesul ANAF și verifică fluxul în mediul potrivit înainte de folosirea reală a SPV.',
        'Configure ANAF access separately and verify the flow in the appropriate environment before using live SPV.',
      ],
    ],
    note: [
      'Modulul nu este inclus în main. Testele ANAF folosesc un simulator; acceptarea fiscală reală nu este certificată de aceste teste.',
      'This module is not included in main. ANAF tests use a simulator; they do not certify real tax-system acceptance.',
    ],
  },
];
