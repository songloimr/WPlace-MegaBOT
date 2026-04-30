const { sseAddClient, sseRemoveClient } = require('../sse');

function registerEventRoutes(app) {
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    try { res.write(': ok\n\n'); } catch { /* non-fatal */ }
    sseAddClient(res);

    const ping = setInterval(() => {
      try { res.write('event: ping\ndata: {}\n\n'); } catch { /* non-fatal */ }
    }, 15000);

    req.on('close', () => {
      try { clearInterval(ping); } catch { /* non-fatal */ }
      sseRemoveClient(res);
    });
  });
}

module.exports = { registerEventRoutes };
