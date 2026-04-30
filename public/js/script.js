/* Render scheduling — RAF-batched */
let _renderScheduled = false;
function scheduleRender() {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
        _renderScheduled = false;
        render();
    });
}
let _overlayScheduled = false;
function scheduleOverlayDraw() {
    if (_overlayScheduled) return;
    _overlayScheduled = true;
    requestAnimationFrame(() => {
        _overlayScheduled = false;
        drawSelectionOverlay();
    });
}

const areaInput = document.getElementById('area-code');
const noInput = document.getElementById('no');
const openFavsBtn = document.getElementById('btn-open-favorites');
const favStarBtn = document.getElementById('btn-favorite-star');
const favoritesModal = document.getElementById('favorites-modal');
const favoritesClose = document.getElementById('favorites-close');
const favoritesListEl = document.getElementById('favorites-list');
const saveFavModal = document.getElementById('save-fav-modal');
const saveFavClose = document.getElementById('save-fav-close');
const favNameInput = document.getElementById('fav-name-input');
const favSaveBtn = document.getElementById('fav-save-btn');

function currentLocation() {
    try { return JSON.parse(localStorage.getItem('lastFetch') || 'null'); } catch { return null; }
}
function sameLocation(a, b) { return a && b && a.mode === b.mode && JSON.stringify(a.coords) === JSON.stringify(b.coords); }
function isCurrentLocationSaved() {
    const cur = currentLocation();
    if (!cur) return false;
    return getFavorites().some(f => sameLocation(f, cur));
}
function updateFavStar() { if (!favStarBtn) return; favStarBtn.classList.toggle('saved', isCurrentLocationSaved()); }
function renderFavoritesList() {
    if (!favoritesListEl) return;
    favoritesListEl.innerHTML = '';
    const favs = getFavorites();
    for (let i = 0; i < favs.length; i++) {
        const f = favs[i];
        const row = document.createElement('div'); row.className = 'favorite-item';
        const span = document.createElement('span'); span.textContent = f && f.name ? f.name : (f && f.mode === 'single' ? `${f.coords[0].x}, ${f.coords[0].y}` : '');
        const loadBtn = document.createElement('button'); loadBtn.type = 'button'; loadBtn.className = 'app-btn'; loadBtn.textContent = t('favorites.load') || 'Yükle'; loadBtn.dataset.index = String(i); loadBtn.dataset.action = 'load';
        const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'app-btn'; delBtn.textContent = t('buttons.delete') || 'Sil'; delBtn.dataset.index = String(i); delBtn.dataset.action = 'delete';
        row.appendChild(span); row.appendChild(loadBtn); row.appendChild(delBtn); favoritesListEl.appendChild(row);
    }
}

if (openFavsBtn) openFavsBtn.addEventListener('click', async () => {
    await refreshFavorites();
    renderFavoritesList();
    if (favoritesModal) favoritesModal.hidden = false;
    document.body.classList.add('no-scroll');
});
if (favoritesClose) favoritesClose.addEventListener('click', () => {
    if (favoritesModal) favoritesModal.hidden = true;
    document.body.classList.remove('no-scroll');
});
if (favoritesModal) favoritesModal.addEventListener('click', (e) => {
    if (e.target === favoritesModal) { favoritesModal.hidden = true; document.body.classList.remove('no-scroll'); }
});
if (favoritesListEl) favoritesListEl.addEventListener('click', async (e) => {
    const target = e.target;
    if (!target || String(target.tagName).toLowerCase() !== 'button') return;
    const idx = Number(target.dataset.index);
    const favs = getFavorites();
    const fav = favs && favs[idx];
    if (!fav) return;
    const action = target.dataset.action || 'load';
    if (action === 'delete') {
        await removeFavorite({ mode: fav.mode, coords: fav.coords });
        renderFavoritesList();
        updateFavStar();
        return;
    }
    if (action === 'load') {
        if (fav.mode === 'single') {
            if (Array.isArray(fav.coords) && fav.coords[0]) {
                loadImage(fav.coords[0].x, fav.coords[0].y);
                try { localStorage.setItem('lastFetch', JSON.stringify({ mode: 'single', coords: [{ x: fav.coords[0].x, y: fav.coords[0].y }] })); } catch { }
            }
        }
        if (favoritesModal) favoritesModal.hidden = true;
        document.body.classList.remove('no-scroll');
        updateFavStar();
    }
});

if (favStarBtn) favStarBtn.addEventListener('click', async () => {
    const cur = currentLocation();
    if (!cur) return;
    if (isCurrentLocationSaved()) {
        await removeFavorite(cur);
        updateFavStar();
        return;
    }
    if (favNameInput && saveFavModal) {
        favNameInput.value = '';
        saveFavModal.hidden = false;
        try { document.body.classList.add('no-scroll'); } catch { }
    }
});
if (saveFavClose) saveFavClose.addEventListener('click', () => {
    if (saveFavModal) saveFavModal.hidden = true;
    try { document.body.classList.remove('no-scroll'); } catch { }
});
if (saveFavModal) saveFavModal.addEventListener('click', (e) => {
    if (e.target === saveFavModal) { saveFavModal.hidden = true; document.body.classList.remove('no-scroll'); }
});
if (favSaveBtn) favSaveBtn.addEventListener('click', async () => {
    const name = (favNameInput && favNameInput.value) ? favNameInput.value.trim() : '';
    const cur = currentLocation();
    if (!cur) { if (saveFavModal) saveFavModal.hidden = true; document.body.classList.remove('no-scroll'); return; }
    await addFavorite({ ...cur, name });
    if (saveFavModal) saveFavModal.hidden = true;
    document.body.classList.remove('no-scroll');
    updateFavStar();
});
refreshFavorites().then(() => { try { updateFavStar(); } catch { } });

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const sign = document.getElementById('sign');
const pixelHoverEl = document.getElementById('pixel-hover');
const colorPaletteEl = document.getElementById('color-palette');
const paletteModeEl = document.getElementById('palette-mode');
const paletteModeToggle = document.getElementById('palette-mode-toggle');
const paletteModeLabelLeft = document.getElementById('palette-mode-label-left');
const paletteModeLabelRight = document.getElementById('palette-mode-label-right');
const pixelSelectedList = document.getElementById('pixel-selected-list');
const selectionOverlay = document.getElementById('selection-overlay');
const selectionCtx = selectionOverlay ? selectionOverlay.getContext('2d', { willReadFrequently: true }) : null;
function resizeSelectionOverlay() {
    try {
        if (!selectionOverlay) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const rect = document.body.getBoundingClientRect();
        selectionOverlay.width = Math.floor(rect.width * dpr);
        selectionOverlay.height = Math.floor(rect.height * dpr);
        selectionOverlay.style.width = rect.width + 'px';
        selectionOverlay.style.height = rect.height + 'px';
    } catch { }
}
resizeSelectionOverlay();
window.addEventListener('resize', resizeSelectionOverlay);
// Background refresh and recent paint cache
const BACKGROUND_REFRESH_MS = 30 * 1000;

const RECENT_CACHE_MAX = 10000;
let isPainting = false;
const recentPaintCache = new Map();
let refreshTimer = null;

function trimRecentPaint() {
    while (recentPaintCache.size > RECENT_CACHE_MAX) {
        const oldest = recentPaintCache.keys().next().value;
        if (oldest == null) break;
        recentPaintCache.delete(oldest);
    }
}
function addRecentPaint(x, y, colorId) {
    recentPaintCache.set(String(x) + ',' + String(y), { x, y, colorId, time: Date.now() });
    trimRecentPaint();
}
function addRecentPaintBatch(g, coordsSlice, colorsSlice, tileW, tileH, base) {
    const colOffset = g.area - Number(base.x || 0);
    const rowOffset = g.no - Number(base.y || 0);
    const baseWx = colOffset * tileW;
    const baseWy = rowOffset * tileH;
    for (let i = 0; i < colorsSlice.length; i++) {
        const wx = baseWx + coordsSlice[i * 2];
        const wy = baseWy + coordsSlice[i * 2 + 1];
        addRecentPaint(wx, wy, colorsSlice[i]);
    }
}
function scheduleBackgroundRefresh(delay = BACKGROUND_REFRESH_MS) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
        if (isPainting) {
            scheduleBackgroundRefresh(1000);
            return;
        }
        if (recentPaintCache.size > 0) {
            recentPaintCache.clear();
            scheduleOverlayDraw();
            console.log('Pixel cache cleared');
        }
        const ok = await reloadCurrentBackground();
        if (ok) {
            scheduleOverlayDraw();
            console.log('Background refreshed');
        }
        scheduleBackgroundRefresh();
    }, delay);
}
scheduleBackgroundRefresh();
const signLayer = document.getElementById('sign-layer');
const signOutline = document.getElementById('sign-outline');
const signFileInput = document.getElementById('sign-file');
const uploadBtn = document.getElementById('btn-upload-sign');
const mosaicCanvas = document.createElement('canvas');
const sidebar = document.getElementById('sidebar');
const thumbList = document.getElementById('thumb-list');
const counter = document.getElementById('counter');
const accountsBtn = document.getElementById('btn-accounts');
const pixelPowerEl = document.getElementById('pixel-power');
const soundToggleBtn = document.getElementById('sound-toggle');
const soundVolumeEl = document.getElementById('sound-volume');
const soundVolumeValue = document.getElementById('sound-volume-value');


// Movement controls (pixel-by-pixel image movement)
const movementBtn = document.getElementById('btn-movement');
const movementPopup = document.getElementById('movement-popup');
const moveUpBtn = document.getElementById('move-up');
const moveDownBtn = document.getElementById('move-down');
const moveLeftBtn = document.getElementById('move-left');
const moveRightBtn = document.getElementById('move-right');





if (movementBtn && movementPopup) {
    function clearKbdPressVisuals() {
        setKbdVisual('up', false);
        setKbdVisual('down', false);
        setKbdVisual('left', false);
        setKbdVisual('right', false);
    }
    movementBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (movementBtn.disabled) return;
        movementPopup.hidden = !movementPopup.hidden;
        if (movementPopup.hidden) clearKbdPressVisuals();
    });
    // Removed auto-close on outside click to prevent flicker when focusing an image.
    function setKbdVisual(dir, on) {
        try {
            const map = { up: moveUpBtn, down: moveDownBtn, left: moveLeftBtn, right: moveRightBtn };
            const el = map[dir]; if (!el) return;
            if (on) el.classList.add('kbd-press'); else el.classList.remove('kbd-press');
        } catch { }
    }
    window.addEventListener('keydown', (e) => {
        if (!isMovementOpen()) return;
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
        let handled = false;
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowUp') { moveSelectedBy(0, -1, step); setKbdVisual('up', true); handled = true; }
        else if (e.key === 'ArrowDown') { moveSelectedBy(0, 1, step); setKbdVisual('down', true); handled = true; }
        else if (e.key === 'ArrowLeft') { moveSelectedBy(-1, 0, step); setKbdVisual('left', true); handled = true; }
        else if (e.key === 'ArrowRight') { moveSelectedBy(1, 0, step); setKbdVisual('right', true); handled = true; }
        else if (e.key === 'Escape') { movementPopup.hidden = true; handled = true; }
        if (handled) { try { e.preventDefault(); e.stopPropagation(); } catch { } }
    });
    window.addEventListener('keyup', (e) => {
        if (!isMovementOpen()) return;
        if (e.key === 'ArrowUp') setKbdVisual('up', false);
        else if (e.key === 'ArrowDown') setKbdVisual('down', false);
        else if (e.key === 'ArrowLeft') setKbdVisual('left', false);
        else if (e.key === 'ArrowRight') setKbdVisual('right', false);
    });
}
setupMoveHold(moveUpBtn, 0, -1);
setupMoveHold(moveDownBtn, 0, 1);
setupMoveHold(moveLeftBtn, -1, 0);
setupMoveHold(moveRightBtn, 1, 0);
updateMovementButtonEnabled();

// Pixel fullness notifier
const FULLNESS_NOTIFY_PERIOD_MS = 30 * 1000;
let lastFullnessNotifyAt = 0;
function maybeNotifyFullnessNow() {
    const now = Date.now();
    if (now - lastFullnessNotifyAt >= FULLNESS_NOTIFY_PERIOD_MS - 50) {
        lastFullnessNotifyAt = now;
        playNotifySound();
    }
}
function checkFullnessNotify() {
    try {
        const c = Number(pixelPowerEl && pixelPowerEl.getAttribute('data-count') || '0');
        const m = Number(pixelPowerEl && pixelPowerEl.getAttribute('data-max') || '0');
        const ratio = m > 0 ? (c / m) : 0;
        if (ratio >= 0.90) maybeNotifyFullnessNow();
    } catch { }
}
try { setInterval(() => { checkFullnessNotify(); }, FULLNESS_NOTIFY_PERIOD_MS); } catch { }
const accountsModal = document.getElementById('accounts-modal');
const accountsClose = document.getElementById('accounts-close');
const accountsBody = document.querySelector('#accounts-modal .modal-body');
const tabAccounts = document.getElementById('tab-accounts');
const accountsSection = document.getElementById('accounts-section');
const accountFormSection = document.getElementById('account-form-section');
const shopViewSection = document.getElementById('shop-view-section');

const accountsTbody = document.getElementById('accounts-tbody');
const shopDropletsInfo = document.getElementById('shop-droplets-info');
// Shop controls
const shopMaxDecBtn = document.getElementById('shop-max-dec');
const shopMaxIncBtn = document.getElementById('shop-max-inc');
const shopMaxMaxBtn = document.getElementById('shop-max-max');
const shopMaxQtyEl = document.getElementById('shop-max-qty');
const shopMaxPriceEl = document.getElementById('shop-max-price');
const shopRecDecBtn = document.getElementById('shop-rec-dec');
const shopRecIncBtn = document.getElementById('shop-rec-inc');
const shopRecMaxBtn = document.getElementById('shop-rec-max');
const shopRecQtyEl = document.getElementById('shop-rec-qty');
const shopRecPriceEl = document.getElementById('shop-rec-price');
const shopMaxAutoBtn = document.getElementById('shop-max-auto');
const shopRecAutoBtn = document.getElementById('shop-rec-auto');
const shopPremiumPaletteWrap = document.getElementById('shop-premium-palette');
const shopPremiumOwnedWrap = document.getElementById('shop-premium-owned');
const shopPremiumBuyBtn = document.getElementById('shop-premium-buy');
let shopCurrentAccount = null;
let shopSelectedPremiumColorId = null;
let shopExtraColorsBitmap = 0;
const addAccountBtn = document.getElementById('btn-account-add');
const checkAllBtn = document.getElementById('btn-check-all');
const accountNameInput = document.getElementById('account-name-input');
const accountTokenInput = document.getElementById('account-token-input');
const accountIdInput = document.getElementById('account-id-input');
const accountCancelBtn = document.getElementById('btn-account-cancel');
const accountSaveBtn = document.getElementById('btn-account-save');
const proxyInput = document.getElementById('proxy-input');
const shopBackBtn = document.getElementById('btn-shop-back');
let signDragging = false;
let resizingItem = null;
let resizeStartX = 0, resizeStartY = 0, resizeOrigW = 0, resizeOrigH = 0;
let signWorldX = 0;
let signWorldY = 0;
let signWorldOffsetX = 0;
let signWorldOffsetY = 0;
let currentSignUrl = null;
let placingNewSign = false;
let signItems = [];
let selectedIndex = -1;
let pendingZoomToSelected = false;
// When we change tiles to bring a sign into view, remember to zoom after load
let pendingZoomToItem = null;
let readyLockedItem = null;
let accountsData = [];
let readySelectedAccountIds = [];
const MAX_READY_ACCOUNTS = 12;
let autoSelecting = false;
let ACTIVE_PALETTE = null;
let paletteMode = 'premium'; // 'premium' | 'free'
try { const savedMode = localStorage.getItem('palette.mode'); if (savedMode === 'free' || savedMode === 'premium') paletteMode = savedMode; } catch { }
let readyShouldReset = false;
const HOVER_ICON_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAAAAACoWZBhAAAAAXNSR0IArs4c6QAAACpJREFUeNpj+AsEZ86ASIa/DAwMZ84ACRDzDBigMs/AARITq1oUwxBWAADaREUdDMswKwAAAABJRU5ErkJggg==';
const SELECTED_ICON_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAAAXNSR0IArs4c6QAAACVJREFUeNpj+A8FDEAAZwMRBAIBmIYLIgHcgkQDIs3E6SRsjgcABYFLtfTgakEAAAAASUVORK5CYII=';
try { if (pixelHoverEl) pixelHoverEl.src = HOVER_ICON_SRC; } catch { }

const pixelHoverFillEl = (() => {
    const im = document.createElement('img');
    im.className = 'pixel-marker';
    im.alt = 'hover-fill';
    im.hidden = true;
    try { im.style.zIndex = '1299'; } catch { }
    try { document.body.appendChild(im); } catch { }
    return im;
})();


let readyHoverPixel = { x: null, y: null };

let selectedOverrideColorId = null;

let readyGlobalMode = false;
const readyGlobalSelected = new Map();
let readyMouseDownPt = null;
let readyMouseMoved = false;
let autoSelectDeleteMode = false;
const READY_CLICK_MOVE_TOLERANCE = 4;


function isReadyOpen() {
    try {
        const rp = document.getElementById('ready-popup');
        return !!(rp && !rp.hidden);
    } catch { return false; }
}

function ensureItemImageData(item) {
    if (!item || !item.image) return null;
    if (item._imageData && item._imageData.width === item.image.naturalWidth && item._imageData.height === item.image.naturalHeight) return item._imageData;
    try {
        const off = document.createElement('canvas');
        off.width = item.image.naturalWidth; off.height = item.image.naturalHeight;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.drawImage(item.image, 0, 0);
        item._imageData = octx.getImageData(0, 0, off.width, off.height);
        return item._imageData;
    } catch { return null; }
}

function isOpaquePixel(item, sx, sy) {
    const id = ensureItemImageData(item);
    if (!id) return false;
    if (sx < 0 || sy < 0 || sx >= id.width || sy >= id.height) return false;
    const a = id.data[((id.width * sy + sx) << 2) + 3];
    return a !== 0;
}


function getItemPixelColor(item, sx, sy) {
    const id = ensureItemImageData(item);
    if (!id) return null;
    if (sx < 0 || sy < 0 || sx >= id.width || sy >= id.height) return null;
    const i = ((id.width * sy + sx) << 2);
    return { r: id.data[i], g: id.data[i + 1], b: id.data[i + 2], a: id.data[i + 3] };
}
function getBasePixelColorAtWorld(wx, wy) {
    const key = String(Math.round(wx)) + ',' + String(Math.round(wy));
    const rec = recentPaintCache.get(key);
    if (rec) {
        try {
            const rgb = getPaletteRgbById(rec.colorId);
            if (rgb && rgb.length === 3) return { r: rgb[0], g: rgb[1], b: rgb[2], a: 255 };
        } catch { }
    }
    const baseId = ensureBaseImageData();
    if (!baseId) return null;
    const x = Math.round(wx);
    const y = Math.round(wy);
    if (x < 0 || y < 0 || x >= baseId.width || y >= baseId.height) return null;
    const i = ((baseId.width * y + x) << 2);
    return { r: baseId.data[i], g: baseId.data[i + 1], b: baseId.data[i + 2], a: baseId.data[i + 3] };
}
// For overlays: ensure imageData for a neighbor overlay
function ensureOverlayImageData(ov) {
    if (!ov || !ov.image) return null;
    try {
        const w = ov.image.naturalWidth || ov.image.width;
        const h = ov.image.naturalHeight || ov.image.height;
        if (ov.imageData && ov.imageData.width === (w | 0) && ov.imageData.height === (h | 0)) return ov.imageData;
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.drawImage(ov.image, 0, 0);
        ov.imageData = octx.getImageData(0, 0, w, h);
        return ov.imageData;
    } catch { return null; }
}
// Composite color at world coords considering overlays when present
function getCompositeColorAtWorld(wx, wy) {
    const key = String(Math.round(wx)) + ',' + String(Math.round(wy));
    const rec = recentPaintCache.get(key);
    if (rec) {
        try {
            const rgb = getPaletteRgbById(rec.colorId);
            if (rgb && rgb.length === 3) return { r: rgb[0], g: rgb[1], b: rgb[2], a: 255 };
        } catch { }
    }
    if (!img) return null;
    const w = img.width | 0, h = img.height | 0;
    try {
        if (neighborOverlays && neighborOverlays.size > 0) {
            const gx = Math.floor(wx), gy = Math.floor(wy);
            for (const [k, ov] of neighborOverlays.entries()) {
                if (!ov || !ov.image) continue;
                const ox0 = (ov.col | 0) * w;
                const oy0 = (ov.row | 0) * h;
                if (gx >= ox0 && gx < ox0 + w && gy >= oy0 && gy < oy0 + h) {
                    const id = ensureOverlayImageData(ov);
                    if (!id) break;
                    const lx = gx - ox0, ly = gy - oy0;
                    const i = ((id.width * ly + lx) << 2);
                    return { r: id.data[i], g: id.data[i + 1], b: id.data[i + 2], a: id.data[i + 3] };
                }
            }
        }
    } catch { }
    return getBasePixelColorAtWorld(wx, wy);
}
function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + state.translateX + wx * state.scale, y: rect.top + state.translateY + wy * state.scale };
}

function hitOverlayAt(worldX, worldY) {
    const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
    if (!sel || !sel._overlayRects) return null;
    const r = sel._overlayRects;
    if (r.lock && worldX >= r.lock.x && worldX <= r.lock.x + r.lock.w && worldY >= r.lock.y && worldY <= r.lock.y + r.lock.h) return 'lock';
    if (r.del && worldX >= r.del.x && worldX <= r.del.x + r.del.w && worldY >= r.del.y && worldY <= r.del.y + r.del.h) return 'del';
    return null;
}
function updateCanvasCursorAt(worldX, worldY) {
    try {
        const hit = hitOverlayAt(worldX, worldY);
        if (hit) canvas.style.cursor = 'pointer'; else canvas.style.cursor = '';
    } catch { }
    // Update 3x3 grid hover state and re-render when it changes
    try {
        if (!img) {
            if (hoveredGridCell) { hoveredGridCell = null; render(); }
            return;
        }
        let next = gridCellAt(worldX, worldY);
        // Do not highlight the center cell (fetched tile)
        if (next && next.row === 0 && next.col === 0) next = null;
        // Also do not highlight cells that already have overlay
        if (next) {
            const k = String(next.col | 0) + ',' + String(next.row | 0);
            if (neighborOverlays && neighborOverlays.has(k)) next = null;
        }
        const changed = !((!hoveredGridCell && !next) || (hoveredGridCell && next && hoveredGridCell.row === next.row && hoveredGridCell.col === next.col));
        if (changed) { hoveredGridCell = next; render(); }
    } catch { }
}

