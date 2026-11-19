// node nfind.mjs <graphRef> <filter> [<filter>...] : node type ids available in a graph
import { init, call, BP, ref } from './ue.mjs';
await init();
const [G, ...qs] = process.argv.slice(2);
for (const q of qs) {
  const r = await call(BP, 'find_node_types', { graph: ref(G), type_id_filter: q, context_pins: [] }).catch((e) => e.message);
  console.log('==', q, (JSON.stringify(r).match(/"[^"]{3,90}"/g) || []).slice(0, 8).join(' '));
}
