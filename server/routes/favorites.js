const { readJson, writeJson } = require('../db');
const { FAVORITES_FILE } = require('../config');

function registerFavoriteRoutes(app) {
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
    } catch {
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
    } catch {
      res.status(500).json({ error: 'failed to delete' });
    }
  });
}

module.exports = { registerFavoriteRoutes };
