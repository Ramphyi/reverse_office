// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { save, type Item } from './api';
import { fileDownload } from './DriveSharing';
// @ts-expect-error Original MIT Office-format importer.
import { importFile } from '../public/studio/formats.js';
export function CompatibleDocument({
  doc,
  onOpen,
  onClose,
}: {
  doc: Item;
  onOpen: (d: Item) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="compatibility-panel">
      <h2>{doc.title}</h2>
      <p>
        This document uses the earlier editor format. Create a separate editable Studio copy to work
        with our independent editors. Your original file and revision history remain available.
      </p>
      <p>
        Complex layouts, macros, pivot tables and unsupported objects may not survive import into
        the copy. Compare the result with your original before using it.
      </p>
      <div className="heading-actions">
        <a className="button secondary" href={fileDownload(doc)}>
          Download original
        </a>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await fetch(fileDownload(doc));
              if (!r.ok) throw Error('Original file is not accessible');
              const extension =
                doc.kind === 'sheet' ? 'xlsx' : doc.kind === 'slides' ? 'pptx' : 'docx';
              const content = await importFile(
                new File([await r.blob()], doc.title + '.' + extension),
              );
              const copy = await save('documents', {
                title: doc.title + ' · Studio copy',
                kind: doc.kind,
                projectId: doc.projectId || '',
                folderId: doc.folderId || '',
                content,
              });
              onOpen(copy);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Importing…' : 'Create editable Studio copy'}
        </button>
        <button className="button secondary" onClick={onClose}>
          Back
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
