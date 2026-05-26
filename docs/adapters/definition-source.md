# DefinitionSource Adapters

`HttpDefinitionSource` is the formspec-stack reference adapter.

It calls `GET /runtime/forms/{form_id}` on `formspec-server` and extracts the
`definition` member from the returned `PublishedRuntimeView`. The default
`form_id` resolver accepts a full runtime endpoint URL
(`/runtime/forms/{form_id}`) or falls back to the final URL path segment until
EXT-20 defines a canonical URL-to-form-id resolver.

`getLocaleDocuments(url, version)` resolves `url` through the same form-id
path. Respondent runtime calls it with the original
`Composition.initialDefinitionUrl`, not the returned canonical `definition.url`,
so an issuer may publish a canonical definition URL that differs from the
server runtime form id without causing locale sidecars to be fetched from a
different runtime form.

The root `/?form=` route is selected Definition plumbing. Boot copies exactly
one `form` parameter into `Composition.initialDefinitionUrl` for the full-app
production composition and rejects empty or duplicate `form` parameters before
constructing production HTTP adapters. The selected value still flows through
the default form-id resolver above; this does not close EXT-20 canonical URL
resolution and does not model a route-param selected Response instance.

The adapter extracts concrete Locale Documents from `locales`,
`locale_documents`, and `localeDocuments` members of the same runtime payload.
String-only `locale_refs` entries are treated as references and ignored by the
web runtime.

Run:

```bash
npm test -- tests/adapter-conformance/definition-source
npm test -- tests/adapters/http/definition-source.test.ts
```
