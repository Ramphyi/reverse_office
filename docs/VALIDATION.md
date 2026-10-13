# Executed validation

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
