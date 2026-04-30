const fs = require('fs');
const { DB_DIR, ACCOUNTS_FILE, SETTINGS_FILE, FAVORITES_FILE } = require('./config');

function ensureDb() {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch { /* directory may exist */ }
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2)); } catch { /* non-fatal */ }
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ cf_clearance: '', worldX: null, worldY: null }, null, 2)); } catch { /* non-fatal */ }
  }
  if (!fs.existsSync(FAVORITES_FILE)) {
    try { fs.writeFileSync(FAVORITES_FILE, JSON.stringify([], null, 2)); } catch { /* non-fatal */ }
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

module.exports = { ensureDb, readJson, writeJson };
