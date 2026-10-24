import type { Board, Incident, RoutePlan, Team, TeamRoute } from '../../../shared/contracts';
import { shortestPath } from '../../data/network';

const weights = { critical: 8, high: 3, normal: 1 };
interface Option { mask: number; cost: number; route: TeamRoute }
export type PathFinder = (start: string, end: string, blocked: string[]) => { minutes: number; coordinates: [number, number][]; edgeIds: string[] } | null;

/** Enumerate every feasible stop order. Small demo limit keeps exact search bounded. */
function optionsFor(team: Team, requests: Incident[], blocked: string[], findPath: PathFinder): Option[] {
  const best = new Map<number, Option>();
  function visit(mask: number, at: string, load: number, elapsed: number, cost: number, route: TeamRoute) {
    const prior = best.get(mask);
    if (!prior || cost < prior.cost) best.set(mask, { mask, cost, route });
    requests.forEach((request, index) => {
      if ((mask & (1 << index)) || !request.nodeId || !team.capabilities.includes(request.category) || load + request.quantity > team.capacity) return;
      const path = findPath(at, request.nodeId, blocked);
      if (!path) return;
      const arrival = elapsed + path.minutes;
      visit(mask | (1 << index), request.nodeId, load + request.quantity, arrival + 2,
        cost + weights[request.priority] * arrival, {
          teamId: team.id, load: load + request.quantity,
          travelMinutes: route.travelMinutes + path.minutes,
          stops: [...route.stops, { incidentId: request.id, arrivalMinutes: arrival }],
          coordinates: [...route.coordinates, ...path.coordinates.slice(1)],
          edgeIds: [...route.edgeIds, ...path.edgeIds],
        });
    });
  }
  visit(0, team.nodeId, 0, 0, 0, { teamId: team.id, stops: [], coordinates: [team.coordinates], edgeIds: [], travelMinutes: 0, load: 0 });
  return [...best.values()];
}

export function generatePlan(board: Board, findPath: PathFinder = shortestPath): RoutePlan {
  const requests = board.incidents.filter(item => item.status === 'verified');
  if (!requests.length) throw new Error('Verify at least one report before generating routes.');
  if (requests.length > 40) throw new Error('Plan at most 40 verified requests at a time.');
  if (requests.some(item => !item.nodeId || !item.location.coordinates || item.missingInfo.length || item.quantity <= 0)) throw new Error('Verified requests contain incomplete routing data.');
  const teams = board.teams.filter(team => team.status === 'available');
  if (requests.length > 8) return greedyPlan(board, requests, teams, findPath);
  // Dynamic programming across teams finds the cheapest non-overlapping set of routes.
  let states = new Map<number, { cost: number; routes: TeamRoute[] }>([[0, { cost: 0, routes: [] }]]);
  for (const team of teams) {
    const options = optionsFor(team, requests, board.blockedEdgeIds, findPath);
    const next = new Map<number, { cost: number; routes: TeamRoute[] }>();
    for (const [used, state] of states) {
      for (const option of options) {
        if (used & option.mask) continue;
        const mask = used | option.mask; const cost = state.cost + option.cost;
        if (!next.has(mask) || cost < next.get(mask)!.cost) next.set(mask, { cost, routes: option.mask ? [...state.routes, option.route] : state.routes });
      }
    }
    states = next;
  }
  let winningMask = 0; let winningWeight = -1;
  let winner = { cost: Infinity, routes: [] as TeamRoute[] };
  for (const [mask, state] of states) {
    const weight = requests.reduce((sum, request, i) => sum + ((mask & (1 << i)) ? weights[request.priority] : 0), 0);
    if (weight > winningWeight || (weight === winningWeight && state.cost < winner.cost)) {
      winningMask = mask; winningWeight = weight; winner = state;
    }
  }
  if (!winner.routes.length) throw new Error('No feasible routes: check available teams, capacity and network access.');
  return {
    id: crypto.randomUUID(), revision: board.revision, status: 'proposed', routes: winner.routes,
    unservedIds: requests.filter((_, index) => !(winningMask & (1 << index))).map(item => item.id),
    weightedArrivalMinutes: winner.cost,
    explanation: 'Exact optimizer on the synthetic network: maximize served urgency weight, then minimize urgency-weighted arrival time (critical 8, high 3, normal 1). Checks vehicle capacity, supply compatibility and blocked links. Assumes supplies are preloaded, simultaneous departure, 2 minutes per stop and no return trip. Schematic routes and estimated times are for this demo only.',
  };
}