function positionPixelMarker(el, item, sx, sy) {
    if (!el || !item) return;
    const wx = (item.worldX || 0) + sx;
    const wy = (item.worldY || 0) + sy;
    const p = worldToScreen(wx, wy);
    const size = Math.max(1, state.scale);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.hidden = false;
}
function positionPixelMarkerAtWorld(el, wx, wy) {
    if (!el) return;
    const p = worldToScreen(wx, wy);
    const size = Math.max(1, state.scale);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.hidden = false;
}
function drawSelectionOverlay() {
    try {
        if (!isReadyOpen()) { if (selectionCtx) selectionCtx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height); return; }
        if (!selectionOverlay || !selectionCtx) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const rect = canvas.getBoundingClientRect();
        selectionCtx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);
        selectionCtx.imageSmoothingEnabled = false;
        try {
            trimRecentPaint();
            recentPaintCache.forEach(rec => {
                const p = worldToScreen(rec.x, rec.y);
                const x = Math.floor(p.x * dpr);
                const y = Math.floor(p.y * dpr);
                const s = Math.max(1, Math.floor(state.scale * dpr));
                let rgb = null;
                try { rgb = getPaletteRgbById(rec.colorId); } catch { }
                if (rgb && rgb.length === 3) {
                    selectionCtx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
                    selectionCtx.fillRect(x, y, s, s);
                }
            });
        } catch { }
        const drawPixel = (xPx, yPx, sPx, colorId, fallbackColor) => {
            const s = Math.max(1, sPx | 0);
            const x = xPx | 0, y = yPx | 0;
            // Determine fill color by palette id
            let fillRgb = null;
            if (colorId != null && colorId !== 0) {
                try {
                    const rgb = getPaletteRgbById(colorId);
                    if (rgb && rgb.length === 3) fillRgb = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
                } catch { }
            }
            // Transparent (id 0)
            if (colorId === 0) {
                // Draw hollow box with red slash if space permits
                if (s >= 3) {
                    selectionCtx.fillStyle = 'rgba(0,0,0,0.65)';
                    selectionCtx.fillRect(x, y, s, s);
                    selectionCtx.clearRect(x + 1, y + 1, s - 2, s - 2);
                    selectionCtx.fillStyle = '#ef4444';
                    // diagonal slash
                    selectionCtx.fillRect(x + 1, y + s - 2, s - 2, 1);
                    selectionCtx.fillRect(x + 1, y + s - 3, s - 2, 1);
                } else {
                    // Minimal indicator
                    selectionCtx.fillStyle = '#ef4444';
                    selectionCtx.fillRect(x, y, s, s);
                }
                // continue to draw ring/dot for consistent indicator
            }
            // Unknown -> fallback
            if (!fillRgb && fallbackColor) {
                fillRgb = fallbackColor;
            }
            if (!fillRgb) fillRgb = '#ffffff';
            // Border for contrast
            if (s >= 2) {
                selectionCtx.fillStyle = 'rgba(0,0,0,0.65)';
                selectionCtx.fillRect(x, y, s, s);
                selectionCtx.fillStyle = fillRgb;
                selectionCtx.fillRect(x + 1, y + 1, s - 2, s - 2);
            } else {
                // 1px scale
                selectionCtx.fillStyle = fillRgb;
                selectionCtx.fillRect(x, y, s, s);
            }
            // Draw black center dot with white ring to be visible on all colors
            const cx = x + s / 2;
            const cy = y + s / 2;
            if (s >= 3) {
                const rOuter = Math.max(1, Math.floor(s / 2) - 1);
                const rInner = Math.max(1, rOuter - 4);
                try {
                    selectionCtx.beginPath();
                    selectionCtx.lineWidth = 1;
                    selectionCtx.strokeStyle = '#000000';
                    selectionCtx.arc(cx, cy, rOuter, 0, Math.PI * 2);
                    selectionCtx.stroke();
                } catch { }
                try {
                    selectionCtx.beginPath();
                    selectionCtx.fillStyle = '#ffffff';
                    selectionCtx.arc(cx, cy, rInner, 0, Math.PI * 2);
                    selectionCtx.fill();
                } catch { }
            } else {
                // Very small: approximate with black box and white center pixel
                try { selectionCtx.fillStyle = '#000000'; selectionCtx.fillRect(x, y, s, s); } catch { }
                try { const cxp = x + Math.floor(s / 2); const cyp = y + Math.floor(s / 2); selectionCtx.fillStyle = '#ffffff'; selectionCtx.fillRect(cxp, cyp, 1, 1); } catch { }
            }
        };
        // Draw global selections (world coords)
        try {
            if (readyGlobalSelected && readyGlobalSelected.size > 0) {
                readyGlobalSelected.forEach(rec => {
                    if (!rec) return;
                    const p = worldToScreen(rec.wx, rec.wy);
                    const x = Math.floor(p.x * dpr);
                    const y = Math.floor(p.y * dpr);
                    const s = Math.max(1, Math.floor(state.scale * dpr));
                    drawPixel(x, y, s, rec.colorId, '#ffffff');
                });
            }
        } catch { }
        // Draw per-image selections
        try {
            const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
            if (sel) {
                const map = getSelectedMap(sel);
                if (map && map.size > 0) {
                    map.forEach(rec => {
                        if (!rec) return;
                        const wx = (sel.worldX || 0) + rec.x;
                        const wy = (sel.worldY || 0) + rec.y;
                        const p = worldToScreen(wx, wy);
                        const x = Math.floor(p.x * dpr);
                        const y = Math.floor(p.y * dpr);
                        const s = Math.max(1, Math.floor(state.scale * dpr));
                        drawPixel(x, y, s, rec.colorId, '#22d3ee');
                    });
                }
            }
        } catch { }
    } catch { }
}
function ensureBaseImageData() {
    if (!img) return null;
    const w = img.width | 0, h = img.height | 0;
    if (baseImageData && baseImageData.width === w && baseImageData.height === h) return baseImageData;
    try {
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.drawImage(img, 0, 0);
        baseImageData = octx.getImageData(0, 0, w, h);
        return baseImageData;
    } catch { return null; }
}

function isSameColorAsBase(item, sx, sy) {
    // Compare against composite (base + overlays) so seam tiles are handled
    const itemColor = getItemPixelColor(item, sx, sy);
    if (!itemColor || itemColor.a === 0) return false;
    const wx = Math.round((item.worldX || 0) + sx);
    const wy = Math.round((item.worldY || 0) + sy);
    const baseColor = getCompositeColorAtWorld(wx, wy);
    if (!baseColor || baseColor.a === 0) return false;
    return (itemColor.r === baseColor.r) && (itemColor.g === baseColor.g) && (itemColor.b === baseColor.b);
}
function isSamePaletteIdAsBase(item, sx, sy) {
    const itemColor = getItemPixelColor(item, sx, sy);
    if (!itemColor || itemColor.a === 0) {
        return false;
    }
    const wx = Math.round((item.worldX || 0) + sx);
    const wy = Math.round((item.worldY || 0) + sy);
    const baseColor = getCompositeColorAtWorld(wx, wy);
    if (!baseColor || baseColor.a === 0) {
        return false;
    }
    const itemPaletteId = rgbToPaletteId(itemColor.r, itemColor.g, itemColor.b);
    const basePaletteId = rgbToPaletteId(baseColor.r, baseColor.g, baseColor.b);
    return itemPaletteId === basePaletteId;
}

function countPlacedPixelsForItem(item) {
    const itemId = ensureItemImageData(item);
    const baseId = ensureBaseImageData();
    if (!itemId || !baseId) return 0;
    const wx0 = Math.round(item.worldX || 0);
    const wy0 = Math.round(item.worldY || 0);
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const cache = item._placedCountCache;
    if (cache && cache.baseW === baseId.width && cache.baseH === baseId.height && cache.wx0 === wx0 && cache.wy0 === wy0 && cache.ovVer === overlayVersion && (nowMs - cache.atMs) < 1000) {
        return cache.count;
    }
    let count = 0;
    const w = itemId.width | 0, h = itemId.height | 0;
    const itemData = itemId.data;
    // Compute composite bounds (base + any unlocked neighbor overlays), capped to 3x3
    let b = null;
    try { b = getCompositeBounds(getAllowedPlacementRects()); } catch { b = { minX: 0, minY: 0, maxX: baseId.width | 0, maxY: baseId.height | 0 }; }
    for (let y = 0; y < h; y++) {
        const wy = wy0 + y;
        if (b && (wy < b.minY || wy >= b.maxY)) continue;
        for (let x = 0; x < w; x++) {
            const wx = wx0 + x;
            if (b && (wx < b.minX || wx >= b.maxX)) continue;
            const iItem = ((w * y + x) << 2);
            const a = itemData[iItem + 3];
            if (a === 0) continue;
            const col = getCompositeColorAtWorld(wx, wy);
            if (!col || col.a === 0) continue;
            if (itemData[iItem] === col.r && itemData[iItem + 1] === col.g && itemData[iItem + 2] === col.b) {
                count++;
            }
        }
    }
    item._placedCountCache = { count, wx0, wy0, baseW: baseId.width, baseH: baseId.height, ovVer: overlayVersion, atMs: nowMs };
    return count;
}

// Allowed placement rectangles: base tile + any neighbor overlays
function getAllowedPlacementRects() {
    const rects = [];
    if (img && img.width && img.height) {
        rects.push({ x0: 0, y0: 0, x1: img.width | 0, y1: img.height | 0 });
    }
    try {
        if (neighborOverlays && neighborOverlays.size > 0) {
            const w = img ? (img.width | 0) : 0;
            const h = img ? (img.height | 0) : 0;
            neighborOverlays.forEach(ov => {
                if (!ov) return;
                const col = ov.col | 0, row = ov.row | 0;
                rects.push({ x0: col * w, y0: row * h, x1: col * w + w, y1: row * h + h });
            });
        }
    } catch { }
    // Always cap to 3x3 region around base tile to match visual clipping
    try {
        const w = img ? (img.width | 0) : 0;
        const h = img ? (img.height | 0) : 0;
        const cap = { x0: -w, y0: -h, x1: 2 * w, y1: 2 * h };
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (!r) continue;
            r.x0 = Math.max(r.x0, cap.x0);
            r.y0 = Math.max(r.y0, cap.y0);
            r.x1 = Math.min(r.x1, cap.x1);
            r.y1 = Math.min(r.y1, cap.y1);
        }
    } catch { }
    return rects;
}
function getCompositeBounds(rects) {
    if (!rects || rects.length === 0) return { minX: 0, minY: 0, maxX: img ? (img.width | 0) : 0, maxY: img ? (img.height | 0) : 0 };
    let minX = rects[0].x0, minY = rects[0].y0, maxX = rects[0].x1, maxY = rects[0].y1;
    for (let i = 1; i < rects.length; i++) {
        const r = rects[i];
        if (!r) continue;
        if (r.x0 < minX) minX = r.x0;
        if (r.y0 < minY) minY = r.y0;
        if (r.x1 > maxX) maxX = r.x1;
        if (r.y1 > maxY) maxY = r.y1;
    }
    return { minX, minY, maxX, maxY };
}
function isWithinAllowedPlacement(x, y, w, h) {
    const rects = getAllowedPlacementRects();
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (!r) continue;
        if (x >= r.x0 && y >= r.y0 && (x + w) <= r.x1 && (y + h) <= r.y1) return true;
    }
    return false;
}
// Returns true if the rect overlaps allowed area by at least minPixels
function isPartiallyWithinAllowedPlacement(x, y, w, h, minPixels) {
    const rects = getAllowedPlacementRects();
    const minPx = Math.max(1, Number(minPixels || 1) | 0);
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (!r) continue;
        const ix0 = Math.max(x, r.x0);
        const iy0 = Math.max(y, r.y0);
        const ix1 = Math.min(x + w, r.x1);
        const iy1 = Math.min(y + h, r.y1);
        const iw = (ix1 - ix0) | 0;
        const ih = (iy1 - iy0) | 0;
        if (iw >= 1 && ih >= 1 && (iw * ih) >= minPx) return true;
    }
    return false;
}

function snapItemToNearest(item, targetX, targetY) {
    const baseId = ensureBaseImageData();
    const id = ensureItemImageData(item);

    if (!img) {
        return { x: Math.round(targetX || 0), y: Math.round(targetY || 0) };
    }
    const rects = getAllowedPlacementRects();
    const bounds = getCompositeBounds(rects);
    if (!id || !baseId) {
        const iw = id && id.width ? id.width : 0;
        const ih = id && id.height ? id.height : 0;
        const minXb = (bounds.minX | 0) - iw + 1;
        const minYb = (bounds.minY | 0) - ih + 1;
        const maxXb = (bounds.maxX | 0) - 1;
        const maxYb = (bounds.maxY | 0) - 1;
        const rxFallback = Math.round(Math.min(Math.max(minXb, targetX), maxXb));
        const ryFallback = Math.round(Math.min(Math.max(minYb, targetY), maxYb));
        const xOk = isPartiallyWithinAllowedPlacement(rxFallback, ryFallback, iw, ih, 1);
        if (xOk) return { x: rxFallback, y: ryFallback };
        // If clamped point not inside allowed rects, fall back to 0,0 within base
        return { x: Math.max(0, Math.min((img.width | 0) - (id && id.width ? id.width : 0), rxFallback)), y: Math.max(0, Math.min((img.height | 0) - (id && id.height ? id.height : 0), ryFallback)) };
    }
    const minXb = (bounds.minX | 0) - id.width + 1;
    const minYb = (bounds.minY | 0) - id.height + 1;
    const maxXb = (bounds.maxX | 0) - 1;
    const maxYb = (bounds.maxY | 0) - 1;
    const rx = Math.round(Math.min(Math.max(minXb, targetX), maxXb));
    const ry = Math.round(Math.min(Math.max(minYb, targetY), maxYb));
    let bestX = rx, bestY = ry, bestScore = -1;
    const radius = 2;
    const minX = Math.max(minXb, rx - radius), maxXn = Math.min(maxXb, rx + radius);
    const minY = Math.max(minYb, ry - radius), maxYn = Math.min(maxYb, ry + radius);
    const stride = Math.max(1, Math.floor(Math.min(id.width, id.height) / 64));
    for (let oy = minY; oy <= maxYn; oy++) {
        for (let ox = minX; ox <= maxXn; ox++) {
            if (!isPartiallyWithinAllowedPlacement(ox, oy, id.width, id.height, 1)) continue;
            let score = 0;
            for (let sy = 0; sy < id.height; sy += stride) {
                const by = oy + sy;
                let iItem = ((id.width * sy) << 2);
                for (let sx = 0; sx < id.width; sx += stride) {
                    const a = id.data[iItem + 3];
                    if (a !== 0) {
                        const r1 = id.data[iItem], g1 = id.data[iItem + 1], b1 = id.data[iItem + 2];
                        const bx = ox + sx;
                        const col = getCompositeColorAtWorld(bx, by);
                        if (col && col.a !== 0 && col.r === r1 && col.g === g1 && col.b === b1) score++;
                    }
                    iItem += (stride << 2);
                }
            }
            if (score > bestScore) { bestScore = score; bestX = ox; bestY = oy; }
        }
    }
    return { x: bestX, y: bestY };
}

function hideEl(el) { try { if (el) el.hidden = true; } catch { } }

function updatePixelMarkers() {
    const hideHover = !!(state.dragging || state.zooming);
    if (!isReadyOpen()) {
        hideEl(pixelHoverEl);
        try { pixelHoverFillEl.hidden = true; } catch { }
        if (pixelSelectedList) pixelSelectedList.hidden = true;
        scheduleOverlayDraw();
        return;
    }
    if (readyGlobalMode) {

        // Global selections drawn by overlay
        scheduleOverlayDraw();

        try { if (!hideHover) { pixelHoverEl.hidden = false; pixelHoverEl.src = HOVER_ICON_SRC; } else { hideEl(pixelHoverEl); } } catch { }
        try {
            if (!hideHover && selectedOverrideColorId != null && selectedOverrideColorId !== 0 && readyHoverPixel && readyHoverPixel.x != null && readyHoverPixel.y != null) {
                pixelHoverFillEl.src = getMarkerSrcForColorId(selectedOverrideColorId);
                positionPixelMarkerAtWorld(pixelHoverFillEl, readyHoverPixel.x, readyHoverPixel.y);
                pixelHoverFillEl.hidden = false;
            } else {
                pixelHoverFillEl.hidden = true;
            }
        } catch { }

        try {
            const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
            if (sel) {
                const map = getSelectedMap(sel);
                if (pixelSelectedList) pixelSelectedList.hidden = (readyGlobalSelected.size === 0) && (!map || map.size === 0);
            } else {
                if (pixelSelectedList) pixelSelectedList.hidden = readyGlobalSelected.size === 0;
            }
        } catch { }
        return;
    }
    const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
    if (!sel || !sel.image || !sel.image.complete) { hideEl(pixelHoverEl); try { pixelHoverFillEl.hidden = true; } catch { }; if (pixelSelectedList) pixelSelectedList.hidden = true; return; }
    ensureRenderedSelectedForItem(sel);
    positionSelectedMarkersForItem(sel);
    scheduleOverlayDraw();

    // Global selections drawn by overlay
    if (pixelSelectedList) {
        const perImageCount = getSelectedMap(sel).size;
        const globalCount = readyGlobalSelected ? readyGlobalSelected.size : 0;
        pixelSelectedList.hidden = (perImageCount + globalCount) === 0;
    }
    if (!hideHover && readyHoverPixel && readyHoverPixel.x != null && readyHoverPixel.y != null) {
        positionPixelMarker(pixelHoverEl, sel, readyHoverPixel.x, readyHoverPixel.y);
        try {
            if (!hideHover && selectedOverrideColorId != null && selectedOverrideColorId !== 0) {
                pixelHoverFillEl.src = getMarkerSrcForColorId(selectedOverrideColorId);
                positionPixelMarker(pixelHoverFillEl, sel, readyHoverPixel.x, readyHoverPixel.y);
                pixelHoverFillEl.hidden = false;
            } else {
                pixelHoverFillEl.hidden = true;
            }
        } catch { }
    } else {
        hideEl(pixelHoverEl);
        try { pixelHoverFillEl.hidden = true; } catch { }
    }
}

function updateReadyHoverFromEvent(e) {
    if (!isReadyOpen()) { hideEl(pixelHoverEl); return; }

    try {
        const t = e && e.target ? e.target : null;
        const overUi = !!(t && t.closest && (
            t.closest('#control-panel') ||
            t.closest('#ready-popup') ||
            t.closest('#sidebar') ||
            t.closest('#color-palette')
        ));
        if (overUi) {
            readyHoverPixel.x = null; readyHoverPixel.y = null;
            hideEl(pixelHoverEl);
            try { pixelHoverFillEl.hidden = true; } catch { }
            return;
        }
    } catch { }
    if (readyGlobalMode) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldX = (px - state.translateX) / state.scale;
        const worldY = (py - state.translateY) / state.scale;
        const wx = Math.floor(worldX);
        const wy = Math.floor(worldY);

        if (img && wx >= 0 && wy >= 0 && wx < img.width && wy < img.height) {
            readyHoverPixel.x = wx; readyHoverPixel.y = wy;
            try { pixelHoverEl.src = HOVER_ICON_SRC; positionPixelMarkerAtWorld(pixelHoverEl, wx, wy); pixelHoverEl.hidden = false; } catch { }
            try {
                if (selectedOverrideColorId != null && selectedOverrideColorId !== 0) {
                    pixelHoverFillEl.src = getMarkerSrcForColorId(selectedOverrideColorId);
                    positionPixelMarkerAtWorld(pixelHoverFillEl, wx, wy);
                    pixelHoverFillEl.hidden = false;
                } else {
                    pixelHoverFillEl.hidden = true;
                }
            } catch { }
        } else {
            readyHoverPixel.x = null; readyHoverPixel.y = null; hideEl(pixelHoverEl); try { pixelHoverFillEl.hidden = true; } catch { }
        }
        return;
    }
    const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
    if (!sel || !sel.image || !sel.image.complete) { hideEl(pixelHoverEl); return; }
    try { pixelHoverEl.src = HOVER_ICON_SRC; } catch { }
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - state.translateX) / state.scale;
    const worldY = (py - state.translateY) / state.scale;
    const lx = Math.floor(worldX - (sel.worldX || 0));
    const ly = Math.floor(worldY - (sel.worldY || 0));
    if (lx >= 0 && ly >= 0 && lx < sel.image.naturalWidth && ly < sel.image.naturalHeight && isOpaquePixel(sel, lx, ly)) {
        readyHoverPixel.x = lx; readyHoverPixel.y = ly;
        positionPixelMarker(pixelHoverEl, sel, lx, ly);
        try {
            if (selectedOverrideColorId != null && selectedOverrideColorId !== 0) {
                pixelHoverFillEl.src = getMarkerSrcForColorId(selectedOverrideColorId);
                positionPixelMarker(pixelHoverFillEl, sel, lx, ly);
                pixelHoverFillEl.hidden = false;
            } else {
                pixelHoverFillEl.hidden = true;
            }
        } catch { }
    } else {
        readyHoverPixel.x = null; readyHoverPixel.y = null; hideEl(pixelHoverEl); try { pixelHoverFillEl.hidden = true; } catch { }
    }
}


if (!ACTIVE_PALETTE) { ACTIVE_PALETTE = PALETTE.slice(); }
function setupColorPalette() {
    if (!colorPaletteEl) return;
    colorPaletteEl.innerHTML = '';

    const swT = document.createElement('div');
    swT.className = 'palette-swatch transparent selected';
    swT.title = t('palette.transparentTitle');
    swT.setAttribute('role', 'button');
    swT.addEventListener('click', () => {
        try {
            const rp = document.getElementById('ready-popup');
            const wasReadyOpen = !!(rp && !rp.hidden);
            const wasGlobal = !!readyGlobalMode;
            const hadGlobalSelections = !!(readyGlobalSelected && readyGlobalSelected.size > 0);
            selectedOverrideColorId = null;

            readyGlobalMode = false;
            // Switch back to per-image mode without generic resets
            updatePaletteSelectionUi();
            try { updateReadyButtonEnabled(); } catch { }
            try { updateReadySelectionLabel(); } catch { }
            try { updatePixelMarkers(); } catch { }
            // Special case: If Ready is open and user was in global color mode and had placed selections,
            // clear ONLY global selections and close the Ready popup
            if (wasReadyOpen && wasGlobal && hadGlobalSelections) {
                try {
                    readyGlobalSelected.forEach(rec => {
                        try { if (rec && rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); } catch { }
                        try { if (rec && rec.fillEl && rec.fillEl.parentNode) rec.fillEl.parentNode.removeChild(rec.fillEl); } catch { }
                    });
                    readyGlobalSelected.clear();
                } catch { }
                try { resetReadyNow(); } catch { }
            }
        } catch {
            selectedOverrideColorId = null;
            readyGlobalMode = false;
            updatePaletteSelectionUi();
            try { updateReadyButtonEnabled(); } catch { }
            try { updateReadySelectionLabel(); } catch { }
            try { updatePixelMarkers(); } catch { }
        }
    });
    colorPaletteEl.appendChild(swT);

    const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const el = document.createElement('div');
        el.className = 'palette-swatch';
        el.style.backgroundColor = 'rgb(' + p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2] + ')';
        setPaletteSwatchTitle(el, p);
        el.setAttribute('data-id', String(p.id));
        el.setAttribute('role', 'button');
        el.addEventListener('click', () => {
            // Block choosing a premium override color if no selected accounts can provide it or capacity is 0
            if (isPremiumColorId(p.id)) {
                const providers = getAccountsProvidingColor(p.id);
                const remain = getPremiumColorRemainingLimit(p.id);
                if (!(Array.isArray(providers) && providers.length > 0 && remain > 0)) {
                    try { showToast(t('messages.premiumColorLimitReached'), 'error', 2000); } catch { }
                    return;
                }
            }
            selectedOverrideColorId = p.id;
            try { localStorage.setItem('palette.selectedColorId', String(p.id)); } catch { }

            try {
                const rp = document.getElementById('ready-popup');
                if (rp && !rp.hidden) {
                    const hasSelectedSign = (selectedIndex >= 0 && selectedIndex < signItems.length);
                    // Enable global mode only if no image is selected; otherwise stay in per-image mode
                    readyGlobalMode = !hasSelectedSign;
                }
            } catch { }
            updatePaletteSelectionUi();
            try { updateReadyButtonEnabled(); } catch { }
            try { updateReadySelectionLabel(); } catch { }
            try { updatePixelMarkers(); } catch { }
        });
        colorPaletteEl.appendChild(el);
    }
    // Block (remove) swatch → sends color id 0 and shows no fill overlay
    const swB = document.createElement('div');
    swB.className = 'palette-swatch block';
    swB.title = 'Block';
    swB.setAttribute('role', 'button');
    swB.setAttribute('data-id', '0');
    swB.addEventListener('click', () => {
        selectedOverrideColorId = 0;

        try {
            const rp = document.getElementById('ready-popup');
            if (rp && !rp.hidden) {
                const hasSelectedSign = (selectedIndex >= 0 && selectedIndex < signItems.length);
                readyGlobalMode = !hasSelectedSign;
            }
        } catch { }
        updatePaletteSelectionUi();
        try { updateReadyButtonEnabled(); } catch { }
        try { updateReadySelectionLabel(); } catch { }
        try { updatePixelMarkers(); } catch { }
    });
    colorPaletteEl.appendChild(swB);
    updatePaletteSelectionUi();
    try { refreshPaletteTooltips(); } catch { }
}
function updateReadyButtonEnabled() {
    try {
        const btn = document.getElementById('btn-ready');
        if (!btn) return;
        btn.disabled = !(
            (selectedIndex >= 0 && selectedIndex < signItems.length) ||
            (selectedOverrideColorId != null)
        );
    } catch { }
}
function updatePaletteSelectionUi() {
    if (!colorPaletteEl) return;
    const swatches = Array.from(colorPaletteEl.querySelectorAll('.palette-swatch'));
    swatches.forEach(sw => {
        const idAttr = sw.getAttribute('data-id');
        const id = idAttr == null ? null : Number(idAttr);
        const isSelected = (idAttr == null && selectedOverrideColorId == null) || (idAttr != null && id === selectedOverrideColorId);
        sw.classList.toggle('selected', !!isSelected);
    });
}

function squaredDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2; return dr * dr + dg * dg + db * db;
}



let img = null;
let baseImageData = null;
let currentTiles = [];
let currentTileW = 0;
let currentTileH = 0;
let currentMosaicCols = 1;
let currentMosaicRows = 1;
const state = {
    scale: 1,
    minScale: 0.1,
    maxScale: 16,
    translateX: 0,
    translateY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    zooming: false
};
let zoomingTimeout = null;
// Hovered cell in the 3x3 grid relative to the fetched tile
let hoveredGridCell = null; // { row: -1|0|1, col: -1|0|1 }
// Overlay tiles fetched via lock clicks: key = "col,row" → { image, col, row, area, no }
const neighborOverlays = new Map();
let overlayVersion = 0;
// Allow dragging images beyond the 3x3 grid; outside parts stay clipped

function resizeCanvasToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
    return dpr;
}

