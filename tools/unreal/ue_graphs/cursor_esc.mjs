// 2026-11-21 (owner): Esc shows / hides the mouse cursor (Tab still works), also in the drone.
import fs from 'node:fs';
import { init, call, BP, ref, py } from './ue.mjs';
await init();
const e = (x) => x.then((r) => 'ok ' + JSON.stringify(r).slice(0, 200)).catch((er) => 'ERR ' + er.message.slice(0, 800));
console.log(await py(`
import unreal
D = "/Game/Blok1/Input"
a = unreal.load_asset(D + "/IA_Cursor"); imc = unreal.load_asset(D + "/IMC_Blok1")
k = unreal.Key(); k.import_text("Escape")
maps = imc.get_editor_property("default_key_mappings").get_editor_property("mappings")
if not any(m.get_editor_property("action") == a and str(m.get_editor_property("key").get_editor_property("key_name")) == "Escape" for m in maps):
    imc.modify(); imc.map_key(a, k)
unreal.EditorAssetLibrary.save_loaded_asset(imc, False)
print([(str(m.get_editor_property("action").get_name()), str(m.get_editor_property("key").get_editor_property("key_name"))) for m in imc.get_editor_property("default_key_mappings").get_editor_property("mappings") if m.get_editor_property("action") == a])`));
const P = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', D = '/Game/Blok1/Player/BP_Drone.BP_Drone';
console.log('player ev', await e(call(BP, 'write_graph_dsl', { graph: ref(`${P}:EventGraph`), code: fs.readFileSync('player_ev_code.txt', 'utf8') })));
console.log('player compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(P) })));
console.log('drone var', await e(call(BP, 'add_variable', { blueprint: ref(D), name: 'PrevCursor', type_name: 'bool' })));
console.log('drone ev', await e(call(BP, 'write_graph_dsl', { graph: ref(`${D}:EventGraph`), code: fs.readFileSync('drone_ev.txt', 'utf8') })));
console.log('drone compile', await e(call(BP, 'compile_blueprint', { blueprint: ref(D) })));
console.log(await py(`import unreal
for p in ("/Game/Blok1/Player/BP_Blok1Player", "/Game/Blok1/Player/BP_Drone"): print(p, unreal.EditorAssetLibrary.save_asset(p, False))`));
