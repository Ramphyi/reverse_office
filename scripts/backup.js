import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';
// Run while the application is stopped so SQLite and file blobs form one coherent snapshot.
const source = path.resolve(process.env.DATA_DIR || 'data'),
  destination = path.resolve(
    process.argv[2] || `backups/${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
if (destination === source || destination.startsWith(source + path.sep))
  throw Error('Backup destination must be outside the live data directory');
if (existsSync(destination))
  throw Error('Destination already exists; choose a new empty backup path');
mkdirSync(destination, { recursive: true });
const db = new DatabaseSync(path.join(source, 'office.sqlite'));
db.prepare('VACUUM INTO ?').run(path.join(destination, 'office.sqlite'));
db.close();
if (existsSync(path.join(source, 'files')))
  cpSync(path.join(source, 'files'), path.join(destination, 'files'), {
    recursive: true,
    errorOnExist: true,
  });
console.log(`Backup created: ${destination}`);
