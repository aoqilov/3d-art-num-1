// node tools/unreal/checkglb.mjs <file.glb> — triangles per primitive, how many have an edge longer than 4 m
// (the block has none that long but its slabs) and the bounding box: a check of the export's geometry.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const v = (i, o) => pos.getElement(idx ? idx.getScalar(i) : i, o);
    let long = 0, maxE = 0; const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    const d = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    for (let i = 0; i + 2 < n; i += 3) {
      v(i, a); v(i + 1, b); v(i + 2, c);
      const e = Math.max(d(a, b), d(b, c), d(c, a));
      if (e > 4) long++; if (e > maxE) maxE = e;
    }
    console.log(`${mesh.getName()} ${p.getMaterial()?.getName()}: ${n / 3} tris, >4 m: ${long}, longest ${maxE.toFixed(1)} m, bbox ${pos.getMin([]).map((x) => x.toFixed(1))} .. ${pos.getMax([]).map((x) => x.toFixed(1))}`);
  }
}
