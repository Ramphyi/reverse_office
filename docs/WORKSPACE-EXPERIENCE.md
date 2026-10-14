# Workspace experience and independent editors

This release extends the company development preview with original MIT source. It adds no dependency. It does **not** remove the full company's runtime/dependency [distribution blockers](LICENSE-STATUS.md). The owner selected independent editors under the MIT/Apache policy; no ONLYOFFICE fork is included.

## Opening the current app

The isolated local company preview is `http://localhost:3003/?v=2026.10.14-workspace-2`. It uses `data/company-preview`, existing accounts and its own `ro_preview` cookie. This is separate from the earlier container on port 3001 and browser-local Studio on port 3002. Switching between `localhost` and `127.0.0.1` changes the cookie host; use one consistently.

Sign in with **Keep me signed in for 30 days on this device** checked. Previously issued eight-hour sessions are not silently extended; sign in once to obtain the new persistent session. Unchecked logins remain eight hours. Logout, administrator reset/disable and password rotation revoke sessions as before. Browser cookie deletion/private browsing still removes login state. Secure cookies require HTTPS and `COOKIE_SECURE=true` in production. A password change creates a fresh ordinary eight-hour session; log in again with Remember enabled for a new thirty-day session.

HTML responses use `Cache-Control: no-store` so new navigation receives the current asset bundle. Reload an old open tab after an update.

## Time, people and costs

- **Timesheets** is the single navigation destination, with **Time entries** and **Time off** tabs backed by the same workforce calendar. Work records and absence requests remain distinct because they have different billing and approval behavior. The legacy `?app=leave` link opens Timesheets.
- Add people with an optional monthly salary, currency, allocation hours and effective date. Manager assignment and project membership remain part of onboarding.
- **Administration → Compensation & costs** manages effective-dated default salaries/hourly costs and per-project overrides. Project overrides require that employee's membership. Rates are private admin records; ordinary user lists and AI workspace search do not expose them.
- Monthly salary divided by configured monthly allocation hours produces an estimated hourly cost. The report applies it to recorded, non-rejected hours, including drafts, and displays each entry's status. A project override takes precedence over the employee default. Changing a rate's identifying employee/project/effective date creates another effective record rather than deleting history.
- Explicit client hourly rates estimate billable revenue. Missing employee/client rates are flagged. Currencies remain separate; no exchange rate, tax, net/gross payroll or statutory calculation is implied.
- **People map** draws reporting lines with company/department and accessible assigned projects. Connect starts/opens a direct conversation. Visibility uses existing company and project permissions.

## Working in modules

Each module offers **Open in new tab** and **Open in window**. `?app=chat&window=1` opens Connect with the sidebar hidden and the available width devoted to conversations. Popup blockers may require a normal browser click. The shell includes an original icon and install manifest; **Install app** appears when the browser exposes its install prompt. This is a browser app window, not a packaged native executable or an offline company server.

The palette control changes the accent and comfortable/compact density, persisted in that browser. Existing dark/light themes and sidebar shortcut editing, hiding, reordering and resizing remain available. Nova's animated original CSS mascot respects reduced-motion preferences.

## Independent document and PDF workflows

New Writer, Sheets and Slides documents open in original Studio. Existing native DOCX/XLSX/PPTX records offer **Download original** and **Create editable Studio copy**. Import creates a separate document; original bytes and revisions remain unchanged. Complex layouts, macros, pivots and unsupported objects may not survive in the copy. Review imported output before using it.

Sheets adds SUMIFS, COUNTIFS, AVERAGEIF, AVERAGEIFS, MEDIAN, STDEV.S, STDEV.P, PRODUCT, INT, SIGN, ISNUMBER, ISTEXT, COUNTBLANK, TEXTJOIN, SUBSTITUTE, REPT and exact-match XLOOKUP. XLOOKUP supports forward/reverse search, not approximate/wildcard/binary modes. The existing range selection, merge, chart and Office export features are documented in [Studio](STUDIO.md). This remains a bounded spreadsheet engine, not all Excel functions or full OOXML round-trip compatibility.

