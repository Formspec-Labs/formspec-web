/** @filedesc Issuer fetch, cache, cascade, and parent-chain walk with cycle/depth guards. */
export const MAX_CHAIN_DEPTH = 8;
const DEFAULT_CACHE_MAX_AGE_MS = 3600000;
export class IssuerStore {
    constructor(_fetcher, options = {}) {
        this._fetcher = _fetcher;
        this._cache = new Map();
        this._now = options.now ?? Date.now;
        this._defaultMaxAgeMs = options.defaultMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
    }
    invalidate(url) {
        this._cache.delete(url);
    }
    async resolve(input) {
        if (input.hostOverride) {
            const primary = await this.materialize(input.hostOverride);
            return this.walkChain(primary, input.hostOverride.source ?? 'host-embed');
        }
        if (input.definitionIssuer) {
            const primary = await this.materialize(input.definitionIssuer);
            return this.walkChain(primary, 'definition');
        }
        return { primary: unbranded(), chain: [], source: 'unbranded' };
    }
    async materialize(source) {
        if (source.kind === 'inline') {
            this.storeFresh(source.issuer.url, {
                issuer: source.issuer,
                rawBytes: new Uint8Array(),
            });
            return source.issuer;
        }
        return this.fetchCached(source.url);
    }
    async fetchCached(url) {
        const cached = this._cache.get(url);
        if (cached && cached.expiresAt > this._now()) {
            return cached.issuer;
        }
        const result = await this._fetcher.fetch(url, cached?.etag ? { ifNoneMatch: cached.etag } : undefined);
        if (result.notModified === true) {
            if (!cached) {
                throw new Error(`Issuer fetch ${url} returned 304 without a cached issuer`);
            }
            const refreshed = this.refreshCacheEntry(cached, result);
            this.storeEntry(url, refreshed);
            this.storeEntry(refreshed.issuer.url, refreshed);
            return refreshed.issuer;
        }
        this.storeFresh(url, result);
        return result.issuer;
    }
    storeFresh(url, result) {
        const now = this._now();
        const expiresAt = cacheExpiry(result.cacheControl, now, this._defaultMaxAgeMs);
        if (expiresAt === null) {
            this.invalidate(url);
            this.invalidate(result.issuer.url);
            return;
        }
        const entry = {
            issuer: result.issuer,
            etag: result.etag,
            cacheControl: result.cacheControl,
            expiresAt,
        };
        this.storeEntry(url, entry);
        this.storeEntry(result.issuer.url, entry);
    }
    refreshCacheEntry(entry, result) {
        const now = this._now();
        const cacheControl = result.cacheControl ?? entry.cacheControl;
        const expiresAt = cacheExpiry(cacheControl, now, this._defaultMaxAgeMs);
        return {
            issuer: entry.issuer,
            etag: result.etag ?? entry.etag,
            cacheControl,
            expiresAt: expiresAt ?? now,
        };
    }
    storeEntry(url, entry) {
        this._cache.set(url, entry);
    }
    async walkChain(primary, source) {
        const chain = [primary];
        const seen = new Set([primary.url]);
        let cursor = primary;
        let degraded;
        while (cursor.parentOrganization) {
            const parentUrl = cursor.parentOrganization;
            if (chain.length >= MAX_CHAIN_DEPTH) {
                degraded = { reason: 'depth-capped', atUrl: parentUrl };
                break;
            }
            if (seen.has(parentUrl)) {
                degraded = { reason: 'cycle-detected', atUrl: parentUrl };
                break;
            }
            try {
                const parent = await this.fetchCached(parentUrl);
                chain.push(parent);
                seen.add(parentUrl);
                cursor = parent;
            }
            catch {
                degraded = { reason: 'parent-fetch-failed', atUrl: parentUrl };
                break;
            }
        }
        return { primary, chain, source, degraded };
    }
}
function cacheExpiry(cacheControl, now, defaultMaxAgeMs) {
    if (!cacheControl) {
        return now + defaultMaxAgeMs;
    }
    const directives = cacheControl
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    if (directives.includes('no-store')) {
        return null;
    }
    if (directives.includes('no-cache')) {
        return now;
    }
    const maxAge = directives
        .map((part) => /^max-age=(\d+)$/.exec(part))
        .find((match) => match !== null);
    if (maxAge) {
        return now + Number(maxAge[1]) * 1000;
    }
    return now + defaultMaxAgeMs;
}
function unbranded() {
    return {
        $formspecIssuer: '1.0',
        url: 'about:unbranded',
        version: '0.0.0',
        name: '',
        kind: 'organization',
    };
}
