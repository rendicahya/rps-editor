<script>
  // Ikon garis untuk tombol ringkas. Warnanya mengikuti teks.
  const PATHS = {
    chevron: ['m9 6 6 6-6 6'],
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
    settings: ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z', 'm9 12 2 2 4-4'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
    upload: ['M12 16V5', 'M7 10l5-5 5 5', 'M5 20h14'],
    users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M18 14.5c2 .7 3.2 2.7 3.5 5.5'],
    x: ['M6 6l12 12', 'M18 6 6 18']
  };
  let { name, size = 16 } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
