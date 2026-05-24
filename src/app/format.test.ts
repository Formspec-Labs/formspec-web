import { describe, expect, it } from 'vitest';
import { formatDuration, labelFromToken, slugToken } from './format.ts';

describe('formatDuration', () => {
  it('< 1 minute → "less than a minute"', () => {
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-23T12:00:30.000Z')).toBe(
      'less than a minute',
    );
  });

  it('rounds to whole minutes under 1 hour', () => {
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-23T12:30:00.000Z')).toBe(
      '30 minutes',
    );
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-23T12:01:00.000Z')).toBe(
      '1 minute',
    );
  });

  it('rounds to whole hours under 1 day', () => {
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-23T13:00:00.000Z')).toBe('1 hour');
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-23T15:00:00.000Z')).toBe('3 hours');
  });

  it('rounds to whole days for >= 1 day', () => {
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-25T12:00:00.000Z')).toBe('2 days');
    expect(formatDuration('2026-05-23T12:00:00.000Z', '2026-05-24T12:00:00.000Z')).toBe('1 day');
  });

  it('handles invalid timestamps by returning empty string', () => {
    expect(formatDuration('not-a-date', '2026-05-23T12:00:00.000Z')).toBe('');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration('2026-05-23T13:00:00.000Z', '2026-05-23T12:00:00.000Z')).toBe(
      'less than a minute',
    );
  });
});

describe('labelFromToken', () => {
  it('title-cases dashed tokens', () => {
    expect(labelFromToken('applicant-task-submitted')).toBe('Applicant Task Submitted');
    expect(labelFromToken('case-created')).toBe('Case Created');
  });
});

describe('slugToken', () => {
  it('lowercases + dashes', () => {
    expect(slugToken('Open Tasks')).toBe('open-tasks');
  });
});
