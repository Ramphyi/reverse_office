# Romania billing and SPV branch

Implemented on `feature/romania-spv`, after the base workspace passed 17 backend tests, 2 browser flows and a hardened Docker smoke test. `main` contains the office workspace without these billing modules. Use separate data directories/volumes for separate deployments; never run two instances against one SQLite database.

## Local billing

Open **Billing · RO** as an administrator or manager. An administrator first enters Company details. Add customers/suppliers with CUI, address and VAT status. County codes use ISO subdivision codes such as `RO-CJ`; use the ANAF-required sector format for Bucharest. Government legal-identity and VAT-registration checks are not automated.

Create a sales invoice or supplier payable. Enter the applicable VAT rate yourself; no default rate or tax advice is inferred. Quantities support three decimals and prices two decimals. Line nets and tax groups use integer-cent arithmetic with half-up rounding. A zero rate requires an exemption explanation and maps to UBL category E; other VAT categories are outside this release.

Drafts can be edited/deleted. Issuing a sale assigns `SERIES-YEAR-00001` atomically; counter, invoice and audit share a transaction. Issued documents cannot be edited/deleted. Identity and amounts are snapshots. Payables retain supplier-issued numbers, checked for duplicates by supplier CUI and number. Partial payments record date, bank reference and amount; duplicate references and overpayments are rejected. Recording a payment does not initiate a bank transaction.

Approved timesheets can populate sales drafts. The customer legal name must match the project client field exactly, and currencies must match. Selected timesheets replace manual lines using approved hours/rate snapshots and the first line's VAT rate/exemption. A timesheet cannot belong to two invoices; deleting its draft releases the reservation. Generate a client activity report in Reports before invoicing when client review is needed. Reports export to CSV and browser-printable PDF; they are not automatically emailed.

**Print / PDF** produces readable invoices with Romanian text; draft prints show DRAFT. **UBL XML** targets UBL 2.1/CIUS-RO 1.0.1. The generator is not a complete XSD/Schematron validator. ANAF validation is mandatory before upload. Local billing supports RON/EUR/USD; SPV submission supports **RON only** because foreign-currency tax reporting/conversion is not implemented.

## Configure ANAF

Default destination: **test**. Nothing is transmitted on startup. OAuth, validation, upload, status, message listing, archive download and payable import have been exercised with synthetic responses, **not accepted in a live ANAF account**. Verify the currently published contract and complete sandbox acceptance with your registered application before enabling production.

1. Register an ANAF application and obtain client ID, secret and exact redirect URI. Browser authorization requires an authorized company certificate. PDF-signing certificates are configured separately.
2. Set `ANAF_ENV=test`, `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET`, and `ANAF_REDIRECT_URI=https://your-host/spv/callback`.
3. Generate an independent key using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set the resulting 64 hexadecimal characters as `SPV_ENCRYPTION_KEY`; retain it with deployment secrets and backups.
4. Choose **Billing · RO → SPV → Connect ANAF** and authorize at ANAF. OAuth state is random, one-use, expires after ten minutes and belongs to an active administrator. The callback works without cross-site cookies. Access/refresh tokens are encrypted with AES-256-GCM; access expiry triggers refresh. Browser APIs never return tokens.
5. An optional environment `ANAF_ACCESS_TOKEN` overrides stored OAuth tokens and must be rotated externally. Removing the stored connection does not remove that environment token.
6. Issue a RON invoice, click **Validate with ANAF**, review the result, then explicitly confirm **Send to SPV · test**. Validation transfers XML to ANAF's public production-hosted validator endpoint, including for test invoices.

Compose forwards the variables; the Kubernetes secret example supplies placeholders. No certificates or credentials are bundled. Use HTTPS for real access. Production requires both `ANAF_ENV=production` and `ANAF_ALLOW_PRODUCTION=true`. Submit confirmation includes environment and invoice number. An existing submitted invoice does not become eligible for resend by switching environments; keep test and production data separate.

## Submission and recovery

The normal path is `Not sent → Uploading → Submitted → Processing → Accepted/Rejected`. An upload index is not fiscal acceptance. **Refresh SPV status** retrieves processing results. Uploading is saved before the network call; a network exception becomes **Unknown**, and a crash may leave **Uploading**. Both block retries to prevent duplicates.

For Unknown, Uploading or rejected uploads, reconcile invoice number and XML hash with the ANAF portal and audit record. This release has no automatic retry, correction, credit-note or cancellation workflow. Use an appropriate supported correction process; do not blindly edit database status to resend. The adapter is suitable for a controlled pilot, not unattended accounting.

**Sync last 30 days** lists messages (API supports 1–60 days). Downloaded ZIPs remain in SQLite with SHA-256 hashes. Payable import requires exactly one UBL Invoice, matching buyer CUI and no duplicate supplier number. A bounded worker limits ZIP/XML processing, rejects unsafe declarations and never extracts filenames to disk. The original archive is preserved. Ministry detached signatures are **not verified**; imported invoices display this limitation and are marked for review. Download routes only accept messages already synchronized in the current environment.

## Scope and evidence

Supported: one company, domestic standard invoices, customer/supplier registers, sales/payables, partial payments, simple UBL, explicit SPV operations, archive preservation and audit. A configured AI provider receives manager-only invoice summaries; it cannot submit invoices or record payments.

Not implemented: general ledger, VAT returns, bank reconciliation, credit notes, discounts/charges/prepayments, reverse-charge/export/intra-community VAT categories, tax currency conversion, automatic government registry checks, scheduled submissions or supplier-signature verification. No SmartBill/FGO parity or ANAF certification is claimed.

Primary references consulted:

- [ANAF OAuth procedure](https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf).
- [ANAF e-Factura service URLs](https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/url_eFactura.html).
- [Ministry API presentation](https://mfinante.gov.ro/static/10/eFactura/prezentare%20apeluri%20API%20E-factura.pdf) and [CIUS-RO publication](https://mfinante.gov.ro/static/10/eFactura/Monitorul%20Oficial%20Partea%20I%20nr.%201148.pdf). These last documents were indexed in search, but direct full retrieval was unreliable. Exact response examples remain contract assumptions covered by mocks until sandbox verification.

Executed: **26/26 backend tests, 3/3 browser flows**, production build and a non-root/read-only Docker billing smoke test. Coverage includes rounding, roles, numbering, immutable invoices, payment bounds, timesheet reservation, XML validation/hash gating, ambiguous-upload locking, token encryption, OAuth replay rejection, archive retention and payable duplicates. Browser checks cover company/customer entry, invoice issue, XML download, partial payment, print/PDF and mobile layout. No real invoice was sent.
