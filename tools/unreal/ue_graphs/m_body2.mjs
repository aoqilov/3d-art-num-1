// BP_Blok1Player graphs for the Mannequin body: ApplyBody (height/shoulders), construction script, EventGraph.
import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', bp = ref(B);
const e = (x) => x.then((r) => JSON.stringify(r).slice(0, 1500)).catch((er) => 'ERR ' + JSON.stringify(er.message.slice(0, 1200)));
console.log('fn dsl', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:ApplyBody`), code: fs.readFileSync('body_fn.txt', 'utf8') })));
console.log('ctor', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:UserConstructionScript`), code: '(fn ConstructionScript ()\n  (CallFunction|ApplyBody))' })));
console.log('ev', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code: fs.readFileSync('player_ev_code.txt', 'utf8') })));
console.log('compile', await e(call(BP, 'compile_blueprint', { blueprint: bp })));
console.log(String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:UserConstructionScript`) })));
const r = String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) }));
console.log(r.split('\n').filter((l) => /ApplyBody|ControlRotation|GetForwardVector|OrientRot|ControllerRotationYaw|GetMesh/.test(l)).join('\n'));
