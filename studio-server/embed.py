# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Reverse Office contributors
# Build-time only. This script and Python are not copied to the runtime image.
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent.parent
web = root / 'public' / 'studio'
names = ['index.html', 'app.js', 'core.js', 'formats.js', 'styles.css', 'LICENSE']
allowed = set(names)
if {p.name for p in web.iterdir() if p.is_file()} != allowed:
    raise SystemExit('Unexpected Studio assets; update the reviewed file allowlist first.')
inventory = []
items = []
for name in names:
    data = (web / name).read_bytes()
    if name != 'LICENSE' and b'SPDX-License-Identifier: MIT' not in data[:250]:
        raise SystemExit('Missing original-source license marker: ' + name)
    mime = {'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}.get(name.split('.')[-1], 'text/plain; charset=utf-8')
    items.append(('/'+name, mime, data))
    inventory.append({'path':name,'license':'MIT','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
manifest = {'artifact':'Reverse Studio standalone','scope':'Final container contents only; browser, host kernel and build tools are not distributed in this image.','runtime':'Original freestanding Linux x86-64 static server; no libc, interpreter, loader, shared libraries or OS packages.','license':'MIT','assets':inventory,'serverSourceSha256':hashlib.sha256((root/'studio-server'/'server.c').read_bytes()).hexdigest(),'limitations':'Local browser storage; no company backend or Office service included.'}
items.append(('/manifest.json','application/json',json.dumps(manifest,indent=2).encode()))
items.append(('/health','text/plain',b'ok'))
lines=[]
for i,(_,_,data) in enumerate(items):
    lines.append('static const unsigned char data_%d[]={%s};' % (i,','.join(str(b) for b in data)))
lines.append('static const struct asset assets[]={')
for i,(path,mime,data) in enumerate(items):
    lines.append('{"%s","%s",data_%d,%d},' % (path,mime,i,len(data)))
lines.append('};\n#define ASSET_COUNT %d' % len(items))
(root/'studio-server'/'assets.h').write_text('\n'.join(lines),encoding='ascii')
(root/'studio-server'/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
