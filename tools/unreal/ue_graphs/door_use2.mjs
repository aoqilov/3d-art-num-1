// BP_Blok1Door.Use: toggles IsOpen; an open leaf ignores the player (Pawn channel) so narrow doorways (flat balcony doors,
// 57 cm clear minus the leaf) stay passable; a closed leaf blocks again. Visibility traces (E focus) still see the leaf.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Door.BP_Blok1Door';
console.log(JSON.stringify(await call(BP, 'find_node_types', { graph: ref(`${B}:Use`), type_id_filter: 'SetCollisionResponsetoChannel', context_pins: [] })).slice(0, 300));
console.log(await call(BP, 'write_graph_dsl', { graph: ref(`${B}:Use`), code: `
(fn Use ()
  (Variables|Default|SetIsOpen (not (Variables|Default|GetIsOpen)))
  (bind c (Actor|GetComponentbyClass :self self :ComponentClass "/Script/Engine.StaticMeshComponent"))
  (if (Variables|Default|GetIsOpen)
    (Collision|SetCollisionResponsetoChannel :self c :Channel "ECC_Pawn" :NewResponse "ECR_Ignore")
    (else
      (Collision|SetCollisionResponsetoChannel :self c :Channel "ECC_Pawn" :NewResponse "ECR_Block"))))` }).catch((e) => 'ERR ' + e.message.slice(0, 600)));
console.log(String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:Use`) })));
console.log(JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: ref(B) })));
