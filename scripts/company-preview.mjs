// SPDX-License-Identifier: MIT
// Development preview only: does not create or approve a distributable company image.
import { existsSync } from 'node:fs';
import path from 'node:path';
const directory = path.resolve(process.env.PREVIEW_DATA_DIR || 'data/company-preview');
if (!existsSync(path.join(directory, 'office.sqlite'))) {
  throw Error(
    'Preview data is missing. Prepare a consistent, protected copy of the company database and files first.',
  );
}
process.env.DATA_DIR = directory;
process.env.PORT = '3003';
process.env.HOST = '127.0.0.1';
process.env.APP_ORIGIN = 'http://localhost:3003';
process.env.SESSION_COOKIE = 'ro_preview';
process.env.COOKIE_SECURE = 'false';
process.env.PREVIEW_MODE = 'true';
console.log(
  'Development preview uses an isolated data copy. Changes do not sync with the Docker deployment.',
);
await import('../server/index.js');
