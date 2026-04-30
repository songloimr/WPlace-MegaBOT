/* Signs module — image items, movement, thumbnails, storage */

function isMovementOpen() {
    try { return !!(movementPopup && !movementPopup.hidden); } catch { return false; }
}
function getSelectedItem() {
    try {
        return (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
    } catch { return null; }
}
function updateMovementButtonEnabled() {
    if (!movementBtn) return;
    const it = getSelectedItem();
    let enable = false;
    try { enable = !!(it && it.image && it.image.complete && !(it.locked || it.lockedByReady)); } catch { enable = false; }
    try { movementBtn.disabled = !enable; } catch { }
    // Do not auto-close when disabled due to transient selection changes; keep user's choice.
}
function clampPositionForItem(item, x, y) {
    let nx = Math.round(x | 0), ny = Math.round(y | 0);
    try {
        if (!img || !item || !item.image || !item.image.naturalWidth || !item.image.naturalHeight) return { x: nx, y: ny };
        const iw = item.image.naturalWidth | 0, ih = item.image.naturalHeight | 0;
        if (!ALLOW_DRAG_BEYOND_NINE) {
            const rects = getAllowedPlacementRects();
            if (!rects || rects.length === 0) {
                const maxX = Math.max(0, img.width - iw);
                const maxY = Math.max(0, img.height - ih);
                return { x: Math.min(Math.max(0, nx), maxX), y: Math.min(Math.max(0, ny), maxY) };
            }
            const bounds = getCompositeBounds(rects);
            const maxX = (bounds.maxX | 0) - iw;
            const maxY = (bounds.maxY | 0) - ih;
            const minX = bounds.minX | 0;
            const minY = bounds.minY | 0;
            nx = Math.min(Math.max(minX, nx), maxX);
            ny = Math.min(Math.max(minY, ny), maxY);
            return { x: nx, y: ny };
        }
        // If allowed beyond nine: keep at least 1 px inside composite bounds (with some slack)
        const rects = getAllowedPlacementRects();
        if (!rects || rects.length === 0) {
            const minX = 1 - iw;
            const minY = 1 - ih;
            const maxX = (img.width | 0) - 1;
            const maxY = (img.height | 0) - 1;
            nx = Math.min(Math.max(minX, nx), maxX);
            ny = Math.min(Math.max(minY, ny), maxY);
            return { x: nx, y: ny };
        }
        const b = getCompositeBounds(rects);
        const outerSlack = 512;
        const minX = (b.minX | 0) - iw + 1 - outerSlack;
        const minY = (b.minY | 0) - ih + 1 - outerSlack;
        const maxX = (b.maxX | 0) - 1 + outerSlack;
        const maxY = (b.maxY | 0) - 1 + outerSlack;
        nx = Math.min(Math.max(minX, nx), maxX);
        ny = Math.min(Math.max(minY, ny), maxY);
        return { x: nx, y: ny };
    } catch { return { x: nx, y: ny }; }
}
function moveSelectedBy(dx, dy, step) {
    const it = getSelectedItem();
    if (!it || !it.image || !it.image.complete) { try { showToast(t('messages.noSelectedImage'), 'error', 1800); } catch { } return; }
    if (it.locked || it.lockedByReady) { return; }
    const mult = Number.isFinite(step) ? Math.max(1, step | 0) : 1;
    const targetX = (it.worldX || 0) + dx * mult;
    const targetY = (it.worldY || 0) + dy * mult;
    const clamped = clampPositionForItem(it, targetX, targetY);
    if (clamped.x === (it.worldX || 0) && clamped.y === (it.worldY || 0)) return;
    it.worldX = clamped.x;
    it.worldY = clamped.y;
    try { localStorage.setItem('last.image.worldX', String(it.worldX || 0)); localStorage.setItem('last.image.worldY', String(it.worldY || 0)); } catch { }
    try { it._placedCountCache = null; } catch { }
    scheduleRender();
    try { updatePixelMarkers(); } catch { }
    if (isReadyOpen()) { try { updateReadySelectionLabel(); } catch { } }
    try { saveImagesToStorage(); } catch { }
}
function setupMoveHold(btn, dx, dy) {
    if (!btn) return;
    const stop = () => {
        try { if (btn._mvInt) { clearInterval(btn._mvInt); btn._mvInt = null; } } catch { }
        try { if (btn._mvTmo) { clearTimeout(btn._mvTmo); btn._mvTmo = null; } } catch { }
    };
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn._skipNextClick) { btn._skipNextClick = false; return; }
        moveSelectedBy(dx, dy, e && e.shiftKey ? 5 : 1);
    });
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const step = e && e.shiftKey ? 5 : 1;
        moveSelectedBy(dx, dy, step);
        btn._skipNextClick = true;
        try { btn.setPointerCapture(e.pointerId); } catch { }
        btn._mvTmo = setTimeout(() => {
            btn._mvInt = setInterval(() => moveSelectedBy(dx, dy, step), 50);
        }, 250);
    });
    const end = () => { stop(); setTimeout(() => { btn._skipNextClick = false; }, 0); };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
}

