import { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, Plus, Search, Users, ChevronDown, FlaskConical } from 'lucide-react';
import type { Board, Incident, IncidentAction } from '../shared/contracts';
import { aiConfigured } from './services/ai';
import { AiIntake } from './features/reporting/AiIntake';
import { api, isDemo } from './services/api';
import { OperationsMap } from './features/map/OperationsMap';
import { IncidentQueue } from './features/incidents/IncidentQueue';
import { IncidentDetail } from './features/incidents/IncidentDetail';
import { PlanPanel } from './features/operations/PlanPanel';

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('REQ-1042');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [, setAuthRevision] = useState(0);
  const select = useCallback((id: string) => setSelectedId(id), []);
  useEffect(() => { api.getBoard().then(setBoard).catch(err => setError(err.message)); }, []);
  async function run(operation: () => Promise<Board>) {
    setBusy(true); setError('');
    try { setBoard(await operation()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  async function collectReport(report: string, source: Incident['source']) {
    setBusy(true); setError('');
    try {
      const next = await api.collectReport(report, source);
      setBoard(next); setSelectedId(next.incidents[next.incidents.length - 1].id); setFilter('all'); setSearch('');
      setIntakeOpen(false);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Report collection failed.'); return false; }
    finally { setBusy(false); }
  }
  const onAction = (id: string, action: IncidentAction) => { void run(() => api.act(id, action)); };
  const incidents = board?.incidents || [];
  const visible = incidents.filter(item => (filter === 'all' || item.status === filter) && `${item.title} ${item.id} ${item.location.label}`.toLowerCase().includes(search.toLowerCase()));
  const selected = incidents.find(item => item.id === selectedId);
  const mapped = incidents.filter(item => item.status !== 'needs_review');
  const available = board?.teams.filter(team => team.status === 'available').length || 0;
  return <div className="app-shell">
    <main>
      <header className="topbar"><a className="wordmark" href="#overview" aria-label="Relay home"><span className="brand-mark"><Radio size={23} /></span>relay<span className="brand-divider" /><small>Community response</small></a><div className="header-right"><nav className="topnav" aria-label="Workspace"><a href="#reports">Reports</a><a href="#routes">Routes</a></nav><span className="mode"><span className="live-dot" />{isDemo ? 'Demo workspace' : 'Connected workspace'}</span><span className="avatar" title="Coordinator"><Users size={17} /></span></div></header>
      <div className="page-heading" id="overview"><div><div className="eyebrow">SAN JOSÉ · RELIEF OPERATIONS</div><h1>Every response starts here.</h1><p>A clear view of your community. A thoughtful plan for what’s next.</p></div><div className="heading-actions">
        <button className="button secondary" disabled={busy} onClick={() => { select('REQ-1042'); setFilter('all'); setSearch(''); void run(() => isDemo ? api.reset() : api.getBoard()); }}><RefreshCw size={15} />{isDemo ? 'Reset scenario' : 'Refresh'}</button>
        {isDemo && <button className="button primary" aria-expanded={intakeOpen} aria-controls="report-intake" onClick={() => setIntakeOpen(value => !value)}><Plus size={17} />New report</button>}
      </div></div>
      {isDemo && <AiIntake open={intakeOpen} onOpenChange={setIntakeOpen} busy={busy} onCollect={collectReport} onSessionChange={() => setAuthRevision(value => value + 1)} />}
      <div className="pipeline-steps" aria-label="Approval pipeline">
        <div className={mapped.length ? 'complete' : 'current'}><span>1</span><strong>Review reports</strong><small>{incidents.filter(item => item.status === 'needs_review').length} to review</small></div>
        <div className={board?.plan ? 'complete' : mapped.length ? 'current' : ''}><span>2</span><strong>Plan routes</strong><small>{incidents.filter(item => item.status === 'verified').length} ready to route</small></div>
        <div className={board?.plan?.status === 'approved' || board?.plan?.status === 'alerted' ? 'complete' : board?.plan ? 'current' : ''}><span>3</span><strong>Approve plan</strong><small>{board?.plan?.status === 'proposed' ? 'Ready for your review' : 'Your final check'}</small></div>
        <div className={board?.plan?.status === 'alerted' ? 'complete' : board?.plan?.status === 'approved' ? 'current' : ''}><span>4</span><strong>Notify teams</strong><small>{board?.alerts.length || 0} {isDemo ? 'simulated alerts' : 'alerts'}</small></div>
      </div>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void run(api.getBoard)}>Refresh board</button></div>}
      {!board ? <div className="loading" role="status">{error ? 'Connect the API or retry to load the board.' : 'Collecting the synthetic scenario…'}</div> : <>
        <div className="overview-bar" id="reports"><h2>Response overview</h2><span><span className="live-dot" />{available} teams available</span></div>
        <section className="workspace" aria-label="Reports, map and verification">
          <div className="queue"><div className="queue-heading"><h2>Reports <span>{incidents.length}</span></h2></div>
            <label className="search"><Search size={15} /><input aria-label="Search requests" placeholder="Search reports or places" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="filters">{[['all', 'All'], ['needs_review', 'Review'], ['verified', 'Mapped'], ['assigned', 'Alerted'], ['delivered', 'Done']].map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <IncidentQueue incidents={visible} selectedId={selectedId} onSelect={select} />
          </div>
          <OperationsMap incidents={mapped} teams={board.teams} plan={board.plan} blockedEdgeIds={board.blockedEdgeIds} selectedId={selectedId} onSelect={select} />
          <IncidentDetail incident={selected} busy={busy} onAction={onAction} onAnalyze={(id, followUp) => void run(() => api.analyzeReport(id, followUp))} />
        </section>
        <PlanPanel board={board} busy={busy} onGenerate={() => void run(api.plan)} onApprove={id => void run(() => api.approvePlan(id))} onAlert={id => void run(() => api.alertRescuers(id))} />
        <section className="bottom-grid"><div className="team-strip"><div className="section-kicker">Your response teams</div><div className="teams">{board.teams.map(team => <div className="team-card" key={team.id}><span className="team-avatar">{team.name.split(' ')[1][0]}</span><div><strong>{team.name}</strong><small>{team.members} people · {team.capacity} totes · {team.capabilities.join(', ')}</small></div><span className={`team-status ${team.status}`}>{team.status}</span></div>)}</div></div>
          <details className="activity-strip"><summary>Recent activity<ChevronDown size={16} /></summary>{board.activity.slice(0, 6).map(item => <div className="activity-item" key={item.id}><span className="live-dot" /><span>{item.message}</span><time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</details>
        </section>
      </>}
      {isDemo && <details className="scenario-info"><summary><FlaskConical size={14} />About this demo<ChevronDown size={14} /></summary><div><p>{aiConfigured ? 'Bedrock assists with intake and plan review. Amazon Location supplies driving routes between sample locations. Reports stay in this tab and alerts are simulated.' : 'Explore synthetic reports and local planning. Connect the AWS backend to enable AI intake and road routing.'} Reloading resets the scenario.</p><button className="button secondary" disabled={busy || incidents.length >= 7} onClick={() => { select('REQ-1048'); setFilter('all'); setSearch(''); void run(api.simulateReport); }}><Plus size={15} />Load another sample report</button></div></details>}
      <footer><span className="footer-brand">relay</span><span>People first. Every step of the way.</span><span>Review. Plan. Respond.</span></footer>
    </main>
  </div>;
}
