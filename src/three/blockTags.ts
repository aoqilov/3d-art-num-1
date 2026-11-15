// Tags over the blocks in the live construction view: a pill — phase colour, block, percent, ✓ when registered in
// the cadastre. The block's full card is a row of the side panel (App.tsx); pointing at a pill or at the block lights
// that row up, a click opens the block. HTML over the canvas, placed every frame from the block's roof: on the block,
// or lifted / beside it when that spot is taken; the page's own boxes count as taken.
import * as THREE from 'three';
import { BLOCKS, FLOORS, FLOOR_H, GROUND_H } from '../data/blocks';
import { PHASES, type Progress } from '../data/progress';
import { blockInfo } from '../data/blockInfo';

const TOP_Y = GROUND_H + (FLOORS - 1) * FLOOR_H;
const GAP = 5;                                       // px between pills
/** spots to try, in pill widths / heights from the block: on it, lifted, beside, beside and lifted, below */
const TRIES = [[0, 0], [0, -1], [0, -2], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, -2], [-1, -2], [0, 1], [0, -3], [1, 1], [-1, 1], [0, 2]];

type Tag = { id: number; anchor: THREE.Vector3; el: HTMLButtonElement; shown: boolean };

export class BlockTags {
  readonly root = document.createElement('div');
  private tags: Tag[] = [];
  private pw = 0; private ph = 0;
  private lit: number | null = null;

  constructor(host: HTMLElement, onOpen: (id: number) => void, onPoint: (id: number | null) => void) {
    this.root.className = 'btags';
    host.appendChild(this.root);
    for (const def of BLOCKS) {
      const e = document.createElement('button');
      e.type = 'button'; e.className = 'bpill'; e.style.display = 'none';
      e.innerHTML = `<i></i>${def.id}-blok<b class="pc"></b>${blockInfo(def.id).cadastre ? '<span class="ok" title="Kadastrdan o‘tgan (namunaviy)">✓</span>' : ''}`;
      e.setAttribute('aria-label', `${def.id}-blok ochish`);
      e.addEventListener('click', () => onOpen(def.id));
      e.addEventListener('pointerenter', () => onPoint(def.id));
      e.addEventListener('pointerleave', () => onPoint(null));
      this.root.append(e);
      this.tags.push({ id: def.id, anchor: new THREE.Vector3(def.x, TOP_Y + 6, def.z), el: e, shown: false });
    }
  }

  /** progress on the timeline's month */
  update(state: Map<number, Progress>) {
    for (const t of this.tags) {
      const p = state.get(t.id); if (!p) continue;
      t.el.style.setProperty('--c', PHASES[p.phase].color);
      t.el.querySelector('.pc')!.textContent = p.done ? 'tayyor' : p.pct + '%';
    }
  }

  setVisible(v: boolean) { this.root.style.display = v ? '' : 'none'; }

  /** place for this frame. ui: the page's boxes over the view [x0, y0, x1, y1]; lit: the block pointed at */
  place(camera: THREE.PerspectiveCamera, w: number, h: number, ui: number[][], lit: number | null) {
    if (this.root.style.display === 'none') return;
    if (!this.pw) {                                   // measured once (all pills are about the same size)
      const e = this.tags[0].el;
      e.style.display = ''; e.style.transform = 'translate(-9999px,0)';
      this.pw = e.offsetWidth + 4; this.ph = e.offsetHeight;
      if (!this.pw) return;
    }
    if (lit !== this.lit) { for (const t of this.tags) t.el.classList.toggle('on', t.id === lit); this.lit = lit; }
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(), placed: number[][] = [...ui], { pw, ph } = this;
    const free = (r: number[]) => r[1] >= 0 && r[0] >= -10 && r[2] <= w + 10 && placed.every((q) => r[0] >= q[2] || r[2] <= q[0] || r[1] >= q[3] || r[3] <= q[1]);
    const order = this.tags.map((t) => {
      v.copy(t.anchor).project(camera);
      return { t, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, d: v.z > 1 ? Infinity : camera.position.distanceToSquared(t.anchor) };
    }).sort((a, b) => (a.t.id === lit ? -1 : b.t.id === lit ? 1 : a.d - b.d));     // the lit one first, then the nearer
    for (const { t, x, y, d } of order) {
      let at: number[] | null = null;
      if (d !== Infinity) for (const [sx, sy] of TRIES) {
        const cx = x + sx * (pw + GAP), by = y + sy * (ph + GAP);
        const r = [cx - pw / 2, by - ph, cx + pw / 2, by];
        if (free(r)) { at = r; placed.push(r); break; }
      }
      if (!!at !== t.shown) { t.el.style.display = at ? '' : 'none'; t.shown = !!at; }
      if (at) t.el.style.transform = `translate3d(${Math.round(at[0] + 2)}px,${Math.round(at[1])}px,0)`;
    }
  }

  dispose() { this.root.remove(); }
}
