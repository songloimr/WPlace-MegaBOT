function getPaletteRgbById(id) {
    const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    for (let i = 0; i < arr.length; i++) { if (arr[i].id === id) return arr[i].rgb; }
    return [255, 255, 255];
}
const COLORED_MARKER_CACHE = new Map();
function getMarkerSrcForColorId(colorId) {
    if (colorId == null) return SELECTED_ICON_SRC;
    const k = String(colorId);
    if (COLORED_MARKER_CACHE.has(k)) return COLORED_MARKER_CACHE.get(k);
    const rgb = getPaletteRgbById(colorId);
    const off = document.createElement('canvas');
    off.width = 8; off.height = 8;
    const octx = off.getContext('2d');
    octx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    octx.fillRect(0, 0, off.width, off.height);
    const url = off.toDataURL('image/png');
    COLORED_MARKER_CACHE.set(k, url);
    return url;
}



function getSelectedMap(item) {
    if (!item) return null;
    if (!item._selectedPixels) item._selectedPixels = new Map();
    return item._selectedPixels;
}
function keyFor(x, y) { return String(x) + ',' + String(y); }
function isPixelSelected(item, x, y) {
    const map = getSelectedMap(item); if (!map) return false; return map.has(keyFor(x, y));
}
function addPixelSelection(item, x, y, colorIdOverride = null) {
    const map = getSelectedMap(item); if (!map) return false;
    const k = keyFor(x, y); if (map.has(k)) return false;
    let effectiveColorId = colorIdOverride;
    if (effectiveColorId == null) {
        try { effectiveColorId = getItemPixelPaletteId(item, x, y); } catch { }
    }
    if (effectiveColorId != null && effectiveColorId !== 0 && isPremiumColorId(effectiveColorId)) {
        const hasSelectedAccounts = Array.isArray(readySelectedAccountIds) && readySelectedAccountIds.length > 0;
        if (!hasSelectedAccounts) { try { showToast(t('messages.selectAccountFirst'), 'error', 2000); } catch { } return false; }
        const remain = getPremiumColorRemainingLimit(effectiveColorId);
        if (!(remain > 0)) { try { showToast(t('messages.premiumColorLimitReached'), 'error', 2000); } catch { } return false; }
    }
    // Store lightweight record; drawing handled by canvas overlay
    map.set(k, { x, y, el: null, fillEl: null, colorId: effectiveColorId });
    try { item._lastManualSelected = { x, y }; } catch { }
    if (pixelSelectedList) pixelSelectedList.hidden = false;
    scheduleOverlayDraw();
    try { refreshPaletteTooltips(); } catch { }
    return true;
}
function removePixelSelection(item, x, y) {
    const map = getSelectedMap(item); if (!map) return false;
    const k = keyFor(x, y); const rec = map.get(k); if (!rec) return false;
    // Remove from canvas overlay by redrawing without this record
    map.delete(k);
    scheduleOverlayDraw();
    try { refreshPaletteTooltips(); } catch { }
    return true;
}
function clearSelectionsForItem(item) {
    const map = getSelectedMap(item);
    if (!map) return;
    // Canvas overlay redraw will drop visuals
    map.clear();
    scheduleOverlayDraw();
    try { item._lastManualSelected = null; } catch { }
    try { refreshPaletteTooltips(); } catch { }
}
function clearAllReadySelections() {
    try { if (pixelHoverEl) pixelHoverEl.hidden = true; } catch { }
    try { if (pixelSelectedList) pixelSelectedList.hidden = true; } catch { }
    for (let i = 0; i < signItems.length; i++) {
        const it = signItems[i];
        if (it) clearSelectionsForItem(it);
    }

    try { if (readyGlobalSelected) readyGlobalSelected.clear(); } catch { }
    try {
        if (pixelSelectedList) {
            while (pixelSelectedList.firstChild) pixelSelectedList.removeChild(pixelSelectedList.firstChild);
        }
    } catch { }
    updatePixelMarkers();
    scheduleOverlayDraw();
    try { updateReadySelectionLabel(); } catch { }
    try { updateStartEnabled(); } catch { }
    try { updateAutoSelectButtonLabel(); } catch { }
    try { refreshPaletteTooltips(); } catch { }
}
function ensureRenderedSelectedForItem(item) {
    if (!item) return;
    if (!selectionOverlay || !selectionCtx) return;
    scheduleOverlayDraw();
}
function positionSelectedMarkersForItem(item) {
    if (!item) return;
    scheduleOverlayDraw();
}



