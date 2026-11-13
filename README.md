# RPS Editor

Aplikasi web (front-end saja, PWA) untuk menyusun Rencana Pembelajaran Semester (RPS) berformat baku FILKOM UB,
menyimpannya sebagai berkas `.rps` (isinya JSON), dan mengekspornya ke PDF A4.

Dibangun dengan Svelte 5 + Vite, jsPDF, vite-plugin-pwa, serta Firebase.

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
- Tab (dengan menu klik kanan: simpan, duplikat, tutup tab lain/di kanan/semua), Undo/Redo, Pustaka Lokal,
  cari & ganti, tombol **Contoh** (RPS Algoritma dan Struktur Data).
- Dialog tertutup bila diklik di luar kotaknya; panel Periksa juga.
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
  - **Seret-lepas**: seret pegangan **⠿** di alat baris ke posisi baru (garis biru menandai letak jatuhnya), juga
    melintasi halaman; halaman bergulir sendiri di dekat tepi. Satu seretan = satu langkah Undo, Esc membatalkan.
    Nomor pekan pertemuan tidak ikut berubah.
  - Menghapus CPL/CPMK/Sub-CPMK/pustaka/asesmen ikut menghapus rujukan ke item itu.
  - Pertemuan baru mengikuti pola kuliah → praktikum di pekan yang sama → kuliah pekan berikutnya.

- **Periksa** (jumlah temuan diperbarui langsung; klik temuan untuk menuju isiannya, isian pilihan langsung dibuka):
  - identitas penting kosong, SKS 0, kode CPL/CPMK/Sub-CPMK/asesmen/LK kosong atau ganda;
  - CPMK tanpa CPL atau tanpa Sub-CPMK, Sub-CPMK tanpa CPMK induk, CPL yang tidak didukung CPMK;
  - Sub-CPMK yang tidak dinilai asesmen (termasuk yang berporsi di asesmen berbobot 0) atau tidak muncul di tabel
    pertemuan; CPMK dan CPL yang tidak ikut nilai akhir; saran bila satu CPMK menyumbang kurang dari 5% nilai akhir;
  - total bobot asesmen bukan 100%, porsi asesmen terhadap Sub-CPMK tidak berjumlah 1;
  - pertemuan tanpa Sub-CPMK/indikator/materi/waktu, urutan pekan tidak naik, pekan yang terlewat, jumlah pekan
    bukan 16, tidak ada UTS/UAS;
  - waktu pertemuan dibanding SKS (kuliah n×50 menit, praktikum n×170 menit; "2x50 menit" dan "100 menit" terbaca);
  - Lembar Kerja tanpa judul, asesmen, Sub-CPMK, atau deskripsi;
  - uraian CPL/CPMK/Sub-CPMK atau pustaka yang ditulis dua kali, dosen pengelola yang tercantum dua kali.
  - Tab **Rekap nilai**: pohon CPL › CPMK › Sub-CPMK dengan persentase nilai akhir yang mengukur tiap capaian (bobot
    asesmen × porsi Sub-CPMK, dijumlahkan ke atas) beserta bilahnya; Sub-CPMK menampilkan jumlah pertemuannya, dan
    asesmen penyumbangnya saat diarahkan. Capaian 0% ditandai merah; klik baris untuk menuju isiannya. CPMK yang
    mendukung beberapa CPL dihitung penuh di tiap CPL.
- **Pengingat tinjauan berkala**: RPS yang tanggal penyusunannya lebih dari 1–5 tahun lalu (dipilih di panel Periksa,
  bawaan 2 tahun; diingat per browser) diberi peringatan "sebaiknya ditinjau ulang". Di Pustaka Daring, RPS itu
  berlencana **Perlu ditinjau** dan bisa didaftar sekaligus lewat **Perlu ditinjau** di bawah pohon folder.
- **Tambah anggota sekaligus** (tab Admin di Pustaka Daring): tempel banyak email, dipisah koma, spasi, titik koma,
  atau baris baru (format "Nama &lt;email&gt;" juga diterima). Email yang sudah terdaftar tidak diubah perannya, hanya
  dimasukkan ke grup yang dipilih; alamat yang tidak sah dilewati setelah konfirmasi.

