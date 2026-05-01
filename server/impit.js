const { Impit } = require('impit');

function createImpit(impitOptions = {}) {
  const opts = { ...impitOptions };
  if (opts.proxyUrl) {
    if (!opts.proxyUrl.startsWith('http://') && !opts.proxyUrl.startsWith('https://')) {
      opts.proxyUrl = 'http://' + opts.proxyUrl;
    }
  }
  return new Impit({
    browser: 'chrome',
    ignoreTlsErrors: true,
    followRedirects: true,
    ...opts,
    headers: {
      'sec-gpc': '1',
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'origin': 'https://wplace.live',
      'referer': 'https://wplace.live/',
      'dnt': '1'
    }
  });
}

module.exports = { createImpit };
