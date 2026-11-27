/** @filedesc Runtime mapping document execution with WASM core and TS adapter formatting. */
import { isJsonRecord, isRawJson, jsonNumberText, jsonValueText, } from '../json-values.js';
import { isWasmReady, wasmExecuteMappingDocRuntime } from '../wasm-bridge-runtime.js';
import { isWasmToolsReady, wasmExecuteMappingDoc } from '../wasm-bridge-tools.js';
function isScalarMappingValue(v) {
    return v === null || v === undefined || typeof v !== 'object' || isRawJson(v);
}
function mappingSerializeCSV(output, config) {
    const delim = config.delimiter ?? ',';
    const quote = config.quote ?? '"';
    const includeHeader = config.header !== false;
    const le = config.lineEnding === 'lf' ? '\n' : '\r\n';
    const keys = Object.keys(output).filter(k => isScalarMappingValue(output[k]));
    if (keys.length === 0)
        return '';
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = (val) => {
        const str = jsonValueText(val);
        if (str.includes(delim) || str.includes(quote) || str.includes('\n') || str.includes('\r')) {
            return quote + str.replace(new RegExp(esc(quote), 'g'), quote + quote) + quote;
        }
        return str;
    };
    const rows = [];
    if (includeHeader)
        rows.push(keys.map(k => q(k)).join(delim));
    rows.push(keys.map(k => q(output[k])).join(delim));
    return rows.join(le);
}
function mappingBuildXMLTree(obj) {
    const node = { attributes: {}, children: [] };
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('@')) {
            node.attributes[key.slice(1)] = jsonValueText(value);
        }
        else if (Array.isArray(value)) {
            for (const item of value) {
                if (isJsonRecord(item)) {
                    node.children.push({ name: key, node: mappingBuildXMLTree(item) });
                }
                else {
                    node.children.push({
                        name: key,
                        node: { attributes: {}, children: [], text: jsonValueText(item) },
                    });
                }
            }
        }
        else if (isJsonRecord(value)) {
            node.children.push({ name: key, node: mappingBuildXMLTree(value) });
        }
        else {
            node.children.push({
                name: key,
                node: { attributes: {}, children: [], text: jsonValueText(value) },
            });
        }
    }
    return node;
}
function mappingEscapeXML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function mappingRenderElement(name, node, depth, indentSize, cdataPaths, elementPath, lines) {
    const indent = indentSize > 0 ? ' '.repeat(depth * indentSize) : '';
    const childIndent = indentSize > 0 ? ' '.repeat((depth + 1) * indentSize) : '';
    let attrStr = '';
    for (const [an, av] of Object.entries(node.attributes))
        attrStr += ` ${an}="${mappingEscapeXML(av)}"`;
    const hasChildren = node.children.length > 0;
    const hasText = node.text !== undefined;
    if (!hasChildren && !hasText) {
        lines.push(`${indent}<${name}${attrStr}/>`);
        return;
    }
    if (hasText && !hasChildren) {
        const tc = cdataPaths.has(elementPath) ? `<![CDATA[${node.text}]]>` : mappingEscapeXML(node.text);
        lines.push(`${indent}<${name}${attrStr}>${tc}</${name}>`);
        return;
    }
    lines.push(`${indent}<${name}${attrStr}>`);
    if (hasText) {
        const tc = cdataPaths.has(elementPath) ? `<![CDATA[${node.text}]]>` : mappingEscapeXML(node.text);
        lines.push(`${childIndent}${tc}`);
    }
    for (const { name: cn, node: cnode } of node.children) {
        mappingRenderElement(cn, cnode, depth + 1, indentSize, cdataPaths, elementPath ? `${elementPath}.${cn}` : cn, lines);
    }
    lines.push(`${indent}</${name}>`);
}
function mappingSerializeXML(output, config) {
    const root = config.rootElement ?? 'root';
    const decl = config.declaration !== false;
    const indentSize = config.indent ?? 2;
    const cdataPaths = new Set(config.cdata ?? []);
    const tree = mappingBuildXMLTree(output);
    const lines = [];
    if (decl)
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    mappingRenderElement(root, tree, 0, indentSize, cdataPaths, '', lines);
    return lines.join(indentSize > 0 ? '\n' : '');
}
function mappingOmitNulls(obj) {
    if (obj == null || typeof obj !== 'object' || isRawJson(obj))
        return;
    if (Array.isArray(obj)) {
        for (const item of obj)
            mappingOmitNulls(item);
        return;
    }
    for (const key of Object.keys(obj)) {
        if (obj[key] === null || obj[key] === undefined)
            delete obj[key];
        else if (typeof obj[key] === 'object' && !isRawJson(obj[key]))
            mappingOmitNulls(obj[key]);
    }
}
function mappingSortKeysDeep(obj) {
    if (obj == null || typeof obj !== 'object' || isRawJson(obj))
        return;
    if (Array.isArray(obj)) {
        for (const item of obj)
            mappingSortKeysDeep(item);
        return;
    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map(k => [k, obj[k]]);
    for (const key of Object.keys(obj))
        delete obj[key];
    for (const [key, value] of entries) {
        obj[key] = value;
        if (typeof value === 'object' && !isRawJson(value))
            mappingSortKeysDeep(value);
    }
}
function hasExactNumericLeaf(value) {
    if (value == null || typeof value !== 'object')
        return false;
    if (isRawJson(value))
        return jsonNumberText(value) !== undefined;
    if (Array.isArray(value))
        return value.some(hasExactNumericLeaf);
    return Object.values(value).some(hasExactNumericLeaf);
}
function chooseSentinelPrefix(doc, source) {
    const corpus = `${JSON.stringify(doc)}\n${JSON.stringify(source)}`;
    let attempt = 0;
    while (true) {
        const candidate = attempt === 0 ? '__fs_exact_num_sentinel_' : `__fs_exact_num_sentinel_${attempt}_`;
        if (!corpus.includes(candidate))
            return candidate;
        attempt += 1;
    }
}
function replaceExactNumericLeaves(value, exactLeaves, prefix) {
    if (value == null || typeof value !== 'object')
        return value;
    if (isRawJson(value) && jsonNumberText(value) !== undefined) {
        const index = exactLeaves.length;
        exactLeaves.push(value);
        return `${prefix}${index}__`;
    }
    if (Array.isArray(value)) {
        return value.map(item => replaceExactNumericLeaves(item, exactLeaves, prefix));
    }
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
        copy[k] = replaceExactNumericLeaves(v, exactLeaves, prefix);
    }
    return copy;
}
function numericLeafMatchesExact(actual, exactLeaf) {
    const actualText = jsonNumberText(actual);
    if (actualText === undefined)
        return false;
    return actualText === exactLeaf.rawJSON || Number(actualText) === Number(exactLeaf.rawJSON);
}
function mergeExactNumericLeaves(actual, probe, exactLeaves, prefix) {
    if (typeof probe === 'string' && probe.startsWith(prefix) && probe.endsWith('__')) {
        const idx = Number(probe.slice(prefix.length, -2));
        const exactLeaf = Number.isInteger(idx) ? exactLeaves[idx] : undefined;
        if (exactLeaf && numericLeafMatchesExact(actual, exactLeaf)) {
            return exactLeaf;
        }
        return actual;
    }
    if (Array.isArray(actual) && Array.isArray(probe) && actual.length === probe.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = mergeExactNumericLeaves(actual[i], probe[i], exactLeaves, prefix);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(probe)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(probe, key)) {
                actual[key] = mergeExactNumericLeaves(actual[key], probe[key], exactLeaves, prefix);
            }
        }
    }
    return actual;
}
function lookupSourcePath(source, path) {
    const normalized = path.endsWith('[*]') ? path.slice(0, -3) : path;
    const tokens = normalized.match(/[^.[\]]+|\[\d+\]/g);
    if (!tokens)
        return undefined;
    let current = source;
    for (const token of tokens) {
        if (current == null || typeof current !== 'object' || isRawJson(current))
            return undefined;
        if (token.startsWith('[') && token.endsWith(']')) {
            const idx = Number(token.slice(1, -1));
            if (!Array.isArray(current) || idx < 0 || idx >= current.length)
                return undefined;
            current = current[idx];
        }
        else {
            if (Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, token))
                return undefined;
            current = current[token];
        }
    }
    return current;
}
function mergeMatchingExactValues(actual, exactSource, mask) {
    if (mask === true)
        return actual;
    if (isRawJson(exactSource) && jsonNumberText(exactSource) !== undefined) {
        return numericLeafMatchesExact(actual, exactSource) ? exactSource : actual;
    }
    if (Array.isArray(actual) && Array.isArray(exactSource) && actual.length === exactSource.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = mergeMatchingExactValues(actual[i], exactSource[i], Array.isArray(mask) ? mask[i] : undefined);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(exactSource)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(exactSource, key)) {
                actual[key] = mergeMatchingExactValues(actual[key], exactSource[key], isJsonRecord(mask) ? mask[key] : undefined);
            }
        }
    }
    return actual;
}
function recordOverwritePositions(probe, sentinel, mask) {
    if (probe === sentinel)
        return true;
    if (mask === true)
        return true;
    if (Array.isArray(probe)) {
        const nextMask = Array.isArray(mask) ? mask : [];
        for (let i = 0; i < probe.length; i += 1) {
            const child = recordOverwritePositions(probe[i], sentinel, nextMask[i]);
            if (child !== undefined)
                nextMask[i] = child;
        }
        return nextMask.length > 0 ? nextMask : undefined;
    }
    if (isJsonRecord(probe)) {
        const nextMask = isJsonRecord(mask) ? mask : {};
        let touched = Object.keys(nextMask).length > 0;
        for (const key of Object.keys(probe)) {
            const child = recordOverwritePositions(probe[key], sentinel, nextMask[key]);
            if (child !== undefined) {
                nextMask[key] = child;
                touched = true;
            }
        }
        return touched ? nextMask : undefined;
    }
    return mask;
}
function applyMaskedProbe(actual, probe, sentinel, mask, onMatch) {
    if (mask === true)
        return actual;
    if (probe === sentinel) {
        return onMatch(actual, mask);
    }
    if (Array.isArray(actual) && Array.isArray(probe) && actual.length === probe.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = applyMaskedProbe(actual[i], probe[i], sentinel, Array.isArray(mask) ? mask[i] : undefined, onMatch);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(probe)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(probe, key)) {
                actual[key] = applyMaskedProbe(actual[key], probe[key], sentinel, isJsonRecord(mask) ? mask[key] : undefined, onMatch);
            }
        }
    }
    return actual;
}
function rulesHaveAnyCondition(rules) {
    return rules.some(rule => {
        if (!rule)
            return false;
        if (rule.condition)
            return true;
        const inner = rule.array?.innerRules;
        return Array.isArray(inner) && rulesHaveAnyCondition(inner);
    });
}
function activeRuleTransform(rule, direction) {
    return direction === 'reverse' && rule.reverse?.transform ? rule.reverse.transform : rule.transform;
}
function buildEffectiveRules(doc, source, direction) {
    const baseRules = Array.isArray(doc.rules) ? [...doc.rules] : [];
    if (doc.autoMap && direction === 'forward' && isJsonRecord(source)) {
        const covered = new Set();
        for (const rule of baseRules) {
            if (typeof rule?.sourcePath === 'string') {
                covered.add(rule.sourcePath);
                const top = rule.sourcePath.split('.')[0];
                if (top)
                    covered.add(top);
            }
        }
        for (const key of Object.keys(source)) {
            if (!covered.has(key)) {
                baseRules.push({
                    sourcePath: key,
                    targetPath: key,
                    transform: 'preserve',
                    priority: -1,
                    bidirectional: true,
                });
            }
        }
    }
    return baseRules;
}
function sortRulesInExecutionOrder(rules, direction) {
    return rules
        .filter(rule => !(direction === 'reverse' && rule?.bidirectional === false))
        .map((rule, index) => ({ rule, index }))
        .sort((a, b) => {
        const pa = direction === 'reverse'
            ? (a.rule?.reversePriority ?? a.rule?.priority ?? 0)
            : (a.rule?.priority ?? 0);
        const pb = direction === 'reverse'
            ? (b.rule?.reversePriority ?? b.rule?.priority ?? 0)
            : (b.rule?.priority ?? 0);
        return pb - pa || a.index - b.index;
    })
        .map(entry => entry.rule);
}
function patchRuleToConstant(rule, direction, sentinel) {
    const constantPatch = { transform: 'constant', expression: JSON.stringify(sentinel), array: undefined };
    if (direction === 'reverse' && rule.reverse) {
        return { ...rule, array: undefined, reverse: { ...rule.reverse, ...constantPatch } };
    }
    return { ...rule, ...constantPatch };
}
function ruleSkipsAbsentSource(rule, source, direction) {
    const hasInner = Array.isArray(rule?.array?.innerRules) && rule.array.innerRules.length > 0;
    if (hasInner)
        return false;
    const transform = activeRuleTransform(rule, direction);
    if (transform !== 'preserve' && transform !== 'coerce' && transform !== 'valueMap')
        return false;
    const srcPath = direction === 'forward' ? rule.sourcePath : rule.targetPath;
    if (typeof srcPath !== 'string' || !srcPath)
        return rule.default === undefined;
    return lookupSourcePath(source, srcPath) === undefined && rule.default === undefined;
}
function collectLaterOverwrites(orderedRules, afterIndex, docBase, source, direction, prefix) {
    let mask = undefined;
    for (let j = afterIndex + 1; j < orderedRules.length; j += 1) {
        const laterRule = orderedRules[j];
        if (!laterRule)
            continue;
        const transform = activeRuleTransform(laterRule, direction);
        if (transform === 'drop')
            continue;
        if (ruleSkipsAbsentSource(laterRule, source, direction))
            continue;
        const tgtPath = direction === 'forward' ? laterRule.targetPath : laterRule.sourcePath;
        if (typeof tgtPath !== 'string' || !tgtPath)
            continue;
        // For valueMap with drop/error unmapped strategies, check whether the rule actually emits a value
        // on real @source/@target before marking its target as overwritten.
        if (transform === 'valueMap') {
            const vmCheckKey = `${prefix}vmcheck_${j}__`;
            const vmProbeRule = direction === 'forward'
                ? { ...laterRule, targetPath: vmCheckKey }
                : { ...laterRule, sourcePath: vmCheckKey };
            try {
                const vmProbe = wasmExecuteMappingDocRuntime({ ...docBase, autoMap: false, defaults: undefined, rules: [...orderedRules.slice(0, j), vmProbeRule] }, source, direction);
                if (!isJsonRecord(vmProbe.output) || !Object.prototype.hasOwnProperty.call(vmProbe.output, vmCheckKey)) {
                    continue;
                }
            }
            catch {
                continue;
            }
        }
        const overwriteSentinel = `${prefix}over_${afterIndex}_${j}__`;
        const probeRules = [
            ...orderedRules.slice(0, j),
            patchRuleToConstant(laterRule, direction, overwriteSentinel),
        ];
        try {
            const overwriteProbe = wasmExecuteMappingDocRuntime({ ...docBase, autoMap: false, defaults: undefined, rules: probeRules }, source, direction);
            mask = recordOverwritePositions(overwriteProbe.output, overwriteSentinel, mask);
        }
        catch {
            // Keep conservative mask if probing fails.
        }
    }
    return mask;
}
function applyIndexedExactRestoration(actualObj, innerRules, sourceArray) {
    if (!isJsonRecord(actualObj))
        return actualObj;
    for (const inner of innerRules) {
        const sp = inner?.sourcePath;
        const tp = inner?.targetPath;
        if (typeof sp !== 'string' || typeof tp !== 'string' || !tp)
            continue;
        const dotIdx = sp.indexOf('.');
        const idxStr = dotIdx === -1 ? sp : sp.slice(0, dotIdx);
        const idx = Number(idxStr);
        if (!Number.isInteger(idx) || idx < 0 || idx >= sourceArray.length)
            continue;
        const elem = sourceArray[idx];
        const exactVal = dotIdx === -1 ? elem : lookupSourcePath(elem, sp.slice(dotIdx + 1));
        if (!hasExactNumericLeaf(exactVal))
            continue;
        const targetTokens = tp.split('.');
        let cursor = actualObj;
        for (let k = 0; k < targetTokens.length - 1; k += 1) {
            if (!isJsonRecord(cursor)) {
                cursor = undefined;
                break;
            }
            cursor = cursor[targetTokens[k]];
        }
        const leafKey = targetTokens[targetTokens.length - 1];
        if (isJsonRecord(cursor) && Object.prototype.hasOwnProperty.call(cursor, leafKey)) {
            cursor[leafKey] = mergeMatchingExactValues(cursor[leafKey], exactVal, undefined);
        }
    }
    return actualObj;
}
function restoreConditionalDocumentExactNumbers(docWithoutSchema, source, direction, output, prefix) {
    const effectiveRules = buildEffectiveRules(docWithoutSchema, source, direction);
    const orderedRules = sortRulesInExecutionOrder(effectiveRules, direction);
    for (let pos = 0; pos < orderedRules.length; pos += 1) {
        const rule = orderedRules[pos];
        if (!rule)
            continue;
        const srcPath = direction === 'forward' ? rule.sourcePath : rule.targetPath;
        const hasSrcPath = typeof srcPath === 'string' && srcPath.length > 0;
        const resolved = hasSrcPath ? lookupSourcePath(source, srcPath) : undefined;
        const effectiveSource = resolved !== undefined && resolved !== null ? resolved : rule.default;
        const innerRules = Array.isArray(rule.array?.innerRules) ? rule.array.innerRules : [];
        const arrayMode = innerRules.length > 0 ? rule.array?.mode : undefined;
        const transform = activeRuleTransform(rule, direction);
        if (arrayMode === 'each' || arrayMode === 'indexed') {
            if (!Array.isArray(effectiveSource) || !hasExactNumericLeaf(effectiveSource))
                continue;
            const ruleSentinel = `${prefix}arr_${pos}__`;
            try {
                const firedProbe = wasmExecuteMappingDocRuntime({
                    ...docWithoutSchema,
                    autoMap: false,
                    defaults: undefined,
                    rules: [...orderedRules.slice(0, pos), patchRuleToConstant(rule, direction, ruleSentinel)],
                }, source, direction);
                const overwriteMask = collectLaterOverwrites(orderedRules, pos, docWithoutSchema, source, direction, prefix);
                output = applyMaskedProbe(output, firedProbe.output, ruleSentinel, overwriteMask, (actualNode, maskNode) => {
                    if (arrayMode === 'each') {
                        if (!Array.isArray(actualNode) || actualNode.length !== effectiveSource.length)
                            return actualNode;
                        for (let r = 0; r < actualNode.length; r += 1) {
                            if (Array.isArray(maskNode) && maskNode[r] === true)
                                continue;
                            actualNode[r] = restoreExactPreservedNumbers({ rules: innerRules }, effectiveSource[r], direction, actualNode[r]);
                        }
                        return actualNode;
                    }
                    return applyIndexedExactRestoration(actualNode, innerRules, effectiveSource);
                });
            }
            catch {
                // Keep authoritative Pass 1 output if probing fails.
            }
            continue;
        }
        if (transform !== 'preserve' && !(transform === 'valueMap' && rule.valueMap?.unmapped === 'passthrough')) {
            continue;
        }
        if (resolved === undefined && rule.default === undefined)
            continue;
        if (!hasExactNumericLeaf(effectiveSource))
            continue;
        const ruleSentinel = `${prefix}rule_${pos}__`;
        try {
            const firedProbe = wasmExecuteMappingDocRuntime({
                ...docWithoutSchema,
                autoMap: false,
                defaults: undefined,
                rules: [...orderedRules.slice(0, pos), patchRuleToConstant(rule, direction, ruleSentinel)],
            }, source, direction);
            const overwriteMask = collectLaterOverwrites(orderedRules, pos, docWithoutSchema, source, direction, prefix);
            output = applyMaskedProbe(output, firedProbe.output, ruleSentinel, overwriteMask, (actualNode, maskNode) => mergeMatchingExactValues(actualNode, effectiveSource, maskNode));
        }
        catch {
            // Keep authoritative Pass 1 output if probing fails.
        }
    }
    // Forward defaults fill paths still null/absent after all rules execute.
    const defaults = docWithoutSchema.defaults;
    if (direction === 'forward' && isJsonRecord(defaults) && hasExactNumericLeaf(defaults)) {
        try {
            const withoutDefaults = wasmExecuteMappingDocRuntime({ ...docWithoutSchema, autoMap: false, defaults: undefined, rules: orderedRules }, source, direction);
            for (const [key, defaultVal] of Object.entries(defaults)) {
                if (!hasExactNumericLeaf(defaultVal))
                    continue;
                const prior = lookupSourcePath(withoutDefaults.output, key);
                if (prior !== undefined && prior !== null)
                    continue;
                const tokens = key.split('.');
                let cursor = output;
                for (let k = 0; k < tokens.length - 1; k += 1) {
                    if (!isJsonRecord(cursor)) {
                        cursor = undefined;
                        break;
                    }
                    cursor = cursor[tokens[k]];
                }
                const leafKey = tokens[tokens.length - 1];
                if (isJsonRecord(cursor) && Object.prototype.hasOwnProperty.call(cursor, leafKey)) {
                    cursor[leafKey] = mergeMatchingExactValues(cursor[leafKey], defaultVal, undefined);
                }
            }
        }
        catch {
            // Leave Pass 1 defaults intact if probing fails.
        }
    }
    return output;
}
/**
 * Restore exact lexical numeric leaves (`JSON.rawJSON`) for preserved outputs when the
 * WASM `serde_json::Value` layer (or tools `JSON.parse`) rounded high-precision decimals,
 * lexical trailing zeros, or arbitrary-precision integers.
 */
