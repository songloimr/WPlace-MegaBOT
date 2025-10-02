const { connect } = require("puppeteer-real-browser");
const { RequestInterceptionManager } = require('puppeteer-intercept-and-modify-requests')
const path = require('path');
const fs = require('fs');

const COOKIE_FILE = path.join(__dirname, 'db', 'browser-cookie.txt');
const DATA_STORE_FILE = path.join(__dirname, 'db', 'browser-data.json');

function readCookie() {
    return fs.readFileSync(COOKIE_FILE, 'utf8');
}

async function init() {
    const userDataDir = path.join(__dirname, 'userdata');
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true });
    }
    fs.mkdirSync(userDataDir);


    return connect({
        headless: false,
        turnstile: true,
        connectOption: {
            defaultViewport: null,
        },
        customConfig: {
            userDataDir,
            chromePath: '/Applications/Chromium.app/Contents/MacOS/Chromium'
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
    let captchaToken = null

    const { browser, page } = await init();
    const client = await page.createCDPSession()

    const interceptManager = new RequestInterceptionManager(client)
    await interceptManager.intercept({
        urlPattern: 'https://wplace.live/_app/immutable/*',
        resourceType: "Script",
        requestStage: 'Response',
        modifyResponse({ body, event: { request } }) {
            if (!request.url.endsWith('.js')) {
                return { body }
            }
            const captchaCallback = '.captcha={token:'
            if (body.includes(captchaCallback)) {
                console.log(request.method, request.url)

                const startBrowserIdx = body.indexOf(captchaCallback)
                const endIdx = body.indexOf(',', startBrowserIdx)
                const searchValue = body.slice(startBrowserIdx, endIdx)

                const [, tokenVar] = searchValue.split(':')
                body = body
                    .replace(searchValue, captchaCallback + `window.cf(${tokenVar})`)
            } else if (body.includes('set_user_id')) {
                console.log(request.method, request.url)

                const regex = /function\s+(\w+)\s*\(.*?\){/
                const func = {}
                body.matchAll(/function\s+.*?\}/g)
                    .map(match => match[0] ? match[0].trim() : [])
                    .forEach(fn => {
                        if (fn.includes('set_user_id')) {
                            func.set_user_id = fn.match(regex)[0]
                        } else if (fn.includes('request_url')) {
                            func.request_url = fn.match(regex)[1]
                        } else if (fn.includes('get_pawtected_endpoint_payload')) {
                            func.get_pawtected_endpoint_payload = fn.match(regex)[1]
                        }
                    });
                body = body.replace(func.set_user_id, func.set_user_id + `window.sign=(id,url,body)=>{m.set_user_id(id);${func.request_url}(url);return ${func.get_pawtected_endpoint_payload}(JSON.stringify(body))};`)
            }
            return { body }
        }
    })

    if (!fs.existsSync(COOKIE_FILE)) {
        const cookie = await page.evaluate(() => {
            return prompt('Please enter the cookie:')
        })
        fs.writeFileSync(COOKIE_FILE, cookie, 'utf8');
    }

    await page.evaluateOnNewDocument(() => {
        localStorage.removeItem('lp')
        //localStorage.setItem('location', JSON.stringify({ lng: 103.95030643628093, lat: 19.888507647599837, zoom: 14 }))
        localStorage.setItem('view-rules', true)
        localStorage.setItem('void-message-2', true)
        localStorage.setItem('showed:shop-profile-picture', true)
        localStorage.setItem('showed:region-leaderboard', true)
        localStorage.setItem('showed:info', true)
        localStorage.setItem('show-all-colors', false)
        localStorage.setItem('show-paint-more-than-one-pixel-msg', false)
        localStorage.setItem('selected-color', 5)
        localStorage.setItem('muted', 1)
        localStorage.setItem('PARAGLIDE_LOCALE', 'en')
    })

    await browser.setCookie({
        name: 'j',
        value: readCookie(),
        domain: '.backend.wplace.live',
        path: '/',
        expires: 1759960610,
        httpOnly: true,
        secure: true
    })
    page.setDefaultNavigationTimeout(60_000)

    await page.goto("https://wplace.live");
    await page.exposeFunction('cf', (token) => {
        return (captchaToken = token)
    })
    return {
        signBody: (user_id, url, body) => {
            return page.evaluate((user_id, url, body) => {
                return window.sign(user_id, url, body)
            }, user_id, url, body)
        },
        captchaToken: (reset = false) => {
            if (reset) {
                page.evaluate(() => window.cf(''))
            }
            return captchaToken
        },
        openPage: async (url) => {
            return browser.newPage().then(page => {
                page.on('domcontentloaded', async () => {
                    if (!fs.existsSync(DATA_STORE_FILE)) {
                        return;
                    }
                    const data = fs.readFileSync(DATA_STORE_FILE, 'utf8');
                    await page.evaluate((data) => {
                        const db = JSON.parse(data)
                        const keys = Object.keys(db)
                        keys.forEach(key => {
                            localStorage.setItem(key, db[key])
                        })
                    }, data)
                    await new Promise(r => setTimeout(r, 5_000))
                    const intervalId = setInterval(async () => {
                        try {
                            const data = await page.evaluate(() => JSON.stringify(localStorage, null, 4))
                            fs.writeFileSync(DATA_STORE_FILE, data, 'utf8');
                        } catch (error) {
                            clearInterval(intervalId)
                            console.log('clearInterval', intervalId)
                        }
                    }, 5_000)
                })
                page.goto(url)
            })
        }
    }
}

module.exports = {
    startBrowser
}