import type { ReviewerRouteParams } from './trusted-reviewer.ts';

export type { ReviewerRouteParams } from './trusted-reviewer.ts';

export function parseReviewerRoute(href: string): ReviewerRouteParams | null {
  const url = new URL(href);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'r' || segments.length < 3) {
    return null;
  }
  const threadId = decodeURIComponent(segments[1]);
  const capabilityUrl = url.href;
  return { threadId, capabilityUrl };
}
