import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import './styles.css';

const disableBrowserTextActions = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
};

document.addEventListener('contextmenu', disableBrowserTextActions);
document.addEventListener('selectstart', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let controllerWasPresent = Boolean(navigator.serviceWorker.controller);
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controllerWasPresent) {
        controllerWasPresent = true;
        return;
      }
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.error('Gagal memeriksa pembaruan aplikasi:', error));
  });
}
