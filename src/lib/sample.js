// Contoh RPS (Algoritma dan Struktur Data, FILKOM UB 2025), ditranskripsi dari contoh-rps.pdf.
// Dipakai sebagai "Buka contoh" dan pembanding tata letak terhadap dokumen aslinya.
import { normalizeDocument } from './model.js';

const IDT = 'Ketepatan mahasiswa mengabstraksikan, mengidentifikasi, dan menerapkan';
const KULIAH = ['Ceramah', 'Diskusi interaktif'];
const PRAK = ['Praktikum'];
const prakKriteria = (topik) => `mampu membuat kode program tentang kasus yang menerapkan ${topik}`;

// [pekan, jenis, subCpmk, indikator, kriteria, bentuk, metode, waktu, materi, bobot]
const ROWS = [
  [1, 'kuliah', ['s1'], 'Ketepatan mahasiswa menjelaskan penggunaan Abstract Data Type', 'Mampu menjelaskan konsep ADT dan konsep OOP', 'Sumatif - Kuis 1-1', KULIAH, '2x50 menit', '• Pengantar Abstract Data Type (ADT)', 0.5],
  [1, 'praktikum', ['s1'], '-', '', '', PRAK, '1x170 menit', 'Review Pemrograman Dasar dalam bentuk pretest', 0],
  [2, 'kuliah', ['s2'], `${IDT} Singly Linked List`, 'memahami cara kerja linked list, mampu menerapkan linked list ke dalam kode program', 'Sumatif - Kuis 1-2', KULIAH, '2x50 menit', 'Array, Singly Linked List', 0.5],
  [2, 'praktikum', ['s1'], 'Ketepatan mahasiswa membuat kode program dengan konsep OOP untuk keperluan ADT', 'mampu membuat kode program dengan konsep OOP', 'Kinerja – Praktikum (Modul 1 dan Modul 2)', PRAK, '1x170 menit', 'Review Object Oriented Programming dan generic', 1],
  [3, 'kuliah', ['s2'], `${IDT} Doubly Linked List dan Circular Linked List`, 'memahami cara kerja double dan circular linked list, mampu menerapkannya ke dalam kode program', 'Kinerja – Case Based 1-1 (LK1)', KULIAH, '2x50 menit', 'Doubly Linked List dan Circular Linked List', 10],
  [3, 'praktikum', ['s2'], 'Ketepatan mahasiswa menjelaskan penggunaan Abstract Data Type', 'mampu membuat kode program tentang Abstract data type array', 'Kinerja – Praktikum (Modul 3)', PRAK, '1x170 menit', 'ADT Array berbasis Object Oriented', 1],
  [4, 'kuliah', ['s2'], `${IDT} Stack`, '', 'Sumatif - Kuis 1-3', KULIAH, '2x50 menit', '• Stack dengan array dan linked list\n• contoh penerapan pada Postfix dan Infix', 0.5],
  [4, 'praktikum', ['s2'], `${IDT} Singly Linked List`, prakKriteria('linked list'), 'Kinerja – Praktikum (Modul 4)', PRAK, '1x170 menit', 'Array, Singly Linked List', 0.5],
  [5, 'kuliah', ['s2'], `${IDT} Queue`, '', 'Kinerja – Case Based 1-2 (LK2)', KULIAH, '2x50 menit', '• Queue dengan Array dan Linked List\n• Konsep dasar Priority Queue', 10],
  [5, 'praktikum', ['s2'], `${IDT} Doubly Linked List dan Circular Linked List`, prakKriteria('double dan circular linked list'), 'Kinerja – Praktikum (Modul 5 dan Modul 6)', PRAK, '1x170 menit', 'Doubly & Circular Linked List', 0.5],
  [6, 'kuliah', ['s2'], `${IDT} Tree dan Binary Tree`, '', 'Sumatif - Kuis 1-4', KULIAH, '2x50 menit', 'Tree\nBinary Tree\nComplete binary tree (CBT)', 0.5],
  [6, 'praktikum', ['s2'], `${IDT} Stack`, prakKriteria('stack'), 'Kinerja – Praktikum (Modul 7)', PRAK, '1x170 menit', 'Stack', 1],
  [7, 'kuliah', ['s2'], 'Ketepatan dalam menjawab pertanyaan', 'Mampu menjawab soal', 'Sumatif - Kuis 1-5', ['Ujian'], '2x50 menit', 'Kuis meliputi materi:\n• konsep ADT,\n• array,\n• linked list,\n• stack,\n• queue,\n• Tree, Binary tree, dan CBT', 3],
  [7, 'praktikum', ['s2'], `${IDT} Queue`, prakKriteria('queue'), 'Kinerja – Praktikum (Modul 8)', PRAK, '1x170 menit', 'Queue', 1],
  [8, 'kuliah', ['s1', 's2'], 'Ketepatan dalam menjawab pertanyaan', 'Mampu menjawab soal', 'Sumatif - UTS', ['Ujian'], '2x50 menit', 'UTS meliputi materi:\n• konsep ADT,\n• array,\n• linked list,\n• stack,\n• queue,\n• Tree, Binary tree, dan CBT', 10],
  [8, 'praktikum', ['s1', 's2'], 'Ketepatan mahasiswa dalam mengimplementasikan kode program untuk menyelesaikan kasus sederhana', 'Mampu mengimplementasikan kode program', 'Kinerja – UTP', ['Ujian Praktikum'], '1x170 menit', 'UTP meliputi materi:\n• konsep ADT,\n• array,\n• linked list,\n• stack,\n• queue', 10],
  [9, 'kuliah', ['s2'], `${IDT} Heap tree dan binary search tree`, 'mampu memahami cara kerja heap tree dan binary search tree dengan mensimulasikan penambahan dan penghapusan node, dan mampu membuat kode program yang menerapkan heap dan binary search tree', 'Sumatif - Kuis 1-6', KULIAH, '2x50 menit', '• Heap Tree\n• Binary Search Tree\n• Priority queue dengan heap tree', 0.5],
  [9, 'praktikum', ['s2'], `${IDT} Tree dan Binary Tree`, prakKriteria('binary tree'), 'Kinerja – Praktikum (Modul 9)', PRAK, '1x170 menit', 'Tree, Binary Tree, dan CBT', 1],
  [10, 'kuliah', ['s2'], `${IDT} AVL Tree`, 'mampu memahami cara kerja AVL tree dengan mensimulasikan penambahan dan penghapusan node, dan mampu membuat kode program yang menerapkan AVL tree', 'Kinerja – Case Based 1-3 (LK3)', KULIAH, '2x50 menit', 'AVL Tree', 10],
  [10, 'praktikum', ['s2'], `${IDT} Heap tree dan binary search tree`, prakKriteria('heap tree'), 'Kinerja – Praktikum (Modul 9)', PRAK, '1x170 menit', 'Heap Tree dan Binary Search Tree', 0.5],
  [11, 'kuliah', ['s2'], `${IDT} Graf`, 'mampu memahami cara kerja graf, memahami teori graf, dan mampu membuat kode program yang menerapkan', 'Sumatif - Kuis 1-7', KULIAH, '2x50 menit', '• ADT Graf (Adjacency matrix, adjacency list)\n• Algoritma penelusuran graf DFS dan BFS', 0.5],
  [11, 'praktikum', ['s2'], `${IDT} AVL Tree`, prakKriteria('AVL tree'), 'Kinerja – Praktikum (Modul 10)', PRAK, '1x170 menit', 'AVL Tree', 1],
  [12, 'kuliah', ['s3'], `${IDT} algoritma Sorting`, 'mampu memahami cara kerja algoritma sorting, dan mampu membuat kode program yang menerapkan algoritma sorting', 'Sumatif - Kuis 2-1', KULIAH, '2x50 menit', 'Algoritma Sorting:\n• Bubble Sort (linked list dan array)\n• Quick Sort (array dan stack)\n• Merge Sort (Array, Linked List, Queue)\n• Heap Sort (priority Queue)\n• Bucket Sort (Array of Queues, Linked List)\n• BST Sort', 0.5],
  [12, 'praktikum', [], `${IDT} Graf`, prakKriteria('graph'), 'Kinerja – Praktikum (Modul 11)', PRAK, '1x170 menit', 'Graph', 0.5],
  [13, 'kuliah', ['s4'], `${IDT} algoritma Searching`, 'mampu memahami cara kerja algoritma searching, dan mampu membuat kode program yang menerapkan algoritma searching', 'Kinerja – Case Based 2-1 (LK4)', KULIAH, '2x50 menit', 'Algoritma Searching:\n• Linear search (Array, List, Queue, Linked List)\n• Binary Search (Array (terurut), BST\n• Graph Search (Navigasi dan Jalur) (Graph, Queue, Stack)', 10],
  [13, 'praktikum', ['s3'], `${IDT} algoritma Sorting`, prakKriteria('algoritma sorting'), 'Kinerja – Praktikum (Modul 12)', PRAK, '1x170 menit', 'Sorting', 1],
  [14, 'kuliah', ['s4'], `${IDT} Hashing`, 'memahami cara kerja hashing dan collision handling', 'Sumatif - Kuis 2-2', KULIAH, '2x50 menit', 'Hashing:\n• fungsi hash\n• penanganan hash collision', 0.5],
  [14, 'praktikum', ['s4'], `${IDT} algoritma Searching`, prakKriteria('algoritma searching'), 'Kinerja – Praktikum (Modul 13)', PRAK, '1x170 menit', 'Searching', 1],
  [15, 'kuliah', ['s3', 's4'], 'Ketepatan dalam menjawab pertanyaan', 'Mampu menjawab soal', 'Sumatif – Kuis 2-3', ['Ujian'], '2x50 menit', 'Kuis 2:\n• Heap tree\n• AVL tree\n• Searching\n• Sorting\n• Hash', 3],
  [15, 'praktikum', ['s1', 's2', 's3', 's4'], 'Ketepatan mahasiswa dalam mengimplementasikan kode program untuk menyelesaikan kasus sederhana', 'Mampu mengimplementasikan kode program', 'Kinerja – UAP', ['Ujian Praktikum'], '', 'UAP: seluruh materi', 10],
  [16, 'kuliah', ['s1', 's2', 's3', 's4'], 'Ketepatan dalam menjawab pertanyaan', 'Mampu menjawab soal ujian', 'Sumatif - UAS', ['Ujian'], '', 'UAS: Seluruh materi', 10]
];

