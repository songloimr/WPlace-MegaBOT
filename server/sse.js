const sseClients = new Set();

function sseBroadcast(eventName, payload) {
  try {
    sseClients.forEach((res) => {
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* client may have disconnected */ }
    });
  } catch { /* non-fatal */ }
}

function sseAddClient(res) {
  sseClients.add(res);
}

function sseRemoveClient(res) {
  sseClients.delete(res);
}

module.exports = { sseBroadcast, sseAddClient, sseRemoveClient, sseClients };
