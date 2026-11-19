// BP_Blok1Player: UE Mannequin (Manny) body with adjustable height (BoyiSm) and shoulder width (YelkaSm).
import fs from 'node:fs';
import { init, call, BP, ref, py } from './ue.mjs';
await init();
const B = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', bp = ref(B);
const e = (x) => x.then((r) => (typeof r === 'string' ? r.slice(0, 200) : 'ok')).catch((er) => 'ERR ' + er.message.slice(0, 900));
for (const n of ['BoyiSm', 'YelkaSm']) {
  console.log(n, await e(call(BP, 'add_variable', { blueprint: bp, name: n, type_name: 'float' })));
  console.log(' editable', await e(call(BP, 'set_variable_instance_editable', { blueprint: bp, variable_name: n, instance_editable: true })));
  console.log(' category', await e(call(BP, 'set_variable_category', { blueprint: bp, variable_name: n, category: 'Tana' })));
}
console.log('fn', await e(call(BP, 'add_function_graph', { blueprint: bp, graph_name: 'ApplyBody' })));
console.log('fn dsl', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:ApplyBody`), code: fs.readFileSync('body_fn.txt', 'utf8') })));
console.log('ctor', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:UserConstructionScript`), code: '(fn UserConstructionScript ()\n  (CallFunction|ApplyBody))' })));
console.log('ev', await e(call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code: fs.readFileSync('player_ev_code.txt', 'utf8') })));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })).slice(0, 1500));
console.log(await py(fs.readFileSync('m_body.py', 'utf8')));
