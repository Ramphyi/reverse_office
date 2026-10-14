# Reverse Studio — independently implemented editors

The standalone Studio is a working first release of three original MIT editors. It is not a complete replacement for Microsoft 365 or the company backend. It shares no code, branding, icons or bundled fonts with Microsoft, Adobe or ONLYOFFICE. The original source and license are included in this repository.

## Run and use it

```powershell
docker compose -p reverse-studio -f compose.studio.yaml up -d --build
```

Open **http://localhost:3002**. No account is required. The standalone Studio stores documents in **IndexedDB in that browser and origin**, on that device. `localhost` and `127.0.0.1` have different storage. Clearing browser data removes these documents. Export Studio JSON backups and/or Office files. Imported files retain a separate original download in the same browser storage.

The existing company app at port 3001 has its existing accounts and data. Its deployed image remains the previous implementation and is not certified under the strict policy. The updated repository integrates Studio into **new** Writer/Sheets/Slides creation, with authenticated server saves, existing ACLs and version conflicts; its full-image release is still blocked by the remaining backend/runtime license issues. Native Office files and revisions are not converted or overwritten by this change.

For development only, `npm run studio:dev` serves the same browser assets on port 3104. Node and npm here are host development tools, not parts of the standalone distributed container.

## Implemented workflows

| Editor | Usable features                                                                                                                                                                                                                                                                               | Exports                                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writer | Rich text; headings; font family and size; bold/italic/underline/strike; text and highlight colors; alignment; lists; indent; links; PNG/JPEG/WebP image insertion; tables with add/delete row and column insertion; find/replace by text run; margins and orientation; word count; undo/redo | DOCX with text, formatting, tables, hyperlinks and embedded images; HTML; TXT; browser print/PDF; Studio JSON                                                  |
| Sheets | Multiple worksheets; drag/Shift/range-box selection; rectangular clipboard; merge/unmerge; styles, borders, wrap and number formats; formula bar; relative/absolute references; fill down/right; values-only range sorting; find; first-row freeze; add rows/columns; bar and line charts     | XLSX with values, supported formulas and cached results, styles, merged ranges, editable bar/line chart parts; CSV of the active sheet; print/PDF; Studio JSON |
| Slides | Create/duplicate/reorder/delete; title/body text; three layouts; four themes; embedded images; speaker notes; keyboard presentation mode                                                                                                                                                      | Editable PPTX with slide text, images, theme and notes; browser print/PDF; Studio JSON                                                                         |
| Shared | Local autosave; explicit Save; stale-tab save conflict detection; templates; search; duplicate; dark/light modes; portable backups; isolated deployment                                                                                                                                       | Original imported file retained separately                                                                                                                     |

Spreadsheet functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, IFERROR, AND, OR, NOT, SUMIF, COUNTIF, ROUND, ROUNDUP, ROUNDDOWN, ABS, SQRT, POWER, MOD, CONCAT, CONCATENATE, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, DATE, TODAY, YEAR, MONTH, DAY, VLOOKUP, INDEX, MATCH. VLOOKUP/MATCH implement exact matching. The expression parser does not evaluate JavaScript, macros or external connections. Unsupported expressions are errors, and unsupported formulas export as inert text.

Limits: 20 worksheets, 1,000 rows and 100 columns per worksheet; 100 slides; 20 MB imports with archive expansion and entry limits; images up to 8 MB before browser resizing. Company saves are limited to 3.5 MB of editor JSON. Large embedded images can exceed that limit; export a local backup rather than discarding unsaved content.

## Compatibility boundaries

- Office import creates a **copy**, with an explicit warning. DOCX import handles basic text, tables and raster images; XLSX import handles values, formulas and merges; PPTX import currently extracts text. Complex drawing layouts, spreadsheet style/chart import, slide image/notes import, track changes, macros, embedded objects and full pagination fidelity are not implemented.
- Studio JSON is the lossless format for this editor's supported model. Office formats are interoperability exports, not a promise of a feature-for-feature round trip. Cross-application rendering has not been exhaustively verified.
- Sorting refuses formulas and merged ranges instead of silently damaging them. Merging asks before discarding non-anchor values. Renaming sheets updates supported formula references.
- Print/PDF uses the browser's print dialog. Page orientation in Writer controls the canvas and DOCX export; choose the matching print orientation in the browser dialog.
- The standalone release does **not** include certificate signing, mail, Teams-style conferencing, bundled AI inference, organisation accounts, timesheets, company audit logs or SPV. Those company modules exist in the separate application; their all-components license migration remains unfinished. No fake local login or mock AI service is presented as an implementation of them.

## Assistant

Ask AI opens a movable, resizable window with local document/cell search, image attachments and optional generative agents through OpenAI with a paired host gateway or a separately operated local model. See [assistant configuration and limits](ASSISTANT.md). The container includes the original client/tool code, not a model or inference runtime.

## Exact distributed contents and deployment

`Dockerfile.studio` uses a pinned GCC image only to compile. The final stage is `scratch` and contains three files: `/studio`, `/manifest.json`, `/LICENSE`. The executable embeds the ten allowed browser assets and a health response. It is original freestanding Linux **x86-64** code, statically linked with `-nostdlib`, with no libc, libgcc, startup runtime, interpreter, shell, OS packages or dynamic loader. Build checks reject undefined symbols, interpreter and shared-library dependencies. GCC and Python are not copied into the final image.

The existing host kernel, Docker/Kubernetes, and the user's browser are prerequisites, not software distributed inside this artifact. This distinction does not approve distributing their installers or images as MIT-only. Do not distribute the build stage as the Studio product. Any future package, copied code, font, certificate bundle or runtime must be audited before inclusion.

The static server exposes only exact embedded paths, GET/HEAD and `/health`; it has no filesystem routes, writable storage or credentials. It runs as UID 65532 with a read-only root, no capabilities and no new privileges. Child count, request headers and connection lifetimes are bounded. Compose binds to loopback. It is an original minimal server, not an independently security-certified general-purpose web server; do not expose it as a company authentication/API server.

`deploy/studio.yaml` provides an amd64 Kubernetes Deployment and ClusterIP Service with readiness/liveness probes. Use an existing cluster and port-forward for local access:

```powershell
kubectl apply -f deploy/studio.yaml
kubectl port-forward service/reverse-studio 3002:8080
```

Load the image into that cluster first or publish it to your own registry and set the image reference. No remote cluster or registry is modified by this change.

## Verification

```powershell
node scripts/studio-audit.mjs
node --test tests/studio.test.js
npm run test:studio
# Run the same browser flows against the actual container:
$env:STUDIO_URL = 'http://127.0.0.1:3002'
npm run test:studio
```

Tests cover formula evaluation and errors, relative fills, CSV quoting, ZIP integrity, unsafe imports, persisted editing, stale-tab conflicts, merge/chart export, real XLSX parsing with ExcelJS, DOCX/PPTX XML package contents, and the company save bridge. Test tools are development dependencies and are not copied into the Studio image. Full company regression checks remain separate from the standalone image's audit.

Security review applies the user-requested reverse-skill code-audit methodology to these original source files: explicit trust boundaries, dangerous API searches, and manual reproduction of unsafe-input and conflict scenarios. No third-party product binaries or accounts were targeted.

AI provider/model selection is available in Ask AI → AI settings. OpenAI uses the
optional paired host gateway (`npm run studio:ai`); direct local model connections
remain supported. See [AI settings and key storage](ASSISTANT.md#choose-a-provider-and-model-in-settings)
for setup, runtime/license boundaries and key removal.
