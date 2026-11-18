import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export default function Modal({ title, onClose, children }) {
  const portalTarget = document.querySelector('.app');
  if (!portalTarget) return null;

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    portalTarget
  );
}
