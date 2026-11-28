import { init, call, BP, ref } from './ue.mjs';
await init();
const P = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player';
for (const q of process.argv.slice(2)) {
  const r = await call(BP, 'find_node_types', { graph: ref(P + ':EventGraph'), type_id_filter: q, context_pins: [] }).catch((e) => 'ERR ' + e.message.slice(0, 300));
  console.log(q, JSON.stringify(r).slice(0, 600));
}
