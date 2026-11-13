// `use:dismiss` pada <dialog> modal: klik di luar kotak dialog (di latar gelapnya) menutup dialog, sama seperti Esc.
// Klik dihitung hanya bila ditekan dan dilepas di luar, jadi menyeret seleksi teks keluar dari dialog tidak menutupnya.
// Latar milik dialog bertumpuk (mis. Hak akses di atas Pustaka) hanya menutup dialog teratas.
// `use:dismiss={fn}`: panggil fn sebagai ganti dialog.close(), untuk dialog yang perlu menanyakan atau memilih "batal" dulu.
export function dismiss(dialog, onDismiss) {
  let handler = onDismiss;
  const outside = (e) => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let armed = false;
  const down = (e) => (armed = e.button === 0 && outside(e));
  const click = (e) => {
    if (armed && outside(e) && dialog.open) {
      if (typeof handler === 'function') handler();
      else dialog.close();
    }
    armed = false;
  };
  dialog.addEventListener('pointerdown', down);
  dialog.addEventListener('click', click);
  return {
    update(fn) {
      handler = fn;
    },
    destroy() {
      dialog.removeEventListener('pointerdown', down);
      dialog.removeEventListener('click', click);
    }
  };
}
