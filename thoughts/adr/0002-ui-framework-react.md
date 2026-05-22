# ADR-0002 — UI framework: React (with Vite, client-only for MVP)

**Date:** 2026-05-22
**Status:** accepted
**Closes:** FW-0014

## Context

formspec-web is the public reference UI (web ADR-0001) — three surfaces (respondent renderer, post-MVP verifier, post-MVP selective-proof viewer) that must be lean, accessible, embeddable, and white-label-ready. The repo has no code yet; the framework choice gates every UI row. The MVP scope (web ADR-0005) defers signer / verifier / receipt work, so the v0 build is a respondent renderer + identity layer + a11y CI.

The form-rendering primitive is exposed two ways: as a framework-agnostic web component (`<formspec-render>` from `formspec/packages/formspec-webcomponent`), and as a React-native package (`@formspec-org/react` from `formspec/packages/formspec-react`). The React package provides `<FormspecProvider>` + `<FormspecForm />` + granular hooks (`useField`, `useForm`, `useWhen`, `useSignal`) with three concentric API layers (auto-renderer, renderer + component map, hooks-only), already-shipped `'use client'` discipline for Next.js / RSC, and signal-safe hydration. The framework choice for formspec-web is about the **shell** that wraps the form-fill surface (cover page, navigation, identity, locale toggle, confirmation) AND about which engine-consumer primitive the shell uses.

Three frameworks were considered:

| Approach | Trade-off |
|---|---|
| **Web Components only** | Smallest bundle, framework-free, purist reference. But no ecosystem for the shell concerns (routing, identity adapters, a11y libraries, test infra) — every piece reinvented locally. Harder to attract contributors. |
| **Preact** | React-API-compatible, ~3KB runtime, the lean choice. Most React ecosystem libraries work (react-aria-components, oidc-client-ts). Smaller contributor pool, occasional library-compat surprises. |
| **React (chosen)** | Largest ecosystem (react-aria, axe-core integrations, OIDC clients, testing infra, accessibility tools), most contributors, React 19's compiler + RSC make bundle/perf concerns manageable. Heavier runtime than Preact. |

## Decision

**React** as the UI framework for formspec-web.

Concrete sub-decisions:

- **React 19** as the version baseline (React Compiler, Server Components, Suspense — features matter for the verifier post-MVP even if MVP doesn't use them).
- **Vite** as the build tool for MVP. Client-only React. No SSR for v0. SSR / RSC are revisited when the verifier work begins (post-MVP) — verifier benefits from streaming + RSC for the artifact graph; respondent renderer does not.
- **TypeScript strict mode** throughout.
- **`@formspec-org/react` from `formspec/packages/formspec-react`** is the engine consumer. formspec-web composes `<FormspecProvider>` + `<FormspecForm />` and reaches for the renderer + component-map layer (or the hooks layer) where the shell needs custom rendering — cover-page chrome, sender brand, identity affordances, locale toggle. The `<formspec-render>` web component remains the framework-agnostic conformance surface for adopters in Vue / Svelte / Angular / vanilla; formspec-web doesn't use it because the React-native package gives a better React idiom (hooks, signal hydration, component maps) without losing conformance.

## Rationale

1. **Ecosystem is the load-bearing factor for an open-source reference UI.** `react-aria-components`, `axe-core` + `@axe-core/playwright`, `oidc-client-ts`, `@simplewebauthn/browser` (post-MVP), `@spruceid/didkit-wasm` (post-MVP) all have first-class React paths. The MVP and post-MVP roadmap is React-friendly end-to-end (web ADR-0007 explicitly names these).
2. **Contributor pool.** Open-source reference UI lives or dies by who can contribute. React's pool dwarfs Preact's and is unbounded vs. Web-Components-only.
3. **Two engine-consumer primitives keep the conformance story honest.** `<formspec-render>` (web component) remains the framework-agnostic conformance surface — any adopter in any framework can pull it in. `@formspec-org/react` is the React-native equivalent that formspec-web uses; both consume the same `FormEngine`, the same `FormspecDefinition`, the same FEL evaluator. Choosing the React package for formspec-web's own shell is not a fork of the conformance harness — it's the React idiom of the same primitive. Adopters in other frameworks get the web component; React-using adopters get the React package; both are reference implementations.
4. **React 19's compiler + RSC future-proof the verifier (post-MVP).** Trust Center artifact graph (J-006) and the verifier UI (J-007 / FW-0003) benefit from streaming SSR when the time comes. Preact's SSR story is thinner; Web Components alone require building this from scratch.
5. **Tension with "lean" charter is mitigated.** React 19's compiler eliminates the historical re-render overhead. Tree-shaking + code-splitting + the modest scope of formspec-web (no SPA-router complexity in MVP — it's mostly a single-route form surface + a handful of post-MVP pages) keep the production bundle realistic. The verifier WASM payload (`trellis-verify-wos` post-MVP) is the dominant size concern, not React.
6. **Reversibility is high.** The shell is thin; the load-bearing primitive (`<formspec-render>`) is framework-agnostic. If React proves wrong post-MVP, the shell is replaceable in proportion to its size (small), not in proportion to the form-rendering surface (large, but framework-independent).