function render() {
    if (!img) return;
    const dpr = resizeCanvasToDisplaySize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr * state.scale, 0, 0, dpr * state.scale, dpr * state.translateX, dpr * state.translateY);
    ctx.drawImage(img, 0, 0);
    // Draw neighbor overlay tiles above base image but below uploaded images
    try {
        if (img && neighborOverlays.size > 0) {
            neighborOverlays.forEach((ov) => {
                if (!ov || !ov.image || !ov.image.complete) return;
                const w = img.width | 0, h = img.height | 0;
                const x = (ov.col | 0) * w;
                const y = (ov.row | 0) * h;
                ctx.drawImage(ov.image, x, y);
            });
        }
    } catch { }
    // Clip sign images and selection UI to the 3x3 region around base tile
    const baseW = img.width | 0, baseH = img.height | 0;
    ctx.save();
    try { ctx.beginPath(); ctx.rect(-baseW, -baseH, baseW * 3, baseH * 3); ctx.clip(); } catch { }

    let dimSelectedWhileReadyOpen = false;
    try {
        const rp = document.getElementById('ready-popup');
        dimSelectedWhileReadyOpen = !!(rp && !rp.hidden);
    } catch { }
    for (let i = 0; i < signItems.length; i++) {
        const it = signItems[i];
        if (it.image && it.image.complete) {
            const wx = typeof it.worldX === 'number' ? it.worldX : 0;
            const wy = typeof it.worldY === 'number' ? it.worldY : 0;
            ctx.save();
            if (i !== selectedIndex || dimSelectedWhileReadyOpen) {
                ctx.globalAlpha = 0.70;
                ctx.filter = 'saturate(0.6)';
            } else {
                ctx.globalAlpha = 1;
                ctx.filter = 'none';
            }
            const iw = Math.max(1, it.displayWidth || it.image.naturalWidth);
            const ih = Math.max(1, it.displayHeight || it.image.naturalHeight);
            ctx.drawImage(it.image, wx, wy, iw, ih);
            ctx.restore();
        }
    }

    if (!dimSelectedWhileReadyOpen && selectedIndex >= 0 && selectedIndex < signItems.length) {
        const it = signItems[selectedIndex];
        if (it && it.image && it.image.complete) {
            const wx = (typeof it.worldX === 'number' ? it.worldX : 0);
            const wy = (typeof it.worldY === 'number' ? it.worldY : 0);
            const iwSel = Math.max(1, it.displayWidth || it.image.naturalWidth);
            const ihSel = Math.max(1, it.displayHeight || it.image.naturalHeight);
            const totalCount = (it && it.pixelCount != null) ? Number(it.pixelCount) : 0;
            let selectedCount = 0;
            try {
                const map = getSelectedMap(it);
                selectedCount = map ? map.size : 0;
            } catch { }
            const placedCount = countPlacedPixelsForItem(it);
            const label = String(placedCount) + '/' + String(totalCount) + ' PX - ' + String((totalCount > 0 ? (placedCount / totalCount * 100) : 0).toFixed(1)) + ' %';
            // Scale UI relative to image size: baseline = 100x100 → scale = 1 (capped at 5x)
            const uiScale = Math.min(5, Math.max(0.1, Math.max(iwSel, ihSel) / 100));
            const pixelSize = 0.2 * uiScale;
            const padding = Math.max(0.2 * uiScale, Math.floor((0.5 * uiScale) / state.scale));
            const offset = 1 * uiScale;
            const m = measurePixelText(label, pixelSize);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(wx + offset - padding, wy + offset - padding, m.width + padding * 2, m.height + padding * 2);
            drawPixelText(ctx, label, wx + offset, wy + offset, pixelSize, '#ffffff');
            ctx.restore();
        }
    }
    const sel = signItems[selectedIndex];
    if (sel && sel.image && sel.image.complete && !dimSelectedWhileReadyOpen) {
        const iwSel2 = Math.max(1, sel.displayWidth || sel.image.naturalWidth);
        const ihSel2 = Math.max(1, sel.displayHeight || sel.image.naturalHeight);
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2 / state.scale;
        ctx.setLineDash([6 / state.scale, 6 / state.scale]);
        ctx.strokeRect(sel.worldX || 0, sel.worldY || 0, iwSel2, ihSel2);
        ctx.restore();

        const wx0 = (sel.worldX || 0);
        const wy0 = (sel.worldY || 0);
        // Scale UI relative to image size: baseline = 100x100 → scale = 1 (capped at 5x)
        const uiScale2 = Math.min(5, Math.max(0.1, Math.max(iwSel2, ihSel2) / 100));
        const pixelSize = 0.6 * uiScale2;
        const padding = Math.max(0.3 * uiScale2, Math.floor((0.5 * uiScale2) / state.scale));
        const gap = padding * 10;
        const off = 1 * uiScale2;
        const lockPattern = sel.locked ? PIX_ICON_LOCK_CLOSED : PIX_ICON_LOCK_OPEN;
        const lockSize = measurePixelIcon(lockPattern, pixelSize);
        const delSize = measurePixelIcon(PIX_ICON_X, pixelSize);
        const showResize = !(sel.locked || sel.lockedByReady);
        const resizeSize = showResize ? measurePixelIcon(PIX_ICON_RESIZE, pixelSize) : { width: 0, height: 0 };
        const lockBgW = lockSize.width + padding * 2;
        const delBgW = delSize.width + padding * 2;
        const bgH = Math.max(lockSize.height, delSize.height) + padding * 2;
        const totalW = lockBgW + delBgW + gap;
        let xRight = wx0 + iwSel2 - off - totalW;
        let yTop = wy0 + off;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const xLockBg = xRight;
        const xDelBg = xLockBg + lockBgW + gap;
        ctx.fillRect(xLockBg, yTop, lockBgW, bgH);
        ctx.fillRect(xDelBg, yTop, delBgW, bgH);
        let resizeBgW, resizeBgH, xResizeBg, yResizeBg, xResizeIcon, yResizeIcon;
        if (showResize) {
            resizeBgW = resizeSize.width + padding * 2;
            resizeBgH = resizeSize.height + padding * 2;
            xResizeBg = wx0 + iwSel2 - off - resizeBgW;
            yResizeBg = wy0 + ihSel2 - off - resizeBgH;
            ctx.fillRect(xResizeBg, yResizeBg, resizeBgW, resizeBgH);
        }

        const xLockIcon = xLockBg + padding;
        const yIcons = yTop + padding;
        drawPixelIcon(ctx, lockPattern, xLockIcon, yIcons, pixelSize, '#ffffff');

        const xDelIcon = xDelBg + padding;
        drawPixelIcon(ctx, PIX_ICON_X, xDelIcon, yIcons, pixelSize, '#ffffff');

        if (showResize) {
            xResizeIcon = xResizeBg + padding;
            yResizeIcon = yResizeBg + padding;
            drawPixelIcon(ctx, PIX_ICON_RESIZE, xResizeIcon, yResizeIcon, pixelSize, '#ffffff');
        }
        ctx.restore();

        sel._overlayRects = {
            lock: { x: xLockIcon, y: yIcons, w: lockSize.width, h: lockSize.height },
            del: { x: xDelIcon, y: yIcons, w: delSize.width, h: delSize.height },
            resize: showResize ? { x: xResizeBg, y: yResizeBg, w: resizeBgW, h: resizeBgH } : null,
            bg: { x: xRight, y: yTop, w: totalW, h: bgH }
        };
    }
    ctx.restore();

    // Draw 3x3 grid overlay and hover highlight
    try { drawNineGridOverlay(); } catch { }

    try { updatePixelMarkers(); } catch { }
    try { autoUnlockNeighborsBasedOnSigns(); } catch { }
}

// Determine which of the 3x3 grid cells the world point is in
function gridCellAt(worldX, worldY) {
    if (!img) return null;
    const w = img.width | 0, h = img.height | 0;
    if (w <= 0 || h <= 0) return null;
    // Limit to the 3x3 block around the fetched tile
    if (worldX < -w || worldX >= 2 * w || worldY < -h || worldY >= 2 * h) return null;
    const col = Math.floor(worldX / w);
    const row = Math.floor(worldY / h);
    if (col < -1 || col > 1 || row < -1 || row > 1) return null;
    return { row, col };
}

// Draw highlight for hovered cell only (no persistent grid lines)
function drawNineGridOverlay() {
    if (!img) return;
    const w = img.width | 0, h = img.height | 0;
    if (w <= 0 || h <= 0) return;
    ctx.save();
    // Hovered cell outline only
    if (hoveredGridCell) {
        // If this cell already has an overlay, do not draw outline/lock
        try {
            const k = String(hoveredGridCell.col | 0) + ',' + String(hoveredGridCell.row | 0);
            if (neighborOverlays && neighborOverlays.has(k)) { ctx.restore(); return; }
        } catch { }
        const hx = hoveredGridCell.col * w;
        const hy = hoveredGridCell.row * h;
        ctx.lineWidth = Math.max(1, 2 / state.scale);
        try { ctx.setLineDash([6 / state.scale, 6 / state.scale]); } catch { }
        ctx.strokeStyle = '#3b82f6';
        ctx.strokeRect(hx, hy, w, h);
        try { ctx.setLineDash([]); } catch { }

        // Draw a big lock emoji at cell center
        const cx = hx + w / 2;
        const cy = hy + h / 2;
        const baseSize = Math.min(w, h);
        const fontPx = Math.max(28, Math.floor(baseSize * 0.24));
        // Subtle background disc to improve contrast
        try {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            const r = Math.max(14, Math.floor(baseSize * 0.16));
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } catch { }
        try {
            ctx.save();
            ctx.font = String(fontPx) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('🔒', cx, cy);
            ctx.restore();
        } catch { }
    }
    ctx.restore();
}

// Returns true if given world point hits the lock emoji inside hovered cell
function isOverLockButton(worldX, worldY) {
    if (!img || !hoveredGridCell) return false;
    if (hoveredGridCell.row === 0 && hoveredGridCell.col === 0) return false;
    const w = img.width | 0, h = img.height | 0;
    if (w <= 0 || h <= 0) return false;
    const cx = hoveredGridCell.col * w + w / 2;
    const cy = hoveredGridCell.row * h + h / 2;
    const baseSize = Math.min(w, h);
    const r = Math.max(16, Math.floor(baseSize * 0.18));
    const dx = worldX - cx;
    const dy = worldY - cy;
    return (dx * dx + dy * dy) <= (r * r);
}

function getCurrentTileCoords() {
    try {
        if (Array.isArray(currentTiles) && currentTiles.length > 0) {
            const t = currentTiles[0];
            if (t && typeof t.x === 'number' && typeof t.y === 'number') return { x: t.x, y: t.y };
        }
    } catch { }
    let ax = 0, ay = 0;
    try {
        const a = parseInt((areaInput && areaInput.value) ? areaInput.value : '0', 10);
        const n = parseInt((noInput && noInput.value) ? noInput.value : '0', 10);
        if (Number.isFinite(a)) ax = a;
        if (Number.isFinite(n)) ay = n;
    } catch { }
    return { x: ax, y: ay };
}
function getCurrentOriginTile() {
    try {
        if (Array.isArray(currentTiles) && currentTiles.length > 0) {
            let minX = Infinity, minY = Infinity;
            for (let i = 0; i < currentTiles.length; i++) {
                const t = currentTiles[i];
                if (!t) continue;
                const tx = Number(t.x || 0);
                const ty = Number(t.y || 0);
                if (tx < minX) minX = tx;
                if (ty < minY) minY = ty;
            }
            if (minX !== Infinity && minY !== Infinity) return { x: minX, y: minY };
        }
    } catch { }
    return null;
}
function shiftSignItemsForOriginChange(prevOrigin, newOrigin, tileW, tileH) {
    try {
        if (!prevOrigin || !newOrigin) return;
        const w = Number(tileW || 0), h = Number(tileH || 0);
        if (!(w > 0 && h > 0)) return;
        const dxTiles = (Number(prevOrigin.x || 0) - Number(newOrigin.x || 0));
        const dyTiles = (Number(prevOrigin.y || 0) - Number(newOrigin.y || 0));
        if (dxTiles === 0 && dyTiles === 0) return;
        const dx = dxTiles * w;
        const dy = dyTiles * h;
        for (let i = 0; i < signItems.length; i++) {
            const it = signItems[i];
            if (!it || !it.image) continue;
            it.worldX = Number(it.worldX || 0) + dx;
            it.worldY = Number(it.worldY || 0) + dy;
            try { it._placedCountCache = null; } catch { }
        }
        try { saveImagesToStorage(); } catch { }
    } catch { }
}

// Shift view so that the newly centered tile appears where the hovered cell was
function shiftViewForCell(col, row) {
    if (!img) return;
    const w = img.width | 0, h = img.height | 0;
    state.translateX += (col * w) * state.scale;
    state.translateY += (row * h) * state.scale;
}

// Handle clicking the lock: fetch neighbor tile and place it under the clicked cell
function handleGridLockClick() {
    if (!img || !hoveredGridCell) return;
    const col = hoveredGridCell.col | 0;
    const row = hoveredGridCell.row | 0;
    if (col === 0 && row === 0) return;
    const base = getCurrentTileCoords();
    const newArea = Number(base.x || 0) + col;
    const newNo = Number(base.y || 0) + row;
    const key = String(col) + ',' + String(row);
    // Fetch the neighbor tile image and store as overlay; do not change center tile/view
    try {
        const imgEl = new Image();
        imgEl.onload = () => {
            neighborOverlays.set(key, { image: imgEl, col, row, area: newArea, no: newNo });
            overlayVersion++;
            scheduleRender();
            try { saveOverlaysToStorage(); } catch { }
        };
        imgEl.onerror = () => { };
        imgEl.src = buildUrl(newArea, newNo) + '?t=' + Date.now();
    } catch { }
}

// Programmatically ensure a neighbor overlay is fetched for given cell
function ensureNeighborOverlay(col, row) {
    try {
        if (!img) return;
        col = col | 0; row = row | 0;
        if (col === 0 && row === 0) return;
        const key = String(col) + ',' + String(row);
        if (neighborOverlays && neighborOverlays.has(key)) return;
        const base = getCurrentTileCoords();
        const newArea = Number(base.x || 0) + col;
        const newNo = Number(base.y || 0) + row;
        const imgEl = new Image();
        imgEl.onload = () => {
            try { neighborOverlays.set(key, { image: imgEl, col, row, area: newArea, no: newNo }); } catch { }
            overlayVersion++;
            scheduleRender();
            try { saveOverlaysToStorage(); } catch { }
        };
        imgEl.onerror = () => { };
        imgEl.src = buildUrl(newArea, newNo) + '?t=' + Date.now();
    } catch { }
}

// Promise-based ensure for overlay cell; resolves when loaded/ready
function ensureNeighborOverlayAsync(col, row) {
    return new Promise((resolve) => {
        try {
            if (!img) { resolve(false); return; }
            col = col | 0; row = row | 0;
            if (col === 0 && row === 0) { resolve(true); return; }
            const key = String(col) + ',' + String(row);
            const existing = neighborOverlays && neighborOverlays.get ? neighborOverlays.get(key) : null;
            if (existing && existing.image && existing.image.complete) { resolve(true); return; }
            const base = getCurrentTileCoords();
            const newArea = Number(base.x || 0) + col;
            const newNo = Number(base.y || 0) + row;
            const imgEl = new Image();
            imgEl.onload = () => {
                try { neighborOverlays.set(key, { image: imgEl, col, row, area: newArea, no: newNo }); } catch { }
                overlayVersion++;
                try { saveOverlaysToStorage(); } catch { }
                scheduleRender();
                resolve(true);
            };
            imgEl.onerror = () => resolve(false);
            imgEl.src = buildUrl(newArea, newNo) + '?t=' + Date.now();
        } catch { resolve(false); }
    });
}

// Ensure overlays for all neighbor cells intersecting the given item's bounds are loaded
async function ensureOverlaysForItemLoaded(item) {
    try {
        if (!img || !item || !item.image || !item.image.complete) return;
        const w = currentTileW || (img.width | 0);
        const h = currentTileH || (img.height | 0);
        const x0 = Number(item.worldX || 0), y0 = Number(item.worldY || 0);
        const x1 = x0 + (item.image.naturalWidth | 0), y1 = y0 + (item.image.naturalHeight | 0);
        const promises = [];
        for (let row = -1; row <= 1; row++) {
            for (let col = -1; col <= 1; col++) {
                if (col === 0 && row === 0) continue;
                const cx0 = col * w, cy0 = row * h, cx1 = cx0 + w, cy1 = cy0 + h;
                const intersects = (x1 > cx0) && (x0 < cx1) && (y1 > cy0) && (y0 < cy1);
                if (intersects) promises.push(ensureNeighborOverlayAsync(col, row));
            }
        }
        if (promises.length > 0) await Promise.all(promises);
    } catch { }
}

// If any part of any sign lies in a neighbor cell, auto-unlock that neighbor overlay
function autoUnlockNeighborsBasedOnSigns() {
    try {
        if (!img || !Array.isArray(signItems) || signItems.length === 0) return;
        const w = img.width | 0, h = img.height | 0;
        for (let i = 0; i < signItems.length; i++) {
            const it = signItems[i];
            if (!it || !it.image || !it.image.complete) continue;
            const x0 = Number(it.worldX || 0), y0 = Number(it.worldY || 0);
            const x1 = x0 + (it.image.naturalWidth | 0), y1 = y0 + (it.image.naturalHeight | 0);
            for (let row = -1; row <= 1; row++) {
                for (let col = -1; col <= 1; col++) {
                    if (col === 0 && row === 0) continue;
                    const cx0 = col * w, cy0 = row * h, cx1 = cx0 + w, cy1 = cy0 + h;
                    const intersects = (x1 > cx0) && (x0 < cx1) && (y1 > cy0) && (y0 < cy1);
                    if (intersects) ensureNeighborOverlay(col, row);
                }
            }
        }
    } catch { }
}

function overlaysStorageKey() {
    const base = getCurrentTileCoords();
    return 'overlays:' + String(base.x) + ',' + String(base.y);
}
function saveOverlaysToStorage() {
    try {
        const list = [];
        neighborOverlays.forEach((ov, k) => {
            if (!ov) return;
            list.push({ key: k, col: ov.col | 0, row: ov.row | 0, area: Number(ov.area || 0), no: Number(ov.no || 0) });
        });
        localStorage.setItem(overlaysStorageKey(), JSON.stringify(list));
    } catch { }
}
function restoreOverlaysFromStorage() {
    try {
        const raw = localStorage.getItem(overlaysStorageKey()) || '[]';
        let list = [];
        try { list = JSON.parse(raw); } catch { list = []; }
        if (!Array.isArray(list) || list.length === 0) return;
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e || e.col == null || e.row == null || e.area == null || e.no == null) continue;
            const key = String(e.col) + ',' + String(e.row);
            try {
                const imgEl = new Image();
                imgEl.onload = () => {
                    neighborOverlays.set(key, { image: imgEl, col: e.col | 0, row: e.row | 0, area: Number(e.area || 0), no: Number(e.no || 0) });
                    overlayVersion++;
                    scheduleRender();
                };
                imgEl.onerror = () => { };
                imgEl.src = buildUrl(e.area, e.no) + '?t=' + Date.now();
            } catch { }
        }
    } catch { }
}

function fitToView() {
    if (!img) return;
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const scaleToFit = Math.min(vw / img.width, vh / img.height);
    state.scale = scaleToFit;
    state.translateX = (vw - img.width * state.scale) / 2;
    state.translateY = (vh - img.height * state.scale) / 2;
    scheduleRender();
}

async function reloadCurrentBackground() {
    if (recentPaintCache.size > 0) return false;
    try {
        const saved = JSON.parse(localStorage.getItem('lastFetch') || 'null');
        if (saved) {
            if (saved.mode === 'single') {
                const area = saved.coords[0].x;
                const no = saved.coords[0].y;
                return await new Promise(resolve => {
                    const url = buildUrl(area, no) + '?t=' + Date.now();
                    const image = new Image();
                    image.onload = () => {
                        const prevOrigin = getCurrentOriginTile();
                        const prevW = currentTileW || (img ? (img.width | 0) : 0);
                        const prevH = currentTileH || (img ? (img.height | 0) : 0);
                        img = image;
                        baseImageData = null;
                        currentTiles = [{ x: Number(area), y: Number(no) }];
                        currentTileW = image.width;
                        currentTileH = image.height;
                        currentMosaicCols = 1;
                        currentMosaicRows = 1;
                        try { shiftSignItemsForOriginChange(prevOrigin, { x: Number(area), y: Number(no) }, prevW, prevH); } catch { }
                        try { signItems.forEach(it => { if (it) it._placedCountCache = null; }); } catch { }
                        try {
                            if (!hasSavedView()) {
                                if (neighborOverlays && neighborOverlays.size > 0) { neighborOverlays.clear(); overlayVersion++; hoveredGridCell = null; }
                            }
                        } catch { }
                        scheduleRender();
                        updatePixelMarkers();
                        try { restoreOverlaysFromStorage(); } catch { }
                        try {
                            if (pendingZoomToItem && pendingZoomToItem.image && pendingZoomToItem.image.complete) {
                                const w = img ? (img.width | 0) : 0;
                                const h = img ? (img.height | 0) : 0;
                                const wx = Math.floor(pendingZoomToItem.worldX || 0);
                                const wy = Math.floor(pendingZoomToItem.worldY || 0);
                                const inCurrent3x3 = !!(img && wx >= -w && wx < 2 * w && wy >= -h && wy < 2 * h);
                                if (inCurrent3x3) { zoomToSign(pendingZoomToItem); }
                                pendingZoomToItem = null;
                            }
                        } catch { }
                        resolve(true);
                    };
                    image.onerror = () => resolve(false);
                    image.src = url;
                });
            }
        }
        // If no saved data, load from inputs
        const area = (areaInput && areaInput.value) ? String(areaInput.value).trim() : '';
        const no = (noInput && noInput.value) ? String(noInput.value).trim() : '';
        if (!area || !no) return false;
        return await new Promise(resolve => {
            const url = buildUrl(area, no) + '?t=' + Date.now();
            const image = new Image();
            image.onload = () => {
                const prevOrigin = getCurrentOriginTile();
                const prevW = currentTileW || (img ? (img.width | 0) : 0);
                const prevH = currentTileH || (img ? (img.height | 0) : 0);
                img = image;
                baseImageData = null;
                currentTiles = [{ x: Number(area), y: Number(no) }];
                currentTileW = image.width;
                currentTileH = image.height;
                currentMosaicCols = 1;
                currentMosaicRows = 1;
                try { shiftSignItemsForOriginChange(prevOrigin, { x: Number(area), y: Number(no) }, prevW, prevH); } catch { }
                try { signItems.forEach(it => { if (it) it._placedCountCache = null; }); } catch { }
                try {
                    if (!hasSavedView()) {
                        if (neighborOverlays && neighborOverlays.size > 0) { neighborOverlays.clear(); overlayVersion++; hoveredGridCell = null; }
                    }
                } catch { }
                scheduleRender();
                updatePixelMarkers();
                try { restoreOverlaysFromStorage(); } catch { }
                try {
                    if (pendingZoomToItem && pendingZoomToItem.image && pendingZoomToItem.image.complete) {
                        const w = img ? (img.width | 0) : 0;
                        const h = img ? (img.height | 0) : 0;
                        const wx = Math.floor(pendingZoomToItem.worldX || 0);
                        const wy = Math.floor(pendingZoomToItem.worldY || 0);
                        const inCurrent3x3 = !!(img && wx >= -w && wx < 2 * w && wy >= -h && wy < 2 * h);
                        if (inCurrent3x3) { zoomToSign(pendingZoomToItem); }
                        pendingZoomToItem = null;
                    }
                } catch { }
                resolve(true);
            };
            image.onerror = () => resolve(false);
            image.src = url;
        });
    } catch {
        return false;
    }
}

const USE_LOCAL_TILE = false;
function buildUrl(area, no) {
    if (USE_LOCAL_TILE) return '767.png';

    return '/tiles/' + encodeURIComponent(area) + '/' + encodeURIComponent(no) + '.png';
}

function hasSavedView() {
    try {
        const sx = parseFloat(localStorage.getItem('view.translateX') || '');
        const sy = parseFloat(localStorage.getItem('view.translateY') || '');
        const sc = parseFloat(localStorage.getItem('view.scale') || '');
        return !isNaN(sx) && !isNaN(sy) && !isNaN(sc);
    } catch { return false; }
}

