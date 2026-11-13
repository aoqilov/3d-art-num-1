// Editor for the neighbourhood houses, shown only with ?edit=1 (not for ordinary visitors).
// Click a house (Shift+click adds), or "Ramka" and drag a rectangle. Edits are kept in this browser;
// "JSON eksport" downloads overrides.json → put it in public/context/ and rebuild to publish them.
import { useEffect, useState, type RefObject } from 'react';
import type { ComplexScene } from './ComplexScene';

type Hover = { id: string; floors: number; roof: string; est: boolean; edited: boolean; x: number; y: number } | null;

export default function EditPanel({ scene }: { scene: RefObject<ComplexScene | null> }) {
  const [, setTick] = useState(0);
  const [box, setBox] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const refresh = () => setTick((t) => t + 1);
  const s = scene.current;

  useEffect(() => {
    const sc = scene.current;
    if (!sc) return;
    sc.setEditMode(true);
    sc.setEditCallbacks(() => refresh(), (info, x, y) => setHover(info ? { ...info, x, y } : null));
    return () => { sc.setEditMode(false); sc.setEditCallbacks(); };
  }, [scene]);
  useEffect(() => { s?.setBoxMode(box); }, [box, s]);

  const info = s?.selectionInfo() ?? null;
  const act = (ch: Parameters<ComplexScene['editSelected']>[0]) => { s?.editSelected(ch); refresh(); };
  const exportJson = () => {
    if (!s) return;
    const blob = new Blob([JSON.stringify(s.exportOverrides(), null, 1) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'overrides.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      {hover && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.id} · {hover.floors} qavat · {hover.roof === 'flat' ? 'tekis tom' : 'qiya tom'}
          {hover.edited ? ' · tahrirlangan' : hover.est ? ' · taxmin' : ''}
        </div>
      )}
      <aside className="panel ed">
        <h2>Atrof tahriri</h2>
        <p className="hint">Uyni bosing (Shift + bosish qo‘shadi) yoki “Ramka” bilan bir nechtasini belgilang. O‘zgarishlar shu brauzerda saqlanadi.</p>
        <div className="row">
          <button className={box ? 'on' : ''} onClick={() => setBox(!box)}>{box ? 'Ramka: yoqilgan' : 'Ramka'}</button>
          {box && <span>sudrab to‘rtburchak chizing (aylantirish o‘chirilgan)</span>}
        </div>
        <hr />
        {!info && <p className="hint">Hech narsa tanlanmagan.</p>}
        {info && (
          <>
            <p><b>{info.n}</b> ta uy tanlandi</p>
            <div className="row">
              <span>Qavat</span>
              <button onClick={() => act({ dFloors: -1 })}>−</button>
              <b className="big">{info.floors ?? '…'}</b>
              <button onClick={() => act({ dFloors: +1 })}>+</button>
              {[1, 2, 3, 5, 9, 12, 16].map((f) => (
                <button key={f} className={info.floors === f ? 'on' : ''} onClick={() => act({ floors: f })}>{f}</button>
              ))}
            </div>
            <div className="row">
              <span>Tom</span>
              <button className={info.roof === 'pitched' ? 'on' : ''} onClick={() => act({ roof: 'pitched' })}>Qiya</button>
              <button className={info.roof === 'flat' ? 'on' : ''} onClick={() => act({ roof: 'flat' })}>Tekis</button>
            </div>
            <div className="row">
              <span>Ko‘rinish</span>
              <button onClick={() => act({ hidden: !info.hidden })}>{info.hidden ? 'Ko‘rsatish' : 'Yashirish'}</button>
              <button onClick={() => act({ reset: true })}>Taxminga qaytarish</button>
            </div>
          </>
        )}
        <hr />
        <p className="hint">Bu brauzerda {s?.editCount() ?? 0} ta uy tahrirlangan. Saytga chiqarish uchun faylni yuklab oling va <code>public/context/overrides.json</code> o‘rniga qo‘ying.</p>
        <button className="wide prim" onClick={exportJson}>JSON eksport (overrides.json)</button>
        <button className="wide" onClick={() => { if (confirm('Shu brauzerdagi barcha tahrirlar o‘chirilsinmi?')) { s?.clearAllEdits(); refresh(); } }}>Tahrirlarni tozalash</button>
      </aside>
    </>
  );
}
