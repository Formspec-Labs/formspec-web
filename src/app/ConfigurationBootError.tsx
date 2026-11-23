import { useEffect } from 'react';

export function ConfigurationBootError() {
  useEffect(() => { document.getElementById('formspec-static-shell')?.remove(); }, []);
  return <main className="shell">
    <div className="shell__inner" role="alert">
      <h1>This site is not ready.</h1>
      <p>Contact the organization that provided this form.</p>
    </div>
  </main>;
}
