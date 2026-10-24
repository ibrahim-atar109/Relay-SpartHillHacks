import { useState } from 'react';
import { Check, Sparkles, ShieldCheck, MessageSquare } from 'lucide-react';
import type { Incident, IncidentAction, Priority } from '../../../shared/contracts';
import { nodes } from '../../data/network';
import { isDemo } from '../../services/api';
import { aiConfigured, aiSignedIn } from '../../services/ai';
import { statusLabels } from './IncidentQueue';

export function IncidentDetail({ incident, busy, onAction, onAnalyze }: {
  incident: Incident | undefined; busy: boolean; onAction: (id: string, action: IncidentAction) => void; onAnalyze: (id: string, followUp: string) => void;
}) {
  if (!incident) return <aside className="detail"><p className="empty">Select a report to review the collected data.</p></aside>;
  return <DetailForm key={incident.id + incident.status + (incident.ai?.requestId ?? '')} incident={incident} busy={busy} onAction={onAction} onAnalyze={onAnalyze} />;
}
function DetailForm({ incident, busy, onAction, onAnalyze }: { incident: Incident; busy: boolean; onAction: (id: string, action: IncidentAction) => void; onAnalyze: (id: string, followUp: string) => void }) {
  const [nodeId, setNodeId] = useState(incident.nodeId || '');
  const [people, setPeople] = useState(incident.people);
  const [quantity, setQuantity] = useState(incident.quantity);
  const [priority, setPriority] = useState<Priority>(incident.priority);
  const [confirmed, setConfirmed] = useState(false);
  const [category, setCategory] = useState<Incident['category'] | ''>(incident.categoryNeedsReview ? '' : incident.category);
  const [followUp, setFollowUp] = useState('');
  const reviewing = incident.status === 'needs_review';
  const valid = !!category && !!nodeId && Number.isInteger(people) && people > 0 && Number.isInteger(quantity) && quantity > 0;
  return <aside className="detail">
    <div className="section-kicker">STEP 1 · VERIFY COLLECTED DATA <span>{incident.id}</span></div>
    <h2>{incident.title}</h2><span className={`status status-${incident.status}`}>{statusLabels[incident.status]}</span>
    <div className="detail-section"><h4><MessageSquare size={15} /> {incident.ai ? 'Original report' : isDemo ? 'Synthetic source' : 'Original report'} · {incident.source}</h4><blockquote>“{incident.originalReport}”</blockquote>{incident.followUps?.map((entry, i) => <blockquote key={i}>Follow-up: {entry}</blockquote>)}</div>
    <div className="detail-section"><h4><Sparkles size={15} /> {incident.ai ? 'Bedrock extraction' : isDemo ? 'Simulated extraction' : 'Collected data'}</h4><p>{incident.summary}</p>{incident.ai && <small className="ai-provenance">{incident.ai.modelId} · {new Date(incident.ai.at).toLocaleTimeString()}</small>}</div>
    {reviewing && aiConfigured && isDemo && <div className="detail-section">
      {!!incident.clarificationQuestions?.length && <><h4>Questions to clarify with the reporter</h4><ul className="missing">{incident.clarificationQuestions.map(q => <li key={q}>{q}</li>)}</ul></>}
      <label className="field">Additional details from reporter (optional)<textarea rows={3} maxLength={2000} value={followUp} onChange={e => setFollowUp(e.target.value)} disabled={busy} /></label>
      <button type="button" className="button secondary full" disabled={busy || !aiSignedIn()} onClick={() => onAnalyze(incident.id, followUp)}><Sparkles size={15} />Analyze with Bedrock</button>
    </div>}
    {reviewing ? <form onSubmit={event => {
      event.preventDefault();
      if (confirmed && valid && category) onAction(incident.id, { type: 'verify', corrections: { nodeId, people, quantity, priority, category } });
    }}>
      <p className="review-hint">Review and correct these fields. This report stays off the map until you verify it.</p>
      {!!incident.missingInfo.length && <ul className="missing">{incident.missingInfo.map(info => <li key={info}>{info}</li>)}</ul>}
      <label className="field">Supply category<select value={category} required onChange={e => { setCategory(e.target.value as Incident['category']); setConfirmed(false); }}><option value="">Confirm supply category</option><option value="water">Water</option><option value="food">Food</option><option value="medicine">Medicine</option></select></label>
      <label className="field">Confirmed location<select value={nodeId} onChange={event => { setNodeId(event.target.value); setConfirmed(false); }} required><option value="">Choose the confirmed location</option>{Object.entries(nodes).map(([id, node]) => <option key={id} value={id}>{node.label}</option>)}</select></label>
      <div className="field-row"><label className="field">People affected<input type="number" min="1" step="1" value={people || ''} onChange={event => { setPeople(Number(event.target.value)); setConfirmed(false); }} required /></label><label className="field">Supply totes<input type="number" min="1" step="1" value={quantity || ''} onChange={event => { setQuantity(Number(event.target.value)); setConfirmed(false); }} required /></label></div>
      <label className="field">Urgency<select value={priority} onChange={event => { setPriority(event.target.value as Priority); setConfirmed(false); }}><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label>
      <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I checked the source and confirmed these details.</label>
      <button className="button primary full" disabled={busy || !valid || !confirmed}><ShieldCheck size={16} />Verify data & add to map</button>
    </form> : <>
      <div className="success"><ShieldCheck size={17} /> Verified · {incident.location.label}</div>
      {incident.status === 'verified' && <p className="review-hint">Included in route planning below. Verify the proposed routes before alerting rescuers.</p>}
      {incident.status === 'assigned' && <button className="button secondary full" disabled={busy} onClick={() => onAction(incident.id, { type: 'deliver' })}><Check size={16} />Confirm delivery</button>}
      {incident.status === 'delivered' && <p className="review-hint">Delivery recorded as complete.</p>}
    </>}
  </aside>;
}
