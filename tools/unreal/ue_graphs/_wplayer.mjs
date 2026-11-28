import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const P = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player';
const e = (x) => x.then((r) => 'ok ' + JSON.stringify(r).slice(0, 200)).catch((er) => 'ERR ' + er.message.slice(0, 1500));
console.log('write', await e(call(BP, 'write_graph_dsl', { graph: ref(P + ':EventGraph'), code: fs.readFileSync('player_ev_new.txt', 'utf8') })));
console.log('compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(P) })));
const back = String(await call(BP, 'read_graph_dsl', { graph: ref(P + ':EventGraph') }));
console.log('has delay', back.includes('Delay'), 'len', back.length);
