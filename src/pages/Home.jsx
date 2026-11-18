import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { periodName, rupiah, typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import Browse from './Browse.jsx';

export default function Home() {
  const { profile, session } = useAuth();
  const uid = session.user.id;

  const { data, loading, error, reload } = useAsync(async () => {
    const ms = await q(
      supabase
        .from('memberships')
        .select('id,status,slot_count,group_id,groups(id,name,type,nominal,durasi,pay_period,package_type)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    );
    const ids = ms.map((m) => m.id);
    const pays = ids.length
      ? await q(supabase.from('payments').select('membership_id,status').in('membership_id', ids))
      : [];
    return { ms, pays };
  }, [uid]);
  const realtimeSubscriptions = [
    { table: 'memberships', filter: `user_id=eq.${uid}` },
    ...(data?.ms || []).map((m) => ({ table: 'payments', filter: `membership_id=eq.${m.id}` })),
  ];
  useRealtimeRefresh(reload, `home-${uid}`, realtimeSubscriptions);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { ms, pays } = data;
  const count = (mid, st) => pays.filter((p) => p.membership_id === mid && p.status === st).length;
  const aktif = ms.filter((m) => m.status === 'aktif').length;
  const menungguDaftar = ms.filter((m) => m.status === 'menunggu').length;
  const menungguBayar = pays.filter((p) => p.status === 'menunggu').length;

  return (
    <div className="home-dashboard">
      <header className="home-hero">
        <div>
          <span className="home-kicker">RUANG ARISANKU</span>
          <h1>Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}</h1>
          <p>Kelola kelompok yang kamu ikuti dan temukan arisan yang cocok.</p>
        </div>
        <span className="home-hero-mark" aria-hidden="true"><Icon name="target" size={27} /></span>
      </header>

      <div className="stats">
        <div className="stat">
          <b>{aktif}</b>
          <span>Arisan aktif</span>
        </div>
        <div className="stat">
          <b>{menungguDaftar}</b>
          <span>Menunggu persetujuan</span>
        </div>
        <div className="stat">
          <b>{menungguBayar}</b>
          <span>Bayar diverifikasi</span>
        </div>
      </div>

      <section className="home-section" aria-labelledby="home-groups-title">
        <div className="home-section-heading">
          <span className="home-section-icon"><Icon name="users" size={19} /></span>
          <div>
            <h2 id="home-groups-title">Arisan saya</h2>
            <p>Kelompok dan status keikutsertaanmu</p>
          </div>
        </div>

        {ms.length === 0 ? (
          <Empty icon="target" title="Belum ikut arisan">
            Lihat kelompok yang tersedia di bawah, lalu daftar untuk mulai.
          </Empty>
        ) : (
          <div className="home-memberships">
            {ms.map((m) => {
              const g = m.groups;
              const done = count(m.id, 'disetujui');
              return (
                <Link key={m.id} to={`/g/${g.id}`} className="home-membership card link">
                  <div className="home-membership-head">
                    <span className={`home-membership-icon ${g.type === 'uang' ? 'is-money' : 'is-package'}`}>
                      <Icon name={g.type === 'uang' ? 'coin' : 'gift'} size={19} />
                    </span>
                    <div className="home-membership-title">
                      <h3>{g.name}</h3>
                      <span>
                        {typeLabel(g)} · {rupiah(g.nominal)}/{g.type === 'uang' ? 'bulan' : periodName(g).toLowerCase()}
                        {m.slot_count > 1 ? ` · ${m.slot_count} slot` : ''}
                      </span>
                    </div>
                    <Badge status={m.status} />
                  </div>
                  {m.status === 'aktif' && (
                    <div className="home-membership-progress">
                      <Progress value={done} max={g.durasi} />
                      <div className="row between small muted" style={{ marginTop: 6 }}>
                        <span>
                          Lunas {done} dari {g.durasi} {periodName(g).toLowerCase()}
                        </span>
                        {count(m.id, 'menunggu') > 0 && <span>{count(m.id, 'menunggu')} menunggu verifikasi</span>}
                      </div>
                    </div>
                  )}
                  {m.status === 'menunggu' && <div className="home-membership-pending">Menunggu persetujuan admin</div>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Browse embedded excludeMine />
    </div>
  );
}
