import { STATUS } from '../lib/format';
import Icon from './Icon.jsx';

export function Badge({ status, children }) {
  const s = STATUS[status] || { label: status, cls: 'off' };
  return <span className={`badge ${s.cls}`}>{children || s.label}</span>;
}

export function Spinner({ text = 'Memuat…' }) {
  return (
    <div className="center muted" style={{ padding: 32 }} role="status" aria-live="polite">
      <div className="spin" aria-hidden="true" />
      <div style={{ marginTop: 8 }}>{text}</div>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} className="empty-ico" aria-hidden="true" />
      <strong role="heading" aria-level="3">{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="card err-box">
      <strong>Terjadi kesalahan</strong>
      <p className="muted">{error?.message || String(error)}</p>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function Progress({ value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" title={`${value}/${max}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
