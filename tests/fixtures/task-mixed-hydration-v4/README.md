# Task mixed hydration, composed receipt version 4

These seven files are the neutral export of formspec-server's
`actual_three_source_initial_and_task_hydration_protected_exports` producer test, run with
`FORMSPEC_MIXED_HYDRATE_FIXTURE_DIR` set (its `task` directory). They replace the earlier
Source-supplied export: evaluation-composition moved from v3 to v4 when a form version began
pinning its Theme and Locale documents (ADR 0166 section 1), which changes the policy, the
registration and the form-version hashes every file is bound to.

The hydration is TOP version 2, composed receipt version 4, with three
`nativeContextMapping` contributions. It contains two exact protected context
objects and no image leaf. This fixture verifies task-family wire admission,
authenticated candidate bindings, protected-object transport and worker protocol;
it does not establish browser, live Source, or image-proof qualification.

The Web test uses the real `HttpTaskCandidateHydration`,
`createTaskMixedProofVerifier`, `HttpMixedProofReader` and worker bridge. The
Source cryptographic API is an explicit test double returning the checked
fixture outcome. It checks the full selected request and exact object bytes.
A native-proof refusal control demonstrates that wire admission cannot bypass
that selected verifier.

Hydration SHA256: `a5bb4cf87f854acd19ad8e097c34e755cbe6a12ba8ce52a2aea628d5c8020bef`.
Normative V4 schema: `src/adapters/http/source-schemas/evaluation-composition-v4.schema.json`
(copied from formspec-server `schemas/`); the fixture's `producerProtocol` pins its
`$id` and SHA256.

The earlier task hydration tests used TOP1 with a mock receipt verifier; mixed
proof tests entered the verifier directly and bypassed the HTTP decoder. The
producer regression crosses both boundaries in the maintained CI test suite. The
selected mixed verifier factory admits only the exact V4 CompositionRegistration
shape before any transport or worker creation; semantic version and owner kinds
matter, not the provider version label.
