import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { bestPaymentByPeriod, fmtDate, periodName, rupiah, typeLabel, withdrawalDate } from '../lib/format';
import { compressImage } from '../lib/image';
import { Badge, ErrorBox, Spinner } from '../components/Ui.jsx';
import GroupInfo from '../components/GroupInfo.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import Icon from '../components/Icon.jsx';

export default function GroupDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { session } = useAuth();
  const uid = session.user.id;
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const returnTo = ['/beranda', '/arisan'].includes(location.state?.from) ? location.state.from : '/beranda';
  const [uploading, setUploading] = useState(null); // nomor periode
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const group = await q(
      supabase
        .from('groups')
        .select('id,type,name,description,nominal,durasi,max_slots,draw_mode,pay_period,package_type,package_detail,start_date,end_date,pickup_date')
        .eq('id', id)
        .single()
    );
    let availability = [];
    let availabilityError = null;
    if (group.type === 'uang') {
      const result = await supabase.rpc('group_availability_for_group', { p_group: id });
      availabilityError = result.error;
      if (availabilityError) {
        console.error('Gagal memuat ringkasan slot kelompok:', availabilityError);
      } else {
        availability = result.data || [];
      }
    }
    const mem = await q(
      supabase.from('memberships').select('id,slot_count,status').eq('group_id', id).eq('user_id', uid).maybeSingle()
    );
    let payments = [];
    if (mem) {
      payments = await q(
        supabase.from('payments').select('period_no,status,note,created_at').eq('membership_id', mem.id).order('created_at', { ascending: false })
      );
    }
    let rounds = [];
    let rouletteDraws = [];
    let names = {};
    if (group.type === 'uang') {
      rounds = await q(
        supabase.from('rounds').select('id,round_no,winner_user_id,pickup_date,status').eq('group_id', id).order('round_no')
      );
      rouletteDraws = await q(
        supabase.from('roulette_draws').select('id,period_no,participants').eq('group_id', id).order('period_no')
      );
      const ids = [
        ...new Set([
          ...rounds.map((round) => round.winner_user_id),
          ...rouletteDraws.flatMap((draw) => (draw.participants || []).map((participant) => participant.user_id)),
        ].filter(Boolean)),
      ];
      if (ids.length) {
        const ps = await q(supabase.from('public_profiles').select('id,full_name').in('id', ids));
        names = Object.fromEntries(ps.map((p) => [p.id, p.full_name]));
      }
    }
    return { group, mem, payments, rounds, rouletteDraws, names, availability, availabilityError };
  }, [id, uid]);

  const realtimeSubscriptions = useMemo(
    () => [
      { table: 'groups', filter: `id=eq.${id}` },
      { table: 'memberships', filter: `user_id=eq.${uid}` },
      ...(data?.mem ? [{ table: 'payments', filter: `membership_id=eq.${data.mem.id}` }] : []),
      { table: 'rounds', filter: `group_id=eq.${id}` },
      { table: 'roulette_draws', filter: `group_id=eq.${id}` },
      ...[...new Set([
        ...(data?.rounds || []).map((round) => round.winner_user_id),
        ...(data?.rouletteDraws || []).flatMap((draw) => (draw.participants || []).map((participant) => participant.user_id)),
      ].filter(Boolean))].map((winnerId) => ({
        table: 'profiles',
        filter: `id=eq.${winnerId}`,
      })),
    ],
    [data?.mem, data?.rounds, id, uid]
  );
  useRealtimeRefresh(reload, `group-${id}`, realtimeSubscriptions);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const byPeriod = useMemo(() => bestPaymentByPeriod(data?.payments), [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { group: g, mem, payments, rounds, rouletteDraws, names, availability, availabilityError } = data;
  const groupAvailability = availability.find((item) => item.group_id === g.id);
  const remainingSlots = g.max_slots != null && groupAvailability
    ? Math.max(0, Number(g.max_slots) - Number(groupAvailability.reserved_slots))
    : null;
  const rouletteRounds = rouletteDraws.flatMap((draw) => {
    const participants = draw.participants || [];
    return participants
      .slice(0, participants.length === 2 ? 2 : 1)
      .map((participant, index) => {
        const roundNo = draw.period_no + index;
        return rounds.find(
          (round) => round.round_no === roundNo && round.winner_user_id === participant.user_id
        ) || {
          id: `roulette-${draw.id}-${participant.user_id}`,
          round_no: roundNo,
          winner_user_id: participant.user_id,
          pickup_date: null,
          status: 'dijadwalkan',
        };
      });
  });
  const rouletteRoundNos = new Set(rouletteRounds.map((round) => round.round_no));
  const displayedRounds = [
    ...rouletteRounds,
    ...rounds.filter((round) => !rouletteRoundNos.has(round.round_no)),
  ].sort((a, b) => a.round_no - b.round_no);
  const amount = mem ? Number(g.nominal) * mem.slot_count : Number(g.nominal);
  const label = periodName(g);

  function closeUpload() {
    setUploading(null);
    setFile(null);
  }

  async function submitProof() {
    if (!file) return toast('Pilih foto bukti transfer dulu.', 'error');
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `${uid}/${g.id}/${uploading}-${Date.now()}.jpg`;
      const up = await supabase.storage.from('bukti-transfer').upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from('payments').insert({
        membership_id: mem.id,
        group_id: g.id,
        period_no: uploading,
        amount,
        proof_path: path,
      });
      if (error) throw error;
      toast('Bukti terkirim untuk diverifikasi admin.', 'success');
      closeUpload();
    } catch (x) {
      toast(x.message || 'Gagal mengunggah bukti', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelJoin() {
    const accepted = await confirm({
      title: 'Batalkan pendaftaran?',
      message: 'Pendaftaran Anda akan dibatalkan.',
      confirmLabel: 'Batalkan',
    });
    if (!accepted) return;
    const { error } = await supabase.from('memberships').delete().eq('id', mem.id);
    if (error) return toast(error.message, 'error');
    toast('Pendaftaran dibatalkan.');
    nav('/arisan', { replace: true });
  }

  return (
    <>
      <Link to={returnTo} className="small">
        <Icon name="back" size={16} /> Kembali
      </Link>
      <details className="card group-detail-overview" open>
        <summary className="group-detail-overview-toggle">
          <span className="group-detail-overview-heading">
            <span className="group-detail-overview-title">{g.name}</span>
            <span className="group-detail-overview-badges">
              <span className={`badge type ${g.type}`}>{typeLabel(g)}</span>
              {g.type === 'paket' && <span className="badge off">{g.pay_period}</span>}
              {mem && <Badge status={mem.status} />}
            </span>
          </span>
        </summary>
        <div className="group-detail-overview-content">
          {g.description && <p className="muted small">{g.description}</p>}
          {g.type === 'paket' && g.package_detail && <p className="small item-detail"><Icon name="gift" size={16} /> {g.package_detail}</p>}
          <GroupInfo g={g} showPayout={false} />
          {g.type === 'uang' && (
            <div className="group-detail-metrics" aria-label="Ringkasan peserta dan penarikan">
              <div className="group-detail-metric">
                <span>Peserta aktif</span>
                <strong>
                  {availabilityError || !groupAvailability
                    ? 'Belum tersedia'
                    : `${Number(groupAvailability.active_participants) || 0} orang`}
                </strong>
              </div>
              <div className="group-detail-metric">
                <span>Sisa slot</span>
                <strong>
                  {availabilityError || !groupAvailability
                    ? 'Belum tersedia'
                    : g.max_slots == null
                      ? 'Tidak dibatasi'
                      : `${remainingSlots} dari ${g.max_slots}`}
                </strong>
              </div>
              <div className="group-detail-metric is-highlight">
                <span>Perkiraan penarikan per putaran</span>
                <strong>
                  {g.max_slots == null
                    ? 'Batas slot belum ditentukan'
                    : rupiah(Number(g.nominal) * Number(g.max_slots))}
                </strong>
                {g.max_slots != null && <small>Jika seluruh {g.max_slots} slot terisi</small>}
              </div>
              {availabilityError && (
                <div className="group-detail-metric-error" role="alert">
                  Ringkasan peserta dan slot belum dapat dimuat.
                  <button type="button" className="btn sm" onClick={reload}>Coba lagi</button>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {!mem && <div className="alert warn">Kamu belum terdaftar di kelompok ini. Daftar lewat menu Arisan.</div>}

      {mem?.status === 'menunggu' && (
        <div className="alert info is-pending">
          Pendaftaran sedang diperiksa admin. Kamu bisa membayar setelah disetujui.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm danger" onClick={cancelJoin}>
              Batalkan pendaftaran
            </button>
          </div>
        </div>
      )}
      {mem?.status === 'ditolak' && <div className="alert err">Pendaftaran ditolak admin. Hubungi admin lewat chat.</div>}
      {mem?.status === 'nonaktif' && (
        <div className="alert warn">Keanggotaanmu sedang nonaktif. Hubungi admin untuk mengaktifkan kembali.</div>
      )}

      {mem?.status === 'aktif' && (
        <>
          <div className="card scroll-list">
            {Array.from({ length: g.durasi }, (_, i) => i + 1).map((n) => {
              const p = byPeriod[n];
              const canPay = !p || p.status === 'ditolak';
              return (
                <div key={n} className={`period-row ${p?.status === 'disetujui' ? 'done' : ''}`}>
                  <div className="period-no">{p?.status === 'disetujui' ? <Icon name="check" size={18} /> : n}</div>
                  <div style={{ flex: 1 }}>
                    <b>
                      {label} ke-{n}
                    </b>
                    {p?.status === 'ditolak' && p.note && <div className="small" style={{ color: 'var(--red)' }}>Ditolak: {p.note}</div>}
                    {p && p.status !== 'ditolak' && <div className="muted small">Dikirim {fmtDate(p.created_at)}</div>}
                  </div>
                  {p && <Badge status={p.status} />}
                  {canPay && (
                    <button className="btn sm primary" onClick={() => setUploading(n)}>
                      {p ? 'Kirim ulang' : 'Bayar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {g.type === 'uang' && displayedRounds.length > 0 && (
        <>
          <div className="section-title">Hasil undian</div>
          <div className="card">
            {displayedRounds.map((r) => (
              <div key={r.id} className="period-row">
                <div className="period-no">{r.round_no}</div>
                <div style={{ flex: 1 }}>
                  <b>{names[r.winner_user_id] || 'Peserta'}</b>
                  {r.winner_user_id === uid && <span className="badge gold" style={{ marginLeft: 6 }}>Kamu</span>}
                  <div className="muted small">
                    Pengambilan: {fmtDate(r.pickup_date || withdrawalDate(g.start_date, g.pay_period, r.round_no))}
                  </div>
                </div>
                <Badge status={r.status} />
              </div>
            ))}
          </div>
        </>
      )}

      {mem && payments.length > 0 && (
        <p className="muted small center">Total {payments.length} bukti pembayaran terkirim.</p>
      )}

      {uploading && (
        <Modal title={`Bayar ${label.toLowerCase()} ke-${uploading}`} onClose={closeUpload}>
          <div className="card">
            <div className="muted small">Nominal yang ditransfer</div>
            <b style={{ fontSize: 20 }}>{rupiah(amount)}</b>
          </div>
          <p className="muted small">Transfer sesuai petunjuk admin, lalu unggah foto bukti transfer di bawah ini.</p>
          <label className="field">
            <span>Foto bukti transfer</span>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {preview && <img src={preview} alt="Pratinjau" className="thumb" style={{ marginBottom: 12 }} />}
          <button className="btn primary block" disabled={busy || !file} onClick={submitProof}>
            {busy ? 'Mengunggah…' : 'Kirim bukti'}
          </button>
        </Modal>
      )}
    </>
  );
}
