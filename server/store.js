import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'office.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,owner TEXT NOT NULL REFERENCES users(id),version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS entity_kind ON entities(kind);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,previous TEXT NOT NULL,hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;`);
  const unpack = (row) =>
    row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          owner: row.owner,
          version: row.version,
          created: row.created,
          updated: row.updated,
        }
      : null;
  const all = (kind) =>
    db.prepare('SELECT * FROM entities WHERE kind=? ORDER BY updated DESC').all(kind).map(unpack);
  const get = (kind, id) =>
    unpack(db.prepare('SELECT * FROM entities WHERE kind=? AND id=?').get(kind, id));
  function audit(actor, action, target, detail = {}) {
    const previous =
      db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get()?.hash ?? 'GENESIS';
    const time = new Date().toISOString(),
      json = JSON.stringify(detail);
    const hash = digest(JSON.stringify([time, actor, action, target, json, previous]));
    db.prepare(
      'INSERT INTO audit(time,actor,action,target,detail,previous,hash) VALUES (?,?,?,?,?,?,?)',
    ).run(time, actor, action, target, json, previous, hash);
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  function put(kind, data, owner, id = randomUUID(), version) {
    return transaction(() => {
      const old = get(kind, id),
        now = new Date().toISOString();
      if (old && version !== old.version)
        throw Object.assign(Error('This item changed. Refresh before saving.'), { status: 409 });
      db.prepare(
        'INSERT INTO entities(id,kind,data,owner,version,created,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated=excluded.updated',
      ).run(
        id,
        kind,
        JSON.stringify(data),
        old?.owner ?? owner,
        (old?.version ?? 0) + 1,
        old?.created ?? now,
        now,
      );
      audit(owner, old ? 'update' : 'create', `${kind}/${id}`, {
        title: data.title ?? data.description ?? '',
        version: (old?.version ?? 0) + 1,
      });
      return get(kind, id);
    });
  }
  function remove(kind, id, actor) {
    return transaction(() => {
      db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind, id);
      audit(actor, 'delete', `${kind}/${id}`);
    });
  }
  const users = () =>
    db.prepare('SELECT id,name,email,role,active,created FROM users ORDER BY name').all();
  function addUser({ name, email, password, role = 'member' }) {
    const id = randomUUID();
    db.prepare('INSERT INTO users(id,name,email,password,role,created) VALUES (?,?,?,?,?,?)').run(
      id,
      name,
      email.toLowerCase(),
      hashPassword(password),
      role,
      new Date().toISOString(),
    );
    return users().find((u) => u.id === id);
  }
  return { db, all, get, put, remove, audit, users, addUser, transaction, close: () => db.close() };
}
