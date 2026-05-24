import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RespondentDocumentRecord } from '../../src/ports/index.ts';
import {
  DocumentItem,
  groupAndSortDocuments,
  uniqueKindCount,
} from '../../src/app/documents-view.tsx';

function doc(overrides: Partial<RespondentDocumentRecord>): RespondentDocumentRecord {
  return {
    id: overrides.id ?? 'x',
    kind: overrides.kind ?? 'other',
    displayName: overrides.displayName ?? 'A document',
    issuer: overrides.issuer,
    capturedAt: overrides.capturedAt ?? '2026-05-01T00:00:00.000Z',
    expiresAt: overrides.expiresAt,
    contentRef: overrides.contentRef ?? {
      uri: 'urn:formspec:blob:test',
      mediaType: 'application/octet-stream',
    },
    sourceSubmissionRef: overrides.sourceSubmissionRef,
    presentationPolicyRef: overrides.presentationPolicyRef,
    extensions: overrides.extensions,
  };
}

describe('groupAndSortDocuments', () => {
  it('groups by document kind preserving the closed taxonomy', () => {
    const grouped = groupAndSortDocuments([
      doc({ id: 'a', kind: 'identity-proof' }),
      doc({ id: 'b', kind: 'income-proof' }),
      doc({ id: 'c', kind: 'identity-proof' }),
      doc({ id: 'd', kind: 'other' }),
      doc({ id: 'e', kind: 'signed-receipt' }),
    ]);
    expect(grouped.get('identity-proof')?.map((x) => x.id).sort()).toEqual(['a', 'c']);
    expect(grouped.get('income-proof')?.map((x) => x.id)).toEqual(['b']);
    expect(grouped.get('signed-receipt')?.map((x) => x.id)).toEqual(['e']);
    expect(grouped.get('other')?.map((x) => x.id)).toEqual(['d']);
  });

  it('omits empty kinds from the result (no zero-length sections)', () => {
    const grouped = groupAndSortDocuments([doc({ id: 'a', kind: 'identity-proof' })]);
    expect(grouped.has('income-proof')).toBe(false);
    expect(grouped.has('proof-of-address')).toBe(false);
  });

  it('preserves a stable kind ordering matching the closed taxonomy order', () => {
    const grouped = groupAndSortDocuments([
      doc({ id: 'a', kind: 'other' }),
      doc({ id: 'b', kind: 'identity-proof' }),
      doc({ id: 'c', kind: 'signed-receipt' }),
      doc({ id: 'd', kind: 'income-proof' }),
    ]);
    // The Map iteration order pins kind ordering for the UI rendering.
    // Closed taxonomy order per respondent-place-source.ts.
    expect([...grouped.keys()]).toEqual([
      'identity-proof',
      'income-proof',
      'signed-receipt',
      'other',
    ]);
  });

  it('sorts within a kind by capturedAt desc; undefined last; ties broken by displayName asc', () => {
    const grouped = groupAndSortDocuments([
      doc({ id: '1', kind: 'identity-proof', capturedAt: '2026-05-01T00:00:00Z', displayName: 'b' }),
      doc({ id: '2', kind: 'identity-proof', capturedAt: '2026-06-01T00:00:00Z', displayName: 'a' }),
      doc({ id: '3', kind: 'identity-proof', capturedAt: '2026-05-01T00:00:00Z', displayName: 'a' }),
      doc({ id: '4', kind: 'identity-proof', capturedAt: '2026-07-01T00:00:00Z', displayName: 'z' }),
    ]);
    expect(grouped.get('identity-proof')?.map((x) => x.id)).toEqual(['4', '2', '3', '1']);
  });
});

describe('uniqueKindCount', () => {
  it('counts distinct kinds', () => {
    expect(
      uniqueKindCount([
        doc({ id: '1', kind: 'identity-proof' }),
        doc({ id: '2', kind: 'identity-proof' }),
        doc({ id: '3', kind: 'income-proof' }),
      ]),
    ).toBe(2);
  });
  it('returns 0 on empty', () => {
    expect(uniqueKindCount([])).toBe(0);
  });
});

// --- Parity fixture: locked-in `<li>` shape exported for use in
// DocumentsRuntime DOM-parity tests (mirrors the FW-0055 obligations parity).
export const PARITY_FIXTURE_DOCUMENT: RespondentDocumentRecord = {
  id: 'parity-doc',
  kind: 'proof-of-address',
  displayName: 'Utility bill',
  issuer: { name: 'Example Utility', url: 'https://utility.example.com' },
  capturedAt: '2026-05-01T12:00:00.000Z',
  contentRef: {
    uri: 'urn:formspec:blob:test',
    mediaType: 'application/pdf',
    sha256: 'abc123',
  },
};

export function renderParityFixture(): string {
  return renderToStaticMarkup(<DocumentItem document={PARITY_FIXTURE_DOCUMENT} />);
}

describe('DocumentItem render parity', () => {
  it('renders the displayName + issuer name + capturedAt as a list item', () => {
    const html = renderParityFixture();
    expect(html).toContain('<li');
    expect(html).toContain('Utility bill');
    expect(html).toContain('Example Utility');
    // labelFromToken title-cases each word — 'proof-of-address' → 'Proof Of Address'.
    expect(html).toContain('Proof Of Address');
  });

  it('renders mediaType when issuer is absent', () => {
    const html = renderToStaticMarkup(
      <DocumentItem
        document={doc({ id: 'no-issuer', displayName: 'A note', kind: 'other' })}
      />,
    );
    // No issuer name, so the second line falls back to mediaType.
    expect(html).toContain('application/octet-stream');
  });

  it('renders expiresAt when present', () => {
    const html = renderToStaticMarkup(
      <DocumentItem
        document={doc({
          id: 'expiring',
          kind: 'identity-proof',
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}
      />,
    );
    expect(html).toContain('Expires');
  });
});
