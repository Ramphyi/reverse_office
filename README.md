# Reverse Office

## Working independent editors

**Reverse Studio is available as a separate original-MIT artifact:** `docker compose -p reverse-studio -f compose.studio.yaml up -d --build`, then open **http://localhost:3002**. It provides usable Writer, Sheets and Slides editors, Office exports, local saves and dark mode. Its final `scratch` image contains only original code and browser assets. No login is needed; standalone documents stay in that browser. See [features, limits and deployment](docs/STUDIO.md).

The full company application described below still has unresolved runtime/dependency licenses and a blocked release. The standalone Studio does not imply that accounts, meetings, signing, AI or SPV have been migrated to a compliant distributed backend.

**Full company application release: blocked by the requested MIT/Apache-2.0-only license policy.** The current ONLYOFFICE, Node runtime, Debian image and several application dependencies do not meet that policy. The instructions below describe the previous, non-compliant implementation. Docker builds and the deployment script now stop at the license gate. The complete company suite has not yet been migrated; the standalone Studio above has a separate audited distribution. See [license status and migration blockers](docs/LICENSE-STATUS.md).

See [Nova, persistent sessions, independent editors, organisation graph and costs](docs/WORKSPACE-EXPERIENCE.md), [floating assistant, local AI, OpenCode and navigation setup](docs/ASSISTANT.md), and [time logging, project teams, Drive permissions and mail setup](docs/PRODUCTIVITY.md).

A self-hosted company workspace with a consistent modern UI: writing, spreadsheets, presentations, files, PDF signing, chat, meetings, projects, timesheets, leave, company knowledge, mail and an accessible AI sidebar.

**This is an independent, functional foundation, not a complete reimplementation of Microsoft 365, Adobe Acrobat, Jira or SharePoint.** It uses public formats and original application code. No proprietary binaries were supplied or decompiled. See the exact capability boundaries below before adopting it for production.

## Independent office editors

New documents open in the original MIT Studio editors. Existing native documents offer **Create editable Studio copy**, preserving the original bytes and history. The independent PDF workspace adds annotations, page rotation/removal and existing form-field filling. These are working features with explicit compatibility limits, not Office/Acrobat feature parity. The previous ONLYOFFICE guide and integration code are historical; they are not the selected editor path and no AGPL fork is being made.

## Start locally

Requires Node.js 22.18+ (with `node:sqlite`) and npm.

```powershell
cd D:\Coding\reverse_office\reverse_office
npm ci
npm run build
npm start
```

Open **http://localhost:3001**. The server prints a random first-run setup key. Enter it in the setup screen and create your administrator account with a password of at least 12 characters. There are no default credentials. Setup closes permanently after the first account is created.

Alternatively, `./scripts/start.ps1` creates an ignored `.env` with a random setup key, builds if needed and starts the app. To load a configured `.env` manually:

```powershell
node --env-file=.env server/index.js
```

For development, `npm run dev` runs the API on 3001 and Vite on 5173. SQLite and uploads live in `data/`; restart the server without losing data. The initial workspace contains editable sample documents and an internal project, clearly intended as starting content.

## What works

The current company preview integrates the original Studio editors and the following workflows. See the linked guides for tested behavior and limitations.

| Area                     | Implemented behavior                                                                                                               | Boundary                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Writer / Sheets / Slides | Original editors, formatted text, images, tables, multi-sheet cells/formulas/charts, slide objects and Office-format import/export | [Studio feature matrix](docs/STUDIO.md); incomplete fidelity, no macros, pivots, tracked changes or full Office parity |
| PDF & Sign               | Annotation copies, rotate/remove pages, fill text/checkbox fields, acknowledgement and configured PKCS#12 signing                  | No existing-text replacement, redaction, OCR or qualified-signature claim; built-in PDF font is Western Latin          |
| Team space               | Rich text, embedded images, knowledge/policy pages, project visibility                                                             | Sanitized HTML; no simultaneous collaborative editing                                                                  |
| Connect / Meetings       | Full module window, channels/groups/DMs, guests, attachments, formatted messages, audio/video and screen sharing                   | Mesh up to six peers; HTTPS/TURN for remote calls; provider meeting links are not Teams/Google account federation      |
| Mail                     | Inbox/Sent/Drafts/Starred/Trash, To/CC/BCC, reply/forward including attachments, formatting preview, safe HTML SMTP alternative    | SMTP and signed inbound gateway need configuration; no IMAP or Exchange synchronization                                |
| Drive                    | Nested folders, uploaded files, specific-person/guest/workspace sharing                                                            | Local volume; read/download shares, no anonymous links or desktop sync                                                 |
| Projects / Time          | Multiple project members, Kanban, 8-hour controls, activity types, unified Timesheets/Time off calendar                            | Full-day leave; approvals and conflicts enforced; no legal entitlement or payroll calculation                          |
| Administration           | Accounts, manager hierarchy, passwords/reset, audit log, effective salary/project rates, recorded-time cost estimates              | One company per deployment, no OIDC/MFA; currencies kept separate                                                      |
| Nova                     | Seven agent roles, 13 tools, saved-cell charts, attendance reminders, configured web/MCP tools, image attachments/results          | Provider/tool credentials required; no automatic mail sending, unattended actions or built-in image generation         |
| Application shell        | Dark mode, accent/density settings, editable/resizable sidebar, module tabs/windows, browser install manifest                      | Browser-local preferences; no native executable or offline company backend                                             |

