import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, ShieldCheck, Route, Send } from 'lucide-react';
import type { Priority } from '../../../shared/contracts';
import type { SimulationItem, SimulationPlanResponse, VerifiedSimulationEvent } from '../../../shared/simulation';
import { katrinaCenter, katrinaEvents, katrinaTeams } from '../../../shared/katrinaScenario';
import { bedrock, aiSignedIn } from '../../services/ai';
import { OperationsMap } from '../map/OperationsMap';

export function KatrinaConsole({active}:{active:boolean}) {
  const [items,setItems] = useState<SimulationItem[]>([]);
  const [running,setRunning] = useState(false);
  const [working,setWorking] = useState(false);
  const [cursor,setCursor] = useState(0);
  const [error,setError] = useState('');
  const [selected,setSelected] = useState<string|null>(null);
  const [result,setResult] = useState<SimulationPlanResponse|null>(null);
  const [reviewedPlan,setReviewedPlan] = useState(false);
  const [approved,setApproved] = useState(false);
  const [outbox,setOutbox] = useState<string[]>([]);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const signedIn=aiSignedIn();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
  useEffect(()=>{if(!active)setRunning(false);},[active]);
  async function ingest(index:number) {
    if(inFlight.current || !aiSignedIn()) return;
    const event=katrinaEvents[index]; if(!event)return;
    inFlight.current=true;setWorking(true);setError('');const generation=epoch.current;
    setResult(null);setApproved(false);setReviewedPlan(false);
    setItems(prior=>[...prior.filter(i=>i.event.id!==event.id),{event,status:'analyzing'}]);setSelected(event.id);
    try {
      const analysis=await bedrock.analyzeSimulation(event);
      if(!mounted.current || generation!==epoch.current)return;
      setItems(prior=>prior.map(i=>i.event.id===event.id?{event,analysis,status:'needs_review'}:i));
      setCursor(index+1); if(index+1===katrinaEvents.length)setRunning(false);
    } catch(err) {
      if(mounted.current && generation===epoch.current){const message=err instanceof Error?err.message:'Analysis failed.';setError(message);setRunning(false);setItems(prior=>prior.map(i=>i.event.id===event.id?{...i,status:'failed',error:message}:i));}
    } finally {inFlight.current=false;if(mounted.current)setWorking(false);}
  }
  useEffect(()=>{
    if(!signedIn){setRunning(false);return;}
    if(!running || !active || working || cursor>=katrinaEvents.length)return;
    const timer=setTimeout(()=>void ingest(cursor),cursor===0?100:8000);
    return()=>clearTimeout(timer);
  },[running,working,cursor,signedIn,active]);
  const verified=items.filter(i=>i.status==='verified'&&i.confirmed).map(i=>i.confirmed!);
  const selectedItem=items.find(i=>i.event.id===selected);
  function verify(confirmed:VerifiedSimulationEvent) {
    setItems(prior=>prior.map(i=>i.event.id===confirmed.id?{...i,status:'verified',confirmed}:i));setResult(null);setApproved(false);setReviewedPlan(false);
  }
  return <section className="katrina-console" aria-label="Hurricane Katrina training simulation">
    <div className="simulation-banner"><div><span className="eyebrow">KATRINA-INSPIRED EXERCISE · ST. BERNARD PARISH</span><h2>See the signal. Coordinate the response.</h2><p>Fictional news, 911 intake bulletins and police reports. Real Bedrock analysis. Not a live feed, historical replay, or emergency dispatch system. Current maps, not 2005 road conditions.</p></div><span className="drill-badge">TRAINING ONLY</span></div>
    <div className="simulation-toolbar"><button className="button primary" disabled={!aiSignedIn() || (!running&&working) || cursor>=katrinaEvents.length} onClick={()=>{setError('');setRunning(v=>!v);}}>{running?<Pause size={16}/>:<Play size={16}/>} {running?'Pause feed':'Start / resume feed'}</button><button className="button secondary" disabled={working} onClick={()=>{epoch.current++;setRunning(false);setItems([]);setCursor(0);setResult(null);setOutbox([]);setApproved(false);setReviewedPlan(false);setSelected(null);setError('');}}><RotateCcw size={15}/>Reset drill</button><span role="status">{working?'AWS request in progress':running?'Exercise feed running':'Exercise paused'} · {cursor}/{katrinaEvents.length} analyzed · {verified.length} verified</span></div>
    {!aiSignedIn()&&<p className="error-banner">Sign in above to enable real Bedrock analysis. The exercise has no mock AI fallback.</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="simulation-grid"><div className="simulation-feed"><h3>Incoming intelligence</h3><p className="review-hint">One bulletin at a time, at least eight seconds apart. AI output must be verified.</p>{!items.length&&<p className="empty">Start the feed to receive the first fictional bulletin.</p>}{items.map(item=><button className={`simulation-event ${selected===item.event.id?'selected':''}`} key={item.event.id} onClick={()=>setSelected(item.event.id)}><small>SIMULATED {item.event.source.toUpperCase()} · T+{item.event.atSeconds}s</small><strong>{item.event.label}</strong><span>{item.analysis?.kind.replaceAll('_',' ')??(item.status==='failed'?'Analysis failed':'Bedrock analyzing…')}</span><span className="status">{item.status.replaceAll('_',' ')}</span></button>)}</div>
      <OperationsMap incidents={[]} teams={katrinaTeams} plan={result?.plan??null} blockedEdgeIds={[]} selectedId={selected} onSelect={setSelected} simulation={items} center={katrinaCenter}/>
      <aside className="detail simulation-review">{selectedItem?<EventReview key={selectedItem.event.id} item={selectedItem} disabled={working} onVerify={verify} onReject={()=>{setItems(prior=>prior.map(i=>i.event.id===selectedItem.event.id?{...i,status:'rejected'}:i));setResult(null);setApproved(false);setReviewedPlan(false);}} onRetry={()=>void ingest(katrinaEvents.findIndex(e=>e.id===selectedItem.event.id))}/>:<p className="empty">Select an incoming bulletin to inspect its source and AI analysis.</p>}</aside>
    </div>
    <section className="plan-panel"><div className="plan-header"><div><div className="section-kicker">Human-gated response</div><h2>Verified intelligence → assessment routes.</h2><p>Pause the feed, verify events, then generate routes. Exercise assessment visits—not autonomous rescue or supply delivery.</p></div><button className="button primary" disabled={running||working||!verified.length||!aiSignedIn()} onClick={async()=>{setWorking(true);setError('');setResult(null);setApproved(false);setReviewedPlan(false);const generation=epoch.current;try{const next=await bedrock.planSimulation(verified);if(mounted.current&&generation===epoch.current)setResult(next);}catch(err){if(mounted.current)setError(err instanceof Error?err.message:'Routing failed.');}finally{if(mounted.current)setWorking(false);}}}><Route size={16}/>{working?'Working…':'Generate assessment routes'}</button></div>
      {result&&<><p className="planner-explanation">{result.plan.explanation}</p><div className="ai-plan-review"><h3>Bedrock plan review</h3><p>{result.plan.aiExplanation}</p><small>{result.plan.ai?.modelId} · request {result.plan.ai?.requestId}</small>{result.plan.reviewNotes?.map(n=><p key={n}>{n}</p>)}</div><div className="route-cards">{result.plan.routes.map(route=><article className="route-card" key={route.teamId}><h3>{katrinaTeams.find(t=>t.id===route.teamId)?.name}</h3><p>{route.stops.length} assessment visits · {Math.ceil(route.travelMinutes)} driving minutes</p><ol>{route.stops.map(stop=><li key={stop.incidentId}>{katrinaEvents.find(e=>e.id===stop.incidentId)?.label} · +{Math.ceil(stop.arrivalMinutes)} min</li>)}</ol></article>)}</div>{!!result.plan.unservedIds.length&&<p className="error-banner">Unserved assessment visits: {result.plan.unservedIds.join(', ')}</p>}<label className="confirmation"><input type="checkbox" checked={reviewedPlan} disabled={approved||running||working} onChange={e=>setReviewedPlan(e.target.checked)}/>I reviewed staging points, route geometry, hazard notices and unserved visits. This is training only.</label>{!approved?<button className="button primary" disabled={!reviewedPlan||running||working} onClick={()=>setApproved(true)}><ShieldCheck size={16}/>Approve exercise plan</button>:<button className="button primary" disabled={running||working||outbox.some(m=>m.includes(result.plan.id))} onClick={()=>setOutbox(prior=>[...result.plan.routes.map(r=>`SIMULATED DEPLOYMENT · Plan ${result.plan.id} · ${r.teamId}: ${r.stops.map(s=>s.incidentId).join(' → ')}. No actual team was contacted.`),...prior])}><Send size={16}/>Simulate responder deployment</button>}</>}
      {!!outbox.length&&<details className="alert-outbox" open><summary>Exercise deployment log · no messages sent</summary>{outbox.map((m,i)=><p key={i}>{m}</p>)}</details>}
    </section><p className="review-hint">Session-only drill. Reset/reload clears it; your DynamoDB operations workspace is not modified. Bulletin times are exercise offsets, not historical timestamps.</p>
  </section>;
}
function EventReview({item,disabled,onVerify,onReject,onRetry}:{item:SimulationItem;disabled:boolean;onVerify:(event:VerifiedSimulationEvent)=>void;onReject:()=>void;onRetry:()=>void}) {
  const [checked,setChecked]=useState(false);const [priority,setPriority]=useState<Priority|''>('');
  return <><div className="section-kicker">Human verification · {item.event.id}</div><h2>{item.event.label}</h2><blockquote>{item.event.text}</blockquote><p className="review-hint">Exercise coordinate: {item.event.coordinates[1]}, {item.event.coordinates[0]}. This is a fictional report location, not a verified facility.</p>{item.analysis&&<><h3>Bedrock analysis</h3><p>{item.analysis.summary}</p><p className="review-hint">Classification: {item.analysis.kind.replaceAll('_',' ')} · Suggested urgency: {item.analysis.priority??'unknown'}</p><small className="ai-provenance">{item.analysis.ai.modelId} · request {item.analysis.ai.requestId}</small><ul className="missing">{item.analysis.missingInfo.map(n=><li key={n}>{n}</li>)}</ul>{item.status==='needs_review'&&<><label className="field">Confirm urgency<select value={priority} onChange={e=>{setPriority(e.target.value as Priority);setChecked(false);}}><option value="">Select after reviewing</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label><label className="confirmation"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I reviewed the fictional source, classification, reported point and uncertainty. Verification is for this exercise only.</label><button className="button primary full" disabled={disabled||!checked||!priority} onClick={()=>priority&&onVerify({id:item.event.id,kind:item.analysis!.kind,priority})}>Verify for exercise planning</button><button className="button secondary full" disabled={disabled} onClick={onReject}>Reject bulletin</button></>}</>}{item.status==='failed'&&<><p className="error-banner">{item.error}</p><button className="button secondary" disabled={disabled} onClick={onRetry}>Retry real analysis</button></>}{item.status==='verified'&&<p className="success">Verified by operator · {item.confirmed?.priority}</p>}</>;
}
