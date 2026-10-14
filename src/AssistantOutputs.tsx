// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { api, type Item } from './api';
export function AssistantOutputs({ artifacts = [] }: { artifacts?: Item[] }) {
  return (
    <>
      {artifacts.map((a, i) => {
        if (a.type === 'image' && /^data:image\/(png|jpeg|webp);base64,/.test(a.data))
          return (
            <img className="ai-output-image" key={i} src={a.data} alt={a.name || 'Tool output'} />
          );
        if (a.type !== 'chart') return null;
        const points = a.points.slice(0, 30);
        const scale = Math.max(1, ...points.map((p: Item) => Math.abs(p.value)));
        return (
          <figure className="ai-chart" key={i}>
            <figcaption>{a.title}</figcaption>
            <svg viewBox={`0 0 440 ${points.length * 24 + 20}`} role="img" aria-label={a.title}>
              {points.map((p: Item, j: number) => (
                <g key={j}>
                  <text x="0" y={j * 24 + 16} fill="currentColor" fontSize="11">
                    {p.label}
                  </text>
                  <rect
                    x={p.value < 0 ? 220 - (Math.abs(p.value) / scale) * 150 : 220}
                    y={j * 24 + 3}
                    width={(Math.abs(p.value) / scale) * 150}
                    height="17"
                    fill={p.value < 0 ? '#c87969' : '#689f91'}
                  />
                  <text x="375" y={j * 24 + 16} fill="currentColor" fontSize="10">
                    {Number(p.value.toFixed(2))}
                  </text>
                </g>
              ))}
            </svg>
            <details>
              <summary>Data</summary>
              <table>
                <tbody>
                  {points.map((p: Item, j: number) => (
                    <tr key={j}>
                      <td>{p.label}</td>
                      <td>{p.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </figure>
        );
      })}
    </>
  );
}
export function ConnectorSettings() {
  const [catalog, setCatalog] = useState<Item>({ servers: [] }),
    [result, setResult] = useState('');
  useEffect(() => {
    api('/ai/connectors')
      .then(setCatalog)
      .catch((e) => setResult(e.message));
  }, []);
  return (
    <section className="panel connector-settings">
      <h2>Nova tools & MCP</h2>
      <p>
        Public web search:{' '}
        {catalog.webSearch
          ? 'configured'
          : 'not configured — set BRAVE_SEARCH_API_KEY on the server'}
      </p>
      <p>
        To add a custom tool, run an MCP Streamable HTTP service and add its endpoint, explicit tool
        names and permitted roles to NOVA_MCP_SERVERS. Restart the server after configuration.
        Secrets stay in server environment variables.
      </p>
      <pre>
        {JSON.stringify(
          [
            {
              id: 'research',
              url: 'http://127.0.0.1:8765/mcp',
              tools: ['search'],
              roles: ['admin'],
              tokenEnv: 'RESEARCH_MCP_TOKEN',
            },
          ],
          null,
          2,
        )}
      </pre>
      {catalog.servers.map((s: Item) => (
        <div key={s.id}>
          <strong>{s.id}</strong> · {s.tools.join(', ')}{' '}
          <button
            className="button secondary"
            onClick={async () => {
              try {
                const v = await api('/ai/connectors/' + s.id + '/discover', 'POST', {});
                setResult(JSON.stringify(v, null, 2));
              } catch (e) {
                setResult((e as Error).message);
              }
            }}
          >
            Discover allowed tools
          </button>
        </div>
      ))}
      {result && <pre role="status">{result}</pre>}
    </section>
  );
}
