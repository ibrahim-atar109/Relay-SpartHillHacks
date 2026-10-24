import { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, RefreshCw, Mic, Search, Play, Pause, SkipForward, Layers, Phone, AlertTriangle, Route } from 'lucide-react';
import type { Board, IncidentAction } from '../shared/contracts';
import { api, isDemo } from './services/api';
import { OperationsMap } from './features/map/OperationsMap';
import { IncidentQueue } from './features/incidents/IncidentQueue';
import { IncidentDetail } from './features/incidents/IncidentDetail';
import { VoiceReport } from './features/reporting/VoiceReport';
import { PlanPanel } from './features/operations/PlanPanel';
import { IntelligencePanel } from './features/simulation/IntelligencePanel';
import { clustersFor, exerciseTime } from './features/simulation/engine';
import { edges, nodes } from './data/network';
import './cad.css';

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const select = useCallback((id: string) => setSelectedId(id), []);
  useEffect(() => { api.getBoard().then(setBoard).catch(err => setError(err.message)); }, []);
  const run = useCallback(async (operation: () => Promise<Board>) => {
    setBusy(true); setError('');
    try { setBoard(await operation()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); setRunning(false); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (!running || busy || reportOpen) return;
    const timer = setInterval(() => void run(api.advance), 5000);
    return () => clearInterval(timer);
  }, [running, busy, reportOpen, run]);
  useEffect(() => { setPage(0); }, [filter, search, activeCluster]);
  const incidents = board?.incidents || [];
  const clusters = useMemo(() => clustersFor(board?.incidents || []), [board?.incidents]);
  const visible = useMemo(() => incidents.filter(item =>
    (filter === 'all' || filter === 'participant' && item.origin === 'participant' || item.priority === filter || item.status === filter) &&
    (!activeCluster || item.nodeId === activeCluster) &&
    `${item.title} ${item.id} ${item.location.label} ${item.originalReport}`.toLowerCase().includes(search.toLowerCase())
  ).sort((a,b) => Number(b.origin === 'participant') - Number(a.origin === 'participant') || ({critical:0,high:1,normal:2}[a.priority] - {critical:0,high:1,normal:2}[b.priority])), [board?.incidents, filter, search, activeCluster]);
  const selected = incidents.find(item => item.id === selectedId);
  const mapped = useMemo(() => incidents.filter(item => item.status !== 'needs_review'), [board?.incidents]);
  const critical = incidents.filter(item => item.priority === 'critical' && item.status !== 'delivered').length;
  const pages = Math.max(1, Math.ceil(visible.length / 40));
  const currentPage = Math.min(page, pages - 1);
  const onAction = (id: string, action: IncidentAction) => { void run(() => api.act(id, action)); };
  return <div className="cad-shell"><header className="cad-header"><div className="cad-brand"><Radio size={25} /><strong>relay</strong><span>/ DISPATCH</span><small>{isDemo ? 'Rules-based demo' : 'API mode'}</small></div><div className="cad-location"><strong>Fort Lauderdale operations</strong><span>Katrina exercise · August 25, 2005</span></div>{isDemo && <button className="button call-launch" disabled={busy || !board} onClick={() => setReportOpen(true)}><Phone size={16} />Simulate 911 call</button>}</header>
    <main className="cad-main"><section className="simulation-bar" aria-label="Simulation controls"><strong>Simulation controls</strong>{isDemo && <><button className="button primary" disabled={!board || busy} onClick={() => setRunning(value => !value)}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause simulation' : 'Run simulation'}</button><button className="button secondary" disabled={!board || busy} onClick={() => void run(api.advance)}><SkipForward size={15} />Advance +1 min</button><button className="button secondary" disabled={!board || busy || incidents.filter(item => item.id.startsWith('SIM-')).length >= 6000} onClick={() => { setRunning(false); void run(api.surge); }}><Layers size={15} />Load 6,000 reports</button></>}<button className="button secondary" disabled={busy} onClick={() => { setRunning(false); setNotice(''); setSelectedId(null); setFilter('all'); setSearch(''); setActiveCluster(null); setPage(0); void run(isDemo ? api.reset : api.getBoard); }}><RefreshCw size={14} />{isDemo ? 'Reset' : 'Refresh'}</button><div className="sim-clock"><span>{running ? reportOpen ? 'Paused during call' : '1 sim minute / 5 seconds' : 'Simulation paused'}</span><strong>{exerciseTime(board?.simulationMinute || 0)} EDT</strong></div></section>
    <p className="cad-disclaimer">TRAINING ONLY · Synthetic calls and bulletins; participant voice is real input. Modern street geometry, simulated closures and travel times. No emergency services contacted.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="report-notice" role="status">{notice}</div>}
    {reportOpen && <VoiceReport onClose={() => setReportOpen(false)} onSubmit={async (transcript, audioUrl, recordings) => { const next = await api.submitVoiceReport(transcript, audioUrl, recordings); setBoard(next); select(next.incidents[0].id); setActiveCluster(null); setFilter('participant'); setSearch(''); setNotice('Participant call received. Review the transcript and missing details before dispatch.'); setReportOpen(false); }} />}
    <section className="cad-metrics">{[{label:'Calls received',value:incidents.length,icon:Phone,sub:'Original reports retained'},{label:'Active area groups',value:clusters.length,icon:Layers,sub:'Related calls, not verified duplicates'},{label:'Critical signals',value:critical,icon:AlertTriangle,sub:'Declared urgency · requires review'},{label:'Road closures',value:board?.blockedEdgeIds.length || 0,icon:Route,sub:'Excluded from new route plans'}].map(stat => <div key={stat.label}><stat.icon size={22} /><span>{stat.label}<strong>{stat.value.toLocaleString()}</strong><small>{stat.sub}</small></span></div>)}</section>
    {!board ? <div className="loading">Loading dispatch workspace…</div> : <><section className="cad-workspace"><div className="queue"><div className="queue-heading"><h2>Incident queue <span>{visible.length.toLocaleString()}</span></h2></div><label className="search"><Search size={15} /><input aria-label="Search reports" placeholder="Search calls, places, transcripts" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="filters">{[['all','All'],['critical','Critical'],['high','High'],['participant','My calls'],['verified','Verified']].map(([value,label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>{activeCluster && <button className="area-filter" onClick={() => setActiveCluster(null)}>Area: {nodes[activeCluster].label} ×</button>}<IncidentQueue incidents={visible.slice(currentPage*40,currentPage*40+40)} selectedId={selectedId} onSelect={select} /><div className="queue-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage-1)}>←</button><span>{currentPage+1} / {pages} · 40 per page</span><button disabled={currentPage+1 >= pages} onClick={() => setPage(currentPage+1)}>→</button></div></div>
    <OperationsMap incidents={mapped} teams={board.teams} plan={board.plan} blockedEdgeIds={board.blockedEdgeIds} selectedId={selectedId} onSelect={select} clusters={clusters} onCluster={setActiveCluster} />
    {selected ? <div className="inspector"><button className="back-intelligence" onClick={() => setSelectedId(null)}>← Operational intelligence</button><IncidentDetail incident={selected} busy={busy} onAction={onAction} /></div> : <IntelligencePanel board={board} clusters={clusters} activeCluster={activeCluster} onCluster={setActiveCluster} onSelect={select} />}</section>
    <section className="cad-context"><div className="closure-panel"><div className="panel-title"><h2>Road closures</h2><span>{board.blockedEdgeIds.length} CLOSED CORRIDORS</span></div><p>Toggle a corridor to simulate flooding or clearance. Overlapping road segments are also excluded; any existing plan is cleared.</p><div className="closure-table">{edges.map(edge => <div key={edge.id}><span><strong>{nodes[edge.from].label} → {nodes[edge.to].label}</strong><small>Corridor {edge.id} · {edge.minutes} simulated min</small></span><b className={board.blockedEdgeIds.includes(edge.id) ? 'closed-label' : 'open-label'}>{board.blockedEdgeIds.includes(edge.id) ? 'Closed' : 'Open'}</b><button className="button secondary" disabled={busy || !isDemo} onClick={() => void run(() => api.closure(edge.id, !board.blockedEdgeIds.includes(edge.id)))}>{board.blockedEdgeIds.includes(edge.id) ? 'Reopen' : 'Close'}</button></div>)}</div></div><div className="situation-panel"><div className="panel-title"><h2>Situation feed</h2><span>SIMULATED SOURCES</span></div><p>Exercise bulletins provide context, not verified dispatch facts. No live news integration.</p>{!board.situationFeed?.length && <div className="feed-empty"><Radio size={25}/><h3>Waiting for the next update</h3><p>Run the simulation or advance one minute to receive synthetic calls and situation bulletins. Every third minute changes a road closure.</p></div>}{board.situationFeed?.map(item => <article className="situation-item" key={item.id}><time>{exerciseTime(item.minute)}</time><span><b>EXERCISE BULLETIN · UNVERIFIED</b><p>{item.text}</p></span></article>)}<div className="uncertainty"><strong>Designed for the next integration</strong><p>Bedrock can replace the conversation and analysis providers. Source ingestion, speech recognition, geocoding, routing, and human dispatch approval remain separate responsibilities.</p></div></div></section>
    <PlanPanel board={board} busy={busy} onGenerate={() => void run(api.plan)} onApprove={id => void run(() => api.approvePlan(id))} onAlert={id => void run(() => api.alertRescuers(id))}/>
    <section className="cad-context"><div className="team-strip"><div className="section-kicker">UNIT STATUS</div>{board.teams.map(team => <div className="unit-row" key={team.id}><strong>{team.name}</strong><span>{team.capabilities.join(' / ')} · {team.capacity} totes</span><b>{team.status}</b></div>)}</div><div className="activity-strip"><div className="section-kicker">DECISION TRAIL</div>{board.activity.slice(0,6).map(item => <div className="activity-item" key={item.id}><span className="live-dot"/>{item.message}</div>)}</div></section></>}
    <footer>RELAY DISPATCH <span>Verify evidence. Review the plan. Authorize the response.</span><span>Reset/reload clears calls and recordings · Feed capped at 10,000 reports</span></footer></main></div>;
}
