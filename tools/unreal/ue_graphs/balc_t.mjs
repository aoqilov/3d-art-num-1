// PIE: storey ST, the flat balcony door nearest plan (PX, PY): stand 1.2 m inside, E (injected), walk out to the balcony.
import fs from 'node:fs';
import { init, py } from './ue.mjs';
await init();
const [ST, PX, PY] = [+(process.argv[2] || 7), +(process.argv[3] || 15.81), +(process.argv[4] || 0.11)];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const H = fs.readFileSync('use_t.mjs', 'utf8').split('const H = `')[1].split('`;')[0];
const PRESS = fs.readFileSync('e_t.mjs', 'utf8').split('const PRESS = `')[1].split('`;')[0];
const run = (c) => py(H + c).then(console.log, (e) => console.log('ERR', e.message.slice(-600)));
const D = `
ds = [a for a in unreal.GameplayStatics.get_all_actors_with_tag(w, "Balkon") if a.actor_has_tag("S${ST}")]
wx, wy = 1500 + ${PX} * 100, -1500 + ${PY} * 100
d = min(ds, key=lambda a: (a.get_actor_location().x - wx) ** 2 + (a.get_actor_location().y - wy) ** 2)
import math
h = d.get_actor_location(); s = d.get_actor_scale3d(); cy = d.get_editor_property("ClosedYaw"); oy = d.get_editor_property("OpenYaw")
mid = h + unreal.Vector(math.cos(math.radians(cy)), math.sin(math.radians(cy)), 0) * s.x * 50
inn = unreal.Vector(math.cos(math.radians(oy)), math.sin(math.radians(oy)), 0)          # open leaf points into the room
zf = 2 + (${ST} - 1) * 300 + 112
DIN = ${+(process.argv[5] || 120)}
`;
await run(D + `
pl.set_actor_location(unreal.Vector(mid.x + inn.x * DIN, mid.y + inn.y * DIN, zf), False, True)
pl.get_movement_component().stop_movement_immediately()
pc.set_control_rotation(unreal.MathLibrary.find_look_at_rotation(pl.get_actor_location() + unreal.Vector(0,0,77), mid + unreal.Vector(0,0,110)))
print(d.get_actor_label(), "closed", cy, "open", oy)`);
await wait(1.5); await run(D + `report("in the room, looking at the door")`);
await run(PRESS); await wait(2.5);
await run(D + `report("after E")\nprint("IsOpen", d.get_editor_property("IsOpen"))`);
await run(D + `
p0 = pl.get_actor_location(); blk = None
for i in range(1, 60):
    tgt = unreal.Vector(mid.x - inn.x * (i * 5 - DIN), mid.y - inn.y * (i * 5 - DIN), p0.z + 3)
    r = pl.set_actor_location(tgt, True, False)
    if (pl.get_actor_location() - tgt).length() > 2:
        hh = r[0] if isinstance(r, tuple) else r
        try: print("sweep hit", hh.to_tuple()[9].get_actor_label(), hh.to_tuple()[10].get_name(), "at", hh.to_tuple()[5])
        except Exception as ex: print("hit?", r)
        pl.set_actor_location(unreal.Vector(tgt.x, tgt.y, p0.z + 28), True, False)        # step over a threshold
        if (pl.get_actor_location() - unreal.Vector(tgt.x, tgt.y, p0.z + 28)).length() > 2:
            blk = i * 5 - DIN; break
q = pl.get_actor_location()
print("walked to %.0f cm past the door line" % ((q - mid).dot(-inn)), "blocked at", blk, "cm past door line")
hr = unreal.SystemLibrary.line_trace_single(w, q, q - inn * 80, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [pl], unreal.DrawDebugTrace.NONE, True)
print("in front:", hr.to_tuple()[9].get_actor_label() if hr else None)`);
