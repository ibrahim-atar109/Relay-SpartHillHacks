import { useState } from 'react';
import { Route, ShieldCheck, Send, CheckCircle2 } from 'lucide-react';
import type { Board } from '../../../shared/contracts';
import { isDemo } from '../../services/api';
import { aiConfigured, aiSignedIn } from '../../services/ai';

export function PlanPanel({ board, busy, onGenerate, onApprove, onAlert }: {
  board: Board; busy: boolean; onGenerate: () => void; onApprove: (id: string) => void; onAlert: (id: string) => void;
}) {
  const [reviewedPlan, setReviewedPlan] = useState<string | null>(null);
  const plan = board.plan;
  const verified = board.incidents.filter(item => item.status === 'verified').length;
  const unverified = board.incidents.filter(item => item.status === 'needs_review').length;
  const needsAiLogin = aiConfigured && isDemo && !aiSignedIn();
  return <section className="plan-panel" aria-label="Route planning and rescuer alerts">
    <div className="plan-header"><div><div className="section-kicker">STEPS 2–4 · PLAN, VERIFY, ALERT</div><h2>From verified reports to a rescue plan.</h2><p>{verified} verified requests ready · {unverified} unverified reports excluded</p>{needsAiLogin && <p role="status">Sign in at Report Intake above and finish setting your password to enable Bedrock route review.</p>}</div><button className="button primary" disabled={busy || !verified || needsAiLogin} onClick={onGenerate}><Route size={16} />{busy ? 'Working…' : aiConfigured && isDemo ? 'Optimize routes & review with Bedrock' : 'Generate optimal routes'}</button></div>
    {!plan ? <div className="plan-empty">Verify collected data above, then run the routing agent. Review its proposed stops and arrival times here before any alerts are created.</div> : <>
      <div className="plan-summary"><span className={`status plan-${plan.status}`}>{plan.status === 'proposed' ? 'Awaiting your route verification' : plan.status === 'approved' ? 'Routes verified · Ready to alert' : 'Plan dispatched'}</span><span>{plan.routes.length} teams · {plan.routes.reduce((sum, route) => sum + route.stops.length, 0)} stops · {plan.routes.reduce((sum, route) => sum + route.travelMinutes, 0)} total drive minutes</span></div>
      <p className="planner-explanation">{plan.explanation}</p>
      {plan.ai && <div className="ai-plan-review"><div className="section-kicker">BEDROCK PLAN REVIEW</div><p>{plan.aiExplanation}</p>{!!plan.reviewNotes?.length && <ul>{plan.reviewNotes.map(note => <li key={note}>{note}</li>)}</ul>}<small className="ai-provenance">{plan.ai.modelId} · AI commentary for coordinator review</small></div>}
      {!!plan.unservedIds.length && <div className="error-banner" role="status">Unserved requests: {plan.unservedIds.join(', ')}. No feasible capacity/access in this plan; these requests remain open.</div>}
      <div className="route-cards">{plan.routes.map((route, index) => <article className="route-card" key={route.teamId} style={{ borderTopColor: ['#336e91', '#8d649b', '#bc8038'][index % 3] }}><h3>{board.teams.find(team => team.id === route.teamId)?.name}</h3><p>{route.load} / {board.teams.find(team => team.id === route.teamId)?.capacity} totes · {route.travelMinutes} min driving</p><ol>{route.stops.map(stop => {
        const incident = board.incidents.find(item => item.id === stop.incidentId)!;
        return <li key={stop.incidentId}><strong>{incident.location.label}</strong><span>{incident.id} · {incident.quantity} totes of {incident.category}</span><span>Arrival +{stop.arrivalMinutes} min · {incident.priority}</span></li>;
      })}</ol></article>)}</div>
      {plan.status === 'proposed' && <div className="plan-actions"><label className="confirmation"><input type="checkbox" checked={reviewedPlan === plan.id} onChange={event => setReviewedPlan(event.target.checked ? plan.id : null)} />I reviewed the team assignments, stop order, estimated arrivals and unserved requests.</label><button className="button primary" disabled={busy || reviewedPlan !== plan.id} onClick={() => onApprove(plan.id)}><ShieldCheck size={16} />Verify routes</button></div>}
      {plan.status === 'approved' && <div className="plan-actions"><p>Routes approved. Rescuers have not been alerted yet.</p><button className="button primary" disabled={busy} onClick={() => onAlert(plan.id)}><Send size={16} />{isDemo ? 'Alert rescuers · demo' : 'Alert rescuers'}</button></div>}
      {plan.status === 'alerted' && <div className="success"><CheckCircle2 size={18} />{isDemo ? 'Simulated alerts created. Review each team’s message below; no SMS or calls were sent.' : 'Alert requests submitted. Check delivery status below.'}</div>}
    </>}
    {!!board.alerts.length && <div className="alert-outbox"><div className="section-kicker">{isDemo ? 'SIMULATED RESCUER OUTBOX' : 'RESCUER OUTBOX'}</div>{board.alerts.map(alert => <article key={alert.id}><h4>{board.teams.find(team => team.id === alert.teamId)?.name}<span className="status">{alert.status}</span></h4><p>{alert.message}</p></article>)}</div>}
  </section>;
}
