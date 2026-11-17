import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, q } from '../../lib/supabase';
import { Spinner } from '../../components/Ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';

const EMPTY = {
  type: 'uang',
  name: '',
  description: '',
  nominal: '',
  durasi: '',
  max_slots: '',
  draw_mode: 'acak',
  pay_period: 'bulanan',
  package_type: '',
  package_detail: '',
  start_date: '',
  end_date: '',
  pickup_date: '',
  is_open: true,
};

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const str = (v) => (v && String(v).trim() ? String(v).trim() : null);

export default function GroupForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    q(supabase.from('groups').select('*').eq('id', id).single())
      .then((g) =>
        setF({
          ...EMPTY,
          ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])),
        })
      )
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [id, editing, toast]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast('Nama kelompok wajib diisi.', 'error');
    if (!(Number(f.nominal) > 0)) return toast('Nominal harus lebih dari 0.', 'error');
    if (!(Number(f.durasi) > 0)) return toast('Durasi harus lebih dari 0.', 'error');
    if (f.type === 'paket' && !str(f.package_type)) return toast('Jenis paket wajib diisi (mis. makanan, barang).', 'error');

    const uang = f.type === 'uang';
    const payload = {
      type: f.type,
      name: f.name.trim(),
      description: str(f.description),
      nominal: Number(f.nominal),
      durasi: Number(f.durasi),
      max_slots: num(f.max_slots),
      draw_mode: uang ? f.draw_mode : null,
      pay_period: uang ? null : f.pay_period,
      package_type: uang ? null : str(f.package_type)?.toLowerCase(),
      package_detail: uang ? null : str(f.package_detail),
      start_date: str(f.start_date),
      end_date: str(f.end_date),
      pickup_date: uang ? null : str(f.pickup_date),
      is_open: f.is_open,
    };

    setBusy(true);
    const res = editing
      ? await supabase.from('groups').update(payload).eq('id', id).select().single()
      : await supabase.from('groups').insert(payload).select().single();
    setBusy(false);
    if (res.error) return toast(res.error.message, 'error');
    toast('Kelompok disimpan.', 'success');
    nav(`/admin/kelompok/${res.data.id}`, { replace: true });
  }

  if (loading) return <Spinner />;
  const uang = f.type === 'uang';

  return (
    <>
      <Link to={editing ? `/admin/kelompok/${id}` : '/admin?tab=kelompok'} className="small">
        <Icon name="back" size={16} /> Kembali
      </Link>
      <h2 style={{ marginTop: 8 }}>{editing ? 'Ubah kelompok' : 'Kelompok baru'}</h2>

      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>Jenis arisan</span>
          <select value={f.type} onChange={set('type')} disabled={editing}>
            <option value="uang">Arisan Uang</option>
            <option value="paket">Arisan Paket Lebaran</option>
          </select>
        </label>

        <label className="field">
          <span>Nama kelompok</span>
          <input value={f.name} onChange={set('name')} placeholder={uang ? 'Arisan Uang 1 Juta A' : 'Paket Sembako Mingguan'} required />
        </label>

        <label className="field">
          <span>Deskripsi (opsional)</span>
          <textarea rows={2} value={f.description} onChange={set('description')} />
        </label>

        <div className="grid2">
          <label className="field">
            <span>{uang ? 'Iuran per bulan (Rp)' : 'Cicilan per periode (Rp)'}</span>
            <input type="number" min="1" inputMode="numeric" value={f.nominal} onChange={set('nominal')} required />
          </label>
          <label className="field">
            <span>{uang ? 'Durasi (putaran)' : 'Jumlah cicilan'}</span>
            <input type="number" min="1" inputMode="numeric" value={f.durasi} onChange={set('durasi')} required />
          </label>
        </div>

        {uang ? (
          <>
            <label className="field">
              <span>Cara undian</span>
              <select value={f.draw_mode} onChange={set('draw_mode')}>
                <option value="acak">Acak (diundi)</option>
                <option value="berurutan">Berurutan (sesuai nomor slot)</option>
              </select>
            </label>
            <label className="field">
              <span>Batas jumlah slot (opsional)</span>
              <input type="number" min="1" inputMode="numeric" value={f.max_slots} onChange={set('max_slots')} />
              <div className="hint">Kosongkan jika tidak dibatasi. Biasanya sama dengan jumlah putaran.</div>
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Skema pembayaran</span>
              <select value={f.pay_period} onChange={set('pay_period')}>
                <option value="harian">Harian</option>
                <option value="mingguan">Mingguan</option>
                <option value="bulanan">Bulanan</option>
              </select>
            </label>
            <label className="field">
              <span>Jenis paket</span>
              <input list="paket-types" value={f.package_type} onChange={set('package_type')} placeholder="makanan / barang / …" required />
              <datalist id="paket-types">
                <option value="makanan" />
                <option value="barang" />
                <option value="sembako" />
                <option value="pakaian" />
              </datalist>
            </label>
            <label className="field">
              <span>Isi paket (opsional)</span>
              <textarea rows={2} value={f.package_detail} onChange={set('package_detail')} placeholder="Beras 5kg, minyak 2L, gula 2kg, …" />
            </label>
          </>
        )}

        <div className="grid2">
          <label className="field">
            <span>Tanggal mulai</span>
            <input type="date" value={f.start_date || ''} onChange={set('start_date')} />
          </label>
          <label className="field">
            <span>Batas akhir bayar</span>
            <input type="date" value={f.end_date || ''} onChange={set('end_date')} />
          </label>
        </div>

        {!uang && (
          <label className="field">
            <span>Tanggal pengambilan paket</span>
            <input type="date" value={f.pickup_date || ''} onChange={set('pickup_date')} />
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={f.is_open} onChange={set('is_open')} />
          Buka pendaftaran
        </label>

        <button className="btn primary block" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>
    </>
  );
}