function srgbToXyz(r, g, b) {
    let sr = r / 255, sg = g / 255, sb = b / 255;
    const toLin = (u) => (u <= 0.04045) ? (u / 12.92) : Math.pow((u + 0.055) / 1.055, 2.4);
    sr = toLin(sr); sg = toLin(sg); sb = toLin(sb);
    const x = sr * 0.4124 + sg * 0.3576 + sb * 0.1805;
    const y = sr * 0.2126 + sg * 0.7152 + sb * 0.0722;
    const z = sr * 0.0193 + sg * 0.1192 + sb * 0.9505;
    return [x, y, z];
}
function xyzToLab(x, y, z) {
    const xn = 0.95047, yn = 1.0, zn = 1.08883;
    x /= xn; y /= yn; z /= zn;
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function srgbToLab(r, g, b) {
    const xyz = srgbToXyz(r, g, b); return xyzToLab(xyz[0], xyz[1], xyz[2]);
}
function srgbToOklab(r, g, b) {
    let sr = r / 255, sg = g / 255, sb = b / 255;
    const toLin = (u) => (u <= 0.04045) ? (u / 12.92) : Math.pow((u + 0.055) / 1.055, 2.4);
    sr = toLin(sr); sg = toLin(sg); sb = toLin(sb);
    const l = 0.4122214708 * sr + 0.5363325363 * sg + 0.0514459929 * sb;
    const m = 0.2119034982 * sr + 0.6806995451 * sg + 0.1073969566 * sb;
    const s = 0.0883024619 * sr + 0.2817188376 * sg + 0.6299787005 * sb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return [
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    ];
}
function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1; const [L2, a2, b2] = lab2;
    const avgLp = (L1 + L2) / 2;
    const C1 = Math.hypot(a1, b1); const C2 = Math.hypot(a2, b2);
    const avgC = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1; const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1); const C2p = Math.hypot(a2p, b2);
    const avgCp = (C1p + C2p) / 2;
    let h1p = Math.atan2(b1, a1p); if (h1p < 0) h1p += 2 * Math.PI;
    let h2p = Math.atan2(b2, a2p); if (h2p < 0) h2p += 2 * Math.PI;
    let deltahp;
    const diffh = h2p - h1p;
    if (isNaN(h1p) || isNaN(h2p)) deltahp = 0;
    else if (Math.abs(diffh) <= Math.PI) deltahp = diffh;
    else if (diffh > Math.PI) deltahp = diffh - 2 * Math.PI;
    else deltahp = diffh + 2 * Math.PI;
    const deltaLp = L2 - L1;
    const deltaCp = C2p - C1p;
    const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deltahp / 2);
    const avgLpMinus50Sq = Math.pow(avgLp - 50, 2);
    const Sl = 1 + (0.015 * avgLpMinus50Sq) / Math.sqrt(20 + avgLpMinus50Sq);
    const Sc = 1 + 0.045 * avgCp;
    const T = 1 - 0.17 * Math.cos((h1p + h2p) / 2 - Math.PI / 6) + 0.24 * Math.cos(2 * (h1p + h2p) / 2) + 0.32 * Math.cos(3 * (h1p + h2p) / 2 + Math.PI / 30) - 0.20 * Math.cos(4 * (h1p + h2p) / 2 - 63 * Math.PI / 180);
    const Sh = 1 + 0.015 * avgCp * T;
    const deltaTheta = 30 * Math.PI / 180 * Math.exp(-Math.pow(((h1p + h2p) / 2 - 275 * Math.PI / 180) / (25 * Math.PI / 180), 2));
    const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
    const Rt = -Rc * Math.sin(2 * deltaTheta);
    return Math.sqrt(Math.pow(deltaLp / Sl, 2) + Math.pow(deltaCp / Sc, 2) + Math.pow(deltaHp / Sh, 2) + Rt * (deltaCp / Sc) * (deltaHp / Sh));
}
let PALETTE_LAB = [];
let PALETTE_OKLAB = [];
let EXACT_PALETTE_MAP = new Map();
function recomputePaletteCaches() {
    try {
        const arrActive = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
        const arrLab = [];
        const arrOk = [];
        const m = new Map();
        for (let i = 0; i < arrActive.length; i++) {
            const p = arrActive[i];
            const lab = srgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]);
            const ok = srgbToOklab(p.rgb[0], p.rgb[1], p.rgb[2]);
            arrLab.push({ id: p.id, lab, rgb: p.rgb });
            arrOk.push({ id: p.id, oklab: ok, rgb: p.rgb });
            m.set(String(p.rgb[0]) + ',' + String(p.rgb[1]) + ',' + String(p.rgb[2]), p.id);
        }
        PALETTE_LAB = arrLab;
        PALETTE_OKLAB = arrOk;
        EXACT_PALETTE_MAP = m;
    } catch { }
}
try { recomputePaletteCaches(); } catch { }
function nearestPaletteColor(r, g, b, metric) {
    const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    if (metric === 'oklab') {
        const ok = srgbToOklab(r, g, b);
        let best = arr[0].rgb, bestD = Infinity;
        for (let i = 0; i < PALETTE_OKLAB.length; i++) {
            const q = PALETTE_OKLAB[i];
            const dL = ok[0] - q.oklab[0], dA = ok[1] - q.oklab[1], dB = ok[2] - q.oklab[2];
            const d = dL * dL + dA * dA + dB * dB;
            if (d < bestD) { bestD = d; best = q.rgb; if (d === 0) break; }
        }
        return best;
    } else if (metric === 'lab' || metric === 'ciede2000') {
        const lab = srgbToLab(r, g, b);
        let best = arr[0].rgb, bestD = Infinity;
        for (let i = 0; i < PALETTE_LAB.length; i++) {
            const q = PALETTE_LAB[i];
            let d;
            if (metric === 'lab') {
                const dL = lab[0] - q.lab[0], dA = lab[1] - q.lab[1], dB = lab[2] - q.lab[2];
                d = dL * dL + dA * dA + dB * dB;
            } else {
                d = ciede2000(lab, q.lab);
            }
            if (d < bestD) { bestD = d; best = q.rgb; if (d === 0) break; }
        }
        return best;
    } else {
        let best = arr[0].rgb, bestD = Infinity;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i].rgb;
            const d = squaredDistance(r, g, b, p[0], p[1], p[2]);
            if (d < bestD) { bestD = d; best = p; if (d === 0) break; }
        }
        return best;
    }
}
function nearestPaletteId(r, g, b, metric) {
    const arr = (ACTIVE_PALETTE && Array.isArray(ACTIVE_PALETTE)) ? ACTIVE_PALETTE : PALETTE;
    if (metric === 'oklab') {
        const ok = srgbToOklab(r, g, b);
        let bestId = arr[0].id, bestD = Infinity;
        for (let i = 0; i < PALETTE_OKLAB.length; i++) {
            const q = PALETTE_OKLAB[i];
            const dL = ok[0] - q.oklab[0], dA = ok[1] - q.oklab[1], dB = ok[2] - q.oklab[2];
            const d = dL * dL + dA * dA + dB * dB;
            if (d < bestD) { bestD = d; bestId = q.id; if (d === 0) break; }
        }
        return bestId;
    } else if (metric === 'lab' || metric === 'ciede2000') {
        const lab = srgbToLab(r, g, b);
        let bestId = arr[0].id, bestD = Infinity;
        for (let i = 0; i < PALETTE_LAB.length; i++) {
            const q = PALETTE_LAB[i];
            let d;
            if (metric === 'lab') {
                const dL = lab[0] - q.lab[0], dA = lab[1] - q.lab[1], dB = lab[2] - q.lab[2];
                d = dL * dL + dA * dA + dB * dB;
            } else {
                d = ciede2000(lab, q.lab);
            }
            if (d < bestD) { bestD = d; bestId = q.id; if (d === 0) break; }
        }
        return bestId;
    } else {
        let bestId = arr[0].id, bestD = Infinity;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i].rgb;
            const d = squaredDistance(r, g, b, p[0], p[1], p[2]);
            if (d < bestD) { bestD = d; bestId = arr[i].id; if (d === 0) break; }
        }
        return bestId;
    }
}
function rgbToPaletteId(r, g, b) {
    const key = String(r) + ',' + String(g) + ',' + String(b);
    if (EXACT_PALETTE_MAP.has(key)) return EXACT_PALETTE_MAP.get(key);
    const metric = imgColorMetricSelect ? imgColorMetricSelect.value : 'oklab';
    return nearestPaletteId(r, g, b, metric);
}
function quantizeImageToPalette(image) {
    const w = image.naturalWidth | 0, h = image.naturalHeight | 0;
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = false;
    octx.drawImage(image, 0, 0);
    const id = octx.getImageData(0, 0, w, h);
    const data = id.data;
    const alphaTh = imgAlphaInput ? parseInt(imgAlphaInput.value || '0', 10) : 0;
    for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = (data[i + 3] <= alphaTh) ? 0 : 255;
    }
    const metric = imgColorMetricSelect ? imgColorMetricSelect.value : 'oklab';
    if (imgDitherEnabled) {
        const w2 = w + 2;
        const errCurrR = new Float32Array(w2), errCurrG = new Float32Array(w2), errCurrB = new Float32Array(w2);
        const errNextR = new Float32Array(w2), errNextG = new Float32Array(w2), errNextB = new Float32Array(w2);
        for (let y = 0; y < h; y++) {
            const leftToRight = (y % 2 === 0);
            if (leftToRight) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
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
                for (let x = w - 1; x >= 0; x--) {
                    const idx = (y * w + x) * 4;
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
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (data[idx + 3] === 0) continue;
                const nn = nearestPaletteColor(data[idx], data[idx + 1], data[idx + 2], metric);
                data[idx] = nn[0]; data[idx + 1] = nn[1]; data[idx + 2] = nn[2];
            }
        }
    }
    octx.putImageData(id, 0, 0);
    return new Promise((resolve) => { off.toBlob((blob) => resolve(blob), 'image/png'); });
}




