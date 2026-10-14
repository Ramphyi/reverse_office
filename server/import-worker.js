import { parentPort, workerData } from 'node:worker_threads';
import { importOffice, checkZipLimits } from './exports.js';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
try {
  const buffer = Buffer.from(workerData.buffer);
  let result;
  if (workerData.mode === 'context') {
    checkZipLimits(buffer);
    const zip = await JSZip.loadAsync(buffer),
      parser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        processEntities: false,
      });
    const parts = Object.keys(zip.files)
      .filter((n) =>
        /^(word\/(document|header\d+|footer\d+)\.xml|xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml|ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml)$/.test(
          n,
        ),
      )
      .slice(0, 20);
    const snippets = [];
    let remaining = 40000;
    for (const part of parts) {
      if (remaining <= 0) break;
      const text = JSON.stringify(parser.parse(await zip.file(part).async('string'))).slice(
        0,
        Math.min(remaining, 12000),
      );
      snippets.push({ part, data: text });
      remaining -= text.length;
    }
    result = {
      note: 'Saved native file; bounded XML excerpts. Unsaved edits are not included.',
      parts: snippets,
    };
  } else result = await importOffice({ ...workerData, buffer });
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
