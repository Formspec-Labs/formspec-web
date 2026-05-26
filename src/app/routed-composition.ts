import { useEffect, useState } from 'react';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { chooseComposition } from './main-helpers.ts';
import { isFormRouteError, type FormRouteError } from './form-route.ts';
import { subscribeAppRouteTransitions } from './route-transition.ts';

export type RoutedCompositionState =
  | { status: 'ready'; href: string; composition: Composition }
  | { status: 'form-route-error'; href: string; error: FormRouteError };

export function bootCompositionForHref(
  href: string,
  config: FormspecWebConfig,
): RoutedCompositionState {
  try {
    return {
      status: 'ready',
      href,
      composition: chooseComposition({ href, config }),
    };
  } catch (error) {
    if (isFormRouteError(error)) {
      return { status: 'form-route-error', href, error };
    }
    throw error;
  }
}

export function useRoutedComposition(config: FormspecWebConfig): RoutedCompositionState {
  const [state, setState] = useState(() => bootCompositionForHref(window.location.href, config));

  useEffect(() => {
    return subscribeAppRouteTransitions(() => {
      setState(bootCompositionForHref(window.location.href, config));
    });
  }, [config]);

  return state;
}
