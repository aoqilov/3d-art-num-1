"""Procedural, tileable PBR sets for streets: asphalt, concrete pavers, sidewalk slabs, curb stone.

Same map layout as tools/pbr_textures.py (<name>_a / _n / _orm .jpg) and reuses its helpers.
Usage: python3 tools/road_textures.py [out_dir]      (default public-pro/pro/tex)
"""
import json
import sys
from pathlib import Path

sys.argv = sys.argv[:1] + [sys.argv[1] if len(sys.argv) > 1 else 'public-pro/pro/tex']
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np                                   # noqa: E402
import pbr_textures as P                             # noqa: E402
from pbr_textures import N, noise, blur, normal_from_height, ao_from_height, hexc, tint, save  # noqa: E402

OUT = P.OUT
rng = np.random.default_rng(11)
SETS = {}


def reg(name, tile, note):
    SETS[name] = {'tile': tile, 'note': note}


# ---------------------------------------------------------------- asphalt
def asphalt(name, base, tile, aggregate=0.5, wear=0.0, patches=0, cracks=0.0, note=''):
    mott = noise(1.3, 1, 10)
    grain = noise(0.2, 200)                                 # aggregate stones, ~5 mm
    stones = np.clip(grain * 2.5 - 1.0, 0, 1)
    alb = tint(hexc(base), [0.10, 0.04], mott, noise(0.9, 60))
    alb = alb * (1 + aggregate * 0.9 * stones[..., None])  # exposed light stones
    h = 0.6 * stones + 0.15 * noise(1.2, 8)
    rough = 0.88 + 0.06 * mott - 0.05 * stones
    if wear:                                               # bleached, polished wheel tracks
        tracks = np.clip(np.sin(xx_ * np.pi * 2 * 2) * 0.5 + 0.5, 0, 1) ** 3 * (0.5 + 0.5 * noise(1.5, 1, 6))
        alb = alb * (1 + wear * 0.35 * tracks[..., None])
        rough = rough - 0.08 * wear * tracks
    for _ in range(patches):                               # darker, newer rectangular repairs
        w, d = rng.uniform(0.12, 0.3), rng.uniform(0.08, 0.22)
        x0, y0 = rng.uniform(0, 1), rng.uniform(0, 1)
        dx = (xx_ - x0) % 1; dy = (yy_ - y0) % 1
        m = (dx < w) & (dy < d)
        edge = m & ((dx < 0.004) | (dx > w - 0.004) | (dy < 0.004) | (dy > d - 0.004))
        alb[m] = alb[m] * 0.7
        rough[m] -= 0.04
        alb[edge] = alb[edge] * 0.45
        h[edge] -= 0.6
    if cracks:                                             # ridged noise → thin branching cracks
        warp = noise(1.6, 1, 8, 21)
        c = (1 - np.abs(noise(1.2, 2, 60) + 0.25 * warp)) ** 260
        c = blur(np.clip(c * cracks, 0, 1), 1)
        alb = alb * (1 - 0.6 * c[..., None])
        h = h - 0.5 * c
    save(name, alb, normal_from_height(h, 3.0), ao_from_height(h, 3, 2.5), rough)
    reg(name, tile, note)


# ---------------------------------------------------------------- concrete block pavers (bruschatka)
def pavers(name, tile, units, layout, palette, joint='#8a857c', joint_mm=4, note=''):
    """units: unit size (m) = paver width; pavers are 2x1 units. layout: 'herringbone' | 'running'."""
    U = units / tile * N                                    # pixels per unit
    jw = joint_mm / 1000 / tile * N
    period = int(round(tile / units))
    ids = np.full((N, N), -1, int)
    rects = []
    if layout == 'herringbone':                             # staircase of H/V pavers, lattice (1,1) & (2,-2)
        for t in range(-period, period * 2):
            for k in range(-period, period):
                ox, oy = t + 2 * k, t - 2 * k
                rects += [(ox, oy, 2, 1), (ox, oy + 1, 1, 2)]
    else:                                                   # running bond, pavers along x, half offset
        for j in range(period):
            for i in range(-1, period):
                rects.append((i * 2 + (j % 2), j, 2, 1))
    seen = set()
    for r in rects:
        ox, oy, w, d = r
        key = (ox % period, oy % period, w)
        if key in seen:
            continue
        seen.add(key)
        x0 = int(round(ox * U + jw / 2)); x1 = int(round((ox + w) * U - jw / 2))
        y0 = int(round(oy * U + jw / 2)); y1 = int(round((oy + d) * U - jw / 2))
        xi = np.arange(x0, x1) % N; yi = np.arange(y0, y1) % N
        ids[np.ix_(yi, xi)] = len(seen)
    stone = ids >= 0
    n_ids = ids.max() + 2
    pal = np.array([hexc(c) for c in palette])
    pick = rng.integers(len(pal), size=n_ids)
    tone = 0.9 + 0.16 * rng.random(n_ids)
    alb = pal[pick][ids] * tone[ids][..., None]
    surf = noise(1.4, 10); grit = noise(0.4, 160)
    alb = alb * (1 + 0.06 * surf[..., None] + 0.05 * grit[..., None])
    dirt = np.clip(noise(1.6, 1, 8) * 0.5 + 0.2, 0, 1)
    alb = alb * (1 - 0.12 * dirt[..., None])
    alb[~stone] = hexc(joint) * (1 + 0.1 * grit[~stone, None])
    h = blur(stone.astype(float), 2) + 0.05 * surf + 0.03 * grit   # chamfered edges
    rough = np.where(stone, 0.8 + 0.06 * surf, 0.95)
    save(name, alb, normal_from_height(h, 6.0), ao_from_height(h, 3, 3.0), rough)
    reg(name, tile, note)


