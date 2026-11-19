import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { loadHomeData } from '../lib/menuData';
import { addDaysToDate, bestPaymentByPeriod, fmtDate, paymentDueDate, periodName, periodUnit, rupiah, typeLabel } from '../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';

export default function Home() {
  const { profile, session } = useAuth();
  const uid = session.user.id;

  const { data, loading, error, reload } = useAsync(loadHomeData, [uid]);
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
            .find((period) => paymentsByPeriod[period]?.status !== 'disetujui');
          const dueDate = nextPeriod ? paymentDueDate(g.start_date, g.pay_period, nextPeriod) : null;
          const withdrawalDate = dueDate ? addDaysToDate(dueDate, 7) : null;
          const nextPayment = paymentsByPeriod[nextPeriod];
          return (
            <article key={m.id} className="card home-membership-card">
              <Link to={`/g/${g.id}`} state={{ from: '/beranda' }} className="home-membership-link">
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
                    <div className="row between small muted home-payment-progress">
                      <span>
                        Lunas {done} dari {g.durasi} {periodName(g).toLowerCase()}
                      </span>
                      {membershipPayments.filter((payment) => payment.status === 'menunggu').length > 0 && (
                        <span>{membershipPayments.filter((payment) => payment.status === 'menunggu').length} menunggu verifikasi</span>
                      )}
                    </div>
                  </>
                )}
                {m.status === 'menunggu' && <div className="muted small">Menunggu persetujuan admin…</div>}
              </Link>
              {m.status === 'aktif' && nextPeriod && (
                <details className="home-payment-details">
                  <summary>Jadwal pembayaran</summary>
                  {dueDate ? (
                    <table>
                      <tbody>
                        <tr>
                          <th scope="row">{periodName(g)}</th>
                          <td>Ke-{nextPeriod}</td>
                        </tr>
                        <tr>
                          <th scope="row">Jatuh tempo</th>
                          <td>{fmtDate(dueDate)}</td>
                        </tr>
                        <tr>
                          <th scope="row">Tanggal penarikan</th>
                          <td>{fmtDate(withdrawalDate)}</td>
                        </tr>
                        {nextPayment && (
                          <tr>
                            <th scope="row">Status</th>
                            <td>
                              {nextPayment.status === 'menunggu'
                                ? 'Bukti menunggu verifikasi'
                                : nextPayment.status === 'ditolak'
                                  ? 'Bukti ditolak'
                                  : 'Belum dibayar'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted small">Tanggal jatuh tempo belum ditentukan.</p>
                  )}
                </details>
              )}
            </article>
          );
        })
      )}
    </>
  );
}
