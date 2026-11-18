import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { fmtDate, periodUnit, rupiah, typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import GroupInfo from '../components/GroupInfo.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

function BrowseGroupCard({ group, status, onJoin }) {
  const isMoney = group.type === 'uang';
  const prize = Number(group.nominal) * (group.max_slots || group.durasi);
  const dates = [
    group.start_date && { label: 'Mulai', value: fmtDate(group.start_date), icon: 'calendar' },
    group.end_date && { label: 'Batas pembayaran', value: fmtDate(group.end_date), icon: 'clock' },
  ].filter(Boolean);

  return (
    <article className="browse-group">
      <header className="browse-group-head">
        <span className={`browse-group-icon ${isMoney ? 'money' : 'package'}`}>
          <Icon name={isMoney ? 'coin' : 'gift'} size={25} />
        </span>
        <div className="browse-group-title">
          <div className="browse-group-kicker">{isMoney ? 'Kelompok arisan uang' : 'Kelompok arisan paket'}</div>
          <h3>{group.name}</h3>
          <span className={`badge type ${group.type}`}>{typeLabel(group)}</span>
        </div>
        {status && <Badge status={status} />}
      </header>

      {group.description && <p className="browse-group-description">{group.description}</p>}
      {!isMoney && group.package_detail && (
        <p className="browse-package-detail"><Icon name="gift" size={16} />{group.package_detail}</p>
      )}

      <section className="browse-contribution" aria-label="Informasi iuran">
        <span>{isMoney ? `Iuran per ${periodUnit(group)}` : `Cicilan per ${periodUnit(group)}`}</span>
        <strong>{rupiah(group.nominal)}</strong>
        <small>{isMoney ? 'Kontribusi setiap periode' : 'Pembayaran setiap periode'}</small>
      </section>

      <dl className="browse-group-facts">
        <div className="browse-group-fact">
          <dt><Icon name="target" size={16} />{isMoney ? 'Jumlah putaran' : 'Jumlah cicilan'}</dt>
          <dd>{group.durasi} kali</dd>
        </div>
        {isMoney ? (
          <>
            <div className="browse-group-fact">
              <dt><Icon name="shuffle" size={16} />Cara undian</dt>
              <dd>{group.draw_mode === 'acak' ? 'Diacak' : 'Berurutan'}</dd>
            </div>
            <div className="browse-group-fact browse-group-fact-wide">
              <dt><Icon name="gift" size={16} />Perkiraan hadiah per putaran</dt>
              <dd>{rupiah(prize)}</dd>
            </div>
          </>
        ) : (
          <>
            <div className="browse-group-fact">
              <dt><Icon name="gift" size={16} />Jenis paket</dt>
              <dd>{group.package_type || 'Paket arisan'}</dd>
            </div>
            <div className="browse-group-fact browse-group-fact-wide">
              <dt><Icon name="coin" size={16} />Total pembayaran</dt>
              <dd>{rupiah(Number(group.nominal) * group.durasi)}</dd>
            </div>
          </>
        )}
      </dl>

      {dates.length > 0 && (
        <div className="browse-group-dates">
          {dates.map((date) => (
            <div className="browse-date" key={date.label}>
              <Icon name={date.icon} size={16} />
              <span>{date.label}</span>
              <strong>{date.value}</strong>
            </div>
          ))}
        </div>
      )}

      <footer className="browse-group-actions">
        {status ? (
          <Link to={`/g/${group.id}`} className="btn browse-group-button">
            Lihat detail <Icon name="arrowRight" size={17} />
          </Link>
        ) : (
          <button className="btn primary browse-group-button" onClick={() => onJoin(group)}>
            Daftar kelompok <Icon name="arrowRight" size={17} />
          </button>
        )}
        {status === 'menunggu' && <span className="browse-group-note">Pendaftaran menunggu persetujuan admin.</span>}
      </footer>
    </article>
  );
}

export default function Browse({ embedded = false, excludeMine = false }) {
  const { session } = useAuth();
  const uid = session.user.id;
  const toast = useToast();
  const [joining, setJoining] = useState(null);
  const [slots, setSlots] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const groups = await q(
      supabase
        .from('groups')
        .select('id,type,name,description,nominal,durasi,max_slots,draw_mode,pay_period,package_type,package_detail,start_date,end_date,pickup_date,is_open')
        .order('created_at', { ascending: false })
    );
    const mine = await q(supabase.from('memberships').select('group_id,status').eq('user_id', uid));
    return { groups, mine: Object.fromEntries(mine.map((m) => [m.group_id, m.status])) };
  }, [uid]);
  useRealtimeRefresh(
    reload,
    `browse-${uid}`,
    [{ table: 'groups' }, { table: 'memberships', filter: `user_id=eq.${uid}` }]
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { groups, mine } = data;
  const list = groups.filter((g) => (g.is_open || mine[g.id]) && (!excludeMine || !mine[g.id]));

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
  }

  return (
    <>
      {embedded ? (
        <header className="home-section-heading home-discover-heading" id="kelompok-tersedia">
          <span className="home-section-icon"><Icon name="search" size={19} /></span>
          <div>
            <h2>Temukan arisan</h2>
            <p>Pilih kelompok yang sedang membuka pendaftaran</p>
          </div>
        </header>
      ) : <h2>Pilih Arisan</h2>}
      {list.length === 0 ? (
        <Empty icon="search" title={excludeMine ? 'Belum ada kelompok baru' : 'Belum ada arisan yang dibuka'}>
          {excludeMine
            ? 'Kelompok yang membuka pendaftaran akan muncul di sini.'
            : 'Admin akan membuka kelompok baru. Cek lagi nanti.'}
        </Empty>
      ) : (
        <div className={`browse-groups${embedded ? ' browse-groups-embedded' : ''}`}>
          {list.map((group) => (
            <BrowseGroupCard
              key={group.id}
              group={group}
              status={mine[group.id]}
              onJoin={setJoining}
            />
          ))}
        </div>
      )}

      {joining && (
        <Modal title={`Daftar: ${joining.name}`} onClose={() => setJoining(null)}>
          <div className="stack">
            {joining.type === 'uang' ? (
              <label className="field">
                <span>Jumlah slot yang ingin diikuti</span>
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
          </div>
        </Modal>
      )}
    </>
  );
}
