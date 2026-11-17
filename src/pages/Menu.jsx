import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';

export default function Menu() {
  const { profile, isAdmin } = useAuth();
  const { unread = 0 } = useOutletContext() || {};
  const items = [
    { to: '/beranda', icon: 'home', label: 'Beranda' },
    { to: '/arisan', icon: 'target', label: 'Arisan' },
    { to: '/chat', icon: 'message', label: 'Chat', count: unread },
    ...(isAdmin ? [{ to: '/admin', icon: 'tools', label: 'Admin' }] : []),
    { to: '/akun', icon: 'user', label: 'Akun' },
  ];

  return (
    <section className="menu-page">
      <div className="menu-heading">
        <p className="muted small">ArisanKu</p>
        <h1>Menu</h1>
        <p className="muted">Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}. Mau membuka apa?</p>
      </div>
      <nav className="menu-grid" aria-label="Menu utama">
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="menu-tile">
            <Icon name={item.icon} size={38} className="menu-tile-icon" />
            <span>{item.label}</span>
            {item.count > 0 && <span className="menu-tile-count">{item.count > 9 ? '9+' : item.count}</span>}
          </Link>
        ))}
      </nav>
    </section>
  );
}