- **Pustaka Daring**: folder, hak akses per anggota/grup (plus pilihan akses umum: Private, semua anggota bisa
  melihat, atau semua anggota bisa mengedit), riwayat, recycle bin, dan kunci edit.
  - Pilih banyak item dengan Ctrl/Shift+klik, lalu pindahkan (seret, potong-tempel, atau keyboard) atau hapus
    sekaligus. Pemindahan dan pemindahan ke Recycle bin bisa diurungkan dari pesan yang muncul (atau Ctrl+Z).
  - Daftar Lokal dan Daring bisa diurutkan menurut nama atau waktu terakhir diubah.
  - **Duplikat** menghasilkan RPS milik penyalinnya dengan hak akses yang sama seperti aslinya: semua yang bisa
    melihat atau mengedit aslinya mendapat hak yang sama pada salinan (ditandai **Khusus** bila berbeda dari folder
    tempatnya).
  - **Riwayat lama bisa dihapus** oleh pemilik RPS dan admin: per versi, atau sekaligus lewat **Hapus riwayat lama…**
    dengan menyisakan sejumlah versi terbaru (0 = seluruh riwayat; isi saat ini tetap utuh). Ruangnya dikembalikan ke
    kuota pustaka. Tidak bisa dibatalkan.
  - **Bandingkan versi** (Riwayat › Bandingkan versi…, atau ikon bandingkan pada satu versi): dua versi mana pun, isi
    terkini, atau isi tab yang belum disimpan dibandingkan. Yang ditampilkan: identitas, CPL, CPMK, Sub-CPMK, asesmen,
    pertemuan, pustaka, dan Lembar Kerja (ditambah, dihapus, diubah, atau dipindah) dengan perbedaan per kata.
  - **Kembalikan versi saat RPS terbuka di tab**: isi versi lama dimuat ke tab itu sebagai perubahan biasa (bisa
    di-Undo) dan baru menjadi isi terkini setelah disimpan. Bila RPS tidak terbuka, versi lama langsung menjadi isi
    terkini.
  - **Komentar peninjauan** (tombol **Komentar** di toolbar): siapa pun yang bisa melihat RPS, termasuk pemegang hak
    Lihat, bisa berkomentar, membalas, menandai **Selesai**, dan membukanya lagi. Klik isian di halaman lalu tulis
    komentar, atau klik kanan isian › **Komentari…**; komentar juga bisa untuk seluruh RPS. Isian yang punya komentar
    terbuka diberi penanda kuning, komentar yang isiannya sudah berubah sejak dikomentari diberi tanda "diubah", dan
    komentar baru dari orang lain langsung muncul. Teks komentar hanya bisa diubah penulisnya; komentar bisa dihapus
    penulisnya, pemilik RPS, dan admin (balasannya ikut terhapus). Komentar terpisah dari isi RPS: tidak masuk riwayat,
    berkas `.rps`, maupun hasil ekspor, dan ekspor mengingatkan bila masih ada komentar yang belum selesai.
  - **Sebut orang di komentar**: ketik `@` lalu pilih dari saran (hanya anggota yang bisa melihat RPS itu). Orang yang
    disebut melihat angka di tombol **Pustaka** dan daftar **Menyebut saya** (di bawah pohon folder) berisi komentar
    dari RPS mana pun yang menyebutnya; klik untuk membuka RPS dan komentarnya.
  - **Ada komentar**: tiap RPS di daftar menampilkan jumlah komentar yang belum selesai, dan menu **Ada komentar** di
    bawah pohon folder mendaftar semua RPS yang masih punya komentar terbuka.
  - **Tautan langsung**: klik kanan RPS (atau tab RPS daring) › **Salin tautan**, atau **Salin tautan** pada komentar.
    Tautan `…/rps-editor/?rps=ID` membuka RPS itu setelah penerimanya masuk (perlu hak lihat), dan tautan komentar
    sekaligus menyorot komentarnya.
  - **Kunci edit**: RPS yang sedang terbuka di tab pemegang hak edit terkunci. Orang lain, termasuk pemegang hak Lihat,
    tidak bisa membukanya (dari daftar maupun tautan) sampai tab itu ditutup; di daftar tampil "Terkunci, sedang diedit
    oleh …". Server juga menolak penyimpanan dari selain pemegang kunci. Kunci lepas sendiri sekitar 5 menit setelah
    browser pemegangnya tertutup, atau setelah sekitar 15 menit tanpa klik atau ketikan. Tidak ada yang bisa mengambil
    alih kunci sebelum itu, termasuk admin. Bila kunci ternyata dipegang orang lain, tab yang belum berubah ditutup,
    sedangkan tab berisi perubahan dilepas dari Pustaka Daring agar isinya tidak hilang.
  - **Rekap CPL** (pilih RPS atau folder › **Rekap CPL**, atau klik kanan folder › **Rekap CPL isinya…**): matriks
    mata kuliah × CPL. Sel berisi persentase nilai akhir mata kuliah yang mengukur CPL itu (seperti tab Rekap nilai di
    Periksa), atau sumbangannya dalam SKS, atau sekadar ✓/○. Baris bawah: jumlah mata kuliah yang menilai tiap CPL dan
    SKS-setara (Σ SKS × persen). CPL dicocokkan lewat kodenya; bila dipilih katalog kurikulum (otomatis menurut prodi
    RPS-nya), semua CPL katalog tampil sehingga CPL yang belum dinilai mata kuliah mana pun terlihat, dan kode di luar
    katalog ditandai. Juga diingatkan: CPL yang hanya dinilai satu mata kuliah dan RPS yang bobot asesmennya bukan
    100%. Bisa diunduh sebagai CSV (Excel); klik nama mata kuliah untuk membukanya.
  - **Kelengkapan RPS** (pilih RPS atau folder › **Kelengkapan**, atau klik kanan folder › **Kelengkapan RPS isinya…**):
    laporan untuk pengelola prodi. Tiap RPS diberi status dari Periksa: **Belum lengkap** (ada temuan error),
    **Perlu perhatian** (ada peringatan, komentar yang belum selesai, perlu ditinjau ulang, atau catatan katalog), atau
    **Siap**; jumlah temuan, dosen pengelola, dan waktu terakhir diubah ikut tampil (arahkan kursor ke angka untuk melihat
    temuannya). Bila katalog kurikulumnya punya daftar mata kuliah, laporan juga menunjukkan mata kuliah yang **belum
    punya RPS**, kode RPS yang tidak ada di katalog, SKS yang berbeda dari katalog, dan RPS ganda berkode sama. Bisa
    disaring ke yang perlu ditindaklanjuti saja dan diunduh sebagai CSV.
  - **Unggah banyak sekaligus**: seret berkas `.rps` atau ZIP berisi `.rps` ke daftar atau ke
    folder di pohon (atau tombol unggah berkas / menu klik kanan), maksimal 500 berkas. Subfolder di dalam ZIP dibuat
    ulang; folder bernama sama yang milik Anda dipakai. PDF dan DOCX hasil ekspor RPS Editor juga diterima. Berkas yang tidak
    terbaca dilewati dan disebutkan alasannya; unggahan berhenti bila penyimpanan penuh.
