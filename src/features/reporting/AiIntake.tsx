import { useState } from 'react';
import type { Incident } from '../../../shared/contracts';
import { aiConfigured, aiSignedIn, setAiPassword, signInAi, signOutAi } from '../../services/ai';

export function AiIntake({ busy, onCollect, onSessionChange }: { busy: boolean; onCollect: (report: string, source: Incident['source']) => Promise<boolean>; onSessionChange: () => void }) {
  const [signedIn, setSignedIn] = useState(aiSignedIn());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [source, setSource] = useState<Incident['source']>('text');
  return <section className="ai-intake" aria-label="Bedrock report collection">
    <div className="section-kicker">AMAZON BEDROCK · REPORT INTAKE</div>
    <h2>Turn a report into a request for review.</h2>
    {!aiConfigured ? <p>Bedrock setup is pending. Add the backend’s API URL, AWS Region and Cognito client ID to the Amplify environment, then rebuild. The scenario below works while setup is pending.</p> : <>
      {!signedIn || !aiSignedIn() ? <form className="ai-login" onSubmit={async event => {
        event.preventDefault(); setSigningIn(true); setError('');
        try {
          if (newPassword) { await setAiPassword(password); setSignedIn(true); setNewPassword(false); }
          else { const result = await signInAi(username.trim(), password); setNewPassword(result === 'new_password'); setSignedIn(result === 'signed_in'); }
          setPassword('');
          onSessionChange();
        } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
        finally { setSigningIn(false); }
      }}>
        {!newPassword && <label className="field">Coordinator username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={signingIn} /></label>}
        <label className="field">{newPassword ? 'Choose a new password (12+ characters, uppercase, lowercase, number, symbol)' : 'Password'}<input type="password" autoComplete={newPassword ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={newPassword ? 12 : 1} required disabled={signingIn} /></label>
        <button className="button secondary" disabled={signingIn}>{signingIn ? 'Signing in…' : newPassword ? 'Set password & sign in' : 'Sign in to AI features'}</button>
      </form> : <div className="ai-session"><span>Coordinator signed in · session stays in this tab</span><button className="button secondary" disabled={busy} onClick={() => { signOutAi(); setSignedIn(false); onSessionChange(); }}>Sign out</button></div>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <form onSubmit={async e => { e.preventDefault(); if (await onCollect(report.trim(), source)) setReport(''); }}>
        <label className="field">Report source<select value={source} onChange={e => setSource(e.target.value as Incident['source'])} disabled={busy}><option value="text">Text message</option><option value="voice">Pasted voice transcript</option><option value="form">Form submission</option></select></label>
        <label className="field">Original report<textarea value={report} onChange={e => setReport(e.target.value)} maxLength={8000} rows={3} required disabled={busy} placeholder="Northside shelter needs 4 supply totes of water for 16 people. Supplies are running low." /></label>
        <div className="ai-session"><p>Bedrock extracts fields and follow-up questions. Review the source before verifying. Voice input accepts a transcript; it does not record audio.</p><button className="button primary" disabled={busy || !aiSignedIn() || !report.trim()}>{busy ? 'Working…' : 'Extract with Bedrock'}</button></div>
      </form>
    </>}
  </section>;
}
