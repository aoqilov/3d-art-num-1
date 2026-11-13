// Engineering view controls: which networks show, which storey, and the card of the clicked pipe / device.
// The networks are a schematic mock derived from the floor plans — the panel says so in both languages.
import { SYSTEMS, SYS_ORDER, type EngInfo, type Sys } from '../engineering';
import type { Lang } from './i18n';

const S = {
  uz: {
    title: 'Muhandislik tarmoqlari', mock: 'Namunaviy sxema — haqiqiy loyiha (ВК, ОВ, ЭО, ГС) emas. Qavat rejalaridan kelib chiqib chizilgan.',
    whole: 'Butun bino', floor: 'Qavat', ground: '1 (texnik)', hint: 'Quvur yoki jihozni bosing — ma’lumot chiqadi', all: 'Hammasi',
    wholeNote: 'Butun binoda stoyaklar, kirishlar va magistrallar; kvartira ichidagi tarmoqlar — qavat tanlanganda.',
  },
  ru: {
    title: 'Инженерные сети', mock: 'Схема-образец — не проект (ВК, ОВ, ЭО, ГС). Построена по планам этажей.',
    whole: 'Всё здание', floor: 'Этаж', ground: '1 (тех.)', hint: 'Нажмите на трубу или прибор — появится описание', all: 'Все',
    wholeNote: 'Для здания целиком — стояки, вводы и магистрали; разводка по квартирам — при выборе этажа.',
  },
};

export function EngPanel({ lang, systems, setSystems, storey, setStorey }: {
  lang: Lang; systems: Sys[]; setSystems: (s: Sys[]) => void; storey: number | null; setStorey: (s: number | null) => void;
}) {
  const t = S[lang], li = lang === 'ru' ? 1 : 0;
  const toggle = (s: Sys) => setSystems(systems.includes(s) ? systems.filter((x) => x !== s) : [...systems, s]);
  return (
    <div className="eng-panel glass">
      <div className="eng-h"><b>{t.title}</b></div>
      <p className="eng-mock">{t.mock}</p>
      <div className="eng-sys">
        {SYS_ORDER.map((s) => (
          <button key={s} className={systems.includes(s) ? 'on' : ''} onClick={() => toggle(s)}>
            <i style={{ background: SYSTEMS[s].color }} />{SYSTEMS[s].name[li]}
          </button>
        ))}
        <button className="all" onClick={() => setSystems(systems.length === SYS_ORDER.length ? [] : [...SYS_ORDER])}>{t.all}</button>
      </div>
      <div className="eng-floor">
        <button className={storey === null ? 'on' : ''} onClick={() => setStorey(null)}>{t.whole}</button>
        <label>
          <span>{t.floor}: <b>{storey === null ? '—' : storey === 1 ? t.ground : storey}</b></span>
          <input type="range" min={1} max={16} step={1} value={storey ?? 9} onChange={(e) => setStorey(+e.target.value)} />
        </label>
      </div>
      <p className="eng-hint">{storey === null ? t.wholeNote : t.hint}</p>
    </div>
  );
}

export function EngCard({ lang, info, onClose }: { lang: Lang; info: EngInfo; onClose: () => void }) {
  const li = lang === 'ru' ? 1 : 0;
  return (
    <div className="eng-card glass">
      <button className="x" onClick={onClose} aria-label="×">×</button>
      <div className="eng-card-h"><i style={{ background: SYSTEMS[info.sys].color }} /><span>{SYSTEMS[info.sys].name[li]}</span></div>
      <b>{info.title[li]}</b>
      <ul>{info.lines.map((l, i) => <li key={i} className={i === info.lines.length - 1 ? 'mock' : ''}>{l[li]}</li>)}</ul>
    </div>
  );
}

export const MODE_LABEL = { uz: ['Oddiy', 'Muhandislik', 'Qurilish', 'Energiya'], ru: ['Обычный', 'Инженерия', 'Стройка', 'Энергия'] } as const;
