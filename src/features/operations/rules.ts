import type { Board, IncidentAction, RoutePlan } from '../../../shared/contracts';
import { nodes } from '../../data/network';
import { generatePlan } from './planner';

function log(board: Board, message: string): Board {
  return { ...board, activity: [{ id: crypto.randomUUID(), message, at: new Date().toISOString() }, ...board.activity] };
}
export function applyAction(board: Board, id: string, action: IncidentAction): Board {
  const incident = board.incidents.find(item => item.id === id);
  if (!incident) throw new Error('Request no longer exists.');
  const at = new Date().toISOString();
  if (action.type === 'verify') {
    if (incident.status !== 'needs_review') throw new Error('Only unverified reports can be verified.');
    const fields = action.corrections ?? { nodeId: incident.nodeId || '', people: incident.people, quantity: incident.quantity, priority: incident.priority };
    if (!nodes[fields.nodeId] || !Number.isInteger(fields.people) || fields.people < 1 || !Number.isInteger(fields.quantity) || fields.quantity < 1 || !['critical', 'high', 'normal'].includes(fields.priority)) throw new Error('Confirm a location, priority, and positive whole-number people/tote counts.');
    if (!action.corrections && incident.missingInfo.length) throw new Error('Resolve missing information before verification.');
    const category = action.corrections?.category ?? incident.category;
    if (!['water', 'food', 'medicine'].includes(category) || (incident.categoryNeedsReview && !action.corrections?.category)) throw new Error('Confirm a supported supply category.');
    return log({
      ...board, revision: board.revision + 1, plan: board.plan?.status === 'alerted' ? board.plan : null,
      incidents: board.incidents.map(item => item.id === id ? {
        ...item, ...fields, category, categoryNeedsReview: false, location: nodes[fields.nodeId], status: 'verified', missingInfo: [],
        summary: `${fields.quantity} supply totes of ${category} for ${fields.people} people at ${nodes[fields.nodeId].label}. Fields reviewed by coordinator.`,
        updatedAt: at, verifiedAt: at,
      } : item),
    }, `${id} · Data verified and added to the map; any unsent plan must be regenerated`);
  }
  if (incident.status !== 'assigned') throw new Error('Only dispatched requests can be completed.');
  const otherAssigned = board.incidents.some(item => item.id !== id && item.teamId === incident.teamId && item.status === 'assigned');
  return log({
    ...board, revision: board.revision + 1, plan: board.plan?.status === 'alerted' ? board.plan : null,
    incidents: board.incidents.map(item => item.id === id ? { ...item, status: 'delivered', updatedAt: at } : item),
    teams: board.teams.map(team => team.id === incident.teamId && !otherAssigned ? { ...team, status: 'available' } : team),
  }, `${id} · Delivery confirmed`);
}

function requireCurrentPlan(board: Board, planId: string, expected: RoutePlan['status']) {
  const plan = board.plan;
  if (!plan || plan.id !== planId || plan.status !== expected || plan.revision !== board.revision) throw new Error('Plan is stale or not in the required approval state. Generate and review routes again.');
  for (const route of plan.routes) {
    const team = board.teams.find(item => item.id === route.teamId);
    if (!team || team.status !== 'available' || route.load > team.capacity || route.edgeIds.some(id => board.blockedEdgeIds.includes(id))) throw new Error('A team or route is no longer available. Regenerate the plan.');
    for (const stop of route.stops) {
      const incident = board.incidents.find(item => item.id === stop.incidentId);
      if (!incident || incident.status !== 'verified' || !team.capabilities.includes(incident.category)) throw new Error('A request changed. Regenerate the plan.');
    }
  }
  return plan;
}

export function planRoutes(board: Board): Board {
  return log({ ...board, plan: generatePlan(board) }, 'Routing agent · Proposed routes ready for human review');
}
export function approveRoutes(board: Board, planId: string): Board {
  const plan = requireCurrentPlan(board, planId, 'proposed');
  return log({ ...board, plan: { ...plan, status: 'approved', approvedAt: new Date().toISOString() } }, 'Coordinator verified routes · Ready to alert rescuers');
}
export function alertRescuers(board: Board, planId: string): Board {
  if (board.plan?.id === planId && board.plan.status === 'alerted') return board; // Idempotent retry.
  const plan = requireCurrentPlan(board, planId, 'approved');
  const at = new Date().toISOString();
  const assignments = new Map(plan.routes.flatMap(route => route.stops.map(stop => [stop.incidentId, route.teamId] as const)));
  return log({
    ...board, revision: board.revision + 1, plan: { ...plan, status: 'alerted' },
    teams: board.teams.map(team => plan.routes.some(route => route.teamId === team.id) ? { ...team, status: 'assigned' } : team),
    incidents: board.incidents.map(item => assignments.has(item.id) ? { ...item, status: 'assigned', teamId: assignments.get(item.id), updatedAt: at } : item),
    alerts: [...plan.routes.map(route => ({
      id: crypto.randomUUID(), planId, teamId: route.teamId, status: 'simulated' as const, at,
      message: `Approved plan: ${route.stops.map((stop, i) => {
        const request = board.incidents.find(item => item.id === stop.incidentId)!;
        return `${i + 1}. ${request.location.label}: ${request.quantity} totes of ${request.category}; arrival +${stop.arrivalMinutes} min`;
      }).join(' → ')}. Avoid blocked network link c-e. Acknowledge with the coordinator. DEMO ONLY — no external message sent.`,
    })), ...board.alerts],
  }, `Simulated alerts created for ${plan.routes.length} rescuer teams`);
}
