const { Readable } = require('stream');

function registerTileRoutes(app) {
  app.get('/tiles/:area/:no.png', async (req, res) => {
    const { area, no } = req.params;
    const remoteUrl = `https://backend.wplace.live/files/s0/tiles/${encodeURIComponent(area)}/${encodeURIComponent(no)}.png`;

    try {
      // NOTE: Tile fetching intentionally does not use account proxy.
      // Tiles are public static assets; per-account proxy is not required here.
      const response = await fetch(remoteUrl, {
        headers: { 'accept': 'image/webp,*/*' }
      });

      Readable.fromWeb(response.body).pipe(res).on('error', () => {
        if (!res.headersSent) {
          res.status(502).send('Tile fetch error');
        } else {
          res.end();
        }
      });
    } catch {
      res.status(502).send('Tile fetch error');
    }
  });
}

module.exports = { registerTileRoutes };
