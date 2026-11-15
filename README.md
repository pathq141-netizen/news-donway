# ALFATH × DONWAY NEWSROOM

Portal berita teknologi berbahasa Indonesia. Publisher: DONWAY. Creator: Alfath.

## Isi project

- `app.html`, `src/` — aplikasi React + TypeScript + Vite untuk deployment.
- `index.html`, `admin.html` — preview visual mandiri yang sudah ada (demo statis).
- `public/service-worker.js` — menerima push, menampilkan notifikasi, dan menangani klik.
- `src/lib/push.ts` — subscribe/unsubscribe browser melalui Supabase Edge Function.
- `supabase/migrations/202611150001_web_push.sql` — tabel subscription dan ledger anti-duplikasi.
- `supabase/functions/push-subscribe/` — menyimpan/memperbarui/menghapus subscription.
- `supabase/functions/push-send/` — pengiriman artikel dan Breaking News dengan validasi admin server-side.
- `scripts/generate-vapid.ts` — membuat VAPID key pair yang sesuai dengan `@negrel/webpush`.
- `supabase/schema.sql` — schema dasar project (jalankan sebelum migration push).
- `.env.example` — contoh environment variable; tidak berisi secret.

## 1. Pratinjau lokal

`index.html` dan `admin.html` merupakan preview demo statis. Aplikasi live React dijalankan dengan:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Aplikasi React memakai `app.html` sebagai entry Vite dan route React Router. Untuk build:

```bash
npm run build
npm run preview
```

## 2. Siapkan Supabase

1. Buat project Supabase.
2. Buka **SQL Editor → New query**, jalankan seluruh `supabase/schema.sql` pada project yang belum memiliki schema ini. Jika schema sudah diterapkan, jangan jalankan ulang tanpa meninjau enum/policy yang ada.
3. Jalankan migration baru `supabase/migrations/202611150001_web_push.sql`.
4. Pastikan akun admin sudah memiliki `profiles.role = 'admin'`. Penetapan role hanya dari SQL Editor oleh pemilik project setelah memverifikasi UUID. Jangan beri user akses untuk menaikkan role sendiri.
5. Di **Authentication → URL Configuration**, atur Site URL ke URL HTTPS website dan tambahkan redirect URL yang digunakan.

Tabel `push_subscriptions` dan `push_notification_events` mengaktifkan RLS serta tidak memiliki policy untuk anon/authenticated. Hanya Edge Functions menggunakan service-role key yang mengakses tabel tersebut.

## 3. Buat VAPID keys

Perlu Deno terpasang di komputer pengembang. Dari root project jalankan satu kali:

```bash
deno run --allow-net scripts/generate-vapid.ts
```

Script memakai `jsr:@negrel/webpush@0.5.0`, library Web Push berbasis Web Crypto API yang menyatakan kompatibel dengan Deno dan runtime web-compatible. Output berbentuk JSON:

- `publicKey`: URL-safe base64 untuk frontend.
- `keys`: exported VAPID JWK pair; di dalamnya ada private key. Seluruh object `keys` wajib diperlakukan sebagai secret.

Simpan output secara aman. Jangan commit file output, jangan tempel `keys` ke source code, dan jangan pernah masukkan private key ke environment variable berawalan `VITE_`. Buat VAPID key pair sekali dan gunakan terus; menggantinya akan memutus keterkaitan dengan subscription yang sudah terdaftar.

> Catatan keamanan library: dokumentasi maintainer `@negrel/webpush` menyatakan implementasi kriptografinya belum ditinjau ahli kriptografi independen. Library dipilih karena berbasis Web APIs dan ditujukan untuk Deno, bukan karena audit keamanan pihak ketiga.

## 4. Atur Supabase Secrets

Dari root project (ganti nilai placeholder dengan nilai milik project sendiri):

```bash
supabase secrets set \
  SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
  SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  VAPID_KEYS_JSON='{"publicKey":{...},"privateKey":{...}}' \
  VAPID_SUBJECT="mailto:admin@yourdomain.example" \
  SITE_URL="https://yourdomain.example"
```

Untuk `VAPID_KEYS_JSON`, tempel object JSON tepat pada properti `keys` dari output generator (bukan seluruh object pembungkus). Kutip JSON dengan benar sesuai shell yang digunakan. `VAPID_SUBJECT` harus berupa `mailto:` atau URL kontak yang valid dan bukan localhost. `SITE_URL` harus origin website produksi.

`SUPABASE_SERVICE_ROLE_KEY` dan `VAPID_KEYS_JSON` adalah server-only secrets. Jangan memasukkannya ke `.env.local`, Vercel, GitHub, atau variabel `VITE_*`.

## 5. Deploy Edge Functions

