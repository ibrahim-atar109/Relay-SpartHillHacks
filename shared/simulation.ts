import type { AiProvenance, Priority, RoutePlan } from './contracts';
export interface SimulationEvent { id: string; source: 'news' | '911 bulletin' | 'police'; text: string; label: string; coordinates: [number,number]; atSeconds: number }
export interface SimulationAnalysis { kind: 'road_blockage' | 'fire' | 'outage' | 'supply' | 'other'; summary: string; priority: Priority | null; missingInfo: string[]; ai: AiProvenance }
export interface VerifiedSimulationEvent { id: string; kind: SimulationAnalysis['kind']; priority: Priority }
export interface SimulationItem { event: SimulationEvent; analysis?: SimulationAnalysis; status: 'analyzing' | 'needs_review' | 'verified' | 'rejected' | 'failed'; error?: string; confirmed?: VerifiedSimulationEvent }
export interface SimulationPlanResponse { plan: RoutePlan; eventIds: string[] }
