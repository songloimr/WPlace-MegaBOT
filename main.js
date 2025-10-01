const fs = require('fs');
const path = require('path');
const { Impit } = require('impit');
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const { resolve } = require('dns/promises');

const impit = new Impit({
  browser: "chrome", // or "firefox"
  ignoreTlsErrors: true,
  followRedirects: true,
  headers: {
    'sec-gpc': '1',
    'origin': 'https://wplace.live',
    'referer': 'https://wplace.live/',
    'dnt': '1'
  }
});

let DEBUG = !!(process.env.DEBUG_HTTP && String(process.env.DEBUG_HTTP) !== '0');
let DEBUG_MASK = !(process.env.DEBUG_MASK === '0' || process.env.DEBUG_MASK === 'false');
function enableDebug() { DEBUG = true; }
function enableDebugFull() { DEBUG = true; DEBUG_MASK = false; }

function debugLog(...args) { if (DEBUG) { try { console.log('[debug]', ...args); } catch { } } }

const DB_DIR = path.resolve(process.cwd(), 'db');
const ACCOUNTS_FILE = path.join(DB_DIR, 'accounts.json');
const SETTINGS_FILE = path.join(DB_DIR, 'settings.json');
const FAVORITES_FILE = path.join(DB_DIR, 'favorites.json');

