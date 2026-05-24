import { describe, expect, it } from 'vitest';
import type { RespondentObligation } from '../../src/ports/index.ts';
import {
  groupAndSortObligations,
  uniqueSenderCount,
} from '../../src/app/obligations-view.tsx';

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
