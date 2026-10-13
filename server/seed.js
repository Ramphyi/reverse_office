export function seedWorkspace(store, user) {
  const year = new Date().getUTCFullYear();
  const project = store.put(
    'projects',
    {
      title: 'Workspace launch',
      client: 'Internal',
      po: 'RO-001',
      rate: 85,
      currency: 'EUR',
      budgetHours: 320,
      members: [user.id],
      calendarId: 'default',
      color: '#5b7860',
      status: 'Active',
    },
    user.id,
  );
  store.put(
    'calendars',
    { title: 'Company calendar', year, calendarId: 'default', holidays: [], weekend: [0, 6] },
    user.id,
  );
  store.put(
    'entitlements',
    { userId: user.id, year, days: 21, carryLimit: 5, calendarId: 'default' },
    user.id,
  );
  store.put(
    'channels',
    {
      title: 'general',
      description: 'A place to share ideas and keep everyone in the loop.',
      projectId: '',
    },
    user.id,
  );
  store.put(
    'channels',
    {
      title: 'workspace-launch',
      description: 'Everything we need to build our new workspace.',
      projectId: project.id,
    },
    user.id,
  );
  store.put(
    'documents',
    {
      title: 'Welcome to your connected workspace',
      kind: 'doc',
      projectId: project.id,
      folderId: '',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Great work starts here.' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'One workspace for your documents, projects, people and ideas. This is a real, editable document. Make it your own.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'A little less switching. A lot more doing.' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Create a project, invite your team, and connect your work. Your files stay on your infrastructure.',
              },
            ],
          },
        ],
      },
    },
    user.id,
  );
  store.put(
    'documents',
    {
      title: 'Project budget',
      kind: 'sheet',
      projectId: project.id,
      folderId: '',
      content: {
        cells: {
          A1: 'Workstream',
          B1: 'Hours',
          C1: 'Rate',
          D1: 'Total',
          A2: 'Discovery',
          B2: '24',
          C2: '85',
          D2: '=B2*C2',
          A3: 'Design',
          B3: '48',
          C3: '85',
          D3: '=B3*C3',
          A4: 'Engineering',
          B4: '120',
          C4: '85',
          D4: '=B4*C4',
          A6: 'Total',
          D6: '=SUM(D2:D4)',
        },
      },
    },
    user.id,
  );
  store.put(
    'documents',
    {
      title: 'A new way to work',
      kind: 'slides',
      projectId: project.id,
      folderId: '',
      content: {
        slides: [
          {
            title: 'Your work.\nBetter together.',
            body: 'Introducing a connected workspace for ambitious teams.',
          },
          {
            title: 'Less friction. More focus.',
            body: 'Documents, conversations and projects — all in one place.',
          },
          {
            title: 'Built around your team.',
            body: 'Private by design. Open formats. Ready for what comes next.',
          },
        ],
      },
    },
    user.id,
  );
  store.put(
    'tasks',
    {
      title: 'Make the workspace your own',
      description: 'Update your projects, create accounts and configure your company calendar.',
      projectId: project.id,
      status: 'In progress',
      priority: 'High',
      assignee: user.id,
    },
    user.id,
  );
  store.put(
    'tasks',
    {
      title: 'Share the first project brief',
      description: 'Create a document and share it with your project members.',
      projectId: project.id,
      status: 'Backlog',
      priority: 'Medium',
      assignee: user.id,
    },
    user.id,
  );
  store.put(
    'pages',
    {
      title: 'Welcome to the team',
      projectId: '',
      category: 'Announcement',
      content:
        'This is your company space. Share announcements, document decisions and build a library of knowledge together.',
    },
    user.id,
  );
}
