import { useCallback, useEffect, useState } from 'react';
import { Radio, LayoutDashboard, RefreshCw, Plus, Search, Users, CircleCheck, Inbox, Activity, ArrowUpRight } from 'lucide-react';
import type { Board, IncidentAction } from '../shared/contracts';
import { api, isDemo } from './services/api';
import { OperationsMap } from './features/map/OperationsMap';
import { IncidentQueue } from './features/incidents/IncidentQueue';
import { IncidentDetail } from './features/incidents/IncidentDetail';

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
    try { setBoard(await operation()); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); } finally { setBusy(false); }
  }
  const onAction = (id: string, action: IncidentAction) => { void run(() => api.act(id, action)); };
  const incidents = board?.incidents || [];
  const visible = incidents.filter(item => (filter === 'all' || item.status === filter) && `${item.title} ${item.id} ${item.location.label}`.toLowerCase().includes(search.toLowerCase()));
  const selected = incidents.find(item => item.id === selectedId);
  const available = board?.teams.filter(team => team.status === 'available').length || 0;
  return <div className="app-shell">
    <nav className="rail" aria-label="Application"><a className="brand" href="#" aria-label="Relay home"><Radio size={27} /></a><div className="rail-active" title="Operations"><LayoutDashboard size={21} /></div><span className="rail-line" /><span className="rail-bottom">R</span></nav>
    <main>
      <header className="topbar"><div className="wordmark">relay<span>/</span><small>RELIEF OPERATIONS</small></div><div className="header-right"><span className="mode"><span className="live-dot" />{isDemo ? 'Demo workspace' : 'API connected mode'}</span><span className="avatar">MC</span></div></header>
      <div className="page-heading"><div><div className="eyebrow">COMMUNITY RESPONSE / SAN JOSÉ</div><h1>Every request. A way forward.</h1><p>Coordinate essential deliveries, from the first report to the last mile.</p></div><div className="heading-actions"><button className="button secondary" disabled={busy} onClick={() => void run(() => isDemo ? api.reset() : api.getBoard())}><RefreshCw size={15} />{isDemo ? 'Reset demo' : 'Refresh'}</button>{isDemo && <button className="button primary" disabled={busy || incidents.some(item => item.id === 'REQ-1046')} onClick={() => { void run(api.simulateReport); select('REQ-1046'); setFilter('all'); setSearch(''); }}><Plus size={17} />Simulate report</button>}</div></div>
      {isDemo && <div className="demo-banner">SIMULATED SCENARIO <span>Sample reports and rule-based assignments. AWS AI, calling, and routing are integration points.</span></div>}
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void run(api.getBoard)}>Retry loading</button></div>}
      <section className="stats" aria-label="Operational summary">{[
        { label: 'Open requests', value: incidents.filter(item => item.status !== 'delivered').length, icon: Inbox, sub: 'Across the response area' },
        { label: 'Awaiting review', value: incidents.filter(item => item.status === 'needs_review').length, icon: Activity, sub: 'Your attention is needed' },
        { label: 'Teams available', value: available, icon: Users, sub: `${board?.teams.reduce((sum, team) => sum + team.members, 0) || 0} volunteers in the field` },
        { label: 'Deliveries complete', value: incidents.filter(item => item.status === 'delivered').length, icon: CircleCheck, sub: 'Confirmed by coordinator' },
      ].map(stat => <div className="stat" key={stat.label}><div><span>{stat.label}</span><stat.icon size={17} /></div><strong>{stat.value.toString().padStart(2, '0')}</strong><small>{stat.sub}</small></div>)}</section>
      {!board ? <div className="loading" role="status">{error ? 'Connect the API or retry to load the operations board.' : 'Loading operations board…'}</div> : <>
        <section className="workspace"><div className="queue"><div className="queue-heading"><h2>Request inbox <span>{incidents.length}</span></h2><ArrowUpRight size={17} /></div><label className="search"><Search size={15} /><input aria-label="Search requests" placeholder="Search requests or places" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="filters">{[['all', 'All'], ['needs_review', 'Review'], ['verified', 'Ready'], ['assigned', 'Assigned'], ['delivered', 'Done']].map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><IncidentQueue incidents={visible} selectedId={selectedId} onSelect={select} /></div><OperationsMap incidents={visible} teams={board.teams} selectedId={selectedId} onSelect={select} /><IncidentDetail incident={selected} teams={board.teams} busy={busy} onAction={onAction} /></section>
        <section className="bottom-grid"><div className="team-strip"><div className="section-kicker">FIELD TEAMS</div><div className="teams">{board.teams.map(team => <div className="team-card" key={team.id}><span className="team-avatar">{team.name.split(' ')[1][0]}</span><div><strong>{team.name}</strong><small>{team.members} volunteers · {team.capabilities.join(', ')}</small></div><span className={`team-status ${team.status}`}>{team.status}</span></div>)}</div></div><div className="activity-strip"><div className="section-kicker">LATEST ACTIVITY</div>{board.activity.slice(0, 2).map(item => <div className="activity-item" key={item.id}><span className="live-dot" /><span>{item.message}</span><time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></section>
      </>}
      <footer>RELAY <span>Built for the people who show up.</span><span>{isDemo ? 'Demo state resets on page reload' : 'Refresh to retrieve the latest API state'}</span></footer>
    </main>
  </div>;
}
