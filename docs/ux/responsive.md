# Responsive

The M6 respondent shell is phone-first and keeps controls usable at small viewport widths.

## Viewport

`index.html` declares:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

## Tap Targets

Primary respondent controls have a minimum 44 px height:

- Locale buttons.
- Text/select/textarea inputs.
- Submit button.

The Playwright mobile smoke test verifies these controls at a 390 px wide viewport.

## Keyboard Hints

The demo definition declares `presentation.inputMode` for contact fields:

- Email address: `email`.
- Phone number: `tel`.

Native numeric/date controls continue to use browser-native input types.

## Performance Gates

`npm run check:bundle-budget` enforces the JavaScript bundle budget after
`npm run build`: initial JS must stay at or below 200 KiB gzip, and each lazy JS
chunk must stay at or below 200 KiB gzip.

`index.html` includes a static first-paint shell so the browser has contentful
text before React, the runtime bundle, and the WASM module finish loading. The
React boot path removes that shell from a committed React layout effect
after the React root renders its own loading surface; the Playwright
accessibility smoke asserts the static shell is gone on demo, load-error, and
OIDC sign-in surfaces. The no-JavaScript fallback keeps the shell visible and
explains that JavaScript is required.

`npm run test:deployment` verifies the Docker/nginx image serves fingerprinted
JS, CSS, and WASM assets with gzip plus immutable cache headers. HTML routes
revalidate, and `/formspec-runtime-config.js` is `no-store`.

The Lighthouse mobile budget is measured against the Docker/nginx image, not
Vite preview. Vite preview is useful for diagnostics, but it serves the runtime
WASM uncompressed and is not the M8 deployment target.

Latest local Docker/nginx Lighthouse measurement on 2026-05-23 scored 94 with
FCP about 1.3 s, LCP about 1.8 s, TBT 0 ms, Speed Index about 5.6 s, and total
transfer about 959 KiB. The runtime WASM transfer dropped from about 2.1 MB
uncompressed under Vite preview to about 800 KiB gzip under nginx. The
Lighthouse mobile >=90 and FCP <1.5 s budget passes on this local Docker/nginx
evidence; refresh this measurement before a release tag.

For comparison, the same build under local Vite preview on 2026-05-23 scored
88 with FCP/LCP about 1.8 s, TBT 0 ms, and the uncompressed 2.1 MB runtime WASM
dominating network transfer.
