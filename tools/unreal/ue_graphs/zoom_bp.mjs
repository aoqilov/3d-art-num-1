// BP_Blok1Player: mouse-wheel camera distance in third person (variables + EventGraph from player_ev_code.txt).
import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', bp = ref(B);
for (const [n, t] of [['ZoomLevel', 'int'], ['ArmLen', 'float'], ['ArmZ', 'float']])
  console.log(n, await call(BP, 'add_variable', { blueprint: bp, name: n, type_name: t }).then(() => 'ok').catch((e) => e.message.slice(0, 100)));
console.log('ev', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code: fs.readFileSync('player_ev_code.txt', 'utf8') }).catch((e) => 'ERR ' + e.message.slice(0, 800)));
const r = String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) }));
console.log('events:', (r.match(/\(event [^\s)]+/g) || []).join(' '), 'zoom', r.includes('IA_Zoom'), 'use', r.includes('UseFocus'));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })));
