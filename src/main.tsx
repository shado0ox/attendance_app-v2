import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { installAuthFetch } from './lib/authFetch.ts';

installAuthFetch();

// Respond before App's initial network request: a slow/offline API must not make
// an already modern client look like a legacy installation to the upgrade bridge.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'ATTENDANCE_UPDATE_PROBE') {
      event.ports[0]?.postMessage({ type: 'ATTENDANCE_UPDATE_CAPABLE' });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
