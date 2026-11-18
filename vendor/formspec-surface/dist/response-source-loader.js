/** @filedesc Deliver catalog Response sources through a scoped batch selector. */
import { canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import { catalogResponseSelection } from './data-source-loader.js';
export function catalogResponseProjection(schema, cardinality) {
    const shape = schema;
    const properties = cardinality === 'latest-per-subject' ? shape?.items?.properties : shape?.properties;
    return properties && typeof properties === 'object' && !Array.isArray(properties)
        ? Object.keys(properties) : undefined;
}
/** Match the server's SHA-256 over integrity-canonical JSON for the entire catalog. */
export async function catalogResponseDigest(catalog) {
    return sha256Digest(canonicalJsonBytes(catalog));
}
async function sha256Digest(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return 'sha256:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function responseSourceLoader(selector) {
    const catalogDigests = new WeakMap();
    return async ({ descriptor, context, pin }) => {
        const { catalogRef, sourceRef, source, catalog } = descriptor;
        const identity = { catalogRef, sourceRef };
        const unavailable = { ...identity, status: 'unavailable', reason: 'Response selection unavailable' };
        if (!catalogResponseSelection(source))
            return unavailable;
        const key = sourceRef;
        try {
            // Catalogs can be edited in place. Reuse a digest only for the same canonical bytes.
            const bytes = canonicalJsonBytes(catalog);
            let cached = catalogDigests.get(catalog);
            if (cached?.bytes.length !== bytes.length || !cached.bytes.every((byte, index) => byte === bytes[index])) {
                const digest = sha256Digest(bytes).catch(error => {
                    if (catalogDigests.get(catalog)?.digest === digest)
                        catalogDigests.delete(catalog);
                    throw error;
                });
                cached = { bytes, digest };
                catalogDigests.set(catalog, cached);
            }
            const result = (await selector.select([{
                    key, kind: 'catalog', catalogRef, sourceRef, catalogDigest: await cached.digest,
                    routeParams: { ...context.params },
                    ...(context.subject && { consumerSubject: context.subject.keys }),
                    ...(pin && { pin }),
                }])).get(key);
            if (result?.status !== 'available')
                return unavailable;
            const { value, records, valueDigest, none, newer } = result;
            return { ...identity, status: 'loaded', freshness: 'fresh', value, records, valueDigest, none, newer };
        }
        catch {
            return unavailable;
        }
    };
}
