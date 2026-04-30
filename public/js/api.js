let favoritesCache = [];
async function refreshFavorites() {
    try {
        favoritesCache = await fetchJson('/api/favorites');
    } catch {
        favoritesCache = [];
    }
}
function getFavorites() { return favoritesCache; }
async function addFavorite(entry) {
    try {
        await fetchOk('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    } catch { }
    await refreshFavorites();
}
async function removeFavorite(entry) {
    try {
        await fetchOk('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    } catch { }
    await refreshFavorites();
}



async function loadAccounts() {
    try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        if (Array.isArray(data)) renderAccountsTable(data);
    } catch { }
}
async function refreshAccountById(accountId) {
    try {
        await fetch('/api/accounts/' + encodeURIComponent(String(accountId)) + '/refresh', { method: 'POST' });
    } catch { }
    try { await loadAccounts(); } catch { }
}
const BULK_REFRESH_PERIOD_MS = 90 * 1000;
let lastBulkRefreshAt = 0;
let bulkRefreshInFlight = false;
async function refreshAllAccounts() {
    const now = Date.now();
    if (bulkRefreshInFlight) return;
    if (now - lastBulkRefreshAt < BULK_REFRESH_PERIOD_MS - 500) return;
    bulkRefreshInFlight = true;
    try {
        const res = await fetch('/api/accounts');
        const rows = await res.json();
        if (Array.isArray(rows)) {
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const id = r && r.id != null ? String(r.id) : '';
                if (!id) continue;
                try { await fetch('/api/accounts/' + encodeURIComponent(id) + '/refresh', { method: 'POST' }); } catch { }

                try { await new Promise(resolve => setTimeout(resolve, 1000)); } catch { }
            }
        }
    } catch { }
    try { await loadAccounts(); } catch { }
    try { reloadCurrentBackground(); } catch { }
    lastBulkRefreshAt = Date.now();
    bulkRefreshInFlight = false;
}




async function postBatch(area, no, colors, coords, jToken) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PAINT_REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch('/api/pixel/' + encodeURIComponent(area) + '/' + encodeURIComponent(no), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colors, coords, j: jToken }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        let payload = null;
        try { payload = JSON.parse(text); } catch { }

        return { ok: res.status < 500 && !!(payload && Object.prototype.hasOwnProperty.call(payload, 'painted')), payload, text, status: res.status };
    } catch (e) {
        clearTimeout(timeoutId);
        const isTimeout = e.name === 'AbortError' || (e.message && e.message.includes('aborted'));
        return {
            ok: false,
            error: isTimeout ? 'Request timed out' : (e && e.message ? e.message : String(e)),
            status: isTimeout ? 504 : 0
        };
    }
}


function groupPixelsByTile(colors, coords) {
    const tileWidth = currentTileW || (img ? img.width : 0);
    const tileHeight = currentTileH || (img ? img.height : 0);
    const cols = currentMosaicCols || 1;
    const map = new Map();
    for (let i = 0; i < colors.length; i++) {
        const wx = coords[i * 2];
        const wy = coords[i * 2 + 1];
        const col = Math.floor(wx / tileWidth);
        const row = Math.floor(wy / tileHeight);
        const index = row * cols + col;
        const tile = currentTiles[index] || currentTiles[0] || { x: 0, y: 0 };
        const localX = wx - col * tileWidth;
        const localY = wy - row * tileHeight;
        const key = tile.x + ',' + tile.y;
        let g = map.get(key);
        if (!g) {
            g = { area: tile.x, no: tile.y, coords: [], colors: [] };
            map.set(key, g);
        }
        g.coords.push(localX, localY);
        g.colors.push(colors[i]);
    }
    return Array.from(map.values());
}
