import { init, call, BP, ref } from './ue.mjs';
await init();
const [g, ...fs] = process.argv.slice(2);
for (const f of fs) { const r = await call(BP, 'find_node_types', { graph: ref(g), type_id_filter: f, context_pins: [] }); console.log(f, '=>', JSON.stringify(r).slice(0, 700)); }
