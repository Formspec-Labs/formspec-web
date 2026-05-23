import { useComposition } from './hooks/useComposition.ts';

/**
 * Scaffold placeholder. FW-0016 acceptance: the shell mounts, the Composition
 * is reachable, the boundary discipline holds.
 *
 * FW-0001 (end-to-end thin-slice) replaces this placeholder with the real
 * respondent renderer consuming `@formspec-org/react`'s <FormspecProvider> +
 * <FormspecForm /> bound to the wired ports.
 */
export function App() {
  const composition = useComposition();
  const portNames = Object.keys(composition).filter(
    (k) => composition[k as keyof typeof composition] !== undefined,
  );
  return (
    <main>
      <h1>formspec-web</h1>
      <p>Hexagonal scaffold per web ADR-0009.</p>
      <p>
        Wired ports: <code>{portNames.join(', ')}</code>
      </p>
    </main>
  );
}