function updateCounter() {
    const total = signItems.length;
    const selected = selectedIndex >= 0 ? (selectedIndex + 1) : 0;
    counter.textContent = String(selected) + ' / ' + String(total);
    try {
        const btn = document.getElementById('btn-ready');
        if (btn) btn.disabled = !(
            (selectedIndex >= 0 && selectedIndex < signItems.length) ||
            (selectedOverrideColorId != null)
        );
    } catch { }
}

function updateThumbSelection() {
    signItems.forEach((it, i) => {
        if (it.el) it.el.classList.toggle('selected', i === selectedIndex);
    });
    try { localStorage.setItem('selected.index', String(selectedIndex)); } catch { }
    try {
        const btn = document.getElementById('btn-ready');
        if (btn) btn.disabled = !(
            (selectedIndex >= 0 && selectedIndex < signItems.length) ||
            (selectedOverrideColorId != null)
        );
    } catch { }

    try {
        if (!(selectedIndex >= 0 && selectedIndex < signItems.length)) {
            const rp = document.getElementById('ready-popup');
            if (rp) rp.hidden = true;
            try { if (movementPopup) movementPopup.hidden = true; } catch { }
        }
    } catch { }
    if (isReadyOpen()) { try { updateReadySelectionLabel(); } catch { } }
    try { updateMovementButtonEnabled(); } catch { }
    try {
        const it = (selectedIndex >= 0 && selectedIndex < signItems.length) ? signItems[selectedIndex] : null;
        if (movementBtn && movementPopup) {
            const canOpen = !!(it && it.image && it.image.complete && !(it.locked || it.lockedByReady));
            if (canOpen) {
                if (window._mvOpenTmo) { try { clearTimeout(window._mvOpenTmo); } catch { } }
                window._mvOpenTmo = setTimeout(() => { if (!readyPopup || readyPopup.hidden) movementPopup.hidden = false; }, 50);
            }
        }
    } catch { }
}

function updateItemLockUi(item) {
    if (!item || !item.el) return;
    item.el.classList.toggle('locked', !!item.locked);
    const btn = item.el.querySelector('.thumb-action.lock');
    if (btn) btn.textContent = (item.locked || item.lockedByReady) ? '🔒' : '🔓';
    try { updateMovementButtonEnabled(); } catch { }
}

function deleteItem(item) {
    const idx = signItems.indexOf(item);
    if (idx === -1) return;
    if (readyLockedItem === item) {
        try { readyLockedItem.lockedByReady = false; } catch { }
        readyLockedItem = null;
    }
    if (item.el && item.el.parentNode) {
        try { item.el.parentNode.removeChild(item.el); } catch { }
    }
    try { if (item.url) URL.revokeObjectURL(item.url); } catch { }
    signItems.splice(idx, 1);
    if (selectedIndex === idx) selectedIndex = Math.min(idx, signItems.length - 1);
    else if (selectedIndex > idx) selectedIndex -= 1;
    if (signItems.length === 0) selectedIndex = -1;
    updateThumbSelection();
    updateCounter();
    scheduleRender();
    try { updateMovementButtonEnabled(); } catch { }
    try { saveImagesToStorage(); } catch { }
}