function loadImage(area, no, preserveView = false) {
    const url = buildUrl(area, no);
    const image = new Image();

    image.onload = () => {
        const prevScale = state.scale;
        const prevTx = state.translateX;
        const prevTy = state.translateY;
        const prevOrigin = getCurrentOriginTile();
        const prevW = currentTileW || (img ? (img.width | 0) : 0);
        const prevH = currentTileH || (img ? (img.height | 0) : 0);

        img = image;
        currentTiles = [{ x: Number(area), y: Number(no) }];
        currentTileW = image.width;
        currentTileH = image.height;
        currentMosaicCols = 1;
        currentMosaicRows = 1;
        try { baseImageData = null; } catch { }
        try { shiftSignItemsForOriginChange(prevOrigin, { x: Number(area), y: Number(no) }, prevW, prevH); } catch { }
        // Clear overlays only if we are NOT preserving view and also want to reset overlays
        try {
            if (!preserveView) {
                if (neighborOverlays && neighborOverlays.size > 0) { neighborOverlays.clear(); overlayVersion++; hoveredGridCell = null; }
            }
        } catch { }

        if (preserveView) {
            state.scale = prevScale;
            state.translateX = prevTx;
            state.translateY = prevTy;
            scheduleRender();
            try { restoreOverlaysFromStorage(); } catch { }
        } else if (hasSavedView()) {
            // If saved view exists but this is a manual fetch (preserveView=false), do not restore overlays
            scheduleRender();
            updatePixelMarkers();
        } else {
            fitToView();
        }
        localStorage.setItem('lastFetch', JSON.stringify({ mode: 'single', coords: [{ x: Number(area), y: Number(no) }] }));
        // Center focus only when there's no saved view and not preserving view
        try {
            if (!(preserveView || hasSavedView())) {
                const vw = canvas.clientWidth;
                const vh = canvas.clientHeight;
                const centerPx = getContentCenterPx();
                const newScale = state.scale; // keep current scale after fit/restore above
                const cx = (img.width | 0) / 2;
                const cy = (img.height | 0) / 2;
                state.translateX = centerPx.x - cx * newScale;
                state.translateY = centerPx.y - cy * newScale;
                scheduleRender();
            }
        } catch { }
        try {
            if (pendingZoomToItem && pendingZoomToItem.image && pendingZoomToItem.image.complete) {
                const w = img ? (img.width | 0) : 0;
                const h = img ? (img.height | 0) : 0;
                const wx = Math.floor(pendingZoomToItem.worldX || 0);
                const wy = Math.floor(pendingZoomToItem.worldY || 0);
                const inCurrent3x3 = !!(img && wx >= -w && wx < 2 * w && wy >= -h && wy < 2 * h);
                if (inCurrent3x3) { zoomToSign(pendingZoomToItem); }
                pendingZoomToItem = null;
            }
        } catch { }
    };
    image.onerror = () => {
        alert(t('messages.imageLoadFailed'));
    };
    image.src = url;
}
let rightEraseHeld = false;
let rightEraseLastKey = null;


canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - state.translateX) / state.scale;
    const worldY = (py - state.translateY) / state.scale;
    // Lock button click on hovered neighbor cell
    try {
        if (e.button === 0 && isOverLockButton(worldX, worldY)) {
            e.preventDefault();
            handleGridLockClick();
            return;
        }
    } catch { }

    if (isReadyOpen()) {
        readyMouseDownPt = { screenX: e.clientX, screenY: e.clientY, worldX, worldY, button: e.button };
        readyMouseMoved = false;
        if (e.button === 2) {
            try { updateReadyHoverFromEvent(e); } catch { }
            rightEraseHeld = true;
            rightEraseLastKey = currentHoverKey();
            maybeRemoveSelectionAtHover();
        }
    }


    let hitIndex = -1;
    for (let i = signItems.length - 1; i >= 0; i--) {
        const it = signItems[i];
        if (!it || !it.image || !it.image.complete) continue;
        const x = it.worldX || 0;
        const y = it.worldY || 0;
        const w = Math.max(1, it.displayWidth || it.image.naturalWidth);
        const h = Math.max(1, it.displayHeight || it.image.naturalHeight);
        if (worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h) {
            hitIndex = i;
            break;
        }
    }

    if (!readyGlobalMode && hitIndex >= 0) {
        selectedIndex = hitIndex;

        try {
            const rp = document.getElementById('ready-popup');
            if (rp && !rp.hidden && readyLockedItem && readyLockedItem !== signItems[selectedIndex]) {
                readyLockedItem.lockedByReady = false;
                try { updateItemLockUi(readyLockedItem); } catch { }
                readyLockedItem = null;
            }
        } catch { }
        updateThumbSelection();
        updateCounter();
        const it = signItems[selectedIndex];

        if (it && it._overlayRects) {
            const rbg = it._overlayRects.bg;
            if (rbg && worldX >= rbg.x && worldX <= rbg.x + rbg.w && worldY >= rbg.y && worldY <= rbg.y + rbg.h) {
                const rLock = it._overlayRects.lock;
                const rDel = it._overlayRects.del;
                if (rLock && worldX >= rLock.x && worldX <= rLock.x + rLock.w && worldY >= rLock.y && worldY <= rLock.y + rLock.h) {
                    it.locked = !it.locked;
                    try { updateItemLockUi(it); } catch { }
                    try {
                        const mapKey = 'locks.map';
                        let locks = {};
                        try { locks = JSON.parse(localStorage.getItem(mapKey) || '{}'); } catch { }
                        locks[it.url] = !!it.locked;
                        try {
                            const altKey = (it.url && it.url.startsWith('data:')) ? it.url : (localStorage.getItem('last.image.dataUrl') || null);
                            if (altKey) locks[altKey] = !!it.locked;
                        } catch { }
                        localStorage.setItem(mapKey, JSON.stringify(locks));
                    } catch { }
                    scheduleRender();
                    return;
                }
                if (rDel && worldX >= rDel.x && worldX <= rDel.x + rDel.w && worldY >= rDel.y && worldY <= rDel.y + rDel.h) {

                    deleteItem(it);
                    scheduleRender();
                    return;
                }
            }
            const rResize = it._overlayRects.resize;
            if (!(it.locked || it.lockedByReady) && rResize && worldX >= rResize.x && worldX <= rResize.x + rResize.w && worldY >= rResize.y && worldY <= rResize.y + rResize.h) {
                resizingItem = it;
                resizeStartX = worldX;
                resizeStartY = worldY;
                resizeOrigW = Math.max(1, it.displayWidth || it.image.naturalWidth);
                resizeOrigH = Math.max(1, it.displayHeight || it.image.naturalHeight);
                document.body.classList.add('dragging');
                return;
            }
        }
        if (!(it.locked || it.lockedByReady)) {
            signDragging = true;
            // Preserve fractional click offset to avoid pixel jumps when dragging
            signWorldOffsetX = worldX - (it.worldX || 0);
            signWorldOffsetY = worldY - (it.worldY || 0);
        }
        scheduleRender();
        if (isReadyOpen()) {

            updateReadyHoverFromEvent(e);
            updatePixelMarkers();
        }
    } else if (!readyGlobalMode) {
        try {
            const prev = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
            if (prev) clearSelectionsForItem(prev);
        } catch { }
        selectedIndex = -1;
        try {
            const rp = document.getElementById('ready-popup');
            if (rp && !rp.hidden) {
                resetReadyNow();
            }
        } catch { }
        updateThumbSelection();
        updateCounter();
        state.dragging = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        document.body.classList.add('dragging');
        scheduleRender();
        updatePixelMarkers();
    }
});
canvas.addEventListener('contextmenu', (e) => { if (isReadyOpen()) { e.preventDefault(); } });
window.addEventListener('mousemove', (e) => {
    if (isReadyOpen()) {
        if (readyMouseDownPt) {
            const moveDx = Math.abs(e.clientX - readyMouseDownPt.screenX);
            const moveDy = Math.abs(e.clientY - readyMouseDownPt.screenY);
            if (moveDx > READY_CLICK_MOVE_TOLERANCE || moveDy > READY_CLICK_MOVE_TOLERANCE) readyMouseMoved = true;
        }
    }
    if (rightEraseHeld && isReadyOpen()) {
        try { updateReadyHoverFromEvent(e); } catch { }
        if (rightEraseLastKey !== currentHoverKey()) {
            if (maybeRemoveSelectionAtHover()) {
                rightEraseLastKey = currentHoverKey();
            }
        }
    }
    if (resizingItem) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldX = (px - state.translateX) / state.scale;
        const worldY = (py - state.translateY) / state.scale;
        const newW = Math.max(1, resizeOrigW + Math.round(worldX - resizeStartX));
        const newH = Math.max(1, resizeOrigH + Math.round(worldY - resizeStartY));
        resizingItem.displayWidth = newW;
        resizingItem.displayHeight = newH;
        scheduleRender();
        return;
    }
    if (state.dragging) {
        if (rightEraseHeld) {
            return;
        }
        const dx = e.clientX - state.lastX;
        const dy = e.clientY - state.lastY;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        // Clamp panning only when composite content is larger than viewport
        try {
            const rects = getAllowedPlacementRects();
            const b = getCompositeBounds(rects);
            const vw = canvas.clientWidth, vh = canvas.clientHeight;
            const s = state.scale;
            const cw = (b.maxX - b.minX) * s;
            const ch = (b.maxY - b.minY) * s;
            let nx = state.translateX + dx;
            let ny = state.translateY + dy;
            // Allow some overscroll slack so users can pan even when content nearly fits
            const panSlackX = Math.max(32, Math.floor(vw * 0.2));
            const panSlackY = Math.max(32, Math.floor(vh * 0.2));
            if (cw > vw) {
                const minTx = vw - (b.maxX * s) - panSlackX; // right edge aligned with slack
                const maxTx = - (b.minX * s) + panSlackX;    // left edge aligned with slack
                nx = Math.min(Math.max(minTx, nx), maxTx);
            }
            if (ch > vh) {
                const minTy = vh - (b.maxY * s) - panSlackY;
                const maxTy = - (b.minY * s) + panSlackY;
                ny = Math.min(Math.max(minTy, ny), maxTy);
            }
            state.translateX = nx;
            state.translateY = ny;
        } catch { state.translateX += dx; state.translateY += dy; }
        scheduleRender();
        updatePixelMarkers();

        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldX = (px - state.translateX) / state.scale;
        const worldY = (py - state.translateY) / state.scale;
        updateCanvasCursorAt(worldX, worldY);
        return;
    }
    if (isReadyOpen()) {
        try {
            const t = e && e.target ? e.target : null;
            const overUi = !!(t && t.closest && (
                t.closest('#control-panel') ||
                t.closest('#ready-popup') ||
                t.closest('#sidebar') ||
                t.closest('#color-palette')
            ));
            if (overUi) {
                readyHoverPixel.x = null; readyHoverPixel.y = null;
                hideEl(pixelHoverEl);
                try { pixelHoverFillEl.hidden = true; } catch { }
            } else {
                updateReadyHoverFromEvent(e);
            }
        } catch { updateReadyHoverFromEvent(e); }
    }


    if (isReadyOpen() && readyMouseDownPt && !readyMouseMoved) {
        return;
    }

    try {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldX = (px - state.translateX) / state.scale;
        const worldY = (py - state.translateY) / state.scale;
        updateCanvasCursorAt(worldX, worldY);
    } catch { }

    if (isReadyOpen() && readyMouseDownPt && readyMouseMoved && !state.dragging) {
        state.dragging = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        document.body.classList.add('dragging');
    }
    if (!signDragging) return;
    if (isReadyOpen()) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let worldX = (px - state.translateX) / state.scale - signWorldOffsetX;
    let worldY = (py - state.translateY) / state.scale - signWorldOffsetY;
    const sel = signItems[selectedIndex];
    if (sel && sel.image && img) {
        const snapped = snapItemToNearest(sel, worldX, worldY);
        sel.worldX = snapped.x;
        sel.worldY = snapped.y;

        if (sel.pixelCount == null) {
            try { sel.pixelCount = countNonTransparentPixels(sel.image); } catch { }
        }
        scheduleRender();
        updatePixelMarkers();
        if (isReadyOpen()) { try { updateReadySelectionLabel(); } catch { } }
        try { saveImagesToStorage(); } catch { }
    }
});
window.addEventListener('mouseup', (e) => {
    if (resizingItem) {
        const w = Math.max(1, resizingItem.displayWidth || resizingItem.image.naturalWidth);
        const h = Math.max(1, resizingItem.displayHeight || resizingItem.image.naturalHeight);
        resizingItem.displayWidth = null;
        resizingItem.displayHeight = null;
        applyResize(resizingItem, w, h);
        resizingItem = null;
        document.body.classList.remove('dragging');
        return;
    }
    if (isReadyOpen()) {// Ready mode

        if (readyMouseDownPt && !readyMouseMoved && e.button === 0) {
            const hasAccounts = Array.isArray(readySelectedAccountIds) && readySelectedAccountIds.length > 0;
            if (!hasAccounts) {
                showToast(t('messages.selectAccountFirst'), 'error', 2000);
                readyMouseDownPt = null; readyMouseMoved = false;
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const worldX = (px - state.translateX) / state.scale;
            const worldY = (py - state.translateY) / state.scale;
            const wx = Math.floor(worldX);
            const wy = Math.floor(worldY);
            const area = (areaInput && areaInput.value) ? String(areaInput.value).trim() : '';
            const no = (noInput && noInput.value) ? String(noInput.value).trim() : '';

            if (!img) {
                readyMouseDownPt = null; readyMouseMoved = false;
                return;
            }
            if (readyGlobalMode) {
                if (wx >= 0 && wy >= 0 && wx < img.width && wy < img.height) {
                    const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
                    if (limit > 0 && readyGlobalSelected.size >= limit) {
                        showToast(t('messages.maxPixelsReached', { limit }), 'error', 2000);
                        readyMouseDownPt = null; readyMouseMoved = false;
                        return;
                    }
                    const key = String(wx) + ',' + String(wy);
                    if (!readyGlobalSelected.has(key)) {
                        const rec = { wx, wy, el: null, fillEl: null, colorId: selectedOverrideColorId };
                        readyGlobalSelected.set(key, rec);
                        if (pixelSelectedList) pixelSelectedList.hidden = false;
                        try { updateReadySelectionLabel(); updateStartEnabled(); } catch { }
                        try { refreshPaletteTooltips(); } catch { }
                        scheduleOverlayDraw();
                    }
                }
            } else {
                const selItem = signItems[selectedIndex];
                if (selItem && selItem.image && selItem.image.complete) {
                    const lx = Math.floor(worldX - (selItem.worldX || 0));
                    const ly = Math.floor(worldY - (selItem.worldY || 0));
                    if (lx >= 0 && ly >= 0 && lx < selItem.image.naturalWidth && ly < selItem.image.naturalHeight) {
                        if (isOpaquePixel(selItem, lx, ly) && (selectedOverrideColorId != null || !isSameColorAsBase(selItem, lx, ly))) {
                            const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
                            const map = getSelectedMap(selItem);
                            const already = map ? map.size : 0;
                            if (limit > 0 && already >= limit) {
                                showToast(t('messages.maxPixelsReached', { limit }), 'error', 2000);
                                readyMouseDownPt = null; readyMouseMoved = false;
                                return;
                            }
                            const didAdd = addPixelSelection(selItem, lx, ly, selectedOverrideColorId != null ? selectedOverrideColorId : null);
                            if (didAdd) {
                                try { updateReadySelectionLabel(); updateStartEnabled(); updatePixelMarkers(); render(); } catch { }
                            }
                        }
                    }
                }
            }
        } else if (readyMouseDownPt && !readyMouseMoved && e.button === 2) {

            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const worldX = (px - state.translateX) / state.scale;
            const worldY = (py - state.translateY) / state.scale;
            if (readyGlobalMode) {
                const wx = Math.floor(worldX);
                const wy = Math.floor(worldY);
                if (img && wx >= 0 && wy >= 0 && wx < img.width && wy < img.height) {
                    const key = String(wx) + ',' + String(wy);
                    const rec = readyGlobalSelected.get(key);
                    if (rec) {
                        readyGlobalSelected.delete(key);
                        try { updateReadySelectionLabel(); updateStartEnabled(); } catch { }
                        try { refreshPaletteTooltips(); } catch { }
                        scheduleOverlayDraw();
                    }
                }
            } else {
                const selItem = signItems[selectedIndex];
                if (selItem && selItem.image && selItem.image.complete) {
                    const lx = Math.floor(worldX - (selItem.worldX || 0));
                    const ly = Math.floor(worldY - (selItem.worldY || 0));
                    if (lx >= 0 && ly >= 0 && lx < selItem.image.naturalWidth && ly < selItem.image.naturalHeight) {
                        const removed = removePixelSelection(selItem, lx, ly);
                        if (removed) { try { updateReadySelectionLabel(); updateStartEnabled(); } catch { } }
                    }
                }
            }
        }
        readyMouseDownPt = null; readyMouseMoved = false;
        rightEraseHeld = false; rightEraseLastKey = null;
    }
    state.dragging = false;
    signDragging = false;
    document.body.classList.remove('dragging');
    try {
        // Persist current selected item's world position at end of drag
        const it = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (it && it.image && it.image.complete) {
            localStorage.setItem('last.image.worldX', String(it.worldX || 0));
            localStorage.setItem('last.image.worldY', String(it.worldY || 0));
        }
    } catch { }
    try { saveImagesToStorage(); } catch { }
    setTimeout(() => { try { updatePixelMarkers(); } catch { } }, 50);
});


document.addEventListener('mousedown', (e) => {
    try {
        const rp = document.getElementById('ready-popup');
        if (rp && !rp.hidden) {
            const isCanvasClick = (e.target === canvas) || (canvas && canvas.contains && canvas.contains(e.target));
            const isPopupClick = (e.target === rp) || (rp && rp.contains && rp.contains(e.target));
            const readyBtnEl = document.getElementById('btn-ready');
            const isReadyBtnClick = (e.target === readyBtnEl) || (readyBtnEl && readyBtnEl.contains && readyBtnEl.contains(e.target));
            const paletteEl = document.getElementById('color-palette');
            const isPaletteClick = (e.target === paletteEl) || (paletteEl && paletteEl.contains && paletteEl.contains(e.target));
            if (!isCanvasClick && !isPopupClick && !isReadyBtnClick && !isPaletteClick) {

                resetReadyNow();
            }
        }
    } catch { }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.zooming = true;
    try { if (zoomingTimeout) { clearTimeout(zoomingTimeout); } } catch { }
    if (!img) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const imageX = (px - state.translateX) / state.scale;
    const imageY = (py - state.translateY) / state.scale;
    const zoom = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(state.maxScale, Math.max(state.minScale, state.scale * zoom));
    if (newScale === state.scale) return;
    // Zoom toward cursor, anchoring to composite bounds to avoid jumps across tiles
    let nx, ny;
    try {
        const rects = getAllowedPlacementRects();
        const b = getCompositeBounds(rects);
        const clamp = (v, min, max) => v < min ? min : (v > max ? max : v);
        const wx = clamp(imageX, b.minX, b.maxX);
        const wy = clamp(imageY, b.minY, b.maxY);
        nx = px - wx * newScale;
        ny = py - wy * newScale;
    } catch {
        nx = px - imageX * newScale;
        ny = py - imageY * newScale;
    }
    try {
        const rects = getAllowedPlacementRects();
        const b = getCompositeBounds(rects);
        const vw = canvas.clientWidth, vh = canvas.clientHeight;
        const cw = (b.maxX - b.minX) * newScale;
        const ch = (b.maxY - b.minY) * newScale;
        // Allow some overscroll slack while zooming
        const panSlackX = Math.max(32, Math.floor(vw * 0.2));
        const panSlackY = Math.max(32, Math.floor(vh * 0.2));
        if (cw > vw) {
            const minTx = vw - (b.maxX * newScale) - panSlackX;
            const maxTx = - (b.minX * newScale) + panSlackX;
            nx = Math.min(Math.max(minTx, nx), maxTx);
        }
        if (ch > vh) {
            const minTy = vh - (b.maxY * newScale) - panSlackY;
            const maxTy = - (b.minY * newScale) + panSlackY;
            ny = Math.min(Math.max(minTy, ny), maxTy);
        }
    } catch { }
    state.translateX = nx;
    state.translateY = ny;
    state.scale = newScale;
    scheduleRender();
    updatePixelMarkers();
    zoomingTimeout = setTimeout(() => { state.zooming = false; try { updatePixelMarkers(); } catch { } }, 50);
}, { passive: false });

window.addEventListener('resize', () => {
    scheduleRender();
    updatePixelMarkers();
});

// Persist view pan/zoom changes periodically
setInterval(() => {
    try {
        localStorage.setItem('view.translateX', String(state.translateX));
        localStorage.setItem('view.translateY', String(state.translateY));
        localStorage.setItem('view.scale', String(state.scale));
    } catch { }
}, 1000);


document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const area = areaInput.value.trim();
    const no = noInput.value.trim();
    if (!area || !no) return;
    loadImage(area, no);

    try { localStorage.setItem('view.worldX', String(Number(area))); localStorage.setItem('view.worldY', String(Number(no))); } catch { }
});




















function setAccountsActiveTab() {
    if (!tabAccounts) return;
    tabAccounts.classList.add('active');
    if (accountsSection) accountsSection.hidden = false;
    if (accountFormSection) accountFormSection.hidden = true;
    if (shopViewSection) shopViewSection.hidden = true;
}
if (tabAccounts) {
    tabAccounts.addEventListener('click', () => setAccountsActiveTab());
}
accountsBtn.addEventListener('click', async () => {
    accountsModal.hidden = false;
    setAccountsActiveTab();
});
function showAccountForm() {
    if (!accountsSection || !accountFormSection) return;
    accountsSection.hidden = true;
    accountFormSection.hidden = false;
    if (shopViewSection) shopViewSection.hidden = true;
    try {
        accountNameInput.value = '';
        accountTokenInput.value = '';
        accountIdInput.value = '';
        proxyInput.value = '';
        accountNameInput.focus();
    } catch { }
}
function openEditAccount(row) {
    if (!row) return;
    if (!accountsSection || !accountFormSection) return;
    accountsSection.hidden = true;
    accountFormSection.hidden = false;
    try {
        accountNameInput.value = row.name || '';
        accountTokenInput.value = row.token || '';
        accountIdInput.value = String(row.id || '');
        proxyInput.value = row.proxy || '';
        accountNameInput.focus();
    } catch { }

    try { accountSaveBtn.textContent = t('buttons.save'); } catch { }
}
// Only allow premium colors with id > 32

function computeUnionExtraColorsBitmapAllAccounts() {
    let union = 0;
    try {
        if (Array.isArray(accountsData)) {
            for (let i = 0; i < accountsData.length; i++) {
                const r = accountsData[i];
                const v = Number(r && r.extraColorsBitmap != null ? r.extraColorsBitmap : 0) || 0;
                union = (union | v) >>> 0;
            }
        }
    } catch { }
    return union;
}
function getPremiumColorsFromBitmap(bitmap) {
    const res = [];
    const arr = Array.isArray(PREMIUM_PALETTE) ? PREMIUM_PALETTE : [];
    const b = Number(bitmap) || 0;
    for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p || typeof p.id !== 'number' || p.id <= 31) continue;
        const idx = p.id - 32;
        if (idx < 0) continue;
        const mask = 1 << idx;
        if ((b & mask) !== 0) res.push({ id: p.id, rgb: p.rgb });
    }
    return res;
}
function recomputeActivePalette() {
    try {
        const base = PALETTE.slice();
        if (paletteMode === 'premium') {
            const union = computeUnionExtraColorsBitmapAllAccounts();
            const extra = getPremiumColorsFromBitmap(union);
            const byId = new Map();
            for (let i = 0; i < base.length; i++) byId.set(base[i].id, base[i]);
            for (let i = 0; i < extra.length; i++) byId.set(extra[i].id, extra[i]);
            const combined = Array.from(byId.values());
            combined.sort((a, b) => a.id - b.id);
            ACTIVE_PALETTE = combined;
        } else {
            ACTIVE_PALETTE = base;
        }
    } catch {
        ACTIVE_PALETTE = PALETTE.slice();
    }
    try { recomputePaletteCaches(); } catch { }
    try { setupColorPalette(); } catch { }
    try { buildFillPaletteUi(); } catch { }
    try { updatePaletteSelectionUi(); } catch { }
}

