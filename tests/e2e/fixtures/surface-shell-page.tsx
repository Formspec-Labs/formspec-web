import { createRoot } from 'react-dom/client';
import {
  composeSurfaceApp,
  dereferenceBundleExport,
  routeHref,
  type BundleExport,
} from '@formspec-org/surface';
import { SurfaceApp } from '@formspec-org/surface-react';
import '@formspec-org/surface-react/formspec-surface.css';

const SECONDARY_SURFACE =
  'https://example.gov/surfaces/reordered-secondary';
const SELECTED_SURFACE =
  'https://example.gov/surfaces/reordered-selected';
const transparentPixel =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

const bundle = dereferenceBundleExport({
  manifest: {
    $formspecBundle: '2.4',
    id: 'https://example.gov/apps/surface-shell-e2e',
    title: 'Surface shell fixture',
    surfaces: [
      { url: SECONDARY_SURFACE },
      { url: SELECTED_SURFACE },
    ],
    entrySurface: SELECTED_SURFACE,
  },
  documents: {
    [SECONDARY_SURFACE]: {
      $formspecSurface: '0.2',
      id: 'secondary',
      title: 'Secondary surface',
      entry: 'wrong-first',
      routes: [{
        id: 'wrong-first',
        path: '/wrong-first',
        title: 'Wrong manifest-order entry',
        slots: [{
          id: 'wrong-copy',
          slotType: 'static-content',
          binding: { kind: 'text', content: 'Wrong surface sentinel' },
        }],
      }],
    },
    [SELECTED_SURFACE]: {
      $formspecSurface: '0.2',
      id: 'selected',
      title: 'Selected surface',
      entry: 'selected-entry',
      routes: [{
        id: 'selected-entry',
        path: '/selected-entry',
        title: 'Selected explicit entry',
        slots: [
          {
            id: 'meaningful-image',
            title: 'Program office',
            slotType: 'static-content',
            binding: {
              kind: 'image',
              content: 'asset:program-office',
              alt: 'Benefits specialist helping an applicant',
            },
          },
          {
            id: 'decorative-image',
            slotType: 'static-content',
            binding: {
              kind: 'image',
              content: 'asset:decorative-divider',
              alt: '',
            },
          },
        ],
      }],
    },
  },
} satisfies BundleExport);

const app = composeSurfaceApp(bundle.surfaces, {
  entrySurface: bundle.entrySurface,
});
const entryHref = app.entry ? routeHref(app.entry).href : '/no-entry';
document.body.dataset.entryHref = entryHref;

const root = document.getElementById('root');
if (!root) throw new Error('Fixture root is missing');

createRoot(root).render(
  <SurfaceApp
    bundle={bundle}
    location={entryHref}
    onNavigate={() => undefined}
    staticAssetResolver={({ source }) => ({
      status: 'admitted',
      source: `${transparentPixel}#${encodeURIComponent(source)}`,
    })}
  />,
);
