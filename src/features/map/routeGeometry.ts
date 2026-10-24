import type { RoutePlan } from '../../../shared/contracts';
import type * as GeoJSON from 'geojson';

/** Only provider-returned road lines are drawn. Never bridge gaps between snapped stops. */
export function roadFeatures(plan: RoutePlan | null): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  return { type: 'FeatureCollection', features: plan?.routing?.provider === 'amazon-location' ? plan.routes.flatMap((route, index) => {
    const lines = route.roadLegs?.flatMap(leg => leg.lines).filter(line => line.length > 1) ?? [];
    return lines.length ? [{ type: 'Feature' as const, properties: { color: ['#4ea8de', '#b892ff', '#f4a259'][index % 3] }, geometry: { type: 'MultiLineString' as const, coordinates: lines } }] : [];
  }) : [] };
}
