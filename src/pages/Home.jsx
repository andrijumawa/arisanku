import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync } from '../lib/hooks';
import { periodName, rupiah, typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';

export default function Home() {
  const { profile, session } = useAuth();
  const uid = session.user.id;

  const { data, loading, error, reload } = useAsync(async () => {
    const ms = await q(
      supabase.from('memberships').select('*, groups(*)').eq('user_id', uid).order('created_at', { ascending: false })
    );
    const ids = ms.map((m) => m.id);
    const pays = ids.length
      ? await q(supabase.from('payments').select('membership_id,status').in('membership_id', ids))
      : [];
    return { ms, pays };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { ms, pays } = data;
  const count = (mid, st) => pays.filter((p) => p.membership_id === mid && p.status === st).length;
  const aktif = ms.filter((m) => m.status === 'aktif').length;
  const menungguDaftar = ms.filter((m) => m.status === 'menunggu').length;
  const menungguBayar = pays.filter((p) => p.status === 'menunggu').length;

  return (
    <>
      <h2>Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'} 👋</h2>

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

      <div className="row between">
        <div className="section-title" style={{ margin: '4px 2px 8px' }}>
          Arisan saya
        </div>
        <Link to="/arisan" className="small">
          + Ikut arisan
        </Link>
      </div>

      {ms.length === 0 ? (
        <Empty icon="🎯" title="Belum ikut arisan">
          Pilih arisan uang atau paket lebaran di menu <b>Arisan</b>, lalu tunggu persetujuan admin.
        </Empty>
      ) : (
        ms.map((m) => {
          const g = m.groups;
          const done = count(m.id, 'disetujui');
          return (
            <Link key={m.id} to={`/g/${g.id}`} className="card link">
              <div className="card-head">
                <div>
                  <h3>{g.name}</h3>
                  <div className="muted small">
                    {typeLabel(g)} · {rupiah(g.nominal)}/{g.type === 'uang' ? 'bulan' : periodName(g).toLowerCase()}
                    {m.slot_count > 1 ? ` · ${m.slot_count} slot` : ''}
                  </div>
                </div>
                <Badge status={m.status} />
              </div>
              {m.status === 'aktif' && (
                <>
                  <Progress value={done} max={g.durasi} />
                  <div className="row between small muted" style={{ marginTop: 6 }}>
                    <span>
                      Lunas {done} dari {g.durasi} {periodName(g).toLowerCase()}
                    </span>
                    {count(m.id, 'menunggu') > 0 && <span>{count(m.id, 'menunggu')} menunggu verifikasi</span>}
                  </div>
                </>
              )}
              {m.status === 'menunggu' && <div className="muted small">Menunggu persetujuan admin…</div>}
            </Link>
          );
        })
      )}
    </>
  );
}
