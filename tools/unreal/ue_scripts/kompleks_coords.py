# Web app complex layout (src/data/blocks.ts) -> Unreal. exec() this file, then use block_ue(id) / BLOCKS.
# Web: metres, X east, Z south, block model placed as  T(x, z) * RotY(blockTheta) * Scale(t4Fit) * T(-W/2, -D/2) * plan.
# Unreal anchor (owner 2026-11-20): the walkable block that already stands in the level (plan origin at UE (1500, -1500),
# no rotation) is web BLOCK 2; every other position is taken relative to it. No mirroring (both are rotations).
import math, re
BLOCKS_TS = r"C:/Users/user/Desktop/3esd/3d-art-num-1/src/data/blocks.ts"
BW, BD = 29.7, 18.1                                    # type-4 model footprint (plan metres)
TYPE4 = (1, 2, 12, 13, 15, 16, 18)
ANCHOR = 2
FLIP = (3, 4, 14, 15, 18)   # turned 180 deg (proposed 2026-11-20): portal + shops face the boulevard / road, the courtyard door the court
UE_ORIGIN = (1500.0, -1500.0)                          # UE cm of the anchor block's plan origin

_src = open(BLOCKS_TS, encoding="utf-8").read()
BLOCKS = {int(m.group(1)): dict(id=int(m.group(1)), x=float(m.group(2)), z=float(m.group(3)), w=float(m.group(4)), d=float(m.group(5)), rot=float(m.group(6)))
          for m in re.finditer(r"\{ id: (\d+), x: ([-\d.]+), z: ([-\d.]+), w: ([-\d.]+), d: ([-\d.]+), rot: ([-\d.]+) \}", _src)}

def theta(b):                                          # = blockTheta() in blocks.ts
    th = b["rot"] + (0 if b["w"] >= b["d"] else math.pi / 2)
    nx, nz = -math.sin(th), -math.cos(th)
    if nx * b["x"] + nz * b["z"] < 0: th += math.pi
    if b.get("id") in FLIP: th += math.pi
    return th
def fit(i):                                            # = t4Fit()
    b = BLOCKS[i]
    if i in TYPE4: return 1.0, 1.0
    return min(1.0, max(b["w"], b["d"]) / BW), min(1.0, min(b["w"], b["d"]) / BD)
def web_xz(i, px, py):
    b = BLOCKS[i]; th = theta(b); sx, sz = fit(i)
    u, v = (px - BW / 2) * sx, (py - BD / 2) * sz
    return b["x"] + u * math.cos(th) + v * math.sin(th), b["z"] - u * math.sin(th) + v * math.cos(th)
def web_to_ue(X, Z):
    a = BLOCKS[ANCHOR]; th = theta(a)
    dX, dZ = X - a["x"], Z - a["z"]
    u = dX * math.cos(th) - dZ * math.sin(th); v = dX * math.sin(th) + dZ * math.cos(th)
    return UE_ORIGIN[0] + (u + BW / 2) * 100, UE_ORIGIN[1] + (v + BD / 2) * 100
def block_ue(i):
    """(x_cm, y_cm, yaw_deg, sx, sy) of block i's plan origin in Unreal; sx/sy = model scale along plan x / y."""
    x0, y0 = web_to_ue(*web_xz(i, 0, 0)); x1, y1 = web_to_ue(*web_xz(i, 1, 0))
    sx, sz = fit(i)
    return x0, y0, math.degrees(math.atan2(y1 - y0, x1 - x0)), sx, sz
