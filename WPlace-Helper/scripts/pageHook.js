
(function () {
	let ENABLED = true; 
	const targetOrigin = 'https://backend.wplace.live';
	const targetPathPrefix = '/s0/pixel/';

        function postToken(token, worldX, worldY, xpaw, fp) {
                try {
                        window.postMessage({ __wplace: true, type: 'token_found', token, xpaw, fp, worldX, worldY }, '*');
                } catch (e) {}
        }

	function isTarget(url) {
		return typeof url === 'string' && url.startsWith(targetOrigin) && url.includes(targetPathPrefix);
	}

	function extractWorldXY(url) {
		try {
			if (!isTarget(url)) return { x: null, y: null };
			const idx = url.indexOf(targetPathPrefix);
			if (idx === -1) return { x: null, y: null };
			const rest = url.slice(idx + targetPathPrefix.length);
			// Expect formats like "1188/767" possibly followed by query/hash
			const m = rest.match(/^(\d+)\/(\d+)/);
			if (!m) return { x: null, y: null };
			return { x: m[1], y: m[2] };
		} catch (_) {
			return { x: null, y: null };
		}
	}

	function decodeBodyToText(body) {
		if (!body) return Promise.resolve('');
		if (typeof body === 'string') return Promise.resolve(body);
		if (body instanceof Blob) return body.text();
		if (body instanceof URLSearchParams) return Promise.resolve(body.toString());
		try {
			if (body && typeof body === 'object') return Promise.resolve(JSON.stringify(body));
		} catch (e) {}
		return Promise.resolve('');
	}

        function extractBodyFields(text) {
                const out = { token: null, fp: null };
                if (!text) return out;
                try {
                        const obj = JSON.parse(text);
                        if (obj && typeof obj === 'object') {
                                if (obj.t) out.token = obj.t;
                                if (obj.fp) out.fp = obj.fp;
                        }
                } catch (_) {
                        try {
                                const params = new URLSearchParams(text);
                                out.token = params.get('t');
                                out.fp = params.get('fp');
                        } catch (_) {}
                }
                return out;
        }

        function extractHeader(headers, name) {
                if (!headers || !name) return null;
                const lowerName = name.toLowerCase();
                try {
                        if (headers instanceof Headers) {
                                return headers.get(name) || headers.get(lowerName);
                        }
                        if (Array.isArray(headers)) {
                                for (const h of headers) {
                                        if (Array.isArray(h) && h[0] && h[0].toLowerCase() === lowerName) return h[1];
                                }
                        } else if (typeof headers === 'object') {
                                for (const k in headers) {
                                        if (k && k.toLowerCase() === lowerName) return headers[k];
                                }
                        }
                } catch (_) {}
                return null;
        }

	try {
		window.addEventListener('message', function(ev) {
			const d = ev && ev.data;
			if (d && d.__wplace && d.type === 'toggle') {
				ENABLED = !!d.enabled;
			}
		});
	} catch (e) {}

        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
                const url = typeof input === 'string' ? input : (input && input.url);
                if (isTarget(url)) {
                        try {
                                if (ENABLED) {
                                        const body = init && init.body;
                                        const text = await decodeBodyToText(body);
                                        const { token, fp } = extractBodyFields(text);
                                        const headersSource = (init && init.headers) || (input && input.headers);
                                        const xpaw = extractHeader(headersSource, 'x-pawtect-token');
                                        const { x, y } = extractWorldXY(url);
                                        if (token) postToken(token, x, y, xpaw, fp);
                                }
                        } catch (e) {}
                        // Block the pixel POST after capturing token to avoid sending from page directly
                        if (ENABLED) {
                                return new Response(null, { status: 204, statusText: 'No Content' });
                        }
                }
                return originalFetch.apply(this, arguments);
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        let lastUrl = null;
        XMLHttpRequest.prototype.open = function(method, url) {
                lastUrl = url;
                this.__xpaw = null;
                return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                if (name && name.toLowerCase() === 'x-pawtect-token') {
                        try { this.__xpaw = value; } catch (_) {}
                }
                return originalSetRequestHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
                if (isTarget(lastUrl)) {
                        try {
                                if (ENABLED) {
                                        decodeBodyToText(body).then(text => {
                                                const { token, fp } = extractBodyFields(text);
                                                const { x, y } = extractWorldXY(lastUrl);
                                                const xpaw = this.__xpaw || null;
                                                if (token) postToken(token, x, y, xpaw, fp);
                                                this.__xpaw = null;
                                        });
                                }
                        } catch (e) {}
                }
                return originalSend.apply(this, arguments);
        };

	const originalSendBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
	if (originalSendBeacon) {
		navigator.sendBeacon = function(url, data) {
			if (isTarget(url)) {
				try {
                                if (ENABLED) {
                                        decodeBodyToText(data).then(text => {
                                                const { token, fp } = extractBodyFields(text);
                                                const { x, y } = extractWorldXY(url);
                                                if (token) postToken(token, x, y, null, fp);
                                        });
                                }
				} catch (e) {}
				if (ENABLED) {
					return false;
				}
			}
			return originalSendBeacon.apply(this, arguments);
		};
	}
})();


