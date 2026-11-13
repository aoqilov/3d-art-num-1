"""Procedural, seamlessly tiling PBR texture sets for the PRO build.

Every set is written as three maps in public-pro/tex/:
  <name>_a.jpg    base colour (sRGB)
  <name>_n.jpg    tangent-space normal (OpenGL / +Y up, as three.js expects)
  <name>_orm.jpg  R = ambient occlusion, G = roughness, B = metalness (linear)
TILE (metres) below says how much real surface one texture repeat covers; the app sets repeat = 1 / TILE.
Usage: python3 tools/pbr_textures.py [out_dir]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

N = 1024
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'public-pro/tex')
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:N, 0:N] / N  # 0..1, v down the image


# ---------------------------------------------------------------- helpers
def noise(beta=1.6, lo=1.0, hi=None, seed=None, shape=(N, N), stretch=1.0):
    """Periodic (tileable) fractal noise in -1..1 via spectral synthesis; stretch > 1 elongates features along u."""
    r = np.random.default_rng(seed) if seed is not None else rng
    h, w = shape
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt((fx * stretch) ** 2 + fy * fy)
    f[0, 0] = 1
    amp = f ** (-beta)
    amp[f < lo] = 0
    if hi:
        amp[f > hi] = 0
    spec = (r.normal(size=shape) + 1j * r.normal(size=shape)) * amp
    n = np.real(np.fft.ifft2(spec))
    n -= n.mean()
    return n / (np.abs(n).max() + 1e-9)


def blur(a, k=2):
    """Cheap periodic box blur."""
    for _ in range(k):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def normal_from_height(h, strength):
    """h in metres-ish units; strength scales the slope. Wraps around the edges (tileable)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    # image rows go down while texture v goes up: flip dy for +Y-up normal maps
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n


