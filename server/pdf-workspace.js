// SPDX-License-Identifier: MIT
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { digest } from './store.js';
export function installPdfWorkspace(app, { store, readable, writable, office, uploadDir, fail }) {
  const load = (req, id, edit = false) => {
    const file = store.get('files', id);
    if (!file || !readable(req.user, 'files', file) || (edit && !writable(req.user, 'files', file)))
      fail(403, 'PDF is not accessible');
    if (file.mime !== 'application/pdf') fail(400, 'Choose a PDF');
    if (edit && file.signature) fail(409, 'Signed copies cannot be edited');
    return { file, bytes: office.getAsset(id)?.bytes || readFileSync(path.join(uploadDir, id)) };
  };
  app.get('/api/files/:id/pdf-info', async (req, res) => {
    const { bytes } = load(req, req.params.id);
    const doc = await PDFDocument.load(bytes);
    res.json({
      pages: doc.getPages().map((p, i) => ({
        page: i + 1,
        width: p.getWidth(),
        height: p.getHeight(),
        rotation: p.getRotation().angle,
      })),
      fields: doc
        .getForm()
        .getFields()
        .map((f) => ({ name: f.getName(), type: f.constructor.name })),
    });
  });
  app.post('/api/files/:id/pdf-edit', async (req, res) => {
    const { file, bytes } = load(req, req.params.id, true);
    const input = z
      .object({
        page: z.number().int().min(1).max(2000),
        action: z.enum(['text', 'rotate', 'remove', 'form']),
        text: z.string().max(2000).default(''),
        x: z.number().min(0).max(20000).default(50),
        y: z.number().min(0).max(20000).default(50),
        size: z.number().min(6).max(96).default(12),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#1d3930'),
        field: z.string().max(300).default(''),
      })
      .parse(req.body);
    const doc = await PDFDocument.load(bytes);
    if (input.page > doc.getPageCount()) fail(400, 'Page does not exist');
    const page = doc.getPage(input.page - 1);
    if (input.action === 'rotate') page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    if (input.action === 'remove') {
      if (doc.getPageCount() === 1) fail(400, 'Keep at least one page');
      doc.removePage(input.page - 1);
    }
    if (input.action === 'text') {
      if (!input.text.trim()) fail(400, 'Enter annotation text');
      if (input.x >= page.getWidth() || input.y >= page.getHeight())
        fail(400, 'Text position is outside the page');
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(input.text, {
        x: input.x,
        y: page.getHeight() - input.y - input.size,
        size: input.size,
        font,
        maxWidth: page.getWidth() - input.x,
        color: rgb(...[1, 3, 5].map((i) => parseInt(input.color.slice(i, i + 2), 16) / 255)),
      });
    }
    if (input.action === 'form') {
      const form = doc.getForm(),
        field = form.getField(input.field);
      if (typeof field.setText === 'function') field.setText(input.text);
      else if (typeof field.check === 'function') {
        if (input.text === 'true') field.check();
        else if (input.text === 'false') field.uncheck();
        else fail(400, 'Checkbox value must be true or false');
      } else fail(400, 'This field type is not supported');
      form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
    }
    const output = await doc.save();
    load(req, req.params.id, true);
    const id = randomUUID();
    writeFileSync(path.join(uploadDir, id), output, { flag: 'wx' });
    try {
      const copy = store.put(
        'files',
        {
          title: file.title.replace(/\.pdf$/i, '') + ' · edited.pdf',
          mime: 'application/pdf',
          size: output.length,
          projectId: '',
          folderId: '',
          sha256: digest(output),
          sourceId: file.id,
        },
        req.user.id,
        id,
      );
      store.audit(req.user.id, 'pdf.edit-copy', id, { source: file.id, action: input.action });
      res.status(201).json(copy);
    } catch (e) {
      unlinkSync(path.join(uploadDir, id));
      throw e;
    }
  });
}
