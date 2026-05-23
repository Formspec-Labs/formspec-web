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
