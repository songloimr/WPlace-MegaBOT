const express = require('express');
const cors = require('cors');
const path = require('path');

const { ensureDb } = require('./db');
const { registerTileRoutes } = require('./routes/tiles');
const { registerEventRoutes } = require('./routes/events');
const { registerAccountRoutes } = require('./routes/accounts');
const { setupPurchaseAPI } = require('./routes/purchase');
const { registerPixelRoutes } = require('./routes/pixel');
const { registerFavoriteRoutes } = require('./routes/favorites');

async function startServer(port, host) {
  ensureDb();
  const { startBrowser } = require('../browser');
  const { openPage, getHeaders } = await startBrowser();
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.text());

  app.use(express.static(path.resolve(process.cwd(), 'public'), {
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    }
  }));

  // Routes
  registerTileRoutes(app);
  registerEventRoutes(app);
  registerAccountRoutes(app);
  setupPurchaseAPI(app);
  registerPixelRoutes(app, getHeaders);
  registerFavoriteRoutes(app);

  app.head('/api/captcha-ready', (req, res) => {
    const { sseBroadcast } = require('./sse');
    sseBroadcast('token', { ready: true });
    res.status(204).end();
  });

  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).send('Not Found');
  });

  const server = app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}/`);
    openPage(`http://${host}:${port}`);
  });

  return server;
}

module.exports = { startServer };
