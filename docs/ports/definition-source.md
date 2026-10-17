# DefinitionSource

`DefinitionSource` fetches a canonical `FormDefinition` from
`@formspec-org/types` by form URL and optional version.

Adapter contract:

- Return a schema-valid `FormDefinition`.
- Reject missing definitions instead of returning partial data.
- Preserve the definition URL and version in the returned object.
- If `getLocaleDocuments` is implemented, callers pass the same source URL
  they used for `getDefinition`. Do not assume this is equal to the returned
  canonical `definition.url`; reference runtime URLs may carry server form ids
  such as `/runtime/forms/{form_id}`.
- Return only Locale Documents attached to that runtime payload; never
  synthesize translations.
- If `getThemeDocument` is implemented, return the Theme pinned on the same
  runtime payload (the one the form's accessibility check ran against), or
  `null` when there is none.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/definition-source
```
