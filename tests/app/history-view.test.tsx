import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HistoryEntry } from '../../src/ports/index.ts';
import {
  HISTORY_KIND_ORDER,
  HistoryEntryItem,
  groupAndSortHistory,
  uniqueIssuerCount,
} from '../../src/app/history-view.tsx';

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? 'x',
    kind: overrides.kind ?? 'submission',
    issuer: overrides.issuer ?? { name: 'Example Agency' },
    timestamp: overrides.timestamp ?? '2026-05-01T00:00:00.000Z',
    title: overrides.title ?? 'An entry',
    applicantStatusRef: overrides.applicantStatusRef,
    receiptRef: overrides.receiptRef,
    documentRefs: overrides.documentRefs,
    definitionRef: overrides.definitionRef,
  };
}

describe('HISTORY_KIND_ORDER', () => {
  it('matches the closed-taxonomy order: draft → submission → signed-record', () => {
    expect([...HISTORY_KIND_ORDER]).toEqual(['draft', 'submission', 'signed-record']);
  });
});

describe('groupAndSortHistory', () => {
  it('groups by kind preserving the closed taxonomy order', () => {
    const grouped = groupAndSortHistory([
      entry({ id: 'a', kind: 'signed-record' }),
      entry({ id: 'b', kind: 'submission' }),
      entry({ id: 'c', kind: 'draft' }),
    ]);
    expect([...grouped.keys()]).toEqual(['draft', 'submission', 'signed-record']);
  });

  it('omits empty kinds (no zero-length sections)', () => {
    const grouped = groupAndSortHistory([entry({ id: 'a', kind: 'submission' })]);
    expect(grouped.has('draft')).toBe(false);
    expect(grouped.has('signed-record')).toBe(false);
    expect(grouped.has('submission')).toBe(true);
  });

  it('sorts within each section by timestamp desc, ties broken by id asc', () => {
    const grouped = groupAndSortHistory([
      entry({ id: 'b', kind: 'submission', timestamp: '2026-05-01T00:00:00.000Z' }),
      entry({ id: 'a', kind: 'submission', timestamp: '2026-05-15T00:00:00.000Z' }),
      entry({ id: 'd', kind: 'submission', timestamp: '2026-05-15T00:00:00.000Z' }),
      entry({ id: 'c', kind: 'submission', timestamp: '2026-05-10T00:00:00.000Z' }),
    ]);
    expect(grouped.get('submission')?.map((e) => e.id)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('returns an empty map for empty entries', () => {
    expect([...groupAndSortHistory([]).keys()]).toEqual([]);
  });
});

describe('uniqueIssuerCount', () => {
  it('counts distinct issuer names', () => {
    expect(
      uniqueIssuerCount([
        entry({ id: '1', issuer: { name: 'Agency A' } }),
        entry({ id: '2', issuer: { name: 'Agency B' } }),
        entry({ id: '3', issuer: { name: 'Agency A' } }),
      ]),
    ).toBe(2);
  });

  it('returns 0 for empty', () => {
    expect(uniqueIssuerCount([])).toBe(0);
  });
});

describe('HistoryEntryItem render', () => {
  it('renders title + sender name + per-kind timestamp prefix (submission)', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem entry={entry({ id: '1', kind: 'submission', title: 'Benefits intake', timestamp: '2026-05-23T12:00:00.000Z', issuer: { name: 'Department of Benefits' } })} />
      </ul>,
    );
    expect(html).toContain('Benefits intake');
    expect(html).toContain('Department of Benefits');
    expect(html).toContain('Submission');
    expect(html).toContain('Submitted');
  });

  it('uses the draft timestamp prefix for kind=draft', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem entry={entry({ id: '1', kind: 'draft' })} />
      </ul>,
    );
    expect(html).toContain('Last edited');
  });

  it('uses the signed-record timestamp prefix for kind=signed-record', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem entry={entry({ id: '1', kind: 'signed-record' })} />
      </ul>,
    );
    expect(html).toContain('Signed');
  });

  it('renders a "Track this application" link when applicantStatusRef is set', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem
          entry={entry({
            id: '1',
            kind: 'submission',
            applicantStatusRef: 'urn:wos:case_demo_0001',
          })}
        />
      </ul>,
    );
    expect(html).toContain('Track this application');
    expect(html).toContain('/status?case=urn%3Awos%3Acase_demo_0001');
  });

  it('renders a "documents in your library" link when documentRefs is non-empty', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem
          entry={entry({
            id: '1',
            kind: 'signed-record',
            documentRefs: ['doc-a', 'doc-b'],
          })}
        />
      </ul>,
    );
    expect(html).toContain('2 saved documents');
    expect(html).toContain('href="/documents"');
  });

  it('suppresses both cross-route links when refs are absent', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem entry={entry({ id: '1', kind: 'submission' })} />
      </ul>,
    );
    expect(html).not.toContain('Track this application');
    expect(html).not.toContain('/documents');
  });

  it('uses singular "1 saved document" when documentRefs has exactly one ref', () => {
    const html = renderToStaticMarkup(
      <ul>
        <HistoryEntryItem entry={entry({ id: '1', kind: 'signed-record', documentRefs: ['only'] })} />
      </ul>,
    );
    expect(html).toContain('1 saved document');
  });
});
