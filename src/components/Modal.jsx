import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export default function Modal({ title, onClose, tall = false, children }) {
  const app = document.querySelector('.app');
  if (!app) return null;
  const themeProperties = ['--bg', '--ink', '--muted', '--line', '--brand', '--brand-d', '--brand-l', '--gold', '--gold-l'];
  const themeStyle = Object.fromEntries(
    themeProperties.map((property) => [
      property,
      getComputedStyle(app).getPropertyValue(property).trim(),
    ])
  );

  return createPortal(
    <div className="overlay" style={themeStyle} onClick={onClose}>
      <div
        className={`sheet${tall ? ' sheet-tall' : ''}`}
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
    document.body
  );
}