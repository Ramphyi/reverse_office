# Office Studio — native editors, appearance and AI

The full editor mode integrates the unmodified, self-hosted ONLYOFFICE Docs Community 10.0.0 service. The app retains its own accounts, permissions, Drive, templates, revisions, audit, AI and PDF signature workflow. The document engine provides the Office editing UI and file conversion.

## Start with Docker

Run `./scripts/start-docker.ps1` from PowerShell 7. It creates the ignored `.env` if needed, generates independent setup and document-service secrets, builds the workspace and starts the `editors` profile. Existing accounts and files remain in the named volume. Open http://localhost:3001. On first use, create an administrator using the setup key from `.env`; there is no built-in username or password.

Manual equivalent after filling `.env.example`:

```powershell
docker compose --profile editors up -d --build
```

The editor loads fonts and starts PostgreSQL, RabbitMQ and its conversion workers on first boot. Wait for http://localhost:8082/healthcheck to return `true`. Allow approximately 4 GiB RAM for the editor container in addition to the workspace. Keep both services running when editing.

| Setting               | Purpose                                                     | Docker default                     |
| --------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `OFFICE_PUBLIC_URL`   | Browser-reachable editor URL                                | `http://localhost:8082`            |
| `OFFICE_INTERNAL_URL` | Workspace-to-editor requests                                | `http://documentserver`            |
| `OFFICE_APP_URL`      | Editor-to-workspace source and save callbacks               | `http://office:3001`               |
| `OFFICE_JWT_SECRET`   | Same secret in both services; at least 32 random characters | Generated locally, never committed |

For a host-run Node app with a Docker editor, use `OFFICE_INTERNAL_URL=http://localhost:8082`, `OFFICE_APP_URL=http://host.docker.internal:3001`, and bind the app to an interface the container can reach. `scripts/start.ps1` supplies these overrides. On Linux, configure a host-gateway mapping when using that hostname. Tests use port 3102 and isolated data.

For another computer, replace the public URL with a hostname that computer can reach, configure TLS on both sites, and change the loopback port binding intentionally. Do not put a Docker-only hostname in the browser URL.

## Editing workflows

Choose Writer, Sheets or Slides, then **Create new**. Choose a blank file or a native template, name it and choose private or project sharing. All template objects are editable. Import DOCX, XLSX or PPTX using the import action; the original native archive is stored intact rather than converted to the legacy editor's simplified JSON.

| Area       | Full editor workflow                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writer     | Font and paragraph styles, lists, tables, pictures, shapes, charts, equations, page size and margins, headers/footers, page numbers, references, comments, review tools and document protection through the editor ribbon. Native DOCX plus PDF, ODT, RTF and TXT export.                                                                                                        |
| Sheets     | Multiple worksheets, cell formatting, formulas/functions, charts, sorting/filtering, conditional formatting, validation, named ranges and data tools through the spreadsheet ribbon. Native XLSX plus PDF, CSV and ODS export. CSV is a single-sheet plain-data format.                                                                                                          |
| Slides     | Editable text boxes, shapes, images, charts, themes/layouts, transitions, animations, slide organization, notes and presentation mode. Native PPTX plus PDF and ODP export.                                                                                                                                                                                                      |
| PDF & Sign | Upload a PDF, open its preview and select **Edit PDF · full editor**. Use the PDF engine's text/image, annotation, form and page organization tools. Save, return to the preview, then use the existing electronic acknowledgement or certificate signing workflow. Signed certificate originals cannot be opened for editing because changes would invalidate their signatures. |

Use **Insert → Image → Image from File** inside the editor for local pictures. The app does not require public image hosting. Available features and compatibility follow the installed engine edition. There is no claim of complete desktop Microsoft Office or Acrobat parity; VBA, Power Query, proprietary plugins, OCR and qualified-signature issuance are not supplied by this integration.

Templates: blank document, business report, project proposal, meeting notes; blank workbook, budget planner, sales dashboard, project tracker; blank presentation, studio pitch, quarterly review and team workshop. Budget and sales templates contain real chart parts and linked formulas. Pitch and review decks contain editable charts and speaker notes. Example figures must be replaced with your own data.

## Save, history and exports

