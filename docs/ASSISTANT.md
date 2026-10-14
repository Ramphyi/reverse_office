# Floating assistant and personal navigation

Original implementation: MIT. No new npm dependencies were added.

## Where features run

| Feature                                              | Standalone Studio (`:3002`)              | Company application                           |
| ---------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Floating launcher, drag, resize, keyboard controls   | Yes                                      | Yes                                           |
| Search saved Writer/Sheets/Slides content            | Browser-local documents                  | Permission-filtered server documents          |
| Spreadsheet formulas and calculated ranges           | Yes                                      | Yes                                           |
| Image preview, paste/drop, camera file capture       | Preview plus optional local vision model | Preview plus optional vision model            |
| Generative specialist agents and delegation          | Optional local model connector           | OpenAI-compatible endpoint or OpenCode server |
| Sidebar collapse, resize, reorder and hide shortcuts | Personal Studio shortcut drawer          | Per-account browser preferences               |

The existing full-company distribution remains blocked by `license-policy.json`.
These changes do not approve its pre-existing dependencies or runtime. The Studio
scratch container remains original MIT code only. Networking is off until the user configures a model and sends an agent message; its CSP allows only four explicit loopback origins.
Browsers, host runtimes, externally configured AI models and OpenCode services are
not bundled in that container. Their licenses are not certified by this project.

## Window and navigation controls

Open the bottom-right launcher. Drag the header to move the window and its bottom-right
corner to resize. Focus either control and use arrows (Shift for larger steps); Home
resets geometry. Minimizing keeps the conversation in memory. Only geometry and
navigation preferences are saved in localStorage; conversations and image contents
are not saved there. Reloading clears the conversation.

Use the sidebar settings button to hide/restore shortcuts, drag them into order,
or use the up/down buttons. Drag the sidebar edge to change its width or collapse
it. Hidden modules remain available through existing page links; hiding a shortcut
does not alter permissions. Restore defaults is always available.

Images can be selected, dropped, or pasted, up to three per request. Browser decoding
and canvas conversion produce bounded JPEGs and remove source metadata. Camera file
capture is supported by mobile browsers; desktop browsers may offer a file picker.
Images are transmitted to the configured provider only when Send is pressed. The
company backend independently validates types, signatures, sizes and provider support.

## Standalone model connection

Use Ask AI → Configure local AI. Select one of the fixed loopback endpoints on port
11434 or 1234 and enter the exact installed model name. The model must implement
chat completions with tool calls; enable the image option only for a vision model.
The external server must allow this Studio origin through CORS. The browser supplies
no cookies or API keys and refuses redirects. Non-loopback endpoints are not supported
in this edition. Disconnect clears the preference; local tools continue working.

Seven specialist roles and the same four tool types are implemented in original
browser JavaScript. They operate only on this browser's documents, including a snapshot
of the currently open document. Tool traces appear while running. Stop cancels the
request, and a 90-second deadline plus call/delegation budgets limit each run. Model
outputs render as plain text so generated markup cannot execute. Model behavior has
been tested with protocol fixtures, not a bundled or preconfigured real model.

## Compatible model endpoint

Configure on the server, never in client code:

```dotenv
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=your-tool-capable-model
AI_API_KEY=
AI_VISION=false
```

Choose a model that supports chat-completion tool calls. Set AI_VISION=true only
when that model also supports image_url inputs. Without a provider, the assistant
performs real local search and labels it as such. It does not simulate a model response.

## OpenCode integration

This is an original HTTP adapter for OpenCode, not a vendored OpenCode executable.
Its agent registry, primary/specialist separation, tool gateway and delegation budgets
follow OpenCode's documented agent/tool model. Seven roles are selectable: Coordinator,
Research, Spreadsheet analyst, Writer, Presentation planner, Project planner and Reviewer.
Delegation is executed by the company gateway so OpenCode never needs raw access to
the company filesystem or database.

