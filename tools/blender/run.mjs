// npm run model: drawings → Blender → light GLB
//   1. tools/blender/export.mjs   exterior triangles of the type-4 block (tools/blender/out/block_t4.json)
//   2. Blender (block1.py)        welds, bevels the corners, bakes ambient occlusion → public/models/blok1.glb
//   3. compress.mjs               meshopt geometry + WebP occlusion map (the app decodes meshopt itself)
// Blender: $BLENDER, else D:/blender-program/blender.exe or D:/blender.exe (owner's computer), else `blender` on the PATH.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const blender = process.env.BLENDER || ['D:/blender-program/blender.exe', 'D:/blender.exe'].find((p) => existsSync(p)) || 'blender';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('node', ['tools/blender/export.mjs']);
run(blender, ['-b', '--factory-startup', '-P', 'tools/blender/block1.py']);
run('node', ['tools/blender/compress.mjs']);
