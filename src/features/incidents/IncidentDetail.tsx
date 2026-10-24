import { useState } from 'react';
import { Check, Sparkles, ShieldCheck, MessageSquare } from 'lucide-react';
import type { Incident, IncidentAction, Priority } from '../../../shared/contracts';
import { nodes } from '../../data/network';
import { isDemo } from '../../services/api';
import { statusLabels } from './IncidentQueue';

export function IncidentDetail({ incident, busy, onAction }: {
  incident: Incident | undefined; busy: boolean; onAction: (id: string, action: IncidentAction) => void;
}) {
  if (!incident) return <aside className="detail"><p className="empty">Select a report to review the collected data.</p></aside>;
  return <DetailForm key={incident.id + incident.status} incident={incident} busy={busy} onAction={onAction} />;
}
function DetailForm({ incident, busy, onAction }: { incident: Incident; busy: boolean; onAction: (id: string, action: IncidentAction) => void }) {
  const [category, setCategory] = useState<Incident['category'] | ''>(incident.origin === 'participant' ? '' : incident.category);
  const [nodeId, setNodeId] = useState(incident.nodeId || '');
  const [people, setPeople] = useState(incident.people);
  const [quantity, setQuantity] = useState(incident.quantity);
  const [priority, setPriority] = useState<Priority | ''>(incident.origin === 'participant' && incident.status === 'needs_review' ? '' : incident.priority);
  const [confirmed, setConfirmed] = useState(false);
  const reviewing = incident.status === 'needs_review';
  const valid = !!priority && !!category && !!nodeId && Number.isInteger(people) && people > 0 && Number.isInteger(quantity) && quantity > 0;
  return <aside className="detail">
    <div className="section-kicker">STEP 1 · VERIFY COLLECTED DATA <span>{incident.id}</span></div>
    <h2>{incident.title}</h2><span className={`status status-${incident.status}`}>{statusLabels[incident.status]}</span>
    <div className="detail-section"><h4><MessageSquare size={15} /> {incident.origin === 'participant' ? 'Participant recording' : isDemo ? 'Synthetic source' : 'Original report'} · {incident.source}</h4><blockquote>“{incident.originalReport}”</blockquote>{incident.recordings?.length ? incident.recordings.map((recording, index) => <audio key={recording.audioUrl} controls src={recording.audioUrl} aria-label={`Caller reply ${index+1}`} style={{ width: '100%' }} />) : incident.audioUrl && <audio controls src={incident.audioUrl} aria-label="Original voice recording" style={{ width: '100%' }} />}</div>
    <div className="detail-section"><h4><Sparkles size={15} /> {incident.origin === 'participant' ? reviewing ? 'Needs coordinator review' : 'Reviewed report details' : isDemo ? 'Simulated extraction' : 'Collected data'}</h4><p>{incident.summary}</p></div>
    {reviewing ? <form onSubmit={event => {
      event.preventDefault();
      if (confirmed && valid && category && priority) onAction(incident.id, { type: 'verify', corrections: { nodeId, people, quantity, priority, category } });
    }}>
      <p className="review-hint">Review and correct these fields. This report stays off the map until you verify it.</p>
      {!!incident.missingInfo.length && <ul className="missing">{incident.missingInfo.map(info => <li key={info}>{info}</li>)}</ul>}
      {incident.origin === 'participant' && <label className="field">Confirmed supply category<select value={category} required onChange={event => { setCategory(event.target.value as Incident['category']); setConfirmed(false); }}><option value="">Choose after reviewing the caller</option><option value="water">Water</option><option value="food">Food</option><option value="medicine">Medicine</option></select></label>}
      <label className="field">Confirmed location<select value={nodeId} onChange={event => { setNodeId(event.target.value); setConfirmed(false); }} required><option value="">Choose the confirmed location</option>{Object.entries(nodes).map(([id, node]) => <option key={id} value={id}>{node.label}</option>)}</select></label>
      <div className="field-row"><label className="field">People affected<input type="number" min="1" step="1" value={people || ''} onChange={event => { setPeople(Number(event.target.value)); setConfirmed(false); }} required /></label><label className="field">Supply totes<input type="number" min="1" step="1" value={quantity || ''} onChange={event => { setQuantity(Number(event.target.value)); setConfirmed(false); }} required /></label></div>
      <label className="field">Urgency<select value={priority} onChange={event => { setPriority(event.target.value as Priority); setConfirmed(false); }}><option value="">Choose after reviewing the caller</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label>
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
