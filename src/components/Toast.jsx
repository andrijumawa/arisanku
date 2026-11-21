import { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon.jsx';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

const toastPresentation = {
  success: { icon: 'check', label: 'Berhasil' },
  error: { icon: 'close', label: 'Perlu diperiksa' },
  info: { icon: 'target', label: 'Informasi' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <span className="toast-icon">
              <Icon name={toastPresentation[t.type]?.icon || 'target'} size={19} />
            </span>
            <span className="toast-copy">
              <strong>{toastPresentation[t.type]?.label || toastPresentation.info.label}</strong>
              <span>{t.message}</span>
            </span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