const RUBRIK = 'Rubrik penilaian:\n• Memahami model ADT dalam bentuk gambar\n• Flowchart dari masing-masing method\n• Mencantumkan kode program, komentar, dan link kode program\n• Mencantumkan screenshot running';
const tugas = (topik) =>
  `Mahasiswa diminta untuk menyelesaikan tugas berupa pembuatan kode program untuk menyelesaikan sebuah kasus. Kode program harus menerapkan ${topik}`;
const langkah = (kelas) =>
  `1. Diberikan sebuah kasus\n2. Membuat kode class ${kelas}\n3. Membuat kode program yang menerapkan ADT tersebut untuk menyelesaikan kasus yang diberikan\n4. Membuat laporan`;
const lk = (n, judul, asesmen, subCpmk, deskripsi, kelas, indikator, pekan) => ({
  id: 'lk' + n, kode: 'LK-' + n, judul, asesmen, subCpmk, bentukAktivitas: 'Tugas kelompok di rumah', deskripsi,
  metode: langkah(kelas), luaran: 'Laporan dan kode program', indikator: `${IDT} ${indikator}`,
  jadwal: `Tugas diberikan pada pekan ke-${pekan}\nDikumpulkan sebelum pertemuan pekan ke-${pekan + 1} dimulai`, lainLain: RUBRIK, rujukan: ''
});

