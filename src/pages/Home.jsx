import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { bestPaymentByPeriod, fmtDate, periodName, periodUnit, rupiah, typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';

function getPaymentDate(startDate, payPeriod, periodNo) {
  if (!startDate || !periodNo) return null;
  const [year, month, day] = startDate.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const offset = periodNo - 1;

  if (payPeriod === 'harian') date.setUTCDate(date.getUTCDate() + offset);
  else if (payPeriod === 'mingguan') date.setUTCDate(date.getUTCDate() + offset * 7);
  else if (payPeriod === 'bulanan') {
    const targetMonth = date.getUTCMonth() + offset;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    date.setUTCDate(1);
    date.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
  } else return null;

  return date.toISOString().slice(0, 10);
}

export default function Home() {
  const { profile, session } = useAuth();
  const uid = session.user.id;

  const { data, loading, error, reload } = useAsync(async () => {
    const ms = await q(
      supabase
        .from('memberships')
        .select('id,status,slot_count,group_id,groups(id,name,type,nominal,durasi,pay_period,package_type,start_date)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    );
    const ids = ms.map((m) => m.id);
    const pays = ids.length
      ? await q(supabase.from('payments').select('membership_id,period_no,status').in('membership_id', ids))
      : [];
    return { ms, pays };
  }, [uid]);
  const displayedData = data;
  const realtimeSubscriptions = [
    { table: 'memberships', filter: `user_id=eq.${uid}` },
    ...(displayedData?.ms || []).map((m) => ({ table: 'payments', filter: `membership_id=eq.${m.id}` })),
  ];
  useRealtimeRefresh(reload, `home-${uid}`, realtimeSubscriptions);

  if (loading && !displayedData) return <Spinner />;
  if (error && !displayedData) return <ErrorBox error={error} onRetry={reload} />;

  const { ms, pays } = displayedData;
  const aktif = ms.filter((m) => m.status === 'aktif').length;
  const menungguDaftar = ms.filter((m) => m.status === 'menunggu').length;
  const menungguBayar = pays.filter((p) => p.status === 'menunggu').length;

  return (
    <>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <h2>Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}</h2>

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
        <Empty icon="target" title="Belum ikut arisan">
          Pilih arisan uang atau paket lebaran di menu <b>Arisan</b>, lalu tunggu persetujuan admin.
        </Empty>
      ) : (
        ms.map((m) => {
          const g = m.groups;
          const membershipPayments = pays.filter((payment) => payment.membership_id === m.id);
          const paymentsByPeriod = bestPaymentByPeriod(membershipPayments);
          const done = Object.values(paymentsByPeriod).filter((payment) => payment.status === 'disetujui').length;
          const nextPeriod = Array.from({ length: g.durasi }, (_, index) => index + 1)
            .find((period) => !paymentsByPeriod[period] || paymentsByPeriod[period].status === 'ditolak');
          const dueDate = nextPeriod ? getPaymentDate(g.start_date, g.pay_period, nextPeriod) : null;
          return (
            <Link key={m.id} to={`/g/${g.id}`} state={{ from: '/beranda' }} className="card link">
              <div className="card-head">
                <div>
                  <h3>{g.name}</h3>
                  <div className="muted small">
                    {typeLabel(g)} · {rupiah(g.nominal)}/{periodUnit(g)}
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
                    {membershipPayments.filter((payment) => payment.status === 'menunggu').length > 0 && (
                      <span>{membershipPayments.filter((payment) => payment.status === 'menunggu').length} menunggu verifikasi</span>
                    )}
                  </div>
                </>
              )}
              <div className="muted small home-payment-due">
                {dueDate
                  ? `Jatuh tempo pembayaran ${nextPeriod}: ${fmtDate(dueDate)}`
                  : nextPeriod
                    ? 'Tanggal jatuh tempo belum ditentukan'
                    : 'Tidak ada pembayaran berikutnya'}
              </div>
              {m.status === 'menunggu' && <div className="muted small">Menunggu persetujuan admin…</div>}
            </Link>
          );
        })
      )}
    </>
  );
}
