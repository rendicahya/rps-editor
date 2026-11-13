// Langkah tur pengenalan. Langkah yang targetnya tidak tampil saat tur dibuka dilewati.
export const TOUR_STEPS = [
  {
    title: 'Selamat datang di RPS Editor',
    text: 'Aplikasi ini menyusun Rencana Pembelajaran Semester sesuai template: matriks CPL/CPMK, rekap penilaian, dan nomor pekan dihitung otomatis dari isian Anda. Tur singkat ini menunjukkan bagian-bagian utamanya.'
  },
  {
    target: '[data-tour="page"]',
    title: 'Ketik langsung di halaman',
    text: 'Klik teks di halaman untuk mengubahnya. Sorot baris CPL, CPMK, Sub-CPMK, asesmen, atau pertemuan untuk menambah, memindah, atau menghapusnya; klik kanan untuk menu yang sama.'
  },
  {
    target: '.no-doc',
    title: 'Mulai RPS pertama Anda',
    text: 'Belum ada RPS yang terbuka. Buat RPS baru, buka berkas .rps, lihat Contoh, atau pilih dari Pustaka. Isinya nanti diketik langsung di halaman.'
  },
  {
    target: '.font-warn',
    title: 'Font Calibri',
    text: 'Dokumen RPS memakai Calibri. Bila pemberitahuan ini muncul, ambil Calibri dari perangkat atau pilih filenya. Cukup sekali; font disimpan di browser ini.'
  },
  {
    target: '.fmt',
    title: 'Format teks',
    text: 'Tebal, miring, garis bawah, daftar poin/bernomor, dan ubah huruf besar/kecil untuk isian yang sedang diedit.'
  },
  {
    target: '.tabs',
    title: 'Beberapa RPS sekaligus',
    text: 'Tiap RPS terbuka di tabnya sendiri. Seret tab untuk mengurutkan, klik kanan untuk menu tab. Tab yang terbuka tetap ada saat aplikasi dibuka lagi.'
  },
  {
    target: '[data-tour="new"]',
    title: 'Mulai atau buka RPS',
    text: 'Baru membuat RPS kosong, Buka memuat berkas .rps (atau PDF/Word hasil ekspor aplikasi ini), Contoh membuka RPS contoh. Berkas juga bisa langsung diseret ke jendela ini.'
  },
  {
    target: '[data-tour="curriculum"]',
    title: 'Katalog Kurikulum',
    text: 'CPL dan CPMK per prodi yang dikelola pengelola prodi. Pilih yang dipakai mata kuliah ini untuk menyalinnya ke RPS.'
  },
  {
    target: '[data-tour="ai"]',
    title: 'Asisten AI',
    text: 'Susun RPS baru dari deskripsi mata kuliah, impor RPS lama dari PDF atau Word, atau minta revisi RPS yang sedang dibuka.'
  },
  {
    target: '.toolbar .lib-btn',
    title: 'Pustaka Lokal dan Daring',
    text: 'Pustaka Lokal menyimpan RPS di browser ini, lengkap dengan folder dan riwayat versi. Pustaka Daring dipakai bersama rekan: berbagi, komentar, rekap CPL, dan laporan kelengkapan.'
  },
  {
    target: '[data-tour="save"]',
    title: 'Simpan',
    text: 'Pilih tujuan: Pustaka Lokal, Pustaka Daring, atau berkas .rps. Setelah itu Ctrl+S menyimpan ke tempat yang sama.'
  },
  {
    target: '.check-btn',
    title: 'Periksa kelengkapan',
    text: 'Menandai isian penting yang kosong, relasi CPL/CPMK/Sub-CPMK yang putus, dan bobot asesmen yang tidak berjumlah 100%. Klik salah satu temuan untuk melompat ke tempatnya.'
  },
  {
    target: '.notes-btn',
    title: 'Komentar',
    text: 'Untuk RPS di Pustaka Daring: tinggalkan catatan pada bagian tertentu, sebut rekan dengan @, dan tandai selesai bila sudah ditangani.'
  },
  {
    target: '[data-tour="export"]',
    title: 'Ekspor dan cetak',
    text: 'Unduh PDF, cetak langsung, atau ekspor ke Word. PDF dan Word hasil ekspor bisa dibuka lagi di sini.'
  },
  {
    target: '.adm-btn',
    title: 'Admin',
    text: 'Khusus admin: atur anggota, grup, nama universitas dan fakultas untuk RPS baru, dan pemakaian penyimpanan.'
  },
  {
    target: '[data-tour="tour"]',
    title: 'Bantuan',
    text: 'Tur ini dan daftar pintasan keyboard bisa dibuka lagi kapan saja lewat tombol ini (pintasan juga dengan Ctrl+/). Dialog Pustaka, Asisten AI, dan Admin punya tombol ? sendiri untuk tur singkat isinya.'
  }
];

