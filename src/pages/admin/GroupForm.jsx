import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, q } from '../../lib/supabase';
import { Spinner } from '../../components/Ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import { CustomCombobox, CustomSelect } from '../../components/CustomSelect.jsx';

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
const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');
const formatNominal = (value) => {
  const digits = digitsOnly(value);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export default function GroupForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [arisanTypes, setArisanTypes] = useState([
    { code: 'uang', label: 'Arisan Uang', category: 'uang' },
    { code: 'paket', label: 'Arisan Paket Lebaran', category: 'paket' },
  ]);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState('uang');
  const nominalInput = useRef(null);
  const nominalCaret = useRef(null);

  useEffect(() => {
    if (!editing) return;
    q(supabase.from('groups').select('*').eq('id', id).single())
      .then((g) =>
        setF({
          ...EMPTY,
          ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, k === 'nominal' ? digitsOnly(v) : v ?? EMPTY[k] ?? ''])),
        })
      )
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [id, editing, toast]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    q(supabase.from('arisan_types').select('code,label,category').order('created_at', { ascending: true }))
      .then((rows) => {
        if (rows?.length) setArisanTypes(rows);
      })
      .catch(() => undefined);
  }, []);

  useLayoutEffect(() => {
    if (nominalCaret.current === null || !nominalInput.current) return;
    const desiredDigits = nominalCaret.current;
    nominalCaret.current = null;
    const display = nominalInput.current.value;
    let digits = 0;
    let caret = 0;
    while (caret < display.length && digits < desiredDigits) {
      if (/\d/.test(display[caret])) digits += 1;
      caret += 1;
    }
    nominalInput.current.setSelectionRange(caret, caret);
  }, [f.nominal]);

  function setNominal(event) {
    const input = event.target;
    nominalCaret.current = digitsOnly(input.value.slice(0, input.selectionStart)).length;
    setF((current) => ({ ...current, nominal: digitsOnly(input.value) }));
  }

  function selectedCategory() {
    return arisanTypes.find((item) => item.code === f.type)?.category || (f.type === 'paket' ? 'paket' : 'uang');
  }

  async function addArisanType(e) {
    e?.preventDefault();
    const label = newTypeLabel.trim();
    if (!label) return toast('Nama jenis arisan wajib diisi.', 'error');
    if (arisanTypes.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      return toast('Jenis arisan sudah ada.', 'error');
    }

    const code = `${newTypeCategory}-${Date.now().toString(36)}`;
    const res = await supabase.from('arisan_types').insert({ code, label, category: newTypeCategory }).select().single();
    if (res.error) return toast(res.error.message, 'error');
    setArisanTypes((items) => [...items, res.data]);
    setF((current) => ({ ...current, type: res.data.code }));
    setNewTypeLabel('');
    setShowAddType(false);
    toast('Jenis arisan ditambahkan.', 'success');
  }

  async function removeArisanType(option) {
    if (option.code === 'uang' || option.code === 'paket') {
      return toast('Jenis dasar tidak dapat dihapus.', 'error');
    }
    const res = await supabase.from('arisan_types').delete().eq('code', option.code);
    if (res.error) return toast(res.error.message, 'error');
    setArisanTypes((items) => items.filter((item) => item.code !== option.code));
    if (f.type === option.code) setF((current) => ({ ...current, type: option.category === 'paket' ? 'paket' : 'uang' }));
    toast('Jenis arisan dihapus.', 'success');
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast('Nama kelompok wajib diisi.', 'error');
    const nominalDigits = digitsOnly(f.nominal);
    if (nominalDigits.length > 14) return toast('Nominal maksimal 14 digit.', 'error');
    const nominal = Number(nominalDigits);
    if (!(nominal > 0)) return toast('Nominal harus lebih dari 0.', 'error');
    if (!(Number(f.durasi) > 0)) return toast('Durasi harus lebih dari 0.', 'error');
    const category = selectedCategory();
    if (category === 'paket' && !str(f.package_type)) return toast('Jenis paket wajib diisi (mis. makanan, barang).', 'error');

    const uang = category === 'uang';
    const payload = {
      type: category,
      name: f.name.trim(),
      description: str(f.description),
      nominal,
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
  const uang = selectedCategory() === 'uang';

  return (
    <>
      <Link to={editing ? `/admin/kelompok/${id}` : '/admin?tab=kelompok'} className="small">
        <Icon name="back" size={16} /> Kembali
      </Link>
      <div className="form-heading">
        <h2>{editing ? 'Ubah kelompok' : 'Kelompok baru'}</h2>
        <button
          type="button"
          className="form-close-button"
          aria-label="Tutup formulir"
          title="Tutup"
          onClick={() => nav(editing ? `/admin/kelompok/${id}` : '/admin?tab=kelompok', { replace: true })}
        >
          ×
        </button>
      </div>

      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>Jenis arisan</span>
          <CustomSelect
            value={f.type}
            onValueChange={(value) => setF((current) => ({ ...current, type: value }))}
            disabled={editing}
            ariaLabel="Jenis arisan"
            options={arisanTypes.map((item) => ({ value: item.code, label: item.label }))}
            onRemoveOption={!editing ? removeArisanType : undefined}
            onAddOption={!editing ? () => setShowAddType((open) => !open) : undefined}
          />
          {showAddType && !editing && (
            <div className="add-arisan-type">
              <input
                value={newTypeLabel}
                onChange={(event) => setNewTypeLabel(event.target.value)}
                placeholder="Nama jenis arisan"
              />
              <CustomSelect
                value={newTypeCategory}
                onValueChange={setNewTypeCategory}
                ariaLabel="Kategori jenis arisan"
                options={[
                  { value: 'uang', label: 'Kategori Uang' },
                  { value: 'paket', label: 'Kategori Paket' },
                ]}
              />
              <button type="button" className="btn primary" onClick={addArisanType}>Tambah</button>
            </div>
          )}
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
            <input
              ref={nominalInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={formatNominal(f.nominal)}
              onChange={setNominal}
              placeholder="Contoh: 100.000"
              required
            />
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
              <CustomSelect
                value={f.draw_mode}
                onValueChange={(value) => setF((current) => ({ ...current, draw_mode: value }))}
                ariaLabel="Cara undian"
                options={[
                  { value: 'acak', label: 'Acak (diundi)' },
                  { value: 'berurutan', label: 'Berurutan (sesuai nomor slot)' },
                ]}
              />
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
              <CustomSelect
                value={f.pay_period}
                onValueChange={(value) => setF((current) => ({ ...current, pay_period: value }))}
                ariaLabel="Skema pembayaran"
                options={[
                  { value: 'harian', label: 'Harian' },
                  { value: 'mingguan', label: 'Mingguan' },
                  { value: 'bulanan', label: 'Bulanan' },
                ]}
              />
            </label>
            <label className="field">
              <span>Jenis paket</span>
              <CustomCombobox
                value={f.package_type}
                onValueChange={(value) => setF((current) => ({ ...current, package_type: value }))}
                ariaLabel="Jenis paket"
                placeholder="makanan / barang / …"
                required
                options={[
                  { value: 'makanan', label: 'Makanan' },
                  { value: 'barang', label: 'Barang' },
                  { value: 'sembako', label: 'Sembako' },
                  { value: 'pakaian', label: 'Pakaian' },
                ]}
              />
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
