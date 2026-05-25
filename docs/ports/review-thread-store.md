# ReviewThreadStore

`ReviewThreadStore` is the FW-0113 port for the SC-6 review-thread sidecar.
It creates or reads the thread, appends reviewer/respondent events, and pins a
thread hash for optional verifier receipt rendering.

The store enforces the FW-0042 authority boundary at append time: reviewer
capability tokens must match the target thread, be active, and carry enough
scope for the requested event. Respondent tokens are likewise scoped to the
target thread. Suggestions are rejected on respondent-only field pointers.

`ensureThread()` may carry a bounded draft snapshot so the reviewer shell can
render field labels, visible values, respondent-only masks, and field anchors
without asking reviewers to type opaque pointers.

Assumption while SC-6 remains PROPOSAL-status: `ensureThread()` is a local web
seed method so the respondent shell can create a thread before minting a share.
If SC-6 ratifies a different create verb, this method is the intended adapter
adjustment point.
