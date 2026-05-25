# ReviewThreadStore

`ReviewThreadStore` is the FW-0113 port for the SC-6 review-thread sidecar.
It creates or reads the thread, appends reviewer/respondent events, and pins a
thread hash for optional verifier receipt rendering.

The store enforces the FW-0042 authority boundary at append time: reviewer
capability tokens cannot author respondent-only events, and suggestions are
rejected on respondent-only field pointers.

Assumption while SC-6 remains PROPOSAL-status: `ensureThread()` is a local web
seed method so the respondent shell can create a thread before minting a share.
If SC-6 ratifies a different create verb, this method is the intended adapter
adjustment point.