// Tur singkat di dalam dialog (tombol ? di kepala dialog).
const L = '[data-pane="local"]';
export const LOCAL_TOUR = [
  {
    title: 'Pustaka Lokal',
    text: 'RPS di sini tersimpan di browser ini saja, tidak ikut ke perangkat lain. Data hilang bila data situs browser dihapus, jadi sesekali unduh cadangannya.'
  },
  { target: `${L} .search`, title: 'Cari', text: 'Cari mata kuliah, kode, label, atau isi RPS di semua folder (Ctrl+F).' },
  { target: `${L} aside .tree`, title: 'Folder', text: 'Klik untuk membuka folder. Seret RPS atau folder ke sini untuk memindah. Klik kanan untuk menu folder.' },
  { target: `${L} aside nav`, title: 'Daftar khusus', text: 'Perlu ditinjau (RPS yang sudah lama disusun) dan Baru dihapus (disimpan 30 hari sebelum dihapus permanen).' },
  {
    target: `${L} .crumbs`,
    title: 'Lokasi dan tombol',
    text: 'Filter (label, waktu diubah), urutan, daftar induk (XLSX), cadangan (ZIP), folder baru, simpan dokumen yang dibuka ke sini, dan impor berkas.'
  },
  {
    target: `${L} .list`,
    title: 'Daftar RPS',
    text: 'Klik untuk membuka. Ctrl+klik atau Shift+klik memilih beberapa (gabung PDF, ZIP, pindah, salin ke Pustaka Daring, hapus), klik kanan membuka menu. Berkas .rps atau .zip bisa dilepas di sini untuk diimpor.'
  },
  {
    target: `${L} .list > li:not(.folder):has(.acts)`,
    title: 'Tindakan per RPS',
    text: 'Arahkan mouse ke baris untuk melihat tombolnya: pratinjau, ubah nama, duplikat, riwayat versi, label, unduh .rps, salin ke Pustaka Daring, pindah, dan hapus.'
  }
];

const D = '[data-pane="faculty"]';
export const FACULTY_TOUR = [
  {
    title: 'Pustaka Daring',
    text: 'RPS yang dipakai bersama anggota. Setiap RPS dan folder punya hak akses: private, grup tertentu, atau semua anggota. RPS yang sedang diedit dikunci agar tidak tertimpa.'
  },
  { target: `${D} .search`, title: 'Cari', text: 'Cari mata kuliah, kode, pembuat, atau isi RPS di semua folder (Ctrl+F).' },
  { target: `${D} aside .tree`, title: 'Folder', text: 'Klik untuk membuka folder. Seret RPS atau folder ke sini untuk memindah. Klik kanan untuk menu folder.' },
  {
    target: `${D} aside nav`,
    title: 'Daftar khusus',
    text: 'Perlu ditinjau (RPS yang sudah lama disusun), Ada komentar, Menyebut saya, dan Recycle bin.'
  },
  {
    target: `${D} .crumbs`,
    title: 'Lokasi dan tombol',
    text: 'Filter, urutan, daftar induk (XLSX), cadangan (ZIP), hak akses folder, RPS baru, folder baru, unggah, dan muat ulang.'
  },
  {
    target: `${D} .list`,
    title: 'Daftar RPS',
    text: 'Klik untuk membuka. Ctrl+klik atau Shift+klik memilih beberapa (gabung PDF, rekap CPL, kelengkapan, ZIP, pindah, hapus), klik kanan membuka menu. Berkas .rps atau .zip bisa dilepas di sini untuk diunggah.'
  },
  {
    target: `${D} .list > li:has(.acts)`,
    title: 'Tindakan per RPS',
    text: 'Arahkan mouse ke baris untuk melihat tombolnya: pratinjau, duplikat sebagai milik Anda, riwayat, hak akses, ubah nama, pindah, dan hapus.'
  }
];

