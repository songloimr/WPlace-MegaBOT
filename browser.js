const { connect } = require("puppeteer-real-browser");
const { RequestInterceptionManager } = require('puppeteer-intercept-and-modify-requests')
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const DATA_STORE_FILE = path.join(__dirname, 'db', 'browser-data.json');

/* Cross-platform browser detection */
const BROWSER_PATHS = {
    darwin: [
        { flag: 'chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
        { flag: 'chrome',   path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    ],
    win32: [
        { flag: 'chromium', path: 'C:\\Program Files\\Chromium\\Application\\chrome.exe' },
        { flag: 'chromium', path: 'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe' },
        { flag: 'chrome',   path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
    ]
};

function resolveBrowserPath() {
    // 1. Explicit override
    if (process.env.CHROME_PATH && process.env.CHROME_PATH.trim()) {
        console.log(`[browser] Using CHROME_PATH from env: ${process.env.CHROME_PATH}`);
        return process.env.CHROME_PATH.trim();
    }

    const platform = process.platform;
    const candidates = BROWSER_PATHS[platform] || [];
    const pref = (process.env.BROWSER_PREFERENCE || 'auto').toLowerCase();

    // 2. Filter by preference if not 'auto'
    const ordered = pref === 'auto'
        ? candidates
        : candidates.filter(c => c.flag === pref).concat(candidates.filter(c => c.flag !== pref));

    // 3. First that exists
    for (const c of ordered) {
        try {
            if (fs.existsSync(c.path)) {
                console.log(`[browser] Found ${c.flag} at ${c.path}`);
                return c.path;
            }
        } catch { /* skip */ }
    }

    // 4. Auto-detect by puppeteer-real-browser
    console.log('[browser] No explicit path found; using auto-detection');
    return null;
}

function buildBrowserArgs() {
    const platform = process.platform;
    const base = ['--disable-breakpad'];
    if (platform === 'win32') {
        base.unshift('--start-maximized');
    }
    return base;
}

async function init() {
    const userDataDir = path.join(__dirname, 'userdata');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const chromePath = resolveBrowserPath();
    const args = buildBrowserArgs();

    const config = {
        headless: false,
        turnstile: false,
        connectOption: {
            defaultViewport: null,
        },
        customConfig: {
            userDataDir,
        },
        disableXvfb: false,
        args
    };

    if (chromePath) {
        config.customConfig.chromePath = chromePath;
    }

    return connect(config);
}

async function startBrowser() {
    let data = {
        fp: '',
        coords: [],
        colors: [],
        requestUrl: ''
    }
    let isReadyForPaint = false

    const { browser, page } = await init();
    const client = await page.createCDPSession()

    const interceptManager = new RequestInterceptionManager(client)
    await interceptManager.intercept({
        urlPattern: 'https://wplace.live/_app/immutable/chunks/*',
        resourceType: "Script",
        requestStage: 'Response',
        modifyResponse({ body, event: { request } }) {
            if (!request.url.endsWith('.js')) {
                return { body }
            }
            if (body.includes('set_user_id')) {
                console.log(request.method, request.url)

                const regex = /function\s+(\w+)\s*\(.*?\){/
                const func = {}
                Array.from(body.matchAll(/function\s+.*?\}/g))
                    .map(match => match[0] ? match[0].trim() : [])
                    .forEach(fn => {
                        if (fn.includes('set_user_id')) {
                            func.set_user_id = fn.match(regex)[0]
                        } else if (fn.includes('request_url')) {
                            func.request_url = fn.match(regex)[1]
                        } else if (fn.includes('get_load_payload')) {
                            func.get_load_payload = fn.match(regex)[1]
                        } else if (fn.includes('get_pawtected_endpoint_payload')) {
                            func.get_pawtected_endpoint_payload = fn.match(regex)[1]
                        }
                    });
                body = body.replace(func.set_user_id, func.set_user_id + `window.paint=async()=>{${func.request_url}("${data.requestUrl.replace('s0/pixel', 'files/s0/tiles') + '.png'}");const o=JSON.stringify({coords:${JSON.stringify(data.coords)},colors:${JSON.stringify(data.colors)},fp:"${data.fp}"});return fetch("${data.requestUrl}",{method:"POST",body:o,headers:{"x-pawtect-token":${func.get_pawtected_endpoint_payload}(o),"x-pawtect-variant":"koala"},credentials:"include"}).then(r=>r.json())};`)
                return { body }
            }
        }
    })

    await page.setCacheEnabled(false)
    await page.setBypassServiceWorker(true)
    await page.setRequestInterception(true)
    page.on('domcontentloaded', async () => {
        await page.evaluate(() => {
            setInterval(() => {
                document.title = 'Do Not Close This Tab'
            }, 2_000)
        });
    })
    page.on('response', async (response) => {
        if (response.url().endsWith('pawtect/load') && response.status() === 204) {
            isReadyForPaint = true
        }
    })
    page.on('request', async (request) => {
        if (
            request.url().endsWith(".png") ||
            request.url().endsWith(".pbf") ||
            request.url().endsWith(".mp3") ||
            request.url().endsWith(".css") ||
            request.url().endsWith(".woff2")
        ) {
            request.abort()
        } else {
            request.continue()
        }
    })

    await page.goto("https://wplace.live", { waitUntil: 'domcontentloaded' });
    browser.on('targetchanged', async (target) => {
        if (target.type() === 'page' && target.url().includes('wplace.live')) {
            const newPage = await target.page()
            await newPage.setBypassServiceWorker(true)
            await newPage.setRequestInterception(true)
            newPage.on('request', (request) => {
                if (request.url().includes('/pixel/') && request.method() === 'GET') {
                    const regex = /pixel\/([0-9]+)\/([0-9]+)\?x/
                    const match = request.url().match(regex)
                    if (match) {
                        newPage.evaluate((match) => {
                            const [, x, y] = match
                            const top = document.querySelector('div.disable-pinch-zoom>div.gap-2')
                            top.innerHTML = `<button class="btn btn-primary btn-md mt-5">X:${x} Y: ${y}</button>`
                            setTimeout(() => {
                                top.innerHTML = ''
                            }, 10_000)
                        }, match)
                    }
                }
                request.continue()
            })
        }
    })
    return {
        paint: async ({ fp, coords, colors, requestUrl, cookie }) => {
            await browser.setCookie({
                name: 'j',
                value: cookie,
                domain: '.backend.wplace.live',
                path: '/',
                expires: Date.now() / 1000 + (60 * 60 * 24), // 24 hours
                httpOnly: true,
                secure: true,
            })
            data = { fp, coords, colors, requestUrl }
            await page.reload({ waitUntil: 'domcontentloaded' })
            while (!isReadyForPaint) {
                await new Promise(r => setTimeout(r, 200))
            }
            isReadyForPaint = false;
            return page.evaluate(async () => {
                const paint = /** @type {any} */ (window).paint;
                if (typeof paint !== 'function') {
                    await new Promise(resolve => {
                        const waitId = setInterval(() => {
                            if (typeof /** @type {any} */ (window).paint === 'function') {
                                resolve(void 0)
                                clearInterval(waitId)
                            }
                        }, 100)
                    })
                }
                return /** @type {any} */ (window).paint()
            })
        },
        openPage: async (url) => {
            const subPage = await browser.newPage()

            await subPage.goto(url, { waitUntil: 'domcontentloaded' })
            if (!fs.existsSync(DATA_STORE_FILE)) {
                return;
            }
            const data = fs.readFileSync(DATA_STORE_FILE, 'utf8');
            await subPage.evaluate((data) => {
                const db = JSON.parse(data)
                const keys = Object.keys(db)
                keys.forEach(key => {
                    localStorage.setItem(key, db[key])
                })
            }, data)
            await subPage.reload()
            await new Promise(r => setTimeout(r, 5_000))
            const waitId = setInterval(async () => {
                try {
                    const data = await subPage.evaluate(() => JSON.stringify(localStorage, null, 4))
                    fs.writeFileSync(DATA_STORE_FILE, data, 'utf8');
                } catch (error) {
                    clearInterval(waitId)
                }
            }, 5_000)
        }
    }
}

module.exports = {
    startBrowser
}
