import { STATUS } from '../lib/format';

export function Badge({ status, children }) {
  const s = STATUS[status] || { label: status, cls: 'off' };
  return <span className={`badge ${s.cls}`}>{children || s.label}</span>;
}

export function Spinner({ text = 'Memuat…' }) {
  return (
    <div className="center muted" style={{ padding: 32 }}>
      <div className="spin" />
      <div style={{ marginTop: 8 }}>{text}</div>
    </div>
  );
}

export function Empty({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <strong>{title}</strong>
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
