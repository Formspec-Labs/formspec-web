/** @filedesc Definition/component path lookup helpers for the layout planner. */
import { Path } from '@formspec-org/types';
export function componentTreeOwnsPages(tree) {
    if (!tree) {
        return false;
    }
    if (tree.component === 'Section') {
        return true;
    }
    if (!Array.isArray(tree.children)) {
        return false;
    }
    return tree.children.some((child) => child?.component === 'Section');
}
export function findItemPathByKey(items, key, prefix = '') {
    if (key.includes('.')) {
        return findItemAtPath(items, key) ? key : null;
    }
    for (const item of items) {
        const itemKey = item?.key || item.name;
        if (!itemKey)
            continue;
        const fullPath = prefix ? `${prefix}.${itemKey}` : itemKey;
        if (itemKey === key) {
            return fullPath;
        }
        if (Array.isArray(item.children)) {
            const nested = findItemPathByKey(item.children, key, fullPath);
            if (nested)
                return nested;
        }
    }
    return null;
}
export function findItemAtPath(items, path) {
    const segments = Path.parse(path).splitNormalized();
    let current = items;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const found = current.find((item) => item?.key === segment || item.name === segment);
        if (!found)
            return null;
        if (index === segments.length - 1) {
            return found;
        }
        current = Array.isArray(found.children) ? found.children : [];
    }
    return null;
}
export function getParentPath(path) {
    return Path.parse(path).parentString();
}
export function findComponentNodeByPath(_items, rootNode, path) {
    return findNodeByBindPath(rootNode, path, '');
}
export function findNodeByBindPath(node, targetPath, currentPrefix) {
    const bindKey = node.bind;
    const fullPath = bindKey
        ? (currentPrefix ? `${currentPrefix}.${bindKey}` : bindKey)
        : currentPrefix;
    if (fullPath === targetPath && bindKey) {
        return node;
    }
    const children = node.children;
    if (Array.isArray(children)) {
        for (const child of children) {
            const found = findNodeByBindPath(child, targetPath, fullPath);
            if (found)
                return found;
        }
    }
    return null;
}
