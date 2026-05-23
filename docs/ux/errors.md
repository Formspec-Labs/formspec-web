# Errors

The respondent shell separates validation errors, transport errors, and client faults.

## Validation

Submit actions use the engine validation report. If the report is invalid, the app saves the draft response and keeps the respondent on the form with a plain-language alert.

## Problem JSON

Adapter failures may carry stack-common Problem JSON. The shell detects a `problem` object structurally, displays the Problem JSON title and detail, and shows `error_code` as a support reference.

## Client Faults

`AppErrorBoundary` wraps the respondent surface. Unexpected React/runtime faults render a plain-language fallback instead of leaving a blank page.

## Surfaces Covered

Playwright + axe covers:

- Initial form surface.
- Validation alert surface.
- Load-error surface.
- Confirmation surface.
