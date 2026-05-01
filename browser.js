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
        { flag: 'chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    ],
    win32: [
        { flag: 'chromium', path: 'C:\\Program Files\\Chromium\\Application\\chrome.exe' },
        { flag: 'chromium', path: 'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe' },
        { flag: 'chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
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

function patchFunction(code, keyword, replacer) {
    const fnPattern = /(async\s+)?(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;

    for (let match; (match = fnPattern.exec(code));) {
        let depth = 0, i = match.index + match[0].length - 1;

        // Tìm vị trí đóng ngoặc cuối
        while (i < code.length && (code[i] !== "}" || --depth)) {
            if (code[i++] === "{") depth++;
        }

        const bodyStart = match.index + match[0].length;
        const body = code.slice(bodyStart, i);

        if (!body.includes(keyword)) continue;

        const name = match[2];

        if (replacer === undefined) return name;

        const newBody = typeof replacer === "function" ? replacer(body, name) : replacer;
        const prefix = match[0].slice(0, -1);

        return `${code.slice(0, match.index)}${prefix}{${newBody}}${code.slice(i + 1)}`;
    }

    return code;
}

async function startBrowser() {
    let data = {
        fp: 'default-fp',
        requestUrl: 'default-request-url',
        userId: 0
    }

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
            if (body.includes('}init(){')) {
                console.log(request.method, request.url)

                body = body.replace(
                    `}init(){`,
                    `}init(){window.getHeaders=(payload)=>this.getHeaders(payload),window.isPawtectReady=()=>this.isPawtectReady(),`
                )

                body = patchFunction(body, 'set_automated_browser', (bodyFn, name) => {
                    return bodyFn.split('set_automated_browser')[0] + 'set_automated_browser(false)'
                })
                body = patchFunction(body, 'set_automated_clicks', (bodyFn, name) => {
                    return bodyFn.split('set_automated_clicks')[0] + 'set_automated_clicks(false)'
                })
                let set_user_id_func = ""
                body = patchFunction(body, 'set_user_id', (bodyFn, name) => {
                    set_user_id_func = name
                    return bodyFn.split('set_user_id')[0] + 'set_user_id(' + data.userId + ')'
                })
                body = patchFunction(body, 'isLinearMovement&&', (body, name) => {
                    const arr = [
                        'AQADACMINQEFAPIC1gYFAAAAIpkAJwAzG4oICABNBegD1l4AAAEC5g==',
                        'AQADAD0GXgIQANACywYFAAAAB4cARQBhLXgHaAAvBegD1l4AAAEC5g==',
                        'AQADAEcFSgEDALoC1wYFAAAAEW0AOQBAH0AEuAGzBegD1l4AAAEDdA==',
                        'AQAHACUXOwEHAN4C3QYFAAAAHeUAKAA6KNwJ7wA2BegD1l4AAAEAlQ==',
                        'AQAEADkOSQEFAL4CyQYFAAAAPgYAPwBVJ9gJoAB0BegD1l4AAAEAlQ==',
                        'AQADAD8JYAIEAPUC3QYFABdNPD8AOwBZMkYH4QBfBegD1l4AAAEAlQ==',
                        'AQADADwGUgEEAL8CxwYFAAAAC2QAOABHJKQG1wBsBegD1l4AAAEDBw=='
                    ]
                    const random = arr[Math.floor(Math.random() * arr.length)]

                    return `return "${random}"`
                })
                body = patchFunction(body, ".visitorId)", (bodyFn, name) => {
                    return `return "${data.fp}"`
                })

                body = patchFunction(body, "navigator.webdriver,", (bodyFn, name) => {
                    const [prefix, suffix] = bodyFn.split(set_user_id_func)
                    const [, ...suffixArgs] = suffix.split(',')
                    return prefix + set_user_id_func + '(0),' + suffixArgs.join(',')
                })

                body = patchFunction(body, 'request_url', (bodyFn, name) => {
                    return `if(typeof(window.request_url)=='undefined'){window.request_url=(url)=>${name}(url)};` + bodyFn + `;console.log('request_url',n)`
                })

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
        getHeaders: async ({ userId, fp, requestUrl, body }) => {
            const bodyPayload = JSON.parse(body)

            data = { fp, requestUrl, userId }
            await page.reload({ waitUntil: 'domcontentloaded' })
            console.log('domcontentloaded')
            return await page.evaluate(async ({ userId, requestUrl, bodyPayload }) => {
                try {
                    while (typeof(window.isPawtectReady) == 'undefined' || typeof(window.request_url) == 'undefined') {
                        console.log("wait for init")
                        await new Promise(r => setTimeout(r, 200))
                    }
                    while (await window.isPawtectReady() == false) {
                        console.log("wait for ready")
                        await new Promise(r => setTimeout(r, 200))
                    }
                    await window.request_url(requestUrl)
                } catch (error) {
                    console.error('set request_url failed', error)
                    throw error
                }
                /** @type {any} */
                const headers = await window.getHeaders(JSON.stringify(bodyPayload))

                headers['user-agent'] = navigator.userAgent
                return headers
            }, { userId, requestUrl, bodyPayload })
        },
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
