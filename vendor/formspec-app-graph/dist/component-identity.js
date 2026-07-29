/** @filedesc Component graph identity helpers. */
function keyPart(value) {
    return typeof value === 'string' ? value : '';
}
export function componentNodeIdentityKey(identity) {
    return [
        keyPart(identity.component.handle),
        keyPart(identity.component.url),
        keyPart(identity.component.version),
        keyPart(identity.surface.url),
        keyPart(identity.surface.version),
        keyPart(identity.route),
        keyPart(identity.nodePath),
        keyPart(identity.id),
        keyPart(identity.nodeId),
    ].join('\u0000');
}