- **Katalog Kurikulum** (tombol **Kurikulum**): CPL, CPMK, dan daftar mata kuliah per prodi di Pustaka Daring.
  - Admin menambah/menghapus prodi dan menunjuk **pengelola prodi** (email).
  - Pengelola prodi (dan admin) mengedit CPL/CPMK prodinya beserta relasi CPMK → CPL.
  - Daftar mata kuliah (kode, nama, SKS, semester) dipakai laporan Kelengkapan RPS. Isi satu per satu, atau
    **Tempel dari Excel…**: salin kolom Kode, Nama, SKS, Semester lalu tempel; baris judul dan kode yang sudah ada dilewati.
  - Semua anggota bisa mencentang CPL/CPMK lalu **Pakai di RPS ini**: disalin ke RPS aktif (satu langkah Undo);
    CPL yang didukung CPMK terpilih ikut disalin, kode yang sudah ada tidak diduplikasi, prodi/departemen yang
    masih kosong diisi dari katalog.

- **Asisten AI** (tanpa kunci API: prompt disalin ke asisten AI pilihan, jawabannya ditempel kembali):
  - *Susun RPS baru* dari deskripsi mata kuliah (16 pekan, asesmen, porsi Sub-CPMK, Lembar Kerja);
  - *Impor RPS lama* dari PDF, Word, atau foto yang dilampirkan di chat AI;
  - *Revisi RPS ini* sesuai instruksi; hasilnya menggantikan dokumen aktif dan bisa di-Undo.
  - Jawaban boleh terbungkus ```json``` atau berisi kalimat pengantar; rujukan boleh berupa kode.
- PDF hasil ekspor menyertakan data `.rps` (JSON) sebagai lampiran, sehingga PDF bisa dibuka lagi untuk diedit.
  Pilihan **Isi PDF** di dialog pratinjau (diingat per browser): **Bisa disalin** (bawaan), **Dikunci** (PDF
  terenkripsi dengan izin cetak saja; salin dan ubah dilarang di Acrobat, Chrome, Edge, tetapi sebagian penampil
  seperti Firefox mengabaikannya), atau **Gambar** (tiap halaman menjadi gambar 250 dpi sehingga teks sama sekali
  tidak bisa diseleksi; berkas lebih besar). PDF yang dikunci atau berupa gambar tidak berisi data RPS, jadi tidak bisa
  dibuka lagi di editor.
  Pilihan **Watermark** menambahkan teks miring dan samar di tengah setiap halaman: DRAFT, SALINAN TERKENDALI,
  SALINAN TIDAK TERKENDALI, RAHASIA, CONTOH, atau teks lain (maks. 60 karakter). Watermark hanya ada di PDF.
  Pilihan **Halaman** menentukan isi PDF: semua halaman (bawaan), **RPS tanpa Lembar Kerja** (sampul sampai tabel
  pertemuan), atau **Lembar Kerja saja**. Diingat per browser; PDF sebagian tetap membawa data RPS yang utuh sehingga
  bisa dibuka lagi di editor. Di PDF gabungan dengan "Lembar Kerja saja", RPS yang tidak punya Lembar Kerja dilewati.