/** Bounded urgency-first assignment; intentionally no claim of global optimality. */
function greedyPlan(board: Board, requests: Incident[], teams: Team[], findPath: PathFinder): RoutePlan {
  const routes = teams.map(team => ({ teamId: team.id, stops: [], coordinates: [team.coordinates], edgeIds: [], travelMinutes: 0, load: 0 } as TeamRoute));
  const locations = teams.map(t => t.nodeId);
  const elapsed = teams.map(() => 0);
  const remaining = new Set(requests.map(r => r.id));
  for (const request of [...requests].sort((a,b) => weights[b.priority] - weights[a.priority] || a.id.localeCompare(b.id))) {
    let best: { index: number; path: NonNullable<ReturnType<PathFinder>>; arrival: number } | undefined;
    teams.forEach((team, index) => {
      if (!team.capabilities.includes(request.category) || routes[index].load + request.quantity > team.capacity) return;
      const path = findPath(locations[index], request.nodeId!, board.blockedEdgeIds);
      if (path && (!best || elapsed[index] + path.minutes < best.arrival)) best = { index, path, arrival: elapsed[index] + path.minutes };
    });
    if (!best) continue;
    const { index, path, arrival } = best;
    routes[index].stops.push({ incidentId: request.id, arrivalMinutes: arrival });
    routes[index].load += request.quantity; routes[index].travelMinutes += path.minutes;
    routes[index].coordinates.push(...path.coordinates.slice(1)); routes[index].edgeIds.push(...path.edgeIds);
    locations[index] = request.nodeId!; elapsed[index] = arrival + 2; remaining.delete(request.id);
  }
  const chosen = routes.filter(r => r.stops.length);
  if (!chosen.length) throw new Error('No feasible routes: check available teams, capacity and network access.');
  const cost = (route: TeamRoute) => route.stops.reduce((s,stop) => s + weights[requests.find(i => i.id === stop.incidentId)!.priority] * stop.arrivalMinutes, 0);
  const improved = chosen.map(route => {
    const team = teams.find(t => t.id === route.teamId)!;
    function rebuild(ids: string[]): TeamRoute | null {
      let at = team.nodeId; let elapsed = 0;
      const next: TeamRoute = { teamId: team.id, stops: [], coordinates: [team.coordinates], edgeIds: [], travelMinutes: 0, load: route.load };
      for (const id of ids) {
        const request = requests.find(i => i.id === id)!; const path = findPath(at,request.nodeId!,board.blockedEdgeIds);
        if (!path) return null;
        elapsed += path.minutes; next.stops.push({incidentId:id,arrivalMinutes:elapsed}); elapsed += 2;
        next.travelMinutes += path.minutes; next.coordinates.push(...path.coordinates.slice(1)); next.edgeIds.push(...path.edgeIds); at = request.nodeId!;
      }
      return next;
    }
    let best = route;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < best.stops.length - 1; i++) {
        const ids = best.stops.map(s => s.incidentId); [ids[i],ids[i+1]] = [ids[i+1],ids[i]];
        const candidate = rebuild(ids);
        if (candidate && cost(candidate) < cost(best) - 0.000001) { best = candidate; changed = true; }
      }
      if (!changed) break;
    }
    return best;
  });
  return { id: crypto.randomUUID(), revision: board.revision, status: 'proposed', routes: improved, unservedIds: [...remaining], weightedArrivalMinutes: improved.reduce((sum,r) => sum + cost(r),0), explanation: 'Urgency-first greedy assignment followed by three bounded adjacent-stop improvement passes. Capacity, capability and reachability checked. Heuristic, not guaranteed globally optimal. Two minutes per stop; no return trip.' };
}
