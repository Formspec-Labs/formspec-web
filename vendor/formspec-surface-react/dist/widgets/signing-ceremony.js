import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Read, consent, Sign, then Submit through qualified Surface data and mapped actions. */
import { useEffect, useId, useRef, useState } from 'react';
import canonicalize from 'canonicalize';
import { snapshotFiniteJson } from '@formspec-org/surface';
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
import { SIGNING_CEREMONY_CONFIG_SCHEMA, } from './signing-ceremony-metadata.js';
export * from './signing-ceremony-metadata.js';
const COPY_KEYS = SIGNING_CEREMONY_CONFIG_SCHEMA.properties.copy.additionalProperties.required;
const text = (value) => typeof value === 'string' && value.length > 0;
const revision = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
        && Object.values(Object.getOwnPropertyDescriptors(value)).every((d) => d.enumerable && 'value' in d);
}
function same(a, b) {
    try {
        return canonicalize(a) === canonicalize(b);
    }
    catch {
        return false;
    }
}
function localeEntry(value, locale) {
    if (!record(value))
        return undefined;
    const keys = Object.keys(value).filter((key) => key.toLowerCase() === locale.toLowerCase());
    return keys.length === 1 ? value[keys[0]] : undefined;
}
/** Defensive reading supplements the Registry and qualified Data Source schema admission. */
function admit(props) {
    const { content, response, draft, actor, signingResult, actionLabels, review } = props.data;
    if (props.config.requireResponseReview !== undefined && typeof props.config.requireResponseReview !== 'boolean')
        return undefined;
    if (!record(content) || !record(content.source) || !text(content.source.ref) || !text(content.source.version)
        || !text(content.locale) || !text(content.documentId) || !text(content.signingIntent)
        || !['declaration', 'paperAlternative', 'affirmationText', 'delegatedSigningNotice'].every((key) => text(content[key]))
        || !record(content.electronicConsent) || !['textRef', 'version', 'text', 'controlLabel'].every((key) => text(content.electronicConsent[key]))
        || !record(response) || response.$formspecResponse !== '1.0' || response.status !== 'completed' || !text(response.id)
        || !text(response.definitionUrl) || !text(response.definitionVersion)
        || !record(draft) || !text(draft.id) || !revision(draft.version) || !text(draft.responseHash)
        || !record(actor) || !text(actor.id) || !record(signingResult) || !['unsigned', 'signed'].includes(String(signingResult.state))
        || !record(actionLabels) || !Object.values(actionLabels).every(text))
        return undefined;
    const source = localeEntry(props.config.contentRefs, content.locale);
    const copy = localeEntry(props.config.copy, content.locale);
    if (!record(source) || source.ref !== content.source.ref || source.version !== content.source.version
        || !record(copy) || !COPY_KEYS.every((key) => text(copy[key]))
        || (props.config.requireResponseReview === true && (!text(copy.reviewPending) || !text(copy.reviewUnavailable)))
        || !content.source.ref.startsWith(`${response.definitionUrl}#/extensions/x-formspec-signing-content/entries/`)
        || (record(response.displayedLocale) && String(response.displayedLocale.locale).toLowerCase() !== content.locale.toLowerCase()))
        return undefined;
    // The loader freezes its outer record, not every nested value. Capture what is actually displayed.
    try {
        return { data: structuredClone({ content, response, draft, actor, signingResult, actionLabels, ...(review !== undefined ? { review: snapshotFiniteJson(review) } : {}) }),
            copy: structuredClone(copy), requireResponseReview: props.config.requireResponseReview === true };
    }
    catch {
        return undefined;
    }
}
/** A qualified verified result must describe this exact persisted response. This does no crypto. */
function currentSigned(data) {
    const result = data.signingResult;
    const commitment = data.response.extensions?.['x-formspec-signing-content'];
    if (result.state !== 'signed' || !record(result.draft) || !record(result.verification)
        || result.verification.mode !== 'delegated-service-key' || !text(result.verification.provider) || !text(result.verification.keyId)
        || result.draft.id !== data.draft.id || result.draft.version !== data.draft.version || !same(result.response, data.response)
        || !commitment || commitment.draftId !== data.draft.id || !revision(commitment.draftVersion)
        || commitment.draftVersion + 1 !== data.draft.version || commitment.actorRef !== data.actor.id
        || !text(commitment.signerName) || !text(commitment.signedAt) || commitment.consentAccepted !== true
        || !same(commitment.content, data.content) || !/^[a-f0-9]{64}$/.test(commitment.documentHash)
        || commitment.documentHashAlgorithm !== 'sha-256')
        return false;
    const signatures = data.response.authoredSignatures;
    if (!Array.isArray(signatures) || signatures.length !== 1)
        return false;
    const signature = signatures[0];
    if (!record(signature) || !record(signature.signedPayload))
        return false;
    const payload = signature.signedPayload;
    return signature.signerId === commitment.actorRef && signature.signerName === commitment.signerName
        && signature.documentId === data.content.documentId && signature.signingIntent === data.content.signingIntent
        && signature.signatureProvider === result.verification.provider && signature.consentAccepted === true
        && signature.consentTextRef === data.content.electronicConsent.textRef && signature.consentVersion === data.content.electronicConsent.version
        && signature.affirmationText === data.content.affirmationText && signature.documentHash === commitment.documentHash
        && signature.documentHashAlgorithm === commitment.documentHashAlgorithm && payload.canonicalization === 'formspec-response-signing-v1'
        && payload.responseId === data.response.id && payload.definitionUrl === data.response.definitionUrl
        && payload.definitionVersion === data.response.definitionVersion && payload.signedAt === commitment.signedAt
        && payload.signingIntent === data.content.signingIntent;
}
/** Presentation gate only: private host and server checks remain authoritative. */
function reviewReady(required, data, signed) {
    if (!required)
        return true;
    const review = data.review;
    if (!record(review) || !record(review.state) || !record(review.state.draft))
        return false;
    const state = review.state;
    return /^[a-f0-9]{64}$/.test(review.contextIdentity) && state.status === 'ready'
        && state.contextIdentity === review.contextIdentity && state.responseHash === data.draft.responseHash
        && state.actorRef === data.actor.id && state.draft.id === data.draft.id && state.draft.version === data.draft.version
        && state.locale === data.content.locale && state.phase === (signed ? 'before-submit' : 'before-sign');
}
export function SigningCeremony(props) {
    const admitted = admit(props);
    if (!admitted || props.route.routeClass !== 'ceremony' || props.admitsTenantTheme) {
        return _jsx(WidgetEmptyState, { children: "Signing is unavailable because the required ceremony data is incomplete." });
    }
    // Remount local assent controls for any changed snapshot, actor, content, language, or saved revision.
    const generation = canonicalize({ response: admitted.data.response, draft: admitted.data.draft, actor: admitted.data.actor, content: admitted.data.content, requireResponseReview: props.config.requireResponseReview === true, reviewIdentity: props.config.requireResponseReview === true ? admitted.data.review?.contextIdentity ?? null : null });
    return _jsx(SigningCeremonyAct, { props: props, ...admitted }, generation);
}
function SigningCeremonyAct({ props, data, copy, requireResponseReview }) {
    const id = useId();
    const scroll = useRef(null);
    const alive = useRef(true);
    const [atEnd, setAtEnd] = useState(false);
    const [read, setRead] = useState(false);
    const [consent, setConsent] = useState(false);
    const signed = currentSigned(data);
    const reviewed = reviewReady(requireResponseReview, data, signed);
    const [name, setName] = useState(() => signed ? data.response.extensions['x-formspec-signing-content'].signerName : '');
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [outcomeUnknown, setOutcomeUnknown] = useState(false);
    useEffect(() => {
        alive.current = true;
        const area = scroll.current;
        if (area && area.clientHeight > 0 && area.scrollHeight <= area.clientHeight + 1)
            setAtEnd(true);
        return () => { alive.current = false; };
    }, []);
    const mapped = (output) => {
        const actions = (props.actions ?? []).filter((action) => action.outputName === output);
        if (actions.length !== 1)
            return undefined;
        const action = actions[0];
        const label = action.label && ('literal' in action.label ? action.label.literal : data.actionLabels[action.label.ref]);
        return text(label) && label.trim().length ? { action, label } : undefined;
    };
    const sign = mapped('sign');
    const submit = mapped('submit');
    const paper = mapped('paper');
    async function emit(output) {
        if (pending || output === 'submit' && outcomeUnknown || !mapped(output))
            return;
        const checked = admit(props);
        if (!checked || checked.requireResponseReview !== requireResponseReview || !same(checked.data, data))
            return;
        const isSigned = currentSigned(checked.data);
        if (output !== 'paper' && !reviewReady(requireResponseReview, checked.data, isSigned))
            return;
        if (output === 'sign' && (isSigned || !atEnd || !read || !consent || !name.trim()))
            return;
        if (output === 'submit' && !isSigned)
            return;
        const input = output === 'sign'
            ? { draftId: data.draft.id, draftVersion: data.draft.version, responseId: data.response.id, responseHash: data.draft.responseHash,
                source: { ref: data.content.source.ref, version: data.content.source.version }, locale: data.content.locale,
                signerName: name, consentAccepted: true }
            : output === 'submit'
                ? { draftId: data.draft.id, draftVersion: data.draft.version, canonical_response: data.response }
                : { source: { ref: data.content.source.ref, version: data.content.source.version }, locale: data.content.locale };
        setPending(true);
        setFailed(false);
        try {
            const emission = props.emitAction(output, input);
            const result = emission ? await emission.completion : undefined;
            if (alive.current) {
                if (output === 'submit' && result?.status === 'outcome-unknown') {
                    setOutcomeUnknown(true);
                    setFailed(false);
                }
                else
                    setFailed(!result || result.status !== 'completed');
            }
        }
        catch {
            if (alive.current)
                setFailed(true);
        }
        finally {
            if (alive.current)
                setPending(false);
        }
    }
    return _jsxs("section", { className: "fs-surface-ceremony", "data-widget": "signing-ceremony", "data-tenant-theme": "refused", children: [_jsx(Heading, { level: props.headingLevel, children: copy.heading }), _jsx("p", { id: `${id}-read`, children: copy.readInstruction }), _jsxs("div", { ref: scroll, className: "fs-surface-ceremony__full-text", tabIndex: 0, role: "region", "aria-label": copy.heading, "aria-describedby": `${id}-read`, onScroll: () => { const area = scroll.current; if (area && area.scrollTop + area.clientHeight >= area.scrollHeight - 1)
                    setAtEnd(true); }, children: [_jsx("p", { "data-probe": "signing-declaration", children: data.content.declaration }), _jsx("p", { "data-probe": "signing-electronic-consent", children: data.content.electronicConsent.text }), _jsx("p", { "data-probe": "signing-affirmation", children: data.content.affirmationText }), _jsx("p", { "data-probe": "signing-delegation", children: data.content.delegatedSigningNotice })] }), _jsx("p", { className: "fs-surface-ceremony__paper", "data-probe": "signing-paper-alternative", children: data.content.paperAlternative }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: read, disabled: !atEnd || pending || signed, onChange: (event) => setRead(event.currentTarget.checked) }), copy.readConfirmation] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: consent, disabled: !read || pending || signed, onChange: (event) => setConsent(event.currentTarget.checked) }), data.content.electronicConsent.controlLabel] }), _jsx("label", { htmlFor: `${id}-name`, children: copy.signerName }), _jsx("input", { id: `${id}-name`, autoComplete: "name", value: name, disabled: pending || signed, onChange: (event) => setName(event.currentTarget.value) }), _jsxs("div", { className: "fs-surface-ceremony__actions", children: [sign && _jsx("button", { type: "button", disabled: pending || !reviewed || signed || !atEnd || !read || !consent || !name.trim(), onClick: () => void emit('sign'), children: sign.label }), submit && _jsx("button", { type: "button", disabled: pending || outcomeUnknown || !reviewed || !signed, onClick: () => void emit('submit'), children: submit.label }), paper && _jsx("button", { type: "button", disabled: pending, onClick: () => void emit('paper'), children: paper.label })] }), _jsx("p", { role: "status", "aria-live": "polite", children: outcomeUnknown ? 'Your signed response is saved. The submission outcome is unknown. Check application status.' : pending ? copy.pending : failed ? copy.failed : !reviewed ? data.review?.state?.status === 'pending' ? copy.reviewPending : copy.reviewUnavailable : signed ? copy.signed : !sign || !submit ? copy.unavailable : '' })] });
}
