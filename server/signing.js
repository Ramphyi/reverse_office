import { Signer } from '@signpdf/utils';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
// Use the host's maintained OpenSSL implementation; no custom ASN.1 or signature verification.
export class OpenSslSigner extends Signer {
  async sign(buffer) {
    const directory = await mkdtemp(path.join(tmpdir(), 'reverse-office-sign-'));
    const pem = path.join(directory, 'identity.pem'),
      input = path.join(directory, 'content.bin'),
      output = path.join(directory, 'signature.der');
    const options = {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      encoding: 'buffer',
      env: { ...process.env, RO_P12_SECRET: process.env.PDF_P12_PASSPHRASE || '' },
    };
    try {
      const { stdout } = await run(
        process.env.OPENSSL_BIN || 'openssl',
        ['pkcs12', '-in', process.env.PDF_P12_PATH, '-nodes', '-passin', 'env:RO_P12_SECRET'],
        options,
      );
      await writeFile(pem, stdout, { mode: 0o600 });
      stdout.fill(0);
      await writeFile(input, buffer, { mode: 0o600 });
      await run(
        process.env.OPENSSL_BIN || 'openssl',
        [
          'cms',
          '-sign',
          '-binary',
          '-in',
          input,
          '-signer',
          pem,
          '-inkey',
          pem,
          '-outform',
          'DER',
          '-out',
          output,
          '-nosmimecap',
          '-md',
          'sha256',
        ],
        options,
      );
      return await readFile(output);
    } catch (error) {
      throw Object.assign(
        Error(
          error.code === 'ENOENT'
            ? 'OpenSSL is not installed; configure OPENSSL_BIN'
            : 'Certificate signing failed. Check the PKCS#12 certificate and passphrase.',
        ),
        { status: 503 },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
