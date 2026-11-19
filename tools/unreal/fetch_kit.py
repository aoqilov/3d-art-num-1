# Poly Haven CC0 models for the furnished flats: glTF + 1k textures into tools/unreal/kit_src/<id>/
import json, os, sys, urllib.request
IDS = sys.argv[1:]
H = {"User-Agent": "model-fetch"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=120).read()
for i in IDS:
    try:
        f = json.loads(get(f"https://api.polyhaven.com/files/{i}"))
        g = f["gltf"]["1k"]["gltf"]
        d = os.path.join(os.path.dirname(__file__), "kit_src", i); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, os.path.basename(g["url"])), "wb").write(get(g["url"]))
        n = 0
        for rel, inc in g.get("include", {}).items():
            p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(get(inc["url"])); n += 1
        print("ok", i, n, "files")
    except Exception as e:
        print("FAIL", i, e)
