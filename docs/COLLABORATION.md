# Reporting lines, conversations and calls

## People

In **Administration → People**, Add person and Manage account include **Reports to**.
Choose an active manager or administrator, or leave the person unassigned. The list
shows each person's manager and direct-report count; **My direct reports** filters to
your team. The backend migrates existing accounts without assigning managers silently.
Self-management, reporting cycles and inactive/non-manager supervisors are rejected.
Reassign reports before disabling or demoting their manager.

Reporting lines organize the directory and provide manager/report chat shortcuts.
They do not redefine existing role-based project access, timesheet review or leave
approval authority. A reporting relationship alone does not grant new permissions.

## Chat

**Connect → New private chat** opens a two-person conversation. Existing conversations
are reused regardless of which participant starts them. Members can use **Chat with
my manager**. The picker identifies direct reports. Existing workspace/project
channels continue to work.

The composer supports bold, italic, strike, inline code, fenced code blocks, lists,
quotes, Markdown links and tables, with a preview and emoji picker. Enter sends;
Shift+Enter inserts a line break. Executable HTML and Markdown image embeds are not
rendered. Uploaded images use authenticated, same-origin preview routes.

Use the paperclip for images/files, GIF for a local animated GIF, and the folder
button for directory upload. Paste images or drop files into the composer. Folder
selection preserves relative paths; files are downloaded individually. Limits:
25 MB per file, 100 files / 100 MB per message. Pending uploads persist across reloads
and can be removed before sending. Uploading a folder does not follow a server path
or extract an archive. Paths with traversal or invalid segments are rejected.

Messages bind uploaded files to the sender and conversation. Other participants
cannot access a pending upload until it is sent. Downloads recheck current channel
access and the message's attachment references. A different user, including an
administrator who is not in a private conversation, cannot read its content/files
through the ordinary chat APIs. Administrators have separate, audited review routes
as described below. Administrative audit metadata remains available according to
the existing audit policy. File types other than verified PNG/JPEG/GIF/WebP are
download-only; filenames and claimed MIME types cannot enable executable previews.

## Calls and preferred devices

The conversation header has audio/video call buttons. Online recipients get an
incoming-call invitation across the app, with Accept and Decline. Accept opens the
lobby; **Enter meeting** requests device permission and joins. Calls also appear as
joinable messages. A call invitation lasts up to one hour, is permission checked,
and cannot be converted into an ordinary public calendar event. Leaving as the
caller ends the call and dismisses invitations; other participants can leave
individually. The browser asks before sharing a screen. Rooms support six people.

Audio calls request no camera permission until Turn camera on is pressed. The video
transceiver is negotiated in advance; enabling camera or sharing a screen replaces
its track. Tests check that the second browser actually receives video frames.

**My account → Audio & video preferences** selects microphone, speaker and camera,
echo cancellation and noise suppression. Refresh devices asks for microphone access
to show device names; Enable camera choices does the equivalent for cameras. Choose
speaker uses the browser's output chooser where available. Test microphone shows a
live meter and automatically stops after ten seconds. Test speaker plays an original
short generated tone. Preferences are scoped to the account and browser; input
changes apply when joining the next call. Missing input devices fall back to defaults.

Outside localhost, media APIs require HTTPS. Speaker routing depends on browser
support and permission; otherwise choose output in the operating system. See
[audio output selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)
and [replacing a WebRTC track](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack).
TURN must be configured for reliable calls across different networks. No public
GIF service, media relay or third-party chat account is bundled.

## Local development preview and distribution

`npm run company:preview` serves the built application at `http://localhost:3003`
using **data/company-preview**, a separately prepared, protected snapshot of the
company database and uploaded files. The existing account/password works there;
copied sessions are cleared during snapshot preparation, and the preview uses a
distinct `ro_preview` cookie. Changes in this preview do not sync back to Docker.
Do not overwrite either database to merge changes. The footer identifies the preview.

