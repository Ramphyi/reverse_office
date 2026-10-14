# Executed validation

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

Office Studio upgrade, 2026-10-14: the Romania branch passed the production build, **34/34 backend tests, 3/3 workspace/Romania browser flows and 2/2 native Office browser flows** against the actual Document Server. These include the native editing, export, image insertion and two-account collaboration checks described above. ANAF remains simulated. The base image also passed a fresh hardened-container setup and actual native spreadsheet-to-PDF conversion through Document Server.

After the baseline commit, `feature/romania-spv` passed **26/26 backend tests and 3/3 browser flows**. The `reverse-office:romania` Docker image built and passed authenticated billing writes under non-root/read-only execution. Printing generated `artifacts/invoice.pdf`; desktop/mobile screenshots are `artifacts/billing.png` and `artifacts/billing-mobile.png`. SPV/OAuth tests use an injected simulator and never contact ANAF. See [Romania workflow and evidence](ROMANIA.md).
