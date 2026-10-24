import { useState } from 'react';
import { Route, ShieldCheck, Send, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
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
  const needsAiLogin = aiConfigured && !aiSignedIn();
  return <section id="routes" className="plan-panel" aria-label="Route planning and rescuer alerts">
    <div className="plan-header"><div><div className="section-kicker">The next step</div><h2>A plan for every helping hand.</h2><p>{verified} verified requests ready · {unverified} awaiting review</p>{needsAiLogin && <p role="status"><a href="#report-intake" onClick={() => { const intake = document.getElementById('report-intake'); if (intake instanceof HTMLDetailsElement) intake.open = true; }}>Sign in to AI</a> to enable route planning.</p>}</div><button className="button primary" disabled={busy || !verified || needsAiLogin} onClick={onGenerate}><Route size={17} />{busy ? 'Working…' : 'Plan routes'}</button></div>
    {!plan ? <div className="plan-empty"><span className="empty-route-icon"><Route size={24} /></span><div><strong>Your next route starts with a verified report.</strong><p>Review a request above, then plan the stops. You’ll approve every route before teams are notified.</p></div></div> : <>
      <div className="plan-summary"><span className={`status plan-${plan.status}`}>{plan.status === 'proposed' ? 'Awaiting your route verification' : plan.status === 'approved' ? 'Routes verified · Ready to alert' : 'Plan dispatched'}</span><span>{plan.routes.length} teams · {plan.routes.reduce((sum, route) => sum + route.stops.length, 0)} stops · {Math.ceil(plan.routes.reduce((sum, route) => sum + route.travelMinutes, 0))} total drive minutes</span></div>
      <details className="plan-context"><summary>How this plan was built<ChevronDown size={15} /></summary><p className="planner-explanation">{plan.explanation}</p>
      {plan.routing ? <div className="road-notices"><strong>Road routes · Amazon Location · {new Date(plan.routing.calculatedAt).toLocaleTimeString()}</strong>{plan.routing.notices.map(note => <p key={note}>{note}</p>)}</div> : <p className="review-hint">This plan has no road geometry. Connect the updated AWS backend and generate routes again to display driving paths.</p>}
      </details>
      {plan.ai && <div className="ai-plan-review"><div className="section-kicker"><Sparkles size={14} />Plan insights</div><p>{plan.aiExplanation}</p>{!!plan.reviewNotes?.length && <ul>{plan.reviewNotes.map(note => <li key={note}>{note}</li>)}</ul>}<details className="provenance-details"><summary>AI source details</summary><small className="ai-provenance">{plan.ai.modelId} · For coordinator review</small></details></div>}
      {!!plan.unservedIds.length && <div className="error-banner" role="status">Unserved requests: {plan.unservedIds.join(', ')}. No feasible capacity/access in this plan; these requests remain open.</div>}
      <div className="route-cards">{plan.routes.map((route, index) => <article className="route-card" key={route.teamId} style={{ borderTopColor: ['#336e91', '#8d649b', '#bc8038'][index % 3] }}><h3>{board.teams.find(team => team.id === route.teamId)?.name}</h3><p>{route.load} / {board.teams.find(team => team.id === route.teamId)?.capacity} totes · {Math.ceil(route.travelMinutes)} min driving{route.distanceMeters !== undefined && ` · ${(route.distanceMeters / 1000).toFixed(1)} km`}</p><ol>{route.stops.map(stop => {
        const incident = board.incidents.find(item => item.id === stop.incidentId)!;
        const leg = route.roadLegs?.find(l => l.incidentId === stop.incidentId);
        return <li key={stop.incidentId}><strong>{incident.location.label}</strong><span>{incident.id} · {incident.quantity} totes of {incident.category}</span><span>Arrival +{Math.ceil(stop.arrivalMinutes)} min · {incident.priority}</span>{leg && <details className="road-directions"><summary>Driving directions · {(leg.distanceMeters / 1000).toFixed(1)} km</summary><ol>{leg.directions.map((step, i) => <li key={i}>{step.instruction}{step.distanceMeters > 0 && <span>{step.distanceMeters < 1000 ? `${Math.round(step.distanceMeters)} m` : `${(step.distanceMeters / 1000).toFixed(1)} km`}</span>}</li>)}</ol></details>}</li>;
      })}</ol></article>)}</div>
      {plan.status === 'proposed' && <div className="plan-actions"><label className="confirmation"><input type="checkbox" checked={reviewedPlan === plan.id} onChange={event => setReviewedPlan(event.target.checked ? plan.id : null)} />I reviewed the team assignments, stop order, estimated arrivals and unserved requests.</label><button className="button primary" disabled={busy || reviewedPlan !== plan.id} onClick={() => onApprove(plan.id)}><ShieldCheck size={16} />Verify routes</button></div>}
      {plan.status === 'approved' && <div className="plan-actions"><p>Routes approved. No external notification will be sent; this action reserves teams and creates simulated outbox messages.</p><button className="button primary" disabled={busy} onClick={() => onAlert(plan.id)}><Send size={16} />Assign teams · simulated alerts</button></div>}
      {plan.status === 'alerted' && <div className="success"><CheckCircle2 size={18} />Assignments saved and simulated alerts created. No SMS, email or calls were sent.</div>}
    </>}
    {!!board.alerts.length && <details className="alert-outbox"><summary>{isDemo ? 'Simulated team messages' : 'Team messages'} · {board.alerts.length}<ChevronDown size={16} /></summary>{board.alerts.map(alert => <article key={alert.id}><h4>{board.teams.find(team => team.id === alert.teamId)?.name}<span className="status">{alert.status}</span></h4><p>{alert.message}</p></article>)}</details>}
  </section>;
}
