const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { Impit } = require('impit');
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const { startBrowser } = require('./browser');

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

async function purchaseProduct(token, productId, quantity) {
  return impit.fetch('https://backend.wplace.live/purchase', {
    method: 'POST',
    headers: {
      'cookie': `j=${token || ''}`
    },
    body: JSON.stringify({ product: { id: productId, amount: quantity } })
  }).then(async res => {
    debugLog('[purchaseProduct] response:', res.status, res.statusText, await res.text());
    return res.json()
  }).catch(err => {
    debugLog('[purchaseProduct] Error occurred:', err.message);
    return null
  });
}
async function fetchMe(token) {
  return impit.fetch('https://backend.wplace.live/me', {
    headers: {
      'cookie': `j=${token || ''}`
    }
  }).then(res => res.json()).catch(err => {
    debugLog('[fetchMe] Error occurred:', err.message);
    return null
  });
}

const sseClients = new Set();
function sseBroadcast(eventName, payload) {
  try {
    sseClients.forEach((res) => {
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { }
    });
  } catch { }
}

async function startServer(port, host) {
  ensureDb()
  const { signBody, captchaToken, openPage } = await startBrowser()
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

  // Favorites API
  app.get('/api/favorites', (req, res) => {
    const favorites = readJson(FAVORITES_FILE, []);
    res.set('Cache-Control', 'no-store')
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

  app.head('/api/captcha-ready', (req, res) => {
    sseBroadcast('token', { ready: true })
    res.status(204).end();
  })

  // Pixel API
  app.post('/api/pixel/:area/:no', async (req, res) => {
    try {
      const { area, no } = req.params;
      const { colors = [], coords = [], j: jToken = '' } = req.body;

      if (!colors.length || !coords.length || !jToken) {
        return res.status(400).json({ error: 'invalid payload' });
      }
      if (!captchaToken()) {
        return res.status(400).json({ error: 'captcha token not ready' });
      }
      const accounts = readJson(ACCOUNTS_FILE, []);
      const { fp, id } = accounts.find(a => a.token === jToken);

      const remotePath = `https://backend.wplace.live/s0/pixel/${encodeURIComponent(area)}/${encodeURIComponent(no)}`;
      const payload = {
        colors,
        coords,
        t: captchaToken(),
        fp: fp || crypto.createHash('md5').update(jToken).digest('hex')
      };

      const xpaw = await signBody(id, remotePath, payload);
      const headers = {
        'cookie': `j=${jToken};`,
        'x-pawtect-token': xpaw,
        'x-pawtect-variant': 'koala'
      };

      const response = await impit.fetch(remotePath, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers
      });
      captchaToken(true)
      Readable.fromWeb(response.body).pipe(res).on('error', err => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Pixel post error', message: err.message });
        } else {
          res.end()
        }
      })
    } catch (e) {
      res.status(502).json({ error: 'proxy failed ' + e.message });
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
    res.set('Cache-Control', 'no-store');
    res.json(accounts);
  });

  const updateAccount = async (req, res) => {
    const { id } = req.params

    const accounts = readJson(ACCOUNTS_FILE, []);
    const idx = accounts.findIndex(a => a.id && a.id === +id);
    if (idx < 0) {
      return res.status(404).json({ error: 'account not found' });
    }

    const account = { ...accounts[idx] }
    const { name, token, pixelRight, active, autobuy } = req.body

    name && (account.name = name)
    token && (account.token = token)
    pixelRight && (account.pixelRight = pixelRight)
    active && (account.active = active)
    autobuy && (account.autobuy = autobuy)

    accounts[idx] = account
    writeJson(ACCOUNTS_FILE, accounts);
    res.status(200).json(account)
  }
  app.route('/api/accounts/:id')
    .put(updateAccount)
    .patch(updateAccount)
    .delete(async (req, res) => {
      try {
        const { id } = req.params;

        if (!id) {
          return res.status(404).json({ error: 'id required' });
        }

        const accounts = readJson(ACCOUNTS_FILE, []);
        const next = accounts.filter(a => !(a && typeof a.id === 'number' && a.id === +id));
        writeJson(ACCOUNTS_FILE, next);
        res.status(204).end();
      } catch (e) {
        res.status(500).json({ error: 'failed to delete' });
      }
    })

  app.post('/api/accounts', async (req, res) => {
    try {
      const { token, name, proxy = '' } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const existing = accounts.find(a => a && typeof a.token === 'string' && a.token === token);

      if (existing) {
        return res.status(409).json({ error: 'account already exists' });
      }

      const response = await fetchMe(token);
      if (!response || !response.charges) {
        return res.status(400).json({ error: 'invalid token' });
      }
      const account = {
        fp: crypto.createHash('md5').update(token).digest('hex'),
        name: name || response.name,
        token,
        id: response.id,
        pixelCount: Math.floor(response.charges.count),
        pixelMax: response.charges.max,
        droplets: response.droplets,
        extraColorsBitmap: Math.floor(response.extraColorsBitmap),
        active: !response.banned,
        proxy,
      }

      accounts.push(account);
      writeJson(ACCOUNTS_FILE, accounts);
      res.status(201).json(account);
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
      const account = accounts[idx]

      for (let index = 0; index < 2; index++) {
        const me = await fetchMe(account.token);

        account.active = Boolean(me && me.charges && !me.banned)
        if (account.active) {
          account.pixelCount = Math.floor(me.charges.count)
          account.pixelMax = me.charges.max
          account.droplets = me.droplets
          account.extraColorsBitmap = Math.floor(me.extraColorsBitmap)

          if (account.autobuy === "max" || account.autobuy === "rec") {
            const productId = account.autobuy === 'max' ? 70 : 80;
            const droplets = Number(account.droplets || 0);
            const quantity = Math.floor(droplets / 500);
            if (quantity > 0) {
              const purchaseResult = await purchaseProduct(account.token, productId, quantity);
              if (purchaseResult) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
            }
          }
        }
        break;
      }
      accounts[idx] = account;

      writeJson(ACCOUNTS_FILE, accounts);
      res.status(200).json(account);
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
    openPage(`http://${host}:${port}`)
  });

  return server;
}

function main() {

  let port = 3000;
  let host = 'localhost';

  startServer(port, host);
}

if (require.main === module) {
  main();
}
