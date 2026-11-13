// BASIC | PRO switch shown beside the OBOD MASKAN brand.
import { PRO } from '../BlockScene';
import { setMode, type Mode } from '../../mode';

const TIP: Record<Mode, string> = {
  basic: 'Basic — yengil rejim, har qanday qurilmada tez ishlaydi',
  pro: 'PRO — fotorealistik grafika (PBR teksturalar, HDR osmon, AO, bloom). Kuchli videokarta kerak (GTX 1650+)',
};

export default function ModeSwitch() {
  const cur: Mode = PRO.create ? 'pro' : 'basic';
  return (
    <span className="mode-sw" onClick={(e) => e.stopPropagation()}>
      {(['basic', 'pro'] as Mode[]).map((m) => (
        <button key={m} className={cur === m ? 'on' : ''} title={TIP[m]} aria-pressed={cur === m} onClick={() => cur !== m && setMode(m)}>
          {m === 'basic' ? 'BASIC' : 'PRO'}
        </button>
      ))}
    </span>
  );
}
