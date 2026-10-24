import { useState } from 'react';
import type { Board, PlaceCandidate, Team } from '../../../shared/contracts';
import { PlacePicker } from '../reporting/PlacePicker';
import { api } from '../../services/api';
export function TeamEditor({ teams, version, busy, onSaved, onWorking }: { teams: Team[]; version?: number; busy: boolean; onSaved: (board: Board) => void; onWorking: (working: boolean) => void }) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [members, setMembers] = useState(2);
  const [capacity, setCapacity] = useState(10);
  const [status, setStatus] = useState<'available' | 'offline'>('available');
  const [capabilities, setCapabilities] = useState<Team['capabilities']>(['water']);
  const [place, setPlace] = useState<PlaceCandidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  const [editVersion, setEditVersion] = useState(version);
  return <details className="detail-section"><summary>Manage teams and depots</summary><form onSubmit={async e => {
    e.preventDefault(); if (!place) return;
    setSaving(true); onWorking(true); setError('');
    try {
      const next = await api.saveTeam({ ...(selected ? { id: selected } : {}), name, members, capacity, status, capabilities, location: place }, selected ? editVersion : undefined);
      onSaved(next); setEditVersion(next.version); if (!selected) setSelected(next.teams.at(-1)!.id); setError('Team saved.');
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save team.'); }
    finally { setSaving(false); onWorking(false); }
  }}><fieldset disabled={busy || saving}>
    <label className="field">Team<select value={selected} onChange={e => {
      const team = teams.find(t => t.id === e.target.value); setSelected(e.target.value); setEditVersion(version);
      setName(team?.name ?? ''); setMembers(team?.members ?? 2); setCapacity(team?.capacity ?? 10); setStatus(team?.status === 'offline' ? 'offline' : 'available'); setCapabilities(team?.capabilities ?? ['water']); setPlace(team ? { placeId: team.id, label: team.depotLabel ?? 'Saved depot', coordinates: team.coordinates } : null); setPickerKey(v => v + 1); setError('');
    }}><option value="">Add a new team</option>{teams.map(t => <option value={t.id} key={t.id} disabled={t.status === 'assigned'}>{t.name}{t.status === 'assigned' ? ' · finish deliveries before editing' : ''}</option>)}</select></label>
    <label className="field">Team name<input value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></label>
    <div className="field-row"><label className="field">Members<input type="number" min={1} max={100} step={1} value={members} onChange={e => setMembers(Number(e.target.value))} required /></label><label className="field">Capacity (totes)<input type="number" min={1} max={10000} step={1} value={capacity} onChange={e => setCapacity(Number(e.target.value))} required /></label></div>
    <label className="field">Availability<select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="available">Available</option><option value="offline">Offline</option></select></label>
    <p className="review-hint">Supplies this team can carry</p>{(['water','food','medicine'] as const).map(c => <label className="confirmation" key={c}><input type="checkbox" checked={capabilities.includes(c)} onChange={e => setCapabilities(prior => e.target.checked ? [...prior,c] : prior.filter(v => v !== c))} />{c}</label>)}
    <PlacePicker key={pickerKey} label="Depot address including city and region" initialQuery={place?.label ?? ''} value={place} onChange={setPlace} />
    <button className="button primary" disabled={!place || !capabilities.length || !name.trim()}>{saving ? 'Saving…' : 'Save team and depot'}</button>
    <p className="review-hint">Supplies are assumed preloaded. This sets a starting depot, not inventory or vehicle GPS tracking.</p>
  </fieldset>{error && <p role="status">{error}</p>}</form></details>;
}
