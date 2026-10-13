# Owned workspace review — 2026-10-13

Route R26/code-audit. Scope was a newly created local productivity workspace, with synthetic records and disposable localhost services. No commercial binary analysis was applicable because no executable sample was supplied.

Evidence: 17 domain/API/import/signature tests, two complete browser scenarios, production npm audit and a hardened Docker smoke. Findings were mapped to source paths in the formal review. Browser execution caught cleanup return-value behavior and HTML step constraints that compile-time tests did not catch.

Reusable lesson: keep authorization, business transition validation and durable write/audit atomicity separate and test each boundary. Hide financial snapshots in member responses, not just current project rate fields. Avoid publishing realtime messages solely on room membership: re-evaluate live permissions. Treat a cryptographic PDF signature as different from a visible acknowledgement, and verify actual CMS bytes with an independent implementation.

No community submission was made. The record remains local to this task.

Romania branch follow-up: 26 backend checks and three browser flows now pass. Billing roles, atomic numbering/audit, immutable invoice snapshots, fixed-point money, duplicate time/payment protection and encrypted OAuth storage were verified. ANAF calls use injected synthetic responses. Persist the upload state before a network request and lock ambiguous outcomes; never infer fiscal acceptance from an upload index. Original incoming archives are retained but detached Ministry signature verification and live ANAF acceptance remain explicit gaps. A second hardened container smoke verified authenticated billing writes. Production credentials were not available and no real invoice was submitted.