The editor autosaves changes to its editing service. The workspace **Save** button waits for that synchronization, requests a durable save and waits for its specific authenticated callback. The editing surface is temporarily blocked during this operation. On failure, the editor stays open with an error; it does not falsely report that saving succeeded.

Use Save before exporting or leaving. The Back button and export action save pending edits first. Browser close/navigation warnings help protect unsaved work; they cannot guarantee recovery after network loss or process failure. Each changed native file creates a revision and an audit record. The last 50 revisions are downloadable from **Version history**. Revisions are whole-file snapshots, not an Office track-changes diff. Files with no byte changes do not create a duplicate revision.

Native exports return the stored Office bytes. Other exports are rendered by the document engine, preserving the supported layout, charts and Unicode text. Font substitution and unsupported document features can affect fidelity: install the organization's legally licensed fonts in the document engine as needed. The legacy editor is still available when no engine is configured; its limited plain-text PDF export is unchanged. Native documents never fall back to destructive simplified editing.

## Dark mode and Ask AI

The top bar offers Light, Dark and System. Your choice persists in this browser. New editors inherit the current theme. For an already-open editor, **Apply dark/light to editor** saves first and reloads it with the requested theme. An explicit theme selected inside ONLYOFFICE can take priority; use its View settings to change that choice.

Ask AI provides Ask, Draft, Analyze and Explain modes, response tone, English/Romanian output, additional context, Markdown tables/code, copyable drafts, references and a wider panel. Ctrl+J opens/closes it. Conversation history is limited to the current open panel and is not a persistent chat archive.

Configure `AI_BASE_URL`, `AI_MODEL` and, when needed, `AI_API_KEY`. Without a provider the panel clearly shows **Workspace search mode** and performs search only. The selected provider receives accessible workspace data, recent conversation messages, optional pasted context and bounded XML excerpts from the saved native document. It does not receive an automatic live selection or image understanding. Save before asking about recent edits, or paste the relevant passage/formula. AI answers do not silently modify files or send messages.

## Security and storage

Source tickets and save callbacks use HS256 signatures. File access is checked against the current active account and project membership. Saved-file download URLs must have the configured engine origin and `/cache/` path; redirects are refused. Size limits are 25 MiB for uploads, 50 MiB for native saves and 50 MiB total declared uncompressed Office archive content. Native archives must contain the expected format parts. XML extraction runs in a worker with memory and time limits.

Native assets, revisions and session records are inside the workspace SQLite database, so existing database backups include them. Editor caches and its PostgreSQL files use separate named volumes. Stop editing, save and close all documents before backups or engine upgrades. Back up all volumes for operational recovery. Retaining 50 full revisions can consume significant disk space for image-heavy documents.

The editor container is a separate upstream multi-service image and does not use the app container's non-root/read-only hardening profile. JWT remains enabled. Private-address access is enabled so the engine can reach the internal callback app. Apply network rules appropriate to your environment and keep the engine updated.

## Kubernetes

In addition to `deploy/kubernetes.yaml`, apply `deploy/editors.yaml`. Replace `editors.example.com`, provision `editors-tls`, and set the four editor variables in the private `office-secrets` secret. The in-cluster callback URL is `http://office` because the Service exposes port 80. The browser URL must be HTTPS when the workspace uses HTTPS. Keep one replica for both supplied deployments. Ingress must support long-lived WebSockets. The document engine has a startup probe and a separate 20 GiB PVC. Cluster rollout requires your actual ingress, storage and DNS; local Docker/browser verification is not a Kubernetes deployment test.

## Upstream and licensing

