// Energy view controls: flats heat map (winter heating / summer cooling) or the thermal-camera facade,
// insulation on / off for comparison, building class and running costs; card of the clicked flat or element.
import { useMemo } from 'react';
import { CLASSES, CLIMATE, TARIFF, TARIFF_DATE, THERMAL_INFO, aptEnergy, buildingEnergy, classOf, energyRange, heatColor, allFlats } from '../energy';
import type { EnergyPick } from '../BlockScene';
import type { Lang } from './i18n';

const S = {
  uz: {
    title: 'Energiya samaradorligi', mock: 'Taxminiy hisob — energetik pasport emas. Qavat rejalaridagi devor va deraza maydonlari, namunaviy materiallar, Toshkent iqlimi va amaldagi tariflar bo‘yicha.',
    flats: 'Kvartiralar', thermal: 'Termal fasad', winter: 'Qish · isitish', summer: 'Yoz · konditsioner',
    insul: 'Izolyatsiya bilan', bare: 'Izolyatsiyasiz', cls: 'Bino sinfi', perM2: 'kVt·soat/m² yiliga',
    avgW: 'O‘rtacha kvartira, qishda', avgS: 'yozda konditsioner', month: 'oyiga', save: (p: number, s: string) => `Izolyatsiya isitish sarfini ${p}% kamaytiradi — har kvartiraga yiliga ~${s}`,
    legendW: 'isitish, kVt·soat/m²', legendS: 'sovutish, kVt·soat/m²', hint: 'Kvartirani bosing — hisob-kitob chiqadi', hintT: 'Rang qanchalik qizil bo‘lsa, shuncha ko‘p issiqlik chiqib ketadi (−12 °C da). Elementni bosing.',
    tariff: `Tariflar ${TARIFF_DATE.split('-').reverse().join('.')} dan: gaz ${TARIFF.gas} so‘m/m³, elektr 650–1 100 so‘m/kVt·soat`,
    apt: (n: number) => `Kvartira № ${n}`, floor: (n: number) => `${n}-qavat`, heat: 'Isitish', gas: 'Gaz', winterM: 'Qishda o‘rtacha', peakM: 'Eng sovuq oy (yanvar)', summerM: 'Yozda konditsioner (qo‘shimcha)',
    loss: 'Issiqlik yo‘qotish −12 °C da', sides: (n: number) => (n >= 3 ? 'uch tomonga qaragan (burchak)' : n === 2 ? 'ikki tomonga qaragan' : 'bir tomonga qaragan'),
    win: 'derazalar', wall: 'tashqi devor', vs: 'Izolyatsiyasiz bo‘lganida', top: 'Yuqori qavat — tom orqali ham issiqlik chiqadi',
    u: 'Issiqlik uzatish U', q: 'Issiqlik oqimi −12 °C da', why: 'Plita va ustunlar fasadga chiqqan joyda "sovuq ko‘prik" hosil bo‘ladi — izolyatsiya uni yopadi.', yr: 'yiliga', sum: 'so‘m',
  },
  ru: {
    title: 'Энергоэффективность', mock: 'Ориентировочный расчёт — не энергопаспорт. По площадям стен и окон из планов, материалам-образцам, климату Ташкента и действующим тарифам.',
    flats: 'Квартиры', thermal: 'Тепловизор', winter: 'Зима · отопление', summer: 'Лето · кондиционер',
    insul: 'С утеплением', bare: 'Без утепления', cls: 'Класс здания', perM2: 'кВт·ч/м² в год',
    avgW: 'Средняя квартира, зимой', avgS: 'летом кондиционер', month: 'в мес.', save: (p: number, s: string) => `Утепление снижает расход на отопление на ${p}% — ~${s} в год на квартиру`,
    legendW: 'отопление, кВт·ч/м²', legendS: 'охлаждение, кВт·ч/м²', hint: 'Нажмите на квартиру — появится расчёт', hintT: 'Чем краснее цвет, тем больше тепла уходит (при −12 °C). Нажмите на элемент.',
    tariff: `Тарифы с ${TARIFF_DATE.split('-').reverse().join('.')}: газ ${TARIFF.gas} сум/м³, электричество 650–1 100 сум/кВт·ч`,
    apt: (n: number) => `Квартира № ${n}`, floor: (n: number) => `${n} этаж`, heat: 'Отопление', gas: 'Газ', winterM: 'Зимой в среднем', peakM: 'Самый холодный месяц (январь)', summerM: 'Летом кондиционер (дополнительно)',
    loss: 'Теплопотери при −12 °C', sides: (n: number) => (n >= 3 ? 'на три стороны (угловая)' : n === 2 ? 'на две стороны' : 'на одну сторону'),
    win: 'окна', wall: 'наружные стены', vs: 'Без утепления было бы', top: 'Верхний этаж — тепло уходит и через кровлю',
    u: 'Теплопередача U', q: 'Тепловой поток при −12 °C', why: 'Где плита и колонны выходят на фасад, образуется «мостик холода» — утеплитель его закрывает.', yr: 'в год', sum: 'сум',
  },
};
const money = (n: number, l: Lang) => Math.round(n / 1000) * 1000 > 0 ? (Math.round(n / 1000) * 1000).toLocaleString('ru-RU') + ' ' + S[l].sum : '—';
const kwh = (n: number) => Math.round(n).toLocaleString('ru-RU');