function isPremiumColorId(id) { return Number(id) > 31; }
function accountProvidesColor(acc, colorId) {
    if (!acc) return false;
    if (acc.active === false) return false;
    if (!acc.token) return false;
    if (!isPremiumColorId(colorId)) return true;
    const b = Number(acc.extraColorsBitmap || 0);
    const idx = Number(colorId) - 32;
    if (idx < 0) return false;
    const mask = 1 << idx;
    return (b & mask) !== 0;
}
function getAccountsProvidingColor(colorId) {
    const rows = Array.isArray(accountsData) ? accountsData : [];
    const selectedSet = new Set(readySelectedAccountIds || []);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!selectedSet.has(r.id)) continue;
        if (accountProvidesColor(r, colorId)) out.push(r);
    }
    return out;
}
function getAccountsProvidingColorAll(colorId) {
    const rows = Array.isArray(accountsData) ? accountsData : [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (accountProvidesColor(r, colorId)) out.push(r);
    }
    return out;
}
function getAccountsProvidingColorScoped(colorId, scope) {
    return (scope === 'selected') ? getAccountsProvidingColor(colorId) : getAccountsProvidingColorAll(colorId);
}
function getPremiumColorTotalLimit(colorId) {
    if (!isPremiumColorId(colorId)) return Infinity;
    const rows = getAccountsProvidingColor(colorId);
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
        const cRaw = Number(rows[i] && rows[i].pixelCount);
        if (Number.isFinite(cRaw)) total += Math.max(0, Math.floor(cRaw));
    }
    return total;
}
function getPremiumColorTotalLimitAll(colorId) {
    if (!isPremiumColorId(colorId)) return Infinity;
    const rows = getAccountsProvidingColorAll(colorId);
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
        const cRaw = Number(rows[i] && rows[i].pixelCount);
        if (Number.isFinite(cRaw)) total += Math.max(0, Math.floor(cRaw));
    }
    return total;
}
function getPremiumColorRemainingLimitAll(colorId) {
    // For the homepage (no selected accounts), remaining == total across all eligible accounts
    return getPremiumColorTotalLimitAll(colorId);
}
function getSelectedPremiumColorIds() {
    const out = [];
    try {
        if (readyGlobalSelected && typeof readyGlobalSelected.forEach === 'function') {
            readyGlobalSelected.forEach(rec => { if (rec && isPremiumColorId(rec.colorId)) out.push(rec.colorId); });
        }
    } catch { }
    try {
        for (let i = 0; i < signItems.length; i++) {
            const it = signItems[i];
            const map = getSelectedMap(it);
            if (!map) continue;
            map.forEach(rec => { if (rec && isPremiumColorId(rec.colorId)) out.push(rec.colorId); });
        }
    } catch { }
    return out;
}
function computePremiumAssignmentUsedPerAccount() {
    // Capacity only from selected accounts
    const selectedSet = new Set(readySelectedAccountIds || []);
    const capacity = new Map();
    const rows = Array.isArray(accountsData) ? accountsData : [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r && r.active !== false && r.token && selectedSet.has(r.id)) {
            const cRaw = Number(r.pixelCount);
            const cap = Number.isFinite(cRaw) ? Math.max(0, Math.floor(cRaw)) : 0;
            capacity.set(r.id, cap);
        }
    }
    const used = new Map();
    const remainingOf = (accId) => (capacity.get(accId) || 0) - (used.get(accId) || 0);
    const list = getSelectedPremiumColorIds();
    for (let k = 0; k < list.length; k++) {
        const colorId = list[k];
        const providers = getAccountsProvidingColor(colorId);
        let bestId = null, bestRemain = 0;
        for (let i = 0; i < providers.length; i++) {
            const acc = providers[i];
            if (!capacity.has(acc.id)) continue;
            const rem = remainingOf(acc.id);
            if (rem > bestRemain) { bestRemain = rem; bestId = acc.id; }
        }
        if (bestId != null && bestRemain > 0) { used.set(bestId, (used.get(bestId) || 0) + 1); }
    }
    return { capacity, used };
}
function getPremiumColorRemainingLimit(colorId) {
    if (!isPremiumColorId(colorId)) return Infinity;
    const { capacity, used } = computePremiumAssignmentUsedPerAccount();
    const providers = getAccountsProvidingColor(colorId);
    let remain = 0;
    for (let i = 0; i < providers.length; i++) {
        const acc = providers[i];
        if (!capacity.has(acc.id)) continue;
        const rem = Math.max(0, (capacity.get(acc.id) || 0) - (used.get(acc.id) || 0));
        remain += rem;
    }
    return Math.max(0, remain);
}
function setPaletteSwatchTitle(el, p) {
    try {
        if (!el || !p) return;
        if (isPremiumColorId(p.id)) {
            const hasSelected = Array.isArray(readySelectedAccountIds) && readySelectedAccountIds.length > 0;
            const inReady = isReadyOpen();
            if (hasSelected && inReady) {
                const total = getPremiumColorTotalLimit(p.id); // selected accounts total
                const remain = getPremiumColorRemainingLimit(p.id); // selected accounts remaining (subtracts used)
                el.title = t('palette.premiumColorTitle', { remain, total });
            } else {
                const total = getPremiumColorTotalLimitAll(p.id); // all accounts total
                const remain = getPremiumColorRemainingLimitAll(p.id); // equal to total across all
                el.title = t('palette.premiumColorTitle', { remain, total });
            }
        } else {
            el.title = t('palette.colorTitle', { id: p.id });
        }
    } catch { }
}
function refreshPaletteTooltips() {
    try {
        if (!colorPaletteEl) return;
        const swatches = Array.from(colorPaletteEl.querySelectorAll('.palette-swatch'));
        swatches.forEach(sw => {
            const idAttr = sw.getAttribute('data-id');
            if (idAttr == null) return;
            const id = Number(idAttr);
            const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
            const p = arr.find(x => x && x.id === id);
            if (p) setPaletteSwatchTitle(sw, p);
        });
    } catch { }
}

// Checks whether a given color id is available for the current shop account
function hasShopColor(e) {
    if (e < 32) {
        return true;
    }
    const b = Number(shopExtraColorsBitmap) || 0;
    const colorMask = 1 << (e - 32);
    return (b & colorMask) !== 0;
}
function updatePremiumPaletteSelectionUi() {
    try {
        if (!shopPremiumPaletteWrap) return;
        const swatches = Array.from(shopPremiumPaletteWrap.querySelectorAll('.shop-palette-swatch'));
        swatches.forEach(sw => {
            const idAttr = sw.getAttribute('data-id');
            const id = idAttr == null ? null : Number(idAttr);
            const isSel = (id != null && id === shopSelectedPremiumColorId);
            sw.classList.toggle('selected', !!isSel);
            if (isSel) {
                sw.setAttribute('aria-selected', 'true');
            } else {
                sw.removeAttribute('aria-selected');
            }
        });
        try {
            const hasSelection = (shopSelectedPremiumColorId != null);
            if (shopPremiumBuyBtn) shopPremiumBuyBtn.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
        } catch { }
    } catch { }
}

function renderPremiumPalette() {
    try {
        if (!shopPremiumPaletteWrap) return;
        // Build once per open; simple re-render
        shopPremiumPaletteWrap.innerHTML = '';
        if (shopPremiumOwnedWrap) shopPremiumOwnedWrap.innerHTML = '';
        // Add filtered premium colors (show when bitmap says false, hide when true)
        const palette = SHOP_PREMIUM_PALETTE.filter(p => !hasShopColor(p.id));
        for (let i = 0; i < palette.length; i++) {
            const p = palette[i];
            const el = document.createElement('div');
            el.className = 'shop-palette-swatch';
            el.style.backgroundColor = 'rgb(' + p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2] + ')';
            el.title = p.label + ' (ID ' + p.id + ')';
            el.setAttribute('role', 'button');
            el.setAttribute('data-id', String(p.id));
            el.id = 'premium-color-' + String(p.id);
            el.addEventListener('click', () => {
                shopSelectedPremiumColorId = p.id;
                updatePremiumPaletteSelectionUi();
                try {
                    window.dispatchEvent(new CustomEvent('premiumColorSelected', { detail: { id: p.id } }));
                } catch { }
            });
            shopPremiumPaletteWrap.appendChild(el);
        }
        // Owned section: show colors that current account already has (disabled)
        if (shopPremiumOwnedWrap) {
            const owned = SHOP_PREMIUM_PALETTE.filter(p => hasShopColor(p.id));
            for (let i = 0; i < owned.length; i++) {
                const p = owned[i];
                const el = document.createElement('div');
                el.className = 'shop-palette-swatch disabled';
                el.style.backgroundColor = 'rgb(' + p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2] + ')';
                el.title = p.label + ' (ID ' + p.id + ')';
                shopPremiumOwnedWrap.appendChild(el);
            }
        }
        updatePremiumPaletteSelectionUi();
    } catch { }
}

function openShopAccount(row) {
    if (!row) return;
    if (!accountsSection || !shopViewSection) return;
    shopCurrentAccount = row;
    accountsSection.hidden = true;
    if (accountFormSection) accountFormSection.hidden = true;
    shopViewSection.hidden = false;
    try { if (shopBackBtn) shopBackBtn.hidden = false; } catch { }
    try {
        if (shopDropletsInfo) {
            const dRaw = (row && row.droplets != null) ? Number(row.droplets) : null;
            const label = Number.isFinite(dRaw) ? String(Math.floor(dRaw)) : '-';
            shopDropletsInfo.textContent = '💧 Droplets: ' + label;
            shopDropletsInfo.hidden = false;
        }
    } catch { }
    try {
        const dRaw = (row && row.droplets != null) ? Number(row.droplets) : null;
        shopCurrentDroplets = Number.isFinite(dRaw) ? Math.floor(dRaw) : 0;
    } catch { shopCurrentDroplets = 0; }
    // initialize shop quantities/prices
    try {
        if (shopMaxQtyEl) shopMaxQtyEl.textContent = '1';
        if (shopRecQtyEl) shopRecQtyEl.textContent = '1';
        const unitMax = 500, unitRec = 500;
        if (shopMaxPriceEl) shopMaxPriceEl.textContent = '💧 ' + (unitMax * 1) + ' Droplets';
        if (shopRecPriceEl) shopRecPriceEl.textContent = '💧 ' + (unitRec * 1) + ' Droplets';
        const maxNameEl = document.getElementById('shop-max-name');
        if (maxNameEl) maxNameEl.textContent = t('shop.maxTitle');
        const recNameEl = document.getElementById('shop-rec-name');
        if (recNameEl) recNameEl.textContent = t('shop.recTitle');
    } catch { }
    // set account-specific premium colors bitmap for filtering
    try { shopExtraColorsBitmap = Number(row && row.extraColorsBitmap != null ? row.extraColorsBitmap : 0) || 0; } catch { shopExtraColorsBitmap = 0; }
    try { renderPremiumPalette(); } catch { }
    try { updateShopButtonsDisabled(); } catch { }
    try { shopSelectedPremiumColorId = null; updatePremiumPaletteSelectionUi(); } catch { }
    try { updateShopAutobuyUi(); } catch { }
    try {
        if (shopPremiumBuyBtn) {
            shopPremiumBuyBtn.setAttribute('aria-disabled', 'true');
            shopPremiumBuyBtn.onclick = null;
            shopPremiumBuyBtn.onclick = () => {
                const hasSelection = (shopSelectedPremiumColorId != null);
                if (!hasSelection) return;
                const account = shopCurrentAccount;
                const token = account && account.token ? String(account.token) : '';
                if (!token) return;
                // Premium color purchase: productId 100, amount 1, variant = selected color id
                const amount = 1;
                const variant = Number(shopSelectedPremiumColorId);
                (async () => {
                    try {
                        const res = await fetch('/api/purchase', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ productId: 100, amount, variant, j: token })
                        });
                        const data = await res.json();
                        if (res.ok && data && data.success === true) {
                            showToast(t('messages.purchaseSuccess'), 'success', 2000);
                            try { await refreshAccountById(account.id); } catch { }
                            try {
                                if (shopDropletsInfo) {
                                    const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                                    const dRaw = updated && updated.droplets != null ? Number(updated.droplets) : null;
                                    const label = Number.isFinite(dRaw) ? String(Math.floor(dRaw)) : '-';
                                    shopDropletsInfo.textContent = '💧 Droplets: ' + label;
                                }
                            } catch { }
                            try {
                                const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                                const dRaw2 = updated && updated.droplets != null ? Number(updated.droplets) : null;
                                shopCurrentDroplets = Number.isFinite(dRaw2) ? Math.floor(dRaw2) : 0;
                                updateShopButtonsDisabled();
                            } catch { }
                            // Refresh premium palette based on updated extraColorsBitmap without page reload
                            try {
                                const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                                if (updated) {
                                    shopCurrentAccount = updated;
                                    shopExtraColorsBitmap = Number(updated.extraColorsBitmap != null ? updated.extraColorsBitmap : 0) || 0;
                                }
                                shopSelectedPremiumColorId = null;
                                renderPremiumPalette();
                                updatePremiumPaletteSelectionUi();
                            } catch { }
                        } else {
                            const msg = (data && data.error) ? String(data.error) : t('messages.purchaseFail');
                            showToast(msg, 'error', 2500);
                        }
                    } catch (e) {
                        showToast(t('messages.purchaseFail'), 'error', 2500);
                    }
                })();
            };
        }
    } catch { }
}
function showAccountList() {
    if (!accountsSection || !accountFormSection) return;
    accountFormSection.hidden = true;
    if (shopViewSection) shopViewSection.hidden = true;
    accountsSection.hidden = false;
    try { if (shopBackBtn) shopBackBtn.hidden = true; } catch { }
    try { if (shopDropletsInfo) shopDropletsInfo.hidden = true; } catch { }
    try { accountSaveBtn.textContent = t('buttons.add'); } catch { }
}

// Shop interactions
const SHOP_PRICE_MAX = 500;
const SHOP_PRICE_REC = 500;
let shopCurrentDroplets = 0;

function parseQty(el) {
    const n = parseInt((el && el.textContent) ? el.textContent.trim() : '1', 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
}
function updatePrice(which) {
    if (which === 'max') {
        const qty = parseQty(shopMaxQtyEl);
        if (shopMaxPriceEl) shopMaxPriceEl.textContent = '💧 ' + (SHOP_PRICE_MAX * qty) + ' Droplets';
        try {
            const nameEl = document.getElementById('shop-max-name');
            if (nameEl) nameEl.textContent = '+' + 5 * qty + ' Max. Charges';
        } catch { }
    } else {
        const qty = parseQty(shopRecQtyEl);
        if (shopRecPriceEl) shopRecPriceEl.textContent = '💧 ' + (SHOP_PRICE_REC * qty) + ' Droplets';
        try {
            const nameEl = document.getElementById('shop-rec-name');
            if (nameEl) nameEl.textContent = '+' + 30 * qty + ' Paint Charges';
        } catch { }
    }
    try { updateShopButtonsDisabled(); } catch { }
}
function changeQty(which, delta) {
    if (which === 'max') {
        const next = Math.max(1, parseQty(shopMaxQtyEl) + delta);
        if (shopMaxQtyEl) shopMaxQtyEl.textContent = String(next);
        updatePrice('max');
    } else {
        const next = Math.max(1, parseQty(shopRecQtyEl) + delta);
        if (shopRecQtyEl) shopRecQtyEl.textContent = String(next);
        updatePrice('rec');
    }
}
function setMaxAffordable(which) {
    const unit = which === 'max' ? SHOP_PRICE_MAX : SHOP_PRICE_REC;
    const able = Math.max(1, Math.floor((shopCurrentDroplets || 0) / unit));
    if (which === 'max') {
        if (shopMaxQtyEl) shopMaxQtyEl.textContent = String(able);
        updatePrice('max');
    } else {
        if (shopRecQtyEl) shopRecQtyEl.textContent = String(able);
        updatePrice('rec');
    }
}

function updateShopButtonsDisabled() {
    try {
        const maxQty = parseQty(shopMaxQtyEl);
        const recQty = parseQty(shopRecQtyEl);
        const costMax = SHOP_PRICE_MAX * maxQty;
        const costRec = SHOP_PRICE_REC * recQty;
        if (shopMaxPriceEl) shopMaxPriceEl.setAttribute('aria-disabled', (shopCurrentDroplets < costMax) ? 'true' : 'false');
        if (shopRecPriceEl) shopRecPriceEl.setAttribute('aria-disabled', (shopCurrentDroplets < costRec) ? 'true' : 'false');
    } catch { }
    try {
        const disabled = !(shopSelectedPremiumColorId != null);
        if (shopSelectedPremiumColorId != null && shopPremiumBuyBtn) {
            const cost = 2000; // premium color price
            shopPremiumBuyBtn.setAttribute('aria-disabled', (shopCurrentDroplets < cost) ? 'true' : 'false');
        }
    } catch { }
}

function updateShopAutobuyUi() {
    const val = shopCurrentAccount && shopCurrentAccount.autobuy;
    try {
        const onMax = val === 'max';
        if (shopMaxAutoBtn) {
            shopMaxAutoBtn.setAttribute('aria-checked', onMax ? 'true' : 'false');
            shopMaxAutoBtn.classList.toggle('on', onMax);
        }
        const onRec = val === 'rec';
        if (shopRecAutoBtn) {
            shopRecAutoBtn.setAttribute('aria-checked', onRec ? 'true' : 'false');
            shopRecAutoBtn.classList.toggle('on', onRec);
        }
    } catch { }
}

async function toggleAutobuy(which) {
    const account = shopCurrentAccount;
    if (!account) return;
    const newVal = account.autobuy === which ? null : which;
    try {
        const res = await fetch('/api/accounts/' + encodeURIComponent(String(account.id)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autobuy: newVal })
        });
        const data = await res.json();
        if (res.ok && data) {
            shopCurrentAccount = data;
            const idx = Array.isArray(accountsData) ? accountsData.findIndex(a => a && a.id === data.id) : -1;
            if (idx !== -1) accountsData[idx] = data;
            updateShopAutobuyUi();
        }
    } catch { }
}

// Wire buttons
if (shopMaxDecBtn) shopMaxDecBtn.addEventListener('click', () => changeQty('max', -1));
if (shopMaxIncBtn) shopMaxIncBtn.addEventListener('click', () => changeQty('max', +1));
if (shopMaxMaxBtn) shopMaxMaxBtn.addEventListener('click', () => setMaxAffordable('max'));
if (shopMaxAutoBtn) shopMaxAutoBtn.addEventListener('click', () => toggleAutobuy('max'));
if (shopMaxPriceEl) shopMaxPriceEl.addEventListener('click', async () => {
    // Make purchase for +5 Max. Charges using amount from qty
    try {
        const qty = parseQty(shopMaxQtyEl);
        const account = shopCurrentAccount;
        const token = account && account.token ? String(account.token) : '';
        if (!token) { showToast(t('messages.accountNotFound'), 'error', 2000); return; }
        const res = await fetch('/api/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: 70, amount: Math.max(1, Number(qty || 1)), j: token })
        });
        const data = await res.json();
        if (res.ok && data && data.success === true) {
            showToast(t('messages.purchaseSuccess'), 'success', 2000);
            try { await refreshAccountById(account.id); } catch { }
            try {
                if (shopDropletsInfo) {
                    const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                    const dRaw = updated && updated.droplets != null ? Number(updated.droplets) : null;
                    const label = Number.isFinite(dRaw) ? String(Math.floor(dRaw)) : '-';
                    shopDropletsInfo.textContent = '💧 Droplets: ' + label;
                }
            } catch { }
            // Ensure internal state is refreshed so affordability checks are correct
            try {
                const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                const dRaw2 = updated && updated.droplets != null ? Number(updated.droplets) : null;
                shopCurrentDroplets = Number.isFinite(dRaw2) ? Math.floor(dRaw2) : 0;
                updateShopButtonsDisabled();
                if (shopMaxQtyEl) shopMaxQtyEl.textContent = '1';
                updatePrice('max');
            } catch { }
        } else {
            const msg = (data && data.error) ? String(data.error) : t('messages.purchaseFail');
            showToast(msg, 'error', 2500);
        }
    } catch {
        showToast(t('messages.purchaseFail'), 'error', 2500);
    }
});
if (shopRecDecBtn) shopRecDecBtn.addEventListener('click', () => changeQty('rec', -1));
if (shopRecIncBtn) shopRecIncBtn.addEventListener('click', () => changeQty('rec', +1));
if (shopRecMaxBtn) shopRecMaxBtn.addEventListener('click', () => setMaxAffordable('rec'));
if (shopRecAutoBtn) shopRecAutoBtn.addEventListener('click', () => toggleAutobuy('rec'));
if (shopRecPriceEl) shopRecPriceEl.addEventListener('click', async () => {
    // Purchase +30 Paint Charges (product id 80) using rec qty
    try {
        const qty = parseQty(shopRecQtyEl);
        const account = shopCurrentAccount;
        const token = account && account.token ? String(account.token) : '';
        if (!token) { showToast(t('messages.accountNotFound'), 'error', 2000); return; }
        const res = await fetch('/api/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: 80, amount: Math.max(1, Number(qty || 1)), j: token })
        });
        const data = await res.json();
        if (res.ok && data && data.success === true) {
            showToast(t('messages.purchaseSuccess'), 'success', 2000);
            try { await refreshAccountById(account.id); } catch { }
            try {
                if (shopDropletsInfo) {
                    const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                    const dRaw = updated && updated.droplets != null ? Number(updated.droplets) : null;
                    const label = Number.isFinite(dRaw) ? String(Math.floor(dRaw)) : '-';
                    shopDropletsInfo.textContent = '💧 Droplets: ' + label;
                }
            } catch { }
            // Ensure internal state is refreshed so affordability checks are correct
            try {
                const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === account.id) : null;
                const dRaw2 = updated && updated.droplets != null ? Number(updated.droplets) : null;
                shopCurrentDroplets = Number.isFinite(dRaw2) ? Math.floor(dRaw2) : 0;
                updateShopButtonsDisabled();
                if (shopRecQtyEl) shopRecQtyEl.textContent = '1';
                updatePrice('rec');
            } catch { }
        } else {
            const msg = (data && data.error) ? String(data.error) : t('messages.purchaseFail');
            showToast(msg, 'error', 2500);
        }
    } catch {
        showToast(t('messages.purchaseFail'), 'error', 2500);
    }
});
if (addAccountBtn) {
    addAccountBtn.addEventListener('click', async () => {
        showAccountForm();
    });
}
if (accountCancelBtn) {
    accountCancelBtn.addEventListener('click', showAccountList);
}
if (shopBackBtn) {
    shopBackBtn.addEventListener('click', showAccountList);
}
function renderAccountsTable(rows) {
    const sortedRows = Array.isArray(rows) ? rows.slice().sort((a, b) => {
        const aActive = a && a.active !== false;
        const bActive = b && b.active !== false;
        if (aActive === bActive) return 0;
        return aActive ? 1 : -1; // Inactive first
    }) : [];
    accountsData = sortedRows.slice();
    try { recomputeActivePalette(); } catch { }
    accountsTbody.innerHTML = '';
    sortedRows.forEach(row => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td'); tdName.textContent = row.name || '';
        const tdToken = document.createElement('td');
        const fullToken = row.token || '';
        const shortToken = (fullToken && fullToken.length > 12)
            ? (fullToken.slice(0, 6) + '…' + fullToken.slice(-6))
            : fullToken;
        tdToken.textContent = shortToken;
        tdToken.title = fullToken;
        const tdDroplets = document.createElement('td');
        const dRaw = (row && row.droplets != null) ? Number(row.droplets) : null;
        tdDroplets.textContent = Number.isFinite(dRaw) ? String(Math.floor(dRaw)) : '-';
        const tdPixel = document.createElement('td');
        const countRaw = (row.pixelCount == null ? null : Number(row.pixelCount));
        const maxRaw = (row.pixelMax == null ? null : Number(row.pixelMax));
        const count = (Number.isFinite(countRaw) ? Math.floor(countRaw) : null);
        const max = (Number.isFinite(maxRaw) ? Math.floor(maxRaw) : null);
        const isActive = row && row.active !== false;
        tdPixel.textContent = (count == null || max == null) ? '-' : (String(count) + ' / ' + String(max));
        const tdStatus = document.createElement('td');
        tdStatus.textContent = isActive ? t('table.statusActive') : t('table.statusPassive');
        const tdActions = document.createElement('td');
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'table-actions';
        const rowTop = document.createElement('div');
        rowTop.className = 'table-actions-row';
        const rowBottom = document.createElement('div');
        rowBottom.className = 'table-actions-row';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'app-btn';
        editBtn.textContent = t('buttons.edit');
        editBtn.addEventListener('click', () => {
            openEditAccount(row);
        });
        const checkBtn = document.createElement('button');
        checkBtn.type = 'button';
        checkBtn.className = 'app-btn';
        checkBtn.textContent = t('buttons.checkPixels');
        checkBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/accounts/' + row.id + '/refresh', { method: 'POST' });
                if (!res.ok) return;
                const updated = await res.json();
                await loadAccounts();
            } catch { }
        });
        const shopBtn = document.createElement('button');
        shopBtn.type = 'button';
        shopBtn.className = 'app-btn';
        shopBtn.textContent = t('buttons.shop');
        // Disable shop for inactive accounts
        try { shopBtn.disabled = !isActive; } catch { }
        shopBtn.addEventListener('click', async () => {
            if (shopBtn.disabled) return;
            try { shopBtn.disabled = true; } catch { }
            try {
                const res = await fetch('/api/accounts/' + row.id + '/refresh', { method: 'POST' });

            } catch { }
            try { await loadAccounts(); } catch { }
            try {
                const updated = Array.isArray(accountsData) ? accountsData.find(r => r && r.id === row.id) : null;
                const isActive = updated && updated.active !== false;
                if (!isActive) { return; }
                openShopAccount(updated);
            } finally { try { shopBtn.disabled = false; } catch { } }
        });
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'app-btn';
        delBtn.textContent = t('buttons.delete');
        delBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/accounts/' + row.id, { method: 'DELETE' });
                await loadAccounts();
            } catch { }
        });
        rowTop.appendChild(editBtn);
        rowTop.appendChild(delBtn);
        rowBottom.appendChild(checkBtn);
        rowBottom.appendChild(shopBtn);
        actionsWrap.appendChild(rowTop);
        actionsWrap.appendChild(rowBottom);
        tdActions.appendChild(actionsWrap);
        tr.appendChild(tdName);
        tr.appendChild(tdToken);
        tr.appendChild(tdDroplets);
        tr.appendChild(tdPixel);
        tr.appendChild(tdStatus);
        tr.appendChild(tdActions);
        accountsTbody.appendChild(tr);
    });

    try {
        if (Array.isArray(sortedRows) && pixelPowerEl) {
            let totalCount = 0;
            let totalMax = 0;
            for (let i = 0; i < sortedRows.length; i++) {
                const r = sortedRows[i];
                const isActive = r && r.active !== false && !!r.token;
                if (!isActive) continue;
                const cRaw = Number(r.pixelCount);
                const mRaw = Number(r.pixelMax);
                const c = Number.isFinite(cRaw) ? Math.floor(cRaw) : null;
                const m = Number.isFinite(mRaw) ? Math.floor(mRaw) : null;
                if (c != null) totalCount += c;
                if (m != null) totalMax += m;
            }
            try { pixelPowerEl.setAttribute('data-count', String(totalCount)); pixelPowerEl.setAttribute('data-max', String(totalMax)); } catch { }
            pixelPowerEl.textContent = t('pixel.powerLabel', { count: totalCount, max: totalMax });
            try { checkFullnessNotify(); } catch { }
        }
    } catch { }
}
if (checkAllBtn) {
    checkAllBtn.addEventListener('click', async () => {
        if (bulkRefreshInFlight) return;
        try { checkAllBtn.classList.add('spinning'); } catch { }
        try { checkAllBtn.disabled = true; } catch { }
        try {
            await refreshAllAccounts();
        } finally {
            try { checkAllBtn.classList.remove('spinning'); } catch { }
            try { checkAllBtn.disabled = false; } catch { }
        }
    });
}
if (accountSaveBtn && accountsTbody) {
    accountSaveBtn.addEventListener('click', async () => {
        const id = (accountIdInput.value || '').trim();
        const name = (accountNameInput.value || '').trim();
        const token = (accountTokenInput.value || '').trim();
        const proxy = (proxyInput.value || '').trim();
        try {
            try { await loadAccounts(); } catch { }
            try {
                const dup = Array.isArray(accountsData) && accountsData.find(row => {
                    if (!row) return false;
                    const sameId = (id && String(row.id) === id);
                    return !sameId && String(row.token || '') === token;
                });
                if (dup) {
                    showToast(t('messages.tokenAlreadyExists'), 'error', 2500);
                    return;
                }
            } catch { }
            accountSaveBtn.disabled = true;
            if (id) {
                const res = await fetch('/api/accounts/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, token, proxy })
                });
                accountSaveBtn.disabled = res.ok;
                if (!res.ok) return;
                await fetch('/api/accounts/' + id + '/refresh', { method: 'POST' }).catch(() => { })
            } else {
                const res = await fetch('/api/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, token, proxy })
                });
                accountSaveBtn.disabled = res.ok;
                if (!res.ok) return;

                const created = await res.json();
                if (created && created.id != null) {
                    await fetch('/api/accounts/' + String(created.id) + '/refresh', { method: 'POST' }).catch(() => { })
                }
            }
            accountSaveBtn.disabled = false;
            await loadAccounts();
            showAccountList();
        } catch { }
    });
}
let accountTokenInputDebounce = null;
if (accountTokenInput) {
    accountTokenInput.addEventListener('input', () => {
        const id = (accountIdInput && accountIdInput.value) ? accountIdInput.value.trim() : '';
        if (!id) return;
        const name = (accountNameInput && accountNameInput.value) ? accountNameInput.value.trim() : '';
        const token = (accountTokenInput && accountTokenInput.value) ? accountTokenInput.value.trim() : '';
        try { if (accountTokenInputDebounce) clearTimeout(accountTokenInputDebounce); } catch { }
        accountTokenInputDebounce = setTimeout(async () => {
            try {
                if (!token) return;
                try { await loadAccounts(); } catch { }
                try {
                    const dup = Array.isArray(accountsData) && accountsData.find(row => {
                        if (!row) return false;
                        const sameId = (id && String(row.id) === id);
                        return !sameId && String(row.token || '') === token;
                    });
                    if (dup) {
                        showToast(t('messages.tokenAlreadyExists'), 'error', 2500);
                        return;
                    }
                } catch { }
                await fetch('/api/accounts/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, token })
                });
                await fetch('/api/accounts/' + id + '/refresh', { method: 'POST' });
                await loadAccounts();
            } catch { }
        }, 800);
    });
}

