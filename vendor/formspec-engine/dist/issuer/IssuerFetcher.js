/** @filedesc Issuer document HTTP fetcher port and default fetch-backed adapter. */
export class FetchIssuerFetcher {
    constructor(options = {}) {
        const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
        if (typeof fetchImpl !== 'function') {
            throw new Error('FetchIssuerFetcher requires a fetch implementation');
        }
        this._fetch = fetchImpl;
    }
    async fetch(url, options = {}) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const init = requestInit(options, attempt > 0);
            const response = await this._fetch(url, init);
            if (response.status === 304) {
                return {
                    notModified: true,
                    etag: response.headers.get('etag') ?? options.ifNoneMatch,
                    cacheControl: response.headers.get('cache-control') ?? undefined,
                };
            }
            if (!response.ok) {
                throw new Error(`Issuer fetch ${url} returned ${response.status}`);
            }
            const rawBytes = new Uint8Array(await response.arrayBuffer());
            const issuer = JSON.parse(new TextDecoder().decode(rawBytes));
            try {
                await verifyContentHash(issuer, rawBytes);
            }
            catch (error) {
                if (attempt === 0 && error instanceof IssuerContentHashMismatchError) {
                    continue;
                }
                throw error;
            }
            return {
                issuer,
                rawBytes,
                etag: response.headers.get('etag') ?? undefined,
                cacheControl: response.headers.get('cache-control') ?? undefined,
            };
        }
        throw new Error(`Issuer fetch ${url} exhausted content-hash refetch`);
    }
}
function requestInit(options, forceReload) {
    if (forceReload) {
        return { cache: 'reload' };
    }
    const init = {};
    if (options.ifNoneMatch) {
        init.headers = { 'if-none-match': options.ifNoneMatch };
    }
    return init;
}
class IssuerContentHashMismatchError extends Error {
}
async function verifyContentHash(issuer, rawBytes) {
    const match = /\+sha256-([0-9a-f]{64})$/.exec(issuer.version);
    if (!match) {
        return;
    }
    const expected = match[1];
    const digestBytes = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
    const actualBuffer = await crypto.subtle.digest('SHA-256', digestBytes);
    const actual = Array.from(new Uint8Array(actualBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    if (actual !== expected) {
        throw new IssuerContentHashMismatchError(`Issuer ${issuer.url} content hash mismatch (expected ${expected}, got ${actual})`);
    }
}
