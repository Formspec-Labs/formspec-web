import { useEffect, useId, useState } from 'react';
import type { FormspecWebConfig } from '../config/types.ts';
import type { Composition } from '../composition/types.ts';
import type {
  ReviewThread,
  ReviewThreadEvent,
  ReviewThreadFieldSnapshot,
} from '../ports/review-thread-store.ts';
import type { ReviewerSessionRedeemResult } from '../ports/reviewer-session.ts';
import type { ReviewerRouteParams } from './trusted-reviewer.ts';
import {
  formatReviewDraftValue,
  reviewAttestationStatus,
} from './trusted-reviewer.ts';

interface ReviewerRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: ReviewerRouteParams;
}

type ReviewerState =
  | { status: 'loading' }
  | { status: 'ready'; grant: ReviewerSessionRedeemResult; thread: ReviewThread }
  | { status: 'error'; error: unknown };

type DraftEventState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; error: unknown };

export function ReviewerRuntime({
  composition,
  config,
  route,
}: ReviewerRuntimeProps) {
  const [state, setState] = useState<ReviewerState>({ status: 'loading' });
  const [displayName, setDisplayName] = useState('');
  const [fieldPointer, setFieldPointer] = useState('/data');
  const [commentBody, setCommentBody] = useState('');
  const [suggestionValue, setSuggestionValue] = useState('');
  const [eventState, setEventState] = useState<DraftEventState>({ status: 'idle' });
  const reviewerNameId = useId();
  const fieldPointerId = useId();
  const commentId = useId();
  const suggestionId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      const grant = await composition.reviewerSession.redeem({
        capabilityUrl: route.capabilityUrl,
      });
      if (grant.threadId !== route.threadId) {
        throw new Error('This review link is not valid for the requested thread.');
      }
      const thread = await composition.reviewThreadStore.read({
        threadId: grant.threadId,
        sessionToken: grant.sessionToken,
      });
      if (!cancelled) {
        setState({ status: 'ready', grant, thread });
      }
    })().catch((error: unknown) => {
      if (!cancelled) setState({ status: 'error', error });
    });
    return () => {
      cancelled = true;
    };
  }, [composition, route.capabilityUrl, route.threadId]);

  const refreshThread = async (
    threadId: string,
    sessionToken: ReviewerSessionRedeemResult['sessionToken'],
  ): Promise<void> => {
    const thread = await composition.reviewThreadStore.read({ threadId, sessionToken });
    setState((current) => (
      current.status === 'ready' ? { ...current, thread } : current
    ));
  };

  const appendReviewerEvent = async (
    grant: ReviewerSessionRedeemResult,
    payload: ReviewThreadEvent['payload'],
  ): Promise<void> => {
    setEventState({ status: 'saving' });
    try {
      await composition.reviewThreadStore.appendEvent({
        threadId: grant.threadId,
        sessionToken: grant.sessionToken,
        author: {
          kind: 'reviewer',
          shareId: grant.shareId,
          displayName: displayName.trim() || grant.audienceHint || 'Reviewer',
        },
        payload,
      });
      await refreshThread(grant.threadId, grant.sessionToken);
      setEventState({ status: 'saved' });
    } catch (error) {
      setEventState({ status: 'error', error });
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="submit-notice" role="status">
        Loading review
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="shell__status shell__status--error" role="alert">
        <h1 id="respondent-title">Review link unavailable</h1>
        <p>{messageForError(state.error)}</p>
      </div>
    );
  }

  const canSuggest = state.grant.grantedScope === 'view+comment+suggest';
  const draftFields = state.thread.draftSnapshot?.fields ?? [];
  const selectedField = draftFields.find((field) => field.fieldPointer === fieldPointer)
    ?? draftFields[0];
  const selectedFieldPointer = selectedField?.fieldPointer ?? fieldPointer;
  const canSuggestSelectedField = canSuggest && !selectedField?.respondentOnly;

  return (
    <section className="reviewer-shell" aria-labelledby="respondent-title">
      <header className="respondent-header respondent-header--unbranded">
        <p className="respondent-header__kicker">{config.brand.name}</p>
        <h1 id="respondent-title">Review draft</h1>
        <p>Draft review only. Receipt reviewer trace is not attached.</p>
      </header>

      <div className="reviewer-shell__summary" aria-live="polite">
        <span>{state.grant.grantedScope}</span>
        <span>{reviewAttestationStatus(state.thread)}</span>
      </div>

      <ReviewDraftSnapshot
        fields={draftFields}
        selectedField={selectedField}
        selectedFieldPointer={selectedFieldPointer}
        fallbackFieldPointer={fieldPointer}
        fieldPointerId={fieldPointerId}
        onSelectField={setFieldPointer}
      />

      <div className="reviewer-shell__controls">
        <label htmlFor={reviewerNameId}>Your name</label>
        <input
          id={reviewerNameId}
          value={displayName}
          autoComplete="name"
          onChange={(event) => setDisplayName(event.currentTarget.value)}
        />
        <label htmlFor={commentId}>Comment</label>
        <textarea
          id={commentId}
          value={commentBody}
          rows={3}
          onChange={(event) => setCommentBody(event.currentTarget.value)}
        />
        <button
          type="button"
          disabled={commentBody.trim().length === 0 || eventState.status === 'saving'}
          onClick={() => {
            void appendReviewerEvent(state.grant, {
              type: 'comment-added',
              anchor: {
                fieldPointer: selectedFieldPointer,
                valueHashAtAnchor: selectedField?.valueHashAtSnapshot,
              },
              body: commentBody,
            }).then(() => setCommentBody(''));
          }}
        >
          Add comment
        </button>
        {canSuggestSelectedField ? (
          <>
            <label htmlFor={suggestionId}>Suggestion</label>
            <input
              id={suggestionId}
              value={suggestionValue}
              onChange={(event) => setSuggestionValue(event.currentTarget.value)}
            />
            <button
              type="button"
              disabled={suggestionValue.trim().length === 0 || eventState.status === 'saving'}
              onClick={() => {
                void appendReviewerEvent(state.grant, {
                  type: 'suggestion-added',
                  anchor: {
                    fieldPointer: selectedFieldPointer,
                    valueHashAtAnchor: selectedField?.valueHashAtSnapshot,
                  },
                  proposedValue: suggestionValue,
                }).then(() => setSuggestionValue(''));
              }}
            >
              Add suggestion
            </button>
          </>
        ) : null}
      </div>

      <ReviewThreadEvents events={state.thread.events} />
      {eventState.status === 'error' ? (
        <div className="submit-notice submit-notice--error" role="alert">
          {messageForError(eventState.error)}
        </div>
      ) : eventState.status === 'saved' ? (
        <div className="submit-notice" role="status">
          Review saved
        </div>
      ) : null}
    </section>
  );
}

