import type { SurfaceBundleVerifiedResult } from '../ports/surface-bundle-verifier.ts';
import type { SurfaceBundleSnapshot } from '../ports/surface-bundle-source.ts';

export interface SurfaceVerificationStatusProps {
  readonly verification: SurfaceBundleVerifiedResult;
  readonly snapshot: SurfaceBundleSnapshot;
}

/**
 * Persistent authenticated status passed through `SurfaceApp.header`.
 *
 * Signed claims, trust-store facts, and host observations keep distinct labels
 * so a source location or unsigned sidecar cannot impersonate a publisher.
 */
export function SurfaceVerificationStatus({
  verification,
  snapshot,
}: SurfaceVerificationStatusProps) {
  const { payload, provenance } = verification;
  const trust = provenance.trust;
  const release = provenance.release;
  const receipt = provenance.integrityReceipt;

  return (
    <header
      className="fs-verification-status"
      aria-label="App verification"
      data-verification-status="verified"
    >
      <div className="fs-verification-status__summary">
        <strong>Verified app</strong>
        <span>Published by {trust.publisherDisplayName}</span>
        <span>Release {payload.release.id}</span>
      </div>
      <details>
        <summary>Verification details</summary>
        <dl>
          <dt>Signed publisher ID</dt>
          <dd>{payload.publisher.id}</dd>
          <dt>Signed app ID</dt>
          <dd>{payload.manifest.id}</dd>
          <dt>Signed release sequence</dt>
          <dd>{payload.release.sequence}</dd>
          <dt>Trusted signing key</dt>
          <dd>{trust.kid}</dd>
          <dt>Publisher trust result</dt>
          <dd>{trust.status}</dd>
          <dt>Authenticated payload digest</dt>
          <dd>{provenance.signedPayloadDigest}</dd>
          <dt>Signature method</dt>
          <dd>{receipt.method}</dd>
          <dt>Signature adapter</dt>
          <dd>{receipt.adapter.id}</dd>
          <dt>Signature adapter version</dt>
          <dd>{receipt.adapter.version}</dd>
          <dt>Verification adapter</dt>
          <dd>{provenance.adapterId}</dd>
          <dt>Source adapter</dt>
          <dd>{provenance.source.adapterId}</dd>
          <dt>Release policy</dt>
          <dd>{release.mode}</dd>
          <dt>Checked by this site</dt>
          <dd>
            <time dateTime={provenance.checkedAt}>{provenance.checkedAt}</time>
          </dd>
          <dt>Loaded by this site from</dt>
          <dd>{snapshot.evidence.resolvedLocator}</dd>
          <dt>Candidate identity</dt>
          <dd>{snapshot.identity}</dd>
        </dl>
      </details>
    </header>
  );
}
