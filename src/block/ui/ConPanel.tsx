// Construction view controls: layers, exploded view and section; construction stages with play; bill of quantities;
// and the material card of the clicked element (client / engineer wording, layer build-up, rebar note).
import { useEffect, useRef, useState } from 'react';
import { LAYERS, MATS, MOCK, STAGES, STAGE_MAX, type ConPick, type Layer, type Quantity } from '../construction';
import type { Lang } from './i18n';

const S = {
  uz: {
    title: 'Qurilish va materiallar', mock: 'Namunaviy ma’lumot — konstruktiv loyiha (КЖ, АР) emas. Toshkentdagi 16 qavatli monolit uylarning odatiy yechimi.',
    tabs: ['Qatlamlar', 'Bosqichlar', 'Hajmlar'], explode: 'Qavatlarni ajratish', cut: 'Kesim', none: 'yo‘q',
    play: 'Ijro', pause: 'To‘xtat', stage: 'Bosqich', hint: 'Elementni bosing — material haqida ma’lumot va armaturasi chiqadi',
    qty: 'Taxminiy hajmlar (shu modeldan hisoblangan)', csv: 'CSV yuklab olish', client: 'Mijoz', eng: 'Muhandis', std: 'Me’yor',
    cake: 'Qatlamlari', storey: (s: number) => (s === 0 ? 'Poydevor' : s === 17 ? 'Tom' : `${s}-qavat`), rebar: 'Armatura sariq-to‘q sariq rangda ko‘rsatilgan',
    today: 'Bugungi holat', todayNote: (p: number) => `Oxirgi hisobot bo‘yicha bu blok ${p}% tayyor (namunaviy jadval)`,
  },
  ru: {
    title: 'Конструкции и материалы', mock: 'Данные-образец — не проект (КЖ, АР). Типовое решение 16-этажного монолитного дома в Ташкенте.',
    tabs: ['Слои', 'Этапы', 'Объёмы'], explode: 'Разнести этажи', cut: 'Разрез', none: 'нет',
    play: 'Пуск', pause: 'Пауза', stage: 'Этап', hint: 'Нажмите на элемент — описание материала и армирование',
    qty: 'Ориентировочные объёмы (по этой модели)', csv: 'Скачать CSV', client: 'Покупатель', eng: 'Инженер', std: 'Норматив',
    cake: 'Состав', storey: (s: number) => (s === 0 ? 'Фундамент' : s === 17 ? 'Кровля' : `${s} этаж`), rebar: 'Арматура показана оранжевым',
    today: 'Сегодня', todayNote: (p: number) => `По последнему отчёту блок готов на ${p}% (образец графика)`,
  },
};

export type ConCtl = {
  layers: Layer[]; setLayers: (l: Layer[]) => void;
  stage: number; setStage: (p: number) => void;
  explode: number; setExplode: (e: number) => void;
  cut: number; setCut: (f: number) => void;
  quantities: Quantity[];
  /** this block's stage in the latest site report (live construction) */
  today?: number;
};