accountsClose.addEventListener('click', () => {
    accountsModal.hidden = true;
});
accountsModal.addEventListener('click', (e) => {
    if (e.target === accountsModal) accountsModal.hidden = true;
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') accountsModal.hidden = true;
});

function fetchTile(area, no) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = buildUrl(area, no) + '?t=' + Date.now();
    });
}




sign.addEventListener('load', () => { });


uploadBtn.addEventListener('click', () => {
    try { signFileInput.value = ''; } catch { }
    signFileInput.click();
});
const imgPreviewModal = document.getElementById('img-preview-modal');
const imgPreviewCanvas = document.getElementById('img-preview-canvas');
const imgPreviewClose = document.getElementById('img-preview-close');
const imgPreviewCancel = document.getElementById('img-preview-cancel');
const imgPreviewApply = document.getElementById('img-preview-apply');
const imgScaleInput = document.getElementById('img-scale');
const imgKeepRatioInput = document.getElementById('img-keep-ratio');
const imgWidthInput = document.getElementById('img-width');
const imgHeightInput = document.getElementById('img-height');
const imgFillToggle = document.getElementById('img-fill-toggle');
const imgFillColorWrap = document.getElementById('img-fill-color');
const imgAlphaInput = document.getElementById('img-alpha-input');
const imgColorMetricSelect = document.getElementById('img-color-metric');
const imgDitherToggle = document.getElementById('img-dither-toggle');
let imgDitherEnabled = false;
let imgFillColorId = null; // null => none, number => palette id
let previewSourceImage = null;

function updateDitherButtonUi() {
    if (!imgDitherToggle) return;
    const key = imgDitherEnabled ? 'preview.ditheringOn' : 'preview.ditheringOff';
    imgDitherToggle.textContent = t(key);
    imgDitherToggle.dataset.state = imgDitherEnabled ? 'on' : 'off';
}

function openImagePreview(image, filename) {
    previewSourceImage = image;
    const w = image.naturalWidth | 0;
    const h = image.naturalHeight | 0;
    try { imgWidthInput.value = String(w); } catch { }
    try { imgHeightInput.value = String(h); } catch { }
    try { imgScaleInput.value = '100'; } catch { }
    try { if (imgFillToggle) imgFillToggle.checked = false; } catch { }
    imgFillColorId = null;
    buildFillPaletteUi();
    try { if (imgFillColorWrap) imgFillColorWrap.setAttribute('aria-disabled', 'true'); } catch { }
    try { imgAlphaInput.value = '5'; } catch { }
    try { imgColorMetricSelect.value = 'oklab'; } catch { }
    imgDitherEnabled = false;
    updateDitherButtonUi();
    drawPreview();
    imgPreviewModal.hidden = false;
    try {
        document.body.classList.add('no-scroll');
        if (colorPaletteEl) colorPaletteEl.hidden = true;
        if (paletteModeEl) paletteModeEl.hidden = true;
    } catch { }
    imgPreviewApply._filename = filename || 'image.png';
}
function drawPreview() {
    if (!imgPreviewCanvas || !previewSourceImage) return;
    const ctxp = imgPreviewCanvas.getContext('2d');
    ctxp.imageSmoothingEnabled = false;
    ctxp.clearRect(0, 0, imgPreviewCanvas.width, imgPreviewCanvas.height);
    const targetW = Math.max(1, parseInt(imgWidthInput.value || '1', 10));
    const targetH = Math.max(1, parseInt(imgHeightInput.value || '1', 10));
    const off = document.createElement('canvas'); off.width = targetW; off.height = targetH;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = false;
    octx.drawImage(previewSourceImage, 0, 0, previewSourceImage.naturalWidth, previewSourceImage.naturalHeight, 0, 0, targetW, targetH);
    try {
        const id = octx.getImageData(0, 0, targetW, targetH);
        const data = id.data;
        const alphaTh = imgAlphaInput ? parseInt(imgAlphaInput.value || '0', 10) : 0;
        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = (data[i + 3] <= alphaTh) ? 0 : 255;
        }
        const metric = imgColorMetricSelect ? imgColorMetricSelect.value : 'oklab';
        if (imgDitherEnabled) {
            const w2 = targetW + 2;
            const errCurrR = new Float32Array(w2), errCurrG = new Float32Array(w2), errCurrB = new Float32Array(w2);
            const errNextR = new Float32Array(w2), errNextG = new Float32Array(w2), errNextB = new Float32Array(w2);
            for (let y = 0; y < targetH; y++) {
                const leftToRight = (y % 2 === 0);
                if (leftToRight) {
                    for (let x = 0; x < targetW; x++) {
                        const idx = (y * targetW + x) * 4;
                        if (data[idx + 3] === 0) continue;
                        let r = data[idx] + errCurrR[x + 1];
                        let g = data[idx + 1] + errCurrG[x + 1];
                        let b = data[idx + 2] + errCurrB[x + 1];
                        r = r < 0 ? 0 : (r > 255 ? 255 : r);
                        g = g < 0 ? 0 : (g > 255 ? 255 : g);
                        b = b < 0 ? 0 : (b > 255 ? 255 : b);
                        const nn = nearestPaletteColor(r, g, b, metric);
                        data[idx] = nn[0]; data[idx + 1] = nn[1]; data[idx + 2] = nn[2];
                        const er = r - nn[0];
                        const eg = g - nn[1];
                        const eb = b - nn[2];
                        errCurrR[x + 2] += er * (7 / 16); errCurrG[x + 2] += eg * (7 / 16); errCurrB[x + 2] += eb * (7 / 16);
                        errNextR[x] += er * (3 / 16); errNextG[x] += eg * (3 / 16); errNextB[x] += eb * (3 / 16);
                        errNextR[x + 1] += er * (5 / 16); errNextG[x + 1] += eg * (5 / 16); errNextB[x + 1] += eb * (5 / 16);
                        errNextR[x + 2] += er * (1 / 16); errNextG[x + 2] += eg * (1 / 16); errNextB[x + 2] += eb * (1 / 16);
                    }
                } else {
                    for (let x = targetW - 1; x >= 0; x--) {
                        const idx = (y * targetW + x) * 4;
                        if (data[idx + 3] === 0) continue;
                        let r = data[idx] + errCurrR[x + 1];
                        let g = data[idx + 1] + errCurrG[x + 1];
                        let b = data[idx + 2] + errCurrB[x + 1];
                        r = r < 0 ? 0 : (r > 255 ? 255 : r);
                        g = g < 0 ? 0 : (g > 255 ? 255 : g);
                        b = b < 0 ? 0 : (b > 255 ? 255 : b);
                        const nn = nearestPaletteColor(r, g, b, metric);
                        data[idx] = nn[0]; data[idx + 1] = nn[1]; data[idx + 2] = nn[2];
                        const er = r - nn[0];
                        const eg = g - nn[1];
                        const eb = b - nn[2];
                        errCurrR[x] += er * (7 / 16); errCurrG[x] += eg * (7 / 16); errCurrB[x] += eb * (7 / 16);
                        errNextR[x + 2] += er * (3 / 16); errNextG[x + 2] += eg * (3 / 16); errNextB[x + 2] += eb * (3 / 16);
                        errNextR[x + 1] += er * (5 / 16); errNextG[x + 1] += eg * (5 / 16); errNextB[x + 1] += eb * (5 / 16);
                        errNextR[x] += er * (1 / 16); errNextG[x] += eg * (1 / 16); errNextB[x] += eb * (1 / 16);
                    }
                }
                for (let i = 0; i < w2; i++) { errCurrR[i] = errNextR[i]; errCurrG[i] = errNextG[i]; errCurrB[i] = errNextB[i]; errNextR[i] = 0; errNextG[i] = 0; errNextB[i] = 0; }
            }
        } else {
            for (let y = 0; y < targetH; y++) {
                for (let x = 0; x < targetW; x++) {
                    const idx = (y * targetW + x) * 4;
                    if (data[idx + 3] === 0) continue;
                    const nn = nearestPaletteColor(data[idx], data[idx + 1], data[idx + 2], metric);
                    data[idx] = nn[0]; data[idx + 1] = nn[1]; data[idx + 2] = nn[2];
                }
            }
        }
        octx.putImageData(id, 0, 0);
    } catch { }
    // Compose optional background fill for display
    let disp = off;
    if (imgFillToggle && imgFillToggle.checked && imgFillColorId != null) {
        const bg = document.createElement('canvas');
        bg.width = targetW; bg.height = targetH;
        const bctx = bg.getContext('2d', { willReadFrequently: true });
        const rgb = getPaletteRgbById(imgFillColorId);
        bctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        bctx.fillRect(0, 0, targetW, targetH);
        bctx.drawImage(off, 0, 0);
        disp = bg;
    }
    const scale = Math.min(imgPreviewCanvas.width / targetW, imgPreviewCanvas.height / targetH);
    const drawW = Math.floor(targetW * scale);
    const drawH = Math.floor(targetH * scale);
    const dx = Math.floor((imgPreviewCanvas.width - drawW) / 2);
    const dy = Math.floor((imgPreviewCanvas.height - drawH) / 2);
    ctxp.drawImage(disp, 0, 0, targetW, targetH, dx, dy, drawW, drawH);
}
const MAX_DIM = 1000;
function clampDim(v) { return Math.max(1, Math.min(MAX_DIM, v | 0)); }
function updateSizeFromScale() {
    const pct = Math.max(1, Math.min(800, parseInt(imgScaleInput.value || '100', 10)));
    if (!previewSourceImage) return;
    const w0 = previewSourceImage.naturalWidth | 0, h0 = previewSourceImage.naturalHeight | 0;
    let nw = Math.round(w0 * pct / 100);
    let nh = Math.round(h0 * pct / 100);
    if (nw > MAX_DIM || nh > MAX_DIM) {
        const s = Math.min(MAX_DIM / nw, MAX_DIM / nh);
        nw = Math.max(1, Math.round(nw * s));
        nh = Math.max(1, Math.round(nh * s));
        try { showToast(t('preview.maxSizeExceeded'), 'error', 2000); } catch { }
    }
    imgWidthInput.value = String(nw);
    imgHeightInput.value = String(nh);
    drawPreview();
}
function updateHeightFromWidth() {
    if (!previewSourceImage) { drawPreview(); return; }
    let nw = clampDim(parseInt(imgWidthInput.value || '1', 10));
    imgWidthInput.value = String(nw);
    if (!imgKeepRatioInput.checked) { drawPreview(); return; }
    const w0 = previewSourceImage.naturalWidth | 0, h0 = previewSourceImage.naturalHeight | 0;
    let nh = Math.round(nw * h0 / w0);
    if (nh > MAX_DIM) { nh = MAX_DIM; nw = Math.round(nh * w0 / h0); imgWidthInput.value = String(nw); try { showToast(t('preview.maxSizeExceeded'), 'error', 2000); } catch { } }
    imgHeightInput.value = String(nh);
    const pct = Math.round(nw / w0 * 100);
    imgScaleInput.value = String(pct);
    drawPreview();
}
function updateWidthFromHeight() {
    if (!previewSourceImage) { drawPreview(); return; }
    let nh = clampDim(parseInt(imgHeightInput.value || '1', 10));
    imgHeightInput.value = String(nh);
    if (!imgKeepRatioInput.checked) {
        const w0 = previewSourceImage.naturalWidth | 0, h0 = previewSourceImage.naturalHeight | 0;
        const pct = Math.round(nh / (h0 || 1) * 100);
        imgScaleInput.value = String(pct);
        drawPreview();
        return;
    }
    const w0 = previewSourceImage.naturalWidth | 0, h0 = previewSourceImage.naturalHeight | 0;
    let nw = Math.round(nh * w0 / h0);
    if (nw > MAX_DIM) { nw = MAX_DIM; nh = Math.round(nw * h0 / w0); imgHeightInput.value = String(nh); try { showToast(t('preview.maxSizeExceeded'), 'error', 2000); } catch { } }
    imgWidthInput.value = String(nw);
    const pct = Math.round(nh / h0 * 100);
    imgScaleInput.value = String(pct);
    drawPreview();
}
if (imgScaleInput) imgScaleInput.addEventListener('input', updateSizeFromScale);
if (imgWidthInput) imgWidthInput.addEventListener('change', updateHeightFromWidth);
if (imgHeightInput) imgHeightInput.addEventListener('change', updateWidthFromHeight);
if (imgKeepRatioInput) imgKeepRatioInput.addEventListener('change', () => { drawPreview(); });
if (imgAlphaInput) {
    imgAlphaInput.addEventListener('input', () => {
        let v = parseInt(imgAlphaInput.value || '0', 10);
        if (isNaN(v)) v = 0;
        if (v < 0) v = 0; else if (v > 255) v = 255;
        imgAlphaInput.value = String(v);
        drawPreview();
    });
}
if (imgColorMetricSelect) imgColorMetricSelect.addEventListener('change', () => { drawPreview(); });
if (imgDitherToggle) imgDitherToggle.addEventListener('click', () => { imgDitherEnabled = !imgDitherEnabled; updateDitherButtonUi(); drawPreview(); });
function buildFillPaletteUi() {
    if (!imgFillColorWrap) return;
    try { imgFillColorWrap.innerHTML = ''; } catch { }
    // Transparent option (none)
    const swNone = document.createElement('div');
    swNone.className = 'palette-swatch modal-palette-swatch transparent selected';
    swNone.title = t('palette.transparentTitle');
    swNone.setAttribute('role', 'button');
    swNone.addEventListener('click', () => {
        imgFillColorId = null;
        updateFillPaletteSelectionUi();
        drawPreview();
        try { localStorage.removeItem('img.fillColorId'); } catch { }
    });
    imgFillColorWrap.appendChild(swNone);
    const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const el = document.createElement('div');
        el.className = 'palette-swatch modal-palette-swatch';
        el.style.backgroundColor = 'rgb(' + p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2] + ')';
        setPaletteSwatchTitle(el, p);
        el.setAttribute('data-id', String(p.id));
        el.setAttribute('role', 'button');
        el.addEventListener('click', () => {
            imgFillColorId = p.id;
            updateFillPaletteSelectionUi();
            drawPreview();
            try { localStorage.setItem('img.fillColorId', String(p.id)); } catch { }
        });
        imgFillColorWrap.appendChild(el);
    }
    updateFillPaletteSelectionUi();
    // Restore last chosen fill color if exists
    try {
        const savedFill = localStorage.getItem('img.fillColorId');
        if (savedFill != null) {
            imgFillColorId = Number(savedFill);
            updateFillPaletteSelectionUi();
            drawPreview();
        }
    } catch { }
}
function updateFillPaletteSelectionUi() {
    if (!imgFillColorWrap) return;
    const swatches = Array.from(imgFillColorWrap.querySelectorAll('.modal-palette-swatch'));
    swatches.forEach(sw => {
        const idAttr = sw.getAttribute('data-id');
        const id = idAttr == null ? null : Number(idAttr);
        const isSelected = (idAttr == null && imgFillColorId == null) || (idAttr != null && id === imgFillColorId);
        sw.classList.toggle('selected', !!isSelected);
    });
}
if (imgFillToggle) imgFillToggle.addEventListener('change', () => {
    try { imgFillColorWrap.setAttribute('aria-disabled', imgFillToggle.checked ? 'false' : 'true'); } catch { }
    drawPreview();
});
function closeImgPreview() {
    try {
        document.body.classList.remove('no-scroll');
        if (colorPaletteEl) colorPaletteEl.hidden = false;
        if (paletteModeEl) paletteModeEl.hidden = false;
    } catch { }
    imgPreviewModal.hidden = true;
}
if (imgPreviewClose) imgPreviewClose.addEventListener('click', closeImgPreview);
if (imgPreviewCancel) imgPreviewCancel.addEventListener('click', closeImgPreview);
if (imgPreviewApply) imgPreviewApply.addEventListener('click', async () => {
    try {
        if (!previewSourceImage) return;
        let targetW = clampDim(parseInt(imgWidthInput.value || '1', 10));
        let targetH = clampDim(parseInt(imgHeightInput.value || '1', 10));
        if (targetW > MAX_DIM || targetH > MAX_DIM) { try { showToast(t('preview.maxSizeExceeded'), 'error', 2000); } catch { } }
        const off = document.createElement('canvas');
        off.width = targetW; off.height = targetH;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.imageSmoothingEnabled = false;
        if (imgFillToggle && imgFillToggle.checked && imgFillColorId != null) {
            const rgb = getPaletteRgbById(imgFillColorId);
            octx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
            octx.fillRect(0, 0, targetW, targetH);
        }
        octx.drawImage(previewSourceImage, 0, 0, previewSourceImage.naturalWidth, previewSourceImage.naturalHeight, 0, 0, targetW, targetH);
        const blob = await new Promise((resolve) => { off.toBlob((b) => resolve(b), 'image/png'); });
        const url0 = URL.createObjectURL(blob);
        const tmpImg = new Image();
        tmpImg.onload = async () => {
            URL.revokeObjectURL(url0);
            const qBlob = await quantizeImageToPalette(tmpImg);
            // Persist quantized image as data URL for future sessions
            try {
                const reader = new FileReader();
                reader.onloadend = () => {
                    try { localStorage.setItem('last.image.dataUrl', String(reader.result || '')); } catch { }
                };
                reader.readAsDataURL(qBlob);
            } catch { }
            const url = URL.createObjectURL(qBlob);
            const imageEl = new Image();
            imageEl.onload = () => {
                const pixelCount = countNonTransparentPixels(imageEl);
                const item = { url, name: imgPreviewApply._filename || 'image.png', image: imageEl, originalImage: imageEl, worldX: 0, worldY: 0, el: null, locked: false, pixelCount };
                const centerPx = getContentCenterPx();
                const centerWorldX = (centerPx.x - state.translateX) / state.scale;
                const centerWorldY = (centerPx.y - state.translateY) / state.scale;
                item.worldX = centerWorldX - imageEl.naturalWidth / 2;
                item.worldY = centerWorldY - imageEl.naturalHeight / 2;
                if (img) {
                    const maxX = Math.max(0, img.width - imageEl.naturalWidth);
                    const maxY = Math.max(0, img.height - imageEl.naturalHeight);
                    item.worldX = Math.min(Math.max(0, item.worldX), maxX);
                    item.worldY = Math.min(Math.max(0, item.worldY), maxY);
                }
                signItems.push(item);
                selectedIndex = signItems.length - 1;
                addThumbForItem(item, signItems.length - 1);
                updateCounter();
                try { saveImagesToStorage(); } catch { }
                // Always focus newly added image at current viewport center
                pendingZoomToSelected = true;
                scheduleRender();
                if (pendingZoomToSelected) { pendingZoomToSelected = false; zoomToSign(item); }
                try { localStorage.setItem('last.image.url', url); localStorage.setItem('last.image.name', item.name || 'image.png'); } catch { }
                closeImgPreview();
            };
            imageEl.src = url;
        };
        tmpImg.src = url0;
    } catch { }
});

signFileInput.addEventListener('change', () => {
    const files = Array.from(signFileInput.files || []);
    if (!files.length) return;
    const file = files[0];
    const tmpUrl = URL.createObjectURL(file);
    const tmpImg = new Image();
    tmpImg.onload = () => {
        URL.revokeObjectURL(tmpUrl);
        openImagePreview(tmpImg, file.name);
    };
    tmpImg.src = tmpUrl;
});




try {
    const savedArea = localStorage.getItem('areaCode') || localStorage.getItem('area code');
    const savedNo = localStorage.getItem('areaNo') || localStorage.getItem('no');
    if (savedArea) areaInput.value = savedArea;
    if (savedNo) noInput.value = savedNo;
} catch { }
const readyBtn = document.getElementById('btn-ready');
const readyPopup = document.getElementById('ready-popup');
const autoSelectBtn = document.getElementById('btn-auto-select');
const autoSelectAccountsBtn = document.getElementById('btn-auto-select-accounts');
const startBtn = document.getElementById('start');
const readyPixelEl = document.getElementById('ready-pixel');
let xpawToken = '';
try { xpawToken = localStorage.getItem('last.captured.xpaw') || ''; } catch { }
const readyAccountBtn = document.getElementById('btn-ready-account');
const readyAccountList = document.getElementById('ready-account-list');
// Listen for token events from local server (extension posts here)
(function initTokenSse() {
    const es = new EventSource('/api/events');
    es.addEventListener('token', async (ev) => {
        if (!autoStart) {
            return;
        }
        showToast(t('messages.tokenPastedFromExtension'), 'success', 1200);
        try {
            const rp = document.getElementById('ready-popup');
            const isOpen = rp && !rp.hidden;
            if (isOpen) {
                updateStartEnabled();
                const startBtn = document.getElementById('start');
                const canStart = startBtn && !startBtn.disabled;
                if (canStart) {
                    await new Promise(r => setTimeout(r, 100));
                    startBtn.click();
                }
            }
        } catch { }
    });
})();
const autoModeTrack = document.getElementById('auto-mode-toggle');
const autoModeLabelLeft = document.getElementById('auto-mode-label-left');
const autoModeLabelRight = document.getElementById('auto-mode-label-right');
const autoStartTrack = document.getElementById('auto-start-toggle');
const autoStartLabelLeft = document.getElementById('auto-start-label-left');
const autoStartLabelRight = document.getElementById('auto-start-label-right');
const humanDelayTrack = document.getElementById('human-delay-toggle');
const humanDelayLabelLeft = document.getElementById('human-delay-label-left');
const humanDelayLabelRight = document.getElementById('human-delay-label-right');
const humanDelayInputs = document.getElementById('human-delay-inputs');
const humanMinInput = document.getElementById('human-min');
const humanMaxInput = document.getElementById('human-max');