**PDF & Sign → Edit PDF** opens an independent PDF tool panel. It can add text annotations, rotate/remove pages and fill existing text/checkbox fields. Every save creates a private copy with an audit entry, preserving the source. Signed copies cannot be edited. Annotation is an added text layer, not replacement or redaction. The built-in standard font supports Western Latin; extended Unicode fonts, OCR, existing-text editing, full form authoring and Acrobat parity are not implemented. The browser renders the preview; this feature does not bundle a PDF rendering engine. Existing acknowledgement and configured certificate-signing workflows are separate.

**Team space** supports bold/italic/underline, headings, lists and embedded PNG/JPEG/WebP images. Images are resized locally before embedding. Rendering uses the original strict HTML sanitizer; scripts, embedded frames, remote tracking images and active content are removed. Clipboard text is pasted as plain text. Saving uses existing project visibility and version checks.

Mail now forwards attachment copies as well as text, offers formatting controls and a preview, and sends escaped limited HTML alongside a plain-text alternative. See [mail setup](PRODUCTIVITY.md). External SMTP and inbound gateway credentials remain operator configuration, not a built-in Gmail/Exchange connection.

## Nova tools and configuration

The floating, movable/resizable assistant is named **Nova**. Existing seven agent roles and provider/model selection remain in Administration's AI settings. Image understanding requires a configured vision-capable model. No provider is silently enabled.

The 13 tool entry points are `workspace_search`, `read_document`, `sheet_range`, `delegate_agent`, `attendance_alerts`, `search_mail`, `project_tasks`, `list_files`, `upcoming_meetings`, `web_search`, `mcp_catalog`, `mcp_call` and `sheet_chart`. Saved workspace reads recheck account and resource permissions. Salary records are excluded. Chart output uses actual numeric cells, not model-invented values; up to 30 points are rendered as an SVG bar chart with a data table. MCP image results can be displayed as validated bounded inline PNG/JPEG/WebP; this does not itself provide an image-generation model.

The header's **Nova attendance alerts** works without an LLM. It checks the last seven completed calendar days, ignoring weekends, assigned-calendar holidays, approved leave and dates before the account was created. Members see themselves, managers themselves/direct reports, admins active internal employees. It refreshes while the app is open. It does not run a background scheduler, send email or push notifications.

For public web search, configure `BRAVE_SEARCH_API_KEY` on the server and restart. Searches use the fixed Brave endpoint, return up to five references and disclose query data to that provider. Without a key the tool reports that configuration is required.

For an operator-controlled MCP Streamable HTTP server, configure:

```text
NOVA_MCP_SERVERS=[{"id":"knowledge","url":"https://mcp.example.com/mcp","tokenEnv":"KNOWLEDGE_MCP_TOKEN","tools":["search","read_document"],"roles":["admin"]}]
KNOWLEDGE_MCP_TOKEN=<server-side secret>
```

The endpoint and credentials are operator-controlled; the model cannot supply arbitrary endpoints. HTTPS is required except explicit loopback HTTP. Roles default to admin; each callable tool must be explicitly allowlisted. Configure only tools whose data and actions are appropriate for all allowed users: the shared MCP service identity does not automatically inherit workspace document permissions. External tools can have side effects, so prefer read/search tools unless the operator intentionally authorizes a broader capability. Secrets are never returned in the catalog. **Discover allowed tools** in AI settings tests the configured server and shows its allowed input schemas.

The client initializes protocol 2025-03-26, supports JSON and SSE responses (including an open stream after the matching response), bounds response sizes, denies redirects and closes sessions. It does not launch local processes, install code, implement stdio/OAuth or dynamically create MCP servers. Tool results are untrusted context. A configured connector is a trusted integration boundary, not a sandbox for arbitrary server code.

Automated tests use deterministic provider, SMTP and MCP fixtures. Live model quality, Brave credentials, external MCP services, real mail delivery, native app packaging and provider federation are not claimed as validated.
