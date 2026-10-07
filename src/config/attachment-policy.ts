/** Validate a deployment-supplied final upload limit; absence makes no server-limit claim. */
export function validatedAttachmentMaxUploadBytes(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('attachmentMaxUploadBytes must be a positive safe integer number of bytes');
  }
  return value;
}