## Consequences

- **Stack:** React 19, Vite, TypeScript strict, client-only for MVP.
- **Engine consumer:** `@formspec-org/react` (`@formspec-org/react`, peer deps `react ^18 || ^19`, `@preact/signals-core`, `@formspec-org/engine`, `@formspec-org/layout`). Reached for via `<FormspecProvider>` / `<FormspecForm />` and (where the shell needs control) the hooks layer + component map.
- **A11y:** `react-aria-components` for keyboard-nav / focus management primitives in the shell; `axe-core` + `@axe-core/playwright` for CI gating (FW-0017). `@formspec-org/react` already ships reactive ARIA via `useSyncExternalStore`-backed hooks; the shell layers brand chrome + a11y polish on top.
- **Identity:** `oidc-client-ts` as the OIDC adapter dependency (per web ADR-0007).
- **Testing:** Vitest for unit; Playwright for E2E (matches `formspec/`'s existing E2E stack — shared tooling).
- **Build pipeline (FW-0016):** Vite produces a deployable static + SPA artifact. Sub-60-second clean-tree build per FW-0016 acceptance.
- **Embed (FW-0040 post-MVP):** Embedding does NOT require React. Adopters import `<formspec-render>` from `formspec-webcomponent` directly OR `@formspec-org/react` if they're already on React. formspec-web's choice does not constrain embed consumers.
- **SSR / RSC posture:** `@formspec-org/react` already carries `'use client'` and signal-safe hydration, so a future migration to Next.js / RSC for the post-MVP verifier + Trust Center is unblocked. MVP stays client-only on Vite.
- **`formspec-site` is unaffected** — Astro stays for the marketing surface (separate deploy track per stack `CLAUDE.md`).
- **React surfaces shipped beyond the basic provider + form**: `@formspec-org/react` also ships `<FormspecScreener>` (closes FW-0046 substrate side), `<Issuer>` (closes FW-0004 chrome substrate side), `<ValidationSummary>` (closes FW-0013 rendering substrate side). Hooks beyond the basic `useField` / `useForm` / `useWhen` / `useSignal`: `useLocale`, `useFieldError`, `useFieldValue`, `useFocusField`, `useRepeatCount`, `useReplay`, `useSubmitPending`, `useDiagnostics`, `useExternalValidation`, `useRuntimeContext`. formspec-web shell work for these FW rows shrinks from "design + build" to "import + style."
- **Tokens + default theme baseline:** `@formspec-org/layout/token-registry` and `@formspec-org/layout/default-theme` are shipped JSON artifacts. FW-0015 extends these with brand-specific overrides; it does NOT author a token vocabulary from scratch.
- **Adapter package:** `@formspec-org/adapters` (Apache-2.0) ships `tailwind-formspec-core.css` (default Tailwind integration) + USWDS adapter (government-form a11y reference) + headless `behavior` contracts (`TextInputBehavior`, `RadioGroupBehavior`, `FileUploadBehavior`, `SignatureBehavior`, `WizardBehavior`) for custom component maps. Adopt the Tailwind core CSS as the baseline; USWDS adapter is optional but available for federal / government deployments.
- FW-0014 closes; FW-0016 (build pipeline) and FW-0015 (design tokens — now an extend-not-author task) unblock for scaffolding.

## Related decisions

- web ADR-0001 — repo separation; reference-UI charter
- web ADR-0003 — license (pending; permissive preferred)
- web ADR-0004 — consume-not-invent posture (React is the shell, not a primitive)
- web ADR-0007 — identity adapters (React-native libraries adopted)
