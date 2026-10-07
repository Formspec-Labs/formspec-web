/* global window, URL */
window.__FORMSPEC_RUNTIME_CONFIG__ = window.__FORMSPEC_RUNTIME_CONFIG__ ?? {};
// Local package previews keep submission connected to the real local service.
if (new URL(window.location.href).searchParams.has('package')) {
  window.__FORMSPEC_RUNTIME_CONFIG__ = {
    profileName: 'publicPortal',
    formspecServerUrl: 'http://127.0.0.1:18080',
    tenantBinding: {
      kind: 'bound',
      scope: {
        tenant: 'tenant_managed_single_cell',
        workspace: 'workspace_managed_single_cell',
        environment: 'environment_production',
        cell: 'cell_primary',
      },
    },
    ...window.__FORMSPEC_RUNTIME_CONFIG__,
    attachmentMaxUploadBytes: 15728640,
  };
}
