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
  originalReport: string;
  summary: string;
  missingInfo: string[];
  teamId?: string;
  updatedAt: string;
}
export interface Team {
  id: string;
  name: string;
  members: number;
  status: 'available' | 'assigned' | 'offline';
  capacity: number;
  capabilities: Incident['category'][];
  coordinates: [number, number];
}
export interface Activity { id: string; message: string; at: string }
export interface Board { incidents: Incident[]; teams: Team[]; activity: Activity[] }
export interface Recommendation { incidentId: string; teamId: string; reason: string }
export type IncidentAction =
  | { type: 'verify' }
  | { type: 'assign'; teamId: string }
  | { type: 'deliver' };
