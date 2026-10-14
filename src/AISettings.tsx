import { useEffect, useState } from 'react';
import { api, type Item } from './api';
import { Sparkles } from 'lucide-react';

export function AISettings({ admin }: { admin: boolean }) {
  const [config, setConfig] = useState<Item | null>(null),
    [key, setKey] = useState(''),
    [models, setModels] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    api('/ai/settings')
      .then(setConfig)
      .catch((e) => setMessage(e.message));
  }, []);
  async function action(name: string, removeKey = false) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api('/ai/' + name, 'POST', {
        ...config,
        apiKey: key || undefined,
        removeKey,
      });
      if (name === 'settings') {
        setConfig(result);
        setKey('');
        setMessage(
          removeKey ? 'API key removed.' : 'AI settings saved. New conversations use this model.',
        );
      }
      if (name === 'models') {
        setModels(result.models);
        setMessage(
          `${result.models.length} models available. Choose one that supports chat and tools.`,
        );
      }
      if (name === 'test') setMessage('Connection successful: ' + result.model);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel account-card ai-settings-card">
      <Sparkles />
      <h2>AI settings</h2>
      <p>
        Choose the service and model used by every workspace agent. OpenAI sends requested context
        and images to OpenAI; local models use your configured server.
      </p>
      <p role="status">{message}</p>
      {config && (
        <fieldset disabled={!admin || busy}>
          <label>
            AI provider
            <select
              aria-label="AI provider"
              value={config.provider}
              onChange={(e) => {
                setConfig({
                  ...config,
                  provider: e.target.value,
                  baseUrl: 'http://127.0.0.1:11434/v1',
                  model: '',
                  vision: false,
                });
                setModels([]);
                setKey('');
              }}
            >
              <option value="disabled">Workspace search only</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local model (Ollama / LM Studio)</option>
              <option value="environment">Server environment</option>
              <option value="opencode">OpenCode server</option>
            </select>
          </label>
          {config.provider === 'local' && (
            <label>
              Local model endpoint
              <input
                aria-label="Local model endpoint"
                value={config.baseUrl}
                onChange={(e) => {
                  setConfig({ ...config, baseUrl: e.target.value });
                  setModels([]);
                }}
              />
            </label>
          )}
          {config.provider === 'openai' && (
            <label>
              OpenAI API key
              <input
                aria-label="OpenAI API key"
                type="password"
                autoComplete="new-password"
                value={key}
                placeholder={
                  config.hasKey ? 'Saved on server · leave blank to keep' : 'Enter your API key'
                }
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
          )}
          {['openai', 'local', 'environment'].includes(config.provider) && (
            <>
              <label>
                Model
                <input
                  aria-label="AI model"
                  list="company-ai-models"
                  value={config.model}
                  maxLength={120}
                  placeholder="Choose or enter an exact model ID"
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                />
                <datalist id="company-ai-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="ai-vision">
                <input
                  type="checkbox"
                  checked={config.vision}
                  onChange={(e) => setConfig({ ...config, vision: e.target.checked })}
                />{' '}
                This model supports images
              </label>
              <div className="ai-settings-actions">
                <button type="button" className="button" onClick={() => action('models')}>
                  Load models
                </button>
                <button type="button" className="button" onClick={() => action('test')}>
                  Test connection
                </button>
              </div>
              <small>
                Testing sends a short message and may incur provider charges. Loading models does
                not save changes.
              </small>
            </>
          )}
          <div className="ai-settings-actions">
            <button type="button" className="button primary" onClick={() => action('settings')}>
              Save AI settings
            </button>
            {config.provider === 'openai' && config.hasKey && (
              <button type="button" className="button" onClick={() => action('settings', true)}>
                Remove API key
              </button>
            )}
          </div>
        </fieldset>
      )}
      {!admin && <p>Only an administrator can change the organisation's AI provider.</p>}
    </section>
  );
}
