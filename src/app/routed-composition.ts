import type { IdentityBinding } from '../composition/default.ts';
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
  identityBindingFactory?: () => IdentityBinding,
): RoutedCompositionState {
  try {
    return {
      status: 'ready',
      href,
      composition: chooseComposition({ href, config, identityBindingFactory }),
    };
  } catch (error) {
    if (isFormRouteError(error)) {
      return { status: 'form-route-error', href, error };
    }
    throw error;
  }
}

export function useRoutedComposition(config: FormspecWebConfig, identityBindingFactory?: () => IdentityBinding): RoutedCompositionState {
  const [state, setState] = useState(() => bootCompositionForHref(window.location.href, config, identityBindingFactory));

  useEffect(() => {
    return subscribeAppRouteTransitions(() => {
      setState(bootCompositionForHref(window.location.href, config, identityBindingFactory));
    });
  }, [config, identityBindingFactory]);

  return state;
}
