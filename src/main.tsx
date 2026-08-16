import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

// Notify native updater that app loaded successfully (prevents auto-rollback)
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch((err) => {
    console.warn('CapacitorUpdater notifyAppReady failed:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

