import { expect, vi } from 'vitest';
import { HttpStatusReader } from '../../../src/adapters/http/status-reader.ts';
import type { ApplicantCaseDetail } from '../../../src/ports/status-reader.ts';
import { validateApplicantCaseDetail } from '../../../src/adapters/schema/applicant-case-detail.ts';
import { jsonResponse } from '../../adapters/http/test-fetch.ts';
import { stubStatusReader } from '../../../src/adapters/stub/status-reader.ts';
import { defineStatusReaderConformance } from '../_framework/conformance.ts';

defineStatusReaderConformance('stub StatusReader conformance', () => {
  const adapter = stubStatusReader();
  return {
    adapter,
    registerStatus(key, projection) {
      adapter.registerStatus(key, projection);
    },
  };
});


defineStatusReaderConformance('protected HTTP StatusReader conformance', () => {
  const resourceRef = 'urn:wos:test_case_00000000000000000000000000';
  const statusResource: ApplicantCaseDetail = {
    summary: { id: resourceRef, workflowUrl: 'https://workflow.example.test/current', lifecycleState: 'active',
      actionNeeded: false, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' },
    openTasks: [], recentNotifications: [], statusTimeline: [],
  };
  const state = { issuer: 'https://identity.example.test', subject: 'conformance-applicant', revision: 1,
    expiresAt: '2099-01-01T00:00:00Z' };
  let retained: ApplicantCaseDetail | undefined;
  return {
    resourceRef, statusResource,
    adapter: new HttpStatusReader({ baseUrl: 'https://wos.example.test', caseLedgerId: resourceRef, issuer: state.issuer,
      signal: new AbortController().signal, assertCurrent: () => {},
      browserAuthSession: {
        begin: async () => {}, completeCallback: async () => state, completeSilentCallback: async () => {},
        getSession: async () => state, renew: async () => state, logout: async () => {},
        completeLogoutCallback: async () => {}, accessToken: async () => 'conformance-bearer', dispose: () => {},
        subscribe(listener) { listener(state); return () => {}; },
      },
      fetchImpl: vi.fn(async (input, init) => {
        expect(String(input)).toBe('https://wos.example.test/api/v1/applicant/cases/' + encodeURIComponent(resourceRef));
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer conformance-bearer');
        expect(init?.credentials).toBe('omit'); expect(init?.cache).toBe('no-store');
        if (!retained) throw new Error('No registered case');
        return jsonResponse(retained);
      }),
    }),
    registerStatus(key, candidate) {
      if (key !== resourceRef || !validateApplicantCaseDetail(candidate)) throw new Error('Invalid selected applicant case');
      retained = structuredClone(candidate);
    },
  };
});
