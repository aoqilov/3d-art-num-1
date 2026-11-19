// Tiny Unreal MCP client: one session, call(toolset, tool, args) -> parsed returnValue (or text).
const URL = 'http://127.0.0.1:8000/mcp';
const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
let sid = null, id = 1;
async function rpc(method, params, notify = false) {
  const body = { jsonrpc: '2.0', method, params }; if (!notify) body.id = ++id;
  const r = await fetch(URL, { method: 'POST', headers: { ...H, ...(sid ? { 'Mcp-Session-Id': sid } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(590000) });
  sid = r.headers.get('mcp-session-id') || sid;
  const t = await r.text(); if (notify || !t) return null;
  let j; try { j = JSON.parse(t); } catch { const m = t.match(/data: (.*)/g); j = JSON.parse(m[m.length - 1].slice(6)); }
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}
export async function init() {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cc', version: '1' } });
  await rpc('notifications/initialized', {}, true);
}
export async function call(toolset, tool, args = {}) {
  const res = await rpc('tools/call', { name: 'call_tool', arguments: { toolset_name: toolset, tool_name: tool, arguments: args } });
  const txt = (res.content || []).map((c) => c.text || '').join('');
  if (res.isError) throw new Error(`${tool}: ${txt.slice(0, 1500)}`);
  try { const j = JSON.parse(txt); return 'returnValue' in j ? j.returnValue : j; } catch { return txt; }
}
export const BP = 'editor_toolset.toolsets.blueprint.BlueprintTools';
export const UMG = 'UMGToolSet.UMGToolSet';
export const OBJ = 'editor_toolset.toolsets.object.ObjectTools';
export const PY = 'python_bridge.toolset.PythonBridgeToolset';
export const py = (code) => call(PY, 'run_python', { code });
export const ref = (p) => ({ refPath: p });
