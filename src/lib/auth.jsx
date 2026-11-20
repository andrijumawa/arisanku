import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, phoneToEmail, normalizePhone } from './supabase';
import { useRealtimeRefresh } from './hooks';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

function friendly(err) {
  const m = String(err?.message || err || '');
  if (/invalid login/i.test(m)) return 'Nomor telepon atau password salah.';
  if (/already registered|already been registered/i.test(m)) return 'Nomor telepon ini sudah terdaftar. Silakan masuk.';
  if (/password should be at least/i.test(m)) return 'Password minimal 6 karakter.';
  if (/rate limit/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (/failed to fetch|network/i.test(m)) return 'Tidak ada koneksi internet.';
  return m;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const uidRef = useRef(null);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,phone,full_name,role,account_status,avatar_path')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('Gagal memuat profil akun:', error);
      setProfile(null);
      return;
    }
    const next = data || null;
    // Pertahankan objek lama bila isinya sama agar layar tidak ikut dirender ulang
    setProfile((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      uidRef.current = data.session?.user.id ?? null;
      await loadProfile(data.session?.user.id);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Supabase mengirim ulang SIGNED_IN setiap aplikasi kembali dari background.
      // Pertahankan session lama bila akun dan token-nya sama.
      setSession((prev) =>
        prev && s && prev.user.id === s.user.id && prev.access_token === s.access_token ? prev : s
      );
      const nextUid = s?.user.id ?? null;
      if (nextUid !== uidRef.current) {
        uidRef.current = nextUid;
        // jangan panggil supabase langsung di dalam callback (hindari deadlock)
        setTimeout(() => loadProfile(nextUid), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (phone, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password });
    if (error) throw new Error(friendly(error));
  }, []);

  const signUp = useCallback(
    async ({ phone, password, fullName, avatarFile }) => {
      if (!avatarFile) throw new Error('Ambil foto selfie untuk profil sebelum mendaftar.');
      const avatarExtensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      const extension = avatarExtensions[avatarFile.type];
      if (!extension) throw new Error('Gunakan foto selfie berformat JPG, PNG, atau WebP.');
      if (avatarFile.size > 5 * 1024 * 1024) throw new Error('Ukuran foto selfie maksimal 5 MB.');

      const { data, error } = await supabase.auth.signUp({
        email: phoneToEmail(phone),
        password,
        options: { data: { phone: normalizePhone(phone), full_name: fullName.trim() } },
      });
      if (error) throw new Error(friendly(error));
      if (!data.session) {
        throw new Error(
          'Akun dibuat tetapi belum bisa masuk otomatis. Admin perlu mematikan "Confirm email" di Supabase (Authentication → Providers → Email).'
        );
      }

      const avatarPath = `${data.user.id}/${Date.now()}.${extension}`;
      const storage = supabase.storage.from('profile-avatars');
      const { error: uploadError } = await storage.upload(avatarPath, avatarFile, {
        cacheControl: '3600',
        contentType: avatarFile.type,
        upsert: false,
      });
      if (uploadError) {
        const { error: signOutError } = await supabase.auth.signOut();
        throw new Error(
          `Akun berhasil dibuat, tetapi foto selfie gagal disimpan. Silakan masuk dan unggah foto profil lagi. ${friendly(uploadError)}${signOutError ? ` Sesi juga gagal ditutup: ${friendly(signOutError)}` : ''}`
        );
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: avatarPath })
        .eq('id', data.user.id);
      if (profileError) {
        const { error: cleanupError } = await storage.remove([avatarPath]);
        if (cleanupError) console.error('Gagal membersihkan foto profil pendaftaran:', cleanupError);
        const { error: signOutError } = await supabase.auth.signOut();
        throw new Error(
          `Akun berhasil dibuat, tetapi foto selfie gagal ditautkan ke profil. Silakan masuk dan unggah foto profil lagi. ${friendly(profileError)}${signOutError ? ` Sesi juga gagal ditutup: ${friendly(signOutError)}` : ''}`
        );
      }

      await loadProfile(data.user.id);
    },
    [loadProfile]
  );

  const signOut = useCallback(() => supabase.auth.signOut(), []);
  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id]);
  useRealtimeRefresh(
    refreshProfile,
    `profile-${session?.user.id || 'signed-out'}`,
    session ? [{ table: 'profiles', filter: `id=eq.${session.user.id}` }] : [],
    Boolean(session)
  );

  const value = useMemo(
    () => ({
      session,
      profile,
      ready,
      isAdmin: profile?.role === 'admin',
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, ready, signIn, signUp, signOut, refreshProfile]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}