const A = '[data-help="ai"]';
export const AI_TOUR = [
  {
    title: 'Asisten AI',
    text: 'Aplikasi ini menyiapkan prompt; Anda menjalankannya di asisten AI pilihan Anda, lalu menempelkan jawabannya di sini. Tidak ada data yang dikirim aplikasi ini ke layanan AI.'
  },
  { target: `${A} .seg`, title: 'Pilih jenis', text: 'Susun RPS baru dari deskripsi mata kuliah, impor RPS lama dari PDF/Word, atau revisi RPS yang sedang dibuka.' },
  { target: `${A} [data-help="step1"]`, title: '1. Uraikan', text: 'Tulis deskripsi mata kuliah atau instruksi revisi. Untuk impor, lampirkan berkas RPS lama di chat AI.' },
  { target: `${A} [data-help="step2"]`, title: '2. Salin prompt', text: 'Prompt berisi aturan format RPS dan isian Anda. Bisa dilihat dulu sebelum disalin.' },
  { target: `${A} [data-help="step3"]`, title: '3. Kirim ke AI', text: 'Tempel prompt di chat asisten AI lalu kirim.' },
  { target: `${A} [data-help="step4"]`, title: '4. Tempel jawaban', text: 'Salin seluruh jawaban AI lalu tempel di sini.' },
  { target: `${A} .actions`, title: '5. Buka hasilnya', text: 'RPS baru dibuka di tab baru; revisi menggantikan dokumen ini dan bisa diurungkan dengan Ctrl+Z.' }
];

// `page`: halaman dialog Admin yang dibuka saat langkah itu tampil (lihat AdminDialog).
const M = '[data-help="admin"]';
export const ADMIN_TOUR = [
  { title: 'Admin', text: 'Pengaturan yang berlaku untuk semua anggota. Hanya admin yang bisa membuka dialog ini.' },
  { target: `${M} nav`, title: 'Halaman', text: 'Bawaan RPS baru, Anggota, Grup, dan Penyimpanan. Tur ini membuka tiap halaman bergantian.' },
  {
    page: 'defaults',
    target: `${M} [data-help="defaults"]`,
    title: 'Bawaan RPS baru',
    text: 'Nama universitas dan fakultas yang otomatis terisi di setiap RPS baru dan dipakai Asisten AI. RPS yang sudah ada tidak berubah.'
  },
  {
    page: 'members',
    target: `${M} [data-help="members"]`,
    title: 'Anggota',
    text: 'Hanya email yang terdaftar di sini yang bisa memakai aplikasi. Tempel beberapa email sekaligus, pilih peran, dan grupnya.'
  },
  {
    page: 'groups',
    target: `${M} [data-help="groups"]`,
    title: 'Grup',
    text: 'Kelompokkan anggota (mis. per prodi) agar hak akses RPS dan folder bisa diberikan sekaligus.'
  },
  {
    page: 'storage',
    target: `${M} [data-help="storage"]`,
    title: 'Penyimpanan',
    text: 'Perkiraan pemakaian penyimpanan daring dan batasnya. Bila batas terlampaui, anggota tidak bisa menyimpan ke Pustaka Daring sampai batasnya dinaikkan atau ada yang dihapus.'
  }
];
