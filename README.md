# RPS Editor

Aplikasi web (front-end saja, PWA) untuk menyusun Rencana Pembelajaran Semester (RPS) berformat baku FILKOM UB,
menyimpannya sebagai berkas `.rps` (isinya JSON), dan mengekspornya ke PDF A4. Saudara dari
[SOP Editor](https://github.com/rendicahya/sop-editor): arsitektur, akun, dan pustakanya sama.

Dibangun dengan Svelte 5 + Vite, jsPDF, vite-plugin-pwa, serta Firebase (proyek yang sama dengan SOP Editor).

## Status

Sudah ada:
- Model dokumen `.rps` dengan relasi CPL → CPMK → Sub-CPMK → pertemuan/asesmen/Lembar Kerja berbasis id.
- Mesin tata letak untuk seluruh dokumen, mengikuti `contoh-rps.pdf`: sampul (potret), identitas RPS, matriks A–C
  (lanskap), tabel rencana per pertemuan (lanskap, kepala tabel diulang, baris panjang terbelah antarhalaman,
  baris praktikum berwarna), dan Lembar Kerja (potret, satu per tugas).
- Matriks A (CPMK–CPL), B (penilaian terhadap Sub-CPMK, termasuk daftar LK per asesmen), dan C (SIAKAD/SIM OBE
  beserta total bobot) diturunkan otomatis dari data, tidak diisi manual.
- Label pekan ("1.a", "b", …), nomor pustaka, dan rujukan [pustaka] di tabel pertemuan dihitung otomatis.
- Pratinjau = PDF (mesin tata letak yang sama), ekspor PDF dengan data `.rps` tersemat (PDF bisa dibuka lagi).
- Tab, Undo/Redo, Pustaka Lokal, cari & ganti, tombol **Contoh** (RPS Algoritma dan Struktur Data).

Rencana berikutnya:
1. Edit langsung di halaman (WYSIWYG): isian teks, tambah/hapus/geser baris, pilihan Sub-CPMK/pustaka/CPL.
2. **Periksa**: total bobot 100%, setiap Sub-CPMK punya pertemuan dan asesmen, setiap CPMK punya Sub-CPMK, rujukan
   pustaka valid, pekan UTS/UAS ada, waktu per pertemuan sesuai SKS.
3. Pustaka Daring (koleksi `rps`, `rpsFolders`, `rpsEditing`).
4. Katalog kurikulum per prodi (`curricula/{prodiId}`) dengan peran **pengelola prodi**.
5. Asisten AI: susun RPS baru, impor RPS lama (PDF/Word), revisi.

## Firebase

Proyek Firebase sama dengan SOP Editor sehingga anggota (`members`) dan grup (`groups`) dipakai bersama.
**Aturan Firestore hanya ada satu per proyek** dan dikelola di repositori SOP Editor (`firebase/firestore.rules`).
Jangan men-deploy aturan dari repositori ini: deploy terakhir menimpa seluruh aturan, termasuk milik SOP Editor.

Rancangan koleksi RPS:

| Koleksi | Isi |
| --- | --- |
| `rps/{id}` + `versions` | dokumen RPS dan riwayatnya |
| `rpsFolders/{id}` | folder Pustaka Daring RPS |
| `rpsEditing/{key}` | keterangan "sedang diedit" |
| `curricula/{prodiId}` | `{ nama, departemen, managers: [email], cpl, cpmk }`; diedit pengelola prodi dan admin |

Aplikasi ini satu origin dengan SOP Editor di GitHub Pages, jadi semua kunci `localStorage`/IndexedDB berawalan
`rps-editor`. Pengecualian: font Calibri disimpan bersama (`sop-editor-fonts`) agar cukup dipilih sekali.

## Format berkas (.rps, berisi JSON)

```jsonc
{
  "format": "rps-editor", "version": 1,
  "identitas": {
    "universitas": "UNIVERSITAS BRAWIJAYA", "fakultas": "FAKULTAS ILMU KOMPUTER", "departemen": "...", "prodi": "...",
    "mataKuliah": "...", "kode": "COM60004", "rmk": "...", "sksTeori": 2, "sksPraktikum": 1,
    "semester": "GANJIL", "tahunAkademik": "2025/2026", "sifat": "WAJIB", "tglPenyusunan": "2025-08-01", "tahun": "2025",
    "dosenPengelola": ["..."], "koordinator": "...", "kaprodi": "...",
    "deskripsi": "...", "materi": "...", "mediaLunak": "...", "mediaKeras": "...",
    "pengalamanBelajar": "...", "timDosen": ["..."], "prasyarat": "..."
  },
  "pustaka": [{ "id": "p1", "jenis": "utama | pendukung", "teks": "..." }],
  "cpl":     [{ "id": "c1", "kode": "CPL005", "teks": "..." }],
  "cpmk":    [{ "id": "m1", "kode": "CPMK-051", "teks": "...", "cpl": ["c1"] }],
  "subCpmk": [{ "id": "s1", "kode": "Sub-CPMK-05101", "teks": "...", "cpmk": "m1" }],
  "asesmen": [{ "id": "a1", "kode": "CB-1", "siakad": "Hasil Proyek", "obe": "Studi Kasus", "bobot": 30,
                "porsi": { "s1": 0.5, "s2": 0.5 }, "keterangan": "..." }],
  "pertemuan": [{ "id": "w1", "pekan": 1, "jenis": "kuliah | praktikum", "subCpmk": ["s1"], "indikator": "...",
                  "kriteria": "...", "bentuk": "...", "metode": ["Ceramah"], "waktu": "2x50 menit",
                  "materi": "...", "pustaka": ["p1"], "bobot": 0.5 }],
  "lembarKerja": [{ "id": "lk1", "kode": "LK-1", "judul": "...", "asesmen": "a1", "subCpmk": ["s1"],
                    "bentukAktivitas": "...", "deskripsi": "...", "metode": "...", "luaran": "...",
                    "indikator": "...", "jadwal": "...", "lainLain": "...", "rujukan": "..." }]
}
```

Rujukan antarbagian boleh berisi id atau kode (mis. dari jawaban AI); saat dibuka semuanya dipetakan ke id.
Isian teks panjang boleh berisi `<b>`, `<i>`, `<u>`, serta baris daftar yang diawali `• ` atau `1. `.

## Pengembangan

```bash
npm install
npm run dev       # http://localhost:5173/rps-editor/
npm run build     # hasil di dist/
```

| Berkas | Isi |
| --- | --- |
| `src/lib/model.js` | Struktur dokumen, normalisasi JSON (id/rujukan), format tanggal dan angka |
| `src/lib/sample.js` | Contoh RPS (transkripsi `contoh-rps.pdf`) |
| `src/lib/layout.js` | Mesin tata letak: aliran halaman, tabel dengan baris terbelah dan rowspan lintas halaman |
| `src/lib/PageSvg.svelte` / `src/lib/pdf.js` | Renderer pratinjau (SVG) dan PDF (jsPDF) dari primitif yang sama |

## Lisensi

Kode aplikasi: lihat [LICENSE](LICENSE). Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`).
Inter: SIL Open Font License 1.1.