ONLYOFFICE branding and upstream notices are retained. The container is distributed separately and unmodified. Consult the [DocumentServer source and license](https://github.com/ONLYOFFICE/DocumentServer), [Community edition FAQ](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx), and [Docker installation guide](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx) for licensing, supported platforms and current connection/edition limits. Commercial support, mobile editing and the Developer Automation API are not included by this project. This app does not call the paid `createConnector` API.

Integration references: [configuration](https://api.onlyoffice.com/docs/docs-api/usage-api/config/), [callbacks](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/), [conversion](https://api.onlyoffice.com/docs/docs-api/additional-api/conversion-api/request/). Microsoft, Adobe and ONLYOFFICE names identify compatibility targets or the actual upstream engine; no affiliation is claimed.

## Native integration tests

## Organisation, accounts and the work calendar

Administration → Organisation sets the organisation name, default working calendar, standard daily hours, timezone label, initial annual leave allowance and carryover limit. This deployment contains one organisation; it is not a multi-tenant SaaS or an organisation switcher. The timezone is stored as organisation metadata; date-only work/leave entries retain their exact selected date and browser date formatting is local. The company name appears in the sidebar. Existing allowances and approved records are not rewritten when defaults change.

Administration → People supports search and active/disabled filters. Add person creates an actual login account, department/job title, role, working-calendar assignment, project memberships and an allowance for the selected year in one transaction. The UI requires a personal password change by default at first sign-in. Share the temporary password through your own trusted channel; no invitation email is sent. Manage changes project access, employee details, role or active status and revokes the person's sessions. Reset password requires the administrator's current password and forces replacement of the new temporary password. Administrators cannot remove their own administrator access.

Every role has **My account** in the sidebar for changing display name and password. Password changes require the current password and matching confirmation, use a 12-character minimum, replace the current session and revoke other sessions. Temporary-password accounts cannot access workspace APIs or chat until they replace the temporary password. Password reset and account changes are audited; password values are not included in audit records.

**Timesheets** and **Time off** share a monthly calendar and remember its selected month. The timesheet list/totals and leave year follow the selected month. Select a day to see entries, pending/approved leave and holidays, log work, request leave, edit/delete an editable time entry or fill a working week. Managers can select an employee; ordinary members can only query their own work calendar. A project filter uses that project's calendar; otherwise the employee's assigned calendar or organisation default applies. Missing calendar years are explicitly marked and use Saturday/Sunday as the fallback weekend.

Fill working week creates a separate time entry for each entered day, either Draft or Submitted. Fill remaining capacity subtracts existing non-rejected hours and excludes approved full-day leave, holidays and weekends. All entries in a batch are saved or rejected together. Zero-hour fields are skipped; existing entries are never silently overwritten. Calendar CSV exports daily hours, capacity, holiday and leave information. Timesheet CSV remains available for detailed work records.

Leave is full-day. Approved leave prevents logging work on covered working days; work records prevent requesting or approving conflicting leave. Pending leave is visible but does not reduce capacity; logging work while a request is pending means the manager must resolve the conflict before approval. Approved work/leave requires another manager's review. A manager can cancel approved leave from the day's details with a reason, which restores capacity and allowance; the historical request and audit record remain. A cancellation is stored as a closed/rejected request with its cancellation reason. Holidays/weekends remain non-working capacity days, but explicit overtime is allowed. Daily total hours cannot exceed 24.

Administration → Calendars → Create next year copies the calendar identifier and weekend rules, **with an empty holiday list** so date-dependent holidays are configured intentionally. Annual allowances are maintained separately by person, calendar and year. The existing capped carryover calculation and cross-year approval checks remain in effect. This is capacity tracking, not a payroll or employment-law compliance engine.

In the native Sheets editor, select a rectangular range by dragging, Shift-clicking, or entering e.g. `A12:D12` in the name box. Home → Merge and center merges it; the drop-down also offers other merge/unmerge modes. Only the upper-left value is retained when merging. Clipboard paste accepts tab-separated rows and columns. The expandable spreadsheet help above the editor explains the controls. A real-engine browser test merges and unmerges `A12:D12`, pastes a 2×2 block, and verifies the exported XLSX XML. See the [upstream merge guide](https://helpcenter.onlyoffice.com/docs/userguides/spreadsheet_editor/MergeCells.aspx).

## Running the native integration tests

```powershell
npm run build
npm test
npm run test:e2e
docker compose --profile editors up -d documentserver
npx playwright test --config playwright.office.config.js
```

The native suite uses the real engine, temporary accounts and an isolated data directory. It covers editor opening, immediate save after typing, Office download contents, spreadsheet formulas/charts, presentation edits, PDF rendering and the appearance/assistant UI. Screenshots and traces stay in ignored `artifacts/` and `test-results/`.