function applyResize(item, w, h) {
    if (!item || !item.image) return;
    if (!item.originalImage) item.originalImage = item.image;
    const src = item.originalImage;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = false;
    octx.drawImage(src, 0, 0, src.naturalWidth || src.width, src.naturalHeight || src.height, 0, 0, w, h);
    const id = octx.getImageData(0, 0, w, h);
    item._imageData = id;
    let cnt = 0;
    for (let i = 3; i < id.data.length; i += 4) { if (id.data[i] !== 0) cnt++; }
    item.pixelCount = cnt;
    off.naturalWidth = w; off.naturalHeight = h; off.complete = true;
    const dataUrl = off.toDataURL('image/png');
    item.image = off;
    item.url = dataUrl;
    item.dataUrl = dataUrl;
    if (item.el) {
        const im = item.el.querySelector('img');
        if (im) im.src = dataUrl;
    }
    scheduleRender();
    updateCounter();
    try { saveImagesToStorage(); } catch { }
}

function zoomToSign(item) {
    if (!item || !item.image) return;
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const sw = item.image.naturalWidth || 1;
    const sh = item.image.naturalHeight || 1;
    const scaleToFit = Math.min(vw / sw, vh / sh);
    const marginFactor = 0.85;
    const newScale = Math.min(state.maxScale, Math.max(state.minScale, scaleToFit * marginFactor));
    const centerX = (item.worldX || 0) + sw / 2;
    const centerY = (item.worldY || 0) + sh / 2;
    const centerPx = getContentCenterPx();
    state.scale = newScale;
    state.translateX = centerPx.x - centerX * newScale;
    state.translateY = centerPx.y - centerY * newScale;
    scheduleRender();
    try {
        localStorage.setItem('view.translateX', String(state.translateX));
        localStorage.setItem('view.translateY', String(state.translateY));
        localStorage.setItem('view.scale', String(state.scale));
        // Update world X/Y inputs to the tile that contains the image center
        if (areaInput && noInput && img) {
            const w = img.width | 0, h = img.height | 0;
            const cx = Math.floor(centerX);
            const cy = Math.floor(centerY);
            const base = getCurrentTileCoords();
            const col = Math.floor(cx / Math.max(1, w));
            const row = Math.floor(cy / Math.max(1, h));
            const areaX = Number(base.x || 0) + col;
            const areaY = Number(base.y || 0) + row;
            areaInput.value = String(areaX);
            noInput.value = String(areaY);
            try {
                localStorage.setItem('areaCode', String(areaX));
                localStorage.setItem('areaNo', String(areaY));
                // Keep backward compatibility with legacy keys
                localStorage.setItem('area code', String(areaX));
                localStorage.setItem('no', String(areaY));
            } catch { }
        }
    } catch { }
}

function addThumbForItem(item, index) {
    const div = document.createElement('div');
    div.className = 'thumb-item';
    const im = document.createElement('img');
    im.src = item.url;
    im.alt = item.name || (t('thumb.imageAlt', { n: (index + 1) }));
    div.appendChild(im);

    const actions = document.createElement('div');
    actions.className = 'thumb-actions';
    const btnLock = document.createElement('button');
    btnLock.className = 'thumb-action lock';
    btnLock.title = t('thumb.lock');
    btnLock.textContent = item.locked ? '🔒' : '🔓';
    btnLock.addEventListener('click', (ev) => {
        ev.stopPropagation();

        item.locked = !item.locked;
        updateItemLockUi(item);
        try {
            const mapKey = 'locks.map';
            let locks = {};
            try { locks = JSON.parse(localStorage.getItem(mapKey) || '{}'); } catch { }
            locks[item.url] = !!item.locked;
            try {
                const altKey = (item.url && item.url.startsWith('data:')) ? item.url : (localStorage.getItem('last.image.dataUrl') || null);
                if (altKey) locks[altKey] = !!item.locked;
            } catch { }
            localStorage.setItem(mapKey, JSON.stringify(locks));
        } catch { }
        try { saveImagesToStorage(); } catch { }
    });
    const btnDel = document.createElement('button');
    btnDel.className = 'thumb-action del';
    btnDel.title = t('buttons.delete');
    btnDel.textContent = '🗑️';
    btnDel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteItem(item);
        try { saveImagesToStorage(); } catch { }
    });
    actions.appendChild(btnLock);
    actions.appendChild(btnDel);
    div.appendChild(actions);

    div.addEventListener('click', () => {
        selectSign(signItems.indexOf(item), true);
    });
    item.el = div;
    if (item.lockedByReady == null) item.lockedByReady = false;
    thumbList.appendChild(div);
    updateItemLockUi(item);
    updateThumbSelection();
    updateCounter();
    try {
        // Persist current item's position when it is added
        localStorage.setItem('last.image.worldX', String(item.worldX || 0));
        localStorage.setItem('last.image.worldY', String(item.worldY || 0));
        // Persist lock state per image
        const mapKey = 'locks.map';
        let locks = {};
        try { locks = JSON.parse(localStorage.getItem(mapKey) || '{}'); } catch { }
        locks[item.url] = !!item.locked;
        try {
            const altKey = (item.url && item.url.startsWith('data:')) ? item.url : (localStorage.getItem('last.image.dataUrl') || null);
            if (altKey) locks[altKey] = !!item.locked;
        } catch { }
        localStorage.setItem(mapKey, JSON.stringify(locks));
    } catch { }
    try { saveImagesToStorage(); } catch { }
}

