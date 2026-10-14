# Studio review — 2026-10-14

Scope: the owner's original `public/studio`, `studio-server`, and company `StudioEditor` bridge. Methodology: the requested reverse-skill `code-audit` workflow (trust boundaries, dangerous API search, manual reproduction and fix verification). No third-party application or public network target was tested.

## Boundaries reviewed

- **Imported HTML to editable DOM:** HTML passes through an allowlist that recreates nodes. Scripts, frames, SVG, MathML, event attributes, remote images and executable links are excluded. The three remaining HTML assignments are sanitized editor HTML or fixed original table-cell markup. Browser tests reproduce script, tracking-image and URL injection attempts.
- **ZIP/XML to editor models:** the ZIP reader bounds compressed bytes, declared expansion, actual streaming expansion, entry count and entry names; rejects encryption, unsupported methods, duplicate/unsafe paths and CRC mismatches. XML rejects DTD/entity declarations. External Office relationships are not fetched. Models are validated and sanitized before opening. Original imports are stored separately and never overwritten by the simplified copy.
- **Formula text to computation:** a tokenizer/AST interpreter and explicit function switch execute supported operations. There is no `eval`, `Function`, macro host, external formula service or network fetch. References, nesting, input size and sheet dimensions are bounded. Test cases cover cycles, unsupported function names, divide-by-zero and attempted JavaScript expressions. This is not a full Excel calculation engine.
- **Persistence:** autosave serializes requests and associates completion with the saved generation. Standalone writes compare revisions inside one IndexedDB transaction; stale tabs retain their unsaved edits and report the conflict. Downloadable JSON backups remain available on save failure. The company iframe accepts messages only from its exact child window and same origin. Existing authenticated API ownership, CSRF and version checks remain authoritative.
- **Static HTTP input:** only exact embedded assets are exposed. No path is used in a filesystem call or process command. Header buffers, connection lifetime and concurrent child processes are bounded. Unsupported methods fail. The child process sends with `MSG_NOSIGNAL`, with bounded blocking/poll behavior. Deployment runs without privilege, writable root or capabilities and binds only to loopback in Compose.
- **Distribution:** the final image has original code plus MIT grant and manifest. The build rejects unresolved symbols, a dynamic interpreter and dynamic library dependencies. Its compiler/OS stage is excluded. The source allowlist audit does not approve new third-party code merely because somebody adds a license marker; additions require review.

## Findings corrected during verification

1. Table insertion was attempted while a modal made the editor inert. Closing the dialog before restoring selection fixed real browser insertion and DOCX export.
2. Dark-mode variables did not override the root's literal background/text colors. The root now uses theme variables; browser checks and screenshots confirm contrast.
3. Optional editor banner values were passed directly to `replaceChildren`, displaying literal `null`. The empty branch now uses an empty text node.
4. Docker Compose retained the previous Studio image after a build on the local host. The Studio-only container was recreated, then its served asset hashes were matched against source and all browser flows rerun.

## Validation and remaining limits

The standalone browser suite exercises persisted rich-text editing, table insertion, merges, relative fills, charts, native Office packages, embedded images, printing content, compressed import, original retention, rectangular clipboard, dark mode, and stale-tab conflicts. XLSX output is parsed with ExcelJS independently from the original serializer. The container checks verify exact source/served hashes, CSP, HEAD behavior, method/path rejection, concurrent requests and oversized header handling.

This is a developer review, not independent penetration testing or an assurance of zero defects. The freestanding server is an immutable local asset host, not a new secure account/TLS/API platform. The company stack still carries the previous license blockers. Imported Office fidelity, accessibility, spreadsheet semantics and large-document performance need broader testing before enterprise rollout. Existing team accounts and stored native files are preserved.
