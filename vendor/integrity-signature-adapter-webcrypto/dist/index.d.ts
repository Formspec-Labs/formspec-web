import { Verifier, VerificationReceipt, VerifyRequest, SignatureMethodRegistry, KeyResolver } from '@formspec-org/integrity-signature-port';
export interface WebCryptoVerifierOptions {
    /**
     * Resolves `KeyRef.kid` to public-key bytes. Defaults to an empty
     * {@link StaticKeyResolver} — any `KeyRef.kid` request fails with
     * `key_not_found`. Wire a real resolver here when the verifier is meant
     * to look keys up by identifier.
     */
    keyResolver?: KeyResolver;
    adapterId?: string;
    adapterVersion?: string;
    methodUriPrefix?: string;
}
export declare class WebCryptoVerifier implements Verifier {
    private adapterInfo;
    private keyResolver;
    private methodUriPrefix;
    constructor(options?: WebCryptoVerifierOptions);
    verify(request: VerifyRequest, registry: SignatureMethodRegistry): Promise<VerificationReceipt>;
    private dispatchAlg;
    private verifyEd25519;
    private verifyEcdsaP256;
    private verifyRsaPssSha256;
    private unsupportedReceipt;
}
export { decodeCoseSign1 } from '@formspec-org/integrity-cose';
