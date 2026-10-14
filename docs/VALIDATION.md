# Executed validation

## Independent workspace experience — 2026-10-14

Main passes the production TypeScript/Vite build, **83/83 backend tests**, **9/9 company browser scenarios** and **12/12 original Studio browser scenarios**. The Studio scenarios also pass against the rebuilt `scratch` Docker artifact on port 3002. Its source allowlist audit reports 11 original MIT components and zero issues; the full company image remains blocked and was not rebuilt.

New coverage verifies thirty-day remembered cookies and revocation, administrator-only effective compensation/project overrides, calendar-aware attendance visibility, independent PDF copies and page validation, forwarding private mail-attachment copies, safe external HTML formatting, chart output from authorized cells, MCP configuration/role/tool restrictions and live SSE result parsing/session cleanup. Added spreadsheet functions are exercised with conditional totals, exact lookup, statistics and bounded text.

The company browser flow publishes/reloads a page with an embedded image, persists accent settings and a salary, opens the organisation graph, imports an earlier native file as a separate Studio copy while comparing original DOCX bytes, rotates a PDF into a new file, switches unified time tabs, restores a remembered session and opens full-width Connect without the main sidebar. Existing account, sharing, mailbox, project, live chat and two-user WebRTC scenarios pass. Screenshots of the graph, Connect window and PDF controls were inspected; headless Chromium does not verify the native PDF viewer's rendered page pixels. API tests inspect resulting PDF bytes/page geometry.

Testing found and corrected the Nova launcher's overlap with Connect Send, a corrupt image fixture, a wrong legacy template fixture, a PDF control's missing exact accessible label and a fixed-port gateway test collision. The final Studio run uses an isolated ephemeral test gateway without touching the operator gateway. One earlier Studio run produced an empty initial page; the final development-host and Docker-host runs both passed all 12 scenarios without retries.

Provider/MCP/SMTP behavior uses deterministic fixtures. Live Brave searches, external MCP credentials, real mailbox delivery, model quality, Teams/Google federation, production certificate trust and ANAF live acceptance are not covered. Office/Acrobat parity and the strict full-suite licensing migration remain incomplete. See [current behavior and setup](WORKSPACE-EXPERIENCE.md).

## Workforce and usability upgrade — 2026-10-14

The base branch passed the production build, **31/31 backend tests, 3/3 workspace browser flows and 3/3 native Office browser flows**. Six new backend tests cover organisation permissions/versioning, atomic onboarding, temporary-password restrictions, password reset/session revocation, cross-year calendars, work/leave conflicts, cancellation, atomic weekly batches and employee data privacy. The new browser flow creates an organisation and employee, replaces the temporary password, changes the profile, approves leave, verifies the same leave in Timesheets, fills a five-day week and checks synchronized totals, dark appearance and 390px layout.

The real spreadsheet engine test selects `A12:D12`, merges it, verifies the XLSX merge element, unmerges it and verifies its removal. A 2×2 clipboard paste is checked through numeric cell values in the exported XLSX. Existing document, presentation, PDF, export and two-account coediting checks also passed. Screenshots: `artifacts/workforce-people.png`, `artifacts/workforce-calendar-dark.png`, `artifacts/workforce-calendar-mobile.png` and `artifacts/sheets-merged-range.png`.

Scope remains representative workflows rather than exhaustive upstream feature verification. Account invitations are shared temporary credentials, not outgoing email; one organisation is supported per deployment. Local browser tests use isolated databases and synthetic accounts.

## Office Studio upgrade — 2026-10-14

The native engine was tested as the actual `onlyoffice/documentserver:10.0.0` Docker image, with the Node test app on port 3102 and an isolated database. The following checks passed on the base branch:

| Check                              | Result                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Production TypeScript/Vite build   | Pass                                                                                                           |
| Backend suite                      | 25/25, including eight native-editor/template/AI/security tests                                                |
| Existing workspace/browser suite   | 2/2, including two-account chat/WebRTC                                                                         |
| Native Office browser suite        | 2/2 against the real Docker engine                                                                             |
| Native Writer                      | Immediate typing/save, DOCX contents, PDF rendering, ODT/RTF/TXT exports                                       |
| Native Sheets                      | Changed C4, D4 recalculated to 1000, chart retained, XLSX/PDF/CSV/ODS exports                                  |
| Native Slides                      | Added ninth slide, inserted local image, retained chart, PPTX/PDF/ODP exports                                  |
| Native PDF                         | Opened editing ribbon, inserted image, saved PDF image object, signed edited copy with acknowledgement         |
| Collaboration                      | Two distinct accounts share one engine session; exported DOCX contains both contributions                      |
| Appearance                         | Dark editor, dashboard and templates visually inspected; theme survives reload; Ask AI opens beside the editor |
| Dependency advisory check          | `npm audit --omit=dev`: 0 vulnerabilities                                                                      |
| Compose and Kubernetes editor YAML | Compose configuration validates; Kubernetes manifest parses/formats                                            |

Save tests exposed and fixed a race caused by forcing a save before the final keystrokes had synchronized. The final implementation waits for the editor event and correlates each completed callback with the requested save. Tests also cover an acknowledgement where the saved bytes have not changed.

The native suite is `npm run test:office`. A manually dispatched CI workflow is provided in `.github/workflows/native-editors.yml`; it has not been claimed as a remotely executed workflow. Screenshots are in ignored `artifacts/native-*.png` and `artifacts/dashboard-dark.png`.

These are representative end-to-end and security checks, not exhaustive verification of every upstream Office feature or every imported Microsoft file. The AI provider contract was tested with a local deterministic provider; a real model is not configured by the tests. Community edition limits, fonts, uncommon file features, live Kubernetes rollout and production certificate/ANAF trust remain environment-specific.

