/* global window, URL */
window.__FORMSPEC_RUNTIME_CONFIG__ = window.__FORMSPEC_RUNTIME_CONFIG__ ?? {};
// Local package previews keep submission connected to the real local service.
if (new URL(window.location.href).searchParams.has('package')) {
  window.__FORMSPEC_RUNTIME_DEFAULTS__ = {
    profileName: 'publicPortal',
    formspecServerUrl: 'http://127.0.0.1:18080',
    // The managed-single-cell scope: tenant-managed-single-cell/workspace-managed-single-cell/production.
    scopeKey: 'f2bd6e3633fab5e9d41e47d01671fd7c168f6603aebbbe0238b0192b46e6f482',
    attachmentMaxUploadBytes: 15728640,
  };
}

// Native signing requires complete deployment-supplied configuration, including
// the independently selected issuer and current purpose key. A URL never supplies trust.
