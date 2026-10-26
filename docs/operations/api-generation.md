# Generate API declarations

Use an explicit public OpenAPI document from the committed producer:

```sh
node scripts/generate-source-api.mjs ../formspec-server/schemas/formspec-server.openapi.json
node scripts/generate-wos-api.mjs ../work-spec/api/wos-public-api.openapi.json
```

Append `--check` to compare without writing. These commands generate only the
corresponding declaration in `src/api/generated`; they do not build a producer.

Both entrypoints use `renderApiTypes(input)` from `generate-source-api.mjs`.
Other client generators may import this async function and consume its complete
rendered text. Generation, the open-object transform, and printing stay within
one compiler installation; sharing AST nodes between TypeScript versions can
produce invalid declarations.

A propertyless object containing only annotations admits arbitrary properties as
`Record<string, unknown>`. This includes objects described with `examples`.
Closed, structured, composed, constrained, and legacy `nullable` schemas keep the
library's behavior. Generated declarations must not be patched by hand.
