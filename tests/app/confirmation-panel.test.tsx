import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConfirmationPanel } from '../../src/app/RespondentRuntime.tsx';
import type { SubmitConfirmation } from '../../src/ports/submit-transport.ts';

describe('ConfirmationPanel "Track this application" link (FW-0039 slice 1)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a /status?case={urn} link when the confirmation carries a caseUrn', () => {
    const confirmation: SubmitConfirmation = {
      referenceNumber: 'STUB-000001',
      status: 'accepted',
      caseUrn: 'urn:wos:case_demo_000001',
    };
    render(<ConfirmationPanel confirmation={confirmation} />);
    const link = screen.getByRole('link', { name: /Track this application/i });
    expect(link.getAttribute('href')).toBe('/status?case=urn%3Awos%3Acase_demo_000001');
  });

  it('does NOT render a tracking link when the confirmation omits caseUrn and trackingUri', () => {
    const confirmation: SubmitConfirmation = {
      referenceNumber: 'NO-CASE-001',
      status: 'accepted',
    };
    render(<ConfirmationPanel confirmation={confirmation} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('falls back to "Track this submission" with the trackingUri when caseUrn is absent', () => {
    const confirmation: SubmitConfirmation = {
      referenceNumber: 'STUB-LEGACY',
      status: 'accepted',
      trackingUri: 'https://example.test/legacy-tracking',
    };
    render(<ConfirmationPanel confirmation={confirmation} />);
    const link = screen.getByRole('link', { name: /Track this submission/i });
    expect(link.getAttribute('href')).toBe('https://example.test/legacy-tracking');
  });

  it('keeps the existing reference number rendering intact', () => {
    const confirmation: SubmitConfirmation = {
      referenceNumber: 'STUB-000007',
      status: 'accepted',
    };
    render(<ConfirmationPanel confirmation={confirmation} />);
    expect(screen.getByText('STUB-000007')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Submission received' })).not.toBeNull();
  });
});
