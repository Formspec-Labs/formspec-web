# DefinitionSource Adapters

`HttpDefinitionSource` is the formspec-stack reference adapter.

It calls `GET /runtime/forms/{form_id}` on `formspec-server` and extracts the
`definition` member from the returned `PublishedRuntimeView`. The default
`form_id` resolver accepts a full runtime endpoint URL
(`/runtime/forms/{form_id}`) or falls back to the final URL path segment until
EXT-20 defines a canonical URL-to-form-id resolver.

Run:

```bash
npm test -- tests/adapter-conformance/definition-source
npm test -- tests/adapters/http/definition-source.test.ts
```
