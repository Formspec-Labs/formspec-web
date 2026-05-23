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

The Lighthouse mobile budget is not closed: latest local production-preview
measurement on 2026-05-22 scored about 74 with FCP about 1.7 s and LCP about
12.3 s on simulated 3G. The runtime WASM and first form hydration dominate that
miss. Treat Lighthouse mobile >=90 and FCP <1.5 s as open performance work, not
as M6 release sign-off.
