import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase, q } from '../lib/supabase';
import { useAsync } from '../lib/hooks';
import { bestPaymentByPeriod, fmtDate, periodName, rupiah, typeLabel } from '../lib/format';
import { compressImage } from '../lib/image';
import { Badge, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';
import GroupInfo from '../components/GroupInfo.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function GroupDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const uid = session.user.id;
  const nav = useNavigate();
  const toast = useToast();
  const [uploading, setUploading] = useState(null); // nomor periode
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const group = await q(supabase.from('groups').select('*').eq('id', id).single());
    const mem = await q(
      supabase.from('memberships').select('*').eq('group_id', id).eq('user_id', uid).maybeSingle()
    );
    let payments = [];
    let slots = [];
    if (mem) {
      payments = await q(
        supabase.from('payments').select('*').eq('membership_id', mem.id).order('created_at', { ascending: false })
      );
      if (group.type === 'uang') {
        slots = await q(supabase.from('slots').select('*').eq('membership_id', mem.id).order('slot_no'));
      }
    }
    let rounds = [];
    let names = {};
    if (group.type === 'uang') {
      rounds = await q(supabase.from('rounds').select('*').eq('group_id', id).order('round_no'));
      const ids = [...new Set(rounds.map((r) => r.winner_user_id).filter(Boolean))];
      if (ids.length) {
        const ps = await q(supabase.from('public_profiles').select('id,full_name').in('id', ids));
        names = Object.fromEntries(ps.map((p) => [p.id, p.full_name]));
      }
    }
    return { group, mem, payments, slots, rounds, names };
  }, [id, uid]);

  // Status pembayaran / persetujuan berubah di sisi admin -> muat ulang otomatis
  useEffect(() => {
    const ch = supabase
      .channel(`group-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, reload]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const byPeriod = useMemo(() => bestPaymentByPeriod(data?.payments), [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { group: g, mem, payments, slots, rounds, names } = data;
  const amount = mem ? Number(g.nominal) * mem.slot_count : Number(g.nominal);
  const done = Object.values(byPeriod).filter((p) => p.status === 'disetujui').length;
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
      toast('Bukti terkirim. Menunggu verifikasi admin.', 'success');
      closeUpload();
      reload();
    } catch (x) {
      toast(x.message || 'Gagal mengunggah bukti', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelJoin() {
    if (!window.confirm('Batalkan pendaftaran ke kelompok ini?')) return;
    const { error } = await supabase.from('memberships').delete().eq('id', mem.id);
    if (error) return toast(error.message, 'error');
    toast('Pendaftaran dibatalkan.');
    nav('/arisan', { replace: true });
  }

  return (
    <>
      <Link to="/" className="small">
        ← Kembali
      </Link>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>{g.name}</h2>
            <span className={`badge type ${g.type}`}>{typeLabel(g)}</span>
            {g.type === 'paket' && <span className="badge off" style={{ marginLeft: 6 }}>{g.pay_period}</span>}
          </div>
          {mem && <Badge status={mem.status} />}
        </div>
        {g.description && <p className="muted small">{g.description}</p>}
        {g.type === 'paket' && g.package_detail && <p className="small">🎁 {g.package_detail}</p>}
        <GroupInfo g={g} />
      </div>

      {!mem && <div className="alert warn">Kamu belum terdaftar di kelompok ini. Daftar lewat menu Arisan.</div>}

      {mem?.status === 'menunggu' && (
        <div className="alert info">
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

      {mem && g.type === 'uang' && slots.length > 0 && (
        <div className="card">
          <div className="muted small">Nomor slot saya</div>
          <div className="row wrap" style={{ marginTop: 6 }}>
            {slots.map((s) => (
              <span key={s.id} className="badge type">
                #{s.slot_no}
              </span>
            ))}
          </div>
        </div>
      )}

      {mem?.status === 'aktif' && (
        <>
          <div className="section-title">Pembayaran</div>
          <div className="card">
            <div className="row between">
              <b>{rupiah(amount)}</b>
              <span className="muted small">per {label.toLowerCase()}</span>
            </div>
            <div style={{ margin: '8px 0 4px' }}>
              <Progress value={done} max={g.durasi} />
            </div>
            <div className="muted small">
              Lunas {done} dari {g.durasi}
            </div>
          </div>

          <div className="card scroll-list">
            {Array.from({ length: g.durasi }, (_, i) => i + 1).map((n) => {
              const p = byPeriod[n];
              const canPay = !p || p.status === 'ditolak';
              return (
                <div key={n} className={`period-row ${p?.status === 'disetujui' ? 'done' : ''}`}>
                  <div className="period-no">{p?.status === 'disetujui' ? '✓' : n}</div>
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

      {g.type === 'uang' && rounds.length > 0 && (
        <>
          <div className="section-title">Hasil undian</div>
          <div className="card">
            {rounds.map((r) => (
              <div key={r.id} className="period-row">
                <div className="period-no">{r.round_no}</div>
                <div style={{ flex: 1 }}>
                  <b>{names[r.winner_user_id] || 'Peserta'}</b>
                  {r.winner_user_id === uid && <span className="badge gold" style={{ marginLeft: 6 }}>Kamu 🎉</span>}
                  <div className="muted small">Pengambilan: {fmtDate(r.pickup_date)}</div>
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