export function ConPanel({ lang, c }: { lang: Lang; c: ConCtl }) {
  const t = S[lang], li = lang === 'ru' ? 1 : 0;
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef(c.stage);
  stageRef.current = c.stage;
  // play: the building grows stage by stage
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const p = Math.min(STAGE_MAX, stageRef.current + dt * 0.45);
      c.setStage(p);
      if (p >= STAGE_MAX) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const cur = [...STAGES].reverse().find((s) => c.stage >= s.at) ?? STAGES[0];
  const toggle = (l: Layer) => c.setLayers(c.layers.includes(l) ? c.layers.filter((x) => x !== l) : [...c.layers, l]);
  const csv = () => {
    const rows = [['name', 'unit', 'value'], ...c.quantities.map((q) => [q.name[li].trim(), q.unit[li], q.value.toFixed(1)])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map((x) => `"${x}"`).join(';')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'obod-maskan-hajmlar.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="eng-panel con-panel glass">
      <div className="eng-h"><b>{t.title}</b></div>
      <p className="eng-mock">{t.mock}</p>
      <div className="con-tabs">{t.tabs.map((n, i) => <button key={n} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{n}</button>)}</div>
      {tab === 0 && (
        <>
          <div className="eng-sys">
            {LAYERS.map((l) => (
              <button key={l.id} className={c.layers.includes(l.id) ? 'on' : ''} onClick={() => toggle(l.id)}>{l.name[li]}</button>
            ))}
          </div>
          <label className="con-sl"><span>{t.explode}</span><input type="range" min={0} max={1} step={0.01} value={c.explode} onChange={(e) => c.setExplode(+e.target.value)} /></label>
          <label className="con-sl"><span>{t.cut}: <b>{c.cut <= 0.001 ? t.none : `${Math.round(c.cut * 100)} %`}</b></span><input type="range" min={0} max={0.95} step={0.01} value={c.cut} onChange={(e) => c.setCut(+e.target.value)} /></label>
          <p className="eng-hint">{t.hint}</p>
        </>
      )}
      {tab === 1 && (
        <>
          <div className="con-stage">
            <button className="con-play" onClick={() => { if (!playing && c.stage >= STAGE_MAX - 0.01) c.setStage(0); setPlaying(!playing); }}>{playing ? '❚❚ ' + t.pause : '▶ ' + t.play}</button>
            <input type="range" min={0} max={STAGE_MAX} step={0.01} value={c.stage} onChange={(e) => { setPlaying(false); c.setStage(+e.target.value); }} />
          </div>
          {c.today !== undefined && (
            <div className="con-today">
              <button className={Math.abs(c.stage - c.today) < 0.01 ? 'on' : ''} onClick={() => { setPlaying(false); c.setStage(c.today!); }}>● {t.today}</button>
              <small>{t.todayNote(Math.round((c.today / STAGE_MAX) * 100))}</small>
            </div>
          )}
          <ol className="con-steps">
            {STAGES.map((s, i) => (
              <li key={i} className={s === cur ? 'on' : c.stage > s.at ? 'done' : ''} onClick={() => { setPlaying(false); c.setStage(Math.min(STAGE_MAX, (STAGES[i + 1]?.at ?? STAGE_MAX) - 0.001)); }}>
                <b>{s.name[li]}</b><small>{s.time[li]}</small>
                {s === cur && <p>{s.note[li]}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
      {tab === 2 && (
        <>
          <p className="eng-hint" style={{ marginTop: 0 }}>{t.qty}</p>
          <table className="con-qty"><tbody>
            {c.quantities.map((q, i) => (
              <tr key={i} className={q.name[li].startsWith('  ') ? 'sub' : ''} title={q.note?.[li]}>
                <td>{q.name[li].trim()}</td><td className="n">{q.value >= 100 ? Math.round(q.value).toLocaleString('ru-RU') : q.value.toFixed(1)}</td><td>{q.unit[li]}</td>
              </tr>
            ))}
          </tbody></table>
          <button className="con-csv" onClick={csv}>{t.csv}</button>
        </>
      )}
    </div>
  );
}

export function ConCard({ lang, pick, onClose }: { lang: Lang; pick: ConPick; onClose: () => void }) {
  const t = S[lang], li = lang === 'ru' ? 1 : 0;
  const [who, setWho] = useState<'client' | 'eng'>('client');
  const m = MATS[pick.mat];
  const total = m.cake?.reduce((a, l) => a + Math.max(l.mm, 8), 0) ?? 1;
  return (
    <div className="eng-card con-card glass">
      <button className="x" onClick={onClose} aria-label="×">×</button>
      <div className="eng-card-h"><i style={{ background: m.color }} /><span>{t.storey(pick.storey)}</span></div>
      <b>{m.name[li]}</b>
      <div className="con-who">
        <button className={who === 'client' ? 'on' : ''} onClick={() => setWho('client')}>{t.client}</button>
        <button className={who === 'eng' ? 'on' : ''} onClick={() => setWho('eng')}>{t.eng}</button>
      </div>
      {who === 'client' ? <p className="con-client">{m.client[li]}</p> : (
        <>
          <ul>{m.specs.map((s, i) => <li key={i}>{s[li]}</li>)}</ul>
          <p className="con-std">{t.std}: {m.std}</p>
        </>
      )}
      {m.cake && (
        <div className="con-cake">
          <small>{t.cake}</small>
          <div className="bars">
            {m.cake.map((l, i) => (
              <div key={i} className="bar" style={{ flexGrow: Math.max(l.mm, 8) / total }}>
                <i style={{ background: l.color }} /><span>{l.name[li]}</span><em>{l.mm} mm</em>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.rebar && <p className="con-rebar">{t.rebar}</p>}
      <p className="con-mock">{MOCK[li]}</p>
    </div>
  );
}
