import type { Board, Incident, IncidentAction, Recommendation, Team } from '../../../shared/contracts';

export function eligibleTeams(incident: Incident, teams: Team[]) {
  return teams.filter(team => team.status === 'available' && team.capacity >= incident.quantity && team.capabilities.includes(incident.category));
}

export function recommend(incident: Incident, teams: Team[]): Recommendation | null {
  if (incident.status !== 'verified' || !incident.location.coordinates || incident.missingInfo.length) return null;
  const team = eligibleTeams(incident, teams)[0];
  return team ? { incidentId: incident.id, teamId: team.id, reason: `${team.name} is available, supports ${incident.category} deliveries, and has capacity for ${incident.quantity} ${incident.unit}. Demo rule-based match; travel time and stock are not yet checked.` } : null;
}

export function applyAction(board: Board, id: string, action: IncidentAction): Board {
  const incident = board.incidents.find(item => item.id === id);
  if (!incident) throw new Error('Request no longer exists. Refresh the board.');
  if (action.type === 'verify' && (incident.status !== 'needs_review' || !incident.location.coordinates || incident.missingInfo.length)) throw new Error('Confirm the location and missing details before verification.');
  if (action.type === 'assign' && (incident.status !== 'verified' || !incident.location.coordinates || incident.missingInfo.length || !eligibleTeams(incident, board.teams).some(team => team.id === action.teamId))) throw new Error('This assignment is no longer feasible. Refresh and review the team.');
  if (action.type === 'deliver' && incident.status !== 'assigned') throw new Error('Only assigned requests can be completed.');
  const updatedAt = new Date().toISOString();
  const status = action.type === 'verify' ? 'verified' : action.type === 'assign' ? 'assigned' : 'delivered';
  return {
    incidents: board.incidents.map(item => item.id === id ? { ...item, status, updatedAt, ...(action.type === 'assign' ? { teamId: action.teamId } : {}) } : item),
    teams: board.teams.map(team => action.type === 'assign' && team.id === action.teamId ? { ...team, status: 'assigned' } : action.type === 'deliver' && team.id === incident.teamId ? { ...team, status: 'available' } : team),
    activity: [{ id: crypto.randomUUID(), message: `${id} · ${status === 'assigned' ? 'Assignment approved' : status === 'delivered' ? 'Delivery confirmed' : 'Report verified'}`, at: updatedAt }, ...board.activity],
  };
}
