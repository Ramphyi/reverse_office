# Reverse Office — owned-code security review

Date: 2026-10-13. Scope: the local application and disposable localhost tests only. Flavor: ordinary code audit, not malware analysis or a penetration test of a third-party service.

The implementation was reviewed around identity, project authorization, workflow transitions, Office imports, signing, AI context and deployability. Initial dependency advisories were remediated by updating Nodemailer, overriding image-size/uuid to patched releases, replacing Mammoth with a bounded DOCX text importer, and replacing the JavaScript PKCS#12 signer with OpenSSL. The last recorded production npm audit reports no known vulnerabilities. This is a focused implementation review, not a certification or a guarantee that the code has no vulnerabilities.

## Scope and method

User authorization: build and test the supplied empty local repository. See [scope](../work/security-review/scope.md) and [route](../work/security-review/route-scope.md). The requested reverse-skill checkout was pinned at `cab634bd855fc287f6e420c1f36fd1a6b9245960`. The native router selected `skills/code-audit/SKILL.md` with high confidence. `case-init.ps1` established `own_system`, `lab_only`, ready-for-act scope. The native tool inventory was generated locally.

Methods actually used: manual control/data-flow review, targeted source searches, npm advisory audit, executable API/domain/import tests, OpenSSL signature verification and browser end-to-end tests. Semgrep and CodeQL were not run. No Microsoft, Adobe, Atlassian or ANAF system was scanned or attacked; no production credentials or customer data were used.

## Evidence → finding → implementation path

| Evidence                                                                         | Finding / result                                                                         | Path                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| API tests: unauthenticated requests, missing CSRF token, member admin access     | Requests fail with 401/403                                                               | `server/app.js`: authentication middleware and account routes |
| API tests: outsider project read/export/create attempts                          | Membership is enforced server-side; rate and approval snapshots are redacted for members | `readable`, `visible`, `ensureProject`                        |
| API tests: stale document version                                                | Conflicting saves return 409                                                             | `server/store.js`: version comparison and transaction         |
| API tests: oversubscribed daily hours, self-approval, submitted edit             | Invalid transitions and totals are refused                                               | `validateRefs`, `/api/approve/:kind/:id`                      |
| Domain/API tests: cross-year holidays, overlap, rollover, insufficient allowance | Leave uses per-year/project calendars and independent annual budgets                     | `server/domain.js`: `workingDays`, `leaveBalance`             |
| Formula tests and source review                                                  | No eval/Function; grammar, cycle and operation limits                                    | `evaluateCell`                                                |
| Import tests: text/data roundtrip and invalid archives                           | Memory/time bounded worker, archive size checks, no DTD/entities in DOCX                 | `server/import-safe.js`, `checkZipLimits`, `importOffice`     |
| OpenSSL certificate test                                                         | PDF detached CMS verifies; changing signed data invalidates it                           | `server/signing.js`, `tests/signing.test.js`                  |
| PDF tests                                                                        | Acknowledged copies retain original source hash and independent new hash                 | `/api/files/:id/sign`                                         |
| Audit SQL trigger and hash tests                                                 | Update/delete attempts fail; chain validates                                             | `server/store.js`, `/api/audit`                               |
| AI outsider-context test                                                         | Fallback and provider context are filtered by the same access policy                     | `/api/ai`                                                     |
| Dependency audit JSON                                                            | Zero known production dependency vulnerabilities at the recorded check                   | `work/security-review/dependency-audit.json`                  |
| Docker smoke                                                                     | Non-root, read-only container serves health/setup/state with temporary storage           | `Dockerfile`, `compose.yaml`                                  |

## Fixes made during verification

- Replaced advisory-affected import and signing libraries, rather than accepting the dependency findings as harmless.
- Added document-shape validation, formula operation limits, ZIP metadata checks and bounded import workers.
- Froze rates/currency/POs at approval and hid those snapshots from members.
- Restricted generic deletion to approved collections so future extension records cannot bypass their own workflows.
- Rechecked channel access before broadcasting messages; disabled accounts lose sockets and sessions. Meeting permissions are periodically rechecked.
- Prevented rewriting already certificate-signed PDFs; incremental countersigning is unsupported and clearly refused.
- Bundled fonts locally; the UI no longer contacts a third-party font CDN.
- Fixed a browser cleanup error, accessible form labels, quarter-hour input constraints and mobile grid overflow found by real browser tests.

## Residual limitations and deployment actions

- Use TLS, secure cookies, protected secrets and a trusted reverse proxy in production. Restrict host/volume access and retain backups and audit hashes externally.
- Add organizational identity/SSO/MFA, access reviews, account recovery, storage quotas, malware scanning and centralized security monitoring before exposing a large company instance.
- SQLite/local storage and process-local rate limits support one instance. Do not scale replicas without replacing those components.
- OpenSSL signing uses a server-side organization certificate, not an individual qualified-signature service. There is no timestamp authority or long-term validation integration.
- Mesh WebRTC needs TURN for network traversal and is limited to six participants. Physical camera/microphone and remote-network behavior require environment acceptance testing.
- AI sends accessible context to the configured provider. Drafts can be wrong; the assistant cannot execute operations. No external model was called during the baseline tests.
- External SMTP, real certificate trust chains, provider billing and real ANAF services need deployment credentials and separate acceptance tests.

## Reproduce

```text
npm ci
npm run build
npm test
npm run test:e2e
npm audit --omit=dev
docker build -t reverse-office:local .
```

See [architecture](ARCHITECTURE.md) for the trust-boundary diagram and [validation](VALIDATION.md) for execution status. Synthetic data and signing certificates are created in temporary test directories. No test password is a deployed default.
