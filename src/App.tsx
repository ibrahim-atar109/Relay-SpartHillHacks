import { useCallback, useEffect, useState } from 'react';
import { Radio, LayoutDashboard, RefreshCw, Plus, Search, Users, CircleCheck, Inbox, Activity } from 'lucide-react';
import type { Board, IncidentAction } from '../shared/contracts';
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
  const select = useCallback((id: string) => setSelectedId(id), []);
  useEffect(() => { api.getBoard().then(setBoard).catch(err => setError(err.message)); }, []);
  async function run(operation: () => Promise<Board>) {
    setBusy(true); setError('');
    try { setBoard(await operation()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  const onAction = (id: string, action: IncidentAction) => { void run(() => api.act(id, action)); };
  const incidents = board?.incidents || [];
  const visible = incidents.filter(item => (filter === 'all' || item.status === filter) && `${item.title} ${item.id} ${item.location.label}`.toLowerCase().includes(search.toLowerCase()));
  const selected = incidents.find(item => item.id === selectedId);
  const mapped = incidents.filter(item => item.status !== 'needs_review');
  const available = board?.teams.filter(team => team.status === 'available').length || 0;
  return <div className="app-shell">
    <nav className="rail" aria-label="Application"><a className="brand" href="#" aria-label="Relay home"><Radio size={27} /></a><div className="rail-active" title="Operations"><LayoutDashboard size={21} /></div><span className="rail-line" /><span className="rail-bottom">R</span></nav>
    <main>
      <header className="topbar"><div className="wordmark">relay<span>/</span><small>RELIEF OPERATIONS</small></div><div className="header-right"><span className="mode"><span className="live-dot" />{isDemo ? 'Synthetic demo' : 'Live API mode'}</span><span className="avatar">MC</span></div></header>
      <div className="page-heading"><div><div className="eyebrow">COMMUNITY RESPONSE / SAN JOSÉ</div><h1>Verify the signal. Coordinate the response.</h1><p>Collected reports become mapped needs, approved routes, and rescuer alerts.</p></div><div className="heading-actions">
        <button className="button secondary" disabled={busy} onClick={() => { select('REQ-1042'); setFilter('all'); setSearch(''); void run(() => isDemo ? api.reset() : api.getBoard()); }}><RefreshCw size={15} />{isDemo ? 'Reset scenario' : 'Refresh'}</button>
        {isDemo && <button className="button secondary" disabled={busy || incidents.length >= 7} onClick={() => { select('REQ-1048'); setFilter('all'); setSearch(''); void run(api.simulateReport); }}><Plus size={17} />Collect another report</button>}
      </div></div>
      {isDemo && <div className="demo-banner">SIMULATED SCENARIO <span>Synthetic transcripts and local optimization on a fictional network. Routes are schematic; alerts stay inside this demo. Bedrock and delivery APIs are not connected.</span></div>}
      <div className="pipeline-steps" aria-label="Approval pipeline">
        <div className={mapped.length ? 'complete' : 'current'}><span>1</span><strong>Verify collected data</strong><small>{incidents.filter(item => item.status === 'needs_review').length} awaiting review</small></div>
        <div className={board?.plan ? 'complete' : mapped.length ? 'current' : ''}><span>2</span><strong>Generate routes</strong><small>{mapped.length} verified requests on map</small></div>
        <div className={board?.plan?.status === 'approved' || board?.plan?.status === 'alerted' ? 'complete' : board?.plan ? 'current' : ''}><span>3</span><strong>Verify route plan</strong><small>Human approval required</small></div>
        <div className={board?.plan?.status === 'alerted' ? 'complete' : board?.plan?.status === 'approved' ? 'current' : ''}><span>4</span><strong>Alert rescuers</strong><small>{board?.alerts.length || 0} alerts in outbox</small></div>
      </div>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void run(api.getBoard)}>Refresh board</button></div>}
      <section className="stats" aria-label="Operational summary">{[
        { label: 'Collected reports', value: incidents.length, icon: Inbox, sub: 'Synthetic voice, text and forms' },
        { label: 'Awaiting verification', value: incidents.filter(item => item.status === 'needs_review').length, icon: Activity, sub: 'Hidden from the map until approved' },
        { label: 'Teams available', value: available, icon: Users, sub: 'Capacity and supply type checked' },
        { label: 'Rescuer alerts', value: board?.alerts.length || 0, icon: CircleCheck, sub: isDemo ? 'Simulated messages in the outbox' : 'See delivery status in the outbox' },
      ].map(stat => <div className="stat" key={stat.label}><div><span>{stat.label}</span><stat.icon size={17} /></div><strong>{stat.value.toString().padStart(2, '0')}</strong><small>{stat.sub}</small></div>)}</section>
      {!board ? <div className="loading" role="status">{error ? 'Connect the API or retry to load the board.' : 'Collecting the synthetic scenario…'}</div> : <>
        <section className="workspace">
          <div className="queue"><div className="queue-heading"><h2>Collected reports <span>{incidents.length}</span></h2></div>
            <label className="search"><Search size={15} /><input aria-label="Search requests" placeholder="Search reports or places" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="filters">{[['all', 'All'], ['needs_review', 'Review'], ['verified', 'Mapped'], ['assigned', 'Alerted'], ['delivered', 'Done']].map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <IncidentQueue incidents={visible} selectedId={selectedId} onSelect={select} />
          </div>
          <OperationsMap incidents={mapped} teams={board.teams} plan={board.plan} blockedEdgeIds={board.blockedEdgeIds} selectedId={selectedId} onSelect={select} />
          <IncidentDetail incident={selected} busy={busy} onAction={onAction} />
        </section>
        <PlanPanel board={board} busy={busy} onGenerate={() => void run(api.plan)} onApprove={id => void run(() => api.approvePlan(id))} onAlert={id => void run(() => api.alertRescuers(id))} />
        <section className="bottom-grid"><div className="team-strip"><div className="section-kicker">RESCUER TEAMS</div><div className="teams">{board.teams.map(team => <div className="team-card" key={team.id}><span className="team-avatar">{team.name.split(' ')[1][0]}</span><div><strong>{team.name}</strong><small>{team.members} rescuers · {team.capacity} totes · {team.capabilities.join(', ')}</small></div><span className={`team-status ${team.status}`}>{team.status}</span></div>)}</div></div>
          <div className="activity-strip"><div className="section-kicker">APPROVAL TRAIL</div>{board.activity.slice(0, 4).map(item => <div className="activity-item" key={item.id}><span className="live-dot" /><span>{item.message}</span><time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div>
        </section>
      </>}
      <footer>RELAY <span>Human verification at every critical handoff.</span><span>{isDemo ? 'Reload resets the synthetic scenario' : 'Refresh for the latest API state'}</span></footer>
    </main>
  </div>;
}
