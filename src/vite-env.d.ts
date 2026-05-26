/// <reference types="vite/client" />

import type { RuntimeConfig } from './config/types.ts';

declare global {
  interface Window {
    __FORMSPEC_RUNTIME_CONFIG__?: RuntimeConfig;
  }

  interface ImportMetaEnv {
    readonly VITE_FORMSPEC_WEB_PROFILE?: string;
    readonly VITE_FORMSPEC_WEB_SERVER_URL?: string;
    readonly VITE_FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL?: string;
    readonly VITE_FORMSPEC_WEB_OIDC_ISSUER?: string;
    readonly VITE_FORMSPEC_WEB_OIDC_CLIENT_ID?: string;
    readonly VITE_FORMSPEC_WEB_OIDC_REDIRECT_URI?: string;
    readonly VITE_FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH?: string;
  }
}
