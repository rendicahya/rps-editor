<script>
  // Ikon garis untuk tombol ringkas. Warnanya mengikuti teks.
  const PATHS = {
    chevron: ['m9 6 6 6-6 6'],
    cloud: ['M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z'],
    laptop: ['M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V15H5z', 'M2.5 18.5h19'],
    copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
    filePlus: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M12 11v6', 'M9 14h6'],
    folder: ['M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z'],
    folderPlus: ['M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z', 'M12 11v6', 'M9 14h6'],
    gauge: ['M4 18a9 9 0 1 1 16 0', 'm12 15 4-5'],
    history: ['M4 12a8 8 0 1 0 2.5-5.8L4 8.5', 'M4 4v4.5h4.5', 'M12 8v4.5l3 2'],
    import: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    logout: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h9'],
    move: ['M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z', 'M8 14h8', 'm13 11 3 3-3 3'],
    pencil: ['M4 20h4L19 9l-4-4L4 16z', 'm13 7 4 4'],
    plus: ['M12 5v14', 'M5 12h14'],
    refresh: ['M20 11a8 8 0 0 0-14-4.5L4 8.5', 'M4 4v4.5h4.5', 'M4 13a8 8 0 0 0 14 4.5l2-2', 'M20 20v-4.5h-4.5'],
    restore: ['M4 9h11a5 5 0 0 1 0 10H9', 'M8 5 4 9l4 4'],
    sort: ['M7 4v16', 'm3 8 4-4 4 4', 'M17 20V4', 'm13 16 4 4 4-4'],
    settings: ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z', 'm9 12 2 2 4-4'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
    upload: ['M12 16V5', 'M7 10l5-5 5 5', 'M5 20h14'],
    users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M18 14.5c2 .7 3.2 2.7 3.5 5.5'],
    x: ['M6 6l12 12', 'M18 6 6 18'],
    compare: ['M4 4h6v16H4z', 'M14 4h6v16h-6z', 'M6.5 9h1', 'M16.5 9h1', 'M6.5 13h1', 'M16 13h2'],
    book: ['M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z', 'M4 20a2 2 0 0 0 2 2h13v-4', 'M8 7h7'],
    alert: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17v.5'],
    grid: ['M4 4h16v16H4z', 'M4 9.5h16', 'M4 15h16', 'M9.5 4v16', 'M15 4v16'],
    comment: ['M4 5h16v11H10l-5 4v-4H4z', 'M8 9.5h8', 'M8 12.5h5'],
    check: ['m5 12.5 4.5 4.5L19 7.5'],
    reply: ['M10 8 5 12.5l5 4.5', 'M5 12.5h9a5 5 0 0 1 5 5V19'],
    // Untuk menu klik kanan.
    save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
    download: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
    open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
    cut: ['M9 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M8.5 8.5 20 18', 'M8.5 15.5 20 6'],
    paste: ['M8 4.5H6V21h12V4.5h-2', 'M9 3h6v3H9z'],
    selectAll: ['M4 8V4h4', 'M16 4h4v4', 'M20 16v4h-4', 'M8 20H4v-4', 'M9 9h6v6H9z'],
    bold: ['M7 4h6a4 4 0 0 1 0 8H7z', 'M7 12h7a4 4 0 0 1 0 8H7z'],
    italic: ['M10 4h8', 'M6 20h8', 'M15 4 9 20'],
    underline: ['M7 4v7a5 5 0 0 0 10 0V4', 'M5 20h14'],
    arrowUp: ['M12 19V5', 'm6 11 6-6 6 6'],
    arrowDown: ['M12 5v14', 'm6 13 6 6 6-6'],
    arrowLeft: ['M19 12H5', 'm11 6-6 6 6 6'],
    arrowRight: ['M5 12h14', 'm13 6 6 6-6 6'],
    addAbove: ['M4 13h16v7H4z', 'M12 3v7', 'M8.5 6.5h7'],
    addBelow: ['M4 4h16v7H4z', 'M12 14v7', 'M8.5 17.5h7'],
    addLeft: ['M13 4h7v16h-7z', 'M3 12h7', 'M6.5 8.5v7'],
    addRight: ['M4 4h7v16H4z', 'M14 12h7', 'M17.5 8.5v7'],
    flow: ['M6 3v8a5 5 0 0 0 5 5h8', 'm16 13 3 3-3 3'],
    numbered: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 4.5 5.5 4v5', 'M3.8 14.3a1.6 1.6 0 1 1 2.6 1.3L3.8 19.5h3'],
    terminator: ['M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z'],
    process: ['M4 7h16v10H4z'],
    decision: ['M12 3l9 9-9 9-9-9z']
  };
  let { name, size = 16 } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
