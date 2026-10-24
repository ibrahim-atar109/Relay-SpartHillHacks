import { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, RefreshCw, Plus, Search, Users, ChevronDown, FlaskConical, Phone, Headset, Map as MapIcon } from 'lucide-react';
import type { Board, Incident, IncidentAction } from '../shared/contracts';
import { aiConfigured, aiSignedIn } from './services/ai';
import { AiIntake } from './features/reporting/AiIntake';
import { VoiceReport } from './features/reporting/VoiceReport';
import { api, isDemo } from './services/api';
import { OperationsMap } from './features/map/OperationsMap';
import { IncidentQueue } from './features/incidents/IncidentQueue';
import { IncidentDetail } from './features/incidents/IncidentDetail';
import { PlanPanel } from './features/operations/PlanPanel';
import { TeamEditor } from './features/operations/TeamEditor';
import { ScenarioFeed } from './features/feed/ScenarioFeed';
import { BootSplash } from './components/BootSplash';
import { feedEvents, type Hazard } from './data/katrinaFeed';

const FEED_INTERVAL_MS = 9000;

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('REQ-1042');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(!isDemo);
  const [callOpen, setCallOpen] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [feedIndex, setFeedIndex] = useState(0);
  const [feedPlaying, setFeedPlaying] = useState(isDemo);
  const playedEvents = feedEvents.slice(0, feedIndex);
  const hazards = useMemo<Hazard[]>(() => feedEvents.slice(0, feedIndex).flatMap(e => e.hazard ? [{ ...e.hazard, id: e.id, at: e.time }] : []), [feedIndex]);
  const select = useCallback((id: string) => setSelectedId(id), []);
  useEffect(() => {
    if (!isDemo && !aiSignedIn()) { api.clearLocalSession(); setBoard(null); setError(''); return; }
    if (busy || callOpen) return;
    let cancelled = false;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      if (!isDemo && !aiSignedIn()) { if (!cancelled) { api.clearLocalSession(); setBoard(null); setIntakeOpen(true); } return; }
      loading = true;
      try { const next = await api.getBoard(); if (!cancelled) setBoard(current => current && current.version !== undefined && next.version === current.version ? current : next); }
      catch (err) { if (!cancelled) { if (!isDemo && !aiSignedIn()) setBoard(null); setError(err instanceof Error ? err.message : 'Could not refresh board.'); } }
      finally { loading = false; }
    };
    void refresh();
    const timer = isDemo ? undefined : setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [authRevision, busy, callOpen]);
  async function advanceFeed() {
    const event = feedEvents[feedIndex];
    if (!event || !board) return;
    setFeedIndex(feedIndex + 1);
    try { setBoard(await api.applyFeedEvent(event)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Scenario update failed.'); }
  }
  useEffect(() => {
    // Hold the simulated clock while the coordinator is mid-action or on a call.
    if (!isDemo || !feedPlaying || busy || callOpen || !board || feedIndex >= feedEvents.length) return;
    const timer = setTimeout(() => void advanceFeed(), feedIndex === 0 ? 2800 : FEED_INTERVAL_MS);
    return () => clearTimeout(timer);
  }); // Re-armed after each render so it always sees the latest board.
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
  const reviewCount = incidents.filter(item => item.status === 'needs_review').length;
  const verifiedCount = incidents.filter(item => item.status === 'verified').length;
  const planStatus = board?.plan?.status;
  const steps = [
    { title: 'Collect', detail: `${incidents.length} reports · news, 911, police`, done: incidents.length > 0, current: !incidents.length },
    { title: 'AI analysis + human verification', detail: `${reviewCount} awaiting review`, done: mapped.length > 0, current: !!incidents.length && !mapped.length },
    { title: 'Optimal routes', detail: `${verifiedCount} verified to route`, done: !!board?.plan, current: !!mapped.length && !board?.plan },
    { title: 'Human route verification', detail: planStatus === 'proposed' ? 'Ready for your check' : 'Approve every route', done: planStatus === 'approved' || planStatus === 'alerted', current: planStatus === 'proposed' },
    { title: 'Humans deploy', detail: `${board?.alerts.length || 0} simulated alerts`, done: planStatus === 'alerted', current: planStatus === 'approved' },
  ];
  return <div className="app-shell">
    <BootSplash />
    <main>
      <header className="topbar"><a className="wordmark" href="#overview" aria-label="Relay home"><span className="brand-mark"><Radio size={20} /></span>relay</a><div className="header-right"><nav className="topnav" aria-label="Workspace"><a href="#reports">Reports</a><a href="#routes">Routes</a></nav><span className="mode"><span className="live-dot" />{isDemo ? 'Training simulation' : 'Connected workspace'}</span><span className="avatar" title="Coordinator"><Users size={16} /></span></div></header>
      <section className="hero" id="overview">
        <div className="hero-copy"><div className="eyebrow">{isDemo ? 'HURRICANE KATRINA · ST. BERNARD PARISH, LOUISIANA · AUG 29, 2005' : 'SHARED WORKSPACE · RESPONSE OPERATIONS'}</div><h1>{isDemo ? 'The storm is here. Every report counts.' : 'Every response starts here.'}</h1><p>{isDemo ? 'You are a response coordinator as Katrina makes landfall. News, 911 calls and police reports stream in. AI organizes them; you verify every step and make every deployment decision.' : 'Review incoming reports, verify them, and approve every route before teams are notified.'}</p>
          <div className="heading-actions">
            <button className="button primary" disabled={busy || !board} onClick={() => setCallOpen(true)}><Phone size={16} />Simulate 911 call</button>
            <button className="button secondary" aria-expanded={intakeOpen} aria-controls="report-intake" onClick={() => setIntakeOpen(value => !value)}><Plus size={16} />New report</button>
            <button className="button ghost" disabled={busy} onClick={() => { select('REQ-1042'); setFilter('all'); setSearch(''); setFeedIndex(0); setFeedPlaying(isDemo); void run(() => isDemo ? api.reset() : api.getBoard()); }}><RefreshCw size={15} />{isDemo ? 'Restart scenario' : 'Refresh'}</button>
          </div>
        </div>
        <div className="roles">
          <article><span className="role-icon"><Headset size={18} /></span><div><h3>1 · Overflow call intake</h3><p>When human 911 operators are unavailable, an AI assistant (Amazon Bedrock) talks with the caller, gathers critical details and files a structured report for review.</p></div></article>
          <article><span className="role-icon"><MapIcon size={18} /></span><div><h3>2 · Dispatch decision support</h3><p>AI analyzes incoming reports to highlight priority areas and proposes optimized routes. Humans verify reports, approve routes and decide every deployment.</p></div></article>
          <p className="sim-note">Simulation only. Nothing here connects to emergency services.</p>
        </div>
      </section>
      {callOpen && <VoiceReport onClose={() => setCallOpen(false)} onSubmit={async (transcript, audioUrl, recordings, call) => {
        const next = await api.submitVoiceReport(transcript, audioUrl, recordings, call);
        setBoard(next); setSelectedId((isDemo ? next.incidents[0] : next.incidents.at(-1))!.id); setFilter('all'); setSearch(''); setError(''); setCallOpen(false);
      }} />}
      <AiIntake open={intakeOpen} onOpenChange={setIntakeOpen} busy={busy} onCollect={collectReport} onImport={async file => { setBusy(true); setError(''); try { const next = await api.importDocument(file); setBoard(next); setSelectedId(next.incidents.at(-1)!.id); setIntakeOpen(false); return true; } catch (err) { setError(err instanceof Error ? err.message : 'Document import failed.'); return false; } finally { setBusy(false); } }} onSessionChange={() => { setAuthRevision(value => value + 1); if (!isDemo && !aiSignedIn()) { setBoard(null); setCallOpen(false); } }} />
      <ol className="pipeline-steps" aria-label="Human-in-the-loop pipeline">
        {steps.map((step, i) => <li key={step.title} className={step.done ? 'complete' : step.current ? 'current' : ''}><span>{i + 1}</span><strong>{step.title}</strong><small>{step.detail}</small></li>)}
      </ol>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void run(api.getBoard)}>Refresh board</button></div>}
      {!board ? <div className="loading" role="status">{!isDemo && !aiSignedIn() ? 'Sign in above to load the saved workspace.' : error ? 'Connect the API or retry to load the board.' : isDemo ? 'Loading the Katrina scenario…' : 'Loading the saved workspace…'}</div> : <>
        {isDemo && <ScenarioFeed played={playedEvents} total={feedEvents.length} playing={feedPlaying} onToggle={() => setFeedPlaying(value => !value)} onStep={() => void advanceFeed()} />}
        <div className="overview-bar" id="reports"><h2>Response overview</h2><span><span className="live-dot" />{available} teams available{isDemo && ` · ${hazards.length} active ${hazards.length === 1 ? 'hazard' : 'hazards'} · ${board.blockedEdgeIds.length} ${board.blockedEdgeIds.length === 1 ? 'road' : 'roads'} closed`}</span></div>
        <section className="workspace" aria-label="Reports, map and verification">
          <div className="queue"><div className="queue-heading"><h2>Reports <span>{incidents.length}</span></h2></div>
            <label className="search"><Search size={15} /><input aria-label="Search requests" placeholder="Search reports or places" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="filters">{[['all', 'All'], ['needs_review', 'Review'], ['verified', 'Mapped'], ['assigned', 'Alerted'], ['delivered', 'Done']].map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <IncidentQueue incidents={visible} selectedId={selectedId} onSelect={select} />
          </div>
          <OperationsMap incidents={mapped} teams={board.teams} plan={board.plan} blockedEdgeIds={board.blockedEdgeIds} hazards={hazards} selectedId={selectedId} onSelect={select} />
          <IncidentDetail incident={selected} busy={busy} onAction={onAction} onAnalyze={(id, followUp) => void run(() => api.analyzeReport(id, followUp))} />
        </section>
        <PlanPanel board={board} busy={busy} onGenerate={() => void run(api.plan)} onApprove={id => void run(() => api.approvePlan(id))} onAlert={id => void run(() => api.alertRescuers(id))} />
        <section className="bottom-grid"><div className="team-strip"><div className="section-kicker">Your response teams</div><div className="teams">{board.teams.map(team => <div className="team-card" key={team.id}><span className="team-avatar">{(team.name.trim().split(/\s+/).at(-1)?.charAt(0) || 'T')}</span><div><strong>{team.name}</strong><small>{team.members} people · {team.capacity} totes · {team.capabilities.join(', ')}</small><small>{team.depotLabel}</small></div><span className={`team-status ${team.status}`}>{team.status}</span></div>)}</div>{!isDemo && <TeamEditor teams={board.teams} version={board.version} busy={busy} onSaved={setBoard} onWorking={setBusy} />}</div>
          <details className="activity-strip"><summary>Recent activity<ChevronDown size={16} /></summary>{board.activity.slice(0, 6).map(item => <div className="activity-item" key={item.id}><span className="live-dot" /><span>{item.message}</span><time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</details>
        </section>
      </>}
      {isDemo && <details className="scenario-info"><summary><FlaskConical size={14} />About this demo<ChevronDown size={14} /></summary><div><p>{aiConfigured ? 'Amazon Bedrock runs the AI call intake, report extraction and plan review. Amazon Location supplies driving routes between scenario points. Reports stay in this tab and alerts are simulated.' : 'Explore simulated reports and local planning. Connect the AWS backend to enable the AI call, AI extraction and road routing.'} Reloading restarts the scenario.</p><button className="button secondary" disabled={busy || incidents.length >= 7} onClick={() => { select('REQ-1048'); setFilter('all'); setSearch(''); void run(api.simulateReport); }}><Plus size={15} />Load another sample report</button></div></details>}
      <footer><span className="footer-brand">relay</span><span>Training simulation · not connected to emergency services</span><span>AI assists. Humans decide.</span></footer>
    </main>
  </div>;
}
