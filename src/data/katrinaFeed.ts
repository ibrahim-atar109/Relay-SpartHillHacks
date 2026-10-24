import type { Incident, ReportChannel } from '../../shared/contracts';
import { nodes } from './network';

/**
 * Simulated Hurricane Katrina scenario feed for St. Bernard Parish (Aug 29–30, 2005).
 * Modeled on publicly documented conditions: mandatory evacuation, landfall at dawn, storm surge
 * overtopping the MRGO/40 Arpent levees, Industrial Canal flooding into Arabi, parish-wide power loss,
 * and the Murphy Oil Meraux refinery spill. Messages are written for training; they are NOT archival
 * quotes and NOT live data.
 */
export type HazardKind = 'flood' | 'levee' | 'fire' | 'outage' | 'road' | 'spill';
export interface Hazard { id: string; kind: HazardKind; label: string; coordinates: [number, number]; at: string }
export interface FeedEvent {
  id: string;
  /** Scenario clock, local time (CDT). */
  time: string;
  channel: Exclude<ReportChannel, 'ai-call'>;
  headline: string;
  hazard?: Omit<Hazard, 'id' | 'at'>;
  /** Scenario network edge closed by this event (affects local route planning). */
  blocksEdgeId?: string;
  /** Request that enters the review queue; values are pre-filled sample data that a human must verify. */
  report?: { title: string; node: string; category: Incident['category']; priority: Incident['priority']; people: number; quantity: number; text: string };
}

export const feedEvents: FeedEvent[] = [
  { id: 'k01', time: 'Aug 29 · 05:10', channel: 'news', headline: 'NWS: Katrina’s eye approaching the Plaquemines/St. Bernard coast. Mandatory parish evacuation remains in effect; 15–20 ft surge forecast.' },
  { id: 'k02', time: 'Aug 29 · 06:10', channel: 'news', headline: 'Landfall near Buras as a strong Category 3. Hurricane-force winds now over St. Bernard Parish.' },
  { id: 'k03', time: 'Aug 29 · 06:35', channel: 'police', headline: 'Sheriff’s office: power out parish-wide. Substations in Chalmette and Meraux offline.', hazard: { kind: 'outage', label: 'Parish-wide power outage', coordinates: [-89.952, 29.947] } },
  { id: 'k04', time: 'Aug 29 · 07:05', channel: 'news', headline: 'Surge overtopping the MRGO and 40 Arpent levees; water entering Chalmette and Meraux from the north.', hazard: { kind: 'levee', label: '40 Arpent levee overtopping', coordinates: [-89.945, 29.962] } },
  { id: 'k05', time: 'Aug 29 · 07:40', channel: 'police', headline: 'Judge Perez Dr impassable between Paris Rd and Meraux — standing water above 4 ft.', blocksEdgeId: 'n-ne', hazard: { kind: 'road', label: 'Judge Perez Dr flooded', coordinates: [-89.941, 29.946] } },
  { id: 'k06', time: 'Aug 29 · 08:15', channel: 'news', headline: 'Industrial Canal floodwall failure reported; water moving from the Lower Ninth Ward into Arabi.', hazard: { kind: 'flood', label: 'Arabi flooding from Industrial Canal', coordinates: [-90.004, 29.955] } },
  { id: 'k07', time: 'Aug 29 · 08:50', channel: '911', headline: 'Caller in Arabi: family of five on the second floor, water still rising.', report: { title: 'Family of five trapped by rising water in Arabi', node: 'w', category: 'water', priority: 'critical', people: 5, quantity: 1, text: '911 transcript, Aug 29 2005 08:50: Five of us, two kids, on the second floor near St. Claude Ave in Arabi. Water is up the stairs and still rising. We have no drinking water left.' } },
  { id: 'k08', time: 'Aug 29 · 09:25', channel: 'police', headline: 'Fire reported at a ruptured gas line in Meraux; units cannot reach through floodwater.', hazard: { kind: 'fire', label: 'Gas-line fire, Meraux', coordinates: [-89.931, 29.941] } },
  { id: 'k09', time: 'Aug 29 · 10:10', channel: 'police', headline: 'St. Bernard Hwy blocked in Arabi by debris and downed power lines.', blocksEdgeId: 'w-sw', hazard: { kind: 'road', label: 'St. Bernard Hwy blocked (debris, lines)', coordinates: [-89.994, 29.948] } },
  { id: 'k10', time: 'Aug 29 · 11:30', channel: '911', headline: 'Shelter point on Paris Rd: dialysis patients need medication.', report: { title: 'Dialysis patients need medication at Paris Rd', node: 'n', category: 'medicine', priority: 'critical', people: 4, quantity: 1, text: '911 transcript, Aug 29 2005 11:30: I’m at the Paris Rd shelter point. Four people here are dialysis patients and missed treatment. They need their medication. One man is dizzy.' } },
  { id: 'k11', time: 'Aug 29 · 13:00', channel: 'news', headline: 'Reports of 10+ ft of water in parts of Chalmette; residents signaling from rooftops.', hazard: { kind: 'flood', label: 'Deep flooding, central Chalmette', coordinates: [-89.968, 29.948] } },
  { id: 'k12', time: 'Aug 30 · 07:15', channel: 'news', headline: 'Oil sheen reported in floodwater near the Murphy Oil Meraux refinery; residents told to avoid contact.', hazard: { kind: 'spill', label: 'Oil spill, Meraux refinery area', coordinates: [-89.935, 29.928] } },
  { id: 'k13', time: 'Aug 30 · 09:40', channel: 'police', headline: 'Deputies: residents gathering at the Meraux staging area need food.', report: { title: 'Food needed at Meraux staging area', node: 'e', category: 'food', priority: 'high', people: 22, quantity: 4, text: 'Sheriff’s radio log, Aug 30 2005 09:40: About 22 residents walked to the Meraux staging area on Judge Perez. No food since yesterday. Requesting 4 supply totes of food.' } },
];

export function feedIncident(event: FeedEvent): Incident {
  const r = event.report!;
  return {
    id: `FEED-${event.id.toUpperCase()}`, title: r.title, category: r.category, priority: r.priority, status: 'needs_review',
    people: r.people, quantity: r.quantity, unit: 'supply totes', source: event.channel === '911' ? 'voice' : 'text',
    channel: event.channel, origin: 'synthetic', nodeId: r.node, location: nodes[r.node], originalReport: r.text,
    summary: `${r.quantity} supply tote(s) of ${r.category} requested for ${r.people} people. Sample values: confirm against the source.`,
    missingInfo: [], updatedAt: new Date().toISOString(),
  };
}

export const channelLabels: Record<ReportChannel, string> = { news: 'News', '911': '911 call', police: 'Police', 'ai-call': 'AI call intake' };
