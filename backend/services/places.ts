import { GeoPlacesClient, GeocodeCommand } from '@aws-sdk/client-geo-places';
import type { PlaceCandidate } from '../../shared/contracts';
import { InputError, object, text } from '../validation';
const client = new GeoPlacesClient({ maxAttempts: 2 });
export function position(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new InputError('Coordinates must be [longitude, latitude].');
  return [value[0], value[1]];
}
export function confirmedLocation(value: unknown) {
  const location = object(value);
  return { label: text(location.label, 'confirmed address', 500), coordinates: position(location.coordinates) };
}
export async function geocode(address: string): Promise<PlaceCandidate[]> {
  const response = await client.send(new GeocodeCommand({ QueryText: address, MaxResults: 5, IntendedUse: 'Storage' }), { abortSignal: AbortSignal.timeout(10000) });
  return (response.ResultItems ?? []).filter(r => r.Position && r.Address?.Label && r.PlaceId).map(r => ({ label: r.Address!.Label!, coordinates: position(r.Position), placeId: r.PlaceId! }));
}