Prepare the snapshot with SQLite's consistent backup/VACUUM INTO operation, not a
copy of a live WAL database file alone. Protect the complete directory and exclude it
from Git. The optional `SESSION_COOKIE` setting separates other same-host instances.

This development host uses already installed Node/npm dependencies. It is **not**
an MIT/Apache-only distribution approval. These changes add original MIT source and
no npm dependencies; the full company image still fails the existing license policy.
The separately approved minimal Studio container has no company accounts or chat.

## Verification

Backend coverage includes hierarchy cycles, manager demotion, direct-message privacy,
attachment publication/ownership/channel isolation, traversal rejection, safe GIF
previews, call authorization/cancellation and custom session-cookie logout. Browser
coverage creates a managed account, transfers rich messages/GIFs/folders between two
accounts, accepts an audio call, checks remote video after enabling the camera, and
verifies microphone preference persistence. Existing account, workforce, editor,
meeting and SPV tests remain part of the regression suite.

## Groups, channels and external companies

Connect now has an original Discord-style navigation rail for all conversations,
workspace channels, groups and direct messages, a search field and category headings.
Use **New channel (+)** to create a workspace/project channel or an invitation-only
**Group**. Workspace channels exclude external accounts. Groups support up to 100
participants; calls retain the existing six-person limit.

**Participants** adds/removes existing accounts. The conversation owner or an
administrator manages a group. Adding people to a direct conversation creates a new
group without copying the original direct-message history. People added to an
existing group can read its history; the editor makes this explicit. The group
owner cannot be removed. Changes use version checks and immediately revoke socket
room membership as well as HTTP access for removed participants.

In a group, **Invite external** creates a single-use, seven-day link bound to the
recipient email and company label. Copy and deliver it to the intended person;
no email is automatically sent. Treat the link like a temporary credential.
Only its SHA-256 hash is stored. Pending invitations can be revoked. Accepting
creates a guest account with a user-chosen password, without changing an existing
account. If the email already has an account, add that account through Participants.
Company names are directory labels, not a federation or tenant identity proof.

Guests have a dedicated conversation/account interface. They can access only their
explicit groups/direct conversations and associated calls/files. Their directory
contains only fellow participants. Documents, projects, organisation settings,
workforce, AI, billing and administrative endpoints are blocked. They can change
passwords and preferred media devices. Administrators can disable a guest in People.
To reach this server from another computer/company, deploy it behind HTTPS on an
accessible address; localhost invitation links work only on this computer. This
feature does not connect separate Reverse Office servers into a federated network.

## Administrator conversation review

Connect's **Audit** button opens **Conversation review** for administrators only.
Select any conversation, enter a reason of at least 10 characters and open the
read-only transcript. Both opening the transcript and downloading a published
attachment record the actor, target and reason in the append-only audit log.
Pending, unsent uploads are excluded. Review does not join calls or grant ordinary
chat membership, and does not expose private content to AI context endpoints.

All chat screens display the administrator-review notice. External account
registration requires acknowledgment. Existing stored direct conversations are
also subject to the explicit administrative review feature. This is not an
end-to-end encrypted private messenger.

## Microsoft Teams and Google Meet links

**Teams / Meet** stores a validated HTTPS meeting link as a chat card. **Join** opens
the real provider site in a new tab; credentials, chat files and local session
cookies are not sent to the provider. The application neither embeds the provider
call nor impersonates a Microsoft/Google account. It does not create meetings in
those providers, exchange identity tokens or bridge media to native Reverse Office
calls. Actual admission depends on the provider and meeting host.

Microsoft documents [joining without a Teams account](https://support.microsoft.com/en-gb/teams/meetings/join-a-meeting-without-an-account-in-microsoft-teams).
Google documents [joining a Meet meeting](https://support.google.com/meet/answer/9303069?hl=en).
The local account is usable for Reverse Office calls; it does not become an account
accepted by either external identity provider. Automated tests verify link
validation, authorized sharing and the new-tab destination, not admission to a
live external meeting.
