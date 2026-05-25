# SafeAddressDirectory

`SafeAddressDirectory` is the FW-0060 substitute-address validation port. It
validates one candidate substitute address against one deployment-configured
protection regime such as `CA-ACP`, `WA-ACP`, or `USMS-WitSec`.

The port is intentionally narrow. Masking is renderer discipline, bucketed
Response emission is a response writer concern, and verifier-grade commitment
proofs remain Trellis substrate. Do not collapse those axes into this port.
