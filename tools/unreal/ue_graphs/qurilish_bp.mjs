// BP_Kran graph (crane animation) from qurilish/kran_ev.txt. Block-2 controller graphs: blok2_bp.mjs.
import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const K = '/Game/Blok1/Qurilish/BP_Kran.BP_Kran';
const e = (x) => x.then(() => 'ok').catch((er) => 'ERR ' + JSON.stringify(er.message.slice(0, 900)));
console.log('kran ev', await e(call(BP, 'write_graph_dsl', { graph: ref(`${K}:EventGraph`), code: fs.readFileSync('qurilish/kran_ev.txt', 'utf8') })));
console.log('kran compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(K) })));
