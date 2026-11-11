// Tooltip instan untuk elemen ber-`data-tip`, tanpa jeda seperti atribut `title`. Satu elemen dipakai bersama per
// dialog dan ditempel di dalamnya, karena <dialog> modal menutupi apa pun yang berada di luarnya.
export function tips(node) {
  const tip = document.createElement('div');
  tip.setAttribute('role', 'tooltip');
  tip.style.cssText =
    'position:fixed;z-index:1001;display:none;max-width:280px;padding:4px 8px;border-radius:6px;background:#1f2633;color:#fff;font:500 12px/1.3 var(--ui-font,system-ui,sans-serif);pointer-events:none;box-shadow:0 4px 12px rgb(0 0 0 / 0.25)';
  node.appendChild(tip);

  const hide = () => (tip.style.display = 'none');
  function show(el) {
    tip.textContent = el.dataset.tip;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(4, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 4))}px`;
    tip.style.top = `${r.bottom + t.height + 8 > innerHeight ? r.top - t.height - 6 : r.bottom + 6}px`;
  }
  const over = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el);
    else hide();
  };
  const focus = (e) => {
    if (e.target.matches?.('[data-tip]:focus-visible')) show(e.target);
  };

  node.addEventListener('pointerover', over);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('pointerdown', hide);
  node.addEventListener('focusin', focus);
  node.addEventListener('focusout', hide);
  node.addEventListener('scroll', hide, true);
  return {
    destroy() {
      tip.remove();
    }
  };
}
