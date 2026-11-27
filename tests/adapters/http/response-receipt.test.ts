import { describe, expect, it } from 'vitest';
import { HttpRespondentReceiptReader } from '../../../src/adapters/http/response-receipt.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

const HASH_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const HASH_2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';

describe('HttpRespondentReceiptReader (fs-c0cc)', () => {
  it('reads respondent-scoped receipt fields and strips staff-only remediation and proof details', async () => {
    const { fetch, requests } = recordingFetch(() => jsonResponse({
      receipt_id: 'rcpt-101',
      accepted_at: '2026-05-01T12:34:56Z',
      response_hash: HASH_1,
      aggregate_id: 'resp-101',
      aggregate_type: 'response',
      artifact_kind: 'response-receipt',
      form_version_id: 'fv-1.0.0',
      proof_state: 'verified',
      rendered_object_refs: [{ artifact_kind: 'pdf', byte_length: 12, checkpoint_reference: 'cp-1', checksum_sha256: HASH_1, content_type: 'application/pdf', object_ref: 'obj-1' }],
      remediation: { action: 'staff-remediate', reason: 'internal staff diagnostic' },
      proof_report: { status: 'internal-staff-only' },
    }));

    const reader = new HttpRespondentReceiptReader({
      baseUrl: 'https://source.example.test',
      fetchImpl: fetch,
    });
    const result = await reader.read('resp-101');
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(['GET /responses/resp-101/receipt']);
    expect(result).toEqual({
      status: 'loaded',
      recordId: 'rcpt-101',
      receipt: {
        receipt_id: 'rcpt-101',
        accepted_at: '2026-05-01T12:34:56Z',
        response_hash: HASH_1,
        form_version_id: 'fv-1.0.0',
        proof_state: 'verified',
      },
    });
    expect(JSON.stringify(result)).not.toContain('remediation');
    expect(JSON.stringify(result)).not.toContain('staff-remediate');
    expect(JSON.stringify(result)).not.toContain('proof_report');
  });

  it('handles missing and malformed accepted_at without substituting client clock', async () => {
    for (const badTime of [undefined, null, '', 'not-a-date', '2026-02-31T00:00:00Z']) {
      const { fetch } = recordingFetch(() => jsonResponse({
        receipt_id: 'rcpt-202',
        ...(badTime !== undefined ? { accepted_at: badTime } : {}),
        response_hash: HASH_2,
        proof_state: 'verified',
        rendered_object_refs: [],
      }));
      const reader = new HttpRespondentReceiptReader({
        baseUrl: 'https://source.example.test',
        fetchImpl: fetch,
      });
      const result = await reader.read('resp-202');
      expect(result.status).toBe('loaded');
      if (result.status === 'loaded') {
        expect(result.receipt.receipt_id).toBe('rcpt-202');
        expect(result.receipt.response_hash).toBe(HASH_2);
        expect(result.receipt).not.toHaveProperty('accepted_at');
      }
    }
  });

  it('returns indistinguishable unavailable result for unauthorized, other-principal 403/404, and missing receipts', async () => {
    const outputs = [];
    for (const status of [401, 403, 404]) {
      const { fetch } = recordingFetch(() => jsonResponse({ detail: `status ${status}` }, status));
      const reader = new HttpRespondentReceiptReader({
        baseUrl: 'https://source.example.test',
        fetchImpl: fetch,
      });
      outputs.push(await reader.read('resp-other'));
    }
    expect(outputs[0]).toEqual({ status: 'unavailable', reason: 'receipt unavailable' });
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
  });
});
