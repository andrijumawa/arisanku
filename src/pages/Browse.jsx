import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync } from '../lib/hooks';
import { typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import GroupInfo from '../components/GroupInfo.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Browse() {
  const { session } = useAuth();
  const uid = session.user.id;
  const toast = useToast();
  const [joining, setJoining] = useState(null);
  const [slots, setSlots] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const groups = await q(supabase.from('groups').select('*').order('created_at', { ascending: false }));
    const mine = await q(supabase.from('memberships').select('group_id,status').eq('user_id', uid));
    return { groups, mine: Object.fromEntries(mine.map((m) => [m.group_id, m.status])) };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { groups, mine } = data;
  const list = groups.filter((g) => g.is_open || mine[g.id]);

  async function join() {
    setBusy(true);
    const g = joining;
    const { error } = await supabase
      .from('memberships')
      .insert({ group_id: g.id, user_id: uid, slot_count: g.type === 'uang' ? Math.max(1, Number(slots) || 1) : 1 });
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast('Pendaftaran terkirim. Menunggu persetujuan admin.', 'success');
    setJoining(null);
    setSlots(1);
    reload();
  }

  return (
    <>
      <h2>Pilih Arisan</h2>
      {list.length === 0 ? (
        <Empty icon="🔎" title="Belum ada arisan yang dibuka">
          Admin akan membuka kelompok baru. Cek lagi nanti.
        </Empty>
      ) : (
        list.map((g) => {
          const st = mine[g.id];
          return (
            <div key={g.id} className="card">
              <div className="card-head">
                <div>
                  <h3>{g.name}</h3>
                  <span className={`badge type ${g.type}`}>{typeLabel(g)}</span>
                  {g.type === 'paket' && <span className="badge off" style={{ marginLeft: 6 }}>{g.pay_period}</span>}
                </div>
                {st && <Badge status={st} />}
              </div>
              {g.description && <p className="muted small">{g.description}</p>}
              {g.type === 'paket' && g.package_detail && <p className="small">🎁 {g.package_detail}</p>}
              <GroupInfo g={g} />
              <div className="actions">
                {!st && (
                  <button className="btn primary" onClick={() => setJoining(g)}>
                    Daftar
                  </button>
                )}
                {st && (
                  <Link to={`/g/${g.id}`} className="btn">
                    Lihat detail
                  </Link>
                )}
              </div>
            </div>
          );
        })
      )}

      {joining && (
        <Modal title={`Daftar: ${joining.name}`} onClose={() => setJoining(null)}>
          <GroupInfo g={joining} />
          <hr className="divider" />
          {joining.type === 'uang' ? (
            <label className="field">
              <span>Jumlah slot (nomor undian)</span>
              <input type="number" min="1" value={slots} onChange={(e) => setSlots(e.target.value)} />
              <div className="hint">Memegang lebih dari 1 slot berarti iuran dikalikan jumlah slot.</div>
            </label>
          ) : (
            <div className="alert info">
              Satu kelompok = satu jenis paket. Untuk paket lain, daftar di kelompok yang berbeda.
            </div>
          )}
          <p className="muted small">Pendaftaran akan diperiksa dan disetujui oleh admin sebelum kamu bisa membayar.</p>
          <button className="btn primary block" disabled={busy} onClick={join}>
            {busy ? 'Mengirim…' : 'Kirim pendaftaran'}
          </button>
        </Modal>
      )}
    </>
  );
}
