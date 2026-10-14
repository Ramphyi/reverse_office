# Timeline (append-only)

## 2026-10-13T21:37:21.2332254+03:00 | lead | init
- action: case-init
- command_or_ref: skills/scripts/case-init.ps1
- result_summary: case directory created; scope ready_for_act=true
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- decision_delta: [case_initialized]
- carry_forward_refs: [scope.md]
- next: open PRIMARY SKILL.md and ACT within scope
## 2026-10-14 | native editor integration review
- action: review owned JavaScript/TypeScript integration, native storage, signed callbacks, worker extraction and Docker configuration
- authorization: existing user request to build and test the local suite; no third-party target testing
- threat boundaries: account/project ACL -> native file source; engine JWT -> save callback; returned cache URL -> server fetch; Office ZIP -> worker; workspace context -> configured AI provider
- evidence: tests/office.test.js; tests/office-e2e/editors.spec.js; artifacts/backend-tests.txt; docs/OFFICE-STUDIO.md
- verified: 25 backend tests pass; forged/expired JWTs, key mismatch, unauthorized history/config/source, revoked account callbacks, off-origin/cache-path downloads, oversized payloads and archive format mismatch are rejected
- corrected: immediate-save race now waits for onDocumentStateChange(false); durable save completion is correlated by signed callback userdata, including unchanged-byte saves
- corrected: native files cannot be overwritten through simplified JSON document updates; imported archives are retained byte-for-byte; signing reads the latest saved native PDF
- corrected: backups and certificate/private-secret files are excluded from Docker build context
- limitation: no Semgrep/CodeQL result claimed; manual source tracing, targeted searches and executable regression tests used. Upstream engine internals and production infrastructure remain outside this source review.
