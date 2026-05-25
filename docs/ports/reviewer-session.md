# ReviewerSession

`ReviewerSession` is the FW-0113 port for trusted-reviewer capability URLs.
It mints, redeems, revokes, and lists reviewer shares for the `trustedReviewer`
runtime feature.

This port deliberately does not store comments or suggestions. Review content
lives in `ReviewThreadStore`, and `trustedReviewer` is available only when both
ports are wired.

Assumption while FW-0042 / SC-6 remain PROPOSAL-status: the HTTP seed paths are
conventional and may change; the TypeScript port shape is the local contract
for this slice.
