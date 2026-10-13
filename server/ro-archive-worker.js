import { parentPort, workerData } from 'node:worker_threads';
import JSZip from 'jszip';
import { checkZipLimits } from './exports.js';
import { readIncomingInvoice } from './ro-invoices.js';
try {
  const bytes = Buffer.from(workerData.bytes);
  checkZipLimits(bytes);
  const zip = await JSZip.loadAsync(bytes),
    matches = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.toLowerCase().endsWith('.xml')) continue;
    const xml = await entry.async('string');
    if (/<(?:\w+:)?Invoice[\s>]/.test(xml)) matches.push(xml);
  }
  if (matches.length !== 1) throw Error('The archive must contain exactly one UBL invoice');
  parentPort.postMessage({ result: readIncomingInvoice(matches[0], workerData.cui) });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