function ensureDataUrlForItem(item) {
    try {
        if (!item) return null;
        if (item.dataUrl && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:')) return item.dataUrl;
        const src = String(item.url || '');
        if (src.startsWith('data:')) { item.dataUrl = src; return src; }
        if (item.image && item.image.naturalWidth && item.image.naturalHeight) {
            const off = document.createElement('canvas');
            off.width = item.image.naturalWidth; off.height = item.image.naturalHeight;
            const octx = off.getContext('2d', { willReadFrequently: true });
            octx.imageSmoothingEnabled = false;
            octx.drawImage(item.image, 0, 0);
            const durl = off.toDataURL('image/png');
            item.dataUrl = durl;
            return durl;
        }
    } catch { }
    return null;
}
function saveImagesToStorage() {
    try {
        const list = [];
        for (let i = 0; i < signItems.length; i++) {
            const it = signItems[i];
            if (!it || !it.image) continue;
            const durl = ensureDataUrlForItem(it);
            if (!durl) continue;
            list.push({ name: it.name || 'image.png', dataUrl: durl, worldX: Math.floor(Number(it.worldX || 0)), worldY: Math.floor(Number(it.worldY || 0)), locked: !!it.locked });
        }
        localStorage.setItem('images.list', JSON.stringify(list));
        // If all images have been removed, also clear legacy keys to prevent fallback restore on refresh
        if (list.length === 0) {
            try { localStorage.removeItem('last.image.url'); } catch { }
            try { localStorage.removeItem('last.image.name'); } catch { }
            try { localStorage.removeItem('last.image.dataUrl'); } catch { }
            try { localStorage.removeItem('last.image.worldX'); } catch { }
            try { localStorage.removeItem('last.image.worldY'); } catch { }
            try { localStorage.removeItem('selected.index'); } catch { }
        }
    } catch { }
}
function restoreImagesFromStorage() {
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem('images.list') || '[]'); } catch { }
        if (Array.isArray(list) && list.length > 0) {
            const savedSelRaw = parseInt(localStorage.getItem('selected.index') || '', 10);
            const savedSel = Number.isFinite(savedSelRaw) ? savedSelRaw : -1;
            for (let i = 0; i < list.length; i++) {
                const entry = list[i];
                if (!entry || !entry.dataUrl) continue;
                try {
                    const imgEl = new Image();
                    imgEl.onload = () => {
                        const item = { url: entry.dataUrl, dataUrl: entry.dataUrl, name: entry.name || 'image.png', image: imgEl, originalImage: imgEl, worldX: Number(entry.worldX || 0), worldY: Number(entry.worldY || 0), el: null, locked: !!entry.locked, pixelCount: countNonTransparentPixels(imgEl) };
                        signItems.push(item);
                        addThumbForItem(item, signItems.length - 1);
                        updateCounter();
                        scheduleRender();
                        try { updatePixelMarkers(); } catch { }
                    };
                    imgEl.src = entry.dataUrl;
                } catch { }
            }
            setTimeout(() => {
                const idx = (savedSel >= 0 && savedSel < signItems.length) ? savedSel : -1;
                if (idx >= 0) { try { selectSign(idx, false); } catch { } }
            }, 100);
            return;
        }
        // Fallback to legacy single-image restore (skip if images.list existed but is empty)
        const hadList = !!localStorage.getItem('images.list');
        if (hadList) return;
        let lastUrl = localStorage.getItem('last.image.url');
        const lastName = localStorage.getItem('last.image.name') || 'image.png';
        const dataUrl = localStorage.getItem('last.image.dataUrl');
        if (!lastUrl && dataUrl) lastUrl = dataUrl;
        if (lastUrl) {
            const imgEl = new Image();
            imgEl.onload = () => {
                const savedWX = parseFloat(localStorage.getItem('last.image.worldX') || '');
                const savedWY = parseFloat(localStorage.getItem('last.image.worldY') || '');
                const item = { url: lastUrl, dataUrl: (lastUrl && lastUrl.startsWith('data:')) ? lastUrl : null, name: lastName, image: imgEl, originalImage: imgEl, worldX: 0, worldY: 0, el: null, locked: false, pixelCount: countNonTransparentPixels(imgEl) };
                if (!isNaN(savedWX)) item.worldX = savedWX;
                if (!isNaN(savedWY)) item.worldY = savedWY;
                try {
                    const locks = JSON.parse(localStorage.getItem('locks.map') || '{}');
                    const dataKey = localStorage.getItem('last.image.dataUrl') || null;
                    if (locks && Object.prototype.hasOwnProperty.call(locks, item.url)) item.locked = !!locks[item.url];
                    else if (dataKey && Object.prototype.hasOwnProperty.call(locks, dataKey)) item.locked = !!locks[dataKey];
                } catch { }
                signItems.push(item);
                let savedSel = parseInt(localStorage.getItem('selected.index') || '', 10);
                if (!Number.isFinite(savedSel)) savedSel = -1;
                selectedIndex = (savedSel >= 0 && savedSel < signItems.length) ? savedSel : -1;
                addThumbForItem(item, signItems.length - 1);
                updateCounter();
                scheduleRender();
                try { updatePixelMarkers(); } catch { }
            };
            imgEl.src = lastUrl;
        }
    } catch { }
}

