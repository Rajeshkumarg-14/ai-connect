import React from 'react';

export default function StartupScreen({ error, onRetry }) {
  return <main className="startup-screen" aria-busy={!error}>
    <div className="startup-content">
      <svg className={`startup-mark ${error ? '' : 'is-loading'}`} width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect x="5" y="5" width="13" height="13" rx="4" fill="currentColor"/><rect x="26" y="26" width="13" height="13" rx="4" fill="currentColor"/><path d="M27 17 17 27M28 5h7a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-9V9a4 4 0 0 1 4-4ZM9 26h9v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="2"/></svg>
      <h1>{error ? 'Unable to open your workspace' : 'Opening Connect'}</h1>
      <p role={error ? 'alert' : 'status'}>{error || 'Connecting to your local workspace…'}</p>
      {error && <button type="button" className="button primary" onClick={onRetry}>Try again</button>}
      <span className="startup-local">Your projects stay on this machine.</span>
    </div>
  </main>;
}
