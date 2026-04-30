const i18nDefaultLang = 'en';
let i18nLang = i18nDefaultLang;
let i18nStrings = {};
const LANGS = [
    { value: 'en', label: 'English' },
    { value: 'vi', label: 'Tiếng Việt' }
];
function getSavedLang() { try { return localStorage.getItem('lang') || i18nDefaultLang; } catch { return i18nDefaultLang; } }
function saveLang(lang) { try { localStorage.setItem('lang', lang); } catch { } }
async function fetchOk(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', ...options });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
}
async function fetchJson(url, options = {}) {
    const res = await fetchOk(url, options);
    return res.json();
}
async function loadI18n(lang) {
    try {
        i18nStrings = await fetchJson('/i18n/' + encodeURIComponent(lang) + '.json');
    } catch {
        i18nStrings = {};
    }
}
function t(key, vars) {
    const parts = String(key || '').split('.');
    let cur = i18nStrings;
    for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k]; else { cur = null; break; }
    }
    let s = (typeof cur === 'string') ? cur : String(key || '');
    if (vars && typeof s === 'string') {
        s = s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
    }
    return s;
}
function applyTranslations() {
    document.documentElement.lang = i18nLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });

    const p = document.getElementById('pixel-power');
    if (p) {
        const count = Number(p.getAttribute('data-count') || '0');
        const max = Number(p.getAttribute('data-max') || '0');
        p.textContent = t('pixel.powerLabel', { count, max });
    }
    const rp = document.getElementById('ready-pixel');
    if (rp) {
        const count = Number(rp.getAttribute('data-count') || '0');
        const max = Number(rp.getAttribute('data-max') || '0');
        rp.textContent = t('pixel.powerLabel', { count, max });
    }
    layoutLangSwitch();
}
async function setLanguage(lang) {
    i18nLang = lang || i18nDefaultLang;
    saveLang(i18nLang);
    await loadI18n(i18nLang);
    applyTranslations();
    refreshLangDropdown();
    try { if (typeof loadAccounts === 'function') { await loadAccounts(); } } catch { }
}
async function initI18n() {
    const initial = getSavedLang();
    await setLanguage(initial);
    const sel = document.getElementById('lang-select');
    if (sel) {
        sel.value = i18nLang;
        sel.addEventListener('change', async () => { await setLanguage(sel.value); });
    }
}

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

function getLangLabel(code) { const f = LANGS.find(x => x.value === code); return f ? f.label : code; }
function refreshLangDropdown() {
    const cur = document.getElementById('lang-current');
    if (cur) cur.textContent = getLangLabel(i18nLang);
    document.querySelectorAll('#lang-menu .lang-item').forEach(btn => {
        const v = btn.getAttribute('data-value');
        btn.setAttribute('aria-selected', String(v === i18nLang));
    });
    const sel = document.getElementById('lang-select');
    if (sel) sel.value = i18nLang;
}
function ensureLangSwitch() {
    let el = document.getElementById('lang-switch');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lang-switch';
        const wrap = document.createElement('div');
        wrap.className = 'lang-dropdown';
        wrap.innerHTML = '<button id="lang-button" class="lang-button" type="button" aria-haspopup="listbox" aria-expanded="false"><span id="lang-current"></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></button><div id="lang-menu" class="lang-menu" role="listbox"></div><select id="lang-select" hidden></select>';
        el.appendChild(wrap);
        document.body.appendChild(el);
        const menu = wrap.querySelector('#lang-menu');
        const select = wrap.querySelector('#lang-select');
        LANGS.forEach(l => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'lang-item';
            item.setAttribute('role', 'option');
            item.setAttribute('data-value', l.value);
            const text = document.createElement('span');
            text.textContent = l.label;
            item.appendChild(text);
            menu.appendChild(item);
            const opt = document.createElement('option');
            opt.value = l.value; opt.textContent = l.label; select.appendChild(opt);
        });
    }
    return el;
}
function bindLangDropdownEvents() {
    const btn = document.getElementById('lang-button');
    const menu = document.getElementById('lang-menu');
    if (!btn || !menu) return;
    function open() { menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    function toggle() { if (menu.classList.contains('open')) close(); else open(); }
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener('click', () => { if (menu.classList.contains('open')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    menu.querySelectorAll('.lang-item').forEach(elm => {
        elm.addEventListener('click', async () => {
            const v = elm.getAttribute('data-value');
            await setLanguage(v);
            close();
        });
    });
}
function layoutLangSwitch() {
    const ls = document.getElementById('lang-switch');
    const sidebarEl = document.getElementById('sidebar');
    const formEl = document.getElementById('form');
    if (!ls || !sidebarEl || !formEl) return;
    const sidebarRect = sidebarEl.getBoundingClientRect();
    const formRect = formEl.getBoundingClientRect();
    const topY = Math.min(sidebarRect.top, formRect.top) + 4;
    const xLeft = sidebarRect.right + 12;
    const xRight = formRect.left - 12;
    const center = (xLeft + xRight) / 2;
    const width = Math.min(220, Math.max(140, xRight - xLeft));
    ls.style.width = String(width) + 'px';
    ls.style.top = String(topY) + 'px';
    ls.style.left = String(center - (width / 2)) + 'px';
}
window.addEventListener('resize', layoutLangSwitch);
window.addEventListener('scroll', layoutLangSwitch, { passive: true });

ensureLangSwitch(); bindLangDropdownEvents(); initI18n(); layoutLangSwitch();