# ---------------------------------------------------------------- 300x300 concrete sidewalk slabs
def slabs(name, tile, cells, base, joint='#7d7972', note=''):
    cw = N / cells
    jw = 0.005 / tile * N
    inx = (xx_ * N % cw) > jw; iny = (yy_ * N % cw) > jw
    stone = inx & iny
    ti = (xx_ * N // cw).astype(int); tj = (yy_ * N // cw).astype(int)
    rnd = (np.sin(ti * 12.9898 + tj * 78.233) * 43758.5453) % 1
    rnd2 = (np.sin(ti * 39.346 + tj * 11.135) * 24634.6345) % 1
    pores = np.clip(noise(0.3, 160) * 3 - 2.2, 0, 1)
    mott = noise(1.3, 1, 14)
    alb = tint(hexc(base), [0.07, 0.03], mott, noise(0.8, 50))
    alb = alb * (0.9 + 0.16 * rnd[..., None]) * (1 - 0.35 * pores[..., None])
    alb[~stone] = hexc(joint)
    tilt = (rnd2 - 0.5) * 0.15 * ((xx_ * N % cw) / cw)       # slightly uneven slabs
    h = blur(stone.astype(float), 2) + tilt + 0.15 * noise(1.4, 8) - 0.5 * pores
    rough = np.where(stone, 0.86 + 0.05 * mott, 0.95)
    save(name, alb, normal_from_height(h, 4.0), ao_from_height(h, 3, 2.5), rough)
    reg(name, tile, note)


# ---------------------------------------------------------------- curb stone (precast concrete, slightly smoother)
def curb():
    mott = noise(1.2, 1, 10); pores = np.clip(noise(0.3, 150) * 3 - 2.3, 0, 1)
    alb = tint(hexc('#bdb9b1'), [0.06, 0.03], mott, noise(0.8, 40)) * (1 - 0.35 * pores[..., None])
    h = 0.2 * noise(1.4, 6) - pores
    save('curb', alb, normal_from_height(h, 2.0), ao_from_height(h, 2, 2.5), 0.78 + 0.06 * mott)
    reg('curb', 1.0, 'precast concrete curb stone')


# ---------------------------------------------------------------- road paint (thermoplastic, with glass beads)
def paint():
    wear = np.clip(noise(1.1, 2, 30) * 0.7 - 0.15, 0, 1)
    beads = np.clip(noise(0.2, 220) * 3 - 1.6, 0, 1)
    alb = tint(hexc('#f2f0ea'), [0.04], noise(1.3, 4)) * (1 - 0.35 * wear[..., None])[..., :] + \
        hexc('#3a3a3c') * 0.35 * wear[..., None]
    h = 0.4 * (1 - wear) + 0.2 * beads
    save('roadpaint', alb, normal_from_height(h, 2.0), 1.0, 0.6 + 0.2 * wear - 0.1 * beads)
    reg('roadpaint', 1.0, 'white thermoplastic road marking, worn')


xx_, yy_ = P.xx, P.yy

if __name__ == '__main__':
    asphalt('asphalt_new', '#454547', 4.0, aggregate=0.7, note='fresh dense asphalt, dark')
    asphalt('asphalt_old', '#6d6b67', 8.0, aggregate=0.6, wear=1.0, patches=3, cracks=1.0, note='aged asphalt, patches & cracks')
    pavers('pavers_grey', 1.2, 0.1, 'herringbone', ['#9d9a94', '#a8a59f', '#8f8c86', '#b2afa8'], note='grey 200x100 pavers, 90° herringbone')
    pavers('pavers_red', 1.2, 0.1, 'running', ['#9a4f3c', '#a8604a', '#8b4433', '#b06a52'], joint='#7d6f63', note='red 200x100 pavers, running bond')
    pavers('pavers_mix', 1.2, 0.1, 'running', ['#9d9a94', '#a8a59f', '#9a4f3c', '#8f8c86'], note='grey/red mixed 200x100 pavers, running bond')
    slabs('slab30', 1.2, 4, '#aaa69e', note='300x300 grey concrete sidewalk slabs')
    curb(); paint()
    f = OUT / 'sets.json'
    allsets = json.loads(f.read_text()) if f.exists() else {}
    allsets.update(SETS)
    f.write_text(json.dumps(allsets, indent=1))
    print('written', len(SETS), 'street sets to', OUT)
