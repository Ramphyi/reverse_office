# Time, projects, sharing and mail

These changes extend the company application's development preview. They add no dependencies and the new source is MIT-licensed. They do not change the full application's [blocked distribution status](LICENSE-STATUS.md).

## Time logging

Log time starts at **8 hours**. Use the minus/plus buttons, direct input or the 4/8/10-hour presets. Work activities are office, home, business trip, training and other work. The category appears in the timesheet and CSV export.

Paid vacation, special occasion, sick leave and unpaid leave create **full-day pending leave requests**, using the same calendar and approval rules as Time off. Paid vacation maps to Annual leave and consumes the configured entitlement when approved. Absences are not billed as worked hours. Partial-day leave is not implemented.

Fill working week opens a padded, wider dialog. Each day has its own activity and hours. Workdays start with up to 8 remaining hours; weekends, holidays and days without capacity start at zero. Zero-hour entries are skipped. The entire batch is validated transactionally before saving; a rejected day prevents partial batch creation. Existing entries remain.

## Project teams and task board

New/Edit project supports multiple active internal members. Each checkbox is separately labeled. External chat guests are not project members.

Use the project filter above the board. Create tasks directly in a column or through New task; set project, assignee, priority, due date and description. Drag cards between Backlog, In progress, In review and Done, or use the card's status selector on a keyboard/touch device. Updates use server authorization and version checks.

## Drive permissions

Use a file/document's Share button to choose:

- **Only me:** owner-only access.
- **Project access:** existing project rules; personal files remain private.
- **Everyone in this workspace:** all active internal accounts, excluding guests.
- **Specific people:** selected internal accounts and/or named external guest accounts.

Explicit shares grant **view/download only**. Regular recipients cannot edit, delete or reshare. An administrator who already has access may manage the sharing policy. External people first need an invited guest account, then use Shared files in the guest interface. There are no anonymous public links. Policies apply per file/document, not recursively to folders. Changing a policy invalidates existing native editor sessions and rechecks access during saves. Previously downloaded copies cannot be revoked.

## Mail

Mail has Inbox, Sent, Drafts, Starred and Trash, search, per-user read/star/trash state, To/CC/BCC, draft editing, reply, forward of message text, and upload/download of attachments. Markdown formatting is rendered inside the workspace; external messages use plain text. Forwarded attachments must currently be attached separately. Drafts are private; recipients never receive the BCC list or SMTP recipient diagnostics. File downloads require message access. Maximum outgoing attachments: 20 files / 20 MB total, 10 MB per file.

Internal delivery works between active internal accounts without an external service. External guests are external email addresses, not local mailboxes. Deleting/trashing a user's copy does not delete another recipient's copy. Trash can be restored; this is not a retention/e-discovery implementation.

### External sending

Configure the following server environment variables and restart the app:

```text
SMTP_HOST=<your relay>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<relay username>
SMTP_PASSWORD=<relay secret>
SMTP_FROM=<verified sender address>
```

Port 587 uses required STARTTLS. For implicit TLS use the relay's port (usually 465) and `SMTP_SECURE=true`. Keep secrets outside Git and browser configuration. With a shared sender, replies are addressed to the signed-in user's email. Local recipients receive local copies; only external recipients enter the SMTP envelope.

**Accepted by SMTP** means the relay accepted the message, not that the final inbox received it. Partial rejection is recorded. If a connection fails, Sent records an uncertain/failed delivery and automatic retries are suppressed to avoid duplicates. Check the relay before resending. Without SMTP configuration, external send fails explicitly and the user can save a draft.

### External receiving

The app exposes a signed **trusted gateway endpoint**, not an IMAP server, IMAP sync client or a Microsoft/Google OAuth connector. A mail provider or an operator-controlled adapter must authenticate and parse incoming mail, validate its routing, and deliver normalized JSON to `POST /api/mail-ingress` over HTTPS (loopback HTTP is suitable for development).

Set `MAIL_INGRESS_SECRET` to at least 32 random characters on the app and adapter. Never give it to end users. The gateway is trusted to assert sender/recipient information; the signature authenticates that gateway, not the original email sender.

```json
{
  "deliveryId": "stable-provider-delivery-id",
  "from": "client@example.com",
  "to": ["member@your-company.example"],
  "subject": "Project update",
  "body": "Normalized plain text message",
  "attachments": [{ "name": "brief.txt", "base64": "SGVsbG8=" }]
}
```

Serialize the parsed body with JavaScript `JSON.stringify`. Send `x-mail-timestamp` as a 13-digit Unix timestamp in milliseconds and `x-mail-signature` as lowercase hex HMAC-SHA256 of `timestamp + '.' + serializedBody`, keyed by the secret. The signed body must have the same property order as the submitted JSON. Sign each retry with a fresh timestamp and reuse its stable deliveryId. Valid deliveries are deduplicated; tampered or older-than-five-minute signatures are rejected. The adapter should only acknowledge its upstream provider after successful ingestion.

Only active internal recipient addresses are accepted. Incoming attachments are limited to 10 files, 2 MB each and the 4 MB overall JSON body limit (including base64 expansion). Store received MIME/HTML archives separately if needed: the workspace stores normalized text and attachments, not a full RFC mailbox archive. Provider configuration, inbound routing and live external delivery still require deployment-specific credentials and validation.

## Validation

Backend tests cover activity/leave separation, atomic batches, project/task access, stale updates, file sharing/revocation including guests, private drafts, BCC protection, attachment access, per-user mailbox flags, SMTP envelope/TLS/status handling and signed/deduplicated incoming deliveries. SMTP transport tests use an injected transport; they do not certify a live relay or provider.

Browser tests exercise default hours and controls, leave requests, project multiselection, Kanban dragging, named Drive sharing, mail drafts/attachments/replies, and dark/mobile layouts. See [validation history](VALIDATION.md) for the recorded run.
