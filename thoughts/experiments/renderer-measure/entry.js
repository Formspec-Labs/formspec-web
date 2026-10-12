const params = new URLSearchParams(location.search);
const arm = params.get('arm') || 'react';
window.probe = { arm, case: params.get('case') || 'ds82', locale: params.get('locale') || 'en', status: 'loading' };
document.documentElement.lang = window.probe.locale;
try { arm === 'react' ? await import('./react-arm.jsx') : await import('./wc-arm.js'); } catch (e) { window.probe.status = 'failed'; window.probe.error = String(e.stack || e); console.error(e); }
