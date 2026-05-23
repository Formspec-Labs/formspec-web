# DefinitionSource

`DefinitionSource` fetches a canonical `FormDefinition` from
`@formspec-org/types` by form URL and optional version.

Adapter contract:

- Return a schema-valid `FormDefinition`.
- Reject missing definitions instead of returning partial data.
- Preserve the definition URL and version in the returned object.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/definition-source
```
