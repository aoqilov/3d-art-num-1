// BP_Qurilish (level actor Blok2_Ctl): block-2 construction controller graphs from blok2/*.txt; N starts at 6.
import fs from 'node:fs';
import { init, call, BP, ref, py } from './ue.mjs';
await init();
const Q = '/Game/Blok1/Qurilish/BP_Qurilish.BP_Qurilish';
for (const [n, t] of [['Pardoz', 'bool']]) await call(BP, 'add_variable', { blueprint: ref(Q), name: n, type_name: t }).catch(() => {});
await call(BP, 'add_function_graph', { blueprint: ref(Q), graph_name: 'PardozBtn' }).catch(() => {});
const e = (x) => x.then(() => 'ok').catch((er) => 'ERR ' + JSON.stringify(er.message.slice(0, 700)));
for (const [g, f] of [['Show', 'show.txt'], ['Plus', 'plus.txt'], ['Minus', 'minus.txt'], ['PlayBtn', 'play.txt'], ['PardozBtn', 'pardoz.txt'], ['EventGraph', 'ev.txt']])
  console.log(g, await e(call(BP, 'write_graph_dsl', { graph: ref(`${Q}:${g}`), code: fs.readFileSync('blok2/' + f, 'utf8') })));
console.log('compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(Q) })));
console.log(await py(`
import unreal
bp = unreal.load_asset("/Game/Blok1/Qurilish/BP_Qurilish")
unreal.get_default_object(bp.generated_class()).set_editor_property("N", 6)
print("N default", unreal.get_default_object(bp.generated_class()).get_editor_property("N"), "saved", unreal.EditorAssetLibrary.save_loaded_asset(bp, False))`));
