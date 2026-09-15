/** @filedesc Safe browser navigation and download adapter for structured app actions. */
const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
const MEDIA_TYPE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;
const DEFAULT_MAX_SERVICE_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function ownPath(root, path) {
    const parts = path.split('.');
    if (parts.length === 0 ||
        parts.some((part) => !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part))) {
        return undefined;
    }
    let current = root;
    for (const part of parts) {
        const object = record(current);
        if (!object || !Object.prototype.hasOwnProperty.call(object, part)) {
            return undefined;
        }
        current = object[part];
    }
    return current;
}
function safeOpenHref(value) {
    if (typeof value !== 'string' || value.length === 0)
        return undefined;
    if (value.startsWith('/') && !value.startsWith('//'))
        return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'mailto:'
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
function safeFilename(value) {
    if (typeof value !== 'string'
        || value.length === 0
        || value.length > MAX_FILENAME_LENGTH
        || value.trim() !== value
        || value.includes('/')
        || value.includes('\\')
        || /[\u0000-\u001f\u007f]/.test(value)
        || value === '.'
        || value === '..') {
        return undefined;
    }
    return value;
}
function safeServicePath(value) {
    if (typeof value !== 'string'
        || !value.startsWith('/')
        || value.startsWith('//')
        || value.includes('\\')) {
        return undefined;
    }
    try {
        const parsed = new URL(value, 'https://formspec.invalid');
        if (parsed.origin !== 'https://formspec.invalid'
            || parsed.username.length > 0
            || parsed.password.length > 0
            || parsed.hash.length > 0) {
            return undefined;
        }
        return `${parsed.pathname}${parsed.search}`;
    }
    catch {
        return undefined;
    }
}
function normalizedMediaType(value) {
    const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
    return mediaType && MEDIA_TYPE.test(mediaType) ? mediaType : undefined;
}
function dispositionFilename(value) {
    if (!value || !/^\s*attachment(?:\s*;|\s*$)/i.test(value))
        return undefined;
    const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value)?.[1];
    if (encoded) {
        try {
            const decoded = decodeURIComponent(encoded.trim());
            const admitted = safeFilename(decoded);
            if (admitted)
                return admitted;
        }
        catch {
            // Fall through to the ordinary filename and finally the authored fallback.
        }
    }
    const quoted = /(?:^|;)\s*filename\s*=\s*"([^"]*)"/i.exec(value)?.[1];
    if (quoted)
        return safeFilename(quoted);
    const token = /(?:^|;)\s*filename\s*=\s*([^;\s]+)/i.exec(value)?.[1];
    return token ? safeFilename(token) : undefined;
}
async function readBoundedContent(response, maximum) {
    if (!response.body) {
        const content = await response.arrayBuffer();
        if (content.byteLength > maximum) {
            throw new Error('The service download exceeded the host size limit.');
        }
        return content;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            total += next.value.byteLength;
            if (total > maximum) {
                await reader.cancel().catch(() => undefined);
                throw new Error('The service download exceeded the host size limit.');
            }
            chunks.push(next.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return combined.buffer;
}
export function resolveBrowserResourceCommand(candidateEffect, input) {
    const effect = record(candidateEffect);
    if (effect?.type !== 'browserResource' ||
        (effect.operation !== 'open' && effect.operation !== 'download') ||
        typeof effect.resourceRef !== 'string') {
        return { ok: false, reason: 'invalid browser resource effect' };
    }
    const resource = record(ownPath(input, effect.resourceRef));
    if (!resource) {
        return { ok: false, reason: 'browser resource input did not resolve' };
    }
    if (effect.operation === 'open') {
        const href = safeOpenHref(resource.href);
        if (!href) {
            return { ok: false, reason: 'browser resource destination is not allowed' };
        }
        return {
            ok: true,
            command: {
                operation: 'open',
                href,
                target: effect.target === 'new' ? 'new' : 'self',
            },
        };
    }
    if (!safeFilename(resource.filename) ||
        typeof resource.mediaType !== 'string' ||
        !MEDIA_TYPE.test(resource.mediaType)) {
        return { ok: false, reason: 'browser download resource is malformed' };
    }
    if (resource.kind === 'host-service-download') {
        const path = safeServicePath(resource.path);
        if (!path) {
            return { ok: false, reason: 'browser service download path is not allowed' };
        }
        return {
            ok: true,
            command: {
                operation: 'download',
                source: 'host-service',
                path,
                filename: resource.filename,
                mediaType: resource.mediaType.toLowerCase(),
            },
        };
    }
    if (typeof resource.content !== 'string') {
        return { ok: false, reason: 'browser download resource is malformed' };
    }
    return {
        ok: true,
        command: {
            operation: 'download',
            source: 'inline',
            filename: resource.filename,
            mediaType: resource.mediaType.toLowerCase(),
            content: resource.content,
        },
    };
}
export async function executeBrowserResourceEffect(effect, input, ports) {
    const resolution = resolveBrowserResourceCommand(effect, input);
    if (!resolution.ok) {
        return {
            type: 'browserResource',
            status: 'failed',
            reason: resolution.reason,
        };
    }
    try {
        if (resolution.command.operation === 'open') {
            ports.open(resolution.command.href, resolution.command.target);
        }
        else if (resolution.command.source === 'inline') {
            const { filename, mediaType, content } = resolution.command;
            ports.download({ filename, mediaType, content });
        }
        else {
            if (!ports.fetchServiceResource) {
                throw new Error('The host has no service download adapter.');
            }
            const maximum = ports.maxServiceDownloadBytes
                ?? DEFAULT_MAX_SERVICE_DOWNLOAD_BYTES;
            if (!Number.isSafeInteger(maximum) || maximum <= 0) {
                throw new Error('The host service download limit is invalid.');
            }
            const response = await ports.fetchServiceResource(resolution.command.path);
            if (!response.ok) {
                throw new Error(`The service download failed with HTTP ${response.status}.`);
            }
            const actualMediaType = normalizedMediaType(response.headers.get('content-type'));
            if (actualMediaType === 'application/problem+json') {
                throw new Error('The service returned a problem response instead of a download.');
            }
            if (actualMediaType !== resolution.command.mediaType.toLowerCase()) {
                throw new Error('The service download media type did not match the authored resource.');
            }
            const lengthHeader = response.headers.get('content-length');
            if (lengthHeader !== null) {
                const announcedLength = Number(lengthHeader);
                if (!Number.isSafeInteger(announcedLength) || announcedLength < 0) {
                    throw new Error('The service download length was invalid.');
                }
                if (announcedLength > maximum) {
                    throw new Error('The service download exceeded the host size limit.');
                }
            }
            const content = await readBoundedContent(response, maximum);
            const filename = dispositionFilename(response.headers.get('content-disposition')) ?? resolution.command.filename;
            ports.download({ filename, mediaType: actualMediaType, content });
        }
        return {
            type: 'browserResource',
            status: 'succeeded',
        };
    }
    catch (error) {
        return {
            type: 'browserResource',
            status: 'failed',
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}