const selectModeTrack = document.getElementById('select-mode-toggle');
const selectModeLabelLeft = document.getElementById('select-mode-label-left');
const selectModeLabelRight = document.getElementById('select-mode-label-right');
const selectModeLabelColor = document.getElementById('select-mode-label-color');
let selectMode = 'multi';
let autoMode = false;
let autoStart = false;
let humanDelayEnabled = false;
let humanDelayMin = 30;
let humanDelayMax = 60;

function updateSelectModeUi() {
    try { if (selectModeTrack) selectModeTrack.setAttribute('data-mode', selectMode); } catch { }
    try { if (selectModeLabelLeft) selectModeLabelLeft.classList.toggle('active', selectMode === 'multi'); } catch { }
    try { if (selectModeLabelRight) selectModeLabelRight.classList.toggle('active', selectMode === 'frame'); } catch { }
    try { if (selectModeLabelColor) selectModeLabelColor.classList.toggle('active', selectMode === 'color'); } catch { }
}
function setSelectMode(mode) {
    if (mode === 'frame' || mode === 'color') {
        selectMode = mode;
    } else {
        selectMode = 'multi';
    }
    updateSelectModeUi();
}
function updateAutoModeUi() {
    try { if (autoModeTrack) autoModeTrack.classList.toggle('on', !!autoMode); } catch { }
    try { if (autoModeTrack) autoModeTrack.setAttribute('aria-checked', autoMode ? 'true' : 'false'); } catch { }
    try { if (autoModeLabelLeft) autoModeLabelLeft.classList.toggle('active', !autoMode); } catch { }
    try { if (autoModeLabelRight) autoModeLabelRight.classList.toggle('active', !!autoMode); } catch { }
}
function updateAutoStartUi() {
    try { if (autoStartTrack) autoStartTrack.classList.toggle('on', !!autoStart); } catch { }
    try { if (autoStartTrack) autoStartTrack.setAttribute('aria-checked', autoStart ? 'true' : 'false'); } catch { }
    try { if (autoStartLabelLeft) autoStartLabelLeft.classList.toggle('active', !autoStart); } catch { }
    try { if (autoStartLabelRight) autoStartLabelRight.classList.toggle('active', !!autoStart); } catch { }
}
function updateHumanDelayUi() {
    try { if (humanDelayTrack) humanDelayTrack.classList.toggle('on', !!humanDelayEnabled); } catch { }
    try { if (humanDelayTrack) humanDelayTrack.setAttribute('aria-checked', humanDelayEnabled ? 'true' : 'false'); } catch { }
    try { if (humanDelayLabelLeft) humanDelayLabelLeft.classList.toggle('active', !humanDelayEnabled); } catch { }
    try { if (humanDelayLabelRight) humanDelayLabelRight.classList.toggle('active', !!humanDelayEnabled); } catch { }
    try { if (humanDelayInputs) humanDelayInputs.hidden = !humanDelayEnabled; } catch { }
    try { if (humanMinInput) humanMinInput.value = humanDelayMin; } catch { }
    try { if (humanMaxInput) humanMaxInput.value = humanDelayMax; } catch { }
}
try {
    const savedAuto = localStorage.getItem('ready.autoMode');
    autoMode = (savedAuto === '1' || savedAuto === 'true');
    updateAutoModeUi();
    const savedAutoStart = localStorage.getItem('ready.autoStart');
    autoStart = (savedAutoStart === '1' || savedAutoStart === 'true');
    updateAutoStartUi();
    const savedHuman = localStorage.getItem('ready.humanDelay');
    humanDelayEnabled = (savedHuman === '1' || savedHuman === 'true');
    const savedMin = localStorage.getItem('ready.humanMin');
    if (savedMin) humanDelayMin = Math.max(0, parseInt(savedMin));
    const savedMax = localStorage.getItem('ready.humanMax');
    if (savedMax) humanDelayMax = Math.max(0, parseInt(savedMax));
    updateHumanDelayUi();
} catch { }
if (autoModeTrack) autoModeTrack.addEventListener('click', () => {
    autoMode = !autoMode;
    try { localStorage.setItem('ready.autoMode', autoMode ? '1' : '0'); } catch { }
    updateAutoModeUi();
});
if (autoStartTrack) autoStartTrack.addEventListener('click', () => {
    autoStart = !autoStart;
    try { localStorage.setItem('ready.autoStart', autoStart ? '1' : '0'); } catch { }
    updateAutoStartUi();
});
if (autoModeLabelLeft) autoModeLabelLeft.addEventListener('click', () => { autoMode = false; try { localStorage.setItem('ready.autoMode', '0'); } catch { }; updateAutoModeUi(); });
if (autoModeLabelRight) autoModeLabelRight.addEventListener('click', () => { autoMode = true; try { localStorage.setItem('ready.autoMode', '1'); } catch { }; updateAutoModeUi(); });
if (autoStartLabelLeft) autoStartLabelLeft.addEventListener('click', () => { autoStart = false; try { localStorage.setItem('ready.autoStart', '0'); } catch { }; updateAutoStartUi(); });
if (autoStartLabelRight) autoStartLabelRight.addEventListener('click', () => { autoStart = true; try { localStorage.setItem('ready.autoStart', '1'); } catch { }; updateAutoStartUi(); });
if (humanDelayTrack) humanDelayTrack.addEventListener('click', () => {
    humanDelayEnabled = !humanDelayEnabled;
    try { localStorage.setItem('ready.humanDelay', humanDelayEnabled ? '1' : '0'); } catch { }
    updateHumanDelayUi();
});
if (humanDelayLabelLeft) humanDelayLabelLeft.addEventListener('click', () => {
    humanDelayEnabled = false;
    try { localStorage.setItem('ready.humanDelay', '0'); } catch { }
    updateHumanDelayUi();
});
if (humanDelayLabelRight) humanDelayLabelRight.addEventListener('click', () => {
    humanDelayEnabled = true;
    try { localStorage.setItem('ready.humanDelay', '1'); } catch { }
    updateHumanDelayUi();
});
if (humanMinInput) humanMinInput.addEventListener('change', () => {
    let val = parseInt(humanMinInput.value);
    if (isNaN(val) || val < 0) val = 0;
    humanDelayMin = val;
    try { localStorage.setItem('ready.humanMin', String(humanDelayMin)); } catch { }
});
if (humanMaxInput) humanMaxInput.addEventListener('change', () => {
    let val = parseInt(humanMaxInput.value);
    if (isNaN(val) || val < 0) val = 0;
    humanDelayMax = val;
    try { localStorage.setItem('ready.humanMax', String(humanDelayMax)); } catch { }
});

if (selectModeTrack) selectModeTrack.addEventListener('click', () => {
    const next = selectMode === 'multi' ? 'frame' : (selectMode === 'frame' ? 'color' : 'multi');
    setSelectMode(next);
});
if (selectModeLabelLeft) selectModeLabelLeft.addEventListener('click', () => setSelectMode('multi'));
if (selectModeLabelRight) selectModeLabelRight.addEventListener('click', () => setSelectMode('frame'));
if (selectModeLabelColor) selectModeLabelColor.addEventListener('click', () => setSelectMode('color'));

function getAccountById(id) {
    const idStr = String(id);
    for (let i = 0; i < accountsData.length; i++) {
        const a = accountsData[i];
        if (String(a.id) === idStr) return a;
    }
    return null;
}

function getReadySelectedCount() {
    const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
    const map = getSelectedMap(sel);
    return map ? map.size : 0;
}

function getReadySelectionLimit() {
    if (!Array.isArray(readySelectedAccountIds) || readySelectedAccountIds.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < readySelectedAccountIds.length; i++) {
        const a = getAccountById(readySelectedAccountIds[i]);
        if (!a || a.active === false || !a.token) continue;
        const c = Number.isFinite(Number(a.pixelCount)) ? Number(a.pixelCount) : 0;
        total += Math.max(0, Math.floor(c));
    }
    return total;
}

function updateReadySelectionLabel() {
    if (!readyPixelEl) return;
    const selected = readyGlobalMode ? readyGlobalSelected.size : getReadySelectedCount();
    const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
    const count = selected;
    try { readyPixelEl.setAttribute('data-count', String(count)); readyPixelEl.setAttribute('data-max', String(limit)); } catch { }
    readyPixelEl.textContent = t('pixel.powerLabel', { count, max: limit });
    try { updateAutoSelectButtonLabel(); } catch { }
}

function updateAutoSelectButtonLabel() {
    if (!autoSelectBtn) return;
    const selected = readyGlobalMode ? readyGlobalSelected.size : getReadySelectedCount();
    const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
    const shouldDelete = (limit > 0 && selected >= limit);
    autoSelectDeleteMode = !!shouldDelete;
    try {
        autoSelectBtn.textContent = shouldDelete ? t('ready.deleteAllSelected') : t('ready.autoSelect');
    } catch {
        autoSelectBtn.textContent = shouldDelete ? 'Delete all selected' : 'Auto select';
    }
}

function updateReadyPixelForSelectedAccounts() {
    updateReadySelectionLabel();
    try { updateStartEnabled(); } catch { }
}

function renderReadyAccountList() {
    if (!readyAccountList) return;
    readyAccountList.innerHTML = '';
    // Sort by fill ratio (count/max) desc, then count desc, then max desc
    const sortedRows = [];
    accountsData.forEach(row => {
        const isActive = row && row.active !== false;
        const hasToken = !!(row && row.token);
        if (!isActive || !hasToken) return;
        const count = Number.isFinite(Number(row.pixelCount)) ? Number(row.pixelCount) : 0;
        const max = Number.isFinite(Number(row.pixelMax)) ? Number(row.pixelMax) : 0;
        const ratio = (max > 0 ? (count / max) : -1);
        sortedRows.push({ row, count, max, ratio });
    });
    sortedRows.sort((a, b) => {
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        if (b.count !== a.count) return b.count - a.count;
        return b.max - a.max;
    });
    sortedRows.forEach(({ row, count, max }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-btn';
        const isSelected = readySelectedAccountIds.indexOf(row.id) !== -1;
        btn.textContent = (isSelected ? '✓ ' : '') + (row.name || t('ready.accountLabelDefault')) + ' — ' + String(count) + ' / ' + String(max);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        btn.addEventListener('click', () => {
            const isSelectedNow = readySelectedAccountIds.indexOf(row.id) !== -1;
            if (isSelectedNow) {
                readySelectedAccountIds = [];
            } else {
                readySelectedAccountIds = [row.id];
            }
            try { renderReadyAccountList(); } catch { }
            try { if (readyPixelEl) readyPixelEl.hidden = false; } catch { }
            updateReadyPixelForSelectedAccounts();
            try { refreshPaletteTooltips(); } catch { }
        });
        readyAccountList.appendChild(btn);
    });
    try { updateAutoSelectButtonLabel(); } catch { }
}

function autoSelectTopAccountsByRatio() {
    try {
        const candidates = Array.isArray(accountsData) ? accountsData.filter(row => {
            const isActive = row && row.active !== false && !!row.token;
            const countRaw = Number(row && row.pixelCount);
            const maxRaw = Number(row && row.pixelMax);
            const valid = Number.isFinite(countRaw) && Number.isFinite(maxRaw) && maxRaw > 0;
            return isActive && valid;
        }).map(row => {
            const count = Math.floor(Number(row.pixelCount));
            const max = Math.floor(Number(row.pixelMax));
            const ratio = (max > 0 ? (count / max) : -1);
            return { id: row.id, ratio, count, max };
        }) : [];
        candidates.sort((a, b) => {
            if (b.ratio !== a.ratio) return b.ratio - a.ratio;
            if (b.count !== a.count) return b.count - a.count;
            return b.max - a.max;
        });
        const top = candidates.slice(0, MAX_READY_ACCOUNTS).map(x => x.id);
        readySelectedAccountIds = top;
        try { renderReadyAccountList(); } catch { }
        try { if (readyPixelEl) readyPixelEl.hidden = false; } catch { }
        updateReadyPixelForSelectedAccounts();
    } catch { }
}

function pickNextBestAccountId(excludeIds = []) {
    try {
        const excludeSet = new Set((excludeIds || []).map(x => String(x)));
        const list = [];
        accountsData.forEach(row => {
            const isActive = row && row.active !== false && !!row.token;
            const countRaw = Number(row && row.pixelCount);
            const maxRaw = Number(row && row.pixelMax);
            const valid = Number.isFinite(countRaw) && Number.isFinite(maxRaw) && maxRaw > 0;
            if (!isActive || !valid) return;
            const idStr = String(row.id);
            const ratio = (maxRaw > 0 ? (countRaw / maxRaw) : -1);
            list.push({ id: row.id, idStr, ratio, count: Math.floor(countRaw), max: Math.floor(maxRaw) });
        });
        list.sort((a, b) => {
            if (b.ratio !== a.ratio) return b.ratio - a.ratio;
            if (b.count !== a.count) return b.count - a.count;
            return b.max - a.max;
        });
        for (let i = 0; i < list.length; i++) {
            if (!excludeSet.has(list[i].idStr)) return list[i].id;
        }
        return null;
    } catch { return null; }
}

// Single-account mode: we no longer auto-select on open; user picks explicitly.

if (readyAccountBtn) {
    readyAccountBtn.addEventListener('click', () => {
        try { renderReadyAccountList(); } catch { }
        if (readyAccountList) readyAccountList.hidden = !readyAccountList.hidden;
    });
}
if (autoSelectAccountsBtn) {
    autoSelectAccountsBtn.addEventListener('click', async () => {
        try { await loadAccounts(); } catch { }
        autoSelectTopAccountsByRatio();
    });
}

function resetReadyNow() {
    if (window._autoStartTimer) { clearInterval(window._autoStartTimer); window._autoStartTimer = null; }
    const cdEl = document.getElementById('auto-start-countdown');
    if (cdEl) cdEl.textContent = '';
    try { if (readyPopup) readyPopup.hidden = true; } catch { }
    try {
        if (readyLockedItem) { readyLockedItem.lockedByReady = false; updateItemLockUi(readyLockedItem); readyLockedItem = null; }
    } catch { }
    readySelectedAccountIds = [];
    readyShouldReset = true;
    readyHoverPixel = { x: null, y: null };

    // Ensure no stale drag/ready state remains when resetting
    try { readyMouseDownPt = null; } catch { }
    try { readyMouseMoved = false; } catch { }
    try { state.dragging = false; } catch { }
    try { signDragging = false; } catch { }
    try { document.body.classList.remove('dragging'); } catch { }

    try {
        if (readyAccountBtn) readyAccountBtn.hidden = true;
        if (readyPixelEl) readyPixelEl.hidden = true;
        if (readyAccountList) readyAccountList.hidden = true;
    } catch { }
    try { updateAutoSelectButtonLabel(); } catch { }
    try { updatePixelMarkers(); } catch { }
    scheduleRender();
}
if (readyBtn && readyPopup) {
    readyBtn.addEventListener('click', async () => {
        try {
            await loadAccounts();

            // Clear any leftover drag/ready state before toggling the popup
            try { readyMouseDownPt = null; } catch { }
            try { readyMouseMoved = false; } catch { }
            try { state.dragging = false; } catch { }
            try { signDragging = false; } catch { }
            try { document.body.classList.remove('dragging'); } catch { }

            try {

                if (readyShouldReset) {
                    readyShouldReset = false;
                    readySelectedAccountIds = [];
                    try { clearAllReadySelections(); } catch { }
                    try {
                        if (readyAccountBtn) readyAccountBtn.hidden = false;
                        if (readyPixelEl) readyPixelEl.hidden = true;
                        if (readyAccountList) readyAccountList.hidden = true;
                    } catch { }
                }
                // Enforce single account if pre-existing selection had multiple
                if (Array.isArray(readySelectedAccountIds) && readySelectedAccountIds.length > 1) {
                    readySelectedAccountIds = [readySelectedAccountIds[0]];
                    updateReadyPixelForSelectedAccounts();
                }
                if (readyPixelEl) readyPixelEl.hidden = false;
                if (readyAccountList) readyAccountList.hidden = true;
            } catch { }
            // Always close movement popup when toggling Ready
            try { if (movementPopup) movementPopup.hidden = true; } catch { }
            readyPopup.hidden = !readyPopup.hidden;

            try {
                if (!readyPopup.hidden) {

                    readyGlobalMode = !((selectedIndex >= 0 && selectedIndex < signItems.length)) && (selectedOverrideColorId != null);
                    if (selectedIndex >= 0 && selectedIndex < signItems.length) {
                        const it = signItems[selectedIndex];
                        it.lockedByReady = true;
                        readyLockedItem = it;
                        try { updateItemLockUi(it); } catch { }

                        readyHoverPixel = { x: null, y: null };
                        ensureRenderedSelectedForItem(it);
                        updatePixelMarkers();
                        updateReadySelectionLabel();
                    } else if (readyGlobalMode) {

                        try { clearAllReadySelections(); } catch { }
                        readyHoverPixel = { x: null, y: null };
                        updatePixelMarkers();
                        updateReadySelectionLabel();
                    }
                } else {
                    readyGlobalMode = false;
                    if (readyLockedItem) {
                        readyLockedItem.lockedByReady = false;
                        try { updateItemLockUi(readyLockedItem); } catch { }
                        readyLockedItem = null;
                    }

                    try { pixelHoverEl.hidden = true; if (pixelSelectedList) pixelSelectedList.hidden = true; } catch { }

                    try { if (readyAccountList) readyAccountList.hidden = true; } catch { }
                }
            } catch { }
            try { updateAutoSelectButtonLabel(); } catch { }
            scheduleRender();
        } catch { }
    });
}
if (autoSelectBtn) {
    autoSelectBtn.addEventListener('click', () => {
        if (autoSelectDeleteMode) {
            // Delete all selected pixels
            if (readyGlobalMode) {
                try {
                    readyGlobalSelected.forEach(rec => {
                        try { if (rec && rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); } catch { }
                        try { if (rec && rec.fillEl && rec.fillEl.parentNode) rec.fillEl.parentNode.removeChild(rec.fillEl); } catch { }
                    });
                    readyGlobalSelected.clear();
                } catch { }
            } else {
                const selItem = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
                if (selItem) {
                    try { clearSelectionsForItem(selItem); } catch { }
                }
            }
            try { updateReadySelectionLabel(); updateStartEnabled(); updatePixelMarkers(); render(); } catch { }
            try { refreshPaletteTooltips(); } catch { }
            return;
        }

        // Force auto-select to act as Transparent (no override color)
        selectedOverrideColorId = null;
        try { updatePaletteSelectionUi(); } catch { }

        if (!Array.isArray(readySelectedAccountIds) || readySelectedAccountIds.length === 0) {
            showToast(t('messages.selectAccountFirst'), 'error', 2000);
            return;
        }

        if (!(selectedIndex >= 0 && selectedIndex < signItems.length)) {
            if (signItems.length > 0) selectSign(0, false);
        }
        const selItem = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (!selItem || !selItem.image || !selItem.image.complete) return;

        const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
        const map = getSelectedMap(selItem);
        const already = map ? map.size : 0;
        if (already >= limit) return;
        const start = (selItem._lastManualSelected && Number.isFinite(selItem._lastManualSelected.x) && Number.isFinite(selItem._lastManualSelected.y))
            ? { x: selItem._lastManualSelected.x, y: selItem._lastManualSelected.y }
            : { x: 0, y: 0 };
        const w = selItem.image.naturalWidth | 0;
        const h = selItem.image.naturalHeight | 0;
        const randomOffset = Math.floor(Math.random() * 6) + 1;
        const need = (limit - already) >= 500 ? (500 - randomOffset) : (limit - already);
        let addedCount = 0;

        if (selectMode === 'frame') {
            const prev = autoSelectDeleteMode; // unused placeholder
            addedCount = autoSelectFrameFirst(selItem, need);
        } else if (selectMode === 'color') {
            addedCount = autoSelectColorFirst(selItem, need);
        } else {
            let sx = start.x | 0, sy = start.y | 0;
            const totalCells = w * h;
            let traversed = 0;
            while (addedCount < need && traversed < totalCells) {
                if (isOpaquePixel(selItem, sx, sy) && (selectedOverrideColorId != null || !isSamePaletteIdAsBase(selItem, sx, sy))) {
                    const pid = (selectedOverrideColorId != null && selectedOverrideColorId !== 0)
                        ? selectedOverrideColorId
                        : getItemPixelPaletteId(selItem, sx, sy);
                    if (pid != null && pid !== 0 && isPremiumColorId(pid)) {
                        const remainNow = getPremiumColorRemainingLimit(pid);
                        if (remainNow > 0) {
                            const didAdd = addPixelSelection(selItem, sx, sy, selectedOverrideColorId != null ? selectedOverrideColorId : null);
                            if (didAdd) addedCount++;
                        }
                    } else {
                        const didAdd = addPixelSelection(selItem, sx, sy, selectedOverrideColorId != null ? selectedOverrideColorId : null);
                        if (didAdd) addedCount++;
                    }
                }
                sx += 1;
                if (sx >= w) { sx = 0; sy += 1; }
                if (sy >= h) { sy = 0; }
                traversed++;
            }
        }
        updateReadySelectionLabel();
        updatePixelMarkers();
        scheduleRender();
        try { updateStartEnabled(); } catch { }
        try { refreshPaletteTooltips(); } catch { }
    });
}

