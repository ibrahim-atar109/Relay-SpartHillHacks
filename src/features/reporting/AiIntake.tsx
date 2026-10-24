import { useState } from 'react';
import { Sparkles, ChevronDown, LockKeyhole, CircleCheck } from 'lucide-react';
import type { Incident } from '../../../shared/contracts';
import { aiConfigured, aiPasswordPending, aiSignedIn, setAiPassword, signInAi, signOutAi } from '../../services/ai';

export function AiIntake({ open, onOpenChange, busy, onCollect, onSessionChange }: { open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onCollect: (report: string, source: Incident['source']) => Promise<boolean>; onSessionChange: () => void }) {
  const [signedIn, setSignedIn] = useState(aiSignedIn());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [source, setSource] = useState<Incident['source']>('text');
  return <details id="report-intake" className="ai-intake" open={open} onToggle={e => onOpenChange(e.currentTarget.open)}>
    <summary><span className="intake-icon"><Sparkles size={19} /></span><span className="intake-title"><strong>A little clarity, from the first report.</strong><small>Collect a report with AI assistance</small></span><span className="intake-status">{aiSignedIn() ? <><CircleCheck size={14} />Signed in</> : <><LockKeyhole size={14} />{aiConfigured ? 'Sign in to AI' : 'Sample mode'}</>}</span><ChevronDown size={17} className="disclosure-chevron" /></summary>
    <div className="intake-body">
    {!aiConfigured ? <p>AI intake is not connected yet. You can review the sample reports below.</p> : <>
      {!signedIn || !aiSignedIn() ? <form className="ai-login" onSubmit={async event => {
        event.preventDefault(); setSigningIn(true); setError('');
        try {
          if (newPassword) { await setAiPassword(password); setSignedIn(true); setNewPassword(false); }
          else { const result = await signInAi(username.trim(), password); setNewPassword(result === 'new_password'); setSignedIn(result === 'signed_in'); }
          setPassword('');
          onSessionChange();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Sign-in failed.');
          if (newPassword && !aiPasswordPending()) { setNewPassword(false); setPassword(''); }
        }
        finally { setSigningIn(false); }
      }}>
        {!newPassword && <label className="field">Coordinator username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={signingIn} /></label>}
        <label className="field">{newPassword ? 'Choose a new password (12+ characters, uppercase, lowercase, number, symbol)' : 'Password'}<input type="password" autoComplete={newPassword ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={newPassword ? 12 : 1} required disabled={signingIn} /></label>
        <button className="button primary" disabled={signingIn}>{signingIn ? 'Signing in…' : newPassword ? 'Set password & sign in' : 'Sign in'}</button>
        {newPassword && <button type="button" className="button secondary" disabled={signingIn} onClick={() => { signOutAi(); setNewPassword(false); setSignedIn(false); setPassword(''); setError(''); onSessionChange(); }}>Back to sign in</button>}
      </form> : <div className="ai-session"><span><CircleCheck size={15} />You’re signed in for this session.</span><button className="button secondary" disabled={busy} onClick={() => { signOutAi(); setSignedIn(false); onSessionChange(); }}>Sign out</button></div>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {aiSignedIn() && <form onSubmit={async e => { e.preventDefault(); if (await onCollect(report.trim(), source)) setReport(''); }}>
        <label className="field">Report source<select value={source} onChange={e => setSource(e.target.value as Incident['source'])} disabled={busy}><option value="text">Text message</option><option value="voice">Pasted voice transcript</option><option value="form">Form submission</option></select></label>
        <label className="field">Original report<textarea value={report} onChange={e => setReport(e.target.value)} maxLength={8000} rows={3} required disabled={busy} placeholder="Northside shelter needs 4 supply totes of water for 16 people. Supplies are running low." /></label>
        <div className="ai-session"><p>AI organizes the details. You make the final check. Voice reports accept pasted transcripts.</p><button className="button primary" disabled={busy || !aiSignedIn() || !report.trim()}>{busy ? 'Organizing report…' : 'Create report'}</button></div>
      </form>}
    </>}
    </div>
  </details>;
}
