import { parentPort, workerData } from 'node:worker_threads';
import { importOffice } from './exports.js';
try {
  const result = await importOffice({ ...workerData, buffer: Buffer.from(workerData.buffer) });
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