function autoSelectFrameFirst(selItem, need) {
    if (!selItem || !selItem.image) return 0;
    const w = selItem.image.naturalWidth | 0;
    const h = selItem.image.naturalHeight | 0;
    if (!(w && h)) return 0;
    const size = w * h;
    const idxOf = (x, y) => y * w + x;
    const mask = new Uint8Array(size);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (isOpaquePixel(selItem, x, y)) {
                mask[idxOf(x, y)] = 1;
            }
        }
    }
    const layer = new Int32Array(size);
    for (let i = 0; i < size; i++) layer[i] = -1;
    const qx = new Int32Array(size);
    const qy = new Int32Array(size);
    let qh = 0, qt = 0;
    function push(x, y, l) {
        const i = idxOf(x, y);
        layer[i] = l;
        qx[qt] = x; qy[qt] = y; qt++;
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = idxOf(x, y);
            if (!mask[i]) continue;
            if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
                !mask[idxOf(x - 1, y)] || !mask[idxOf(x + 1, y)] ||
                !mask[idxOf(x, y - 1)] || !mask[idxOf(x, y + 1)]) {
                push(x, y, 0);
            }
        }
    }
    while (qh < qt) {
        const x = qx[qh];
        const y = qy[qh];
        const l = layer[idxOf(x, y)];
        qh++;
        const nl = l + 1;
        if (x > 0) {
            const i = idxOf(x - 1, y);
            if (mask[i] && layer[i] === -1) push(x - 1, y, nl);
        }
        if (x < w - 1) {
            const i = idxOf(x + 1, y);
            if (mask[i] && layer[i] === -1) push(x + 1, y, nl);
        }
        if (y > 0) {
            const i = idxOf(x, y - 1);
            if (mask[i] && layer[i] === -1) push(x, y - 1, nl);
        }
        if (y < h - 1) {
            const i = idxOf(x, y + 1);
            if (mask[i] && layer[i] === -1) push(x, y + 1, nl);
        }
    }
    const buckets = [];
    for (let i = 0; i < size; i++) {
        const l = layer[i];
        if (l >= 0) {
            if (!buckets[l]) buckets[l] = [];
            buckets[l].push({ x: i % w, y: (i / w) | 0 });
        }
    }
    const order = [];
    for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (b) for (let j = 0; j < b.length; j++) order.push(b[j]);
    }
    const map = getSelectedMap(selItem);
    let added = 0;
    for (let i = 0; i < order.length && added < need; i++) {
        const p = order[i];
        if (map && map.has(keyFor(p.x, p.y))) continue;
        if (selectedOverrideColorId == null && isSamePaletteIdAsBase(selItem, p.x, p.y)) continue;
        if (selectedOverrideColorId != null && selectedOverrideColorId !== 0 && isPremiumColorId(selectedOverrideColorId)) {
            const remain = getPremiumColorRemainingLimit(selectedOverrideColorId);
            if (!(remain > 0)) break;
        }
        const did = addPixelSelection(selItem, p.x, p.y, selectedOverrideColorId != null ? selectedOverrideColorId : null);
        if (did) added++;
    }
    return added;
}
function getColorLuminance(colorId) {
    const palette = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    const colorInfo = palette.find(p => p.id === colorId);
    if (!colorInfo || !colorInfo.rgb) {
        return 256;
    }
    const [r, g, b] = colorInfo.rgb;
    return 0.299 * r + 0.587 * g + 0.114 * b;
}
function autoSelectColorFirst(selItem, need) {
    if (!selItem || !selItem.image) return 0;
    const w = selItem.image.naturalWidth | 0;
    const h = selItem.image.naturalHeight | 0;
    if (!(w && h)) return 0;
    const buckets = new Map();
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!isOpaquePixel(selItem, x, y)) continue;
            if (selectedOverrideColorId == null && isSamePaletteIdAsBase(selItem, x, y)) continue;
            const pid = (selectedOverrideColorId != null && selectedOverrideColorId !== 0)
                ? selectedOverrideColorId
                : getItemPixelPaletteId(selItem, x, y);
            if (pid == null) continue;
            let arr = buckets.get(pid);
            if (!arr) { arr = []; buckets.set(pid, arr); }
            arr.push(x, y);
        }
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => {
        const aIsPremium = isPremiumColorId(a);
        const bIsPremium = isPremiumColorId(b);
        if (aIsPremium && !bIsPremium) return -1;
        if (!aIsPremium && bIsPremium) return 1;
        const lumA = getColorLuminance(a);
        const lumB = getColorLuminance(b);
        return lumA - lumB;
    });
    let added = 0;
    for (const pid of keys) {
        const coords = buckets.get(pid);
        if (!coords) continue;
        for (let i = 0; i < coords.length && added < need; i += 2) {
            let canAdd = true;
            if (pid != null && pid !== 0 && isPremiumColorId(pid)) {
                const remainNow = getPremiumColorRemainingLimit(pid);
                if (!(remainNow > 0)) canAdd = false;
            }
            if (canAdd) {
                const did = addPixelSelection(selItem, coords[i], coords[i + 1], selectedOverrideColorId != null ? selectedOverrideColorId : null);
                if (did) added++;
            }
        }
        if (added >= need) break;
    }
    return added;
}
function getSelectedAccountsSortedByCapacityDesc() {
    const rows = [];
    for (let i = 0; i < readySelectedAccountIds.length; i++) {
        const a = getAccountById(readySelectedAccountIds[i]);
        if (a && typeof a.token === 'string' && a.token && a.active !== false) rows.push(a);
    }
    rows.sort((a, b) => (Number(b.pixelCount) || 0) - (Number(a.pixelCount) || 0));
    return rows;
}
function updateStartEnabled() {
    try {
        if (!startBtn) return;

        const hasAccounts = getSelectedAccountsSortedByCapacityDesc().length > 0;
        const hasAnyPixel = readyGlobalMode ? (readyGlobalSelected.size > 0) : (getReadySelectedCount() > 0);
        startBtn.disabled = !(hasAccounts && hasAnyPixel);
    } catch { }
}




if (startBtn) {
    startBtn.addEventListener('click', () => {

        const hasAccounts = getSelectedAccountsSortedByCapacityDesc().length > 0;
        const hasAnyPixel = readyGlobalMode ? (readyGlobalSelected.size > 0) : (getReadySelectedCount() > 0);
        if (!(hasAccounts && hasAnyPixel)) {
            showToast(t('messages.startRequirementsMissing'), 'error', 2500);
            try { updateStartEnabled(); } catch { }
            return;
        }
        const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (!readyGlobalMode && !sel) { showToast(t('messages.noSelectedImage'), 'error', 2000); return; }
        const data = buildSelectedExportForItem(sel);

        // Her durumda (tek tile veya değil) pikselleri world koordinata göre area/no bazında gruplandır
        const groups = (function () {
            try {
                const w = img ? (img.width | 0) : 0, h = img ? (img.height | 0) : 0;
                const base = getCurrentTileCoords();
                const m = new Map();
                for (let i = 0; i < data.colors.length; i++) {
                    const wx = data.coords[i * 2] | 0;
                    const wy = data.coords[i * 2 + 1] | 0;
                    const col = Math.floor(wx / Math.max(1, w));
                    const row = Math.floor(wy / Math.max(1, h));
                    const area = Number(base.x || 0) + col;
                    const no = Number(base.y || 0) + row;
                    let lx = wx - col * w;
                    let ly = wy - row * h;
                    // Clamp just in case of rounding anomalies at tile seams
                    if (w > 0) { if (lx < 0) lx = 0; else if (lx >= w) lx = w - 1; }
                    if (h > 0) { if (ly < 0) ly = 0; else if (ly >= h) ly = h - 1; }
                    const key = String(area) + "," + String(no);
                    let g = m.get(key);
                    if (!g) { g = { area, no, coords: [], colors: [] }; m.set(key, g); }
                    g.coords.push(lx, ly);
                    g.colors.push(data.colors[i]);
                }
                return Array.from(m.values());
            } catch { return [{ area: (areaInput && areaInput.value) ? Number(areaInput.value) : 0, no: (noInput && noInput.value) ? Number(noInput.value) : 0, colors: data.colors.slice(), coords: data.coords.slice() }]; }
        })();
        (async () => {
            isPainting = true;
            clearTimeout(refreshTimer);
            const tileW = currentTileW || (img ? (img.width | 0) : 0);
            const tileH = currentTileH || (img ? (img.height | 0) : 0);
            const baseTile = getCurrentTileCoords();
            try {
                // If selected image crosses into neighbors, ensure overlays are loaded before grouping
                try { if (!readyGlobalMode && sel) await ensureOverlaysForItemLoaded(sel); } catch { }
                let paintedAny = false;
                let missingTotal = 0;
                let usedIds = [];
                let hadRequestError = false;
                let didReload = false;
                for (const g of groups) {
                    const total = g.colors.length | 0;
                    const selectedAccounts = getSelectedAccountsSortedByCapacityDesc();
                    let offset = 0;
                    for (let i = 0; i < selectedAccounts.length && offset < total; i++) {
                        const acc = selectedAccounts[i];
                        const cap = Math.max(0, Math.floor(Number(acc.pixelCount) || 0));
                        if (cap <= 0) continue;
                        const take = Math.min(cap, total - offset);
                        if (take <= 0) continue;
                        const colorsSlice = g.colors.slice(offset, offset + take);
                        const coordsSlice = g.coords.slice(offset * 2, (offset + take) * 2);
                        startBtn.disabled = true
                        const r = await postBatch(String(g.area), String(g.no), colorsSlice, coordsSlice, String(acc.token || ''));
                        startBtn.disabled = false
                        if (r && r.status === 429) {
                            hadRequestError = true;
                            try { showToast(t('messages.cfClearanceChange'), 'error', 3500); } catch { showToast('Please change cf_clearance.', 'error', 3500); }
                            break;
                        }
                        if (!r.ok) {
                            if (r.status >= 500) {
                                try { await loadAccounts(); } catch { }
                                continue;
                            } else {
                                hadRequestError = true;
                                showToast(r.payload ? JSON.stringify(r.payload) : (r.text || r.error || t('messages.errorGeneric')), 'error', 3000);
                                break;
                            }
                        } else {
                            addRecentPaintBatch(g, coordsSlice, colorsSlice, tileW, tileH, baseTile);
                        }
                        offset += take;
                        usedIds.push(acc.id);
                        try { await refreshAccountById(acc.id); } catch { }
                    }
                    if (offset > 0) paintedAny = true;
                    if (offset < total && !hadRequestError) missingTotal += (total - offset);
                }
                if (paintedAny) {
                    showToast(t('messages.painted'), 'success', 1800);
                    try { clearAllReadySelections(); } catch { }
                    try { readyGlobalMode = false; } catch { }
                    if (!autoMode) {
                        try { resetReadyNow(); } catch { }
                    }
                    try { updateStartEnabled(); } catch { }
                }
                if (missingTotal > 0) {
                    showToast(t('messages.insufficientPixelPower', { n: missingTotal }), 'error', 3000);
                }
                try { await loadAccounts(); } catch { }
                try { updateReadySelectionLabel(); } catch { }
                scheduleRender();
                // Auto mode: después de pintar, selecciona la siguiente cuenta y auto selecciona píxeles
                if (autoMode && paintedAny && !hadRequestError) {
                    try {
                        await loadAccounts();
                        try { renderReadyAccountList(); } catch { }
                        updateReadyPixelForSelectedAccounts();
                        const nextId = pickNextBestAccountId(usedIds);
                        if (nextId != null) {
                            readySelectedAccountIds = [nextId];
                            try { renderReadyAccountList(); } catch { }
                            updateReadyPixelForSelectedAccounts();
                            try { await new Promise(resolve => setTimeout(resolve, didReload ? 50 : 300)); } catch { }
                            if (autoSelectBtn) { autoSelectDeleteMode = false; autoSelectBtn.click(); }

                            if (autoStart) {
                                let delay = 500;
                                if (humanDelayEnabled) {
                                    const min = Math.min(humanDelayMin, humanDelayMax);
                                    const max = Math.max(humanDelayMin, humanDelayMax);
                                    delay = (Math.random() * (max - min) + min) * 1000;
                                }

                                if (window._autoStartTimer) clearInterval(window._autoStartTimer);
                                const endTime = Date.now() + delay;
                                const cdEl = document.getElementById('auto-start-countdown');
                                
                                // Initial update
                                const initialRem = Math.max(0, Math.ceil(delay / 1000));
                                if (cdEl && humanDelayEnabled) cdEl.textContent = `(${initialRem}s)`;

                                window._autoStartTimer = setInterval(() => {
                                    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
                                    if (cdEl && humanDelayEnabled) cdEl.textContent = `(${remaining}s)`;

                                    if (Date.now() >= endTime) {
                                        clearInterval(window._autoStartTimer);
                                        window._autoStartTimer = null;
                                        if (cdEl) cdEl.textContent = '';

                                        // Refresh selection before starting to ensure we don't paint already painted pixels
                                        if (autoSelectBtn) {
                                            if (autoSelectDeleteMode) {
                                                autoSelectBtn.click(); // Clear current selection
                                            }
                                            autoSelectBtn.click(); // Select new pixels based on current state
                                        }

                                        const btn = document.getElementById('start');
                                        if (btn && !btn.disabled) btn.click();
                                    }
                                }, 100);
                            }
                        }
                    } catch { }
                }
            } finally {
                isPainting = false;
                scheduleBackgroundRefresh();
            }
        })();
    });
}

// Periodically refresh base tile and all unlocked overlays (neighborOverlays)
const MAP_REFRESH_PERIOD_MS = 60000;
function refreshBaseTilePreserveView() {
    try {
        if (!img) return;
        const base = getCurrentTileCoords();
        const url = buildUrl(base.x, base.y) + '?t=' + Date.now();
        const next = new Image();
        next.onload = () => {
            img = next;
            try { baseImageData = null; } catch { }
            try { currentTiles = [{ x: Number(base.x), y: Number(base.y) }]; } catch { }
            try { currentTileW = next.width; currentTileH = next.height; } catch { }
            scheduleRender();
            try { updatePixelMarkers(); } catch { }
        };
        next.onerror = () => { };
        next.src = url;
    } catch { }
}
function refreshAllUnlockedOverlays() {
    try {
        if (!neighborOverlays || neighborOverlays.size === 0) return;
        neighborOverlays.forEach((ov, key) => {
            try {
                if (!ov || ov.col == null || ov.row == null || ov.area == null || ov.no == null) return;
                const imgEl = new Image();
                imgEl.onload = () => {
                    try { neighborOverlays.set(key, { ...ov, image: imgEl }); } catch { }
                    overlayVersion++;
                    scheduleRender();
                    try { saveOverlaysToStorage(); } catch { }
                };
                imgEl.onerror = () => { };
                imgEl.src = buildUrl(ov.area, ov.no) + '?t=' + Date.now();
            } catch { }
        });
    } catch { }
}
function startMapAutoRefresh() {
    try {
        if (window._mapRefreshTimer) return;
        window._mapRefreshTimer = setInterval(() => {
            try { refreshBaseTilePreserveView(); } catch { }
            try { refreshAllUnlockedOverlays(); } catch { }
        }, MAP_REFRESH_PERIOD_MS);
    } catch { }
}
try { startMapAutoRefresh(); } catch { }

// Space-to-paint: press/hold Space to add selection at hover pixel (like left-click)
let spacePaintHeld = false;
let spacePaintLastKey = null;
let spacePaintLimitWarned = false;
let spacePaintAccountWarned = false;

function showMaxReachedToastOnceForSpace(limit) {
    if (spacePaintHeld) {
        if (spacePaintLimitWarned) return;
        spacePaintLimitWarned = true;
    }
    showToast(t('messages.maxPixelsReached', { limit }), 'error', 2000);
}

function maybeAddSelectionAtHover() {
    if (!isReadyOpen()) return false;
    if (!readyHoverPixel || readyHoverPixel.x == null || readyHoverPixel.y == null) return false;
    if (!img) return false;
    if (readyGlobalMode) {
        const hasAccounts = Array.isArray(readySelectedAccountIds) && readySelectedAccountIds.length > 0;
        if (!hasAccounts) {
            if (spacePaintHeld) {
                if (!spacePaintAccountWarned) { showToast(t('messages.selectAccountFirst'), 'error', 2000); spacePaintAccountWarned = true; }
            } else {
                showToast(t('messages.selectAccountFirst'), 'error', 2000);
            }
            return false;
        }
        const wx = readyHoverPixel.x | 0;
        const wy = readyHoverPixel.y | 0;
        if (wx < 0 || wy < 0 || wx >= img.width || wy >= img.height) return false;
        const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
        if (limit > 0 && readyGlobalSelected.size >= limit) { showMaxReachedToastOnceForSpace(limit); return false; }
        const key = String(wx) + ',' + String(wy);
        if (readyGlobalSelected.has(key)) return false;
        const rec = { wx, wy, el: null, fillEl: null, colorId: selectedOverrideColorId };
        // Enforce premium capacity both for override color and base pixel color
        let checkColorId = null;
        if (selectedOverrideColorId != null && selectedOverrideColorId !== 0) {
            checkColorId = selectedOverrideColorId;
        } else {
            const base = getBasePixelColorAtWorld(wx, wy);
            if (base && base.a !== 0) {
                try { checkColorId = rgbToPaletteId(base.r, base.g, base.b); } catch { checkColorId = null; }
            }
        }
        if (checkColorId != null && isPremiumColorId(checkColorId)) {
            const remain = getPremiumColorRemainingLimit(checkColorId);
            if (!(remain > 0)) { showMaxReachedToastOnceForSpace(remain || 0); return false; }
        }
        if (selectedOverrideColorId != null) {
            const f = document.createElement('img'); f.className = 'pixel-marker'; f.alt = 'fill';
            try { }
            catch { }
        }
        readyGlobalSelected.set(key, rec);
        if (pixelSelectedList) pixelSelectedList.hidden = false;
        try { updateReadySelectionLabel(); updateStartEnabled(); } catch { }
        try { refreshPaletteTooltips(); } catch { }
        scheduleOverlayDraw();
        return true;
    } else {
        const selItem = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (!selItem || !selItem.image || !selItem.image.complete) return false;
        const lx = readyHoverPixel.x | 0;
        const ly = readyHoverPixel.y | 0;
        if (lx < 0 || ly < 0 || lx >= selItem.image.naturalWidth || ly >= selItem.image.naturalHeight) return false;
        if (!(isOpaquePixel(selItem, lx, ly) && (selectedOverrideColorId != null || !isSamePaletteIdAsBase(selItem, lx, ly)))) return false;
        const limit = Math.max(0, Number(getReadySelectionLimit()) || 0);
        const map = getSelectedMap(selItem);
        const already = map ? map.size : 0;
        if (limit > 0 && already >= limit) { showMaxReachedToastOnceForSpace(limit); return false; }
        // Determine effective color for capacity check (override or image pixel)
        let checkColorId = null;
        if (selectedOverrideColorId != null && selectedOverrideColorId !== 0) {
            checkColorId = selectedOverrideColorId;
        } else {
            try { checkColorId = getItemPixelPaletteId(selItem, lx, ly); } catch { checkColorId = null; }
        }
        if (checkColorId != null && isPremiumColorId(checkColorId)) {
            const remain = getPremiumColorRemainingLimit(checkColorId);
            if (!(remain > 0)) { showMaxReachedToastOnceForSpace(remain || 0); return false; }
        }
        const didAdd = addPixelSelection(selItem, lx, ly, selectedOverrideColorId != null ? selectedOverrideColorId : null);
        if (didAdd) {
            try { updateReadySelectionLabel(); updateStartEnabled(); updatePixelMarkers(); render(); } catch { }
            try { refreshPaletteTooltips(); } catch { }
            return true;
        }
        return false;
    }
}

function maybeRemoveSelectionAtHover() {
    if (!isReadyOpen()) return false;
    if (!readyHoverPixel || readyHoverPixel.x == null || readyHoverPixel.y == null) return false;
    if (!img) return false;
    if (readyGlobalMode) {
        const wx = readyHoverPixel.x | 0;
        const wy = readyHoverPixel.y | 0;
        if (wx < 0 || wy < 0 || wx >= img.width || wy >= img.height) return false;
        const key = String(wx) + ',' + String(wy);
        if (!readyGlobalSelected.has(key)) return false;
        const rec = readyGlobalSelected.get(key);
        readyGlobalSelected.delete(key);
        try { updateReadySelectionLabel(); updateStartEnabled(); } catch { }
        try { refreshPaletteTooltips(); } catch { }
        scheduleOverlayDraw();
        return true;
    } else {
        const selItem = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (!selItem || !selItem.image || !selItem.image.complete) return false;
        const lx = readyHoverPixel.x | 0;
        const ly = readyHoverPixel.y | 0;
        if (lx < 0 || ly < 0 || lx >= selItem.image.naturalWidth || ly >= selItem.image.naturalHeight) return false;
        const removed = removePixelSelection(selItem, lx, ly);
        if (removed) {
            try { updateReadySelectionLabel(); updateStartEnabled(); updatePixelMarkers(); render(); } catch { }
            return true;
        }
        return false;
    }
}
function isTypingTarget(target) {
    const tag = (target && target.tagName) ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable);
}
function currentHoverKey() {
    if (!readyHoverPixel || readyHoverPixel.x == null || readyHoverPixel.y == null) return null;
    return (readyGlobalMode ? 'g:' : 'l:') + String(readyHoverPixel.x) + ',' + String(readyHoverPixel.y);
}
window.addEventListener('keydown', (e) => {
    const key = e.code || e.key || '';
    if (key !== 'Space' && key !== ' ') return;
    if (!isReadyOpen() || isTypingTarget(e.target)) return;
    if (spacePaintHeld) { try { e.preventDefault(); e.stopPropagation(); } catch { } return; }
    spacePaintHeld = true;
    spacePaintLimitWarned = false;
    spacePaintAccountWarned = false;
    try { e.preventDefault(); e.stopPropagation(); } catch { }
    maybeAddSelectionAtHover();
    spacePaintLastKey = currentHoverKey();
});
window.addEventListener('mousemove', () => {
    if (!spacePaintHeld || !isReadyOpen()) return;
    if (spacePaintLastKey === currentHoverKey()) return;
    if (maybeAddSelectionAtHover()) {
        spacePaintLastKey = currentHoverKey();
    }
});
window.addEventListener('keyup', (e) => {
    const key = e.code || e.key || '';
    if (key === 'Space' || key === ' ') { spacePaintHeld = false; spacePaintLastKey = null; spacePaintLimitWarned = false; spacePaintAccountWarned = false; }
});

(async () => {
    try {
        // Restore last view position
        try {
            const sx = parseFloat(localStorage.getItem('view.translateX') || '');
            const sy = parseFloat(localStorage.getItem('view.translateY') || '');
            const sc = parseFloat(localStorage.getItem('view.scale') || '');
            if (!isNaN(sx)) state.translateX = sx;
            if (!isNaN(sy)) state.translateY = sy;
            if (!isNaN(sc)) state.scale = Math.min(state.maxScale, Math.max(state.minScale, sc));
            scheduleRender();
            updatePixelMarkers();
        } catch { }
        // Restore last looked world coordinates
        try {
            const wx = localStorage.getItem('view.worldX');
            const wy = localStorage.getItem('view.worldY');
            if (wx && wy) { areaInput.value = String(wx); noInput.value = String(wy); }
        } catch { }
        // Restore images (supports multiple); falls back to legacy single image if list is empty
        try { restoreImagesFromStorage(); } catch { }

        const saved = JSON.parse(localStorage.getItem('lastFetch') || 'null');
        if (saved && saved.mode === 'single') {
            areaInput.value = String(saved.coords[0].x);
            noInput.value = String(saved.coords[0].y);
            loadImage(areaInput.value, noInput.value, true);
        } else if (areaInput.value && noInput.value) {
            loadImage(areaInput.value, noInput.value, true);
        }
    } catch { }
    updateCounter();
    loadAccounts();
})();

try {
    setInterval(() => { refreshAllAccounts(); }, 20 * 1000);
} catch { }

const CANVAS_REFRESH_MS = 30 * 1000;
setInterval(() => {
    try {
        const saved = JSON.parse(localStorage.getItem('lastFetch') || 'null');
        if (!saved) return;
        if (saved.mode === 'single') {
            loadImage(saved.coords[0].x, saved.coords[0].y, true);
        }
    } catch { }
}, CANVAS_REFRESH_MS);


try { setupColorPalette(); } catch { }
if (paletteModeEl && paletteModeToggle && paletteModeLabelLeft && paletteModeLabelRight) {
    const updateToggleUi = () => {
        try {
            const isPremium = (paletteMode === 'premium');
            paletteModeToggle.classList.toggle('on', !isPremium ? true : false);
            paletteModeToggle.setAttribute('aria-checked', isPremium ? 'true' : 'false');
            paletteModeLabelLeft.classList.toggle('active', isPremium);
            paletteModeLabelRight.classList.toggle('active', !isPremium);
        } catch { }
    };
    const setMode = (mode) => { paletteMode = (mode === 'free') ? 'free' : 'premium'; try { localStorage.setItem('palette.mode', paletteMode); } catch { } recomputeActivePalette(); updateToggleUi(); };
    // Initialize using saved mode BEFORE making control visible
    try {
        const savedMode = localStorage.getItem('palette.mode');
        if (savedMode === 'free' || savedMode === 'premium') {
            paletteMode = savedMode;
        }
    } catch { }
    recomputeActivePalette();
    updateToggleUi();
    try { paletteModeEl.style.visibility = 'visible'; } catch { }
    // Wire events
    paletteModeToggle.addEventListener('click', () => setMode(paletteMode === 'premium' ? 'free' : 'premium'));
    paletteModeLabelLeft.addEventListener('click', () => setMode('premium'));
    paletteModeLabelRight.addEventListener('click', () => setMode('free'));
    // Always start with Transparent selected (no cache)
    try { localStorage.removeItem('palette.selectedColorId'); } catch { }
    selectedOverrideColorId = null;
    try { updatePaletteSelectionUi(); } catch { }
}

function getItemPixelPaletteId(item, sx, sy) {
    const c = getItemPixelColor(item, sx, sy);
    if (!c || c.a === 0) return null;
    return rgbToPaletteId(c.r, c.g, c.b);
}

function buildSelectedExportForItem(item) {
    const map = getSelectedMap(item);
    const coords = [];
    const colors = [];
    if (readyGlobalMode) {
        readyGlobalSelected.forEach((rec) => {
            coords.push(rec.wx, rec.wy);
            colors.push(rec.colorId == null ? null : rec.colorId);
        });
    } else if (map) {
        map.forEach((rec) => {
            const wx = Math.round((item.worldX || 0) + rec.x);
            const wy = Math.round((item.worldY || 0) + rec.y);
            coords.push(wx, wy);
            const pid = (rec && rec.colorId != null) ? rec.colorId : getItemPixelPaletteId(item, rec.x, rec.y);
            colors.push(pid == null ? null : pid);
        });
    }
    // Reorder: premium colors first, then free colors to satisfy "send premium first"
    const pairs = [];
    for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const x = coords[i * 2];
        const y = coords[i * 2 + 1];
        pairs.push({ c, x, y, premium: (c != null && c !== 0 && isPremiumColorId(c)) });
    }
    pairs.sort((a, b) => (b.premium ? 1 : 0) - (a.premium ? 1 : 0));
    const colorsOut = [];
    const coordsOut = [];
    for (let i = 0; i < pairs.length; i++) {
        colorsOut.push(pairs[i].c);
        coordsOut.push(pairs[i].x, pairs[i].y);
    }
    return { colors: colorsOut, coords: coordsOut };
}

function logSelectedPixelsCurrentItem() {
    try {
        const sel = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (!sel) return;
        const data = buildSelectedExportForItem(sel);
        console.log({ colors: data.colors, coords: data.coords });
    } catch { }
}