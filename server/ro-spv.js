import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { parseXML } from './ro-invoices.js';
const fail = (message, status = 502) => {
  throw Object.assign(Error(message), { status });
};
export function encryptToken(value, hexKey) {
  if (!/^[a-f0-9]{64}$/i.test(hexKey ?? ''))
    fail('Configure a 32-byte SPV_ENCRYPTION_KEY (64 hexadecimal characters)', 503);
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv),
    body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    body: body.toString('hex'),
  });
}
export function decryptToken(value, hexKey) {
  const item = JSON.parse(value),
    cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(hexKey, 'hex'),
      Buffer.from(item.iv, 'hex'),
    );
  cipher.setAuthTag(Buffer.from(item.tag, 'hex'));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(item.body, 'hex')), cipher.final()]).toString(),
  );
}
export class AnafClient {
  constructor({ environment = 'test', fetcher = fetch, tokenProvider, base, validationUrl } = {}) {
    if (!['test', 'production'].includes(environment))
      fail('ANAF_ENV must be test or production', 503);
    this.environment = environment;
    this.fetcher = fetcher;
    this.tokenProvider = tokenProvider;
    this.base =
      base ?? `https://api.anaf.ro/${environment === 'production' ? 'prod' : 'test'}/FCTEL/rest`;
    this.validationUrl =
      validationUrl ?? 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1';
  }
  async request(endpoint, { method = 'GET', body, query = {}, binary = false, publicUrl } = {}) {
    const url = new URL(publicUrl ?? `${this.base}/${endpoint}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    const headers = {
      Accept: binary ? 'application/zip' : 'application/json, application/xml',
      'Content-Type': 'text/plain;charset=utf-8',
    };
    if (!publicUrl) headers.Authorization = `Bearer ${await this.tokenProvider()}`;
    const response = await this.fetcher(url, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      fail(
        `ANAF returned HTTP ${response.status}. Inspect the local submission record before retrying.`,
      );
    const reader = response.body?.getReader();
    let bytes;
    if (reader) {
      const parts = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 25 * 1024 * 1024) {
          await reader.cancel();
          fail('ANAF response exceeded the size limit');
        }
        parts.push(Buffer.from(value));
      }
      bytes = Buffer.concat(parts);
    } else bytes = Buffer.from(await response.arrayBuffer());
    if (binary) return bytes;
    const text = bytes.toString('utf8');
    if (text.trim().startsWith('{')) return JSON.parse(text);
    if (!text.trim().startsWith('<')) fail('Unexpected ANAF response');
    const parsed = parseXML(text);
    if (!parsed.header && !parsed.Header) fail('Unexpected ANAF XML response');
    return parsed.header ?? parsed.Header;
  }
  validate(xml) {
    return this.request('', { method: 'POST', body: xml, publicUrl: this.validationUrl });
  }
  async upload(xml, cif) {
    const data = await this.request('upload', {
      method: 'POST',
      body: xml,
      query: { standard: 'UBL', cif },
    });
    if (String(data.ExecutionStatus) !== '0' || !/^\d+$/.test(String(data.index_incarcare ?? '')))
      return { accepted: false, error: JSON.stringify(data).slice(0, 3000) };
    return { accepted: true, index: String(data.index_incarcare) };
  }
  status(index) {
    if (!/^\d+$/.test(index)) fail('Invalid upload index', 400);
    return this.request('stareMesaj', { query: { id_incarcare: index } });
  }
  list(cif, days = 30) {
    return this.request('listaMesajeFactura', { query: { cif, zile: days } });
  }
  download(id) {
    if (!/^\d+$/.test(id)) fail('Invalid message ID', 400);
    return this.request('descarcare', { query: { id }, binary: true });
  }
}
