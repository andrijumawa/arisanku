import { fmtDate, periodUnit, rupiah, typeLabel } from '../lib/format';

// Ringkasan rincian kelompok (dipakai di daftar arisan, beranda, dan admin)
export default function GroupInfo({ g }) {
  const total = Number(g.nominal) * g.durasi;
  const pot = Number(g.nominal) * (g.max_slots || g.durasi);
  return (
    <div className="kv">
      <div>
        <span>Iuran</span>
        <b>
          {rupiah(g.nominal)} / {periodUnit(g)}
        </b>
      </div>
      <div>
        <span>{g.type === 'uang' ? 'Jumlah putaran' : 'Jumlah cicilan'}</span>
        <b>{g.durasi}×</b>
      </div>
      {g.type === 'uang' ? (
        <>
          <div>
            <span>Cara undian</span>
            <b>{g.draw_mode === 'acak' ? 'Acak' : 'Berurutan'}</b>
          </div>
          <div>
            <span>Hadiah per putaran</span>
            <b>{rupiah(pot)}</b>
          </div>
        </>
      ) : (
        <>
          <div>
            <span>Jenis paket</span>
            <b>{typeLabel(g)}</b>
          </div>
          <div>
            <span>Total pembayaran</span>
            <b>{rupiah(total)}</b>
          </div>
          <div>
            <span>Pengambilan paket</span>
            <b>{fmtDate(g.pickup_date)}</b>
          </div>
        </>
      )}
      <div>
        <span>Mulai</span>
        <b>{fmtDate(g.start_date)}</b>
      </div>
      <div>
        <span>Batas akhir bayar</span>
        <b>{fmtDate(g.end_date)}</b>
      </div>
    </div>
  );
}
