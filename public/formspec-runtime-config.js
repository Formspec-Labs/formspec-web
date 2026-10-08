/* global window, URL */
window.__FORMSPEC_RUNTIME_CONFIG__ = window.__FORMSPEC_RUNTIME_CONFIG__ ?? {};
// Local package previews keep submission connected to the real local service.
if (new URL(window.location.href).searchParams.has('package')) {
  window.__FORMSPEC_RUNTIME_DEFAULTS__ = {
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
    attachmentMaxUploadBytes: 15728640,
  };
}

// Activate only the exact published native package selection.
const nativeSelection = new URL(window.location.href).searchParams;
const nativePackageVersion = new Map([
  ['/demo-packages/d1-passport/v0.1.5/package.json', '0.1.5'],
  ['/demo-packages/d1-passport/v0.1.6/package.json', '0.1.6'],
]).get(nativeSelection.get('package'));
if (nativeSelection.get('form') === 'form_d1_passport_001' && nativePackageVersion) {
  window.__FORMSPEC_RUNTIME_CONFIG__ = {
    nativePackageSigning: {
      "keyId": "formspec-local-oidc-response-20261008-v1",
      "definition": {
        "url": "urn:formspec:demo:d1:passport-renewal",
        "version": nativePackageVersion
      },
      "bundle": {
        "id": "urn:formspec:demo:d1:signing-app",
        "version": nativePackageVersion
      },
      "module": {
        "id": "x-demo-signing",
        "version": "0.1.0"
      },
      "initialLocale": "en",
      "roles": {
        "saveInitial": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "save-draft-initial"
        },
        "saveOwned": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "save-draft-owned"
        },
        "prepare": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "prepare"
        },
        "sign": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "sign"
        },
        "submit": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "submit"
        },
        "paper": {
          "artifactRef": "urn:formspec:demo:d1:signing-app:response-actions",
          "actionRef": "paper"
        }
      },
      "bindings": {
        "definition": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:review-definition"
        },
        "response": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-response"
        },
        "presentation": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:review-presentation"
        },
        "review": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-review"
        },
        "content": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-content"
        },
        "draft": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-draft"
        },
        "actor": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-actor"
        },
        "signingResult": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-result"
        },
        "actionLabels": {
          "catalogRef": "urn:formspec:demo:d1:signing-app:data-sources",
          "sourceRef": "host:signing-action-labels"
        }
      },
      "readiness": {
        "instance": "draftReadiness",
        "readyPath": "ready",
        "ownedPath": "owned"
      }
    },
    ...window.__FORMSPEC_RUNTIME_CONFIG__,
  };
}
