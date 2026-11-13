import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { getMode } from './mode';

// PRO renderer code is a separate chunk: downloaded only when PRO mode is chosen.
(async () => {
  if (getMode() === 'pro') {
    try { await import('./pro/install'); } catch (e) { console.warn('PRO renderer could not load', e); }
  }
  createRoot(document.getElementById('root')!).render(<App />);
})();
