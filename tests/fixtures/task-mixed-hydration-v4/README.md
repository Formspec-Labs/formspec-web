# Current Source-produced task mixed hydration

These seven files are unchanged neutral exports of Source's maintained
`actual_three_source_initial_and_task_hydration_protected_exports` producer test.
The Source export was supplied at
`/private/tmp/source-hydration-protocol-regression-20261013-v1/packets/task`.

The hydration is TOP version 2, composed receipt version 3, with three
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

Hydration SHA256: `3fe28a9a6074fc3c48b7076845b2429bbe04e8f858b27171edf3c870ccbbb6bb`.
Normative Source V3 schema SHA256:
`75c4a31fb125f925bae6d3911fd92ff06109591ecb5542d8711b1c6e8b07abc4`.
The existing V3 schema is unchanged.

The earlier task hydration tests used TOP1 with a mock receipt verifier; mixed
proof tests entered the verifier directly and bypassed the HTTP decoder. The
producer regression now crosses both boundaries in the maintained CI test
suite. The selected mixed verifier factory also admits only the exact Source
V3 CompositionRegistration shape before any transport or worker creation;
semantic version and owner kinds matter, not the provider version label.

Source test-only producer commit: `28766152fd1814079b37c806851c5f3603abeb53`.
The fixture's `producerProtocol` pins are compared with the selected registration
and the exact unchanged vendored Source V3 schema in the producer regression.
