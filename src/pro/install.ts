// Registers the PRO renderer before the app starts (imported first by the PRO entry point).
import { PRO } from '../block/BlockScene';
import { createPro } from './ProRenderer';
import { sunLight } from './atmosphere';

PRO.create = createPro;
PRO.sunLight = sunLight;