function selectSign(index, zoom = true) {
    if (index < 0 || index >= signItems.length) return;
    selectedIndex = index;

    try {
        const rp = document.getElementById('ready-popup');
        if (rp && !rp.hidden && readyLockedItem && readyLockedItem !== signItems[selectedIndex]) {
            readyLockedItem.lockedByReady = false;
            readyLockedItem = null;
        }
    } catch { }
    const item = signItems[selectedIndex];

    try {
        const rp = document.getElementById('ready-popup');
        if (rp && !rp.hidden) {
            readyHoverPixel = { x: null, y: null };

            ensureRenderedSelectedForItem(item);
            updatePixelMarkers();
        }
    } catch { }
    updateThumbSelection();
    updateCounter();
    try {
        const btn = document.getElementById('btn-ready');
        if (btn) btn.disabled = !(selectedIndex >= 0 && selectedIndex < signItems.length);
    } catch { }
    if (item.image && item.image.complete) {
        if (zoom) {
            try {
                // Ensure the item's tile is loaded; if not, load it then zoom
                const w = img ? (img.width | 0) : 0;
                const h = img ? (img.height | 0) : 0;
                const wx = Math.floor(item.worldX || 0);
                const wy = Math.floor(item.worldY || 0);
                const inCurrent3x3 = !!(img && wx >= -w && wx < 2 * w && wy >= -h && wy < 2 * h);
                if (!inCurrent3x3) {
                    const areaNow = getCurrentTileCoords();
                    const areaX = Number(areaNow.x || 0);
                    const areaY = Number(areaNow.y || 0);
                    const dx = Math.floor(wx / Math.max(1, w));
                    const dy = Math.floor(wy / Math.max(1, h));
                    const targetArea = { x: areaX + dx, y: areaY + dy };
                    pendingZoomToItem = item;
                    loadImage(targetArea.x, targetArea.y, true);
                    // zoom will occur after load completes (see below)
                } else {
                    zoomToSign(item);
                }
            } catch { zoomToSign(item); }
        }
        try { localStorage.setItem('last.image.url', item.url || ''); localStorage.setItem('last.image.name', item.name || 'image.png'); } catch { }
    } else {
        pendingZoomToSelected = !!zoom;
    }
    scheduleRender();
}
