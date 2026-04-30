const { readJson } = require('../db');
const { ACCOUNTS_FILE } = require('../config');

function registerPixelRoutes(app, { paint }) {
  app.post('/api/pixel/:area/:no', async (req, res) => {
    try {
      const { area, no } = req.params;
      const { colors = [], coords = [], j: jToken = '' } = req.body;

      if (!colors.length || !coords.length || !jToken) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const accounts = readJson(ACCOUNTS_FILE, []);
      const accountData = accounts.find(a => a.token === jToken);
      const { fp, id, proxy } = accountData || {};
      const remotePath = `https://backend.wplace.live/s0/pixel/${encodeURIComponent(area)}/${encodeURIComponent(no)}`;

      const response = await paint({ fp, coords, colors, requestUrl: remotePath, cookie: jToken });
      res.json(response);
    } catch (e) {
      res.status(502).json({ error: 'proxy failed ' + e.message });
    }
  });
}

module.exports = { registerPixelRoutes };
