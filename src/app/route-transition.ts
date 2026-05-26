import { FORMSPEC_ROUTE_TRANSITION_EVENT } from '../shared/route-transition.ts';

export { FORMSPEC_ROUTE_TRANSITION_EVENT };

export interface NavigateAppRouteOptions {
  replace?: boolean;
  state?: unknown;
}

export function navigateAppRoute(to: string | URL, options: NavigateAppRouteOptions = {}): URL {
  const url = new URL(String(to), window.location.href);
  if (options.replace) {
    window.history.replaceState(options.state ?? null, '', url);
  } else {
    window.history.pushState(options.state ?? null, '', url);
  }
  window.dispatchEvent(new Event(FORMSPEC_ROUTE_TRANSITION_EVENT));
  return url;
}

export function subscribeAppRouteTransitions(listener: () => void): () => void {
  const eventListener = () => listener();
  window.addEventListener(FORMSPEC_ROUTE_TRANSITION_EVENT, eventListener);
  window.addEventListener('popstate', eventListener);
  return () => {
    window.removeEventListener(FORMSPEC_ROUTE_TRANSITION_EVENT, eventListener);
    window.removeEventListener('popstate', eventListener);
  };
}
