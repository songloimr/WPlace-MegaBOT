const { Readable } = require('stream');
const { createImpit } = require('../impit');
const { readJson } = require('../db');
const { ACCOUNTS_FILE } = require('../config');

function setupPurchaseAPI(app) {
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

      const payloadObj = { product: { id: productId, amount } };
      if (Number.isFinite(variant)) {
        payloadObj.product.variant = variant;
      }
      const payload = JSON.stringify(payloadObj);

      const accounts = readJson(ACCOUNTS_FILE, []);
      const account = accounts.find(a => a.token === jToken) || {};
      const { proxy } = account;

      const response = await createImpit({
        proxyUrl: proxy || undefined,
        timeout: 15_000
      }).fetch('https://backend.wplace.live/purchase', {
        method: 'POST',
        body: payload,
        headers: { 'cookie': `j=${jToken}` }
      });

      Readable.fromWeb(response.body).pipe(res).on('error', () => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Purchase fetch error' });
        } else {
          res.end();
        }
      });
    } catch (e) {
      res.status(400).json({ error: 'error', message: e.message });
    }
  });
}

module.exports = { setupPurchaseAPI };
