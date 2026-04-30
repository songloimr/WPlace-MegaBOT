const path = require('path');

const DB_DIR = path.resolve(process.cwd(), 'db');
const ACCOUNTS_FILE = path.join(DB_DIR, 'accounts.json');
const SETTINGS_FILE = path.join(DB_DIR, 'settings.json');
const FAVORITES_FILE = path.join(DB_DIR, 'favorites.json');

const PROXY_REGEX = /^([a-zA-Z0-9\_]+:[a-zA-Z0-9\_]+@)?[0-9\.]+:[0-9]+$/;

let DEBUG = !!(process.env.DEBUG_HTTP && String(process.env.DEBUG_HTTP) !== '0');
let DEBUG_MASK = !(process.env.DEBUG_MASK === '0' || process.env.DEBUG_MASK === 'false');

function enableDebug() { DEBUG = true; }
function enableDebugFull() { DEBUG = true; DEBUG_MASK = false; }

function debugLog(...args) {
  if (DEBUG) {
    try { console.log('[debug]', ...args); } catch { /* non-fatal */ }
  }
}

module.exports = {
  DB_DIR, ACCOUNTS_FILE, SETTINGS_FILE, FAVORITES_FILE,
  PROXY_REGEX, DEBUG, DEBUG_MASK,
  enableDebug, enableDebugFull, debugLog
};
