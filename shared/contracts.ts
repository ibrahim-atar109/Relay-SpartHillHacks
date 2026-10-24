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
  audioUrl?: string; // Session-only recording; excluded from backend requests.
  recordings?: { text: string; audioUrl: string }[];
  originalReport: string;
  summary: string;
  missingInfo: string[];
  teamId?: string;
  updatedAt: string;
  nodeId?: string;
  verifiedAt?: string;
  ai?: AiProvenance;
  clarificationQuestions?: string[];
  followUps?: string[];
  categoryNeedsReview?: boolean;
  duplicateOf?: string[];
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
  depotLabel?: string;
}
export interface Activity { id: string; message: string; at: string; actorId?: string }
export interface PlaceCandidate { label: string; coordinates: [number, number]; placeId: string }
export interface RouteStop { incidentId: string; arrivalMinutes: number }
export interface RoadLeg {
  incidentId: string;
  lines: [number, number][][];
  distanceMeters: number;
  durationMinutes: number;
  directions: { instruction: string; distanceMeters: number }[];
}
export interface TeamRoute {
  teamId: string;
  stops: RouteStop[];
  coordinates: [number, number][];
  edgeIds: string[];
  travelMinutes: number;
  load: number;
  roadLegs?: RoadLeg[];
  distanceMeters?: number;
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
  ai?: AiProvenance;
  aiExplanation?: string;
  reviewNotes?: string[];
  routing?: { provider: 'amazon-location'; travelMode: 'Car'; calculatedAt: string; traffic: 'disabled'; notices: string[] };
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
  version?: number; // Persistence version for optimistic concurrency, independent of routing revision.
  incidents: Incident[];
  teams: Team[];
  activity: Activity[];
  revision: number;
  blockedEdgeIds: string[];
  plan: RoutePlan | null;
  alerts: RescuerAlert[];
}
export type IncidentAction =
  | { type: 'verify'; corrections?: { nodeId: string; location?: Incident['location']; people: number; quantity: number; priority: Priority; category?: Incident['category'] } }
  | { type: 'deliver' };

export interface AiProvenance { provider: 'bedrock'; modelId: string; requestId: string; at: string }
export interface ReportExtraction {
  title: string;
  summary: string;
  category: Incident['category'] | null;
  priority: Priority | null;
  locationLabel: string | null;
  nodeId: string | null;
  people: number | null;
  quantity: number | null;
  missingInfo: string[];
  clarificationQuestions: string[];
}
export interface ExtractionResponse { extraction: ReportExtraction; ai: AiProvenance }
export interface PlanResponse { plan: RoutePlan }
