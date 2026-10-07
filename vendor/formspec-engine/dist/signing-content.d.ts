import type { FormDefinition, FormResponse, SigningContent, SigningContentSource } from '@formspec-org/types';
/** The host supplies its maintained common.schema.json SigningContent validator. */
export type SigningContentValidator = (value: unknown) => boolean;
export interface ResolveAuthoredSigningContentInput {
    /** Already admitted immutable Definition; the host verifies its publication hash. */
    definition: FormDefinition;
    response: Pick<FormResponse, 'definitionUrl' | 'definitionVersion' | 'displayedLocale'>;
    source: SigningContentSource;
    locale: string;
    validateContent: SigningContentValidator;
}
/** Resolve only an exact entry in the already loaded, Response-pinned Definition. No fetch or fallback. */
export declare function resolveAuthoredSigningContent(input: ResolveAuthoredSigningContentInput): SigningContent;
/** UTF-8 RFC 8785 JCS of the entire schema-valid SigningContent; exact authored strings survive. */
export declare function signingContentBytes(content: SigningContent, validateContent: SigningContentValidator): Uint8Array;
/** Content documentHash only. This does not sign a Response or verify a signature. */
export declare function hashSigningContent(content: SigningContent, validateContent: SigningContentValidator): Promise<string>;
