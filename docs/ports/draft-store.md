# DraftStore

`DraftStore` persists in-progress `FormResponse` documents from
`@formspec-org/types`, keyed by form URL, optional form version, and optional
subject reference.

Adapter contract:

- Round-trip schema-valid `FormResponse` values.
- Return `undefined` for unknown draft keys.
- Invalidate all cached drafts for a subject when identity changes.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/draft-store
```
