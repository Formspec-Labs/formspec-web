# Branding

The respondent shell resolves issuer state through the active `FormEngine` before rendering the form.

## Branded Forms

When `engine.getResolvedIssuer()` returns a source other than `unbranded`, the app renders `IssuerChromeSlot` from `@formspec-org/react` and passes the engine directly:

- The React renderer owns issuer display-name localization through the engine locale signal.
- The shell renders the form title and description below the issuer chrome.
- Host query or host embed issuer overrides remain engine-owned, not shell-owned.

## Unbranded Forms

When issuer resolution returns `source === "unbranded"`, the shell renders `UnbrandedCover` instead of issuer chrome. The cover uses the engine locale resolver for `$form.title` and `$form.description`.

## Mutual Exclusion

`RespondentSurface` branches on the resolved issuer source:

- Branded: `IssuerChromeSlot` plus the form title.
- Unbranded: `UnbrandedCover`.

The two issuer treatments are not rendered together.