function countNonTransparentPixels(image) {
    try {
        const w = image.naturalWidth | 0, h = image.naturalHeight | 0;
        if (!w || !h) return 0;
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.drawImage(image, 0, 0);
        const id = octx.getImageData(0, 0, w, h);
        const data = id.data;
        let cnt = 0;
        for (let i = 3; i < data.length; i += 4) { if (data[i] !== 0) cnt++; }
        return cnt;
    } catch { return 0; }
}



function measurePixelText(text, pixelSize) {
    const glyphW = 5, glyphH = 7, space = 1;
    const cellsW = Math.max(0, text.length * (glyphW + space) - space);
    return { width: cellsW * pixelSize, height: glyphH * pixelSize };
}

function drawPixelText(ctx, text, x, y, pixelSize, color) {
    const glyphW = 5, glyphH = 7, space = 1;
    let cx = x;
    ctx.save();
    ctx.fillStyle = color || '#fff';
    for (let k = 0; k < text.length; k++) {
        const ch = text[k].toLowerCase();
        const g = PIXEL_FONT_5x7[ch] || PIXEL_FONT_5x7[' '];
        for (let r = 0; r < glyphH; r++) {
            const row = g[r] || '00000';
            for (let c = 0; c < glyphW; c++) {
                if (row[c] === '1') ctx.fillRect(cx + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
            }
        }
        cx += (glyphW + space) * pixelSize;
    }
    ctx.restore();
}


function drawPixelIcon(ctx, pattern, x, y, pixelSize, color) {
    ctx.save();
    ctx.fillStyle = color || '#ffffff';
    const h = pattern.length | 0;
    const w = h ? pattern[0].length | 0 : 0;
    for (let r = 0; r < h; r++) {
        const row = pattern[r] || '';
        for (let c = 0; c < w; c++) {
            if (row[c] === '1') ctx.fillRect(x + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
        }
    }
    ctx.restore();
}
function measurePixelIcon(pattern, pixelSize) {
    const h = pattern.length | 0;
    const w = h ? pattern[0].length | 0 : 0;
    return { width: w * pixelSize, height: h * pixelSize };
}

function getContentCenterPx() {
    const c = canvas.getBoundingClientRect();
    const s = sidebar && sidebar.getBoundingClientRect ? sidebar.getBoundingClientRect() : null;
    const regionLeft = s ? Math.max(0, Math.min(c.width, s.right - c.left)) : 0;
    return { x: regionLeft + (c.width - regionLeft) / 2, y: c.height / 2 };
}
