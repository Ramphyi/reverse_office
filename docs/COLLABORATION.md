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
through these APIs. Administrative audit metadata remains available according to
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
