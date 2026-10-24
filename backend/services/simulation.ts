import type { Board, Incident, RoutePlan } from '../../shared/contracts';
import type { SimulationAnalysis, SimulationEvent, SimulationPlanResponse } from '../../shared/simulation';
import { katrinaEvents, katrinaTeams } from '../../shared/katrinaScenario';
import { askBedrock } from './bedrock';
import { InputError, object, text } from '../validation';
import { prepareRoadPlan, attachRoadGeometry } from './roads';
import type { VerifiedSimulationEvent } from '../../shared/simulation';
export function scenarioEvent(id: unknown): SimulationEvent {
  const event = katrinaEvents.find(e => e.id === id);
  if (!event) throw new InputError('Unknown training event.');
  return event;
}
export async function analyzeSimulation(id: unknown): Promise<SimulationAnalysis> {
  const event = scenarioEvent(id);
  const result = await askBedrock(`Analyze this explicitly fictional Hurricane Katrina-inspired training bulletin for human verification. Output {"kind":"other","summary":"factual summary","priority":null,"missingInfo":[]}.
kind must be road_blockage, fire, outage, supply or other. priority must be critical, high, normal or null when uncertain. missingInfo must list uncertain or absent facts. Use only the supplied bulletin, do not invent source confirmations, addresses, injuries, safe access or historical facts. A simulated coordinate is provided by the exercise, not inferred by you. This is not a live news feed or historical replay.`, event);
  const v = object(result.value);
  if (!['road_blockage','fire','outage','supply','other'].includes(v.kind as string) || (v.priority !== null && !['critical','high','normal'].includes(v.priority as string)) || !Array.isArray(v.missingInfo) || v.missingInfo.length > 12) throw new Error('Bedrock returned invalid training analysis.');
  return { kind: v.kind as SimulationAnalysis['kind'], priority: v.priority as SimulationAnalysis['priority'], summary: text(v.summary,'analysis summary',1600), missingInfo: v.missingInfo.map(n => text(n,'uncertainty',400)), ai: result.ai };
}
export async function planSimulation(value: unknown): Promise<SimulationPlanResponse> {
  if (!Array.isArray(value) || !value.length || value.length > katrinaEvents.length) throw new InputError('Select human-verified training events.');
  const confirmed: VerifiedSimulationEvent[] = value.map(entry => {
    const v=object(entry);const event=scenarioEvent(v.id);
    if(!['road_blockage','fire','outage','supply','other'].includes(v.kind as string)||!['critical','high','normal'].includes(v.priority as string))throw new InputError('Confirm an event type and urgency.');
    return {id:event.id,kind:v.kind as VerifiedSimulationEvent['kind'],priority:v.priority as VerifiedSimulationEvent['priority']};
  });
  if(new Set(confirmed.map(e=>e.id)).size!==confirmed.length)throw new InputError('Duplicate event IDs.');
  const avoidAreas = confirmed.filter(c=>['road_blockage','fire'].includes(c.kind)).map(c=>{
    const [lon,lat]=scenarioEvent(c.id).coordinates;
    return {id:c.id,bounds:[lon-.0012,lat-.001,lon+.0012,lat+.001] as [number,number,number,number]};
  });
  // Scheduling units below are artificial assessment slots, not victim or supply estimates.
  // They are never shown or sent to Bedrock as actual people, supplies, or incident facts.
  const incidents: Incident[] = confirmed.filter(c=>c.kind!=='road_blockage').map(c=>{
    const e=scenarioEvent(c.id);
    const staging: [number,number] = c.kind==='fire'?[e.coordinates[0],e.coordinates[1]+.0025]:e.coordinates;
    return {id:e.id,title:`Exercise assessment · ${e.label}`,category:'water',priority:c.priority,status:'verified',location:{label:`Provisional staging near ${e.label}`,coordinates:staging},people:1,quantity:1,unit:'assessment slot',source:'form',originalReport:e.text,summary:'Artificial assessment scheduling task. No inferred victims or supplies.',missingInfo:[],updatedAt:new Date().toISOString(),nodeId:e.id};
  });
  if(!incidents.length)throw new InputError('Road blockages constrain routing; verify a fire, outage or other assessment event to create a visit.');
  const board: Board = {incidents,teams:structuredClone(katrinaTeams),revision:confirmed.length,blockedEdgeIds:[],plan:null,alerts:[],activity:[],avoidAreas};
  const signal=AbortSignal.timeout(25000);
  const proposed=await prepareRoadPlan(board,signal);
  const [plan,commentary]=await Promise.all([
    attachRoadGeometry(board,proposed,signal),
    askBedrock(`Explain an explicitly fictional Katrina-inspired assessment plan. Output {"explanation":"brief factual explanation","reviewNotes":["uncertainty or tradeoff"]}. Use only computed assignments and supplied confirmed exercise events. The solver minimizes urgency-weighted arrivals after maximizing served urgency weight. Visits represent assessment scheduling tasks, NOT victims or supply deliveries. Road-blockage events are constraints, not destinations. Fire visits use provisional staging coordinates offset from the simulated hazard; these are NOT confirmed safe or accessible. Present-day Amazon Location driving routes are not historical 2005 conditions. No responder is actually dispatched. Identify unserved assessment IDs and require human review. Never invent road safety, injury counts, supplies, weather, or completed actions.`,{plan:proposed,events:confirmed.map(c=>({...c,source:scenarioEvent(c.id).text})),avoidAreas},signal),
  ]);
  const v=object(commentary.value);
  if(!Array.isArray(v.reviewNotes)||v.reviewNotes.length>10)throw new Error('Invalid Bedrock exercise commentary.');
  return {eventIds:confirmed.map(e=>e.id),plan:{...plan,
    explanation:'TRAINING ASSESSMENT ROUTES ONLY. Exact bounded solver maximizes served urgency weight, then minimizes weighted arrival time. Each task is one exercise assessment slot, not an invented person or tote count. Verified fire/blockage boxes are requested as avoid areas and returned geometry is checked against them; intersecting routes are rejected. Present-day roads, no live traffic. Staging points are provisional—not certified safe or accessible. No actual deployment.',
    ai:commentary.ai,aiExplanation:text(v.explanation,'exercise explanation',3000),reviewNotes:v.reviewNotes.map(n=>text(n,'review note',600)),
    routing:plan.routing?{...plan.routing,notices:['FICTIONAL TRAINING. No actual emergency services connected.','Hazard extents are artificial exercise boxes. Provisional staging requires human review.','Modern road data, not a reconstruction of Hurricane Katrina.']}:undefined,
  }};
}
