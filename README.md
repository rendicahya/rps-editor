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
- **Edit langsung di halaman** (WYSIWYG) di semua halaman:
  - Klik teks untuk mengetik; isian berformat mendukung tebal/miring/garis bawah dan daftar (Ctrl+Shift+7/8).
    Sel yang terbelah antarhalaman bisa diedit di bagian mana pun.
  - Daftar nama (dosen pengelola, tim dosen), metode, dan pustaka diedit per butir: Enter menambah butir,
    Backspace di awal butir menggabungkannya dengan butir sebelumnya.
  - Klik sel relasi untuk memilih: Support CP (CPL), Support CPMK, Sub-CPMK pertemuan, pekan/jenis/pustaka
    pertemuan (klik label pekan), asesmen dan Sub-CPMK Lembar Kerja, SKS, semester, sifat, tanggal penyusunan.
  - Sorot baris CPL/CPMK/Sub-CPMK/asesmen/pertemuan (atau kop Lembar Kerja) untuk menaikkan, menurunkan,
    menduplikat, menambah, atau menghapusnya; tombol **P/K** mengganti pertemuan praktikum/kuliah. Menu klik kanan
    berisi aksi yang sama, plus "Buat Lembar Kerja untuk asesmen ini" dan pindah jenis pustaka.
  - Menghapus CPL/CPMK/Sub-CPMK/pustaka/asesmen ikut menghapus rujukan ke item itu.
  - Pertemuan baru mengikuti pola kuliah → praktikum di pekan yang sama → kuliah pekan berikutnya.

- **Periksa** (jumlah temuan diperbarui langsung; klik temuan untuk menuju isiannya, isian pilihan langsung dibuka):
  - identitas penting kosong, SKS 0, kode CPL/CPMK/Sub-CPMK/asesmen/LK kosong atau ganda;
  - CPMK tanpa CPL atau tanpa Sub-CPMK, Sub-CPMK tanpa CPMK induk, CPL yang tidak didukung CPMK;
  - Sub-CPMK yang tidak dinilai asesmen atau tidak muncul di tabel pertemuan;
  - total bobot asesmen bukan 100%, porsi asesmen terhadap Sub-CPMK tidak berjumlah 1;
  - pertemuan tanpa Sub-CPMK/indikator/materi/waktu, urutan pekan tidak naik, pekan yang terlewat, jumlah pekan
    bukan 16, tidak ada UTS/UAS;
  - waktu pertemuan dibanding SKS (kuliah n×50 menit, praktikum n×170 menit; "2x50 menit" dan "100 menit" terbaca);
  - Lembar Kerja tanpa judul, asesmen, Sub-CPMK, atau deskripsi.

- **Pustaka Daring** seperti SOP Editor (folder, hak akses per anggota/grup, riwayat, recycle bin, "sedang diedit"),
  dengan koleksi RPS sendiri; anggota dan grup sama dengan SOP Editor.
  - **Unggah banyak sekaligus** (seperti SOP Editor): seret berkas `.rps` atau ZIP berisi `.rps` ke daftar atau ke
    folder di pohon (atau tombol unggah berkas / menu klik kanan), maksimal 500 berkas. Subfolder di dalam ZIP dibuat
    ulang; folder bernama sama yang milik Anda dipakai. PDF hasil ekspor RPS Editor juga diterima. Berkas yang tidak
    terbaca dilewati dan disebutkan alasannya; unggahan berhenti bila penyimpanan penuh.
- **Katalog Kurikulum** (tombol **Kurikulum**): CPL dan CPMK per prodi di Pustaka Daring.
  - Admin menambah/menghapus prodi dan menunjuk **pengelola prodi** (email).
  - Pengelola prodi (dan admin) mengedit CPL/CPMK prodinya beserta relasi CPMK → CPL.
  - Semua anggota bisa mencentang CPL/CPMK lalu **Pakai di RPS ini**: disalin ke RPS aktif (satu langkah Undo);
    CPL yang didukung CPMK terpilih ikut disalin, kode yang sudah ada tidak diduplikasi, prodi/departemen yang
    masih kosong diisi dari katalog.

- **Asisten AI** (tanpa kunci API: prompt disalin ke asisten AI pilihan, jawabannya ditempel kembali):
  - *Susun RPS baru* dari deskripsi mata kuliah (16 pekan, asesmen, porsi Sub-CPMK, Lembar Kerja);
  - *Impor RPS lama* dari PDF, Word, atau foto yang dilampirkan di chat AI;
  - *Revisi RPS ini* sesuai instruksi; hasilnya menggantikan dokumen aktif dan bisa di-Undo.
  - Jawaban boleh terbungkus ```json``` atau berisi kalimat pengantar; rujukan boleh berupa kode.
- PDF hasil ekspor menyertakan data `.rps` (JSON) sebagai lampiran, sehingga PDF bisa dibuka lagi untuk diedit.

Rencana berikutnya:
1. Seret-lepas untuk mengurutkan baris.

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
