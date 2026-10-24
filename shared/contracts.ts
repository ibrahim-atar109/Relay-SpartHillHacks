/** Shared with AWS handlers. Changes require agreement between frontend and API owners. */
export type IncidentStatus = 'needs_review' | 'verified' | 'assigned' | 'delivered';
export type Priority = 'critical' | 'high' | 'normal';
export interface Incident {
  id: string;
  title: string;
  category: 'water' | 'food' | 'medicine';
  priority: Priority;
  status: IncidentStatus;
  location: { label: string; coordinates: [number, number] | null };
  people: number;
  quantity: number;
  unit: string;
  source: 'text' | 'voice' | 'form';
  origin?: 'synthetic' | 'participant';
  recordings?: { text: string; audioUrl: string }[];
  audioUrl?: string; // Session-only browser blob URL; never sent to the API.
  originalReport: string;
  summary: string;
  missingInfo: string[];
  teamId?: string;
  updatedAt: string;
  nodeId?: string;
  verifiedAt?: string;
}
export interface Team {
  id: string;
  name: string;
  members: number;
  status: 'available' | 'assigned' | 'offline';
  capacity: number;
  capabilities: Incident['category'][];
  coordinates: [number, number];
  nodeId: string;
}
export interface Activity { id: string; message: string; at: string }
export interface RouteStop { incidentId: string; arrivalMinutes: number }
export interface TeamRoute {
  teamId: string;
  stops: RouteStop[];
  coordinates: [number, number][];
  edgeIds: string[];
  travelMinutes: number;
  load: number;
}
export interface RoutePlan {
  id: string;
  revision: number;
  status: 'proposed' | 'approved' | 'alerted';
  routes: TeamRoute[];
  unservedIds: string[];
  weightedArrivalMinutes: number;
  explanation: string;
  approvedAt?: string;
}
export interface RescuerAlert {
  id: string;
  planId: string;
  teamId: string;
  message: string;
  status: 'simulated';
  at: string;
}
export interface Board {
  simulationMinute?: number;
  situationFeed?: { id: string; minute: number; text: string }[];
  incidents: Incident[];
  teams: Team[];
  activity: Activity[];
  revision: number;
  blockedEdgeIds: string[];
  plan: RoutePlan | null;
  alerts: RescuerAlert[];
}
export type IncidentAction =
  | { type: 'verify'; corrections?: { nodeId: string; people: number; quantity: number; priority: Priority; category?: Incident['category'] } }
  | { type: 'deliver' };
