# Arisan App (PWA)

Aplikasi mobile (PWA) untuk **Arisan Uang** dan **Arisan Paket Lebaran**, dengan sisi **peserta** dan **admin**.
Stack: React + Vite + Supabase, deploy ke GitHub Pages.

## Fitur

**Peserta**
- Daftar dengan nomor telepon + password (tanpa kode undangan, tanpa OTP)
- Buka Beranda, Arisan, Chat, dan Akun dari halaman Menu; tiap halaman menyediakan tombol tetap untuk kembali ke Menu
- Pilih arisan sendiri; satu peserta boleh ikut banyak kelompok
- Arisan Uang: bisa memegang lebih dari 1 slot
- Bayar per periode dengan unggah foto bukti transfer, lalu menunggu persetujuan admin
- Lihat progres pembayaran dan hasil undian
- Chat grup gabungan: kirim teks, foto dari galeri, atau langsung foto lewat kamera
- Notifikasi push (chat baru, status pendaftaran, status pembayaran)

**Admin**
- Buat dan atur kelompok: nominal, durasi, mode undian (acak / berurutan), skema bayar (harian / mingguan / bulanan), jenis paket, tanggal mulai, batas akhir, tanggal pengambilan
- Setujui / tolak pendaftaran dan bukti pembayaran
- Undi putaran, atur tanggal pengambilan, tandai sudah diserahkan
- Aktifkan / nonaktifkan peserta, kelola peran admin
- Admin boleh ikut sebagai peserta

## 1. Siapkan Supabase

1. Buat project di https://supabase.com
2. **Authentication → Providers → Email**: matikan **Confirm email** (login memakai email teknis dari nomor telepon)
3. **SQL Editor**: jalankan `supabase/schema.sql`, `supabase/roulette.sql`, lalu `supabase/realtime.sql`
4. **Project Settings → API**: salin `Project URL` dan `anon public key`

`realtime.sql` aman dijalankan berulang kali. Untuk project yang sudah memakai aplikasi, jalankan file itu sekali agar perubahan kelompok, slot, putaran, dan profil juga tersedia lewat Realtime.

`roulette.sql` menambahkan fitur Rolet terpisah dari undian resmi. Peserta aktif di kelompok terpilih otomatis ikut pengacakan. Admin dan peserta dapat memantau layar Rolet yang sama; hanya admin yang dapat memulai, mengulang, atau menyimpan hasilnya. Satu periode dapat diacak hingga tiga kali, dengan penyimpanan otomatis pada percobaan ketiga. Hasil tersimpan tersedia di tab **Hasil Rolet** di Menu.

Untuk project yang sudah berjalan, jalankan `supabase/scaling_optimizations.sql` satu kali setelah skema Rolet tersedia dan sebelum deploy versi aplikasi ini. Skrip ini menambah indeks untuk daftar besar, pencarian peserta, ringkasan kapasitas, serta menyimpan indeks relasional pemenang Rolet dan mengisi ulang data hasil yang sudah ada. Backfill dapat membaca seluruh riwayat Rolet; jalankan saat aktivitas rendah jika riwayat sudah besar.

Subscription hanya aktif untuk layar yang sedang dibuka dan dijeda saat aplikasi masuk ke latar. Event beruntun digabung sebelum data dimuat ulang; daftar admin dan anggota kelompok dimuat per halaman, daftar chat dibatasi ke 150 pesan terakhir, dan unggahan gambar dikompres di perangkat sebelum dikirim. Ini mengurangi query dan transfer yang tidak diperlukan, tetapi pemakaian egress aktual tetap bergantung pada jumlah pengguna, perubahan data, dan gambar yang dibuka.

## 2. Jalankan di komputer

```bash
cp .env.example .env     # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 3. Jadikan akun kamu admin

1. Buka aplikasi dan daftar dengan nomor telepon kamu
2. Di SQL Editor Supabase jalankan:

```sql
update public.profiles set role = 'admin' where phone = '08xxxxxxxxxx';
```

Admin berikutnya bisa dijadikan dari menu **Admin → Peserta**.

## 4. Deploy ke GitHub Pages

1. Buat repository GitHub, lalu push seluruh isi folder ini ke branch `main`
2. **Settings → Pages → Build and deployment → Source**: pilih **GitHub Actions**
3. **Settings → Secrets and variables → Actions → New repository secret**, tambahkan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (setelah langkah 5)
   - `VITE_EMAIL_DOMAIN` (isi `arisan.app`, atau domain lain yang kamu pilih)
4. Workflow `.github/workflows/deploy.yml` akan membangun folder `dist/` dan men-deploy otomatis setiap push ke `main`. Jangan gunakan sumber deploy branch `main` langsung, karena aplikasi harus dibangun dulu oleh Vite.

Aplikasi memakai `HashRouter` dan `base: './'`, jadi tidak perlu pengaturan tambahan untuk subfolder repo.

## 5. Notifikasi push (opsional tapi disarankan)

Tanpa langkah ini aplikasi tetap jalan, dan chat tetap realtime saat aplikasi terbuka. Langkah ini menambah notifikasi saat aplikasi tertutup.

1. Buat kunci VAPID:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Pasang Supabase CLI (https://supabase.com/docs/guides/cli), lalu:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:emailkamu@example.com WEBHOOK_SECRET=<teks-acak-panjang>
   supabase functions deploy send-push --no-verify-jwt
   ```
3. Buka `supabase/webhooks.sql`, ganti `<PROJECT_REF>` dan `<WEBHOOK_SECRET>`, lalu jalankan di SQL Editor
4. Isi `VITE_VAPID_PUBLIC_KEY` (kunci **publik**) di `.env` dan di GitHub Secrets, lalu deploy ulang
5. Peserta mengaktifkan notifikasi di menu **Akun → Notifikasi**

Catatan iPhone: notifikasi push hanya berfungsi jika aplikasi sudah dipasang ke Layar Utama (iOS 16.4+).

## Alur penggunaan

1. Admin membuat kelompok (Admin → Kelompok → Kelompok baru)
2. Peserta daftar akun, memilih kelompok di menu **Arisan**, lalu menunggu persetujuan
3. Admin menyetujui di Admin → Pendaftaran. Pada Arisan Uang, nomor slot dibuat otomatis
4. Peserta membayar tiap periode dengan unggah bukti transfer
5. Admin memeriksa di Admin → Pembayaran
6. Arisan Uang: tiap bulan admin menekan **Undi putaran** di halaman kelompok. Mode berurutan memakai urutan nomor slot
7. Arisan Paket: tanggal pengambilan diatur di data kelompok

## Struktur

```
src/
  lib/          supabase client, auth, format, kompres gambar, push
  components/   Layout, Modal, Toast, SignedImage, dll
  pages/        Login, Register, Home, Browse, GroupDetail, Chat, Account
  pages/admin/  AdminHome, GroupForm, AdminGroup
public/         manifest, service worker, ikon
supabase/       schema.sql, webhooks.sql, functions/send-push
```

## Catatan keamanan

- Semua akses data dilindungi Row Level Security. Peserta hanya melihat data miliknya, admin melihat semua
- Bucket `bukti-transfer` dan `chat-images` bersifat privat (akses lewat link bertanda tangan sementara)
- Kunci `anon` aman berada di frontend. **Jangan** pernah memasukkan `service_role` key ke frontend
