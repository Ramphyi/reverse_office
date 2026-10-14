import { Worker } from 'node:worker_threads';
export function safeImport(file, mode = 'import') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import-worker.js', import.meta.url), {
      workerData: { originalname: file.originalname, buffer: file.buffer, mode },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(Object.assign(error, { status: 400 })) : resolve(value);
    };
    const timeout = setTimeout(
      () => finish(Error('Import exceeded the 15 second processing limit')),
      15000,
    );
    worker.once('message', (data) => finish(data.error ? Error(data.error) : null, data.result));
    worker.once('error', (e) => finish(e));
    worker.once('exit', (code) => {
      if (!settled) finish(Error(`Import worker exited (${code})`));
    });
  });
}
