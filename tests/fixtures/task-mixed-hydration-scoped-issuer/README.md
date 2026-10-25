# Task mixed hydration with an independent scope issuer

These seven data files are unchanged output from Source (formspec-server) commit
`c4abcfd2677155f76135f38cb225cae2aed52eb2`, produced by
`actual_three_source_initial_and_task_hydration_protected_exports`
(`crates/formspec-server/src/services/mixed_task_sign_fixture_tests.rs`) with
`FORMSPEC_MIXED_HYDRATE_FIXTURE_DIR` set; they are its `task/` output. The exporter
test passed. The earlier `task-mixed-hydration-v4` files remain historical evidence in
their original directory.

That producer commit was never published. The nearest published commit is
`502be346c72ec3b24e22e26c12db12c6b0e46f9c` on formspec-server `main`: it squashes
candidate `0b1a614`, a descendant of `c4abcfd`, with an identical tree. No rerun
reproduces these bytes at any commit: draft and object ids are time-ordered, so the
ids, the hashes over them, the buffer order (sorted by object key) and the SHA-256
values below change on every run. Two runs of the exporter at published `main`
`fb16f6be0247978542b08ffc84146bb8baf9ce36` passed, and their output matched these
files in every JSON path, value shape and buffer length; only those run-varying
values differed.

The fixture contains a version 2 hydration view, version 4 composed receipt,
three context contributions, and two protected objects. The exporter obtains
`selection.expectedIssuer` from its configured Source service and admitted scope,
independently of candidate or proof bytes. Browser tests use that selection as
trusted host configuration.

Most transport tests use an explicit Source verifier double. The separate gate
selected by `FORMSPEC_SOURCE_MIXED_PROOF_MODULE` and
`FORMSPEC_SOURCE_MIXED_PROOF_WASM` runs the actual maintained JavaScript/WebAssembly
package through the task hydration adapter, protected reader and worker bridge.
It verifies the authentic proof, refuses a different configured issuer, and
refuses altered protected bytes. That gate passed 71 tests without skips against
the producer above. This controlled fixture does not establish live D1 authority
or deployment acceptance.

Hydration SHA-256:
`cec822a5509ed2a147f31f31c5e2d2d05f9e67882d1ee6fddcb55bdac48450fe`.
Selection SHA-256:
`3730a09bfe19d810a7625a400e20a2644353fc902783164132c33059964392b9`.
