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

`npm run test:deployment` verifies the Docker/nginx image serves fingerprinted
JS, CSS, and WASM assets with gzip plus immutable cache headers. HTML routes
revalidate, and `/formspec-runtime-config.js` is `no-store`.

The Lighthouse mobile budget is measured against the Docker/nginx image, not
Vite preview. Vite preview is useful for diagnostics, but it serves the runtime
WASM uncompressed and is not the M8 deployment target.

Latest local Docker/nginx Lighthouse measurement on 2026-05-23 scored 93 with
FCP/LCP about 1.8 s, TBT 0 ms, Speed Index about 5.8 s, and total transfer
about 959 KiB. The runtime WASM transfer dropped from about 2.1 MB uncompressed
under Vite preview to about 800 KiB gzip under nginx. Performance score now
meets the >=90 budget, but FCP still misses the <1.5 s release budget; keep the
Lighthouse row open until that is closed.

For comparison, the same build under local Vite preview on 2026-05-23 scored
88 with FCP/LCP about 1.8 s, TBT 0 ms, and the uncompressed 2.1 MB runtime WASM
dominating network transfer.
