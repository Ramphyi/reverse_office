// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
import { bindFloating, prepareImage } from './floating.js';
import { searchDocuments, readSheet } from './search.js';
import { AGENTS, LOCAL_PROVIDERS, runLocalAgent, GATEWAY, aiRequest } from './agent.js';

// Model connections are opt-in and restricted to explicitly allowed loopback origins.
export function mountAssistant({ getDocuments, getCurrent, onOpen }) {
  const node = (tag, text = '', className = '') => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const button = (text, label, action) => {
    const e = node('button', text);
    e.type = 'button';
    e.setAttribute('aria-label', label);
    e.addEventListener('click', action);
    return e;
  };
  const launcher = button('✦ Ask AI', 'Open floating assistant', () => {
    panel.hidden = !panel.hidden;
    launcher.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });
  launcher.className = 'studio-ai-launcher';
  launcher.setAttribute('aria-expanded', 'false');
  const panel = node('aside', '', 'studio-assistant');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Workspace assistant');
  const header = node('header', '', 'studio-assistant-handle');
  header.tabIndex = 0;
  header.setAttribute('aria-label', 'Move assistant. Use arrow keys; Home resets position.');
  const brand = node('div');
  brand.append(node('strong', '✦ Ask AI'), node('small', 'LOCAL WORKSPACE TOOLS'));
  const close = () => {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  };
  header.append(
    brand,
    button('↗', 'Expand assistant', () => floating.reset()),
    button('−', 'Minimize assistant', close),
  );
  const intro = node(
    'p',
    'Search runs locally. Choose OpenAI or a local model in AI settings for specialist agents and image analysis.',
    'studio-ai-note',
  );
  const options = node('div', '', 'studio-ai-options'),
    select = node('select');
  select.setAttribute('aria-label', 'Assistant tool');
  for (const [id, label] of [
    ['search', 'Search all documents'],
    ['sheet', 'Search spreadsheet cells'],
    ['range', 'Read a cell range'],
    ...AGENTS.map(([id, name]) => ['agent:' + id, 'Agent · ' + name]),
  ]) {
    const option = node('option', label);
    option.value = id;
    select.append(option);
  }
  options.append(select);
  let connection = null,
    flight = null;
  const conversation = [];
  try {
    const saved = JSON.parse(localStorage.getItem('reverse-studio-model'));
    if (saved && (LOCAL_PROVIDERS.includes(saved.url) || (saved.gateway && saved.url === GATEWAY)))
      connection = saved;
  } catch {}
  const status = node('small');
  const showStatus = () => {
    status.textContent = connection ? 'Model: ' + connection.model : 'No model connected';
  };
  showStatus();
  function settings() {
    const dialog = node('dialog', '', 'studio-model-settings'),
      form = node('form');
    const title = node('h2', 'AI settings'),
      description = node(
        'p',
        'Choose the model used by all your agents. OpenAI receives requested document context and images when you send a message. Local models run on your computer.',
      );
    const provider = node('select');
    provider.setAttribute('aria-label', 'AI provider');
    for (const [value, label] of [
      ['local', 'Local model · Ollama / LM Studio'],
      ['openai', 'OpenAI'],
    ]) {
      const option = node('option', label);
      option.value = value;
      provider.append(option);
    }
    provider.value = connection?.provider === 'openai' ? 'openai' : 'local';
    const host = node('select');
    host.setAttribute('aria-label', 'Local model endpoint');
    for (const url of LOCAL_PROVIDERS) {
      const option = node('option', url);
      option.value = url;
      host.append(option);
    }
    host.value = LOCAL_PROVIDERS.includes(connection?.url) ? connection.url : LOCAL_PROVIDERS[0];
    const secure = node('input');
    secure.type = 'checkbox';
    secure.checked = !!connection?.gateway;
    const secureLabel = node('label', 'Use secure local gateway');
    secureLabel.prepend(secure);
    const pairing = node('input');
    pairing.type = 'password';
    pairing.autocomplete = 'off';
    pairing.setAttribute('aria-label', 'Gateway pairing code');
    pairing.placeholder = 'Pairing code from npm run studio:ai';
    pairing.value = sessionStorage.getItem('reverse-studio-pairing') || '';
    const pairingLabel = node('label', 'Gateway pairing code'),
      keyLabel = node('label', 'OpenAI API key');
    const key = node('input');
    key.type = 'password';
    key.autocomplete = 'new-password';
    key.setAttribute('aria-label', 'OpenAI API key');
    key.placeholder = 'Saved on server · leave blank to keep';
    const model = node('input');
    model.setAttribute('aria-label', 'Local model name');
    model.placeholder = 'Choose or enter an exact model ID';
    model.maxLength = 120;
    model.value = connection?.model || '';
    const list = node('datalist');
    list.id = 'studio-ai-models';
    model.setAttribute('list', list.id);
    const vision = node('input');
    vision.type = 'checkbox';
    vision.checked = !!connection?.vision;
    const visionLabel = node('label', 'This model supports images');
    visionLabel.prepend(vision);
    const message = node('p');
    message.setAttribute('role', 'status');
    const note = node(
      'small',
      'The gateway keeps your API key on this computer. Start it with npm run studio:ai. Test connection sends a short message and may incur provider charges.',
    );
    const removeKey = button('Remove saved API key', 'Remove saved API key', () =>
      action('remove'),
    );
    const save = node('button', 'Use local model');
    save.type = 'submit';
    const close = () => {
      key.value = '';
      dialog.close();
      dialog.remove();
    };
    let revision = connection?.revision || 0,
      loaded = false,
      busy = false;
    const usesGateway = () => provider.value === 'openai' || secure.checked;
    function render() {
      removeKey.hidden = provider.value !== 'openai';
      host.hidden = provider.value !== 'local';
      key.hidden = provider.value !== 'openai';
      keyLabel.hidden = key.hidden;
      pairingLabel.hidden = !usesGateway();
      secureLabel.hidden = provider.value === 'openai';
      pairing.hidden = !usesGateway();
      note.hidden = !usesGateway();
      save.textContent = usesGateway() ? 'Save AI settings' : 'Use local model';
      model.setAttribute(
        'aria-label',
        provider.value === 'openai' ? 'AI model' : 'Local model name',
      );
    }
    const draft = () => ({
      provider: provider.value,
      baseUrl: host.value,
      model: model.value.trim(),
      vision: vision.checked,
      apiKey: key.value || undefined,
      revision,
    });
    async function gateway(path, body) {
      return aiRequest(GATEWAY + path, body, undefined, pairing.value.trim());
    }
    async function load() {
      const config = await gateway('/settings', {});
      revision = config.revision;
      loaded = true;
      return config;
    }
    async function action(kind) {
      if (busy) return;
      busy = true;
      save.disabled = true;
      message.textContent = 'Connecting…';
      try {
        if (usesGateway() && !loaded) await load();
        if (kind === 'models') {
          const result = usesGateway()
            ? await gateway('/models', draft())
            : await aiRequest(host.value + '/models');
          const models = result.models || (result.data || []).map((m) => m.id);
          list.replaceChildren();
          for (const id of models.slice(0, 1000)) {
            if (typeof id !== 'string') continue;
            const option = node('option');
            option.value = id;
            list.append(option);
          }
          message.textContent =
            models.length + ' models loaded. Choose a model that supports chat and tools.';
        } else if (kind === 'test') {
          if (!model.value.trim()) throw Error('Choose a model first');
          if (usesGateway()) await gateway('/test', draft());
          else {
            const result = await aiRequest(host.value + '/chat/completions', {
              model: model.value.trim(),
              messages: [{ role: 'user', content: 'Reply with OK.' }],
              max_tokens: 20,
            });
            if (!result.choices?.[0]?.message) throw Error('Model did not return a chat response');
          }
          message.textContent = 'Connection successful: ' + model.value;
        } else {
          if (!model.value.trim() && kind !== 'remove') throw Error('Choose a model first');
          if (usesGateway()) {
            const config = await gateway('/save', { ...draft(), removeKey: kind === 'remove' });
            revision = config.revision;
            sessionStorage.setItem('reverse-studio-pairing', pairing.value.trim());
            connection = {
              url: GATEWAY,
              gateway: true,
              provider: config.provider,
              model: config.model,
              vision: config.vision,
              revision,
            };
          } else
            connection = {
              url: host.value,
              provider: 'local',
              model: model.value.trim(),
              vision: vision.checked,
            };
          key.value = '';
          localStorage.setItem('reverse-studio-model', JSON.stringify(connection));
          showStatus();
          select.value = 'agent:coordinator';
          submit.textContent = 'Send ↑';
          if (kind === 'remove') message.textContent = 'API key removed from gateway.';
          else close();
        }
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy = false;
        save.disabled = false;
      }
    }
    provider.onchange = () => {
      model.value = '';
      list.replaceChildren();
      key.value = '';
      vision.checked = false;
      render();
    };
    secure.onchange = render;
    pairing.oninput = () => {
      loaded = false;
    };
    form.append(
      title,
      description,
      node('label', 'Provider'),
      provider,
      host,
      secureLabel,
      pairingLabel,
      pairing,
      button('Connect gateway', 'Connect gateway', async () => {
        try {
          const config = await load();
          sessionStorage.setItem('reverse-studio-pairing', pairing.value.trim());
          if (['local', 'openai'].includes(config.provider)) {
            provider.value = config.provider;
            model.value = config.model;
            vision.checked = config.vision;
            if (LOCAL_PROVIDERS.includes(config.baseUrl)) host.value = config.baseUrl;
          }
          secure.checked = true;
          render();
          message.textContent = config.hasKey
            ? 'Connected · API key saved on server'
            : 'Connected · no API key saved';
        } catch (error) {
          message.textContent = error.message;
        }
      }),
      keyLabel,
      key,
      node('label', 'Model'),
      model,
      list,
      visionLabel,
      button('Load models', 'Load models', () => action('models')),
      button('Test connection', 'Test connection', () => action('test')),
      note,
      message,
      save,
      removeKey,
      button('Disconnect', 'Disconnect local model', () => {
        connection = null;
        localStorage.removeItem('reverse-studio-model');
        sessionStorage.removeItem('reverse-studio-pairing');
        showStatus();
        close();
      }),
      button('Cancel', 'Cancel model settings', close),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      action('save');
    };
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('cancel', close);
    render();
    dialog.showModal();
  }
  options.append(button('⚙ AI settings', 'Configure local AI', settings), status);
  const messages = node('div', '', 'studio-ai-messages');
  messages.setAttribute('aria-live', 'polite');
  const welcome = node('div', '', 'studio-ai-welcome');
  welcome.append(
    node('span', 'A LITTLE MOMENTUM'),
    node('h2', 'Your work.\nWithin reach.'),
    node(
      'p',
      'Search words, values and formulas across files saved in this browser. Open a workbook and choose “Read a cell range” to inspect A1:F20.',
    ),
  );
  messages.append(welcome);
  const form = node('form', '', 'studio-ai-composer'),
    previews = node('div', '', 'studio-ai-previews'),
    error = node('p', '', 'studio-ai-error');
  error.setAttribute('role', 'alert');
  const input = node('textarea');
  input.setAttribute('aria-label', 'Message to assistant');
  input.placeholder = 'Find a number, formula or phrase…';
  input.maxLength = 8000;
  let images = [];
  function renderImages() {
    previews.replaceChildren();
    for (const [index, image] of images.entries()) {
      const wrapper = node('div'),
        img = node('img');
      img.src = image.data;
      img.alt = image.name;
      wrapper.append(
        img,
        button('×', 'Remove image ' + (index + 1), () => {
          images.splice(index, 1);
          renderImages();
        }),
      );
      previews.append(wrapper);
    }
  }
  async function attach(files) {
    try {
      if (files.length + images.length > 3) throw Error('Attach at most three images.');
      images = [...images, ...(await Promise.all(files.map(prepareImage)))].slice(0, 3);
      renderImages();
      error.textContent =
        'Image ready. It is sent only with an agent message to a connected vision model; local search does not analyze images.';
    } catch (e) {
      error.textContent = e.message;
    }
  }
  const upload = node('input');
  upload.type = 'file';
  upload.multiple = true;
  upload.accept = 'image/png,image/jpeg,image/webp';
  upload.hidden = true;
  upload.setAttribute('aria-label', 'Attach images');
  upload.onchange = () => {
    attach([...upload.files]);
    upload.value = '';
  };
  const camera = node('input');
  camera.type = 'file';
  camera.accept = 'image/*';
  camera.setAttribute('capture', 'environment');
  camera.hidden = true;
  camera.setAttribute('aria-label', 'Take photo');
  camera.onchange = () => {
    attach([...camera.files]);
    camera.value = '';
  };
  const actions = node('div', '', 'studio-ai-actions');
  const submit = node('button', 'Search →');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Run assistant tool');
  select.onchange = () => {
    submit.textContent = select.value.startsWith('agent:') ? 'Send ↑' : 'Search →';
  };
  actions.append(
    button('＋ Image', 'Choose image', () => upload.click()),
    button('Camera', 'Choose camera photo', () => camera.click()),
    submit,
  );
  const stop = button('Stop', 'Stop assistant', () => flight?.abort());
  stop.hidden = true;
  actions.prepend(stop);
  form.append(previews, error, upload, camera, input, actions);
  async function run() {
    const query = input.value.trim();
    if (!query || flight) return;
    input.value = '';
    error.textContent = '';
    messages.append(node('p', query, 'studio-ai-question'));
    const output = node('div', '', 'studio-ai-result');
    messages.append(output);
    try {
      const current = getCurrent();
      if (select.value.startsWith('agent:')) {
        if (!connection)
          throw Error('Use Configure local AI to connect a tool-capable model first.');
        let documents = await getDocuments();
        if (current) documents = [current, ...documents.filter((d) => d.id !== current.id)];
        flight = new AbortController();
        const deadline = setTimeout(() => flight?.abort(), 90000);
        stop.hidden = false;
        submit.disabled = true;
        const steps = node('div', '', 'studio-agent-steps');
        output.append(steps);
        try {
          const result = await runLocalAgent({
            connection,
            agent: select.value.slice(6),
            prompt: query,
            images,
            documents: structuredClone(documents),
            currentId: current?.id,
            history: conversation,
            signal: flight.signal,
            onStep: (step) => {
              steps.append(
                node(
                  'small',
                  `${step.status === 'complete' ? '✓' : step.status === 'failed' ? '!' : '…'} ${step.agent} · ${step.tool} ${step.summary}`,
                ),
              );
              messages.scrollTop = messages.scrollHeight;
            },
          });
          output.append(node('p', result.text, 'studio-agent-answer'));
          for (const source of result.sources)
            output.append(
              button(
                source.title + (source.location ? ' · ' + source.location : ''),
                'Open ' + source.title,
                () =>
                  onOpen(source.id, source.location || '').catch((e) => {
                    error.textContent = e.message;
                  }),
              ),
            );
          conversation.push(
            { role: 'user', text: query },
            { role: 'assistant', text: result.text },
          );
          images = [];
          renderImages();
        } finally {
          clearTimeout(deadline);
          flight = null;
          stop.hidden = true;
          submit.disabled = false;
        }
      } else if (select.value === 'range') {
        if (current?.kind !== 'sheet') throw Error('Open a spreadsheet first.');
        const result = readSheet(current, current.sheets[current.activeSheet || 0].name, query);
        output.append(node('small', '✓ sheet_range · ' + result.sheet + '!' + result.range));
        const table = node('table');
        for (const cell of result.cells) {
          const row = node('tr');
          row.append(
            node('th', cell.address),
            node('td', String(cell.raw)),
            node('td', String(cell.value)),
          );
          table.append(row);
        }
        output.append(table);
      } else {
        let documents = await getDocuments();
        if (current) documents = [current, ...documents.filter((d) => d.id !== current.id)];
        const matches = searchDocuments(documents, query, {
          kind: select.value === 'sheet' ? 'sheet' : undefined,
        });
        output.append(
          node(
            'small',
            `✓ workspace_search · ${matches.length} matches${current ? ' · includes current open document' : ''}`,
          ),
        );
        if (!matches.length)
          output.append(node('p', 'No matches. Try a specific word or number from your file.'));
        for (const match of matches) {
          const link = button(
            match.title + ' · ' + match.location,
            'Open ' + match.title + ' at ' + match.location,
            async () => {
              try {
                await onOpen(match.id, match.location);
              } catch (e) {
                error.textContent = e.message;
              }
            },
          );
          output.append(link, node('p', match.excerpt));
        }
      }
    } catch (e) {
      output.append(
        node(
          'p',
          e.name === 'AbortError'
            ? 'Assistant stopped.'
            : e.message === 'Failed to fetch'
              ? 'Could not reach the local model. Check that it is running and allows this site through CORS.'
              : e.message,
        ),
      );
    }
    messages.scrollTop = messages.scrollHeight;
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    run();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  };
  panel.onkeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  panel.ondragover = (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  panel.ondrop = (e) => {
    e.preventDefault();
    attach([...e.dataTransfer.files]);
  };
  panel.onpaste = (e) => {
    if (e.clipboardData.files.length) {
      e.preventDefault();
      attach([...e.clipboardData.files]);
    }
  };
  const resize = button('◢', 'Resize assistant. Use arrow keys.', () => {});
  resize.className = 'studio-ai-resize';
  panel.append(header, intro, options, messages, form, resize);
  document.body.append(launcher, panel);
  const floating = bindFloating(panel, header, resize, 'reverse-studio-assistant-window');
}

export function mountNavigation(actions) {
  const key = 'reverse-studio-navigation';
  let preferences = { width: 232, hidden: [], order: [] };
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value && Array.isArray(value.hidden) && Array.isArray(value.order))
      preferences = {
        width: Math.max(180, Math.min(340, Number(value.width) || 232)),
        hidden: value.hidden,
        order: value.order,
      };
  } catch {}
  let open = false,
    editing = false,
    dragged = '',
    gesture = null,
    moved = false;
  const node = (tag, text = '', cls = '') => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = cls;
    return e;
  };
  const button = (text, label, action) => {
    const e = node('button', text);
    e.type = 'button';
    e.setAttribute('aria-label', label);
    e.onclick = action;
    return e;
  };
  const drawer = node('aside', '', 'studio-navigation');
  drawer.setAttribute('aria-label', 'Studio navigation');
  drawer.hidden = true;
  const launch = button('☰', 'Toggle Studio navigation', (event) => {
    if (event.detail === 0 || !moved) setOpen(!open);
    moved = false;
  });
  launch.className = 'studio-navigation-launch';
  launch.setAttribute('aria-expanded', 'false');
  const header = node('header');
  header.append(
    node('strong', 'Your workspace'),
    button('⚙', 'Customize Studio shortcuts', () => {
      editing = !editing;
      render();
    }),
    button('×', 'Close Studio navigation', () => setOpen(false)),
  );
  const nav = node('nav');
  nav.setAttribute('aria-label', 'Studio shortcuts');
  const settings = node('div', '', 'studio-shortcut-settings');
  const edge = node('div', '', 'studio-navigation-edge');
  edge.tabIndex = 0;
  edge.setAttribute('role', 'separator');
  edge.setAttribute('aria-label', 'Resize Studio navigation');
  edge.setAttribute('aria-orientation', 'vertical');
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {}
    render();
  };
  const order = () =>
    actions
      .map((a) => a.id)
      .sort((a, b) => {
        const rank = (id) =>
          preferences.order.includes(id)
            ? preferences.order.indexOf(id)
            : 100 + actions.findIndex((a) => a.id === id);
        return rank(a) - rank(b);
      });
  function reorder(id, target) {
    const list = order();
    if (id === target || !list.includes(id) || !list.includes(target)) return;
    list.splice(list.indexOf(id), 1);
    list.splice(list.indexOf(target), 0, id);
    preferences.order = list;
    save();
  }
  function draggable(row, id) {
    row.draggable = true;
    row.ondragstart = () => {
      dragged = id;
    };
    row.ondragover = (e) => e.preventDefault();
    row.ondrop = (e) => {
      e.preventDefault();
      reorder(dragged, id);
    };
  }
  function render() {
    drawer.style.width = preferences.width + 'px';
    nav.replaceChildren();
    settings.replaceChildren();
    settings.hidden = !editing;
    for (const id of order()) {
      const action = actions.find((a) => a.id === id);
      if (!preferences.hidden.includes(id)) {
        const link = button(action.symbol + '  ' + action.label, action.label, async () => {
          setOpen(false);
          try {
            await action.run();
          } catch (e) {
            alert(e.message);
          }
        });
        draggable(link, id);
        nav.append(link);
      }
      if (editing) {
        const row = node('div'),
          label = node('label'),
          check = node('input');
        check.type = 'checkbox';
        check.checked = !preferences.hidden.includes(id);
        check.setAttribute('aria-label', 'Show ' + action.label);
        check.onchange = () => {
          preferences.hidden = check.checked
            ? preferences.hidden.filter((x) => x !== id)
            : [...preferences.hidden, id];
          save();
        };
        label.append(check, document.createTextNode(action.label));
        row.append(label);
        for (const [symbol, delta, direction] of [
          ['↑', -1, 'up'],
          ['↓', 1, 'down'],
        ]) {
          const move = button(symbol, 'Move ' + action.label + ' ' + direction, () => {
            const list = order(),
              i = list.indexOf(id),
              j = i + delta;
            [list[i], list[j]] = [list[j], list[i]];
            preferences.order = list;
            save();
          });
          move.disabled =
            order().indexOf(id) + delta < 0 || order().indexOf(id) + delta >= actions.length;
          row.append(move);
        }
        draggable(row, id);
        settings.append(row);
      }
    }
    if (editing)
      settings.append(
        button('Restore defaults', 'Restore Studio shortcuts', () => {
          preferences = { width: 232, hidden: [], order: [] };
          save();
        }),
      );
  }
  function setOpen(value) {
    open = value;
    drawer.hidden = !value;
    launch.setAttribute('aria-expanded', String(value));
    if (!value) launch.focus();
  }
  for (const handle of [edge, launch]) {
    handle.onpointerdown = (e) => {
      if (e.button !== 0) return;
      gesture = { x: e.clientX, width: open ? preferences.width : 0 };
      moved = false;
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if (!gesture) return;
      const dx = e.clientX - gesture.x;
      if (Math.abs(dx) > 6) moved = true;
      if (!moved) return;
      setOpen(true);
      preferences.width = Math.max(70, Math.min(340, innerWidth - 30, gesture.width + dx));
      drawer.style.width = preferences.width + 'px';
    };
    handle.onpointerup = () => {
      if (!gesture) return;
      if (moved) {
        if (preferences.width < 150) {
          preferences.width = 232;
          setOpen(false);
        } else preferences.width = Math.max(180, preferences.width);
        save();
      }
      gesture = null;
    };
    handle.onpointercancel = () => {
      gesture = null;
      render();
    };
  }
  edge.onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      preferences.width = Math.max(
        180,
        Math.min(340, preferences.width + (e.key === 'ArrowLeft' ? -20 : 20)),
      );
      save();
    }
  };
  drawer.onkeydown = (e) => {
    if (e.key === 'Escape') setOpen(false);
  };
  drawer.append(
    header,
    nav,
    settings,
    node('p', 'Drag the edge to resize or tuck away.', 'studio-navigation-note'),
    edge,
  );
  document.body.append(drawer, launch);
  render();
}
