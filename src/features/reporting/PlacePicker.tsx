import { useState } from 'react';
import type { PlaceCandidate } from '../../../shared/contracts';
import { api } from '../../services/api';
export function PlacePicker({ label = 'Address including city and region', initialQuery = '', value, onChange, disabled = false }: { label?: string; initialQuery?: string; value: PlaceCandidate | null; onChange: (place: PlaceCandidate | null) => void; disabled?: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  return <div className="detail-section">
    <label className="field">{label}<input value={query} maxLength={500} disabled={disabled || loading} onChange={e => { setQuery(e.target.value); onChange(null); setResults([]); }} placeholder="123 Main Street, city, state" /></label>
    <button type="button" className="button secondary" disabled={disabled || loading || !query.trim()} onClick={async () => {
      setLoading(true); setError(''); onChange(null); setResults([]);
      try { const candidates = await api.geocode(query.trim()); setResults(candidates); if (!candidates.length) setError('No address found. Add the city, state or country and retry.'); }
      catch (err) { setError(err instanceof Error ? err.message : 'Address lookup failed.'); }
      finally { setLoading(false); }
    }}>{loading ? 'Looking up…' : 'Look up address'}</button>
    {!!results.length && <label className="field">Choose the matching address<select value={value?.placeId ?? ''} disabled={disabled} onChange={e => onChange(results.find(r => r.placeId === e.target.value) ?? null)}><option value="">Review and choose a result</option>{results.map(r => <option key={r.placeId} value={r.placeId}>{r.label}</option>)}</select></label>}
    {value && <p className="review-hint">{value.label}<br />{value.coordinates[1].toFixed(5)}, {value.coordinates[0].toFixed(5)} · Confirm the actual access point.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </div>;
}
