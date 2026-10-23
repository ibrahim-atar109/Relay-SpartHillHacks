import { useEffect, useState } from 'react';
import { Check, Sparkles, ShieldCheck, MessageSquare, Users, MapPin } from 'lucide-react';
import type { Incident, IncidentAction, Recommendation, Team } from '../../../shared/contracts';
import { api, isDemo } from '../../services/api';
import { statusLabels } from './IncidentQueue';

export function IncidentDetail({ incident, teams, busy, onAction }: { incident: Incident | undefined; teams: Team[]; busy: boolean; onAction: (id: string, action: IncidentAction) => void }) {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setRecommendation(null); setError('');
    if (!incident || incident.status !== 'verified') { setLoading(false); return; }
    setLoading(true);
    api.getRecommendation(incident.id).then(value => { if (active) setRecommendation(value); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [incident, teams]);
  if (!incident) return <aside className="detail"><p className="empty">Select a request to review its details.</p></aside>;
  const team = teams.find(item => item.id === incident.teamId);
  return <aside className="detail">
    <div className="section-kicker">REQUEST DETAILS <span>{incident.id}</span></div>
    <h2>{incident.title}</h2><span className={`status status-${incident.status}`}>{statusLabels[incident.status]}</span>
    <div className="detail-facts"><div><Users size={16} /><span>{incident.people} people affected</span></div><div><MapPin size={16} /><span>{incident.location.label}</span></div></div>
    <div className="detail-section"><h4><Sparkles size={15} /> {isDemo ? 'Prepared summary · demo' : 'AI summary'}</h4><p>{incident.summary}</p></div>
    <div className="detail-section"><h4><MessageSquare size={15} /> Original report · {incident.source}</h4><blockquote>“{incident.originalReport}”</blockquote></div>
    <div className="detail-section"><h4><ShieldCheck size={15} /> Verification</h4>
      {incident.missingInfo.length ? <ul className="missing">{incident.missingInfo.map(info => <li key={info}>{info}</li>)}</ul> : <p className="verification"><Check size={14} /> Required fields are present. Review source before approval.</p>}
    </div>
    {incident.status === 'verified' && <div className="recommendation"><h4><Sparkles size={16} /> Proposed assignment</h4><p>{loading ? 'Checking available teams…' : error || recommendation?.reason || 'No feasible team is currently available.'}</p>{recommendation && <button className="button primary full" disabled={busy || loading} onClick={() => onAction(incident.id, { type: 'assign', teamId: recommendation.teamId })}><Check size={16} /> Approve assignment</button>}</div>}
    {incident.status === 'needs_review' && <button className="button primary full" disabled={busy || !incident.location.coordinates || !!incident.missingInfo.length} onClick={() => onAction(incident.id, { type: 'verify' })}><ShieldCheck size={16} /> Verify report</button>}
    {incident.status === 'assigned' && <div className="recommendation"><h4>Assigned to {team?.name || 'team'}</h4><p>Confirm receipt with the recipient before completing this request.</p><button className="button primary full" disabled={busy} onClick={() => onAction(incident.id, { type: 'deliver' })}><Check size={16} /> Confirm delivery</button></div>}
    {incident.status === 'delivered' && <div className="success"><Check size={18} /> Delivery confirmed</div>}
  </aside>;
}