function restoreExactPreservedNumbers(doc, source, direction, output) {
    if (!isWasmReady())
        return output;
    if (!hasExactNumericLeaf(source) && !hasExactNumericLeaf(doc))
        return output;
    const prefix = chooseSentinelPrefix(doc, source);
    const { sourceSchema: _ignoredSchema, ...docWithoutSchema } = doc;
    const rules = Array.isArray(docWithoutSchema.rules) ? docWithoutSchema.rules : [];
    // When any rule (top-level or nested inside array.innerRules) declares a FEL condition,
    // never sentinelize `source` (doing so would alter `@source.*` / `@target.*` conditions and
    // let an earlier preserve rule clobber a conditional overwrite). Probe each candidate rule
    // against unmodified numeric `source` with exact execution-order overwrite tracking.
    if (rulesHaveAnyCondition(rules)) {
        return restoreConditionalDocumentExactNumbers(docWithoutSchema, source, direction, output, prefix);
    }
    // Fast path for unconditional documents: a single sentinel provenance pass handles preserve,
    // autoMap, array.each/indexed, flatten, nest, defaults, and reverse in one WASM call.
    const exactLeaves = [];
    const sentinelDoc = replaceExactNumericLeaves(docWithoutSchema, exactLeaves, prefix);
    const sentinelSource = replaceExactNumericLeaves(source, exactLeaves, prefix);
    if (exactLeaves.length === 0)
        return output;
    try {
        const probe = wasmExecuteMappingDocRuntime(sentinelDoc, sentinelSource, direction);
        output = mergeExactNumericLeaves(output, probe.output, exactLeaves, prefix);
    }
    catch {
        // Keep authoritative Pass 1 output if provenance probing hits an unsupported shape.
    }
    return output;
}
export class RuntimeMappingEngine {
    constructor(mappingDocument) {
        this.doc = mappingDocument;
    }
    forward(source) {
        return this.execute('forward', this.doc.sourceSchema ? source : source ?? {});
    }
    reverse(source) {
        return this.execute('reverse', this.doc.sourceSchema ? source : source ?? {});
    }
    execute(direction, source) {
        const needsToolsValidation = Boolean(this.doc.sourceSchema);
        if (needsToolsValidation) {
            if (!isWasmToolsReady()) {
                return {
                    direction,
                    output: {},
                    appliedRules: 0,
                    diagnostics: [{
                            ruleIndex: -1,
                            errorCode: 'WASM_NOT_READY',
                            message: 'MappingDocument with sourceSchema requires tools WASM for JSON Schema validation. Call await initFormspecEngineTools() after await initFormspecEngine().',
                        }],
                };
            }
        }
        else if (!isWasmReady()) {
            return {
                direction,
                output: {},
                appliedRules: 0,
                diagnostics: [{
                        ruleIndex: -1,
                        errorCode: 'WASM_NOT_READY',
                        message: 'RuntimeMappingEngine requires runtime WASM. Call await initFormspecEngine().',
                    }],
            };
        }
        // Delegate to WASM for core rule evaluation (runtime WASM for standard Mappings; tools WASM when sourceSchema needs lint validation).
        let wasmResult;
        try {
            wasmResult = needsToolsValidation
                ? wasmExecuteMappingDoc(this.doc, source, direction)
                : wasmExecuteMappingDocRuntime(this.doc, source, direction);
        }
        catch (e) {
            // WASM parser errors (e.g. unknown transform) become diagnostics
            return {
                direction,
                output: {},
                appliedRules: 0,
                diagnostics: [{
                        ruleIndex: -1,
                        errorCode: 'COERCE_FAILURE',
                        message: String(e).replace(/^Error:\s*/, ''),
                    }],
            };
        }
        let output = wasmResult.output;
        const diagnostics = wasmResult.diagnostics.map((d) => ({
            ruleIndex: d.ruleIndex,
            sourcePath: d.sourcePath ?? undefined,
            targetPath: d.targetPath ?? undefined,
            errorCode: d.errorCode ?? 'COERCE_FAILURE',
            message: d.message,
        }));
        const appliedRules = wasmResult.rulesApplied;
        // If direction was blocked, return early (WASM already set INVALID_DOCUMENT diagnostic)
        if (diagnostics.some(d => d.errorCode === 'INVALID_DOCUMENT')) {
            return { direction, output, appliedRules, diagnostics };
        }
        output = restoreExactPreservedNumbers(this.doc, source, direction, output);
        // External reverse output is the schema-validated JSON source.
        if (direction === 'reverse' && this.doc.sourceSchema) {
            return { direction, output, appliedRules, diagnostics };
        }
        // ── Adapter post-processing (TS-only — formatting, not evaluation) ──
        const jsonAdapter = this.doc.adapters?.json;
        if (jsonAdapter) {
            if (jsonAdapter.nullHandling === 'omit')
                mappingOmitNulls(output);
            if (jsonAdapter.sortKeys)
                mappingSortKeysDeep(output);
        }
        const csvAdapter = this.doc.adapters?.csv;
        const isCsv = csvAdapter || this.doc.targetSchema?.format === 'csv';
        if (isCsv) {
            const rules = [...this.doc.rules];
            let hasAdapterError = false;
            for (const rule of rules) {
                const tp = direction === 'forward' ? rule.targetPath : (rule.sourcePath ?? rule.targetPath);
                if (tp && /[.\[\]]/.test(tp)) {
                    diagnostics.push({
                        ruleIndex: rules.indexOf(rule),
                        sourcePath: rule.sourcePath ?? undefined,
                        targetPath: rule.targetPath ?? undefined,
                        errorCode: 'ADAPTER_FAILURE',
                        message: `targetPath "${tp}" is not a simple identifier (CSV requires flat keys)`,
                    });
                    hasAdapterError = true;
                }
            }
            if (hasAdapterError) {
                return { direction, output: '', appliedRules, diagnostics };
            }
            return { direction, output: mappingSerializeCSV(output, csvAdapter ?? {}), appliedRules, diagnostics };
        }
        const xmlAdapter = this.doc.adapters?.xml;
        const isXml = xmlAdapter || this.doc.targetSchema?.format === 'xml';
        if (isXml) {
            return { direction, output: mappingSerializeXML(output, xmlAdapter ?? {}), appliedRules, diagnostics };
        }
        return { direction, output, appliedRules, diagnostics };
    }
}
export function createMappingEngine(mappingDoc) {
    return new RuntimeMappingEngine(mappingDoc);
}