def ao_from_height(h, radius=6, k=2.5):
    """Cavity AO: darker where the surface is below its blurred neighbourhood."""
    b = h.copy()
    for _ in range(radius):
        b = blur(b, 1)
    cav = np.clip((b - h) * k, 0, 1)
    return 1 - cav


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def hexc(s):
    s = s.lstrip('#')
    lin = np.array([int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(lin <= 0.04045, lin / 12.92, ((lin + 0.055) / 1.055) ** 2.4)


def save(name, albedo_lin, nrm, ao, rough, metal=0.0, q=90):
    a = (srgb(albedo_lin) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a, 'RGB').save(OUT / f'{name}_a.jpg', quality=q, optimize=True)
    n8 = ((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(n8, 'RGB').save(OUT / f'{name}_n.jpg', quality=94, optimize=True)
    ao = np.full((N, N), ao) if np.isscalar(ao) else ao
    rough = np.full((N, N), rough) if np.isscalar(rough) else rough
    m = np.full_like(ao, metal) if np.isscalar(metal) else metal
    orm = (np.dstack([np.clip(ao, 0, 1), np.clip(rough, 0.02, 1), np.clip(m, 0, 1)]) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(orm, 'RGB').save(OUT / f'{name}_orm.jpg', quality=92, optimize=True)


def tint(base, var, *fields):
    """base colour (linear rgb) modulated by scalar fields (each roughly -1..1) with amounts var."""
    out = np.ones((N, N, 3)) * base
    for f, k in zip(fields, var):
        out = out * (1 + k * f[..., None])
    return out


SETS = {}


def reg(name, tile, note):
    SETS[name] = {'tile': tile, 'note': note}


# ---------------------------------------------------------------- plaster (interior paint), neutral: tinted by the material colour
def plaster():
    h = 0.6 * noise(1.1, 8) + 0.4 * noise(1.8, 2)
    alb = tint(hexc('#f2f0ec'), [0.025, 0.012], noise(1.4, 2), noise(0.9, 30))
    save('plaster', alb, normal_from_height(h, 2.2), 0.96 + 0.04 * ao_from_height(h), 0.86 + 0.06 * noise(1.2, 4))
    reg('plaster', 1.5, 'interior paint over fine plaster')


# ---------------------------------------------------------------- exterior stucco (sprayed, coarser)
def stucco():
    base = noise(0.7, 40)
    blobs = np.clip(base * 2.2, 0, 1) ** 1.5
    h = blobs + 0.25 * noise(1.5, 3)
    alb = tint(hexc('#f1efea'), [0.04, 0.02], noise(1.3, 2), base)
    save('stucco', alb, normal_from_height(h, 5.0), ao_from_height(h, 3, 3.5), 0.9 + 0.05 * base)
    reg('stucco', 1.0, 'exterior sprayed facade plaster')


# ---------------------------------------------------------------- brick, running bond 250x65 mm, 10 mm mortar
def brick():
    TILE = 1.04
    cols, rows = 4, 14
    bw, bh = N / cols, N / rows
    mort = 0.0103 / TILE * N
    r = np.arange(N)
    row = (r // bh).astype(int)
    alb = np.zeros((N, N, 3)); h = np.zeros((N, N)); rough = np.zeros((N, N))
    palette = [hexc(c) for c in ('#cdb899', '#c3ab88', '#d2bfa2', '#b99f7d', '#c7b190', '#bba280')]
    surf = noise(1.3, 20)
    speck = np.clip(noise(0.5, 120) * 3 - 1.6, 0, 1)
    for j in range(rows):
        y0, y1 = int(j * bh), int((j + 1) * bh)
        off = (bw / 2) if j % 2 else 0
        xs = (np.arange(N) + off) % N
        col = (xs // bw).astype(int)
        inx = (xs % bw) > mort
        for c in range(cols):
            m = (col == c) & inx
            colr = palette[rng.integers(len(palette))] * (0.93 + 0.12 * rng.random())
            alb[y0 + int(mort):y1, m] = colr
            h[y0 + int(mort):y1, m] = 1
        alb[y0:y0 + int(mort), :] = hexc('#ddd6ca')
        alb[y0:y1, ~inx] = hexc('#ddd6ca')
    is_b = h > 0.5
    h = blur(h, 2) + 0.12 * surf * is_b
    alb = alb * (1 + 0.08 * surf[..., None]) * (1 - 0.25 * speck[..., None] * is_b[..., None])
    rough = np.where(is_b, 0.82 + 0.08 * surf, 0.95)
    save('brick', alb, normal_from_height(h, 7.0), ao_from_height(h, 4, 2.0), rough)
    reg('brick', TILE, 'facing brick, 250x65 mm, running bond')


# ---------------------------------------------------------------- oak parquet planks 150 mm x 1.2 m, staggered
def parquet():
    TILE = 1.2
    rows = 8
    ph = N / rows
    gap = max(1, int(0.0015 / TILE * N))
    alb = np.zeros((N, N, 3)); h = np.ones((N, N)); rough = np.zeros((N, N))
    gx = xx * N
    for j in range(rows):
        y0, y1 = int(j * ph), int((j + 1) * ph)
        joint = rng.random() * N
        band = slice(y0, y1)
        seed = int(rng.integers(1 << 30))
        # grain: stretched noise along the plank (u) warped by a slow noise
        g = noise(1.0, 1, None, seed, (int(ph) + 1, N))[: y1 - y0]
        warp = noise(1.8, 1, 6, seed + 1, (int(ph) + 1, N))[: y1 - y0]
        lines = np.sin((np.arange(y1 - y0)[:, None] / ph * 18 + warp * 6) * np.pi)
        fleck = np.clip(noise(0.6, 60, None, seed + 2, (int(ph) + 1, N))[: y1 - y0] * 3 - 1.8, 0, 1)
        base = hexc(['#c49a6a', '#b98d5d', '#caa274', '#bf9463', '#b38657', '#c69d6c'][j % 6]) * (0.92 + 0.14 * rng.random())
        a = base * (1 + 0.10 * lines[..., None] + 0.06 * g[..., None]) * (1 - 0.15 * fleck[..., None])
        alb[band] = a
        rough[band] = 0.42 + 0.08 * lines + 0.05 * g
        h[band] = 1 + 0.15 * lines * 0.2
        # end joint of this row
        jm = np.abs(((gx[band] - joint + N / 2) % N) - N / 2) < gap
        h[band][jm] = 0
        alb[band][jm] *= 0.55
        # long edge gap
        h[y0:y0 + gap, :] = 0
        alb[y0:y0 + gap, :] *= 0.55
    h = blur(h, 1)
    save('parquet', alb, normal_from_height(h, 3.0), ao_from_height(h, 2, 3.0), rough)
    reg('parquet', TILE, 'lacquered oak planks, 150 mm wide')


# ---------------------------------------------------------------- generic square tiles with grout
def tiles(name, tile_m, cells, base, vein=0.0, gloss=0.22, grout='#d6d1c8', grout_mm=2.5, chips=False, note=''):
    cw = N / cells[0]; chh = N / cells[1]
    gw = max(1.5, grout_mm / 1000 / tile_m * N)
    in_x = (xx * N % cw) > gw
    in_y = (yy * N % chh) > gw
    tile_m_ = in_x & in_y
    field = noise(1.6, 2)
    alb = tint(base, [0.04], field)
    if vein:
        # ridged noise: thin branching veins where the noise crosses zero, plus a fainter second family
        v1 = (1 - np.abs(noise(1.5, 1, 40))) ** 14
        v2 = (1 - np.abs(noise(1.3, 2, 60))) ** 24 * 0.5
        cloud = np.clip(noise(1.6, 1, 10) * 0.5 + 0.5, 0, 1)
        veins = blur(np.clip(v1 + v2, 0, 1), 1) * vein
        alb = alb * (1 - 0.32 * veins[..., None]) * (1 - 0.05 * cloud[..., None])
    if chips:
        c = noise(0.2, 140)
        mask = c > 0.35
        cc = noise(0.2, 140, None, 99)
        colors = np.where((cc > 0)[..., None], hexc('#8d8a85'), hexc('#3e3d3b'))
        alb = np.where(mask[..., None], colors * (0.9 + 0.2 * np.abs(cc[..., None])), alb)
        alb = np.where((c < -0.45)[..., None], hexc('#f4f1ea'), alb)
    # per-tile tone shift
    ti = (xx * N // cw).astype(int); tj = (yy * N // chh).astype(int)
    shift = (np.sin(ti * 12.9898 + tj * 78.233) * 43758.5453) % 1
    alb = alb * (0.97 + 0.06 * shift[..., None])
    alb[~tile_m_] = hexc(grout)
    h = np.where(tile_m_, 1.0, 0.0)
    h = blur(h, 1) + 0.02 * noise(1.5, 10)
    rough = np.where(tile_m_, gloss + 0.04 * field, 0.85)
    save(name, alb, normal_from_height(h, 2.5), ao_from_height(h, 2, 2.0), rough)
    reg(name, tile_m, note)


# ---------------------------------------------------------------- concrete
def concrete(name='concrete', base='#b4b0aa', rough=0.8, tile=2.0, note='trowelled concrete'):
    mott = noise(1.2, 1, 12)
    pores = np.clip(noise(0.3, 150) * 3 - 2.2, 0, 1)
    alb = tint(hexc(base), [0.08, 0.03], mott, noise(0.8, 40))
    alb *= (1 - 0.4 * pores[..., None])
    h = 0.3 * noise(1.4, 6) - pores
    save(name, alb, normal_from_height(h, 2.0), ao_from_height(h, 2, 2.5), rough + 0.08 * mott)
    reg(name, tile, note)


# ---------------------------------------------------------------- roof gravel
def gravel():
    g = noise(0.4, 90)
    stones = np.clip(g * 2, 0, 1)
    alb = tint(hexc('#8f8c86'), [0.18, 0.06], g, noise(1.0, 6))
    h = stones + 0.2 * noise(1.2, 8)
    save('gravel', alb, normal_from_height(h, 6.0), ao_from_height(h, 3, 3.0), 0.95)
    reg('gravel', 2.0, 'roof ballast gravel')


# ---------------------------------------------------------------- wood veneer (doors, furniture), neutral light oak
def veneer():
    grain = noise(1.2, 1, None, None, (N, N), stretch=14)
    warp = noise(1.9, 1, 6)
    lines = 0.6 * np.sin((yy * 34 + warp * 3 + grain * 2.5) * np.pi) + 0.4 * grain
    fine = noise(1.0, 1, None, None, (N, N), stretch=30)
    alb = tint(hexc('#d9b98f'), [0.08, 0.05], lines, fine)
    save('veneer', alb, normal_from_height(0.2 * lines + 0.1 * fine, 1.0), np.ones((N, N)), 0.45 + 0.06 * lines)
    reg('veneer', 1.0, 'oak veneer, grain along u')


# ---------------------------------------------------------------- woven fabric, neutral (tinted by colour)
def fabric():
    k = 64
    wx = np.sin(xx * k * np.pi * 2); wy = np.sin(yy * k * np.pi * 2)
    over = np.sign(np.sin(xx * k * np.pi) * np.sin(yy * k * np.pi))
    h = 0.5 * (wx * (over > 0) + wy * (over <= 0)) + 0.3 * noise(1.2, 10)
    alb = tint(np.array([0.85, 0.85, 0.85]), [0.05, 0.03], noise(1.3, 4), h)
    save('fabric', alb, normal_from_height(h, 1.4), ao_from_height(h, 1, 1.5), 0.95)
    reg('fabric', 0.25, 'woven upholstery fabric')


def leather():
    cells = noise(0.2, 120)
    h = -np.abs(cells) + 0.3 * noise(1.4, 6)
    alb = tint(np.array([0.8, 0.8, 0.8]), [0.06], noise(1.3, 3))
    save('leather', alb, normal_from_height(h, 2.5), ao_from_height(h, 1, 2.0), 0.55 + 0.1 * cells)
    reg('leather', 0.4, 'pebbled leather')


def brushed():
    streak = noise(1.0, 1, None, None, (N, N))
    streak = blur(np.repeat(streak[:1], N, 0) * 0.5 + 0.5 * noise(0.8, 200), 1)
    alb = tint(np.array([0.92, 0.92, 0.93]), [0.03], streak)
    save('brushed', alb, normal_from_height(0.05 * streak, 1.0), np.ones((N, N)), 0.32 + 0.08 * streak, metal=1.0)
    reg('brushed', 0.6, 'brushed stainless steel')


def panel():
    peel = noise(1.6, 30)
    alb = tint(np.array([0.95, 0.95, 0.95]), [0.01], noise(1.4, 2))
    save('panel', alb, normal_from_height(0.4 * peel, 0.8), np.ones((N, N)), 0.42 + 0.04 * peel)
    reg('panel', 1.0, 'powder-coated / painted metal panel')


if __name__ == '__main__':
    plaster(); stucco(); brick(); parquet()
    tiles('porcelain', 1.2, (2, 2), hexc('#e6e1d9'), vein=0.6, gloss=0.18, note='60x60 polished porcelain, soft marble veins')
    tiles('terrazzo', 1.2, (2, 2), hexc('#d8d3ca'), gloss=0.3, chips=True, grout='#c9c3b8', note='60x60 terrazzo, public areas')
    tiles('walltile', 1.2, (4, 2), hexc('#f3f1ed'), gloss=0.12, grout='#e2ded6', grout_mm=2, note='30x60 glazed wall tile')
    tiles('outdoor', 1.2, (2, 2), hexc('#a9a49c'), gloss=0.7, grout='#8f8a83', grout_mm=4, note='60x60 anti-slip porcelain, balconies')
    concrete()
    concrete('polished', '#c7c3bc', 0.35, 2.0, 'polished concrete, shops')
    gravel(); veneer(); fabric(); leather(); brushed(); panel()
    (OUT / 'sets.json').write_text(json.dumps(SETS, indent=1))
    print('written', len(SETS), 'sets to', OUT)
