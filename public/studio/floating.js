// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Reverse Office contributors
// Original dependency-free pointer/keyboard window controls, shared by both applications.
export function bindFloating(panel, handle, resize, key) {
  let box;
  try {
    box = JSON.parse(localStorage.getItem(key));
  } catch {}
  if (!box || !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(box[k])))
    box = { x: innerWidth - 460, y: innerHeight - 740, width: 430, height: 660 };
  const clamp = () => {
    box.width = Math.max(Math.min(330, innerWidth - 16), Math.min(box.width, innerWidth - 16));
    box.height = Math.max(Math.min(380, innerHeight - 16), Math.min(box.height, innerHeight - 16));
    box.x = Math.max(8, Math.min(box.x, innerWidth - box.width - 8));
    box.y = Math.max(8, Math.min(box.y, innerHeight - box.height - 8));
    Object.assign(panel.style, {
      left: box.x + 'px',
      top: box.y + 'px',
      width: box.width + 'px',
      height: box.height + 'px',
      right: 'auto',
      bottom: 'auto',
    });
  };
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(box));
    } catch {}
  };
  const cleanup = [];
  for (const [element, sizing] of [
    [handle, false],
    [resize, true],
  ]) {
    let start = null;
    const down = (e) => {
      if (e.button !== 0 || (!sizing && e.target.closest('button,input,select,textarea,a'))) return;
      e.preventDefault();
      element.setPointerCapture(e.pointerId);
      start = { ...box, px: e.clientX, py: e.clientY };
      panel.dataset.moving = 'true';
    };
    const move = (e) => {
      if (!start) return;
      const dx = e.clientX - start.px,
        dy = e.clientY - start.py;
      box = sizing
        ? { ...box, width: start.width + dx, height: start.height + dy }
        : { ...box, x: start.x + dx, y: start.y + dy };
      clamp();
    };
    const end = () => {
      start = null;
      delete panel.dataset.moving;
      persist();
    };
    const keyboard = (e) => {
      if (
        e.target !== element ||
        !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)
      )
        return;
      e.preventDefault();
      if (e.key === 'Home')
        box = { x: innerWidth - 460, y: innerHeight - 740, width: 430, height: 660 };
      else {
        const step = e.shiftKey ? 40 : 10;
        const horizontal = ['ArrowLeft', 'ArrowRight'].includes(e.key);
        box[sizing ? (horizontal ? 'width' : 'height') : horizontal ? 'x' : 'y'] +=
          (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1) * step;
      }
      clamp();
      persist();
    };
    for (const [event, fn] of Object.entries({
      pointerdown: down,
      pointermove: move,
      pointerup: end,
      pointercancel: end,
      lostpointercapture: end,
      keydown: keyboard,
    })) {
      element.addEventListener(event, fn);
      cleanup.push(() => element.removeEventListener(event, fn));
    }
  }
  addEventListener('resize', clamp);
  clamp();
  return {
    reset: () => {
      box = { x: innerWidth - 660, y: 60, width: 640, height: innerHeight - 110 };
      clamp();
      persist();
    },
    destroy: () => {
      cleanup.forEach((f) => f());
      removeEventListener('resize', clamp);
    },
  };
}

export async function prepareImage(file) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error('Choose a PNG, JPEG or WebP image under 10 MB.');
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40000000) throw Error('Image dimensions are too large.');
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.8);
    if (data.length > 700000) throw Error('Image is too detailed. Crop it before attaching.');
    return { name: file.name.slice(0, 120), data };
  } finally {
    image.close();
  }
}
