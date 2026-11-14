// The atmosphere packages import hash helpers straight from three's source tree; give them the bundled copies
// instead (build.mjs redirects 'three/src/nodes/core/NodeUtils.js' here) so three.js is not bundled twice.
import { NodeUtils } from 'three/webgpu';
const U = NodeUtils as unknown as { hash: (...a: number[]) => number; hashString: (s: string) => number; hashArray: (a: number[]) => number };
export const hash = U.hash;
export const hashString = U.hashString;
export const hashArray = U.hashArray;
