import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ConfirmContext = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setRequest({
        title: normalized.title || 'Konfirmasi',
        message: normalized.message || '',
        confirmLabel: normalized.confirmLabel || 'Ya',
        cancelLabel: normalized.cancelLabel || 'Batal',
        danger: normalized.danger !== false,
      });
    });
  }, []);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') settle(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [request, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) settle(false);
        }}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
            <span className="confirm-dialog-icon" aria-hidden="true">
              <Icon name={request.danger ? 'close' : 'target'} size={21} />
            </span>
            <div className="confirm-dialog-copy">
              <h2 id="confirm-title">{request.title}</h2>
              <p id="confirm-message">{request.message}</p>
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn confirm-cancel" onClick={() => settle(false)} autoFocus>
                {request.cancelLabel}
              </button>
              <button
                type="button"
                className={`btn ${request.danger ? 'danger' : 'primary'} confirm-accept`}
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
