// BP_Blok1Ctl.Do: storey buttons must not show the hidden room doors (tag DoorsIn) again
import { init, call, BP, ref } from './ue.mjs';
await init();
const G = ref('/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl:Do');
let r = String(await call(BP, 'read_graph_dsl', { graph: G }));
const a = '(Rendering|SetActorHiddenInGame _array_element (and (> Value 0) (> _index Value)))';
if (!r.includes(a)) { console.log('pattern not found'); process.exit(1); }
r = r.replace(a, '(Rendering|SetActorHiddenInGame _array_element (or (Actor|ActorHasTag _array_element "DoorsIn") (and (> Value 0) (> _index Value))))');
console.log('write', await call(BP, 'write_graph_dsl', { graph: G, code: r }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 600)));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: ref('/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl') })));
console.log(String(await call(BP, 'read_graph_dsl', { graph: G })).split('\n').filter((l) => /DoorsIn/.test(l)).join('\n'));
