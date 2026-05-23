import type { FormspecWebConfig } from '../config/types.ts';
import { useComposition } from './hooks/useComposition.ts';

/**
 * Scaffold placeholder. FW-0016 acceptance: the shell mounts, the Composition
 * is reachable, the boundary discipline holds.
 *
 * FW-0001 (end-to-end thin-slice) replaces this placeholder with the real
 * respondent renderer consuming `@formspec-org/react`'s <FormspecProvider> +
 * <FormspecForm /> bound to the wired ports.
 */
interface AppProps {
  config: FormspecWebConfig;
}

export function App({ config }: AppProps) {
  const composition = useComposition();
  const ports = [
    ['DefinitionSource', Boolean(composition.definitionSource)],
    ['DraftStore', Boolean(composition.draftStore)],
    ['SubmitTransport', Boolean(composition.submitTransport)],
    ['IdentityProvider', Boolean(composition.identityProvider)],
    ['NotificationDelivery', Boolean(composition.notificationDelivery)],
  ] as const;

  return (
    <main className="shell" aria-labelledby="shell-title">
      <div className="shell__inner">
        <header className="shell__header">
          <p className="shell__eyebrow">Public reference UI</p>
          <h1 id="shell-title" className="shell__title">
            Formspec Web
          </h1>
          <p className="shell__summary">
            Respondent-facing shell for Formspec deployments, built around audited ports,
            isolated branding, and adapter conformance.
          </p>
        </header>

        <div className="shell__grid">
          <section className="shell__panel shell__panel--primary" aria-labelledby="ports-title">
            <h2 id="ports-title" className="shell__section-title">
              Composition Boundary
            </h2>
            <p className="shell__text">
              The current scaffold is wired through the same five MVP ports the production
              renderer will use.
            </p>
            <ul className="shell__ports" aria-label="Wired MVP ports">
              {ports.map(([name, enabled]) => (
                <li className="shell__port" key={name}>
                  {name}: {enabled ? 'wired' : 'missing'}
                </li>
              ))}
            </ul>
          </section>

          <section className="shell__panel shell__panel--secondary" aria-labelledby="posture-title">
            <h2 id="posture-title" className="shell__section-title">
              Deployment Posture
            </h2>
            <dl className="shell__meta">
              <div className="shell__meta-row">
                <dt>Active brand</dt>
                <dd>{config.brand.name}</dd>
              </div>
              <div className="shell__meta-row">
                <dt>Profile</dt>
                <dd>{config.profileName}</dd>
              </div>
              <div className="shell__meta-row">
                <dt>Runtime</dt>
                <dd>Static Vite bundle</dd>
              </div>
              <div className="shell__meta-row">
                <dt>Architecture</dt>
                <dd>Hexagonal shell</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
