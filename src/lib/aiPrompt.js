// Prompt siap salin agar asisten AI menghasilkan JSON yang bisa dibuka aplikasi ini:
// menyusun RPS baru dari deskripsi, menyalin RPS lama (PDF/Word/foto), atau merevisi RPS yang sedang dibuka.
import { FORMAT, VERSION, todayIso } from './model.js';

const EXAMPLE = {
  format: FORMAT,
  version: VERSION,
  identitas: {
    universitas: 'UNIVERSITAS BRAWIJAYA',
    fakultas: 'FAKULTAS ILMU KOMPUTER',
    departemen: 'Teknik Informatika',
    prodi: 'Teknik Informatika',
    mataKuliah: 'Algoritma dan Struktur Data',
    kode: 'COM60004',
    rmk: 'Mata Kuliah Dasar',
    sksTeori: 2,
    sksPraktikum: 1,
    semester: 'GANJIL',
    tahunAkademik: '2025/2026',
    sifat: 'WAJIB',
    tglPenyusunan: '2025-08-01',
    tahun: '2025',
    dosenPengelola: ['Nama Dosen 1, S.Kom., M.Kom.', 'Nama Dosen 2, S.T., M.T.'],
    koordinator: 'Nama Koordinator RMK',
    kaprodi: 'Nama Ketua Program Studi',
    deskripsi: 'Mata kuliah ini memberikan pemahaman tentang …',
    materi: 'Pokok bahasan dalam perkuliahan ini terdiri dari:\n1. Pengenalan abstract data type\n2. Linked List',
    mediaLunak: 'LMS Brone Universitas Brawijaya\nIDE (Java: Netbeans/Eclipse)',
    mediaKeras: 'LCD/Projector/Laptop',
    pengalamanBelajar: 'Kuliah Tatap Muka\nCase-based Learning\nPraktikum',
    timDosen: [],
    prasyarat: '1. Pemrograman Dasar (COM60014)'
  },
  pustaka: [
    { id: 'p1', jenis: 'utama', teks: 'Mark Allen Weiss, “Data Structures & Problem Solving Using Java 4th Edition”, Pearson, 2010' },
    { id: 'p2', jenis: 'pendukung', teks: 'Daniel Liang, “Introduction to Java Programming and Data Structures, 12E”, Pearson, 2020' }
  ],
  cpl: [{ id: 'c1', kode: 'CPL005', teks: 'Lulusan menguasai konsep dan prinsip dasar bidang ilmu komputer …' }],
  cpmk: [{ id: 'm1', kode: 'CPMK-051', teks: 'Mampu mengimplementasikan struktur data ke dalam bahasa pemrograman', cpl: ['c1'] }],
  subCpmk: [
    { id: 's1', kode: 'Sub-CPMK-05101', teks: 'Mampu memahami konsep dasar abstract data type (ADT)', cpmk: 'm1' },
    { id: 's2', kode: 'Sub-CPMK-05102', teks: 'Mampu menerapkan struktur data linier dan non linier', cpmk: 'm1' }
  ],
  asesmen: [
    { id: 'a1', kode: 'CB-1', siakad: 'Hasil Proyek', obe: 'Studi Kasus', bobot: 40, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik ADT & struktur data' },
    { id: 'a2', kode: 'UTS-1', siakad: 'UTS', obe: 'UTS', bobot: 30, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik pekan 1–7' },
    { id: 'a3', kode: 'UAS-1', siakad: 'UAS', obe: 'UAS', bobot: 30, porsi: { s2: 1 }, keterangan: 'Seluruh topik' }
  ],
  pertemuan: [
    {
      id: 'w1', pekan: 1, jenis: 'kuliah', subCpmk: ['s1'], indikator: 'Ketepatan mahasiswa menjelaskan penggunaan ADT',
      kriteria: 'Mampu menjelaskan konsep ADT', bentuk: 'Sumatif - Kuis 1-1', metode: ['Ceramah', 'Diskusi interaktif'],
      waktu: '2x50 menit', materi: '• Pengantar Abstract Data Type (ADT)', pustaka: ['p1'], bobot: 0.5
    },
    {
      id: 'w2', pekan: 1, jenis: 'praktikum', subCpmk: ['s1'], indikator: 'Ketepatan mahasiswa membuat kode program ADT',
      kriteria: 'Mampu membuat kode program dengan konsep OOP', bentuk: 'Kinerja – Praktikum (Modul 1)', metode: ['Praktikum'],
      waktu: '1x170 menit', materi: 'Review pemrograman berorientasi objek', pustaka: ['p2'], bobot: 1
    }
  ],
  lembarKerja: [
    {
      id: 'lk1', kode: 'LK-1', judul: 'Linked List', asesmen: 'a1', subCpmk: ['s1', 's2'], bentukAktivitas: 'Tugas kelompok di rumah',
      deskripsi: 'Mahasiswa diminta membuat kode program untuk menyelesaikan sebuah kasus …',
      metode: '1. Diberikan sebuah kasus\n2. Membuat kode class ADT\n3. Membuat laporan', luaran: 'Laporan dan kode program',
      indikator: 'Ketepatan mahasiswa menerapkan linked list', jadwal: 'Tugas diberikan pada pekan ke-3\nDikumpulkan sebelum pekan ke-4',
      lainLain: 'Rubrik penilaian:\n• Kode program berjalan\n• Laporan lengkap', rujukan: ''
    }
  ]
};

/** Aturan struktur JSON yang sama untuk ketiga prompt. */
const formatRules = (identitas) => `ATURAN FORMAT:
- Keluarkan HANYA satu objek JSON yang valid, tanpa penjelasan di luar JSON. Jika bisa, berikan juga sebagai berkas .json yang dapat diunduh. Jangan memotong jawaban; bila terlalu panjang, lanjutkan sampai JSON lengkap.
- "format" selalu "${FORMAT}" dan "version" selalu ${VERSION}.
${identitas}
- identitas: "sksTeori" dan "sksPraktikum" berupa angka; "semester" "GANJIL" atau "GENAP"; "sifat" "WAJIB" atau "PILIHAN"; "tglPenyusunan" format YYYY-MM-DD; "dosenPengelola" dan "timDosen" daftar nama (satu nama per butir, lengkap dengan gelar).
- pustaka: { "id", "jenis": "utama" | "pendukung", "teks" } (sitasi lengkap). Nomor pustaka dihitung aplikasi; jangan menulis nomor di teks.
- cpl: { "id", "kode", "teks" }. cpmk: { "id", "kode", "teks", "cpl": [id CPL yang didukung] }. subCpmk: { "id", "kode", "teks", "cpmk": id CPMK induk }.
- asesmen: { "id", "kode", "siakad" (kategori di SIAKAD, mis. "Hasil Proyek", "Kuis", "UTS", "UAS", "Tugas", "Praktikum"), "obe" (bentuk di SIM OBE, mis. "Studi Kasus", "Kuis", "UTS", "UAS"), "bobot" (persen, total semua asesmen 100), "porsi" ({ id Sub-CPMK: proporsi }, jumlahnya 1 untuk tiap asesmen), "keterangan" }.
- pertemuan: satu objek per baris tabel rencana pembelajaran, berurutan menurut pekan (1–16). Pekan dengan kuliah dan praktikum ditulis dua baris dengan "pekan" yang sama: "jenis" "kuliah" lalu "praktikum". Isian:
  - "subCpmk": [id Sub-CPMK], "indikator", "kriteria" (kriteria penilaian), "bentuk" (bentuk penilaian, mis. "Sumatif - Kuis 1-1", "Kinerja – Case Based 1-1 (LK1)", "Sumatif - UTS")
  - "metode": daftar metode pembelajaran, mis. ["Ceramah", "Diskusi interaktif"], ["Praktikum"], ["Ujian"]
  - "waktu": mis. "2x50 menit" (kuliah: SKS teori × 50 menit; praktikum: SKS praktikum × 170 menit)
  - "materi", "pustaka": [id pustaka], "bobot": persen nilai pertemuan itu (angka, boleh 0 atau desimal seperti 0.5)
  - UTS biasanya pekan 8 dan UAS pekan 16.
- lembarKerja: satu per tugas terstruktur (case based/proyek): { "id", "kode" ("LK-1", …), "judul", "asesmen": id asesmen, "subCpmk": [id], "bentukAktivitas", "deskripsi", "metode" (langkah pengerjaan), "luaran", "indikator", "jadwal", "lainLain" (mis. rubrik), "rujukan" }.
- "id" unik dalam tiap daftar (mis. "c1", "m1", "s1", "a1", "w1", "lk1", "p1"); semua rujukan antarbagian memakai id tersebut.
- Matriks CPMK–CPL, penilaian terhadap Sub-CPMK, dan rekap SIAKAD/OBE dihitung aplikasi dari relasi di atas; jangan menuliskannya.
- Format teks: isian "deskripsi", "materi", "mediaLunak", "mediaKeras", "pengalamanBelajar", "prasyarat", serta teks CPL/CPMK/Sub-CPMK/pustaka/asesmen/pertemuan/lembar kerja boleh memakai <b>tebal</b>, <i>miring</i>, dan <u>garis bawah</u>. Jangan memakai Markdown (**…**) atau tag lain. Isian lain teks polos.
- Baris baru ditulis \\n. Daftar: satu butir per baris, diawali "• " untuk poin atau "1. ", "2. ", … untuk nomor.`;

export function aiPrompt(description = '') {
  const desc =
    description.trim() ||
    '[TULIS DI SINI: nama dan kode mata kuliah, prodi, SKS teori/praktikum, semester, dosen, CPL/CPMK yang didukung, pokok bahasan, dan rencana penilaian]';
  const today = todayIso();
  const year = today.slice(0, 4);
  return `Buatkan Rencana Pembelajaran Semester (RPS) perguruan tinggi Indonesia berbasis OBE dalam format JSON untuk aplikasi "RPS Editor".

DESKRIPSI MATA KULIAH:
${desc}

${formatRules(`- identitas: isi semua kolom yang disebut deskripsi. Nama dosen, koordinator, dan kaprodi yang tidak disebut diisi "" (jangan mengarang nama). "tglPenyusunan" diisi "${today}" dan "tahun" "${year}" kecuali deskripsi menyebut lain.
- CPL dan CPMK: gunakan yang disebut deskripsi apa adanya (kode dan teks). Bila tidak disebut, susun usulan dan beri kode "[lengkapi]" agar pengguna menggantinya dengan kode dari kurikulum prodi.
- Pustaka: gunakan buku/artikel yang benar-benar ada; bila ragu, tulis "[lengkapi: …]" alih-alih mengarang judul.`)}
- Susun 16 pekan lengkap (termasuk UTS dan UAS), Sub-CPMK yang semuanya dinilai asesmen dan muncul di tabel pertemuan, serta Lembar Kerja untuk setiap asesmen berbentuk tugas/case based.
- Gunakan bahasa Indonesia baku; istilah asing ditulis <i>miring</i>. Jangan memakai format tebal (<b>).

CONTOH STRUKTUR (isi dengan mata kuliah di atas, jangan disalin isinya):
${JSON.stringify(EXAMPLE, null, 2)}`;
}

/** Prompt untuk merevisi dokumen yang sedang dibuka sesuai instruksi pengguna. */
export function aiRevisePrompt(doc, instruction = '') {
  const ins =
    instruction.trim() ||
    '[TULIS DI SINI: perubahan yang diinginkan, mis. "tambahkan Lembar Kerja untuk CB-2", "rapikan indikator pertemuan", "sesuaikan bobot agar total 100%"]';
  return `Berikut dokumen Rencana Pembelajaran Semester (RPS) dalam format JSON aplikasi "RPS Editor". Revisi dokumen ini sesuai instruksi, lalu kembalikan dokumen LENGKAP hasil revisinya.

INSTRUKSI REVISI:
${ins}

ATURAN REVISI:
- Ubah hanya bagian yang diminta instruksi; bagian lain disalin persis apa adanya (teks, format, urutan, dan "id").
- Pertahankan "id" yang sudah ada. Item baru diberi id baru yang belum dipakai di daftarnya.
- Bila item dihapus, hapus juga rujukan ke item itu (di "cpl" CPMK, "cpmk" Sub-CPMK, "porsi" asesmen, "subCpmk"/"pustaka" pertemuan, dan "asesmen"/"subCpmk" Lembar Kerja).
- Teks baru atau yang diubah tidak memakai format tebal (<b>), kecuali instruksi memintanya.
- Bila instruksi tidak jelas atau tidak bisa dilakukan, tetap kembalikan dokumen utuh tanpa perubahan pada bagian itu.

${formatRules(`- identitas: salin dari dokumen kecuali instruksi meminta perubahan.`)}

DOKUMEN SAAT INI:
${JSON.stringify(doc, null, 2)}`;
}

/**
 * Prompt untuk menyalin RPS lama yang dilampirkan pengguna di chat AI.
 * `keepKop`: universitas/fakultas disalin dari dokumen; bila false, diisi bawaan aplikasi.
 */
export function aiImportPrompt(note = '', keepKop = false) {
  const extra = note.trim() ? `\nCATATAN TAMBAHAN DARI PENGGUNA (utamakan bila bertentangan dengan aturan di bawah):\n${note.trim()}\n` : '';
  const identitas = keepKop
    ? '- identitas: salin semua kolom dari dokumen apa adanya.'
    : `- identitas: salin dari dokumen, kecuali "universitas" diisi "${EXAMPLE.identitas.universitas}" dan "fakultas" "${EXAMPLE.identitas.fakultas}".`;
  return `Saya melampirkan dokumen Rencana Pembelajaran Semester (RPS) lama, berupa PDF, Word, atau foto/pindaian. Salin isinya menjadi JSON untuk aplikasi "RPS Editor".
${extra}
CARA MEMBACA DOKUMEN:
- Identitas: nama mata kuliah, kode, rumpun mata kuliah (RMK), SKS (teori/praktikum), semester, tahun akademik, sifat, tanggal penyusunan, dosen pengelola, koordinator RMK, ketua program studi, deskripsi singkat, bahan kajian/materi, media pembelajaran (perangkat lunak/keras), pengalaman belajar, tim dosen, dan mata kuliah prasyarat.
- CPL (capaian pembelajaran lulusan/prodi yang dibebankan), CPMK, dan Sub-CPMK beserta kodenya. Relasi CPMK → CPL biasanya ada di matriks atau kolom "Support CP"; Sub-CPMK → CPMK dari kodenya atau kolom "Support CPMK".
- Rencana asesmen/penilaian: kode, kategori SIAKAD, bentuk OBE, bobot (%), dan porsi tiap Sub-CPMK (matriks penilaian terhadap Sub-CPMK). Porsi berupa proporsi berjumlah 1; bila dokumen menulis persen per Sub-CPMK, bagi dengan bobot asesmennya.
- Tabel rencana pembelajaran per pekan: pekan, Sub-CPMK, indikator, kriteria & bentuk penilaian, metode pembelajaran, waktu, materi, pustaka, dan bobot penilaian. Bila tabel berlanjut ke beberapa halaman, gabungkan semua barisnya dan abaikan kepala tabel yang berulang. Baris kuliah dan praktikum pada pekan yang sama menjadi dua objek pertemuan.
- Daftar pustaka utama dan pendukung; rujukan "[1]", "[2]" di tabel dipetakan ke id pustaka sesuai urutannya.
- Lembar Kerja/tugas (bila ada): satu objek per lembar.
- Matriks turunan (CPMK–CPL, rekap SIAKAD/OBE) tidak perlu disalin, cukup dipakai untuk mengisi relasi.

ATURAN PENYALINAN:
- Salin teks persis seperti di dokumen (ejaan, huruf kapital, singkatan, gelar). Jangan meringkas, menambah, atau memperbaiki isi.
- Pertahankan format tebal, miring, dan garis bawah memakai tag di bawah.
- Tanggal ditulis YYYY-MM-DD (mis. "1 Agustus 2025" → "2025-08-01"); kosongkan ("") bila tidak ada.
- Teks yang tidak terbaca ditulis "[tidak terbaca]". Jangan menyertakan logo, tanda tangan, atau stempel.

${formatRules(identitas)}

CONTOH STRUKTUR (hanya bentuknya; isinya harus dari dokumen terlampir):
${JSON.stringify(EXAMPLE, null, 2)}`;
}
