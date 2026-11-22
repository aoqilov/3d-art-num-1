import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const P = '/Game/Blok1/UI/WBP_Blok1Time.WBP_Blok1Time';
const e = (x) => x.then((r) => 'ok ' + JSON.stringify(r).slice(0, 300)).catch((er) => 'ERR ' + er.message.slice(0, 1500));
console.log('write', await e(call(BP, 'write_graph_dsl', { graph: ref(P + ':EventGraph'), code: fs.readFileSync('ui/time_ev.txt', 'utf8') })));
console.log('compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(P) })));
const back = String(await call(BP, 'read_graph_dsl', { graph: ref(P + ':EventGraph') }));
console.log('has 120000', back.includes('120000'), 'SetLightColor', (back.match(/SetLightColor/g) || []).length, 'PPV', back.includes('PPV_Tun'), 'len', back.length);
