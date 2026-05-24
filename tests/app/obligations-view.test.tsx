import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { RespondentObligation } from '../../src/ports/index.ts';
import {
  groupAndSortObligations,
  ObligationItem,
  uniqueSenderCount,
} from '../../src/app/obligations-view.tsx';

/**
 * Fixture obligation used by the cross-surface DOM-parity assertion (MED-3).
 * Exported so both the dashboard test (obligations-runtime.test.tsx) and the
 * in-form panel test (respondent-runtime.test.tsx) can render the SAME input
 * and assert the rendered `<li>` matches the isolated render — locking out
 * drift if a future change inlines custom obligation markup in either surface.
 */
export const PARITY_FIXTURE_OBLIGATION: RespondentObligation = {
  id: 'parity-fixture',
  issuer: { name: 'Parity Sender' },
  title: 'Parity fixture obligation',
  state: 'due',
  dueAt: '2026-06-15T00:00:00.000Z',
};

/**
 * Renders ObligationItem in isolation and returns the resulting `<li>`
 * outerHTML. Surface tests import this to assert their rendered DOM contains
 * the SAME fragment, proving the shared component is the single source of
 * obligation markup (design §"shared obligations-view" + MED-3).
 */
export function renderParityFixture(): string {
  const { container } = render(<ObligationItem obligation={PARITY_FIXTURE_OBLIGATION} />);
  const li = container.querySelector('li.place-list__item');
  if (!li) throw new Error('ObligationItem did not render an <li class="place-list__item">');
  return li.outerHTML;
}

function makeObligation(overrides: Partial<RespondentObligation> = {}): RespondentObligation {
  return {
    id: overrides.id ?? 'x',
    issuer: overrides.issuer ?? { name: 'Sender A' },
    title: overrides.title ?? 'Title',
    state: overrides.state ?? 'upcoming',
    dueAt: overrides.dueAt,
    description: overrides.description,
    formRef: overrides.formRef,
    submissionRef: overrides.submissionRef,
    extensions: overrides.extensions,
  };
}

describe('groupAndSortObligations', () => {
  it('groups by section honoring the state taxonomy', () => {
    const grouped = groupAndSortObligations([
      makeObligation({ id: '1', state: 'due' }),
      makeObligation({ id: '2', state: 'upcoming' }),
      makeObligation({ id: '3', state: 'submitted' }),
      makeObligation({ id: '4', state: 'overdue' }),
      makeObligation({ id: '5', state: 'satisfied' }),
      makeObligation({ id: '6', state: 'closed' }),
      makeObligation({ id: '7', state: 'unknown' }),
    ]);
    expect(grouped.dueNow.map((x) => x.id).sort()).toEqual(['1', '4']);
    expect(grouped.upcoming.map((x) => x.id).sort()).toEqual(['2', '7']);
    expect(grouped.done.map((x) => x.id).sort()).toEqual(['3', '5', '6']);
  });

  it('sorts within a section: dueAt asc, undefined last, sender then title break ties', () => {
    const grouped = groupAndSortObligations([
      // explicit issuer names so the sort assertion is robust to default-fixture changes
      makeObligation({ id: 'a', state: 'upcoming', dueAt: undefined, issuer: { name: 'Beta' }, title: 'b' }),
      makeObligation({ id: 'b', state: 'upcoming', dueAt: '2026-07-01T00:00:00Z', issuer: { name: 'Alpha' }, title: 'a' }),
      makeObligation({ id: 'c', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z', issuer: { name: 'Alpha' }, title: 'a' }),
      makeObligation({ id: 'd', state: 'upcoming', dueAt: undefined, issuer: { name: 'Alpha' }, title: 'a' }),
      makeObligation({ id: 'e', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z', issuer: { name: 'Beta' }, title: 'b' }),
      makeObligation({ id: 'f', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z', issuer: { name: 'Beta' }, title: 'a' }),
    ]);
    // c (jun-01, Alpha, a) < f (jun-01, Beta, a) < e (jun-01, Beta, b) < b (jul-01) < d (undefined, Alpha) < a (undefined, Beta)
    expect(grouped.upcoming.map((x) => x.id)).toEqual(['c', 'f', 'e', 'b', 'd', 'a']);
  });

  it('returns empty groups for empty input', () => {
    const grouped = groupAndSortObligations([]);
    expect(grouped.dueNow).toEqual([]);
    expect(grouped.upcoming).toEqual([]);
    expect(grouped.done).toEqual([]);
  });
});

describe('ObligationItem isolated render (MED-3 — DOM-parity anchor)', () => {
  afterEach(() => cleanup());

  it('renders a stable <li class="place-list__item"> with title, state pill, sender, and due date', () => {
    const html = renderParityFixture();
    // Inline structural assertions (grep-friendly; no snapshot file). Each
    // assertion pins one structural fact the surface tests below replay.
    expect(html).toContain('<li class="place-list__item">');
    expect(html).toContain('<strong>Parity fixture obligation</strong>');
    expect(html).toContain('place-pill place-pill--due');
    expect(html).toContain('>Due<'); // labelFromToken('due')
    expect(html).toContain('<p>Parity Sender</p>');
    // Due date is formatted (locale-stable substring check; the year is enough
    // to prove the dueAt path ran without locking in a specific format).
    expect(html).toContain('2026');
    // Ends with closing `</li>` (no trailing junk).
    expect(html.trim().endsWith('</li>')).toBe(true);
  });

  it('omits the due date paragraph when the fixture has no dueAt', () => {
    const noDue: RespondentObligation = { ...PARITY_FIXTURE_OBLIGATION, dueAt: undefined };
    const { container } = render(<ObligationItem obligation={noDue} />);
    const li = container.querySelector('li.place-list__item');
    expect(li).not.toBeNull();
    expect(li!.innerHTML).not.toContain('<small>');
  });
});

describe('uniqueSenderCount', () => {
  it('counts distinct issuer names', () => {
    expect(
      uniqueSenderCount([
        makeObligation({ id: '1', issuer: { name: 'A' } }),
        makeObligation({ id: '2', issuer: { name: 'A' } }),
        makeObligation({ id: '3', issuer: { name: 'B' } }),
      ]),
    ).toBe(2);
  });

  it('returns 0 on empty', () => {
    expect(uniqueSenderCount([])).toBe(0);
  });
});