## Original baseline

Baseline verification date: 2026-10-13. Windows host, Node 22.18.0, production Vite build, Chromium through Playwright 1.64.0, Docker Desktop Linux engine 28.3.0.

| Check                                | Result                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run build`                      | Pass: TypeScript and optimized frontend build                                                |
| `npm test`                           | 17/17 pass: domain, permissions, workflows, file formats, bounded import, signing and audit  |
| `npm run test:e2e`                   | 2/2 pass: full workspace flow plus two-account chat/WebRTC                                   |
| DOCX/XLSX/PPTX/PDF exports           | Files generated and parsed/inspected in integration tests                                    |
| PKCS#12 signature                    | Self-signed test certificate, actual OpenSSL CMS verification; tampered payload rejected     |
| Mobile layout                        | Browser checks at 390×844, no horizontal page overflow                                       |
| Production dependency advisory audit | 0 known vulnerabilities at the recorded check                                                |
| Docker image build                   | Pass on Linux engine                                                                         |
| Hardened container smoke             | Pass: health, first-run setup, session and document state under non-root/read-only execution |
| Kubernetes YAML                      | Parsed namespace, PVC, deployment, service and ingress successfully                          |
| Live Kubernetes rollout              | Not run: no current Kubernetes context is configured                                         |

Browser coverage: initial admin setup, all navigation destinations, Writer edit/save/reopen, DOCX download, formula recalculation, slide presentation navigation, time logging, chat, assistant fallback, account creation, audit chain, mobile rendering, two independent authenticated users, real WebRTC peer establishment, mute/camera controls, screen-track replacement and leaving meetings.

Media tests use generated camera/microphone tracks. Screen selection is replaced by a deterministic canvas stream, while the real RTCPeerConnection track replacement runs normally. This verifies application signaling/media behavior, not a physical screen picker, corporate firewall traversal or a TURN deployment.

Screenshots are saved locally in ignored `artifacts/dashboard.png`, `artifacts/mobile.png` and `artifacts/meeting.png`. HTML and failure traces are in ignored `playwright-report/` and `test-results/`.

External AI model output, external SMTP delivery, production certificate trust/revocation/timestamping, storage disaster recovery and ANAF test/live acceptance require environment-specific credentials and were not claimed as tested. The base branch does not contain billing. The Romania branch records its additional validation separately.

The Vite build currently emits a large-bundle advisory for the combined editor bundle and non-fatal upstream comment annotations. These are recorded warnings, not build failures. Node 22 marks its SQLite module experimental; test coverage and pinned runtime requirements are included.

## Romania branch

Workforce upgrade, 2026-10-14: **40/40 backend tests, 4/4 workspace/Romania browser flows and 3/3 native Office browser flows** passed on `feature/romania-spv`. The base release image passed isolated non-root/read-only container checks for organisation updates, account creation, mandatory password replacement, weekly time entries, shared calendar totals and actual native spreadsheet-to-PDF conversion. Billing/ANAF remains isolated to this branch; no real ANAF submission was made.

Office Studio upgrade, 2026-10-14: the Romania branch passed the production build, **34/34 backend tests, 3/3 workspace/Romania browser flows and 2/2 native Office browser flows** against the actual Document Server. These include the native editing, export, image insertion and two-account collaboration checks described above. ANAF remains simulated. The base image also passed a fresh hardened-container setup and actual native spreadsheet-to-PDF conversion through Document Server.

After the baseline commit, `feature/romania-spv` passed **26/26 backend tests and 3/3 browser flows**. The `reverse-office:romania` Docker image built and passed authenticated billing writes under non-root/read-only execution. Printing generated `artifacts/invoice.pdf`; desktop/mobile screenshots are `artifacts/billing.png` and `artifacts/billing-mobile.png`. SPV/OAuth tests use an injected simulator and never contact ANAF. See [Romania workflow and evidence](ROMANIA.md).

## Productivity workflows — 2026-10-14

The main branch passes the production TypeScript/Vite build, **71/71 backend tests** and **8/8 workspace browser scenarios**. The seven new backend cases cover activity/leave separation and atomicity, project/task authorization, Drive sharing and revocation, BCC-safe drafts and attachments, SMTP envelope/TLS/acceptance semantics, gateway signatures/deduplication, and uncertain SMTP failure with preserved local delivery. After retaining sharing versions when reverting to project access, all seven productivity cases were rerun successfully.

The new browser scenario verifies 8-hour defaults and +/- controls, special-occasion requests, per-day weekly inputs, multiple project members, task drag/drop, named file downloads, draft persistence with attachments, internal delivery and replies between accounts. Desktop and 390px mobile dark-mode compose screenshots were inspected, alongside the wider weekly dialog. Existing workspace, WebRTC, AI, guest/chat and workforce scenarios also passed.

SMTP uses an injected transport in automated tests; external relay delivery, provider authentication and inbound adapter deployment have **not** been verified with live credentials. This release adds the gateway contract, not IMAP synchronization or Microsoft/Google OAuth. See [productivity and mail setup](PRODUCTIVITY.md) for supported behavior and limits.

No dependencies or distributed runtime components were added. The strict license gate remains blocked for the full company image. Functional validation and the isolated host development preview do not certify or redeploy that Docker distribution.


Romania productivity integration, 2026-10-14: `feature/romania-spv` passes the production build, **80/80 backend tests** and **9/9 browser scenarios**, including invoice issuance, UBL, payment, print and mobile billing. ANAF remains simulated; no live submission or distribution deployment was performed.