Pastikan Supabase CLI terpasang dan project sudah di-link:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy push-subscribe
supabase functions deploy push-send
```

`push-subscribe` menerima request publik untuk subscribe/unsubscribe, memvalidasi bentuk subscription dan hanya melakukan operasi melalui service-role. `push-send` memverifikasi access token menggunakan Supabase Auth, membaca role `profiles` dari database, lalu menolak selain admin (HTTP 403). Gateway JWT verification dimatikan pada kedua function agar endpoint subscribe publik dan agar pemeriksaan token `push-send` dilakukan eksplisit di handler. Jangan menghapus validasi handler ini.

## 6. Environment Variables Vercel

Di **Vercel → Project → Settings → Environment Variables**, tambahkan untuk Production (dan Preview jika memang diperlukan):

| Variable | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `VITE_VAPID_PUBLIC_KEY` | `publicKey` dari generator |
| `VITE_SITE_URL` | URL website HTTPS |

Jangan menambahkan `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_KEYS_JSON`, atau private key ke Vercel frontend variables. Setelah mengubah variable, lakukan redeploy. Website wajib diakses melalui HTTPS untuk service worker dan Push API (localhost diizinkan untuk development).

## 7. Alur penggunaan

### Pengunjung

1. Buka website melalui HTTPS.
2. Tekan **Aktifkan Notifikasi** pada header.
3. Izinkan notifikasi pada prompt browser.
4. Browser membuat subscription, service worker `/service-worker.js` aktif, dan subscription disimpan oleh `push-subscribe`.
5. Tombol yang sama berubah menjadi **Nonaktifkan Notifikasi**. Unsubscribe menghapus record server lalu menghentikan subscription lokal.

Pengunjung tidak perlu login. Setiap browser/perangkat menyimpan subscription terpisah. iPhone/iPad memerlukan iOS/iPadOS 16.4+ dan website ditambahkan ke Home Screen sebelum Web Push tersedia. Dukungan browser/OS dapat berubah; izin notifikasi juga harus diaktifkan pada pengaturan perangkat.

### Automatic notification artikel

CMS saat ini membuat artikel baru melalui `insert`. Jika status yang dipilih `published`, frontend hanya memanggil `push-send` setelah insert artikel berhasil. Function memeriksa kembali bahwa artikel memang published, membentuk URL `/news/{slug}`, dan memakai unique event key agar pemanggilan ulang tidak mengirim ulang artikel yang sama. Draft tidak memicu push. Alur edit artikel existing tidak tersedia pada CMS project asal; tidak ada pemicu notifikasi edit.

Jika insert artikel gagal, function tidak dipanggil. Jika pemanggilan/pengiriman push gagal, artikel yang sudah tersimpan tidak dihapus; pesan hasil akan terlihat di CMS. `push_notification_events` menyimpan ledger anti-duplikasi.

### Breaking News

Pada Admin CMS, panel **Kirim Breaking News** menyediakan judul, pesan, dan URL. URL tujuan harus berupa path relatif atau URL pada domain website sendiri. Server memvalidasi sesi dan role admin; hasil menampilkan jumlah berhasil/gagal dan menghapus subscription yang mendapat status gone (404/410).

## 8. Catatan kapasitas dan reliabilitas

Pengiriman saat ini dibagi menjadi batch 50 subscription dengan pengiriman paralel terbatas per batch. Untuk daftar subscriber yang sangat besar atau kebutuhan SLA lebih tinggi, pindahkan pengiriman ke queue/worker terpisah (misalnya tabel outbox + scheduled worker) agar request Edge Function tidak mendekati batas durasi. Implementasi ini belum mengklaim sebagai sistem antrean durable. Pengiriman push adalah best-effort: jumlah sukses berarti push service menerima request, bukan jaminan pengguna melihat notifikasi.

`push-subscribe` mengizinkan operasi anonim yang diperlukan untuk subscriber publik. Sebelum kampanye besar, tambahkan rate limiting/abuse protection dan monitoring sesuai volume produksi.

## 9. Testing dan batas verifikasi

Jalankan:

```bash
npm install
npm run build
```

Build React/TypeScript perlu diverifikasi di lingkungan yang dapat mengakses npm registry. Deploy dan uji Edge Functions dengan Supabase project nyata untuk memverifikasi secrets, RLS, VAPID, autentikasi admin, serta push provider. Uji setidaknya:
- subscribe dan unsubscribe dari dua browser/perangkat;
- insert artikel draft (tidak ada push);
- insert artikel published (push dikirim satu kali);
- insert gagal (tidak ada function call);
- akun non-admin memanggil `push-send` (403);
- Breaking News dengan URL domain sendiri dan URL domain asing (ditolak);
- subscription yang sudah tidak valid (404/410 dibersihkan).

### Status pengujian paket ini

Pada sesi modifikasi ini, `npm install` dicoba dua kali tetapi gagal menyelesaikan dependency fetch karena lingkungan eksekusi tidak dapat menjangkau `registry.npmjs.org` (`EAI_AGAIN`). Karena itu `npm run build` **belum dapat dijalankan** dan tidak saya klaim lulus. Kredensial Supabase/Vercel tidak disertakan, sehingga deploy, pengiriman push nyata, autentikasi role terhadap project, serta tes lintas perangkat belum dapat dilakukan. Lakukan langkah testing di atas sebelum menyatakan deployment production siap.

## 10. Fitur project asal

Struktur React/Vite, routing, desain, Supabase Auth, CMS artikel, schema artikel, halaman preview statis, dan konfigurasi Vercel asal dipertahankan. Fitur push ditambahkan sebagai lapisan baru. `supabase/schema.sql` tetap schema awal; migration push terpisah agar tidak mengubah atau menghapus data artikel yang telah ada.
