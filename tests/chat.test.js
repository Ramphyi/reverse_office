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
