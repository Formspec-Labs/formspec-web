/**
 * Shared obligations render helpers (FW-0055 slice 1).
 *
 * Consumed by:
 *   - `RespondentPlacePanel.ObligationItem` inside `RespondentRuntime` (in-form context).
 *   - `ObligationsRuntime` at `/obligations` (standalone dashboard).
 *
 * Per design §"Cross-sender framing": sort within section by dueAt asc
 * (undefined last); ties broken by sender then title. Section grouping pins
 * the obligation-state taxonomy from `respondent-place-source.ts`.
 */

import type { RespondentObligation } from '../ports/index.ts';
import { formatDate, labelFromToken, slugToken } from './format.ts';

export interface GroupedObligations {
  dueNow: RespondentObligation[];
  upcoming: RespondentObligation[];
  done: RespondentObligation[];
}

export function groupAndSortObligations(
  obligations: readonly RespondentObligation[],
): GroupedObligations {
  const dueNow: RespondentObligation[] = [];
  const upcoming: RespondentObligation[] = [];
  const done: RespondentObligation[] = [];
  for (const o of obligations) {
    if (o.state === 'due' || o.state === 'overdue') {
      dueNow.push(o);
    } else if (o.state === 'submitted' || o.state === 'satisfied' || o.state === 'closed') {
      done.push(o);
    } else {
      // 'upcoming' and 'unknown' both surface in the forward-looking section.
      upcoming.push(o);
    }
  }
  return {
    dueNow: dueNow.sort(byDueThenSenderThenTitle),
    upcoming: upcoming.sort(byDueThenSenderThenTitle),
    done: done.sort(byDueThenSenderThenTitle),
  };
}

export function uniqueSenderCount(obligations: readonly RespondentObligation[]): number {
  const names = new Set<string>();
  for (const o of obligations) {
    names.add(o.issuer.name);
  }
  return names.size;
}

function byDueThenSenderThenTitle(a: RespondentObligation, b: RespondentObligation): number {
  const aDue = a.dueAt;
  const bDue = b.dueAt;
  if (aDue === undefined && bDue !== undefined) return 1;
  if (aDue !== undefined && bDue === undefined) return -1;
  if (aDue !== undefined && bDue !== undefined && aDue !== bDue) {
    return aDue < bDue ? -1 : 1;
  }
  const senderCmp = a.issuer.name.localeCompare(b.issuer.name);
  if (senderCmp !== 0) return senderCmp;
  return a.title.localeCompare(b.title);
}

export function ObligationItem({ obligation }: { obligation: RespondentObligation }) {
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{obligation.title}</strong>
        <span className={`place-pill place-pill--${slugToken(obligation.state)}`}>
          {labelFromToken(obligation.state)}
        </span>
      </div>
      <p>{obligation.issuer.name}</p>
      {obligation.dueAt ? <small>Due {formatDate(obligation.dueAt)}</small> : null}
    </li>
  );
}