function ReviewDraftSnapshot({
  fallbackFieldPointer,
  fieldPointerId,
  fields,
  onSelectField,
  selectedField,
  selectedFieldPointer,
}: {
  fallbackFieldPointer: string;
  fieldPointerId: string;
  fields: readonly ReviewThreadFieldSnapshot[];
  onSelectField: (fieldPointer: string) => void;
  selectedField: ReviewThreadFieldSnapshot | undefined;
  selectedFieldPointer: string;
}) {
  if (fields.length === 0) {
    return (
      <div className="reviewer-shell__draft">
        <p className="place-list__empty">No draft snapshot is attached to this review thread.</p>
        <label htmlFor={fieldPointerId}>Field anchor</label>
        <input
          id={fieldPointerId}
          value={fallbackFieldPointer}
          onChange={(event) => onSelectField(event.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <div className="reviewer-shell__draft">
      <div className="reviewer-shell__field-picker">
        <label htmlFor={fieldPointerId}>Field anchor</label>
        <select
          id={fieldPointerId}
          value={selectedFieldPointer}
          onChange={(event) => onSelectField(event.currentTarget.value)}
        >
          {fields.map((field) => (
            <option key={field.fieldPointer} value={field.fieldPointer}>
              {field.label}
            </option>
          ))}
        </select>
      </div>
      {selectedField ? (
        <div className="reviewer-shell__field-snapshot" aria-live="polite">
          <strong>{selectedField.label}</strong>
          <span>{selectedField.fieldPointer}</span>
          <p>
            {selectedField.respondentOnly
              ? 'Respondent-only field. Value hidden from reviewers.'
              : formatReviewDraftValue(selectedField.value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewThreadEvents({ events }: { events: readonly ReviewThreadEvent[] }) {
  if (events.length === 0) {
    return <p className="place-list__empty">No review notes yet</p>;
  }
  return (
    <ol className="reviewer-shell__events">
      {events.map((event) => (
        <li key={event.eventId}>
          <strong>{event.payload.type}</strong>
          <span>{event.author.kind}</span>
        </li>
      ))}
    </ol>
  );
}

function messageForError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'This review link could not be opened.';
}