- **Cetak** (menu Ekspor, tombol di pratinjau PDF, atau Ctrl+P): mencetak lewat PDF sehingga hasilnya sama persis
  dengan ekspor, termasuk pilihan Halaman dan Watermark. Di ponsel, PDF dibuka di tab baru untuk dicetak dari sana.
- **PDF gabungan (kumpulan RPS)**: beberapa RPS digabung menjadi satu PDF, diawali halaman daftar isi (kode, mata
  kuliah, prodi, dan halaman tiap RPS; klik untuk melompat) dan bookmark per RPS. Dari Pustaka Daring: pilih RPS atau
  folder lalu **Gabung PDF** (isi folder dan subfoldernya ikut), atau klik kanan folder › **Gabung isinya jadi satu
  PDF…**. Dari editor: menu Ekspor › **PDF gabungan semua tab…**. Pilihan Halaman, Isi PDF, dan Watermark berlaku juga di sini.
- **Ekspor Word (.docx)** (menu Ekspor): tabel Word biasa yang bisa diedit, dengan bagian dan orientasi sama seperti
  PDF (sampul potret, identitas/matriks/tabel pertemuan lanskap, Lembar Kerja potret). Kepala tabel pertemuan diulang
  di setiap halaman, dan baris panjang dibiarkan terbelah oleh Word, sehingga letak pergantian halaman bisa sedikit
  berbeda dari PDF. Data `.rps` ikut disimpan di dalam DOCX: berkas Word ini bisa dibuka lagi di editor dan diunggah ke
  Pustaka Daring.
- **Properti dokumen** (menu Ekspor, atau tombol di pratinjau PDF): judul, penulis, subjek, dan kata kunci di
  metadata PDF dan DOCX. Disimpan di dalam berkas `.rps` (ikut Undo dan Pustaka Daring). Kolom kosong memakai bawaan: judul "RPS <mata kuliah>", penulis
  dari dosen pengelola, subjek "Rencana Pembelajaran Semester <kode>, Program Studi <prodi>".

## Firebase

Anggota (`members`) dan grup (`groups`) disimpan di proyek Firebase bersama dan dipakai juga oleh aplikasi lain.
**Aturan Firestore hanya ada satu per proyek** dan tidak dikelola di repositori ini. Jangan men-deploy aturan dari
sini: deploy terakhir menimpa seluruh aturan proyek.

Rancangan koleksi RPS:

| Koleksi | Isi |
| --- | --- |
| `rps/{id}` + `versions` | dokumen RPS dan riwayatnya |
| `rps/{id}/comments/{cid}` | komentar peninjauan dan balasannya (`parent` null = komentar utama) |
| `rpsFolders/{id}` | folder Pustaka Daring RPS |
| `rpsLocks/{id}` | kunci edit `{ uid, name, at }`: RPS yang sedang dibuka pemegang hak edit |
| `curricula/{prodiId}` | `{ nama, departemen, managers: [email], cpl, cpmk, mk? }` (`mk`: `[{ id, kode, nama, sks, semester }]`); diedit pengelola prodi dan admin |

Aplikasi ini berbagi origin dengan aplikasi lain di GitHub Pages, jadi semua kunci `localStorage`/IndexedDB berawalan
`rps-editor`. Pengecualian: font Calibri disimpan di basis data font bersama agar cukup dipilih sekali.

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
                    "indikator": "...", "jadwal": "...", "lainLain": "...", "rujukan": "..." }],
  // opsional: properti dokumen untuk metadata PDF; kolom yang tidak ada memakai nilai bawaan
  "meta": { "title": "...", "author": "...", "subject": "...", "keywords": "..." }
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

Kode aplikasi: © 2026 Randy Cahya Wihandika, hak cipta dilindungi (lihat [LICENSE](LICENSE)). Kode boleh dilihat,
tetapi tidak boleh disalin, diubah atau disebarkan tanpa izin tertulis. Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`).
Inter: SIL Open Font License 1.1.
