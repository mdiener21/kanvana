let toastTimer = null;

export function showToast(msg) {
  let t = document.getElementById('tt-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'tt-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