export type EnCtl = {
  view: 'flats' | 'thermal'; setView: (v: 'flats' | 'thermal') => void;
  season: 'winter' | 'summer'; setSeason: (s: 'winter' | 'summer') => void;
  insul: boolean; setInsul: (b: boolean) => void;
};

function Badge({ c, big }: { c: string; big?: boolean }) {
  const k = CLASSES.find((x) => x.c === c)!;
  return <span className={'en-badge' + (big ? ' big' : '')} style={{ background: k.color }}>{c}</span>;
}

export function EnergyPanel({ lang, blockId, c }: { lang: Lang; blockId: number; c: EnCtl }) {
  const t = S[lang];
  const b = useMemo(() => ({ ins: buildingEnergy(blockId, true), bare: buildingEnergy(blockId, false), fi: allFlats(blockId, true), fb: allFlats(blockId, false) }), [blockId]);
  const cur = c.insul ? b.ins : b.bare, flats = c.insul ? b.fi : b.fb;
  const avg = (k: 'winterBill' | 'summerBill') => flats.reduce((a, f) => a + f[k], 0) / flats.length;
  const savePct = Math.round((1 - b.ins.heat / b.bare.heat) * 100);
  const saveSum = (b.fb.reduce((a, f) => a + f.gas, 0) - b.fi.reduce((a, f) => a + f.gas, 0)) / b.fi.length * TARIFF.gas
    + (b.fb.reduce((a, f) => a + f.summerBill, 0) - b.fi.reduce((a, f) => a + f.summerBill, 0)) / b.fi.length * 5;
  const winter = c.season === 'winter';
  const [lo, hi] = energyRange(blockId, c.season);
  const pos = Math.min(100, (CLASSES.findIndex((k) => k.c === cur.cls) + 0.5) / CLASSES.length * 100);
  return (
    <div className="eng-panel en-panel glass">
      <div className="eng-h"><b>{t.title}</b></div>
      <p className="eng-mock">{t.mock}</p>
      <div className="con-tabs">
        <button className={c.view === 'flats' ? 'on' : ''} onClick={() => c.setView('flats')}>{t.flats}</button>
        <button className={c.view === 'thermal' ? 'on' : ''} onClick={() => c.setView('thermal')}>{t.thermal}</button>
      </div>
      <div className="en-seg">
        <button className={c.insul ? 'on' : ''} onClick={() => c.setInsul(true)}>{t.insul}</button>
        <button className={!c.insul ? 'on bad' : ''} onClick={() => c.setInsul(false)}>{t.bare}</button>
      </div>
      {c.view === 'flats' && (
        <div className="en-seg">
          <button className={winter ? 'on' : ''} onClick={() => c.setSeason('winter')}>❄ {t.winter}</button>
          <button className={!winter ? 'on' : ''} onClick={() => c.setSeason('summer')}>☀ {t.summer}</button>
        </div>
      )}
      <div className="en-sum">
        <Badge c={cur.cls} big />
        <div><small>{t.cls}</small><b>{Math.round(cur.kwhM2)}</b> <span>{t.perM2}</span></div>
      </div>
      <div className="en-scale">
        {CLASSES.map((k) => <i key={k.c} style={{ background: k.color }}>{k.c}</i>)}
        <em style={{ left: pos + '%' }} />
      </div>
      <div className="en-avg">
        <div><small>{t.avgW}</small><b>{money(avg('winterBill'), lang)}</b><span>{t.month}</span></div>
        <div><small>{t.avgS}</small><b>{money(avg('summerBill'), lang)}</b><span>{t.month}</span></div>
      </div>
      <p className="en-save">{t.save(savePct, money(saveSum, lang))}</p>
      {c.view === 'flats' ? (
        <>
          <div className="en-legend"><span style={{ background: `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => heatColor(lo + k * (hi - lo), lo, hi)).join(',')})` }} /><small><b>{lo}</b>{winter ? t.legendW : t.legendS}<b>{hi}</b></small></div>
          <p className="eng-hint">{t.hint}</p>
        </>
      ) : (
        <>
          <div className="en-legend"><span style={{ background: `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => heatColor(k, 0, 1)).join(',')})` }} /><small><b>5</b>W/m²<b>75+</b></small></div>
          <p className="eng-hint">{t.hintT}</p>
        </>
      )}
      <p className="en-tariff">{t.tariff}</p>
    </div>
  );
}

