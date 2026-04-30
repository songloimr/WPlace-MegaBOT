const crypto = require('crypto');
const { createImpit } = require('../impit');
const { readJson, writeJson } = require('../db');
const { ACCOUNTS_FILE, PROXY_REGEX, debugLog } = require('../config');

const isValidToken = (token) =>
  typeof token === 'string' && token.startsWith('eyJh') && token.split('.').length === 3;

async function fetchMe({ proxy, token }) {
  return createImpit({
    proxyUrl: proxy || undefined,
    timeout: 20_000
  }).fetch('https://backend.wplace.live/me', {
    headers: { 'cookie': 'j=' + token }
  }).then(res => res.json()).catch(err => {
    debugLog('[fetchMe] Error:', err.message);
    return null;
  });
}

async function purchaseProduct({ proxy, token }, productId, quantity) {
  return createImpit({ proxyUrl: proxy || undefined }).fetch('https://backend.wplace.live/purchase', {
    method: 'POST',
    headers: { 'cookie': `j=${token || ''}` },
    body: JSON.stringify({ product: { id: productId, amount: quantity } })
  }).then(async res => {
    debugLog('[purchaseProduct] response:', res.status, res.statusText, await res.text());
    return res.json();
  }).catch(err => {
    debugLog('[purchaseProduct] Error:', err.message);
    return null;
  });
}

function registerAccountRoutes(app) {
  app.get('/api/accounts', (req, res) => {
    const accounts = readJson(ACCOUNTS_FILE, []);
    res.set('Cache-Control', 'no-store');
    res.json(accounts);
  });

  const updateAccount = async (req, res) => {
    const { id } = req.params;
    const targetId = Number(id);
    const accounts = readJson(ACCOUNTS_FILE, []);
    const idx = accounts.findIndex(a => a && typeof a.id === 'number' && a.id === targetId);
    if (idx < 0) {
      return res.status(404).json({ error: 'account not found' });
    }

    const account = { ...accounts[idx] };
    const { name, token, pixelRight, active, autobuy, proxy } = req.body;

    if (name) account.name = name;
    if (pixelRight) account.pixelRight = pixelRight;
    if (autobuy) account.autobuy = autobuy;

    if (token) {
      if (!isValidToken(token)) {
        return res.status(400).json({ error: 'invalid token' });
      }
      account.token = token;
    }

    if (typeof active === 'boolean') {
      account.active = active;
    }

    if (typeof proxy === 'string' && proxy !== account.proxy) {
      if (proxy === '') {
        account.proxy = '';
      } else if (!PROXY_REGEX.test(proxy)) {
        return res.status(400).json({ error: 'invalid proxy format' });
      }
      account.proxy = proxy;
    }

    accounts[idx] = account;
    writeJson(ACCOUNTS_FILE, accounts);
    res.status(200).json(account);
  };

  app.route('/api/accounts/:id')
    .put(updateAccount)
    .patch(updateAccount)
    .delete(async (req, res) => {
      try {
        const { id } = req.params;
        if (!id) return res.status(404).json({ error: 'id required' });

        const accounts = readJson(ACCOUNTS_FILE, []);
        const next = accounts.filter(a => !(a && typeof a.id === 'number' && a.id === +id));
        writeJson(ACCOUNTS_FILE, next);
        res.status(204).end();
      } catch {
        res.status(500).json({ error: 'failed to delete' });
      }
    });

  app.post('/api/accounts', async (req, res) => {
    try {
      const { token, name, proxy = '' } = req.body;

      if (!token) return res.status(400).json({ error: 'token required' });
      if (proxy && !PROXY_REGEX.test(proxy)) return res.status(400).json({ error: 'invalid proxy format' });

      const accounts = readJson(ACCOUNTS_FILE, []);
      const existing = accounts.find(a => a && typeof a.token === 'string' && a.token === token);
      if (existing) return res.status(409).json({ error: 'account already exists' });

      const response = await fetchMe({ token });
      if (!response || !response.charges) return res.status(400).json({ error: 'invalid token' });

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
      };

      accounts.push(account);
      writeJson(ACCOUNTS_FILE, accounts);
      res.status(201).json(account);
    } catch {
      res.status(500).json({ error: 'failed to save' });
    }
  });

  app.post('/api/accounts/:id/refresh', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'id required' });

      const accounts = readJson(ACCOUNTS_FILE, []);
      const idx = accounts.findIndex(a => a.id == id);
      if (idx < 0) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const account = accounts[idx];

      for (let index = 0; index < 2; index++) {
        const me = await fetchMe(account);

        account.active = Boolean(me && me.charges && !me.banned);
        if (account.active) {
          account.pixelCount = Math.floor(me.charges.count);
          account.pixelMax = me.charges.max;
          account.droplets = me.droplets;
          account.extraColorsBitmap = Math.floor(me.extraColorsBitmap);

          if (account.autobuy === 'max' || account.autobuy === 'rec') {
            const productId = account.autobuy === 'max' ? 70 : 80;
            const droplets = Number(account.droplets || 0);
            if (droplets >= 500) {
              const quantity = Math.floor(droplets / 500);
              const purchaseResult = await purchaseProduct(account, productId, quantity);
              if (purchaseResult) {
                await new Promise(r => setTimeout(r, 1000));
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
  app.post('/api/check-proxy', async (req, res) => {
    try {
      const { user, password, host, port } = req.body;
      if (!host || !port) {
        return res.status(400).json({ ok: false, error: 'host and port required' });
      }
      const userpass = [user, password].filter(Boolean).join(':');
      const proxyStr = userpass ? userpass + '@' + host + ':' + port : host + ':' + port;

      const impit = createImpit({
        proxyUrl: proxyStr,
        timeout: 15_000
      });
      const checkRes = await impit.fetch('http://httpbin.org/ip');
      if (!checkRes.ok) {
        return res.json({ ok: false, error: 'proxy returned status ' + checkRes.status });
      }
      const data = await checkRes.json();
      res.json({ ok: true, ip: data.origin });
    } catch (e) {
      res.status(200).json({ ok: false, error: e.message });
    }
  });
}



module.exports = { registerAccountRoutes };
