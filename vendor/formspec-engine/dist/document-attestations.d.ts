/** @filedesc Atomic declared-document signing over unchanged Integrity whole-Response v1 bytes. */
import type { AuthoredSignature, DocumentAttestationCommitment, FormDefinition, FormResponse, ResolvedDocument } from '@formspec-org/types';
import { type KeyRef, type SignatureMethodRegistry, type VerificationReceipt, type Verifier } from '@formspec/signature-port';
/** A retained principal snapshot and the key the host actually expects for it. */
export interface DocumentAttestationWitness {
    response: FormResponse;
    definition: FormDefinition;
    keyRef: KeyRef;
}
/** The verifier is a host capability; registry/key inputs are captured before awaits. */
export interface DocumentAttestationVerification extends DocumentAttestationWitness {
    registry: SignatureMethodRegistry;
    verifier: Verifier;
    witnesses?: readonly DocumentAttestationWitness[];
}
export interface VerifiedDocumentAttestations {
    response: FormResponse;
    records: AuthoredSignature[];
    /** Actual verifier output, separate from any authenticated receipt claim. */
    receipt: VerificationReceipt;
}
/**
 * Prepare one immutable signing gesture. This does not sign or verify anything.
 * The returned bytes use the maintained v1 rule; only top-level authoredSignatures
 * is excluded. The caller must present these exact committed claims for assent.
 */
export declare function prepareDocumentAttestations(input: {
    response: FormResponse;
    definition: FormDefinition;
    resolvedDocuments: [ResolvedDocument, ...ResolvedDocument[]];
    commitment: DocumentAttestationCommitment;
}): Promise<{
    response: FormResponse;
    signedBytes: Uint8Array;
    digest: string;
}>;
/** Emit all selected document records atomically only after genuine verification. */
export declare function finalizeDocumentAttestations(input: DocumentAttestationVerification & {
    signatureBytes: Uint8Array;
}): Promise<VerifiedDocumentAttestations>;
/** Verify serialized declared-document evidence and its explicitly retained witnesses. */
export declare function verifyDocumentAttestations(input: DocumentAttestationVerification): Promise<VerifiedDocumentAttestations>;