export function EnergyCard({ lang, blockId, pick, insul, onClose }: { lang: Lang; blockId: number; pick: EnergyPick; insul: boolean; onClose: () => void }) {
  const t = S[lang], li = lang === 'ru' ? 1 : 0;
  if ('mat' in pick) {
    const inf = THERMAL_INFO[pick.mat];
    if (!inf) return null;
    const u = inf.u(insul), dT = CLIMATE.tIn - CLIMATE.tDesign, q = u * dT;
    return (
      <div className="eng-card en-card glass">
        <button className="x" onClick={onClose} aria-label="×">×</button>
        <div className="eng-card-h"><i style={{ background: heatColor(q, 5, 75) }} /><span>{t.thermal}</span></div>
        <b>{inf.name[li]}</b>
        <ul>
          <li>{t.u}: <b>{u.toFixed(2)}</b> W/m²·K</li>
          <li>{t.q}: <b>{Math.round(q)}</b> W/m²</li>
          {(pick.mat === 'slab' || pick.mat === 'column') && <li>{t.why}</li>}
        </ul>
      </div>
    );
  }
  const a = aptEnergy(blockId, pick.storey, pick.index, insul), other = aptEnergy(blockId, pick.storey, pick.index, !insul);
  const maxW = Math.max(...a.parts.map((p) => p.w));
  return (
    <div className="eng-card en-card glass" ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>
      <button className="x" onClick={onClose} aria-label="×">×</button>
      <div className="eng-card-h"><Badge c={a.cls} /><span>{t.floor(a.storey)} · {a.area.toFixed(2)} m²</span></div>
      <b>{t.apt(a.num)}</b>
      <p className="en-meta">{t.sides(a.facades)} · {t.win} {a.winA.toFixed(1)} m² · {t.wall} {a.wallA.toFixed(0)} m²{a.roofA ? ` · ${t.top}` : ''}</p>
      <table className="en-tab"><tbody>
        <tr><td>{t.heat}</td><td><b>{kwh(a.heat)}</b> kVt·soat {t.yr} · {Math.round(a.kwhM2)}/m²</td></tr>
        <tr><td>{t.gas}</td><td><b>{kwh(a.gas)}</b> m³ {t.yr}</td></tr>
        <tr><td>{t.winterM}</td><td><b>{money(a.winterBill, lang)}</b> / {t.month}</td></tr>
        <tr><td>{t.peakM}</td><td><b>{money(a.peakBill, lang)}</b></td></tr>
        <tr><td>{t.summerM}</td><td><b>{money(a.summerBill, lang)}</b> / {t.month}</td></tr>
      </tbody></table>
      <small className="en-sub">{t.loss}: {(a.peakW / 1000).toFixed(1)} kW</small>
      <div className="en-parts">
        {a.parts.map((p, i) => (
          <div key={i}><span>{p.name[li]}</span><i style={{ width: (p.w / maxW) * 100 + '%' }} /><em>{Math.round(p.w)} W</em></div>
        ))}
      </div>
      {insul && <p className="en-vs">{t.vs}: <b>{money(other.winterBill, lang)}</b> / {t.month} · {lang === 'ru' ? 'класс' : 'sinf'} <Badge c={classOf(other.kwhM2).c} /></p>}
    </div>
  );
}
