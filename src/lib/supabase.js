import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'arisan.app';

export const configured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// "+62 812-3456-789" / "62812..." / "0812..." -> "0812..."
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  if (d && !d.startsWith('0')) d = '0' + d;
  return d;
}

export const isValidPhone = (p) => /^08\d{8,12}$/.test(normalizePhone(p));

// Login memakai nomor telepon, dipetakan ke email teknis (tanpa OTP / biaya SMS)
export const phoneToEmail = (phone) => `${normalizePhone(phone)}@${EMAIL_DOMAIN}`;

// Helper: lempar error jika query Supabase gagal
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
