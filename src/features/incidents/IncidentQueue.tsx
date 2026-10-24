import { Droplets, Utensils, Pill, MapPin, ArrowUpRight, CircleHelp } from 'lucide-react';
import type { Incident } from '../../../shared/contracts';
export const statusLabels = { needs_review: 'Needs review', verified: 'Verified', assigned: 'Teams notified', delivered: 'Delivered' };
export function IncidentQueue({ incidents, selectedId, onSelect }: { incidents: Incident[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div className="incident-list">{incidents.length === 0 && <p className="empty">No requests match this filter.</p>}{incidents.map(item => {
    const Icon = item.categoryNeedsReview ? CircleHelp : item.category === 'water' ? Droplets : item.category === 'food' ? Utensils : Pill;
    return <button key={item.id} aria-pressed={selectedId === item.id} className={`incident-card ${selectedId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <div className="card-top"><span className={`category-icon ${item.category}`}><Icon size={17} /></span><span className="request-id">{item.id}</span><span className={`priority ${item.priority}`}>{item.origin === 'participant' && !item.ai && item.status === 'needs_review' ? 'Confirm urgency' : item.priority}</span></div>
      <h3>{item.title}</h3><p className="location"><MapPin size={12} />{item.location.label}</p>
      <div className="card-bottom"><span>{item.people || '?'} people · {item.quantity || '?'} {item.unit}</span><ArrowUpRight size={15} /></div>
      <span className={`status status-${item.status}`}>{statusLabels[item.status]}</span>
    </button>;
  })}</div>;
}
