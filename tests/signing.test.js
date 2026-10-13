import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { OpenSslSigner } from '../server/signing.js';
test('PKCS#12 produces a cryptographically verifiable detached PDF signature', async () => {
  const openssl =
    process.env.OPENSSL_BIN ||
    (process.platform === 'win32' ? 'D:\\Git\\mingw64\\bin\\openssl.exe' : 'openssl');
  const dir = mkdtempSync(path.join(tmpdir(), 'office-cert-test-'));
  const previous = {
    bin: process.env.OPENSSL_BIN,
    p12: process.env.PDF_P12_PATH,
    pass: process.env.PDF_P12_PASSPHRASE,
  };
  const run = (args) => execFileSync(openssl, args, { cwd: dir, stdio: 'pipe', windowsHide: true });
  try {
    run([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      'key.pem',
      '-out',
      'cert.pem',
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=Reverse Office Test',
    ]);
    run([
      'pkcs12',
      '-export',
      '-out',
      'test.p12',
      '-inkey',
      'key.pem',
      '-in',
      'cert.pem',
      '-passout',
      'pass:test-only-passphrase',
    ]);
    process.env.OPENSSL_BIN = openssl;
    process.env.PDF_P12_PATH = path.join(dir, 'test.p12');
    process.env.PDF_P12_PASSPHRASE = 'test-only-passphrase';
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdflibAddPlaceholder({
      pdfDoc: pdf,
      reason: 'Test signature',
      name: 'Test signer',
      contactInfo: 'test@example.test',
      location: 'Test',
      signatureLength: 16384,
    });
    const signed = await new SignPdf().sign(
      Buffer.from(await pdf.save({ useObjectStreams: false })),
      new OpenSslSigner(),
    );
    const text = signed.toString('latin1'),
      match = text.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    assert.ok(match);
    const [, a, b, c, d] = match.map(Number),
      bytes = Buffer.concat([signed.subarray(a, a + b), signed.subarray(c, c + d)]);
    const signature = Buffer.from(text.slice(a + b, c).replace(/[<>\s]/g, ''), 'hex');
    writeFileSync(path.join(dir, 'content.bin'), bytes);
    writeFileSync(path.join(dir, 'sig.der'), signature);
    run([
      'cms',
      '-verify',
      '-binary',
      '-inform',
      'DER',
      '-in',
      'sig.der',
      '-content',
      'content.bin',
      '-CAfile',
      'cert.pem',
      '-out',
      'verified.bin',
    ]);
    assert.deepEqual(readFileSync(path.join(dir, 'verified.bin')), bytes);
    bytes[0] ^= 1;
    writeFileSync(path.join(dir, 'content.bin'), bytes);
    assert.throws(() =>
      run([
        'cms',
        '-verify',
        '-binary',
        '-inform',
        'DER',
        '-in',
        'sig.der',
        '-content',
        'content.bin',
        '-CAfile',
        'cert.pem',
        '-out',
        'tampered.bin',
      ]),
    );
  } finally {
    for (const [k, value] of Object.entries({
      OPENSSL_BIN: previous.bin,
      PDF_P12_PATH: previous.p12,
      PDF_P12_PASSPHRASE: previous.pass,
    })) {
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