Current upstream was checked at
[`6a7cedcbf1823eeb1c8dfc4baf5a7951854f578b`](https://github.com/anomalyco/opencode/tree/6a7cedcbf1823eeb1c8dfc4baf5a7951854f578b)
on 2026-10-14. Its current protocol uses `/api/session`, `/prompt`, `/wait` and
`/context`; it differs from the older API in the public server guide.
Sources: [session protocol](https://github.com/anomalyco/opencode/blob/6a7cedcbf1823eeb1c8dfc4baf5a7951854f578b/packages/protocol/src/groups/session.ts),
[permission schema](https://github.com/anomalyco/opencode/blob/6a7cedcbf1823eeb1c8dfc4baf5a7951854f578b/packages/schema/src/permission.ts),
[agent documentation](https://opencode.ai/docs/agents/),
[upstream MIT license](https://github.com/anomalyco/opencode/blob/6a7cedcbf1823eeb1c8dfc4baf5a7951854f578b/LICENSE).

```dotenv
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_API=current
OPENCODE_AGENT=
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=
```

Use a separately managed, trusted OpenCode instance with an empty working directory,
no plugins or hooks and its own model configuration. OPENCODE_BASE_URL takes priority
over AI_BASE_URL. An optional OPENCODE_AGENT selects an agent configured on that server;
otherwise the current API uses its default. The gateway creates a fresh session for
each model call, requires the server to confirm deny-all native-tool permissions,
waits for completion, consumes text only, then interrupts and deletes the session.
Document text cannot request arbitrary HTTP destinations, local commands or native tools.
Operators must manage the external service's logging and backup retention separately.

For an older server matching the [legacy server protocol](https://opencode.ai/docs/server/),
set OPENCODE_API=legacy and configure an agent named `reverse-office` (or OPENCODE_AGENT).
That adapter disables every tool returned by the server's native-tool catalog and
requests deny-all session permissions. It never retries a failed creation using a
different API. Vision inputs currently use the compatible-model adapter, not OpenCode.

The automated adapter tests use protocol fixtures, including current and legacy
schemas, denied boundaries and cleanup. A live OpenCode/model round-trip requires
operator configuration and has not been certified against every release.

## Tools and boundaries

- `workspace_search`: title and text search, including workbook sheets/cells/formulas;
  searches up to 300 accessible records per module and returns at most 30 matches.
- `read_document`: reads a document after checking access, with a 24,000-character cap.
- `sheet_range`: returns raw/formula and calculated values for at most 200 cells.
- `delegate_agent`: makes a real specialist model call with the same permission gateway.
  One delegation level, at most three specialists, eight model calls, ten tools and
  a 90-second overall deadline per request. One active request per account.

Native saved workbooks are extracted for the explicitly opened document (20 sheets,
10,000 populated cells). Cross-workbook content search operates on saved Studio/legacy
cell models; convert native documents to Studio copies to include their cells. Unsupported
formulas produce explicit error values. Unsaved company edits are not sent automatically.
Standalone tools include the currently open document in addition to browser-saved copies.

Tool traces and source locations appear in the conversation. The server audits tool
names, agent roles, counts and outcomes, without storing prompts or image payloads in
the audit log. No tool writes documents, sends messages, changes accounts or executes
shell commands. Generated drafts remain subject to user review.

## Community extensions

Add roles to `server/assistant.js` and provide a specific description. New tools must
have a schema, execute through `runTool`, check the user's permission at read time,
respect the request budget, and return a trace and bounded result. Add tests proving
that private records cannot cross the tool boundary. UI window/search utilities are
shared original modules in `public/studio`; adding dependencies requires updating the
artifact license inventory and passing the strict gate.

Validation: `npm test`, `npm run test:e2e`, `npm run test:studio`,
`node scripts/studio-audit.mjs`, and `node scripts/test-studio-container.mjs` after
rebuilding/recreating the standalone container.