function ensureDb() {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch { }
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2)); } catch { }
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ cf_clearance: '', worldX: null, worldY: null }, null, 2)); } catch { }
  }
  if (!fs.existsSync(FAVORITES_FILE)) {
    try { fs.writeFileSync(FAVORITES_FILE, JSON.stringify([], null, 2)); } catch { }
  }
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
// Simple SSE hub for live events from extension → UI
const sseClients = new Set();
function sseBroadcast(eventName, payload) {
  try {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    sseClients.forEach((res) => {
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${data}\n\n`);
      } catch { }
    });
  } catch { }
}


function deactivateAccountByToken(jToken) {
  try {
    if (!jToken) return;
    const accounts = readJson(ACCOUNTS_FILE, []);
    const idx = accounts.findIndex(a => a && typeof a.token === 'string' && a.token === jToken);
    if (idx === -1) return;
    const current = accounts[idx] || {};
    const updated = { ...current, active: false };
    accounts[idx] = updated;
    writeJson(ACCOUNTS_FILE, accounts);
    console.log('[auto] account deactivated due to 500 when posting pixel:', current && current.name ? current.name : '(unknown)');
  } catch { }
}

async function fetchMe(token) {
  return impit.fetch('https://backend.wplace.live/me', {
    headers: {
      'cookie': `j=${token || ''}`
    }
  }).then(async res => {
    debugLog('[fetchMe] response:', res.status, res.statusText, await res.text());
    return res.json()
  }).catch(err => {
    debugLog('[fetchMe] Error occurred:', err.message);
  });
}

function startServer(port, host) {
  ensureDb()
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.text());

  // Serve static files from public directory
  app.use(express.static(path.resolve(process.cwd(), 'public'), {
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    }
  }));

  // Tile proxy route
  app.get('/tiles/:area/:no.png', async (req, res) => {
    const { area, no } = req.params;
    const remoteUrl = `https://backend.wplace.live/files/s0/tiles/${encodeURIComponent(area)}/${encodeURIComponent(no)}.png`;

    try {
      const response = await impit.fetch(remoteUrl, {
        headers: {
          'accept': 'image/webp,*/*'
        }
      });

      Readable.fromWeb(response.body).pipe(res).on('error', err => {
        if (!res.headersSent) {
          res.status(502).send('Tile fetch error: ' + err.message);
        } else {
          res.end()
        }
      })
    } catch (e) {
      res.status(502).send('Tile fetch error');
    }
  });

  // Server-Sent Events for live notifications
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    try { res.write(': ok\n\n'); } catch { }
    sseClients.add(res);

    const ping = setInterval(() => {
      try { res.write('event: ping\ndata: {}\n\n'); } catch { }
    }, 15000);

    req.on('close', () => {
      try { clearInterval(ping); } catch { }
      sseClients.delete(res);
    });
  });

  // Token endpoint
  app.options('/api/token', (req, res) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    });
    res.status(204).end();
  });

  app.post('/api/token', async (req, res) => {
    try {
      const { token, xpaw, fp, worldX, worldY } = req.body;

      if (!token) {
        return res.status(400).json({ ok: false });
      }

      try {
        const existing = readJson(SETTINGS_FILE, { cf_clearance: '', worldX: null, worldY: null });
        const merged = { ...existing };
        if (worldX != null) merged.worldX = Number(worldX);
        if (worldY != null) merged.worldY = Number(worldY);
        writeJson(SETTINGS_FILE, merged);
      } catch { }

      sseBroadcast('token', { token, xpaw, fp, worldX, worldY });
      res.status(204).end();
    } catch (e) {
      res.status(400).json({ ok: false });
    }
  });

  // Favorites API
  app.get('/api/favorites', (req, res) => {
    const favorites = readJson(FAVORITES_FILE, []);
    res.set('Cache-Control', 'no-store');
    res.json(favorites);
  });

  app.post('/api/favorites', async (req, res) => {
    try {
      const { name = '', mode: modeRaw = '', coords: coordsIn = [] } = req.body;
      const mode = (modeRaw === 'mosaic' || modeRaw === 'single') ? modeRaw : 'single';
      const coords = coordsIn.map((c) => ({ x: Number(c && c.x), y: Number(c && c.y) }))
        .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));

      if (!coords.length) {
        return res.status(400).json({ error: 'invalid coords' });
      }

      const favs = readJson(FAVORITES_FILE, []);
      const sameLoc = (a, b) => a && b && a.mode === b.mode && JSON.stringify(a.coords) === JSON.stringify(b.coords);
      const incoming = { name, mode, coords };
      const idx = favs.findIndex((f) => sameLoc(f, incoming));

      let status = 200;
      if (idx >= 0) {
        const current = favs[idx] || {};
        favs[idx] = { ...current, name: name || current.name || '' };
      } else {
        favs.push(incoming);
        status = 201;
      }

      writeJson(FAVORITES_FILE, favs);
      res.status(status).json(incoming);
    } catch (e) {
      res.status(500).json({ error: 'failed to save' });
    }
  });

  app.delete('/api/favorites', async (req, res) => {
    try {
      const { mode: modeRaw = '', coords: coordsIn = [] } = req.body;
      const mode = (modeRaw === 'mosaic' || modeRaw === 'single') ? modeRaw : '';
      const coords = coordsIn.map((c) => ({ x: Number(c && c.x), y: Number(c && c.y) }))
        .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));

      if (!mode || !coords.length) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const favs = readJson(FAVORITES_FILE, []);
      const sameLoc = (a, b) => a && b && a.mode === b.mode && JSON.stringify(a.coords) === JSON.stringify(b.coords);
      const target = { mode, coords };
      const next = favs.filter((f) => !sameLoc(f, target));

      writeJson(FAVORITES_FILE, next);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: 'failed to delete' });
    }
  });

  // Pixel API
  app.post('/api/pixel/:area/:no', async (req, res) => {
    try {
      const { area, no } = req.params;
      const { colors = [], coords = [], t = '', j: jToken = '', fp = '', xpaw = '' } = req.body;

      if (!colors.length || !coords.length || !t || !jToken || !fp || !xpaw) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const remotePath = `/s0/pixel/${encodeURIComponent(area)}/${encodeURIComponent(no)}`;
      const payload = JSON.stringify({ colors, coords, t, fp });

      try {
        debugLog('proxy pixel POST begin (impit)', { path: remotePath });
        const headers = {
          'cookie': `j=${jToken};`,
          'x-pawtect-token': xpaw,
          'x-pawtect-variant': 'koala'
        };

        const response = await impit.fetch('https://backend.wplace.live' + remotePath, payload, { headers });
        const status = response.status || 0;
        const text = await response.text() || '';

        debugLog('proxy pixel POST end (impit)', { status, bodyPreview: String(text || '').slice(0, 300) });

        if (status >= 500) {
          try { deactivateAccountByToken(jToken); } catch { }
        }

        res.status(status || 502).send(text);
      } catch (e) {
        debugLog('proxy pixel POST error (impit)', { error: e.message });
        res.status(502).json({ error: 'upstream error', message: e.message });
      }
    } catch (e) {
      res.status(500).json({ error: 'proxy failed' });
    }
  });

  // Purchase API
  app.post('/api/purchase', async (req, res) => {
    try {
      const {
        productId: productIdRaw,
        amount: amountRaw = 1,
        variant: variantRaw,
        j: jToken = ''
      } = req.body;

      const productId = Number(productIdRaw);
      const amount = Math.max(1, Number(amountRaw || 1));
      const variant = (variantRaw == null ? null : Number(variantRaw));

      if (!Number.isFinite(productId) || productId <= 0 || !jToken) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const payloadObj = { product: { id: productId, amount: amount } };
      if (Number.isFinite(variant)) {
        payloadObj.product.variant = variant;
      }
      const payload = JSON.stringify(payloadObj);

      const response = await impit.fetch('https://backend.wplace.live/purchase', {
        method: 'POST',
        body: payload,
        headers: {
          'cookie': `j=${jToken}`
        }
      })
      Readable.fromWeb(response.body).pipe(res).on('error', err => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Purchase fetch error', message: err.message });
        } else {
          res.end()
        }
      })
    } catch (e) {
      res.status(400).json({ error: 'error', message: e.message });
    }
  });

  // Accounts API
  app.get('/api/accounts', (req, res) => {
    const accounts = readJson(ACCOUNTS_FILE, []);
    try {
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        const cf = a && typeof a.cf_clearance === 'string' ? a.cf_clearance : '';
        if (!cf || cf.length < 30) { accounts[i] = { ...a, active: false }; }
      }
      writeJson(ACCOUNTS_FILE, accounts);
    } catch { }

    res.set('Cache-Control', 'no-store');
    res.json(accounts);
  });

  app.delete('/api/accounts', async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const next = accounts.filter(a => !(a && typeof a.token === 'string' && a.token === token));
      writeJson(ACCOUNTS_FILE, next);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: 'failed to delete' });
    }
  });

  app.put('/api/accounts', async (req, res) => {
    try {
      const { token, active = true } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const idx = accounts.findIndex(a => a && typeof a.token === 'string' && a.token === token);
      const incoming = { token, cf_clearance, active };

      let status = 200;
      if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], ...incoming };
      } else {
        accounts.push(incoming);
        status = 201;
      }

      writeJson(ACCOUNTS_FILE, accounts);
      res.status(status).json(incoming);
    } catch (e) {
      res.status(500).json({ error: 'failed to save' });
    }
  });

  app.patch('/api/accounts', async (req, res) => {
    try {
      const { token, active = true } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const idx = accounts.findIndex(a => a && typeof a.token === 'string' && a.token === token);
      const incoming = { token, cf_clearance, active };

      let status = 200;
      if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], ...incoming };
      } else {
        accounts.push(incoming);
        status = 201;
      }

      writeJson(ACCOUNTS_FILE, accounts);
      res.status(status).json(incoming);
    } catch (e) {
      res.status(500).json({ error: 'failed to save' });
    }
  });

  app.post('/api/accounts', async (req, res) => {
    try {
      const { token, active = true } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const existing = accounts.find(a => a && typeof a.token === 'string' && a.token === token);

      if (existing) {
        return res.status(409).json({ error: 'account already exists' });
      }

      const incoming = { token, active };
      accounts.push(incoming);
      writeJson(ACCOUNTS_FILE, accounts);
      res.status(201).json(incoming);
    } catch (e) {
      res.status(500).json({ error: 'failed to save' });
    }
  });

  // Refresh account data
  app.post('/api/accounts/:id/refresh', async (req, res) => {
    try {
      const { id } = req.params

      if (!id) {
        return res.status(400).json({ error: 'id required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const idx = accounts.findIndex(a => a.id == id);
      if (idx < 0) {
        res.status(404).json({ error: 'not found' })
        return;
      }

      const me = await fetchMe(accounts[idx].token);
      res.json(me);
    } catch (e) {
      res.status(500).json({ error: 'refresh failed', message: e.message });
    }
  });

  // Handle favicon.ico
  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).send('Not Found');
  });

  // Start server
  const server = app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}/`);
  });

  return server;
}

function main() {
  const args = process.argv.slice(2);

  let port = 3000;
  let host = 'localhost';
  let cookieHeader = null;
  let jOpt = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--cookie=')) cookieHeader = a.slice('--cookie='.length);
    else if (a === '--cookie' && i + 1 < args.length) { cookieHeader = args[++i]; }
    else if (a.startsWith('--j=')) jOpt = a.slice('--j='.length);
    else if (a === '--j' && i + 1 < args.length) { jOpt = args[++i]; }
    else if (a.startsWith('--port=')) port = parseInt(a.split('=')[1], 10) || port;
    else if (a === '--port' && i + 1 < args.length) { port = parseInt(args[++i], 10) || port; }
    else if (a.startsWith('--host=')) host = a.split('=')[1] || host;
  }

  startServer(port, host);
}

if (require.main === module) {
  main();
}
