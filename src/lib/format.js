export const rupiah = (n) =>
  'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n || 0));

const toDate = (d) => (typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d));

export const fmtDate = (d) =>
  d ? toDate(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export function paymentDueDate(startDate, payPeriod, periodNo) {
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

export function addDaysToDate(dateString, days) {
  if (!dateString || !Number.isInteger(days)) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function withdrawalDate(startDate, payPeriod, roundNo) {
  const dueDate = paymentDueDate(startDate, payPeriod, roundNo);
  return dueDate ? addDaysToDate(dueDate, 7) : null;
}

export const fmtDay = (d) =>
  toDate(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtTime = (d) => toDate(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export const sameDay = (a, b) => toDate(a).toDateString() === toDate(b).toDateString();

export const PERIOD = {
  harian: { unit: 'hari', name: 'Hari' },
  mingguan: { unit: 'minggu', name: 'Minggu' },
  bulanan: { unit: 'bulan', name: 'Bulan' },
};

export const periodUnit = (g) => PERIOD[g.pay_period]?.unit || 'periode';
export const periodName = (g) => (g.type === 'uang' ? 'Putaran' : PERIOD[g.pay_period]?.name || 'Periode');

export const typeLabel = (g) =>
  g.type === 'uang' ? 'Arisan Uang' : `Paket ${g.package_type ? capitalize(g.package_type) : ''}`.trim();

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const STATUS = {
  menunggu: { label: 'Menunggu', cls: 'wait' },
  aktif: { label: 'Aktif', cls: 'ok' },
  nonaktif: { label: 'Nonaktif', cls: 'off' },
  ditolak: { label: 'Ditolak', cls: 'bad' },
  disetujui: { label: 'Disetujui', cls: 'ok' },
  dijadwalkan: { label: 'Dijadwalkan', cls: 'wait' },
  diserahkan: { label: 'Diserahkan', cls: 'ok' },
};

// Prioritas pembayaran per periode: disetujui > menunggu > ditolak
const RANK = { disetujui: 3, menunggu: 2, ditolak: 1 };
export function bestPaymentByPeriod(payments) {
  const map = {};
  for (const p of payments || []) {
    const cur = map[p.period_no];
    if (!cur || RANK[p.status] > RANK[cur.status]) map[p.period_no] = p;
  }
  return map;
}
