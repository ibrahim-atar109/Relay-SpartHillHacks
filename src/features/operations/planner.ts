import type { Board, Incident, RoutePlan, Team, TeamRoute } from '../../../shared/contracts';
import { shortestPath } from '../../data/network';

const weights = { critical: 8, high: 3, normal: 1 };
interface Option { mask: number; cost: number; route: TeamRoute }

/** Enumerate every feasible stop order. Small demo limit keeps exact search bounded. */
function optionsFor(team: Team, requests: Incident[], blocked: string[]): Option[] {
  const best = new Map<number, Option>();
  function visit(mask: number, at: string, load: number, elapsed: number, cost: number, route: TeamRoute) {
    const prior = best.get(mask);
    if (!prior || cost < prior.cost) best.set(mask, { mask, cost, route });
    requests.forEach((request, index) => {
      if ((mask & (1 << index)) || !request.nodeId || !team.capabilities.includes(request.category) || load + request.quantity > team.capacity) return;
      const path = shortestPath(at, request.nodeId, blocked);
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

export function generatePlan(board: Board): RoutePlan {
  const requests = board.incidents.filter(item => item.status === 'verified');
  if (!requests.length) throw new Error('Verify at least one report before generating routes.');
  if (requests.length > 8) throw new Error('The exact demo optimizer supports up to 8 verified requests at a time.');
  if (requests.some(item => !item.nodeId || !item.location.coordinates || item.missingInfo.length || item.quantity <= 0)) throw new Error('Verified requests contain incomplete routing data.');
  const teams = board.teams.filter(team => team.status === 'available');
  // Dynamic programming across teams finds the cheapest non-overlapping set of routes.
  let states = new Map<number, { cost: number; routes: TeamRoute[] }>([[0, { cost: 0, routes: [] }]]);
  for (const team of teams) {
    const options = optionsFor(team, requests, board.blockedEdgeIds);
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
