// Tiny toast utility — used in Phase 1 to honestly flag tools/actions
// that are not implemented yet, instead of silently doing nothing.
let hideTimer = null;

export function toast(message, ms = 1600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  // force reflow so the transition retriggers on rapid successive calls
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 180);
  }, ms);
}
