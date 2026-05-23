# Accessibility

Target: WCAG 2.1 AA for the M6 respondent baseline.

## Automated Checks

Current automated checks:

- Playwright smoke renders the demo form.
- `@axe-core/playwright` scans the initial form surface.
- The same test scans the validation alert surface after an empty submit.
- A separate test scans the load-error surface.
- The confirmation surface is scanned after a successful submit.
- Mobile viewport smoke verifies primary tap targets are at least 44 px high.

## Manual Screen-Reader Sweep

Manual assistive-technology checks are required before release sign-off.

| Tool | Environment | Status | Criteria |
| --- | --- | --- | --- |
| VoiceOver | macOS Safari or Chrome | Pending manual run | Heading order, issuer chrome, language toggle, required-field errors, submit confirmation. |
| NVDA | Windows Chrome or Firefox | Pending manual run | Heading order, field labels, required-field errors, submit confirmation, no keyboard trap. |

This coding environment cannot execute the Windows NVDA pass. Treat M6 as implementation-ready but not release-signed until those two manual rows are completed.

## Acceptance Criteria

Manual pass requires:

- Page has one clear `h1`.
- Form field groups are reachable in heading order.
- Every input has a spoken label.
- Required errors are announced after submit.
- Locale toggle state is announced.
- Confirmation reference is announced.
- Full flow is keyboard-operable.
