"""Site outline (genplan.json) -> Unreal cm, shrunk by INSET, triangulated -> out/landscape_dent.json for
ue_scripts/landscape_dent.py (the landscape is lowered inside it so the courtyard / driveways / later the underground
parking are not covered by it)."""
import json, os, shapely
from shapely.geometry import Polygon
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
INSET = 1.0                                                      # m
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
s = G['site']
site = Polygon([web_to_ue(s[i], s[i + 1]) for i in range(0, len(s), 2)]).buffer(-INSET * 100, join_style='mitre')
tris = [list(t.exterior.coords)[:3] for t in shapely.constrained_delaunay_triangles(site).geoms]
json.dump({'tris': [[round(c, 1) for p in t for c in p] for t in tris]}, open(os.path.join(HERE, 'out', 'landscape_dent.json'), 'w'))
print(len(tris), 'triangles, area m2', round(site.area / 1e4))