export function sampleDocument() {
  const all = { s1: 0.25, s2: 0.25, s3: 0.25, s4: 0.25 };
  return normalizeDocument({
    format: 'rps-editor',
    identitas: {
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
      dosenPengelola: [
        'Ir. Aryo Pinandito, S.T., M.MT, Ph.D',
        'Dr. Drs. Ir. Achmad Ridok, M.Kom.',
        'Ir. Indriati, S.T., M.Kom.',
        'Putra Pandu Adikara, S.Kom., M.Kom.',
        'Sigit Adinugroho, S.Kom., M.Sc., Ph. D.'
      ],
      koordinator: 'Dr.Eng. Budi Darma Setiawan',
      kaprodi: 'Bayu Priyambadha',
      deskripsi:
        'Mata kuliah ini mahasiswa diberikan pemahaman tentang cara menentukan serta mengimplementasikan struktur data dan algoritma yang tepat untuk menyelesaikan suatu masalah tertentu dengan memperhatikan efisiensi dan efektifitas. Algoritma digunakan sebagai sebuah pendekatan untuk dapat menyusun dan mengelola instruksi secara efisien. Struktur data digunakan untuk mengelola data secara efektif. Perkuliahan ini dilakukan dengan memberikan materi, tugas dan diskusi di kelas serta praktikum',
      materi:
        'Pokok bahasan dalam perkuliahan ini terdiri dari:\n1. Pengenalan abstract data type\n2. Linked List\n3. Stack\n4. Queue\n5. Tree\n6. Graph\n7. Sorting\n8. Searching\n9. Hashing',
      mediaLunak: 'Blended: LMS - Brone Universitas Brawijaya,\nSinkron: Google Meet/Zoom Meeting\nAlat Bantu: Flowgorithm, IDE (Java: Netbeans/Eclipse, C++: DevCpp/CodeBlock)',
      mediaKeras: 'LCD/ Projector/ HDMI-to-VGA cable/Laptop, Referensi Wajib',
      pengalamanBelajar: 'Kuliah Tatap Muka\nCase-based Learning\nPraktikum',
      timDosen: ['', ''],
      prasyarat: '1. Pemrograman Dasar (COM60014)'
    },
    pustaka: [
      { id: 'p1', jenis: 'utama', teks: 'Michael T. Goodrich, Roberto Tamassia, Michael H. Goldwasser, “Data Structures and Algorithms Using Java 6 edition” Wiley, USA, 2014' },
      { id: 'p2', jenis: 'utama', teks: 'Object-Oriented Software Engineering Using UML, Patterns, and Java™' },
      { id: 'p3', jenis: 'utama', teks: 'Mark Allen Weiss, “Data Structures & Problem Solving Using Java 4th Edition”, Pearson, 2010' },
      { id: 'p4', jenis: 'pendukung', teks: 'Daniel Liang, “Introduction to Java Programming and Data Structures, 12E”, Pearson, 2020' }
    ],
    cpl: [
      {
        id: 'c1', kode: 'CPL005',
        teks: 'Lulusan menguasai konsep dan prinsip dasar bidang ilmu komputer meliputi algoritma dan pemrograman, matematika dan statistika, pengembangan perangkat lunak dan basis data, perangkat keras dan jaringan komputer.'
      }
    ],
    cpmk: [
      { id: 'm1', kode: 'CPMK-051', teks: 'Mampu mengimplementasikan Struktur data ke dalam bahasa pemrograman', cpl: ['c1'] },
      { id: 'm2', kode: 'CPMK-052', teks: 'Mampu mengimplementasikan algoritma sorting dan searching ke dalam bahasa pemrograman', cpl: ['c1'] }
    ],
    subCpmk: [
      { id: 's1', kode: 'Sub-CPMK-05101', teks: 'Mampu memahami konsep dasar abstract data type (ADT) pada struktur data', cpmk: 'm1' },
      { id: 's2', kode: 'Sub-CPMK-05102', teks: 'Mampu menerapkan struktur data linier dan non linier untuk menyelesaikan permasalahan komputasi', cpmk: 'm1' },
      { id: 's3', kode: 'Sub-CPMK-05201', teks: 'Mampu memahami dan menerapkan algoritma sorting', cpmk: 'm2' },
      { id: 's4', kode: 'Sub-CPMK-05202', teks: 'Mampu memahami dan menerapkan algoritma searching', cpmk: 'm2' }
    ],
    asesmen: [
      { id: 'a1', kode: 'CB-1', siakad: 'Hasil Proyek', obe: 'Studi Kasus', bobot: 30, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik ADT & Struktur Data' },
      { id: 'a2', kode: 'CB-2', siakad: 'Hasil Proyek', obe: 'Studi Kasus', bobot: 10, porsi: { s3: 0.5, s4: 0.5 }, keterangan: 'Topik Searching dan Sorting' },
      { id: 'a3', kode: 'CB-11 (praktikum)', siakad: 'Hasil Proyek', obe: 'Studi Kasus', bobot: 10, porsi: all, keterangan: 'Seluruh topik' },
      { id: 'a4', kode: 'Kuis-1', siakad: 'Kuis', obe: 'Kuis', bobot: 6, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik ADT & Struktur Data' },
      { id: 'a5', kode: 'Kuis-2', siakad: 'Kuis', obe: 'Kuis', bobot: 4, porsi: { s3: 0.5, s4: 0.5 }, keterangan: 'Topik Searching dan Sorting' },
      { id: 'a6', kode: 'UTS-1', siakad: 'UTS', obe: 'UTS', bobot: 10, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik ADT & Struktur Data' },
      { id: 'a7', kode: 'UTS-2 (praktikum)', siakad: 'UTS', obe: 'UTS', bobot: 10, porsi: { s1: 0.5, s2: 0.5 }, keterangan: 'Topik ADT & Struktur Data' },
      { id: 'a8', kode: 'UAS-1', siakad: 'UAS', obe: 'UAS', bobot: 10, porsi: all, keterangan: 'Seluruh topik' },
      { id: 'a9', kode: 'UAS-2 (praktikum)', siakad: 'UAS', obe: 'UAS', bobot: 10, porsi: all, keterangan: 'Seluruh topik' }
    ],
    pertemuan: ROWS.map(([pekan, jenis, subCpmk, indikator, kriteria, bentuk, metode, waktu, materi, bobot], i) => ({
      id: 'w' + (i + 1), pekan, jenis, subCpmk, indikator, kriteria, bentuk, metode, waktu, materi, pustaka: [], bobot
    })),
    lembarKerja: [
      lk(1, 'Linked List', 'a1', ['s1', 's2'], tugas('double linked list dan/atau circular linked list.'), 'ADT double dan circular linked list', 'Doubly Linked List dan Circular Linked List', 3),
      lk(2, 'Stack dan Queue', 'a1', ['s1', 's2'], tugas('stack dan queue, baik dalam sebuah kasus atau dua kasus yang berbeda.\nMisalnya penerapan konsep ADT Queue pada priority Queue dan Penerapan Stack pada kasus tertentu'), 'ADT stack dan queue', 'Stack dan Queue', 5),
      lk(3, 'Tree, Binary Tree, dan AVL Tree', 'a1', ['s1', 's2'], tugas('Tree, Binary Tree, dan AVL Tree baik dalam sebuah kasus atau beberapa kasus yang berbeda'), 'ADT Tree, Binary Tree, dan AVL Tree', 'Tree, Binary Tree, dan AVL Tree', 10),
      lk(4, 'Searching dan Sorting', 'a2', ['s1', 's3', 's4'], tugas('Searching dan sorting'), 'searching dan sorting', 'Searching dan Sorting', 13)
    ]
  });
}
