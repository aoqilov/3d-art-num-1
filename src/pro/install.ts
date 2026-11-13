// Registers the PRO renderer before the app starts (imported first by the PRO entry point).
import { PRO } from '../block/BlockScene';
import { createPro } from './ProRenderer';

PRO.create = createPro;
