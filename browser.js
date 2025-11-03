const { connect } = require("puppeteer-real-browser");
const { RequestInterceptionManager } = require('puppeteer-intercept-and-modify-requests')
const path = require('path');
const fs = require('fs');

const DATA_STORE_FILE = path.join(__dirname, 'db', 'browser-data.json');

async function init() {
    const userDataDir = path.join(__dirname, 'userdata');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir);
    }

    return connect({
        headless: false,
        turnstile: false,
        connectOption: {
            defaultViewport: null,
        },
        customConfig: {
            userDataDir,
            //chromePath: '/Applications/Chromium.app/Contents/MacOS/Chromium'
            //chromePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            //chromePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        },
        disableXvfb: false,
        args: [
            '--startBrowser-maximized',
            '--disable-breakpad',
        ]
    });
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
                await new Promise(resolve => {
                    const intervalId = setInterval(() => {
                        // @ts-ignore
                        if (typeof window.paint === 'function') {
                            resolve(void 0)
                            clearInterval(intervalId)
                        }
                    }, 100)
                })
                // @ts-ignore
                return window.paint()
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
            const intervalId = setInterval(async () => {
                try {
                    const data = await subPage.evaluate(() => JSON.stringify(localStorage, null, 4))
                    fs.writeFileSync(DATA_STORE_FILE, data, 'utf8');
                } catch (error) {
                    clearInterval(intervalId)
                }
            }, 5_000)
        }
    }
}

module.exports = {
    startBrowser
}