The full company artifact remains blocked by the strict license policy. These functional improvements do not certify the existing dependency/runtime distribution.

## Configure integrations

Copy `.env.example` to `.env` and set only the services you use. Secrets stay on the server. The Administration screen reports configuration presence; presence is not a connectivity check.

- **Local AI:** run Ollama and set `AI_BASE_URL=http://localhost:11434/v1`, `AI_MODEL` to an installed model. With Compose use `http://ollama:11434/v1`. For another compatible provider, also set `AI_API_KEY`. The selected provider receives the user's accessible workspace context.
- **SMTP:** set host, port, credentials and sender. Use 465 with `SMTP_SECURE=true` for implicit TLS, or 587 with STARTTLS. Only one configured transport exists per deployment.
- **WebRTC:** set `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` to your relay; use HTTPS outside loopback. Without TURN, connectivity depends on local network routing. Camera/microphone and screen sharing always require browser permission.
- **Digital PDF signing:** mount a PKCS#12 certificate, set `PDF_P12_PATH`, `PDF_P12_PASSPHRASE` and optionally `OPENSSL_BIN`. Docker includes OpenSSL. On Windows, configure the exact installed executable path. The signature belongs to the configured organization certificate; the user's identity is recorded in the acknowledgement page and audit.

## Docker

```powershell
Copy-Item .env.example .env
# Set SETUP_KEY and OFFICE_JWT_SECRET to separate long random values in .env.
docker compose up --build -d
docker compose logs office
```

The service binds **127.0.0.1:3001** and persists data in the `office-data` named volume. It runs as an unprivileged user with a read-only root filesystem, dropped capabilities and resource limits. To enable the optional local AI service:

```powershell
docker compose --profile ai up -d
docker compose exec ollama ollama pull qwen2.5:7b
```

Set `AI_BASE_URL=http://ollama:11434/v1` in `.env` and recreate the office service. Downloading a model uses additional disk and memory. Certificate mounts must be added as read-only volume mounts in a Compose override; secrets/certificates are intentionally not bundled.

## Kubernetes

`deploy/kubernetes.yaml` supplies a namespace, 20 GiB PVC, single-replica deployment, service and TLS ingress. Build and push the image to your registry, replace the image reference and `office.example.com`, and provision `office-tls` using your cluster certificate process.

```powershell
kubectl create namespace reverse-office
# Make a private copy of deploy/secrets.example.yaml, replace the setup key and credentials.
kubectl apply -f path/to/private-secrets.yaml
kubectl apply -f deploy/kubernetes.yaml
kubectl -n reverse-office rollout status deployment/office
```

For a local cluster, load `reverse-office:local` into the cluster image store. Do not apply the example secret without replacing it. Set ingress class to your installed controller. WebSocket upgrades must be supported by the ingress. Configure restricted ingress/egress according to the SMTP, AI and TURN services you choose.

**Keep replicas at one.** SQLite, local files, process-local rate limits and Socket.IO room membership are deliberately a single-instance design. Horizontal scaling requires PostgreSQL, object storage and a shared Socket.IO adapter. A manifest is not proof of a successful deployment on your cluster.

## Backup and recovery

Stop the application, then run `node scripts/backup.js <new-backup-directory>`. Back up the SQLite snapshot and `files/` together, encrypt the backup and retain it outside the host. Restore both into an empty data directory with the application stopped. Keep the deployment secrets and signing certificate in a separate secure recovery process. Export audit head hashes periodically to independent storage; a host administrator can replace the entire database.

## Tests

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

The unit/integration tests use temporary databases and synthetic data. Certificate verification uses OpenSSL; set `OPENSSL_BIN` if it is not on PATH. Browser checks use a separate ignored data directory and produce screenshots in `artifacts/`. CI is in `.github/workflows/ci.yml`. See `docs/VALIDATION.md` for the actual executed results and external-service gaps.

## Romania branch

The stable workspace is on `main`. The separate `feature/romania-spv` branch is created only after the base checks. It adds customers/suppliers, sales and payable invoices, UBL generation and an ANAF adapter. Live ANAF submission requires enrolled credentials and an organization certificate. No invoices are transmitted merely by starting this application.

## Architecture and security

See [architecture](docs/ARCHITECTURE.md), [security review](docs/2026-10-13-code-audit-reverse-office-report.md), and [validation](docs/VALIDATION.md).

The requested [reverse-skill](https://github.com/zhaoxuya520/reverse-skill) was cloned to the sibling `reverse-skill-reference` folder and routed to `code-audit`. Its scope and evidence artifacts live under `work/security-review`. It was used for the owned-code security workflow, not for bypassing commercial products or reproducing their proprietary code.

### AI provider settings

Choose the provider and model in **Administration → AI settings** (company) or
**Ask AI → AI settings** (Studio). Supports OpenAI API keys stored on the server and
local OpenAI-compatible models, with model listing and connection tests. Studio uses
an optional paired host gateway for OpenAI: `npm run studio:ai`. No new npm dependencies
or model runtimes are bundled. See [setup and key storage](docs/ASSISTANT.md#choose-a-provider-and-model-in-settings).

Reporting lines, private rich chat, file/folder attachments, audio/video calls and preferred devices: [setup and behavior](docs/COLLABORATION.md).
