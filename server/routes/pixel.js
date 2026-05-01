const { readJson } = require('../db');
const { createImpit } = require('../impit');
const { ACCOUNTS_FILE } = require('../config');

// TODO: Import computePawtectToken từ module mà bạn sẽ implement
// const { computePawtectToken } = require('../pawtect');

function registerPixelRoutes(app, getHeaders) {
  app.post('/api/pixel/:area/:no', async (req, res) => {
    try {
      const { area, no } = req.params;
      const { colors = [], x = [], y = [], j: jToken = '' } = req.body;

      if (!colors.length || !x.length || !y.length || x.length !== y.length || !jToken) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const accountData = accounts.find(a => a.token === jToken);
      const { fp, id, proxy } = accountData || {};
      const remotePath = `https://backend.wplace.live/paint`;

      const bodyPayload = JSON.stringify({
        season: 0,
        tiles: [
          {
            x: Number(area),
            y: Number(no),
            pixels: {
              x,
              y,
              colors
            }
          }
        ]
      });

      const generatedHeaders = await getHeaders({
        userId: id,
        fp,
        requestUrl: `https://backend.wplace.live/files/s0/tiles/${area}/${no}.png`,
        body: bodyPayload
      });

      const response = await createImpit({
        proxyUrl: proxy || undefined,
        timeout: 15_000
      }).fetch(remotePath, {
        method: 'POST',
        body: bodyPayload,
        headers: {
          'cookie': `j=${jToken}`,
          'content-type': 'application/json',
          ...generatedHeaders
        }
      }).then(async r => {
        const text = await r.text();
        try { return JSON.parse(text); } catch { return { raw: text }; }
      });

      res.json(response);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
}

module.exports = { registerPixelRoutes };
