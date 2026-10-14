import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
let runtime, server, base, dir, admin, boss, member, outsider, conversation;
const password = 'Chat-test-password-42!';
async function request(url, { who = admin, method = 'GET', body, raw = false } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(base + '/api' + url, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(who ? { Cookie: who.cookie, 'x-csrf-token': who.csrf } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: raw ? Buffer.from(await response.arrayBuffer()) : await response.json(),
    response,
  };
}
before(async () => {
  process.env.SESSION_COOKIE = 'chat_test_session';
  dir = mkdtempSync(path.join(tmpdir(), 'reverse-chat-'));
  runtime = createApp({ dataDir: dir, setupKey: 'chat-test', test: true });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const setup = await request('/setup', {
    who: null,
    method: 'POST',
    body: { key: 'chat-test', name: 'Chat Admin', email: 'admin@chat.test', password },
  });
  admin = { ...setup.data, cookie: setup.response.headers.get('set-cookie').split(';')[0] };
  async function account(name, role, managerId = '') {
    const email = name.toLowerCase() + '@chat.test';
    assert.equal(
      (
        await request('/users', {
          method: 'POST',
          body: { name: name + ' Person', email, password, role, managerId },
        })
      ).status,
      201,
    );
    const r = await request('/login', { who: null, method: 'POST', body: { email, password } });
    return { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] };
  }
  boss = await account('Boss', 'manager');
  member = await account('Member', 'member', boss.user.id);
  outsider = await account('Outsider', 'member');
});
after(async () => {
  delete process.env.SESSION_COOKIE;
  await new Promise((resolve) => server.close(resolve));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('reporting lines persist, reject cycles and require reassignment before manager demotion', async () => {
  assert.equal((await request('/me', { who: member })).data.user.managerId, boss.user.id);
  assert.equal(
    (await request('/users')).data.find((u) => u.id === member.user.id).managerId,
    boss.user.id,
  );
  assert.equal(
    (
      await request('/users/' + boss.user.id, {
        method: 'PATCH',
        body: { active: true, role: 'member' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/users/' + boss.user.id, {
        method: 'PATCH',
        body: { active: true, role: 'manager', managerId: boss.user.id },
      })
    ).status,
    400,
  );
  const child = await request('/users', {
    method: 'POST',
    body: {
      name: 'Nested Manager',
      email: 'nested@chat.test',
      password,
      role: 'manager',
      managerId: boss.user.id,
    },
  });
  assert.equal(
    (
      await request('/users/' + boss.user.id, {
        method: 'PATCH',
        body: { active: true, role: 'manager', managerId: child.data.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/users/' + member.user.id, {
        who: member,
        method: 'PATCH',
        body: { active: true, role: 'member', managerId: outsider.user.id },
      })
    ).status,
    403,
  );
});
test('private conversations deduplicate and remain hidden from outsiders including administrators', async () => {
  const c = await request('/chat/direct', {
    who: member,
    method: 'POST',
    body: { userId: boss.user.id },
  });
  assert.equal(c.status, 201);
  conversation = c.data;
  const again = await request('/chat/direct', {
    who: boss,
    method: 'POST',
    body: { userId: member.user.id },
  });
  assert.equal(again.data.id, c.data.id);
  for (const who of [admin, outsider]) {
    const result = await request('/entities/channels', { who });
    assert.ok(!result.data.some((item) => item.id === c.data.id));
    assert.equal(
      (
        await request('/entities/messages', {
          who,
          method: 'POST',
          body: { channelId: c.data.id, text: 'intrusion' },
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await request('/entities/channels/' + c.data.id, {
        who: member,
        method: 'PUT',
        body: { ...c.data, visibility: 'workspace' },
      })
    ).status,
    403,
  );
});
async function upload(who, content, name, relativePath = name) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  form.append('relativePath', relativePath);
  return request('/chat/' + conversation.id + '/attachments', { who, method: 'POST', body: form });
}
test('chat files preserve folder paths and enforce pending, published, owner and channel access', async () => {
  const uploaded = await upload(member, 'original source', 'main.js', 'Project/src/main.js');
  assert.equal(uploaded.status, 201);
  const id = uploaded.data.id;
  assert.equal((await request('/chat/attachments/' + id + '/download', { who: boss })).status, 403);
  assert.equal(
    (
      await request('/entities/messages', {
        who: boss,
        method: 'POST',
        body: { channelId: conversation.id, attachments: [id] },
      })
    ).status,
    403,
  );
  const sent = await request('/entities/messages', {
    who: member,
    method: 'POST',
    body: {
      channelId: conversation.id,
      text: '**Source** 😀\n```js\nlet n=1;\n```',
      attachments: [id],
    },
  });
  assert.equal(sent.status, 201);
  const downloaded = await request('/chat/attachments/' + id + '/download', {
    who: boss,
    raw: true,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.data.toString(), 'original source');
  assert.match(downloaded.response.headers.get('content-disposition'), /attachment/);
  assert.equal(
    (await request('/chat/attachments/' + id + '/download', { who: outsider })).status,
    403,
  );
  assert.equal(
    (await request('/chat/attachments/' + id, { who: member, method: 'DELETE' })).status,
    403,
  );
  assert.equal((await upload(member, 'x', 'x.txt', '../escape.txt')).status, 400);
  const other = await request('/chat/direct', {
    who: member,
    method: 'POST',
    body: { userId: outsider.user.id },
  });
  assert.equal(
    (
      await request('/entities/messages/' + sent.data.id, {
        who: member,
        method: 'PUT',
        body: { ...sent.data, channelId: other.data.id },
      })
    ).status,
    400,
  );
});
test('GIF previews use verified bytes and arbitrary HTML is download-only', async () => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const a = await upload(member, gif, 'reaction.gif');
  assert.equal(a.data.imageType, 'image/gif');
  const image = await request('/chat/attachments/' + a.data.id + '/preview', {
    who: member,
    raw: true,
  });
  assert.equal(image.status, 200);
  assert.equal(image.response.headers.get('content-type'), 'image/gif');
  assert.deepEqual(image.data, gif);
  const b = await upload(member, '<script>alert(1)</script>', 'fake.gif');
  assert.equal(b.data.imageType, '');
  assert.equal(
    (await request('/chat/attachments/' + b.data.id + '/preview', { who: member })).status,
    400,
  );
  assert.equal(
    (await request('/chat/attachments/' + b.data.id, { who: member, method: 'DELETE' })).status,
    200,
  );
});
test('call invitations inherit channel access and cannot be rewritten as public events', async () => {
  const r = await request('/chat/' + conversation.id + '/call', {
    who: member,
    method: 'POST',
    body: { mode: 'audio' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.callMode, 'audio');
  assert.deepEqual(r.data.attendees.sort(), [member.user.id, boss.user.id].sort());
  for (const who of [admin, outsider])
    assert.ok(!(await request('/entities/events', { who })).data.some((e) => e.id === r.data.id));
  assert.equal(
    (await request('/entities/events/' + r.data.id, { who: member, method: 'PUT', body: r.data }))
      .status,
    403,
  );
  assert.equal(
    (
      await request('/chat/' + conversation.id + '/call', {
        who: outsider,
        method: 'POST',
        body: { mode: 'video' },
      })
    ).status,
    403,
  );
});

test('caller can end a call idempotently and custom session cookies isolate logout', async () => {
  const event = runtime.store.all('events').find((e) => e.call && e.channelId === conversation.id);
  assert.equal(
    (await request('/chat/calls/' + event.id + '/end', { who: outsider, method: 'POST', body: {} }))
      .status,
    403,
  );
  assert.equal(
    (await request('/chat/calls/' + event.id + '/end', { who: member, method: 'POST', body: {} }))
      .status,
    200,
  );
  assert.ok(runtime.store.get('events', event.id).endedAt);
  assert.equal(
    (await request('/chat/calls/' + event.id + '/end', { who: member, method: 'POST', body: {} }))
      .status,
    200,
  );
  assert.match(outsider.cookie, /^chat_test_session=/);
  assert.equal((await request('/logout', { who: outsider, method: 'POST', body: {} })).status, 200);
  assert.equal((await request('/me', { who: outsider })).status, 401);
});

let group, guest;
test('groups isolate membership, preserve old DMs and enforce owner/version changes', async () => {
  const result = await request('/chat/' + conversation.id + '/expand', {
    who: member,
    method: 'POST',
    body: { title: 'Partner project', memberIds: [admin.user.id] },
  });
  assert.equal(result.status, 201);
  group = result.data;
  assert.equal(group.visibility, 'group');
  assert.ok(!runtime.store.all('messages').some((m) => m.channelId === group.id));
  assert.equal(
    (
      await request('/entities/channels/' + group.id, {
        who: member,
        method: 'PUT',
        body: { ...group, visibility: 'workspace' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/chat/' + group.id + '/members', {
        who: boss,
        method: 'PUT',
        body: { memberIds: group.memberIds, version: group.version },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/chat/' + group.id + '/members', {
        who: member,
        method: 'PUT',
        body: { memberIds: [boss.user.id], version: group.version },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/chat/' + group.id + '/members', {
        who: member,
        method: 'PUT',
        body: { memberIds: group.memberIds, version: 999 },
      })
    ).status,
    409,
  );
  const workspace = await request('/chat/conversations', {
    method: 'POST',
    body: { title: 'Design channel', visibility: 'workspace', category: 'Design' },
  });
  assert.equal(workspace.status, 201);
  assert.equal(workspace.data.category, 'Design');
});

test('external invitations are single-use, revocable, expiring and grant chat-only accounts', async () => {
  const invite = await request('/chat/' + group.id + '/invitations', {
    who: member,
    method: 'POST',
    body: { email: 'guest@partner.test', company: 'Partner Inc' },
  });
  assert.equal(invite.status, 201);
  assert.ok(!JSON.stringify(runtime.store.all('chatInvites')).includes(invite.data.token));
  const body = { token: invite.data.token, name: 'External Guest', password, acknowledge: true };
  assert.equal(
    (
      await request('/chat-invitations/accept', {
        who: null,
        method: 'POST',
        body: { ...body, acknowledge: false },
      })
    ).status,
    400,
  );
  const accepted = await request('/chat-invitations/accept', { who: null, method: 'POST', body });
  assert.equal(accepted.status, 201);
  guest = { ...accepted.data, cookie: accepted.response.headers.get('set-cookie').split(';')[0] };
  assert.equal(guest.user.role, 'guest');
  assert.equal(guest.user.company, 'Partner Inc');
  assert.equal(
    (await request('/chat-invitations/accept', { who: null, method: 'POST', body })).status,
    400,
  );
  const state = (await request('/state', { who: guest })).data;
  assert.deepEqual(
    state.channels.map((c) => c.id),
    [group.id],
  );
  for (const kind of ['projects', 'documents', 'timesheets', 'leave', 'calendars', 'files'])
    assert.equal(state[kind].length, 0);
  const people = (await request('/users', { who: guest })).data;
  assert.ok(people.some((u) => u.id === member.user.id));
  assert.ok(!people.some((u) => u.id === outsider.user.id));
  for (const url of [
    '/organisation',
    '/audit',
    '/ai/settings',
    '/entities/documents',
    '/chat/admin/conversations',
  ])
    assert.equal((await request(url, { who: guest })).status, 403, url);
  assert.equal(
    (
      await request('/chat/direct', {
        who: guest,
        method: 'POST',
        body: { userId: outsider.user.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/chat/conversations', {
        who: guest,
        method: 'POST',
        body: { title: 'Escape', visibility: 'workspace' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/chat/' + group.id + '/invitations', {
        who: guest,
        method: 'POST',
        body: { email: 'escape@test.com', company: 'X' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/entities/messages', {
        who: guest,
        method: 'POST',
        body: { channelId: group.id, text: 'Hello from Partner Inc' },
      })
    ).status,
    201,
  );
  const call = await request('/chat/' + group.id + '/call', {
    who: guest,
    method: 'POST',
    body: { mode: 'audio' },
  });
  assert.equal(call.status, 201);
  assert.equal((await request('/rtc-config', { who: guest })).status, 200);
  const current = runtime.store.get('channels', group.id);
  const removed = await request('/chat/' + group.id + '/members', {
    who: member,
    method: 'PUT',
    body: {
      memberIds: current.memberIds.filter((id) => id !== guest.user.id),
      version: current.version,
    },
  });
  assert.equal(removed.status, 200);
  assert.equal((await request('/chat/' + group.id + '/attachments', { who: guest })).status, 403);
  assert.equal((await request('/entities/events', { who: guest })).data.length, 0);
  assert.equal(
    (
      await request('/entities/messages', {
        who: guest,
        method: 'POST',
        body: { channelId: group.id, text: 'Removed user' },
      })
    ).status,
    403,
  );
  for (const mode of ['revoked', 'expired']) {
    const v = await request('/chat/' + group.id + '/invitations', {
      who: member,
      method: 'POST',
      body: { email: mode + '@partner.test', company: 'Partner' },
    });
    assert.equal(v.status, 201);
    if (mode === 'revoked')
      assert.equal(
        (
          await request('/chat/' + group.id + '/invitations/' + v.data.id, {
            who: member,
            method: 'DELETE',
          })
        ).status,
        200,
      );
    else {
      const i = runtime.store.get('chatInvites', v.data.id);
      runtime.store.put(
        'chatInvites',
        { ...i, expires: '2000-01-01T00:00:00Z' },
        member.user.id,
        i.id,
        i.version,
      );
    }
    assert.equal(
      (
        await request('/chat-invitations/accept', {
          who: null,
          method: 'POST',
          body: { ...body, token: v.data.token },
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request('/users/' + guest.user.id, {
        method: 'PATCH',
        body: { active: false, role: 'guest' },
      })
    ).status,
    200,
  );
  assert.equal((await request('/me', { who: guest })).status, 401);
});

test('administrators review private messages through reasoned audited routes only', async () => {
  assert.equal((await request('/chat/admin/conversations', { who: member })).status, 403);
  assert.equal((await request('/chat/admin/conversations')).status, 200);
  const route = '/chat/admin/' + conversation.id + '/review';
  assert.equal((await request(route, { method: 'POST', body: { reason: 'short' } })).status, 400);
  const reviewed = await request(route, {
    method: 'POST',
    body: { reason: 'Review a reported incident' },
  });
  assert.equal(reviewed.status, 200);
  assert.ok(reviewed.data.messages.some((m) => m.text.includes('Source')));
  const a = reviewed.data.attachments[0];
  assert.ok(a);
  assert.equal((await request('/chat/attachments/' + a.id + '/download')).status, 403);
  assert.equal(
    (
      await request(
        '/chat/admin/attachments/' + a.id + '/download?reason=Investigating%20reported%20file',
        { raw: true },
      )
    ).status,
    200,
  );
  const audits = runtime.store.db
    .prepare("SELECT action,detail FROM audit WHERE actor=? AND action LIKE 'chat.review.%'")
    .all(admin.user.id);
  assert.ok(
    audits.some(
      (a) =>
        a.action === 'chat.review.read' &&
        JSON.parse(a.detail).reason === 'Review a reported incident',
    ),
  );
  assert.ok(audits.some((a) => a.action === 'chat.review.download'));
});

test('external meeting cards allow only provider meeting URLs and never authenticate as the provider', async () => {
  const url = '/chat/' + group.id + '/external-meeting';
  for (const link of [
    'javascript:alert(1)',
    'https://meet.google.com.evil.test/abc-defg-hij',
    'https://meet.google.com@evil.test/abc-defg-hij',
    'http://meet.google.com/abc-defg-hij',
    'https://teams.microsoft.com/evil',
    'https://meet.google.com:8443/abc-defg-hij',
  ])
    assert.equal(
      (await request(url, { who: member, method: 'POST', body: { title: 'Meeting', url: link } }))
        .status,
      400,
      link,
    );
  for (const link of [
    'https://meet.google.com/abc-defg-hij',
    'https://teams.microsoft.com/l/meetup-join/test?context=x',
  ]) {
    const result = await request(url, {
      who: member,
      method: 'POST',
      body: { title: 'Client meeting', url: link },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.externalMeeting.url, link);
    assert.ok(['Google Meet', 'Microsoft Teams'].includes(result.data.externalMeeting.provider));
  }
});
