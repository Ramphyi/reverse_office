// SPDX-License-Identifier: MIT
import { z } from 'zod';
const key = (kind, id) => `drive:${kind}:${id}`;
export function drivePermission(store, user, kind, item) {
  if (!item || !['files', 'documents'].includes(kind)) return null;
  const policy = store.get('drivePermissions', key(kind, item.id));
  if (!policy || policy.mode === 'project') return null;
  if (item.owner === user.id) return 'owner';
  if (policy.mode === 'workspace' && user.role !== 'guest') return 'viewer';
  if (policy.mode === 'people' && policy.userIds.includes(user.id)) return 'viewer';
  return 'none';
}
export function installDriveSharing(app, { store, readable, fail, visible }) {
  const target = (req) => {
    if (!['files', 'documents'].includes(req.params.kind)) fail(400, 'Choose a file or document');
    const item = store.get(req.params.kind, req.params.id);
    if (
      !item ||
      (item.owner !== req.user.id &&
        !(req.user.role === 'admin' && readable(req.user, req.params.kind, item)))
    )
      fail(403, 'Only the owner or an administrator with access can change sharing');
    return item;
  };
  app.get('/api/drive/:kind/:id/sharing', (req, res) => {
    const item = target(req),
      policy = store.get('drivePermissions', key(req.params.kind, item.id));
    res.json(policy || { mode: 'project', userIds: [], version: 0 });
  });
  app.put('/api/drive/:kind/:id/sharing', (req, res) => {
    const item = target(req),
      data = z
        .object({
          mode: z.enum(['private', 'project', 'workspace', 'people']),
          userIds: z.array(z.string().max(100)).max(100).default([]),
          version: z.number().int(),
        })
        .parse(req.body);
    const id = key(req.params.kind, item.id),
      old = store.get('drivePermissions', id);
    if (data.version !== (old?.version || 0)) fail(409, 'Sharing changed. Refresh before saving');
    if (
      new Set(data.userIds).size !== data.userIds.length ||
      data.userIds.some((id) => !store.users().some((u) => u.id === id && u.active))
    )
      fail(400, 'Choose active unique accounts');
    store.transaction(() => {
      store.put(
        'drivePermissions',
        { mode: data.mode, userIds: data.mode === 'people' ? data.userIds : [] },
        req.user.id,
        id,
        old?.version,
      );
      store.audit(req.user.id, 'drive.sharing', `${req.params.kind}/${item.id}`, {
        mode: data.mode,
        userIds: data.userIds,
      });
      // Invalidate native editing sessions when sharing changes; old callback tickets must not survive.
      store.db.prepare('UPDATE office_sessions SET active=0 WHERE entity_id=?').run(item.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/drive/shared', (req, res) =>
    res.json(
      ['files', 'documents'].flatMap((kind) =>
        store
          .all(kind)
          .filter((item) => readable(req.user, kind, item))
          .map((item) => ({ ...visible(req.user, kind, item), collection: kind })),
      ),
    ),
  );
}
