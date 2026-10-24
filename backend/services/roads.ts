import { CalculateRouteMatrixCommand, CalculateRoutesCommand, GeoRoutesClient } from '@aws-sdk/client-geo-routes';
import type { Board, RoadLeg, RoutePlan } from '../../shared/contracts';
import { nodes } from '../../src/data/network';
import { generatePlan, type PathFinder } from '../../src/features/operations/planner';
import { InputError } from '../validation';

const client = new GeoRoutesClient({ maxAttempts: 1 });
export class RoadRoutingError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'RoadRoutingError'; }
}
const validNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function coordinates(value: number[][] | undefined): [number, number][] {
  if (!value || value.length < 2 || value.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new RoadRoutingError('Amazon Location returned incomplete road geometry.');
  return value.map(p => [p[0], p[1]]);
}

/** The solver uses directed road costs, including asymmetric one-way travel. */
export async function prepareRoadPlan(board: Board, signal: AbortSignal): Promise<RoutePlan> {
  const requests = board.incidents.filter(i => i.status === 'verified');
  if (!requests.length) throw new InputError('Verify at least one report before generating routes.');
  const teams = board.teams.filter(t => t.status === 'available');
  if (!teams.length) throw new InputError('No teams are currently available.');
  const origins = [...new Set([...teams.map(t => t.nodeId), ...requests.map(i => i.nodeId!)])];
  const destinations = [...new Set(requests.map(i => i.nodeId!))];
  let matrix;
  try {
    matrix = await client.send(new CalculateRouteMatrixCommand({
      Origins: origins.map(id => ({ Position: nodes[id].coordinates })),
      Destinations: destinations.map(id => ({ Position: nodes[id].coordinates })),
      RoutingBoundary: { Geometry: { AutoCircle: { Margin: 2000 } } },
      TravelMode: 'Car', OptimizeRoutingFor: 'FastestRoute', Traffic: { Usage: 'IgnoreTrafficData' },
    }), { abortSignal: signal });
  } catch (error) { throw new RoadRoutingError('Road travel times could not be loaded. Check Amazon Location permissions and retry.', error); }
  if (!matrix.RouteMatrix || matrix.RouteMatrix.length !== origins.length || matrix.RouteMatrix.some(row => row.length !== destinations.length)) throw new RoadRoutingError('Amazon Location returned an incomplete travel-time matrix.');
  const costs = new Map<string, number | null>();
  matrix.RouteMatrix.forEach((row, from) => row.forEach((cell, to) => {
    if (cell.Error && cell.Error !== 'NoRoute') throw new RoadRoutingError(`Amazon Location could not match a sample location to the road network (${cell.Error}).`);
    if (!cell.Error && (!validNumber(cell.Duration) || !validNumber(cell.Distance))) throw new RoadRoutingError('Amazon Location returned invalid road travel times.');
    costs.set(`${origins[from]}/${destinations[to]}`, cell.Error ? null : cell.Duration! / 60);
  }));
  const findPath: PathFinder = (from, to) => {
    const minutes = costs.get(`${from}/${to}`);
    return minutes === null || minutes === undefined ? null : { minutes, coordinates: [], edgeIds: [] };
  };
  let plan;
  try { plan = generatePlan(board, findPath); }
  catch (error) { throw new InputError(error instanceof Error ? error.message : 'No feasible road routes.'); }
  return {
    ...plan,
    explanation: 'Assignments and stop order maximize served urgency weight, then minimize urgency-weighted arrival time using Amazon Location driving times and one-way road restrictions. Capacity and supply compatibility are checked. Assumes preloaded supplies, simultaneous departure, two minutes at each stop and no return trip. Travel times exclude live traffic; sample locations are snapped to road access points. The fictional demo closure is not a real road closure.',
    routing: { provider: 'amazon-location', travelMode: 'Car', calculatedAt: new Date().toISOString(), traffic: 'disabled', notices: [
      'Sample locations are not verified real facilities. Confirm the road access point for each stop.',
      'The scenario’s c-e closure does not represent a real road closure and is not applied to road routing.',
    ] },
  };
}

/** Fetch each chosen leg independently; do not draw connectors across snapped access points. */
export async function attachRoadGeometry(board: Board, plan: RoutePlan, signal: AbortSignal): Promise<RoutePlan> {
  const jobs = plan.routes.flatMap(route => {
    let from = board.teams.find(t => t.id === route.teamId)!.nodeId;
    return route.stops.map(stop => {
      const to = board.incidents.find(i => i.id === stop.incidentId)!.nodeId!;
      const job = { teamId: route.teamId, from, to, incidentId: stop.incidentId }; from = to; return job;
    });
  });
  const results = new Map<string, RoadLeg>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      if (job.from === job.to) {
        results.set(`${job.teamId}/${job.incidentId}`, { incidentId: job.incidentId, lines: [], distanceMeters: 0, durationMinutes: 0, directions: [{ instruction: 'Already at this stop’s road access point.', distanceMeters: 0 }] });
        continue;
      }
      let response;
      try {
        response = await client.send(new CalculateRoutesCommand({
          Origin: nodes[job.from].coordinates, Destination: nodes[job.to].coordinates,
          TravelMode: 'Car', OptimizeRoutingFor: 'FastestRoute', Traffic: { Usage: 'IgnoreTrafficData' },
          LegGeometryFormat: 'Simple', LegAdditionalFeatures: ['TravelStepInstructions', 'Summary'],
          TravelStepType: 'Default', Languages: ['en'], MaxAlternatives: 0,
        }), { abortSignal: signal });
      } catch (error) { throw new RoadRoutingError('Road directions could not be loaded. Check Amazon Location permissions and retry.', error); }
      const route = response.Routes?.[0];
      if (!route?.Legs?.length || !validNumber(route.Summary?.Distance) || !validNumber(route.Summary?.Duration)) throw new RoadRoutingError('Amazon Location did not return a complete driving route.');
      const lines = route.Legs.map(leg => coordinates(leg.Geometry?.LineString));
      const directions = route.Legs.flatMap(leg => (leg.VehicleLegDetails?.TravelSteps ?? []).flatMap(step => step.Instruction ? [{ instruction: step.Instruction, distanceMeters: step.Distance ?? 0 }] : []));
      results.set(`${job.teamId}/${job.incidentId}`, { incidentId: job.incidentId, lines, distanceMeters: route.Summary.Distance, durationMinutes: route.Summary.Duration / 60, directions });
    }
  }));
  const routes = plan.routes.map(route => {
    const roadLegs = route.stops.map(stop => results.get(`${route.teamId}/${stop.incidentId}`)!);
    let elapsed = 0;
    const stops = route.stops.map((stop, i) => { elapsed += roadLegs[i].durationMinutes; const arrivalMinutes = elapsed; elapsed += 2; return { ...stop, arrivalMinutes }; });
    return { ...route, roadLegs, stops, distanceMeters: roadLegs.reduce((s, leg) => s + leg.distanceMeters, 0), travelMinutes: roadLegs.reduce((s, leg) => s + leg.durationMinutes, 0), coordinates: roadLegs.flatMap(leg => leg.lines.flat()), edgeIds: [] };
  });
  const weights = { critical: 8, high: 3, normal: 1 };
  return { ...plan, routes, weightedArrivalMinutes: routes.reduce((sum, route) => sum + route.stops.reduce((s, stop) => s + weights[board.incidents.find(i => i.id === stop.incidentId)!.priority] * stop.arrivalMinutes, 0), 0) };
}
