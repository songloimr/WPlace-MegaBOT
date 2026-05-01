function ensureToastContainer() {
    let el = document.getElementById('app-toast-container');
    if (!el) {
        el = document.createElement('div');
        el.id = 'app-toast-container';
        document.body.appendChild(el);
    }
    return el;
}
function showToast(message, variant = 'error', durationMs = 3000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'app-toast ' + variant;
    const msg = document.createElement('div');
    msg.className = 'app-toast-message';
    msg.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-toast-close';
    btn.textContent = '\u00D7';
    btn.addEventListener('click', () => hideToast(toast));
    toast.appendChild(msg);
    toast.appendChild(btn);
    container.appendChild(toast);
    const t = setTimeout(() => hideToast(toast), durationMs);
    toast._timer = t;
}
function hideToast(toast) {
    if (!toast || toast.classList.contains('hide')) return;
    if (toast._timer) clearTimeout(toast._timer);
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
}
